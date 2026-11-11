// V-OUT-34 — Stage E Obscura-first auto engine select.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveExtractBackend,
  resolveSerpBrowserEngine,
  resolveManagedEngine,
  isExtractBackendReady,
  isHeadlessEngineReady,
  needsChromiumInstallHint,
  needsObscuraInstallHint,
  __setEngineReadinessForTests,
  __resetEngineReadinessForTests,
} from "../dist/engine-auto.js";
import { homePaths } from "../dist/home-paths.js";
import { WebSearchService } from "../dist/web-search.js";
import { BrowserControlService } from "../dist/browser-control.js";
import {
  runBrowserSerpFallback,
  __resetBrowserSerpGatesForTests,
} from "../dist/web-search-browser.js";
import { collectDoctorIssues } from "../dist/doctor/index.js";
import { defaultConfig } from "../dist/config.js";
import { AccountStore } from "../dist/accounts.js";
import { BindingStore } from "../dist/bindings.js";
import { ChannelService } from "../dist/channels/service.js";
import { DeviceCredentialStore } from "../dist/auth.js";
import { DaemonLogger } from "../dist/logger.js";
import { OBSCURA_PARITY_GATE } from "./obscura-parity-gate.ts";

afterEach(() => {
  __resetEngineReadinessForTests();
  __resetBrowserSerpGatesForTests();
});

test("V-OUT-34: resolve prefer Obscura then fetch/Chromium", () => {
  assert.equal(
    resolveExtractBackend("auto", { obscuraReady: true, chromiumReady: true }),
    "obscura",
  );
  assert.equal(
    resolveExtractBackend("auto", { obscuraReady: false, chromiumReady: true }),
    "fetch",
  );
  assert.equal(
    resolveExtractBackend("auto", { obscuraReady: false, chromiumReady: false }),
    "fetch",
  );
  assert.equal(
    resolveExtractBackend("fetch", { obscuraReady: true, chromiumReady: false }),
    "fetch",
  );
  assert.equal(
    resolveExtractBackend("obscura", { obscuraReady: false, chromiumReady: true }),
    "obscura",
  );

  assert.equal(
    resolveSerpBrowserEngine("auto", { obscuraReady: true, chromiumReady: true }),
    "obscura",
  );
  assert.equal(
    resolveSerpBrowserEngine("auto", { obscuraReady: false, chromiumReady: true }),
    "chromium",
  );
  assert.equal(
    resolveSerpBrowserEngine("auto", { obscuraReady: false, chromiumReady: false }),
    null,
  );
  assert.equal(
    resolveSerpBrowserEngine("chromium", { obscuraReady: true, chromiumReady: false }),
    "chromium",
  );
  assert.equal(
    resolveSerpBrowserEngine("obscura", { obscuraReady: false, chromiumReady: true }),
    "obscura",
  );

  assert.equal(
    resolveManagedEngine("auto", { obscuraReady: true, chromiumReady: false }),
    "obscura",
  );
  assert.equal(
    resolveManagedEngine("auto", { obscuraReady: false, chromiumReady: true }),
    "chromium",
  );
  assert.equal(
    resolveManagedEngine("auto", { obscuraReady: false, chromiumReady: false }),
    null,
  );
});

test("V-OUT-34: isHeadlessEngineReady rejects forced missing binaries", () => {
  const none = { obscuraReady: false, chromiumReady: false };
  const onlyChrome = { obscuraReady: false, chromiumReady: true };
  const onlyObscura = { obscuraReady: true, chromiumReady: false };

  assert.equal(isHeadlessEngineReady(null, onlyChrome), false);
  assert.equal(isHeadlessEngineReady("obscura", none), false);
  assert.equal(isHeadlessEngineReady("obscura", onlyObscura), true);
  assert.equal(isHeadlessEngineReady("chromium", none), false);
  assert.equal(isHeadlessEngineReady("chromium", onlyChrome), true);
  assert.equal(isHeadlessEngineReady("chromium", onlyObscura), false);

  assert.equal(isExtractBackendReady("fetch", none), true);
  assert.equal(isExtractBackendReady("obscura", none), false);
  assert.equal(isExtractBackendReady("obscura", onlyObscura), true);
});

