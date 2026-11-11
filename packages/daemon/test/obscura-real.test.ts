// Real Obscura binary coverage — V-OUT-30/31/32/33/34.
// Skips when Obscura is not staged/installed. Prefers:
//   ENVOYHOME_OBSCURA → ENVOYHOME_OBSCURA_BUNDLE → desktop resources/obscura → PATH
// Optional live network: ENVOYHOME_LIVE_OBSCURA=1 (example.com + Bing SERP).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { homePaths } from "../dist/home-paths.js";
import { BrowserControlService } from "../dist/browser-control.js";
import { WebSearchService } from "../dist/web-search.js";
import {
  __resetBrowserSerpGatesForTests,
  parseBingSerpHtml,
  runBrowserSerpFallback,
} from "../dist/web-search-browser.js";
import {
  probeObscuraRuntime,
  resolveObscuraBinary,
  runObscuraExtract,
  runObscuraFetchHtml,
  startObscuraServe,
} from "../dist/web-extract-obscura.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const stagedDesktop = join(
  repoRoot,
  "apps/desktop/src-tauri/resources/obscura",
  process.platform === "win32" ? "obscura.exe" : "obscura",
);

const dirs: string[] = [];
const serveStops: Array<() => Promise<void>> = [];

after(async () => {
  for (const stop of serveStops.splice(0)) {
    await stop().catch(() => undefined);
  }
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
});

const MD_FIXTURE = `<!DOCTYPE html><html><head><title>Obscura fixture</title></head>
<body>
  <h1>EnvoyHome Obscura extract fixture</h1>
  <p>Local markdown dump validation for Stage A.</p>
  <a href="https://fixture.example/link">fixture link</a>
</body></html>`;

const BING_FIXTURE = `<!DOCTYPE html><html><body>
<li class="b_algo">
  <h2><a href="https://fixture.example/envoyhome">EnvoyHome Obscura SERP</a></h2>
  <div class="b_caption"><p>Local Obscura SERP fixture.</p></div>
</li>
</body></html>`;

const CAPTCHA_MD_HINT = `<!DOCTYPE html><html><body>
<h1>Just a moment...</h1>
<p>Checking your browser before accessing. cf-challenge / recaptcha</p>
</body></html>`;

