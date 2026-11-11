// Real Obscura flows — browser control + web_search + web_research dig + web_extract.
// Skips when Obscura missing. Public HTTPS pages used for dig/browser (SSRF).
// Optional: ENVOYHOME_LIVE_OBSCURA=1 already covered in obscura-real.test.ts.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserControlService } from "../dist/browser-control.js";
import { WebSearchService } from "../dist/web-search.js";
import { runWebExtract } from "../dist/web-extract.js";
import {
  __resetBrowserSerpGatesForTests,
  runBrowserSerpFallback,
} from "../dist/web-search-browser.js";
import { runObscuraFetchHtml } from "../dist/web-extract-obscura.js";
import { homePaths } from "../dist/home-paths.js";
import {
  BING_SERP_FIXTURE,
  isSoftNetworkFailure,
  listenHtmlFixture,
  resolveTestObscuraBinary,
  withObscuraEnv,
  withPrivateNetworkFetch,
} from "./obscura-test-helpers.ts";

const dirs: string[] = [];

after(async () => {
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function requireBinary(t: { skip: (msg?: string) => void }): Promise<string | null> {
  const binary = await resolveTestObscuraBinary();
  if (!binary) {
    t.skip("Obscura not installed — pnpm obscura:fetch");
    return null;
  }
  return binary;
}

test("V-OUT-32 real flow: managed Obscura open→snapshot→text→tabs→wait→screenshot→stop", async (t) => {
  const binary = await requireBinary(t);
  if (!binary) return;

  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-bc-flow-"));
  dirs.push(stateDir);

  await withObscuraEnv(binary, async () => {
    const svc = new BrowserControlService(homePaths(stateDir));
    await svc.load();
    await svc.setConfig({ enabled: true, managedEngine: "obscura" });
    const opts = {
      accountId: "alice",
      origin: "attended" as const,
      ownerAccountId: "alice",
    };

    try {
      await svc.runTool({ action: "start" }, opts);

      let opened: { url?: string; targetId?: string; snapshotId?: string };
      try {
        opened = JSON.parse(
          await svc.runTool({ action: "open", url: "https://example.com/" }, opts),
        ) as typeof opened;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isSoftNetworkFailure(msg)) {
          t.skip(`browser open soft-skip: ${msg.slice(0, 160)}`);
          return;
        }
        throw err;
      }
      assert.match(String(opened.url ?? ""), /example\.com/i);
      assert.ok(opened.targetId);

      const tabs = JSON.parse(await svc.runTool({ action: "tabs" }, opts)) as {
        tabs?: Array<{ targetId: string; url?: string }>;
      };
      assert.ok(Array.isArray(tabs.tabs) && tabs.tabs.length >= 1);

      const snap = JSON.parse(await svc.runTool({ action: "snapshot" }, opts)) as {
        snapshotId: string;
        url: string;
        title?: string;
        snapshot: { elements: Array<{ ref: string; role?: string; name?: string }> };
      };
      assert.ok(snap.snapshotId);
      assert.match(snap.url, /example\.com/i);
      assert.ok(Array.isArray(snap.snapshot.elements));

      const text = JSON.parse(await svc.runTool({ action: "text" }, opts)) as {
        text: string;
      };
      assert.match(text.text, /example/i);

      await svc.runTool({ action: "wait", until: "timeout", ms: 200 }, opts);

      const shot = JSON.parse(
        await svc.runTool({ action: "screenshot" }, opts),
      ) as { path: string; bytes: number };
      // Path is jail-relative (output/browser/shot-*.png), not absolute.
      assert.match(shot.path, /^output\/browser\/shot-\d+\.png$/);
      const absShot = join(stateDir, "accounts", "alice", "files", shot.path);
      assert.ok(
        existsSync(absShot) || shot.bytes > 0,
        `screenshot missing: rel=${shot.path} abs=${absShot} bytes=${shot.bytes}`,
      );
      assert.ok(shot.bytes > 100, `screenshot too small: ${shot.bytes}`);

      // Fail-closed: act without matching snapshotId.
      const stale = JSON.parse(
        await svc.runTool(
          {
            action: "act",
            kind: "click",
            ref: snap.snapshot.elements[0]?.ref ?? "1",
            snapshotId: "s-stale",
          },
          opts,
        ),
      ) as { error?: string };
      assert.equal(stale.error, "stale_snapshot");

      // If snapshot has a clickable link/button, click with matching snapshotId.
      const clickable = snap.snapshot.elements.find(
        (e) =>
          e.role === "link" ||
          e.role === "button" ||
          /more|iana|information|learn/i.test(String(e.name ?? "")),
      );
      if (clickable?.ref) {
        const acted = JSON.parse(
          await svc.runTool(
            {
              action: "act",
              kind: "click",
              ref: clickable.ref,
              snapshotId: snap.snapshotId,
              verify: "text",
            },
            opts,
          ),
        ) as { ok?: boolean; error?: string; url?: string };
        if (!acted.error) {
          assert.equal(acted.ok, true);
        }
      }

      const status = JSON.parse(await svc.runTool({ action: "status" }, opts)) as {
        managedEngine?: string;
        effectiveManagedEngine?: string;
        session?: { managedEngine?: string } | null;
      };
      assert.equal(status.managedEngine, "obscura");
      assert.equal(status.effectiveManagedEngine, "obscura");
      assert.equal(status.session?.managedEngine, "obscura");
    } finally {
      await svc.runTool({ action: "stop" }, opts).catch(() => undefined);
    }
  });
});

test("V-OUT-32 real flow: navigate between public pages under Obscura", async (t) => {
  const binary = await requireBinary(t);
  if (!binary) return;

  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-nav-"));
  dirs.push(stateDir);

  await withObscuraEnv(binary, async () => {
    const svc = new BrowserControlService(homePaths(stateDir));
    await svc.load();
    await svc.setConfig({ enabled: true, managedEngine: "obscura" });
    const opts = {
      accountId: "alice",
      origin: "attended" as const,
      ownerAccountId: "alice",
    };
    try {
      try {
        await svc.runTool({ action: "open", url: "https://example.com/" }, opts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isSoftNetworkFailure(msg)) {
          t.skip(`navigate soft-skip: ${msg.slice(0, 160)}`);
          return;
        }
        throw err;
      }
      const nav = JSON.parse(
        await svc.runTool(
          { action: "navigate", url: "https://www.iana.org/domains/reserved" },
          opts,
        ),
      ) as { url?: string };
      assert.match(String(nav.url ?? ""), /iana\.org/i);

      const text = JSON.parse(await svc.runTool({ action: "text" }, opts)) as {
        text: string;
      };
      assert.match(text.text, /iana|reserved|domain/i);
    } finally {
      await svc.runTool({ action: "stop" }, opts).catch(() => undefined);
    }
  });
});

test("V-OUT-31/34 real flow: web_search provider=browser via Obscura HTML", async (t) => {
  const binary = await requireBinary(t);
  if (!binary) return;

  __resetBrowserSerpGatesForTests();
  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-ws-browser-"));
  dirs.push(stateDir);
  const fixture = await listenHtmlFixture(BING_SERP_FIXTURE);

  try {
    await withObscuraEnv(binary, async () => {
      await withPrivateNetworkFetch(async () => {
        const svc = new WebSearchService(homePaths(stateDir));
        await svc.load();
        await svc.setConfig({
          enabled: true,
          provider: "browser",
          serpBrowserEngine: "obscura",
          browserEngines: ["bing"],
          fallback: "none",
        });
        const pub = await svc.getPublicConfig();
        assert.equal(pub.serpBrowserEngine, "obscura");
        assert.equal(pub.effectiveSerpBrowserEngine, "obscura");
        assert.equal(pub.obscuraRuntime, "ready");

        const out = JSON.parse(
          await svc.runSearch(
            { query: "example domain", count: 5 },
            {
              origin: "attended",
              authorizeBrowserFallback: async () => true,
              browserFetchHtml: async (_u, timeoutMs) =>
                runObscuraFetchHtml(fixture.url, timeoutMs, { binary }),
            },
          ),
        ) as {
          provider?: string;
          engine?: string;
          results: Array<{ url: string; title: string }>;
        };
        assert.equal(out.provider, "browser");
        assert.equal(out.engine, "bing");
        assert.equal(out.results[0]!.url, "https://example.com/");
        assert.match(out.results[0]!.title, /Example Domain/i);
      });
    });
  } finally {
    await fixture.close();
  }
});

test("V-OUT-30 real flow: web_extract via Obscura backend (example.com)", async (t) => {
  const binary = await requireBinary(t);
  if (!binary) return;

  await withObscuraEnv(binary, async () => {
    let out: {
      backend?: string;
      markdown?: string;
      chars?: number;
      error?: string;
      title?: string;
    };
    try {
      out = JSON.parse(
        await runWebExtract(
          { url: "https://example.com/", maxChars: 8_000 },
          { backend: "obscura" },
        ),
      ) as typeof out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isSoftNetworkFailure(msg)) {
        t.skip(`web_extract soft-skip: ${msg.slice(0, 160)}`);
        return;
      }
      throw err;
    }
    assert.equal(out.backend, "obscura");
    if (out.error === "captcha_or_block" || out.error === "timeout") {
      assert.equal(out.chars ?? 0, 0);
      return;
    }
    assert.ok(!out.error, JSON.stringify(out));
    assert.ok((out.chars ?? 0) > 20);
    assert.match(String(out.markdown ?? ""), /example/i);
  });
});

