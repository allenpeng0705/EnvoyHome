// Chat display smoke — user bubble must appear; reply or clear error must follow.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const uiDist = join(root, "ui-dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function startStatic() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = join(uiDist, rel.replace(/^\//, ""));
    if (!file.startsWith(uiDist)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("missing");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((r) => server.close(r)),
  };
}

async function startTestDaemon() {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-ux-chat-"));
  const daemonEntry = join(root, "../../packages/daemon/dist/index.js");
  const { startDaemon } = await import(pathToFileURL(daemonEntry).href);
  const daemon = await startDaemon({
    config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "ux-chat-test" },
    packageVersion: "0.0.0-ux-chat",
  });
  return {
    daemon,
    stateDir,
    wsUrl: `ws://127.0.0.1:${daemon.config.wsPort}/ws`,
  };
}

test("chat: user message paints immediately; turn ends with reply or visible error", async (t) => {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    t.skip("playwright not installed");
    return;
  }

  const staticSrv = await startStatic();
  const { daemon, stateDir, wsUrl } = await startTestDaemon();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    await daemon.stop();
    await staticSrv.close();
    await rm(stateDir, { recursive: true, force: true });
    t.skip(`chromium unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  try {
    const page = await browser.newPage();
    await page.addInitScript((url) => {
      localStorage.setItem("envoyhome.wsUrl", url);
    }, wsUrl);
    await page.goto(staticSrv.url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      const title = document.getElementById("conn-title")?.textContent || "";
      return title.includes("ready") || title.includes("Connected") || title.includes("EnvoyHome");
    }, undefined, { timeout: 15000 });

    await page.waitForSelector("#profile-gate:not([hidden])", { timeout: 15000 });
    await page.fill('#profile-gate-form input[name="displayName"]', "ChatAlice");
    await page.click('#profile-gate-form button[type="submit"]');
    await page.waitForSelector("#profile-gate[hidden]", { state: "attached", timeout: 10000 });

    await page.click('[data-view="chat"]');
    await page.waitForSelector("#chat-form", { timeout: 10000 });
    await page.waitForSelector("#chat-attach", { timeout: 5000 });
    assert.ok(await page.locator("#chat-file").count(), "hidden multi-file input for attach");
    // Mic is always present; without Web Speech it toasts OS dictation (e.g. Win+H).
    await page.waitForSelector("#chat-voice", { timeout: 5000 });
    assert.equal(await page.locator(".chat-attach-hint").count(), 0);
    await page.fill("#chat-input", "hello display test");
    await page.click("#chat-send");

    await page.waitForFunction(() => {
      const bubbles = [...document.querySelectorAll("#chat-log .bubble.user")];
      return bubbles.some((b) => (b.textContent || "").includes("hello display test"));
    }, undefined, { timeout: 10000 });

    // Without a cloud key the turn may error — either assistant or system must appear.
    await page.waitForFunction(() => {
      const log = document.getElementById("chat-log");
      if (!log) return false;
      const thinking = [...log.querySelectorAll(".bubble.system")].some((b) =>
        /Thinking|思考/.test(b.textContent || ""),
      );
      const assistant = log.querySelector(".bubble.assistant");
      const systemOther = [...log.querySelectorAll(".bubble.system")].some(
        (b) => !/Thinking|思考/.test(b.textContent || ""),
      );
      return Boolean(assistant) || (systemOther && !thinking);
    }, undefined, { timeout: 95000 });

    const html = await page.locator("#chat-log").innerText();
    assert.match(html, /hello display test/);
    assert.ok(
      /assistant|failed|error|No reply|尚未|失败|provider|model/i.test(html) ||
        (await page.locator("#chat-log .bubble.assistant").count()) > 0 ||
        (await page.locator("#chat-log .bubble.system").count()) > 0,
      `expected reply or error in chat log, got: ${html.slice(0, 400)}`,
    );
  } finally {
    await browser.close().catch(() => undefined);
    await daemon.stop().catch(() => undefined);
    await staticSrv.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});