async function listenFixture(html: string): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${addr.port}/page`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Point resolve at a known binary for the duration of a callback. */
async function withObscuraEnv<T>(
  binary: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = process.env.ENVOYHOME_OBSCURA;
  process.env.ENVOYHOME_OBSCURA = binary;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.ENVOYHOME_OBSCURA;
    else process.env.ENVOYHOME_OBSCURA = prev;
  }
}

/**
 * Obscura 0.2.x blocks loopback/RFC1918 by default (SSRF). Local HTML fixtures need
 * this flag; production dig/SERP only hit public https (daemon SSRF already applies).
 */
function withPrivateNetworkFetch<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.OBSCURA_ALLOW_PRIVATE_NETWORK;
  process.env.OBSCURA_ALLOW_PRIVATE_NETWORK = "1";
  return fn().finally(() => {
    if (prev === undefined) delete process.env.OBSCURA_ALLOW_PRIVATE_NETWORK;
    else process.env.OBSCURA_ALLOW_PRIVATE_NETWORK = prev;
  });
}

async function resolveTestBinary(): Promise<string | null> {
  // Prefer already-resolved env/bundle/PATH, then staged desktop resources.
  const resolved = await resolveObscuraBinary();
  if (resolved) return resolved;
  if (existsSync(stagedDesktop)) {
    process.env.ENVOYHOME_OBSCURA_BUNDLE = stagedDesktop;
    return stagedDesktop;
  }
  return null;
}

test("V-OUT-33 real: probe finds staged/installed Obscura (or skip)", async (t) => {
  const binary = await resolveTestBinary();
  if (!binary) {
    t.skip(
      "Obscura not installed — run: pnpm obscura:fetch (or set ENVOYHOME_OBSCURA)",
    );
    return;
  }
  const probe = await withObscuraEnv(binary, () => probeObscuraRuntime());
  assert.equal(probe.status, "ready");
  assert.equal(probe.binary, binary);
  assert.match(probe.installHint, /Obscura|auto-install|ENVOYHOME_OBSCURA/i);
});

test("V-OUT-30 real: obscura fetch --dump markdown on local fixture", async (t) => {
  const binary = await resolveTestBinary();
  if (!binary) {
    t.skip("Obscura not installed — pnpm obscura:fetch");
    return;
  }
  const fixture = await listenFixture(MD_FIXTURE);
  try {
    const out = await withPrivateNetworkFetch(() =>
      runObscuraExtract(fixture.url, {
        maxChars: 8_000,
        timeoutMs: 25_000,
        binary,
      }),
    );
    assert.equal(out.backend, "obscura");
    assert.ok(!out.error, JSON.stringify(out));
    assert.ok(out.chars > 20, JSON.stringify(out));
    assert.match(out.markdown, /EnvoyHome Obscura extract fixture/i);
    assert.match(out.markdown, /Local markdown dump/i);
  } finally {
    await fixture.close();
  }
});

test("V-OUT-30 real: obscura truncate + captcha/block soft-fail", async (t) => {
  const binary = await resolveTestBinary();
  if (!binary) {
    t.skip("Obscura not installed — pnpm obscura:fetch");
    return;
  }
  const ok = await listenFixture(MD_FIXTURE);
  const blocked = await listenFixture(CAPTCHA_MD_HINT);
  try {
    await withPrivateNetworkFetch(async () => {
      const truncated = await runObscuraExtract(ok.url, {
        maxChars: 40,
        timeoutMs: 25_000,
        binary,
      });
      assert.equal(truncated.backend, "obscura");
      assert.ok(!truncated.error, JSON.stringify(truncated));
      assert.equal(truncated.truncated, true);
      assert.ok(truncated.chars <= 40);

      const cap = await runObscuraExtract(blocked.url, {
        maxChars: 8_000,
        timeoutMs: 25_000,
        binary,
      });
      assert.equal(cap.backend, "obscura");
      // Obscura may return challenge page as markdown — our detector must soft-fail.
      if (!cap.error) {
        assert.ok(cap.chars > 0);
      } else {
        assert.equal(cap.error, "captcha_or_block");
        assert.equal(cap.chars, 0);
      }
    });
  } finally {
    await ok.close();
    await blocked.close();
  }
});

test("V-OUT-31 real: obscura fetch --dump html + Bing parse", async (t) => {
  const binary = await resolveTestBinary();
  if (!binary) {
    t.skip("Obscura not installed — pnpm obscura:fetch");
    return;
  }
  const fixture = await listenFixture(BING_FIXTURE);
  try {
    const html = await withPrivateNetworkFetch(() =>
      runObscuraFetchHtml(fixture.url, 25_000, { binary }),
    );
    assert.match(html, /b_algo/i);
    const hits = parseBingSerpHtml(html, 5);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.url, "https://fixture.example/envoyhome");
    assert.match(hits[0]!.title, /EnvoyHome Obscura SERP/i);
  } finally {
    await fixture.close();
  }
});

test("V-OUT-31 real: runBrowserSerpFallback uses real Obscura HTML fetch", async (t) => {
  const binary = await resolveTestBinary();
  if (!binary) {
    t.skip("Obscura not installed — pnpm obscura:fetch");
    return;
  }
  __resetBrowserSerpGatesForTests();
  const fixture = await listenFixture(BING_FIXTURE);
  try {
    await withObscuraEnv(binary, async () => {
      await withPrivateNetworkFetch(async () => {
        const out = await runBrowserSerpFallback({
          query: "EnvoyHome",
          count: 5,
          engines: ["bing"],
          serpBrowserEngine: "obscura",
          // Real Obscura path: rewrite Bing URL → local fixture.
          fetchHtml: async (_serpUrl, timeoutMs) =>
            runObscuraFetchHtml(fixture.url, timeoutMs, { binary }),
        });
        assert.equal(out.engine, "bing");
        assert.ok(out.results.length >= 1, JSON.stringify(out));
        assert.equal(out.results[0]!.url, "https://fixture.example/envoyhome");
      });
    });
  } finally {
    await fixture.close();
  }
});

test("V-OUT-31 real: WebSearchService browser fallback via Obscura HTML", async (t) => {
  const binary = await resolveTestBinary();
  if (!binary) {
    t.skip("Obscura not installed — pnpm obscura:fetch");
    return;
  }
  __resetBrowserSerpGatesForTests();
  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-ws-"));
  dirs.push(stateDir);
  const fixture = await listenFixture(BING_FIXTURE);
  try {
    await withObscuraEnv(binary, async () => {
      await withPrivateNetworkFetch(async () => {
        const svc = new WebSearchService(homePaths(stateDir));
        await svc.load();
        await svc.setConfig({
          enabled: true,
          fallback: "browser",
          serpBrowserEngine: "obscura",
          browserEngines: ["bing"],
        });
        svc.fetchImpl = (async () =>
          new Response("<html><body>no hits</body></html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          })) as typeof fetch;

        const out = JSON.parse(
          await svc.runSearch(
            { query: "EnvoyHome obscura", count: 5 },
            {
              origin: "attended",
              authorizeBrowserFallback: async () => true,
              browserFetchHtml: async (_u, timeoutMs) =>
                runObscuraFetchHtml(fixture.url, timeoutMs, { binary }),
            },
          ),
        ) as {
          fallback?: string;
          engine?: string;
          results: Array<{ url: string }>;
        };
        assert.equal(out.fallback, "browser");
        assert.equal(out.engine, "bing");
        assert.equal(out.results[0]!.url, "https://fixture.example/envoyhome");
      });
    });
  } finally {
    await fixture.close();
  }
});

test("V-OUT-32 real: obscura serve + Playwright connectOverCDP", async (t) => {
  const binary = await resolveTestBinary();
  if (!binary) {
    t.skip("Obscura not installed — pnpm obscura:fetch");
    return;
  }
  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-serve-"));
  dirs.push(stateDir);
  const storageDir = join(stateDir, "storage");
  await mkdir(storageDir, { recursive: true });
  const fixture = await listenFixture(
    `<!DOCTYPE html><html><body><h1 id="t">Obscura CDP fixture</h1></body></html>`,
  );
  let handle: Awaited<ReturnType<typeof startObscuraServe>> | null = null;
  try {
    await withPrivateNetworkFetch(async () => {
      handle = await startObscuraServe({
        storageDir,
        binary,
        readyTimeoutMs: 20_000,
      });
      serveStops.push(() => handle!.stop());
      assert.match(handle.endpoint, /^http:\/\/127\.0\.0\.1:\d+$/);

      const version = await fetch(`${handle.endpoint}/json/version`);
      assert.equal(version.ok, true);
      const body = (await version.json()) as { webSocketDebuggerUrl?: string };
      assert.ok(body.webSocketDebuggerUrl);

      const pw = await import("playwright");
      const browser = await pw.chromium.connectOverCDP(handle.endpoint);
      try {
        const ctx = browser.contexts()[0] ?? (await browser.newContext());
        const page = ctx.pages()[0] ?? (await ctx.newPage());
        await page.goto(fixture.url, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        const text = await page.locator("#t").innerText();
        assert.match(text, /Obscura CDP fixture/i);
      } finally {
        await browser.close().catch(() => undefined);
      }
    });
  } finally {
    await fixture.close();
    if (handle) await handle.stop().catch(() => undefined);
  }
});

test("V-OUT-32 real: BrowserControlService managed Obscura open+status", async (t) => {
  const binary = await resolveTestBinary();
  if (!binary) {
    t.skip("Obscura not installed — pnpm obscura:fetch");
    return;
  }
  // Playwright driver required for connectOverCDP.
  let pwOk = false;
  try {
    const pw = await import("playwright");
    pwOk = Boolean(pw?.chromium);
  } catch {
    pwOk = false;
  }
  if (!pwOk) {
    t.skip("playwright npm driver missing beside daemon");
    return;
  }

  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-managed-"));
  dirs.push(stateDir);

  // Navigate SSRF refuses loopback — use a public HTTPS page.
  // Soft-skip on network/CAPTCHA; the serve+CDP test above already covers local fixtures.
  await withObscuraEnv(binary, async () => {
    const svc = new BrowserControlService(homePaths(stateDir));
    await svc.load();
    await svc.setConfig({ enabled: true, managedEngine: "obscura" });
    const pub = await svc.getPublicConfig();
    assert.equal(pub.managedEngine, "obscura");
    assert.equal(pub.obscuraRuntime, "ready");
    assert.equal(pub.effectiveManagedEngine, "obscura");

    try {
      let opened: { url?: string; title?: string; error?: string };
      try {
        opened = JSON.parse(
          await svc.runTool(
            { action: "open", url: "https://example.com/" },
            { accountId: "alice", origin: "attended", ownerAccountId: "alice" },
          ),
        ) as { url?: string; title?: string; error?: string };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/timeout|captcha|block|tool_unavailable|ECONN|fetch failed/i.test(msg)) {
          t.skip(`managed open soft-skip (network): ${msg.slice(0, 160)}`);
          return;
        }
        throw err;
      }
      assert.match(String(opened.url ?? ""), /example\.com/i);

      const status = JSON.parse(
        await svc.runTool(
          { action: "status" },
          { accountId: "alice", origin: "attended", ownerAccountId: "alice" },
        ),
      ) as {
        managedEngine?: string;
        effectiveManagedEngine?: string;
        session?: { managedEngine?: string } | null;
      };
      assert.equal(status.managedEngine, "obscura");
      assert.equal(status.effectiveManagedEngine, "obscura");
      assert.equal(status.session?.managedEngine, "obscura");
    } finally {
      // `stop` tears down the managed session + obscura serve (not tab `close`).
      await svc
        .runTool(
          { action: "stop" },
          { accountId: "alice", origin: "attended", ownerAccountId: "alice" },
        )
        .catch(() => undefined);
    }
  });
});

test("V-OUT-33 real: resolve prefers ENVOYHOME_OBSCURA over staged bundle", async (t) => {
  const binary = await resolveTestBinary();
  if (!binary) {
    t.skip("Obscura not installed — pnpm obscura:fetch");
    return;
  }
  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-order-"));
  dirs.push(stateDir);
  const owner = join(stateDir, "owner-bin");
  // Copy is unnecessary — a shim that execs the real binary keeps resolve honest.
  await writeFile(
    owner,
    `#!/bin/sh\nexec ${JSON.stringify(binary)} "$@"\n`,
    { mode: 0o755 },
  );
  await chmod(owner, 0o755);

  const prevO = process.env.ENVOYHOME_OBSCURA;
  const prevB = process.env.ENVOYHOME_OBSCURA_BUNDLE;
  try {
    process.env.ENVOYHOME_OBSCURA = owner;
    process.env.ENVOYHOME_OBSCURA_BUNDLE = binary;
    const hit = await resolveObscuraBinary();
    assert.equal(hit, owner);

    delete process.env.ENVOYHOME_OBSCURA;
    const viaBundle = await resolveObscuraBinary();
    assert.equal(viaBundle, binary);
  } finally {
    if (prevO === undefined) delete process.env.ENVOYHOME_OBSCURA;
    else process.env.ENVOYHOME_OBSCURA = prevO;
    if (prevB === undefined) delete process.env.ENVOYHOME_OBSCURA_BUNDLE;
    else process.env.ENVOYHOME_OBSCURA_BUNDLE = prevB;
  }
});

