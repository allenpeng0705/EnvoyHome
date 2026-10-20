// V-OUT-8 — browser control tool (Design §9.5g).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BrowserControlService,
  assertBrowserNavigateUrl,
  assertPersonalCdpEndpoint,
  browserDefaultProfileForOrigin,
  isElevatedProfile,
} from "../dist/browser-control.js";
import { __resetBrowserSerpGatesForTests } from "../dist/web-search-browser.js";
import { homePaths } from "../dist/home-paths.js";
import { listWorkflowTools } from "../dist/workflow-tools.js";
import { SkillService } from "../dist/skills.js";
import { ChannelService } from "../dist/channels/service.js";
import { DaemonLogger } from "../dist/logger.js";
import { BindingStore } from "../dist/bindings.js";
import { DeviceCredentialStore } from "../dist/auth.js";

const dirs: string[] = [];

after(async () => {
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function fresh() {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-browser-"));
  dirs.push(stateDir);
  const paths = homePaths(stateDir);
  const svc = new BrowserControlService(paths);
  await svc.load();
  return { svc, paths, stateDir };
}

function mockPage(url = "https://example.com/") {
  let current = url;
  const attrs = new Map<string, string>();
  return {
    goto: async (u: string) => {
      current = u;
    },
    url: () => current,
    title: async () => "Example",
    content: async () => "<html></html>",
    innerText: async () => "Hello body text",
    locator: (sel: string) => ({
      count: async () => (sel.includes("data-eh-ref") ? 1 : 0),
      nth: () => ({
        click: async () => undefined,
        fill: async () => undefined,
        selectOption: async () => undefined,
        dragTo: async () => undefined,
        evaluate: async <T>(fn: (el: Element) => T) => fn({} as Element),
        screenshot: async () => Buffer.from([]),
      }),
    }),
    evaluate: async <T>(fn: () => T) => {
      // Simulate DOM query for snapshot
      const fakeDoc = {
        querySelectorAll: () => [
          {
            setAttribute: (k: string, v: string) => attrs.set(k, v),
            innerText: "Go",
            tagName: "BUTTON",
            getAttribute: () => null,
          },
        ],
      };
      // page.evaluate runs in browser; our mock invokes the function in Node —
      // the real implementation uses document. Provide a shim.
      const orig = (globalThis as { document?: unknown }).document;
      (globalThis as { document: unknown }).document = fakeDoc;
      try {
        return fn();
      } finally {
        if (orig === undefined) delete (globalThis as { document?: unknown }).document;
        else (globalThis as { document: unknown }).document = orig;
      }
    },
    screenshot: async () => Buffer.from([1, 2, 3]),
    close: async () => undefined,
  };
}

test("V-OUT-8: default disabled; catalogue unavailable", async () => {
  const { svc, stateDir } = await fresh();
  const pub = await svc.getPublicConfig();
  assert.equal(pub.enabled, false);
  assert.equal(pub.ready, false);
  assert.equal(svc.readyInfo().ok, false);

  const devices = new DeviceCredentialStore();
  const bindings = new BindingStore(stateDir, devices);
  const channels = new ChannelService({
    stateDir,
    bindings,
    logger: new DaemonLogger(),
  });
  const skills = new SkillService(homePaths(stateDir));
  const tools = await listWorkflowTools({
    skills,
    channels,
    browserControl: svc,
  });
  const row = tools.find((t) => t.name === "browser");
  assert.ok(row);
  assert.equal(row!.available, false);
});

test("V-OUT-8: SSRF blocks private hosts", () => {
  assert.throws(() => assertBrowserNavigateUrl("http://127.0.0.1/"), /unsafe|refused/i);
  assert.throws(() => assertBrowserNavigateUrl("http://192.168.1.1/"), /unsafe|refused/i);
  assert.throws(() => assertBrowserNavigateUrl("http://2130706433/"), /unsafe|refused/i);
  assert.throws(() => assertBrowserNavigateUrl("http://127.1/"), /unsafe|refused/i);
  assert.throws(() => assertBrowserNavigateUrl("file:///etc/passwd"), /http/i);
  const ok = assertBrowserNavigateUrl("https://example.com/path");
  assert.equal(ok.hostname, "example.com");
});

test("V-OUT-8: navigate SSRF guard blocks redirect targets via route", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({ enabled: true });
  let aborted = false;
  svc.pageFactory = async () => {
    const p = mockPage() as ReturnType<typeof mockPage> & {
      route?: PageLikeRoute;
      goto: (u: string) => Promise<void>;
    };
    p.route = async (_pat, handler) => {
      await handler({
        request: () => ({ url: () => "http://169.254.169.254/" }),
        continue: async () => undefined,
        abort: async () => {
          aborted = true;
        },
      });
    };
    p.goto = async () => {
      if (aborted) throw new Error("net::ERR_BLOCKED_BY_CLIENT");
    };
    return p as never;
  };
  await assert.rejects(
    () =>
      svc.runTool(
        { action: "navigate", url: "https://example.com/" },
        { accountId: "alice" },
      ),
    /unsafe|SSRF|blocked/i,
  );
});

type PageLikeRoute = (
  pattern: string,
  handler: (route: {
    request(): { url(): string };
    continue(): Promise<void>;
    abort(reason?: string): Promise<void>;
  }) => Promise<void> | void,
) => Promise<void>;

test("V-OUT-8: navigate + snapshot + act with mock page", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({ enabled: true });
  svc.pageFactory = async () => mockPage() as never;

  const nav = JSON.parse(
    await svc.runTool(
      { action: "navigate", url: "https://example.com/" },
      { accountId: "alice" },
    ),
  ) as {
    action: string;
    targetId: string;
    snapshot: { elements: Array<{ ref: string }> };
  };
  assert.equal(nav.action, "navigate");
  assert.ok(nav.targetId);
  assert.ok(nav.snapshot.elements.length >= 1);

  __resetBrowserSerpGatesForTests();
  const act = JSON.parse(
    await svc.runTool(
      { action: "act", kind: "click", ref: nav.snapshot.elements[0]!.ref },
      { accountId: "alice" },
    ),
  ) as { ok?: boolean; error?: string };
  assert.equal(act.ok, true);

  __resetBrowserSerpGatesForTests();
  const text = JSON.parse(
    await svc.runTool({ action: "text" }, { accountId: "alice" }),
  ) as { text: string };
  assert.match(text.text, /Hello/);
});

