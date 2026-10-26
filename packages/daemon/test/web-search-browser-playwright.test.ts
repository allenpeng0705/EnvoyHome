// V-OUT-7 — real Playwright/Chromium SERP path (skip when Chromium missing).
// Uses a local HTML fixture so CI hosts without Bing/Google access still validate launch+parse.
// Optional network SERP: ENVOYHOME_LIVE_BROWSER_SERP=1.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { WebSearchService } from "../dist/web-search.js";
import {
  __resetBrowserSerpGatesForTests,
  probeBrowserRuntime,
  runBrowserSerpFallback,
} from "../dist/web-search-browser.js";
import { homePaths } from "../dist/home-paths.js";

const dirs: string[] = [];

after(async () => {
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
});

const BING_FIXTURE = `<!DOCTYPE html><html><body>
<li class="b_algo">
  <h2><a href="https://fixture.example/envoyhome">EnvoyHome fixture hit</a></h2>
  <div class="b_caption"><p>Local Chromium SERP fixture for V-OUT-7.</p></div>
</li>
</body></html>`;

const GOOGLE_FIXTURE = `<!DOCTYPE html><html><body>
<div class="g">
  <a href="https://fixture.example/envoymesh"><h3>EnvoyMesh fixture hit</h3></a>
  <div data-sncf="1">Google-shaped local fixture.</div>
</div>
</body></html>`;

const CAPTCHA_FIXTURE = `<!DOCTYPE html><html><body>
unusual traffic from your computer system
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
    url: `http://127.0.0.1:${addr.port}/serp`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Same shape as defaultPlaywrightFetchHtml, but against a caller-chosen URL. */
async function chromiumFetchUrl(url: string, timeoutMs: number): Promise<string> {
  const pw = await import("playwright");
  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await new Promise((r) => setTimeout(r, 200));
    return await page.content();
  } finally {
    await browser.close().catch(() => undefined);
  }
}

test("V-OUT-7 Chromium: probeBrowserRuntime reports ready or missing", async () => {
  const probe = await probeBrowserRuntime();
  assert.ok(probe.status === "ready" || probe.status === "missing");
  assert.match(probe.installHint, /playwright install chromium/);
});

test("V-OUT-7 Chromium: launch + parse local Bing fixture", async (t) => {
  const probe = await probeBrowserRuntime();
  if (probe.status !== "ready") {
    t.skip(`Chromium missing — ${probe.installHint}`);
    return;
  }
  __resetBrowserSerpGatesForTests();
  const fixture = await listenFixture(BING_FIXTURE);
  try {
    const out = await runBrowserSerpFallback({
      query: "EnvoyHome",
      count: 5,
      engines: ["bing"],
      fetchHtml: async (_serpUrl, timeoutMs) => chromiumFetchUrl(fixture.url, timeoutMs),
    });
    assert.equal(out.engine, "bing");
    assert.ok(out.results.length >= 1, JSON.stringify(out));
    assert.equal(out.results[0]!.url, "https://fixture.example/envoyhome");
    assert.match(out.results[0]!.title, /EnvoyHome fixture/i);
  } finally {
    await fixture.close();
  }
});

test("V-OUT-7 Chromium: Bing empty fixture → Google fixture via Playwright", async (t) => {
  const probe = await probeBrowserRuntime();
  if (probe.status !== "ready") {
    t.skip(`Chromium missing — ${probe.installHint}`);
    return;
  }
  __resetBrowserSerpGatesForTests();
  const empty = await listenFixture("<html><body>no organic</body></html>");
  const google = await listenFixture(GOOGLE_FIXTURE);
  try {
    const order: string[] = [];
    const out = await runBrowserSerpFallback({
      query: "EnvoyMesh",
      count: 3,
      engines: ["bing", "google"],
      fetchHtml: async (serpUrl, timeoutMs) => {
        order.push(serpUrl);
        const target = /bing\.com/i.test(serpUrl) ? empty.url : google.url;
        return chromiumFetchUrl(target, timeoutMs);
      },
    });
    assert.ok(order[0]?.includes("bing.com"));
    assert.ok(order[1]?.includes("google.com"));
    assert.equal(out.engine, "google");
    assert.equal(out.results[0]!.url, "https://fixture.example/envoymesh");
  } finally {
    await empty.close();
    await google.close();
  }
});

