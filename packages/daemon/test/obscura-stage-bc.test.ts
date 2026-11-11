// V-OUT-31 / V-OUT-32 — Stage B SERP engine + Stage C managedEngine.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSearchService } from "../dist/web-search.js";
import { BrowserControlService } from "../dist/browser-control.js";
import { homePaths } from "../dist/home-paths.js";
import { runBrowserSerpFallback } from "../dist/web-search-browser.js";

const dirs: string[] = [];

after(async () => {
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("V-OUT-31/34: serpBrowserEngine defaults auto; setConfig persists obscura", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-serp-eng-"));
  dirs.push(stateDir);
  const svc = new WebSearchService(homePaths(stateDir));
  await svc.load();
  const pub0 = await svc.getPublicConfig();
  assert.equal(pub0.serpBrowserEngine, "auto");

  await svc.setConfig({ serpBrowserEngine: "obscura" });
  const pub1 = await svc.getPublicConfig();
  assert.equal(pub1.serpBrowserEngine, "obscura");

  await assert.rejects(
    () => svc.setConfig({ serpBrowserEngine: "webkit" }),
    /bad_params|unknown serpBrowserEngine/i,
  );
});

test("V-OUT-31: obscura SERP path soft-fails when binary missing (no inject)", async () => {
  // Force missing by pointing ENVOYHOME_OBSCURA at a non-executable path briefly.
  const prev = process.env.ENVOYHOME_OBSCURA;
  process.env.ENVOYHOME_OBSCURA = join(tmpdir(), "no-such-obscura-binary");
  try {
    const out = await runBrowserSerpFallback({
      query: "test",
      count: 3,
      engines: ["bing"],
      serpBrowserEngine: "obscura",
    });
    assert.equal(out.code, "runtime_missing");
    assert.equal(out.results.length, 0);
    assert.match(out.error ?? "", /runtime_missing|Obscura|obscura/i);
  } finally {
    if (prev === undefined) delete process.env.ENVOYHOME_OBSCURA;
    else process.env.ENVOYHOME_OBSCURA = prev;
  }
});

test("V-OUT-31: obscura SERP uses inject fetchHtml regardless of engine", async () => {
  const fixture = `<html><body>
    <li class="b_algo">
      <h2><a href="https://example.com/a">Hit A</a></h2>
      <div class="b_caption"><p>Desc</p></div>
    </li>
  </body></html>`;
  // Bypass household SERP 10s rate limit from prior case (wall-clock lastBrowserAt).
  let t = Date.now() + 60_000;
  const out = await runBrowserSerpFallback({
    query: "q",
    count: 3,
    engines: ["bing"],
    serpBrowserEngine: "obscura",
    fetchHtml: async () => fixture,
    now: () => (t += 1),
  });
  assert.equal(out.error, undefined, JSON.stringify(out));
  assert.ok(out.results.length >= 1);
  assert.equal(out.engine, "bing");
  assert.match(out.results[0]!.url, /example\.com\/a/);
});

test("V-OUT-32/34: managedEngine defaults auto; setConfig persists obscura", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-managed-eng-"));
  dirs.push(stateDir);
  const svc = new BrowserControlService(homePaths(stateDir));
  await svc.load();
  const pub0 = await svc.getPublicConfig();
  assert.equal(pub0.managedEngine, "auto");
  assert.ok(pub0.obscuraInstallHint.length > 10);

  await svc.setConfig({ managedEngine: "obscura" });
  const pub1 = await svc.getPublicConfig();
  assert.equal(pub1.managedEngine, "obscura");

  await assert.rejects(
    () => svc.setConfig({ managedEngine: "firefox" }),
    /bad_params|unknown managedEngine/i,
  );
});

test("V-OUT-32 / Appendix C.5: Stage B+C Owner-select shipped; Stage E defaults auto", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-defaults-"));
  dirs.push(stateDir);
  const paths = homePaths(stateDir);
  const web = new WebSearchService(paths);
  const browser = new BrowserControlService(paths);
  await web.load();
  await browser.load();
  assert.equal((await web.getPublicConfig()).serpBrowserEngine, "auto");
  assert.equal((await browser.getPublicConfig()).managedEngine, "auto");
});

test("V-OUT-32: managedEngine switch invalidates managed test sessions", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-engine-switch-"));
  dirs.push(stateDir);
  const svc = new BrowserControlService(homePaths(stateDir));
  await svc.load();
  await svc.setConfig({ enabled: true, managedEngine: "chromium" });

  let pages = 0;
  svc.pageFactory = async () => {
    pages += 1;
    return {
      goto: async () => undefined,
      url: () => "https://example.com/",
      title: async () => "t",
      content: async () => "<html></html>",
      innerText: async () => "",
      locator: () => ({
        count: async () => 0,
        nth: () => ({
          click: async () => undefined,
          fill: async () => undefined,
          selectOption: async () => undefined,
          dragTo: async () => undefined,
          evaluate: async () => undefined,
          screenshot: async () => Buffer.alloc(0),
        }),
      }),
      evaluate: async () => [],
      screenshot: async () => Buffer.alloc(0),
      close: async () => undefined,
    };
  };

  await svc.runTool(
    { action: "open", url: "https://example.com/" },
    { accountId: "alice", origin: "attended", ownerAccountId: "alice" },
  );
  const pagesAfterChromium = pages;
  assert.ok(pagesAfterChromium >= 1, `expected pageFactory use, got ${pagesAfterChromium}`);

  await svc.setConfig({ managedEngine: "obscura" });
  // With obscura selected and pageFactory still set, ensureSession uses pageFactory but
  // must recreate because managedEngine tag changed (chromium → obscura).
  await svc.runTool(
    { action: "open", url: "https://example.com/b" },
    { accountId: "alice", origin: "attended", ownerAccountId: "alice" },
  );
  assert.ok(
    pages > pagesAfterChromium,
    "engine switch should recreate managed session (new pageFactory call)",
  );

  const status = JSON.parse(
    await svc.runTool(
      { action: "status" },
      { accountId: "alice", origin: "attended", ownerAccountId: "alice" },
    ),
  ) as { managedEngine?: string; session?: { managedEngine?: string } };
  assert.equal(status.managedEngine, "obscura");
  assert.equal(status.session?.managedEngine, "obscura");
});