test("V-OUT-8: unattended without unattendedEnabled fails", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({ enabled: true, unattendedEnabled: false });
  svc.pageFactory = async () => mockPage() as never;
  await assert.rejects(
    () =>
      svc.runTool(
        { action: "navigate", url: "https://example.com/" },
        { accountId: "alice", origin: "unattended" },
      ),
    /unattended/i,
  );
});

test("V-OUT-8: concurrency busy while gate held", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({ enabled: true });
  svc.pageFactory = async () => mockPage() as never;
  let release!: () => void;
  const hold = new Promise<void>((r) => {
    release = r;
  });
  // Hold the gate by starting a navigate that waits inside page.goto
  svc.pageFactory = async () => {
    const p = mockPage() as ReturnType<typeof mockPage> & {
      goto: (u: string) => Promise<void>;
    };
    p.goto = async () => {
      await hold;
    };
    return p as never;
  };
  const first = svc.runTool(
    { action: "navigate", url: "https://example.com/" },
    { accountId: "alice" },
  );
  // Give first call time to acquire gate
  await new Promise((r) => setTimeout(r, 20));
  const busy = JSON.parse(
    await svc.runTool({ action: "status" }, { accountId: "bob" }),
  ) as { session: unknown };
  // status/doctor bypass the gate — use open which needs it
  const busy2 = JSON.parse(
    await svc.runTool(
      { action: "open", url: "https://example.org/" },
      { accountId: "bob" },
    ),
  ) as { error?: string };
  assert.equal(busy2.error, "browser_busy");
  release();
  await first;
  void busy;
});

test("V-OUT-8: enable + chromium ready marks catalogue available when runtime ready", async () => {
  const { svc, stateDir } = await fresh();
  await svc.setConfig({ enabled: true });
  const pub = await svc.getPublicConfig();
  // Without Chromium, ready stays false even when enabled.
  if (pub.browserRuntime === "missing") {
    assert.equal(pub.ready, false);
  }
  const devices = new DeviceCredentialStore();
  const bindings = new BindingStore(stateDir, devices);
  const channels = new ChannelService({
    stateDir,
    bindings,
    logger: new DaemonLogger(),
  });
  const skills = new SkillService(homePaths(stateDir));
  const tools = await listWorkflowTools({
    skills,
    channels,
    browserControl: svc,
  });
  const row = tools.find((t) => t.name === "browser");
  assert.equal(row!.available, pub.ready);
});

