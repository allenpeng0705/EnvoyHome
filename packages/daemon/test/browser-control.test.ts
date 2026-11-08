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
  detectBrowserBlocked,
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

function mockPage(url = "https://example.com/", opts?: { title?: string; body?: string }) {
  let current = url;
  const stampedRefs = new Set<string>();
  const title = opts?.title ?? "Example";
  const body = opts?.body ?? "Hello body text";
  return {
    goto: async (u: string) => {
      current = u;
    },
    url: () => current,
    title: async () => title,
    content: async () => "<html></html>",
    innerText: async () => body,
    locator: (sel: string) => ({
      count: async () => {
        const m = /data-eh-ref="([^"]+)"/.exec(sel);
        if (m) return stampedRefs.has(m[1]!) ? 1 : 0;
        return sel === "body" ? 1 : 0;
      },
      nth: () => ({
        click: async () => undefined,
        fill: async () => undefined,
        selectOption: async () => undefined,
        dragTo: async () => undefined,
        evaluate: async <T>(fn: (el: Element) => T) => fn({} as Element),
        screenshot: async () => Buffer.from([]),
      }),
    }),
    evaluate: async <T>(
      fn: (() => T) | ((arg: unknown) => T),
      arg?: unknown,
    ) => {
      stampedRefs.clear();
      const fakeEl = {
        setAttribute: (k: string, v: string) => {
          if (k === "data-eh-ref") stampedRefs.add(v);
        },
        innerText: "Go",
        tagName: "BUTTON",
        getAttribute: (name: string) => (name === "role" ? "button" : null),
        getBoundingClientRect: () => ({ width: 10, height: 10 }),
      };
      const fakeDoc = {
        querySelectorAll: () => [fakeEl],
      };
      const fakeWin = {
        getComputedStyle: () => ({ display: "block", visibility: "visible" }),
      };
      const origDoc = (globalThis as { document?: unknown }).document;
      const origWin = (globalThis as { window?: unknown }).window;
      (globalThis as { document: unknown }).document = fakeDoc;
      (globalThis as { window: unknown }).window = fakeWin;
      try {
        if (arg !== undefined) return (fn as (a: unknown) => T)(arg);
        return (fn as () => T)();
      } finally {
        if (origDoc === undefined) delete (globalThis as { document?: unknown }).document;
        else (globalThis as { document: unknown }).document = origDoc;
        if (origWin === undefined) delete (globalThis as { window?: unknown }).window;
        else (globalThis as { window: unknown }).window = origWin;
      }
    },
    screenshot: async () => Buffer.from([1, 2, 3]),
    waitForLoadState: async () => undefined,
    waitForSelector: async () => undefined,
    waitForTimeout: async () => undefined,
    keyboard: { press: async () => undefined },
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
    snapshotId: string;
    snapshot: { elements: Array<{ ref: string }> };
  };
  assert.equal(nav.action, "navigate");
  assert.ok(nav.targetId);
  assert.ok(nav.snapshotId);
  assert.ok(nav.snapshot.elements.length >= 1);

  __resetBrowserSerpGatesForTests();
  const act = JSON.parse(
    await svc.runTool(
      {
        action: "act",
        kind: "click",
        ref: nav.snapshot.elements[0]!.ref,
        snapshotId: nav.snapshotId,
      },
      { accountId: "alice" },
    ),
  ) as { ok?: boolean; error?: string; verify?: { mode?: string } };
  assert.equal(act.ok, true);
  assert.equal(act.verify?.mode, "text");

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

test("V-OUT-11: act without matching snapshotId → stale_snapshot; no side effect", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({ enabled: true });
  let clicks = 0;
  svc.pageFactory = async () => {
    const p = mockPage() as ReturnType<typeof mockPage> & {
      locator: (sel: string) => {
        count(): Promise<number>;
        nth: () => { click: () => Promise<void> };
      };
    };
    const base = p.locator;
    p.locator = (sel: string) => {
      const loc = base(sel);
      return {
        ...loc,
        nth: () => ({
          ...loc.nth(),
          click: async () => {
            clicks += 1;
          },
        }),
      };
    };
    return p as never;
  };
  const nav = JSON.parse(
    await svc.runTool(
      { action: "navigate", url: "https://example.com/" },
      { accountId: "alice" },
    ),
  ) as { snapshotId: string; snapshot: { elements: Array<{ ref: string }> } };
  __resetBrowserSerpGatesForTests();
  const missing = JSON.parse(
    await svc.runTool(
      { action: "act", kind: "click", ref: nav.snapshot.elements[0]!.ref },
      { accountId: "alice" },
    ),
  ) as { error?: string };
  assert.equal(missing.error, "stale_snapshot");
  assert.equal(clicks, 0);
  __resetBrowserSerpGatesForTests();
  const wrong = JSON.parse(
    await svc.runTool(
      {
        action: "act",
        kind: "click",
        ref: nav.snapshot.elements[0]!.ref,
        snapshotId: "s-old",
      },
      { accountId: "alice" },
    ),
  ) as { error?: string };
  assert.equal(wrong.error, "stale_snapshot");
  assert.equal(clicks, 0);
  void nav.snapshotId;
});