test("V-OUT-29/30/34 real flow: web_research dig with Obscura extract", async (t) => {
  const binary = await requireBinary(t);
  if (!binary) return;

  __resetBrowserSerpGatesForTests();
  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-research-"));
  dirs.push(stateDir);
  const fixture = await listenHtmlFixture(BING_SERP_FIXTURE);

  try {
    await withObscuraEnv(binary, async () => {
      await withPrivateNetworkFetch(async () => {
        const svc = new WebSearchService(homePaths(stateDir));
        await svc.load();
        await svc.setConfig({
          enabled: true,
          researchEnabled: true,
          digDepth: 2,
          extractBackend: "obscura",
          serpBrowserEngine: "obscura",
          provider: "browser",
          browserEngines: ["bing"],
          fallback: "none",
        });
        const pub = await svc.getPublicConfig();
        assert.equal(pub.researchEnabled, true);
        assert.equal(pub.extractBackend, "obscura");
        assert.equal(pub.effectiveExtractBackend, "obscura");
        assert.equal(pub.obscuraRuntime, "ready");

        let research: {
          digDepth?: number;
          extractBackend?: string;
          links?: Array<{ url: string }>;
          extracts?: Array<{
            url: string;
            markdown?: string;
            chars?: number;
            error?: string;
            backend?: string;
          }>;
          organized?: string;
        };
        try {
          research = JSON.parse(
            await svc.runResearch(
              { query: "example domain", digDepth: 2 },
              {
                origin: "attended",
                authorizeBrowserFallback: async () => true,
                browserFetchHtml: async (_u, timeoutMs) =>
                  runObscuraFetchHtml(fixture.url, timeoutMs, { binary }),
                extractBackend: "obscura",
              },
            ),
          ) as typeof research;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (isSoftNetworkFailure(msg)) {
            t.skip(`web_research soft-skip: ${msg.slice(0, 160)}`);
            return;
          }
          throw err;
        }

        assert.equal(research.digDepth, 2);
        assert.equal(research.extractBackend, "obscura");
        assert.ok((research.links?.length ?? 0) >= 1);
        assert.ok((research.extracts?.length ?? 0) >= 1);
        assert.ok(String(research.organized ?? "").length > 10);

        // At least one dig should succeed via real Obscura against public https.
        const okDig = (research.extracts ?? []).filter(
          (e) => e.backend === "obscura" && !e.error && (e.chars ?? 0) > 10,
        );
        const softDig = (research.extracts ?? []).filter(
          (e) =>
            e.error === "captcha_or_block" ||
            e.error === "timeout" ||
            /ssrf|refused/i.test(String(e.error ?? "")),
        );
        assert.ok(
          okDig.length >= 1 || softDig.length === (research.extracts?.length ?? 0),
          `expected Obscura dig success or soft network fail: ${JSON.stringify(research.extracts)}`,
        );
        if (okDig.length >= 1) {
          assert.match(String(okDig[0]!.markdown ?? ""), /example|iana|domain/i);
        }
      });
    });
  } finally {
    await fixture.close();
  }
});

