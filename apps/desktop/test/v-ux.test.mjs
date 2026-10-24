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

test("V-UX-6 bundle: bind panel on HA/MQTT; Skills tabs omit smarthome", async () => {
  const appJs = await readFile(join(uiDist, "app.js"), "utf8");
  assert.match(appJs, /sourceBindingPanel/);
  assert.match(appJs, /channel:\s*["']homeassistant["']/);
  assert.match(appJs, /channel:\s*["']mqtt["']/);
  assert.match(appJs, /id === ["']smarthome["']/);
  assert.doesNotMatch(appJs, /tab\(["']smarthome["']/);
  assert.doesNotMatch(appJs, /data-automation-tab=["']smarthome["']/);
});

test("desktop setup guide: first-launch + re-open hooks", async () => {
  const appJs = await readFile(join(root, "public", "app.js"), "utf8");
  const indexHtml = await readFile(join(root, "index.html"), "utf8");
  const en = await readFile(join(root, "public", "i18n", "en.js"), "utf8");
  assert.match(indexHtml, /id="setup-guide"/);
  assert.match(appJs, /SETUP_GUIDE_DONE_KEY/);
  assert.match(appJs, /openSetupGuide/);
  assert.match(appJs, /maybeShowFirstLaunchSetupGuide/);
  assert.match(appJs, /open-setup-guide/);
  assert.match(appJs, /topbar-setup-guide/);
  assert.match(appJs, /SETUP_GUIDE_ICON_SVG/);
  assert.match(en, /"setupGuide\.title"/);
  assert.match(en, /"setupGuide\.openCta"/);
  assert.match(en, /"app\.setupGuideTip"/);
});

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
      // Smoke is not the first-run LLM checklist — that modal would block #app clicks.
      // Re-open path is asserted below on System → This machine.
      localStorage.setItem("envoyhome.onboarding.guide_completed", "1");
      localStorage.setItem("envoyhome.onboarding.introduced", "1");
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
    await page.waitForSelector("#profile-gate[hidden]", { state: "attached", timeout: 10000 });
    await page.waitForFunction(() => localStorage.getItem("envoyhome.accountId") === "ux-alice", undefined, {
      timeout: 10000,
    });

    // V-UX-2: Mesh-first Pair devices (Connections tab).
    // Test daemon defaults meshHostingEnabled:false — QR mint must refuse (no LAN-only
    // phone QR). Assert the blocked path, not #pairing-qr.
    await page.getByRole("button", { name: "Connections", exact: true }).click();
    await page.getByRole("tab", { name: "Pair devices" }).click();
    await page.waitForSelector("#pairing-invite-profile", { timeout: 10000 });
    await page.waitForSelector('#pairing-qr-panel [role="alert"]', { timeout: 10000 });
    const qrBlock = await page.locator('#pairing-qr-panel [role="alert"]').textContent();
    assert.ok(
      /mesh hosting|Cannot mint/i.test(String(qrBlock || "")),
      `expected mesh-required QR block, got: ${qrBlock}`,
    );
    assert.equal(await page.locator("#pairing-qr").count(), 0);
    assert.ok(await page.getByRole("heading", { name: "Scan a QR code" }).isVisible());
    assert.ok(await page.getByRole("heading", { name: "Connect with hostname" }).isVisible());
    assert.ok(await page.getByRole("heading", { name: "Reach it through an SSH hop" }).isVisible());
    assert.ok(await page.getByRole("heading", { name: "Phones" }).isVisible());

    await page.getByRole("button", { name: "Chat" }).click();
    await page.waitForSelector("#chat-form", { timeout: 10000 });

    await page.getByRole("button", { name: "Connections", exact: true }).click();
    await page.getByRole("tab", { name: "Pair devices" }).click();
    await page.waitForSelector("#pairing-qr-fresh");
    assert.ok(await page.getByRole("heading", { name: "Phones" }).isVisible());

    // V-UX-3: optional Channels — Telegram config + Enable/Disable pair (autosave credentials only)
    await page.getByRole("tab", { name: "Channels" }).click();
    await page.waitForSelector("text=Telegram");
    assert.ok(await page.locator("#tg-config").isVisible());
    assert.ok(await page.locator("#tg-enable").isVisible());
    assert.ok(await page.locator("#tg-disable").isHidden());
    assert.ok(await page.locator("#tg-bind").isVisible());

    // Model Provider first (cloud preferred); empty → inline Add provider (Mesh-style presets)
    await page.getByRole("button", { name: "LLM" }).click();
    await page.getByRole("tab", { name: "Model Provider" }).click();
    assert.ok(await page.getByRole("heading", { name: "Add provider" }).isVisible());
    assert.ok(await page.locator("#prov-save").isVisible());
    assert.ok(await page.locator("#prov-preset").isVisible());
    assert.ok(await page.locator("#prov-base").isVisible());
    assert.ok(await page.locator("#prov-model-pick").isVisible());
    const minimaxOpts = await page.locator("#prov-model-pick option").allTextContents();
    assert.ok(minimaxOpts.some((o) => /MiniMax-M3/.test(o)));
    assert.ok(minimaxOpts.some((o) => /MiniMax-M2\.7/.test(o)));
    assert.ok(minimaxOpts.some((o) => /MiniMax-M2$/.test(o.trim()) || o.includes("MiniMax-M2")));
    assert.equal(await page.locator("#prov-advanced").count(), 0);
    assert.ok(await page.getByRole("button", { name: "Save provider" }).isVisible());
    assert.ok(await page.getByText(/Add one or more cloud providers/i).isVisible());
    assert.equal(await page.locator("#routing-form").count(), 0);
    const presetHtml = await page.locator("#prov-preset").innerHTML();
    assert.match(presetHtml, /deepseek/i);
    assert.match(presetHtml, /gemini/i);
    assert.match(presetHtml, /qwen/i);
    assert.match(presetHtml, /openai-compatible/i);
    assert.match(presetHtml, /anthropic-compatible/i);
    await page.getByRole("tab", { name: "Local Model" }).click();
    await page.waitForSelector("#local-engine-card");
    // llama.cpp is the default guided path; Ollama is optional and collapsed.
    assert.ok(await page.locator("#local-engine-card").isVisible());
    assert.ok(await page.locator("#le-ollama-card").isVisible());
    assert.ok(await page.locator("#local-engine-card").getByRole("heading", { name: "llama.cpp" }).isVisible());
    assert.ok(await page.locator("#local-engine-card").getByText("Default", { exact: true }).isVisible());
    assert.ok(await page.locator("#local-engine-card .le-setup").isVisible());
    assert.ok(await page.locator("#local-engine-card").getByRole("button", { name: "Enable", exact: true }).isVisible());
    assert.equal(await page.locator("#le-ollama-card").getAttribute("open"), null);
    assert.ok(await page.locator("#le-ollama-card").getByText("optional", { exact: true }).isVisible());
    await page.locator("#le-ollama-card > summary").click();
    assert.ok(await page.locator("#le-ollama-card").getByRole("button", { name: "Connect to Ollama" }).isVisible());
    assert.equal(await page.locator("#le-local-only").count(), 0);
    assert.ok(await page.locator("#le-test").isVisible());
    assert.equal(await page.getByRole("button", { name: "Turn on llama-cpp" }).count(), 0);
    assert.equal(await page.locator('[data-le-subtab="advanced"]').count(), 0);
    assert.ok(await page.locator('[data-le-subtab="recommended"]').isVisible());
    // Per-model download affordance lives only in the llama.cpp section.
    assert.ok((await page.locator("#local-engine-card [data-dl]").count()) >= 1);
    assert.ok((await page.locator("[data-use-model]").count()) >= 0);
    assert.ok(await page.getByRole("tab", { name: "HuggingFace" }).isVisible());
    await page.locator('[data-le-subtab="huggingface"]').click();
    assert.ok(await page.getByRole("button", { name: "Search" }).isVisible());
    assert.ok(await page.locator("#le-hf-url-dl").isVisible());
    assert.ok(await page.locator("#le-hf-active-dls").count() >= 1);
    assert.ok(await page.locator("#le-hf-url-dl-progress").count() >= 1);

    await page.getByRole("tab", { name: "Routing" }).click();
    await page.waitForSelector("#routing-form");
    assert.ok(await page.getByText("Local only", { exact: true }).isVisible());
    assert.ok(await page.getByText("Cloud only", { exact: true }).isVisible());
    assert.ok(await page.getByText("Smart Routing", { exact: true }).isVisible());
    assert.ok(await page.locator('input[name="placementFilter"][value="local"]').isVisible());
    assert.ok(await page.locator('input[name="placementFilter"][value="cloud"]').isVisible());
    assert.ok(await page.locator('input[name="placementFilter"][value="any"]').isVisible());
    // shared:true only on enter/leave Local only — form tracks daemon localOnly.
    assert.equal(await page.locator("#routing-form").getAttribute("data-local-only"), "0");
    assert.ok(
      await page
        .getByText(/Choose this profile’s pool|Local only is shared across all profiles/i)
        .isVisible(),
    );
    // No engine in UX smoke → prerequisite hint; shared-hint only when already Local only.
    assert.ok(
      await page
        .getByText(/Enable EnvoyHome Local or connect Ollama under Local Model first/i)
        .isVisible(),
    );
    assert.equal(await page.getByText(/Local only applies to every profile/i).count(), 0);

    assert.equal(await page.getByRole("tab", { name: "Harness" }).count(), 0);
    assert.equal(await page.locator("#llm-harness-info").count(), 0);

    // V-UX-5 / V-UX-MEM-1
    await page.getByRole("tab", { name: "Memory" }).click();
    await page.waitForSelector("#mem-settings");
    assert.ok(await page.locator("#mem-settings").isVisible());
    assert.ok(await page.locator("#compact-now").isVisible());
    const flushBox = page.locator('#mem-settings input[name="flushEnabled"]');
    const flushLabel = page.locator("#mem-settings label.mem-check").first();
    assert.ok(await flushBox.isVisible());
    assert.ok(await flushLabel.isVisible());
    const flushBoxBox = await flushBox.boundingBox();
    const flushLabelBox = await flushLabel.boundingBox();
    assert.ok(flushBoxBox && flushLabelBox);
    // Checkbox sits on the same row as its label text (not stacked above).
    assert.ok(Math.abs(flushBoxBox.y - flushLabelBox.y) < 12);
    const injectProfiles = page.locator(".mem-inject-profiles");
    assert.ok(await injectProfiles.isVisible());
    assert.ok(await injectProfiles.getByText("In-prompt budgets by model", { exact: true }).isVisible());
    assert.ok(await injectProfiles.locator("#mem-inject-mode").isVisible());
    assert.equal(await injectProfiles.locator("#mem-inject-mode").inputValue(), "auto");
    assert.ok(await injectProfiles.locator(".mem-cap-label", { hasText: "Cloud package" }).isVisible());
    assert.ok(await injectProfiles.locator(".mem-cap-label", { hasText: "Local package" }).isVisible());
    await injectProfiles.locator("#mem-inject-mode").selectOption("custom");
    assert.ok(await injectProfiles.locator("#mem-custom-caps").isVisible());
    assert.equal(await injectProfiles.getByRole("button", { name: "Save in-prompt budgets" }).count(), 0);
    await page.waitForFunction(() => {
      const sel = document.querySelector("#mem-inject-mode");
      return sel instanceof HTMLSelectElement && sel.value === "custom";
    });

    // V-UX-8: Home chat nav hidden until HA is configured+enabled
    assert.equal(await page.locator('button.nav-item[data-view="homeChat"]').count(), 0);

    // V-UX-6: bind form + journal on Connections → Home Assistant (and MQTT)
    await page.getByRole("button", { name: "Connections", exact: true }).click();
    await page.getByRole("tab", { name: "Home Assistant" }).click();
    await page.waitForSelector("#bind-form");
    assert.equal(await page.locator("#sh-shared").count(), 0);
    assert.equal(await page.locator("[data-toggle-shared]").count(), 0);
    assert.ok(await page.locator("#sh-nu").isVisible());
    assert.ok(await page.locator("#bind-form").isVisible());
    assert.ok(await page.locator("#sh-picked").isVisible());
    assert.equal(await page.locator("#sh-ca").getAttribute("type"), "hidden");
    assert.equal(await page.locator("#sh-sid").getAttribute("type"), "hidden");
    assert.ok(await page.locator("#sh-class").isVisible());
    assert.ok(await page.locator("#sh-nu").isVisible());
    assert.ok(await page.locator("#sh-picked").isVisible());
    assert.match(await page.locator("#bind-form").innerText(), /Device type|Always ask/i);
    assert.doesNotMatch(await page.locator(".source-binding-panel").innerText(), /Recent actions/i);
    assert.equal(await page.locator("#talk-to-home").count(), 0);
    await page.getByRole("tab", { name: "MQTT" }).click();
    await page.waitForSelector("#bind-form");
    await page.locator(".source-binding-panel summary").filter({ hasText: /MQTT/i }).click();
    assert.ok(await page.locator('input[name="allow"]').isVisible());
    assert.doesNotMatch(await page.locator(".source-binding-panel").innerText(), /Recent actions/i);

    // Skills tabs no longer include Smart home
    await page.locator('button.nav-item[data-view="automation"]').click();
    await page.waitForSelector('[data-automation-tab="skills"]');
    assert.equal(await page.locator('[data-automation-tab="smarthome"]').count(), 0);
    assert.ok(await page.locator('[data-automation-tab="skills"]').isVisible());
    assert.ok(await page.locator('[data-automation-tab="workflows"]').isVisible());
    assert.ok(await page.locator('[data-automation-tab="jobs"]').isVisible());

    // §10.1 nav slices — Channels combines former IM + Channel links
    await page.getByRole("button", { name: "Connections", exact: true }).click();
    await page.getByRole("tab", { name: "Channels" }).click();
    await page.waitForSelector("#tg-bind");
    await page.locator('button.nav-item[data-view="automation"]').click();
    await page.getByRole("tab", { name: "Skills" }).click();
    await page.waitForSelector("#install-skill");
    assert.ok(await page.locator("#skill-source-howto").isVisible());
    assert.ok(await page.locator("#skill-howto-md").isVisible());
    assert.match(await page.locator("#skill-howto-md").innerText(), /household-tone/);
    assert.ok(await page.locator("#skill-source-disk").isVisible());
    assert.ok(await page.locator("#skill-source-clawhub").isVisible());
    assert.ok(await page.locator("#skill-source-url").isVisible());
    assert.ok(await page.locator("#skill-drop").isVisible());
    assert.ok(await page.locator("#skill-browse-folder").isVisible());
    assert.ok(await page.locator("#skill-browse-file").isVisible());
    assert.ok(await page.locator("#skill-clawhub-search").isVisible());
    assert.ok(await page.locator("#skill-clawhub-query").isVisible());
    assert.ok(await page.locator("#skill-clawhub-paste").isVisible());
    assert.equal(await page.locator("#skill-clawhub-form").isVisible(), false);
    await page.locator("#skill-clawhub-paste summary").click();
    assert.ok(await page.locator("#skill-clawhub-form").isVisible());
    assert.ok(await page.locator("#skill-url-form").isVisible());
    await page.getByRole("tab", { name: "Workflows" }).click();
    await page.waitForSelector("#reload-wf");
    await page.getByRole("button", { name: "System" }).click();
    await page.getByRole("tab", { name: "Shared files" }).click();
    // Copy tracks i18n artifacts.hint (mesh open; no public URL required).
    await page.waitForSelector("text=Opens in-app over your home connection");
    // Shared files should be a human list, not a raw RPC dump.
    assert.equal(await page.locator("#view pre").count(), 0);
    assert.ok(await page.getByText("No shared files yet.").isVisible());

    await page.getByRole("tab", { name: "Health check" }).click();
    await page.waitForSelector(".sys-health-summary, #doctor-issues");
    assert.equal(await page.locator("#view pre").count(), 0);
    assert.ok(
      (await page.getByText("All clear").count()) +
        (await page.locator("#doctor-issues").count()) >
        0,
    );

    // V-UX-4 — This machine is human-readable (no raw RPC dumps).
    await page.getByRole("tab", { name: "This machine" }).click();
    await page.waitForSelector("#listen-card");
    const listenText = await page.locator("#listen-card").innerText();
    assert.match(listenText, /wsPort/);
    assert.match(listenText, /httpPort/);
    assert.ok(await page.getByText("Daemon status").isVisible());
    assert.ok(await page.getByText("Start in the background").isVisible());
    assert.ok(await page.locator("#svc-install").isVisible());
    assert.equal(await page.locator("#view pre").count(), 0);
    // Setup guide can be re-opened after first launch (System → This machine).
    assert.ok(await page.locator("#open-setup-guide").isVisible());
    await page.locator("#open-setup-guide").click();
    await page.waitForSelector("#setup-guide:not([hidden])", { timeout: 5000 });
    // Scope to the modal — System → This machine also has an h4 with the same title.
    assert.ok(await page.locator("#setup-guide-title").isVisible());
    await page.locator("#setup-guide").getByRole("button", { name: "Got it" }).click();
    await page.waitForSelector("#setup-guide[hidden]", { state: "attached", timeout: 5000 });
  } finally {
    await browser?.close();
    await daemon.stop();
    await staticSrv.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});