test("V-OUT-12: stale_ref + verify=text payload on success", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({ enabled: true });
  svc.pageFactory = async () => mockPage() as never;
  const nav = JSON.parse(
    await svc.runTool(
      { action: "navigate", url: "https://example.com/" },
      { accountId: "alice" },
    ),
  ) as { snapshotId: string };
  __resetBrowserSerpGatesForTests();
  const stale = JSON.parse(
    await svc.runTool(
      { action: "act", kind: "click", ref: "999", snapshotId: nav.snapshotId },
      { accountId: "alice" },
    ),
  ) as { error?: string };
  assert.equal(stale.error, "stale_ref");
  __resetBrowserSerpGatesForTests();
  const snap = JSON.parse(
    await svc.runTool({ action: "snapshot" }, { accountId: "alice" }),
  ) as { snapshotId: string; snapshot: { elements: Array<{ ref: string; role?: string }> } };
  assert.ok(snap.snapshot.elements[0]?.role);
  __resetBrowserSerpGatesForTests();
  const ok = JSON.parse(
    await svc.runTool(
      {
        action: "act",
        kind: "click",
        ref: snap.snapshot.elements[0]!.ref,
        snapshotId: snap.snapshotId,
        verify: "text",
      },
      { accountId: "alice" },
    ),
  ) as { ok?: boolean; verify?: { mode?: string; text?: string } };
  assert.equal(ok.ok, true);
  assert.equal(ok.verify?.mode, "text");
  assert.match(String(ok.verify?.text ?? ""), /Hello/);
});

test("V-OUT-13: wait respects ms cap; over-cap refused", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({ enabled: true });
  svc.pageFactory = async () => mockPage() as never;
  await svc.runTool(
    { action: "navigate", url: "https://example.com/" },
    { accountId: "alice" },
  );
  __resetBrowserSerpGatesForTests();
  await assert.rejects(
    () =>
      svc.runTool(
        { action: "wait", until: "timeout", ms: 20_000 },
        { accountId: "alice" },
      ),
    /15|cap|bad_params/i,
  );
  __resetBrowserSerpGatesForTests();
  const waited = JSON.parse(
    await svc.runTool(
      { action: "wait", until: "load", ms: 100 },
      { accountId: "alice" },
    ),
  ) as { ok?: boolean; until?: string };
  assert.equal(waited.ok, true);
  assert.equal(waited.until, "load");
  __resetBrowserSerpGatesForTests();
  const pressed = JSON.parse(
    await svc.runTool({ action: "press", key: "Enter" }, { accountId: "alice" }),
  ) as { ok?: boolean; key?: string };
  assert.equal(pressed.ok, true);
  assert.equal(pressed.key, "Enter");
});

test("V-OUT-14: captcha heuristic returns blocked", async () => {
  assert.equal(
    detectBrowserBlocked({
      url: "https://example.com/",
      title: "Hi",
      textSample: "please complete the recaptcha",
      mode: "act",
    })?.blocked,
    "captcha",
  );
  // Footer "Sign in" must not hard-block act on normal sites.
  assert.equal(
    detectBrowserBlocked({
      url: "https://shop.example/",
      title: "Products",
      textSample: "Welcome. Sign in · Cart · Help",
      mode: "act",
    }),
    null,
  );
  assert.equal(
    detectBrowserBlocked({
      url: "https://shop.example/login",
      title: "Sign in",
      textSample: "Please sign in to continue",
      mode: "advisory",
    })?.blocked,
    "login_wall",
  );
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({ enabled: true });
  svc.pageFactory = async () =>
    mockPage("https://example.com/challenge", {
      title: "Just a moment...",
      body: "Checking your browser before accessing. Cloudflare challenge.",
    }) as never;
  const nav = JSON.parse(
    await svc.runTool(
      { action: "navigate", url: "https://example.com/challenge" },
      { accountId: "alice" },
    ),
  ) as { blocked?: string; message?: string };
  assert.ok(nav.blocked === "captcha" || nav.blocked === "challenge");
  assert.match(String(nav.message ?? ""), /hand off|Owner/i);
});

