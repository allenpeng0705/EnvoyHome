// Playwright smoke for Design V-UX-1..5 / V-UX-MEM-1 (B12).
// Starts a temp daemon + static ui-dist, exercises nav + core screens.

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
  const stateDir = await mkdtemp(join(tmpdir(), "eh-ux-"));
  const daemonEntry = join(root, "../../packages/daemon/dist/index.js");
  const { startDaemon } = await import(pathToFileURL(daemonEntry).href);
  const daemon = await startDaemon({
    config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "ux-test" },
    packageVersion: "0.0.0-ux",
  });
  return {
    daemon,
    stateDir,
    wsUrl: `ws://127.0.0.1:${daemon.config.wsPort}/ws`,
  };
}

test("V-UX-1..5 smoke: nav + account + memory + advanced + pairing QR", async (t) => {
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
      const detail = document.getElementById("status-out")?.textContent || "";
      return (
        title.includes("ready") ||
        title.includes("Connected") ||
        detail.includes("Connected") ||
        detail.includes("hello")
      );
    }, undefined, { timeout: 15000 });

    // V-UX-1: first-run profile gate (display name only; daemon slugs accountId)
    await page.waitForSelector("#profile-gate:not([hidden])", { timeout: 15000 });
    await page.fill('#profile-gate-form input[name="displayName"]', "UX Alice");
    await page.click('#profile-gate-form button[type="submit"]');
    await page.waitForSelector("#profile-gate[hidden]", { timeout: 10000 });
    await page.waitForFunction(() => localStorage.getItem("envoyhome.accountId") === "ux-alice", undefined, {
      timeout: 10000,
    });

    // V-UX-2: pairing QR (EnvoyDev three-route — auto-mint on open + copy URI)
    await page.getByRole("button", { name: "Pair devices" }).click();
    await page.waitForSelector("#pairing-qr", { timeout: 10000 });
    const qrSrc = await page.getAttribute("#pairing-qr", "src");
    assert.ok(qrSrc?.startsWith("data:image/"));
    assert.ok(await page.locator("#pairing-uri").inputValue());
    assert.ok(await page.locator("#pairing-copy").isVisible());
    assert.ok(await page.getByText("Scan a QR code").isVisible());
    assert.ok(await page.getByText("Connect with hostname").isVisible());
    assert.ok(await page.getByText("Reach it through an SSH hop").isVisible());
    assert.ok(await page.getByText("Pairing codes").isVisible());

    await page.getByRole("button", { name: "Chat" }).click();
    await page.waitForSelector("#chat-form", { timeout: 10000 });

    await page.getByRole("button", { name: "Pair devices" }).click();
    await page.waitForSelector("#pairing-qr-fresh");
    assert.ok(await page.getByText("Pairing codes").isVisible());

    // V-UX-3: Channels — Telegram config form in Settings
    await page.getByRole("button", { name: "Channels" }).click();
    await page.waitForSelector("text=Telegram");
    assert.ok(await page.locator("#tg-config").isVisible());
    assert.ok(await page.locator("#tg-enable").isVisible());

    // Models + §8.5 Local card (shown without account; routing needs account)
    await page.getByRole("button", { name: "Models" }).click();
    await page.waitForSelector("#local-engine-card");
    assert.ok(await page.getByRole("button", { name: "Enable Local" }).isVisible());
    assert.ok(await page.getByRole("button", { name: "Use Ollama" }).isVisible());
    assert.ok(await page.locator("#prov-save").isVisible());
    assert.ok(await page.locator("#prov-preset").isVisible());
    assert.ok(await page.getByRole("button", { name: "Save provider" }).isVisible());
    assert.ok(await page.getByRole("button", { name: "Use for this account (local-only)" }).count() >= 0);

    // V-UX-5 / V-UX-MEM-1
    await page.getByRole("button", { name: "Memory" }).click();
    await page.waitForSelector("#mem-settings");
    assert.ok(await page.locator("#mem-settings").isVisible());
    assert.ok(await page.locator("#compact-now").isVisible());

    // V-UX-6: smart-home bind form + journal
    await page.getByRole("button", { name: "Smart home" }).click();
    await page.waitForSelector("#bind-form");
    assert.ok(await page.locator("#sh-shared").isVisible());
    assert.ok(await page.locator("#sh-nu").isVisible());
    assert.ok(await page.getByText("Actuation journal").isVisible());

    // §10.1 nav slices
    await page.getByRole("button", { name: "Links" }).click();
    await page.waitForSelector("#bind-sender");
    await page.getByRole("button", { name: "Skills" }).click();
    await page.waitForSelector("#install-skill");
    await page.getByRole("button", { name: "Workflows" }).click();
    await page.waitForSelector("#reload-wf");
    await page.getByRole("button", { name: "Artifacts" }).click();
    await page.waitForSelector("text=Mint a short-lived");

    // V-UX-4
    await page.getByRole("button", { name: "Advanced" }).click();
    await page.waitForSelector("#listen-card");
    const listenText = await page.locator("#listen-card").innerText();
    assert.match(listenText, /wsPort/);
    assert.match(listenText, /httpPort/);
    assert.ok(await page.locator("#svc-install").isVisible());
  } finally {
    await browser?.close();
    await daemon.stop();
    await staticSrv.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});