test("V-OUT-34 real flow: research auto dig prefers Obscura when ready", async (t) => {
  const binary = await requireBinary(t);
  if (!binary) return;

  __resetBrowserSerpGatesForTests();
  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-auto-dig-"));
  dirs.push(stateDir);
  const fixture = await listenHtmlFixture(BING_SERP_FIXTURE);

  try {
    await withObscuraEnv(binary, async () => {
      await withPrivateNetworkFetch(async () => {
        const svc = new WebSearchService(homePaths(stateDir));
        await svc.load();
        await svc.setConfig({
          enabled: true,
          researchEnabled: true,
          digDepth: 1,
          extractBackend: "auto",
          serpBrowserEngine: "obscura",
          provider: "browser",
          browserEngines: ["bing"],
        });
        const pub = await svc.getPublicConfig();
        assert.equal(pub.extractBackend, "auto");
        assert.equal(pub.effectiveExtractBackend, "obscura");

        const research = JSON.parse(
          await svc.runResearch(
            { query: "example", digDepth: 1 },
            {
              origin: "attended",
              authorizeBrowserFallback: async () => true,
              browserFetchHtml: async (_u, timeoutMs) =>
                runObscuraFetchHtml(fixture.url, timeoutMs, { binary }),
            },
          ),
        ) as {
          extractBackend?: string;
          extracts?: Array<{ backend?: string; error?: string; chars?: number }>;
        };
        assert.equal(research.extractBackend, "obscura");
        assert.ok((research.extracts?.length ?? 0) >= 1);
        assert.equal(research.extracts![0]!.backend, "obscura");
      });
    });
  } finally {
    await fixture.close();
  }
});

test("V-OUT-31 real flow: Obscura SERP engine empty→soft parse without crash", async (t) => {
  const binary = await requireBinary(t);
  if (!binary) return;

  __resetBrowserSerpGatesForTests();
  const empty = await listenHtmlFixture("<html><body>no organic results</body></html>");
  try {
    await withObscuraEnv(binary, async () => {
      await withPrivateNetworkFetch(async () => {
        const out = await runBrowserSerpFallback({
          query: "q",
          count: 3,
          engines: ["bing"],
          serpBrowserEngine: "obscura",
          fetchHtml: async (_u, timeoutMs) =>
            runObscuraFetchHtml(empty.url, timeoutMs, { binary }),
        });
        assert.equal(out.results.length, 0);
        assert.ok(
          out.code === "parse_empty" || out.code === "captcha_or_block",
          JSON.stringify(out),
        );
      });
    });
  } finally {
    await empty.close();
  }
});