test("V-OUT-34: install hints — auto + Obscura ready skips Chromium nudge", () => {
  const onlyObscura = { obscuraReady: true, chromiumReady: false };
  const none = { obscuraReady: false, chromiumReady: false };
  const onlyChrome = { obscuraReady: false, chromiumReady: true };

  assert.equal(needsChromiumInstallHint("auto", onlyObscura), false);
  assert.equal(needsChromiumInstallHint("auto", none), true);
  assert.equal(needsChromiumInstallHint("auto", onlyChrome), false);
  assert.equal(needsChromiumInstallHint("chromium", onlyObscura), true);
  assert.equal(needsChromiumInstallHint("obscura", none), false);

  assert.equal(needsObscuraInstallHint("auto", onlyObscura), false);
  assert.equal(needsObscuraInstallHint("auto", onlyChrome), true);
  assert.equal(needsObscuraInstallHint("fetch", none), false);
  assert.equal(needsObscuraInstallHint("obscura", none), true);
});

test("V-OUT-34: getPublicConfig omits effectiveSerp when auto unresolved", async () => {
  __setEngineReadinessForTests({ obscuraReady: false, chromiumReady: false });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-eff-omit-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    const pub = await web.getPublicConfig();
    assert.equal(pub.serpBrowserEngine, "auto");
    assert.equal(pub.effectiveExtractBackend, "fetch");
    assert.equal(
      Object.prototype.hasOwnProperty.call(pub, "effectiveSerpBrowserEngine"),
      false,
    );

    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({ enabled: true, managedEngine: "auto" });
    const bpub = await browser.getPublicConfig();
    assert.equal(
      Object.prototype.hasOwnProperty.call(bpub, "effectiveManagedEngine"),
      false,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: household defaults are auto", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-auto-def-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    const pub = await web.getPublicConfig();
    assert.equal(pub.extractBackend, "auto");
    assert.equal(pub.serpBrowserEngine, "auto");
    assert.ok(pub.effectiveExtractBackend === "fetch" || pub.effectiveExtractBackend === "obscura");

    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    const bpub = await browser.getPublicConfig();
    assert.equal(bpub.managedEngine, "auto");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: only Obscura ready → dig/SERP/managed resolve obscura", async () => {
  __setEngineReadinessForTests({ obscuraReady: true, chromiumReady: false });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-auto-ob-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({
      provider: "browser",
      extractBackend: "auto",
      serpBrowserEngine: "auto",
    });
    const pub = await web.getPublicConfig();
    assert.equal(pub.effectiveExtractBackend, "obscura");
    assert.equal(pub.effectiveSerpBrowserEngine, "obscura");
    assert.equal(pub.ready, true);
    assert.equal(pub.obscuraRuntime, "ready");
    assert.equal(pub.browserRuntime, "missing");

    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({ enabled: true, managedEngine: "auto" });
    const bpub = await browser.getPublicConfig();
    assert.equal(bpub.effectiveManagedEngine, "obscura");
    assert.equal(bpub.ready, true);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: only Chromium ready → dig fetch; SERP/managed chromium", async () => {
  __setEngineReadinessForTests({ obscuraReady: false, chromiumReady: true });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-auto-ch-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({
      provider: "browser",
      extractBackend: "auto",
      serpBrowserEngine: "auto",
    });
    const pub = await web.getPublicConfig();
    assert.equal(pub.effectiveExtractBackend, "fetch");
    assert.equal(pub.effectiveSerpBrowserEngine, "chromium");
    assert.equal(pub.ready, true);

    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({ enabled: true, managedEngine: "auto" });
    const bpub = await browser.getPublicConfig();
    assert.equal(bpub.effectiveManagedEngine, "chromium");
    assert.equal(bpub.ready, true);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: both ready → Obscura preferred for all three planes", async () => {
  __setEngineReadinessForTests({ obscuraReady: true, chromiumReady: true });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-auto-both-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    const pub = await web.getPublicConfig();
    assert.equal(pub.effectiveExtractBackend, "obscura");
    assert.equal(pub.effectiveSerpBrowserEngine, "obscura");

    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({ enabled: true });
    const bpub = await browser.getPublicConfig();
    assert.equal(bpub.effectiveManagedEngine, "obscura");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: neither ready → SERP/managed not ready; dig falls to fetch", async () => {
  __setEngineReadinessForTests({ obscuraReady: false, chromiumReady: false });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-auto-none-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({ provider: "browser", serpBrowserEngine: "auto" });
    const pub = await web.getPublicConfig();
    assert.equal(pub.effectiveExtractBackend, "fetch");
    assert.equal(pub.effectiveSerpBrowserEngine, undefined);
    assert.equal(pub.ready, false);
    assert.match(pub.unavailableReason ?? "", /Obscura|Chromium/i);

    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({ enabled: true, managedEngine: "auto" });
    const bpub = await browser.getPublicConfig();
    assert.equal(bpub.effectiveManagedEngine, undefined);
    assert.equal(bpub.ready, false);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: forced obscura missing is not ready (no silent Chromium)", async () => {
  __setEngineReadinessForTests({ obscuraReady: false, chromiumReady: true });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-force-ob-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({
      provider: "browser",
      serpBrowserEngine: "obscura",
      extractBackend: "obscura",
    });
    const pub = await web.getPublicConfig();
    assert.equal(pub.serpBrowserEngine, "obscura");
    assert.equal(pub.effectiveSerpBrowserEngine, "obscura");
    assert.equal(pub.effectiveExtractBackend, "obscura");
    assert.equal(pub.ready, false, "forced missing Obscura must not report ready");
    assert.match(pub.unavailableReason ?? "", /Obscura/i);
    assert.doesNotMatch(pub.unavailableReason ?? "", /Chromium: npx/i);

    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({ enabled: true, managedEngine: "obscura" });
    const bpub = await browser.getPublicConfig();
    assert.equal(bpub.managedEngine, "obscura");
    assert.equal(bpub.effectiveManagedEngine, "obscura");
    assert.equal(bpub.ready, false);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: forced chromium missing is not ready (no silent Obscura)", async () => {
  __setEngineReadinessForTests({ obscuraReady: true, chromiumReady: false });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-force-ch-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({ provider: "browser", serpBrowserEngine: "chromium" });
    const pub = await web.getPublicConfig();
    assert.equal(pub.effectiveSerpBrowserEngine, "chromium");
    assert.equal(pub.ready, false);
    assert.match(pub.unavailableReason ?? "", /Chromium/i);

    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({ enabled: true, managedEngine: "chromium" });
    const bpub = await browser.getPublicConfig();
    assert.equal(bpub.effectiveManagedEngine, "chromium");
    assert.equal(bpub.ready, false);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: Owner force persists; invalid rejected", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-auto-force-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({ extractBackend: "fetch", serpBrowserEngine: "chromium" });
    const pub = await web.getPublicConfig();
    assert.equal(pub.extractBackend, "fetch");
    assert.equal(pub.serpBrowserEngine, "chromium");
    assert.equal(pub.effectiveExtractBackend, "fetch");
    assert.equal(pub.effectiveSerpBrowserEngine, "chromium");

    await assert.rejects(
      () => web.setConfig({ extractBackend: "webkit" }),
      /bad_params|unknown extractBackend/i,
    );

    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({ managedEngine: "obscura" });
    assert.equal((await browser.getPublicConfig()).managedEngine, "obscura");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: dig auto uses fetch when Obscura missing (Chromium not used for dig)", async () => {
  __setEngineReadinessForTests({ obscuraReady: false, chromiumReady: true });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-dig-fetch-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({ extractBackend: "auto" });
    const pub = await web.getPublicConfig();
    assert.equal(pub.extractBackend, "auto");
    assert.equal(pub.effectiveExtractBackend, "fetch");
    assert.equal(await web.resolveExtractBackendEffective(), "fetch");

    // Chromium ready must not flip dig to a browser engine — dig is obscura|fetch only.
    assert.notEqual(pub.effectiveExtractBackend, "chromium" as never);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: dig auto uses Obscura when ready even if Chromium ready", async () => {
  __setEngineReadinessForTests({ obscuraReady: true, chromiumReady: true });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-dig-ob-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({ extractBackend: "auto" });
    assert.equal(await web.resolveExtractBackendEffective(), "obscura");
    assert.equal((await web.getPublicConfig()).effectiveExtractBackend, "obscura");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: SERP soft-fails when auto and neither engine ready", async () => {
  __setEngineReadinessForTests({ obscuraReady: false, chromiumReady: false });
  __resetBrowserSerpGatesForTests();
  const stateDir = await mkdtemp(join(tmpdir(), "eh-serp-none-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({
      provider: "duckduckgo",
      fallback: "browser",
      serpBrowserEngine: "auto",
    });
    web.fetchImpl = (async () =>
      new Response("<html></html>", { status: 200 })) as typeof fetch;
    const out = JSON.parse(
      await web.runSearch(
        { query: "q" },
        {
          origin: "attended",
          authorizeBrowserFallback: async () => true,
        },
      ),
    ) as { results: unknown[]; error?: string; fallback?: string };
    assert.equal(out.results.length, 0);
    assert.equal(out.fallback, "browser");
    assert.match(out.error ?? "", /runtime_missing|Obscura|Chromium/i);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: SERP uses Obscura path when auto + obscura ready (inject)", async () => {
  __setEngineReadinessForTests({ obscuraReady: true, chromiumReady: true });
  __resetBrowserSerpGatesForTests();
  const stateDir = await mkdtemp(join(tmpdir(), "eh-serp-ob-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({
      provider: "browser",
      serpBrowserEngine: "auto",
    });
    const pub = await web.getPublicConfig();
    assert.equal(pub.effectiveSerpBrowserEngine, "obscura");

    // Prefer Obscura even when Chromium is also ready.
    const eng = resolveSerpBrowserEngine("auto", {
      obscuraReady: true,
      chromiumReady: true,
    });
    assert.equal(eng, "obscura");

    const fixture = `<html><body>
      <li class="b_algo">
        <h2><a href="https://example.com/ob">Ob Hit</a></h2>
        <div class="b_caption"><p>via obscura</p></div>
      </li>
    </body></html>`;
    let used = 0;
    const serp = await runBrowserSerpFallback({
      query: "q",
      count: 3,
      engines: ["bing"],
      serpBrowserEngine: eng!,
      fetchHtml: async () => {
        used++;
        return fixture;
      },
    });
    assert.equal(used, 1);
    assert.ok(serp.results.length >= 1);
    assert.match(serp.results[0]!.url, /example\.com\/ob/);

    // Household primary browser path uses the same resolved engine + inject.
    __resetBrowserSerpGatesForTests();
    const out = JSON.parse(
      await web.runSearch(
        { query: "q" },
        {
          origin: "attended",
          authorizeBrowserFallback: async () => true,
          browserFetchHtml: async () => fixture,
        },
      ),
    ) as { results: Array<{ url: string }> };
    assert.ok(out.results.some((r) => /example\.com\/ob/.test(r.url)));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: managed tool soft-fails when forced obscura missing", async () => {
  __setEngineReadinessForTests({ obscuraReady: false, chromiumReady: true });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-mng-miss-"));
  try {
    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({ enabled: true, managedEngine: "obscura" });
    const out = JSON.parse(
      await browser.runTool(
        { action: "doctor" },
        { accountId: "acct-a", origin: "attended", ownerAccountId: "acct-a" },
      ),
    ) as { ready?: boolean; managedEngine?: string };
    // doctor returns config; ready must be false for forced missing.
    assert.equal(out.managedEngine, "obscura");
    assert.equal(out.ready, false);

    const open = JSON.parse(
      await browser.runTool(
        { action: "open", url: "https://example.com/" },
        { accountId: "acct-a", origin: "attended", ownerAccountId: "acct-a" },
      ),
    ) as { error?: string };
    assert.equal(open.error, "runtime_missing");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: Doctor does not warn when auto + only Obscura ready", async () => {
  __setEngineReadinessForTests({ obscuraReady: true, chromiumReady: false });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-doc-ob-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({ fallback: "browser", serpBrowserEngine: "auto" });
    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({ enabled: true, managedEngine: "auto" });

    const devices = new DeviceCredentialStore();
    const bindings = new BindingStore(stateDir, devices);
    const channels = new ChannelService({
      stateDir,
      bindings,
      logger: new DaemonLogger(),
    });
    const accounts = new AccountStore(stateDir);
    const issues = await collectDoctorIssues({
      config: defaultConfig({ stateDir }),
      accounts,
      bindings,
      channels,
      webSearch: web,
      browserControl: browser,
    });
    assert.ok(!issues.some((i) => i.id === "websearch.browser_runtime_missing"));
    assert.ok(!issues.some((i) => i.id === "browser.runtime_missing"));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34: Doctor warns when auto + neither engine ready", async () => {
  __setEngineReadinessForTests({ obscuraReady: false, chromiumReady: false });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-doc-none-"));
  try {
    const web = new WebSearchService(homePaths(stateDir));
    await web.load();
    await web.setConfig({ fallback: "browser", serpBrowserEngine: "auto" });
    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({ enabled: true, managedEngine: "auto" });

    const devices = new DeviceCredentialStore();
    const bindings = new BindingStore(stateDir, devices);
    const channels = new ChannelService({
      stateDir,
      bindings,
      logger: new DaemonLogger(),
    });
    const accounts = new AccountStore(stateDir);
    const issues = await collectDoctorIssues({
      config: defaultConfig({ stateDir }),
      accounts,
      bindings,
      channels,
      webSearch: web,
      browserControl: browser,
    });
    assert.ok(issues.some((i) => i.id === "websearch.browser_runtime_missing"));
    assert.ok(issues.some((i) => i.id === "browser.runtime_missing"));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-34 / Appendix C.5: Stage E auto default recorded", () => {
  assert.equal(OBSCURA_PARITY_GATE.extractStageA.defaultBackend, "auto");
  assert.equal(OBSCURA_PARITY_GATE.serpStageB.defaultEngine, "auto");
  assert.equal(OBSCURA_PARITY_GATE.managedStageC.defaultEngine, "auto");
  assert.equal(OBSCURA_PARITY_GATE.autoStageE?.shipped, true);
});

test("V-OUT-34: personal/remote never map to Obscura (managedEngine ignored)", async () => {
  __setEngineReadinessForTests({ obscuraReady: true, chromiumReady: false });
  const stateDir = await mkdtemp(join(tmpdir(), "eh-auto-elev-"));
  try {
    const browser = new BrowserControlService(homePaths(stateDir));
    await browser.load();
    await browser.setConfig({
      enabled: true,
      managedEngine: "auto",
      defaultProfile: "personal",
      personalEnabled: true,
      personalCdpEndpoint: "http://127.0.0.1:9222",
      remoteEnabled: true,
      remoteCdpUrl: "wss://example.test/cdp",
      acknowledgeElevated: true,
    });
    const pub = await browser.getPublicConfig();
    assert.equal(pub.managedEngine, "auto");
    assert.equal(pub.effectiveManagedEngine, "obscura");
    assert.equal(pub.defaultProfile, "personal");
    assert.equal(pub.personalEnabled, true);
    assert.equal(pub.remoteEnabled, true);
    // Elevated readiness is CDP-based — Obscura readiness must not flip personal ready.
    assert.equal(pub.personalReady, false);
    assert.ok(OBSCURA_PARITY_GATE.never.includes("map personal/remote elevated profiles to Obscura"));

    const out = JSON.parse(
      await browser.runTool(
        { action: "status", profile: "personal" },
        { accountId: "acct-a", origin: "attended", ownerAccountId: "acct-a" },
      ),
    ) as { profile?: string; session?: { managedEngine?: string } | null };
    assert.equal(out.profile, "personal");
    assert.equal(out.session, null);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
