// Playwright e2e: Design V-UX-8 / §5.7.8 Home chat (hidden until HA ready).

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
  const stateDir = await mkdtemp(join(tmpdir(), "eh-ux-home-"));
  const daemonEntry = join(root, "../../packages/daemon/dist/index.js");
  const { startDaemon } = await import(pathToFileURL(daemonEntry).href);
  const daemon = await startDaemon({
    config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "ux-home-test" },
    packageVersion: "0.0.0-ux-home",
  });
  return {
    daemon,
    stateDir,
    wsUrl: `ws://127.0.0.1:${daemon.config.wsPort}/ws`,
  };
}

async function waitConnected(page) {
  await page.waitForFunction(() => {
    const title = document.getElementById("conn-title")?.textContent || "";
    const detail = document.getElementById("status-out")?.textContent || "";
    return (
      title.includes("ready") ||
      title.includes("Connected") ||
      detail.includes("Connected") ||
      detail.includes("hello")
    );
  }, undefined, { timeout: 15000 });
}

async function completeProfileGate(page) {
  await page.waitForSelector("#profile-gate:not([hidden])", { timeout: 15000 });
  await page.fill('#profile-gate-form input[name="displayName"]', "HomeAlice");
  await page.click('#profile-gate-form button[type="submit"]');
  await page.waitForSelector("#profile-gate[hidden]", { state: "attached", timeout: 10000 });
  await page.waitForFunction(
    () => {
      const id = localStorage.getItem("envoyhome.accountId") || "";
      return id === "homealice" || id.startsWith("homealice-");
    },
    undefined,
    { timeout: 10000 },
  );
}

test("V-UX-8 e2e: Home chat hidden until HA ready; then opens purpose=home session", async (t) => {
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
    await waitConnected(page);
    await completeProfileGate(page);

    // Before HA: Home chat nav is hidden; HA Devices panel has no Talk-to-home shortcut.
    assert.equal(await page.locator('button.nav-item[data-view="homeChat"]').count(), 0);
    await page.getByRole("button", { name: "Connections" }).click();
    await page.getByRole("tab", { name: "Home Assistant" }).click();
    await page.waitForSelector("#bind-form");
    assert.equal(await page.locator("#talk-to-home").count(), 0);

    // Configure + enable HA on the daemon (same gate as Connections → Home Assistant).
    await daemon.channels.setChannelConfig(
      "homeassistant",
      { baseUrl: "http://127.0.0.1:8123" },
      { accessToken: "ux-e2e-token" },
    );
    await daemon.channels.enableChannel("homeassistant");

    // Re-enter Chat so refreshHaHomeChatReady runs and nav re-renders.
    await page.locator('button.nav-item[data-view="chat"]').click();
    await page.waitForSelector("#chat-form", { timeout: 10000 });
    await page.waitForSelector('button.nav-item[data-view="homeChat"]', { timeout: 10000 });

    await page.locator('button.nav-item[data-view="homeChat"]').click();
    await page.waitForSelector(".chat-home-banner", { timeout: 10000 });
    assert.match(await page.locator(".chat-home-banner").innerText(), /Home chat|smart-home/i);
    assert.equal(await page.locator('button.nav-item[data-view="homeChat"].active').count(), 1);

    // Daemon accepts purpose=home once HA is ready (same gate the UI openSession uses).
    const accountId = await page.evaluate(() => localStorage.getItem("envoyhome.accountId"));
    assert.ok(accountId);
    const opened = await daemon.turns.openSession({
      accountId,
      purpose: "home",
      title: "e2e-home",
    });
    assert.equal(opened.purpose, "home");
    assert.ok(opened.sessionId);

    // Devices panel still has no Talk-to-home; Home chat stays in the sidebar.
    await page.getByRole("button", { name: "Connections" }).click();
    await page.getByRole("tab", { name: "Home Assistant" }).click();
    await page.waitForSelector("#bind-form", { timeout: 10000 });
    assert.equal(await page.locator("#talk-to-home").count(), 0);
  } finally {
    await browser?.close();
    await daemon.stop();
    await staticSrv.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});