test("V-OUT-30/31 real live network (opt-in ENVOYHOME_LIVE_OBSCURA=1)", async (t) => {
  if ((process.env.ENVOYHOME_LIVE_OBSCURA ?? "").trim() !== "1") {
    t.skip("set ENVOYHOME_LIVE_OBSCURA=1 to hit example.com + Bing via Obscura");
    return;
  }
  const binary = await resolveTestBinary();
  if (!binary) {
    t.skip("Obscura not installed — pnpm obscura:fetch");
    return;
  }

  const extracted = await runObscuraExtract("https://example.com/", {
    maxChars: 20_000,
    timeoutMs: 45_000,
    binary,
  });
  if (extracted.error === "captcha_or_block" || extracted.error === "timeout") {
    assert.equal(extracted.chars, 0);
  } else {
    assert.ok(!extracted.error, JSON.stringify(extracted));
    assert.match(extracted.markdown, /example/i);
  }

  __resetBrowserSerpGatesForTests();
  await withObscuraEnv(binary, async () => {
    const out = await runBrowserSerpFallback({
      query: "Open Source Foundation",
      count: 5,
      engines: ["bing"],
      serpBrowserEngine: "obscura",
      // no fetchHtml → real runObscuraFetchHtml against Bing
    });
    if (
      out.code === "captcha_or_block" ||
      out.code === "parse_empty" ||
      out.code === "timeout"
    ) {
      assert.equal(out.results.length, 0);
      return;
    }
    assert.ok(out.results.length >= 1, JSON.stringify(out));
    assert.match(out.results[0]!.url, /^https?:\/\//i);
  });
});