test("V-OUT-9: personal requires ack; Owner-only; never unattended; loopback CDP", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({ enabled: true });
  await assert.rejects(
    () => svc.setConfig({ personalEnabled: true }),
    /acknowledge/i,
  );
  await svc.setConfig({ acknowledgeElevated: true, personalEnabled: true });
  assert.throws(() => assertPersonalCdpEndpoint("http://192.168.1.5:9222"), /loopback/i);
  assert.equal(assertPersonalCdpEndpoint("http://127.0.0.1:9222").hostname, "127.0.0.1");

  svc.pageFactory = async () => mockPage() as never;
  svc.cdpProbe = async () => true;

  await assert.rejects(
    () =>
      svc.runTool(
        { action: "navigate", profile: "personal", url: "https://example.com/" },
        { accountId: "alice", origin: "unattended", ownerAccountId: "alice" },
      ),
    /unattended/i,
  );
  await assert.rejects(
    () =>
      svc.runTool(
        { action: "navigate", profile: "personal", url: "https://example.com/" },
        { accountId: "bob", origin: "attended", ownerAccountId: "alice" },
      ),
    /Owner-account/i,
  );

  __resetBrowserSerpGatesForTests();
  const out = JSON.parse(
    await svc.runTool(
      { action: "navigate", profile: "personal", url: "https://example.com/" },
      { accountId: "alice", origin: "attended", ownerAccountId: "alice" },
    ),
  ) as { profile: string; action: string };
  assert.equal(out.profile, "personal");
  assert.equal(out.action, "navigate");
});

test("V-OUT-10: remote Owner-only; never unattended; CDP URL not from tool args", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({
    enabled: true,
    acknowledgeElevated: true,
    remoteEnabled: true,
    remoteCdpUrl: "https://browserless.example/cdp",
    remoteToken: "secret-token",
  });
  svc.pageFactory = async () => mockPage() as never;
  svc.cdpProbe = async () => true;
  let connectedEndpoint = "";
  svc.cdpConnect = async (endpoint) => {
    connectedEndpoint = endpoint;
    return {
      browser: {
        close: async () => undefined,
        contexts: () => [
          {
            pages: () => [],
            newPage: () => svc.pageFactory!(),
          },
        ],
      },
    };
  };

  await assert.rejects(
    () =>
      svc.runTool(
        { action: "start", profile: "remote" },
        { accountId: "alice", origin: "unattended", ownerAccountId: "alice" },
      ),
    /unattended/i,
  );
  await assert.rejects(
    () =>
      svc.runTool(
        { action: "start", profile: "remote" },
        { accountId: "guest", origin: "attended", ownerAccountId: "alice" },
      ),
    /Owner-account/i,
  );

  __resetBrowserSerpGatesForTests();
  // Agent cannot override CDP via args — only profile selects Owner config.
  await svc.runTool(
    {
      action: "start",
      profile: "remote",
      cdpUrl: "http://evil.example/",
    },
    { accountId: "alice", origin: "attended", ownerAccountId: "alice" },
  );
  assert.match(connectedEndpoint, /browserless\.example/);
  assert.doesNotMatch(connectedEndpoint, /evil/);
  assert.match(connectedEndpoint, /token=secret-token/);

  const pub = await svc.getPublicConfig();
  assert.equal(pub.hasRemoteToken, true);
  assert.equal(pub.remoteCdpUrl.includes("secret"), false);
});

test("V-CRON-12: schedule/unattended forces managed default; elevated refused", async () => {
  assert.equal(browserDefaultProfileForOrigin("unattended", "personal"), "managed");
  assert.equal(browserDefaultProfileForOrigin("unattended", "remote"), "managed");
  assert.equal(browserDefaultProfileForOrigin("attended", "personal"), "personal");
  assert.equal(isElevatedProfile("personal"), true);
  assert.equal(isElevatedProfile("remote"), true);

  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({
    enabled: true,
    unattendedEnabled: true,
    acknowledgeElevated: true,
    personalEnabled: true,
    defaultProfile: "personal",
  });
  svc.pageFactory = async () => mockPage() as never;
  svc.cdpProbe = async () => true;
  // Schedule agentTurn uses origin:unattended — elevated profiles must fail closed.
  await assert.rejects(
    () =>
      svc.runTool(
        { action: "navigate", profile: "personal", url: "https://example.com/" },
        { accountId: "alice", origin: "unattended", ownerAccountId: "alice" },
      ),
    /unattended/i,
  );
  await assert.rejects(
    () =>
      svc.runTool(
        { action: "navigate", profile: "remote", url: "https://example.com/" },
        { accountId: "alice", origin: "unattended", ownerAccountId: "alice" },
      ),
    /unattended|remote/i,
  );
  // Forced managed default (TurnService) is the only schedule-safe profile.
  assert.equal(browserDefaultProfileForOrigin("unattended", "personal"), "managed");
  assert.equal(browserDefaultProfileForOrigin("unattended", svc.resolveProfile({})), "managed");
});