test("V-OUT-15: attended default verify=text; unattended default none; screenshot jail", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({ enabled: true, unattendedEnabled: true });
  svc.pageFactory = async () => mockPage() as never;
  const nav = JSON.parse(
    await svc.runTool(
      { action: "navigate", url: "https://example.com/" },
      { accountId: "alice", origin: "attended" },
    ),
  ) as { snapshotId: string; snapshot: { elements: Array<{ ref: string }> } };
  __resetBrowserSerpGatesForTests();
  const attended = JSON.parse(
    await svc.runTool(
      {
        action: "act",
        kind: "click",
        ref: nav.snapshot.elements[0]!.ref,
        snapshotId: nav.snapshotId,
      },
      { accountId: "alice", origin: "attended" },
    ),
  ) as { verify?: { mode?: string } };
  assert.equal(attended.verify?.mode, "text");

  __resetBrowserSerpGatesForTests();
  const snap2 = JSON.parse(
    await svc.runTool({ action: "snapshot" }, { accountId: "alice", origin: "unattended" }),
  ) as { snapshotId: string; snapshot: { elements: Array<{ ref: string }> } };
  __resetBrowserSerpGatesForTests();
  const unattended = JSON.parse(
    await svc.runTool(
      {
        action: "act",
        kind: "click",
        ref: snap2.snapshot.elements[0]!.ref,
        snapshotId: snap2.snapshotId,
      },
      { accountId: "alice", origin: "unattended" },
    ),
  ) as { verify?: { mode?: string } };
  assert.equal(unattended.verify?.mode, "none");

  __resetBrowserSerpGatesForTests();
  const snap3 = JSON.parse(
    await svc.runTool({ action: "snapshot" }, { accountId: "alice" }),
  ) as { snapshotId: string; snapshot: { elements: Array<{ ref: string }> } };
  __resetBrowserSerpGatesForTests();
  const shot = JSON.parse(
    await svc.runTool(
      {
        action: "act",
        kind: "click",
        ref: snap3.snapshot.elements[0]!.ref,
        snapshotId: snap3.snapshotId,
        verify: "screenshot",
      },
      { accountId: "alice" },
    ),
  ) as { verify?: { mode?: string; path?: string; bytes?: number } };
  assert.equal(shot.verify?.mode, "screenshot");
  assert.match(String(shot.verify?.path ?? ""), /^output\/browser\//);
});

test("P2-G: act with Sign-in footer still ok; snapshot consumed; close clears meta", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await fresh();
  await svc.setConfig({ enabled: true });
  svc.pageFactory = async () =>
    mockPage("https://shop.example/", {
      title: "Shop",
      body: "Hello. Sign in · Cart. Click Go.",
    }) as never;
  const nav = JSON.parse(
    await svc.runTool(
      { action: "navigate", url: "https://shop.example/" },
      { accountId: "alice" },
    ),
  ) as {
    targetId: string;
    snapshotId: string;
    blocked?: string;
    snapshot: { elements: Array<{ ref: string }> };
  };
  assert.equal(nav.blocked, undefined);
  __resetBrowserSerpGatesForTests();
  const first = JSON.parse(
    await svc.runTool(
      {
        action: "act",
        kind: "click",
        ref: nav.snapshot.elements[0]!.ref,
        snapshotId: nav.snapshotId,
      },
      { accountId: "alice" },
    ),
  ) as { ok?: boolean; snapshotConsumed?: boolean };
  assert.equal(first.ok, true);
  assert.equal(first.snapshotConsumed, true);
  __resetBrowserSerpGatesForTests();
  const reuse = JSON.parse(
    await svc.runTool(
      {
        action: "act",
        kind: "click",
        ref: nav.snapshot.elements[0]!.ref,
        snapshotId: nav.snapshotId,
      },
      { accountId: "alice" },
    ),
  ) as { error?: string };
  assert.equal(reuse.error, "stale_snapshot");
  __resetBrowserSerpGatesForTests();
  await svc.runTool(
    { action: "close", targetId: nav.targetId },
    { accountId: "alice" },
  );
  __resetBrowserSerpGatesForTests();
  // New navigate after close — prior snapshotId must not resurrect.
  const again = JSON.parse(
    await svc.runTool(
      { action: "navigate", url: "https://shop.example/p/1" },
      { accountId: "alice" },
    ),
  ) as { snapshotId: string };
  assert.notEqual(again.snapshotId, nav.snapshotId);
});