test("V-OUT-7 Chromium: captcha fixture soft-fails without inventing hits", async (t) => {
  const probe = await probeBrowserRuntime();
  if (probe.status !== "ready") {
    t.skip(`Chromium missing — ${probe.installHint}`);
    return;
  }
  __resetBrowserSerpGatesForTests();
  const fixture = await listenFixture(CAPTCHA_FIXTURE);
  try {
    const out = await runBrowserSerpFallback({
      query: "blocked",
      count: 3,
      engines: ["bing"],
      fetchHtml: async (_u, timeoutMs) => chromiumFetchUrl(fixture.url, timeoutMs),
    });
    assert.equal(out.results.length, 0);
    assert.equal(out.code, "captcha_or_block");
  } finally {
    await fixture.close();
  }
});

test("V-OUT-7 Chromium: WebSearchService empty primary → browser fallback via Playwright", async (t) => {
  const probe = await probeBrowserRuntime();
  if (probe.status !== "ready") {
    t.skip(`Chromium missing — ${probe.installHint}`);
    return;
  }
  __resetBrowserSerpGatesForTests();
  const stateDir = await mkdtemp(join(tmpdir(), "eh-ws-pw-"));
  dirs.push(stateDir);
  const svc = new WebSearchService(homePaths(stateDir));
  await svc.load();
  await svc.setConfig({ fallback: "browser", enabled: true });
  // Force empty primary (DuckDuckGo HTML with no result__a).
  svc.fetchImpl = (async () =>
    new Response("<html><body>no hits</body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    })) as typeof fetch;

  const fixture = await listenFixture(BING_FIXTURE);
  try {
    const out = JSON.parse(
      await svc.runSearch(
        { query: "EnvoyHome playwright", count: 5 },
        {
          origin: "attended",
          authorizeBrowserFallback: async () => true,
          browserFetchHtml: async (_serpUrl, timeoutMs) =>
            chromiumFetchUrl(fixture.url, timeoutMs),
        },
      ),
    ) as {
      fallback?: string;
      engine?: string;
      results: Array<{ url: string; title: string }>;
    };
    assert.equal(out.fallback, "browser");
    assert.equal(out.engine, "bing");
    assert.equal(out.results[0]!.url, "https://fixture.example/envoyhome");
  } finally {
    await fixture.close();
  }
});

test("V-OUT-7 Chromium: runtime_missing when fetchHtml omitted and Chromium gone", async (t) => {
  // Only meaningful when Chromium is missing; when ready, assert the happy path already covered.
  const probe = await probeBrowserRuntime();
  if (probe.status === "ready") {
    t.skip("Chromium is installed on this host — covered by launch tests above");
    return;
  }
  __resetBrowserSerpGatesForTests();
  const out = await runBrowserSerpFallback({
    query: "q",
    count: 3,
    engines: ["bing"],
    // no fetchHtml → default Playwright path → runtime_missing
  });
  assert.equal(out.code, "runtime_missing");
  assert.match(out.error ?? "", /playwright install chromium/i);
});

test("V-OUT-7 Chromium live Bing SERP (opt-in network)", async (t) => {
  if ((process.env.ENVOYHOME_LIVE_BROWSER_SERP ?? "").trim() !== "1") {
    t.skip("set ENVOYHOME_LIVE_BROWSER_SERP=1 to hit real Bing via Chromium");
    return;
  }
  const probe = await probeBrowserRuntime();
  if (probe.status !== "ready") {
    t.skip(`Chromium missing — ${probe.installHint}`);
    return;
  }
  __resetBrowserSerpGatesForTests();
  const out = await runBrowserSerpFallback({
    query: "Open Source Foundation",
    count: 5,
    engines: ["bing"],
    // real defaultPlaywrightFetchHtml (no fetchHtml override)
  });
  // Soft: CAPTCHA/block is allowed; inventing zero with parse_empty is ok; crashes are not.
  if (out.code === "captcha_or_block" || out.code === "parse_empty" || out.code === "timeout") {
    assert.equal(out.results.length, 0);
    return;
  }
  assert.ok(out.results.length >= 1, JSON.stringify(out));
  assert.match(out.results[0]!.url, /^https?:\/\//i);
});
