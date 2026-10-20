// V-OUT-7 — browser SERP fallback (Design §9.5f.1).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSearchService } from "../dist/web-search.js";
import {
  __resetBrowserSerpGatesForTests,
  parseBingSerpHtml,
  parseGoogleSerpHtml,
  looksLikeCaptchaOrBlock,
  runBrowserSerpFallback,
  serpUrl,
} from "../dist/web-search-browser.js";
import { homePaths } from "../dist/home-paths.js";
import { collectDoctorIssues } from "../dist/doctor/index.js";
import { defaultConfig } from "../dist/index.js";
import { AccountStore } from "../dist/accounts.js";
import { BindingStore } from "../dist/bindings.js";
import { DeviceCredentialStore } from "../dist/auth.js";
import { ChannelService } from "../dist/channels/service.js";
import { DaemonLogger } from "../dist/logger.js";

const dirs: string[] = [];

after(async () => {
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function freshService() {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-websearch-br-"));
  dirs.push(stateDir);
  const svc = new WebSearchService(homePaths(stateDir));
  await svc.load();
  return { svc, stateDir };
}

test("V-OUT-7: default fallback is none; public config exposes runtime fields", async () => {
  const { svc } = await freshService();
  const pub = await svc.getPublicConfig();
  assert.equal(pub.fallback, "none");
  assert.equal(pub.unattendedBrowser, false);
  assert.deepEqual(pub.browserEngines, ["bing", "google"]);
  assert.ok(pub.browserRuntime === "ready" || pub.browserRuntime === "missing");
  assert.equal(pub.browserInstallHint, "npx playwright install chromium");
  assert.doesNotMatch(pub.browserInstallHint, /npm install playwright/);
});

test("V-OUT-7: serpUrl is fixed Bing then Google templates only", () => {
  assert.equal(
    serpUrl("bing", "hello world"),
    "https://www.bing.com/search?q=hello%20world",
  );
  assert.equal(
    serpUrl("google", "a&b"),
    "https://www.google.com/search?q=a%26b&hl=en",
  );
});

test("V-OUT-7: parseBingSerpHtml extracts organic hits", () => {
  const html = `
    <li class="b_algo">
      <h2><a href="https://example.com/one">One Title</a></h2>
      <div class="b_caption"><p>Snippet one</p></div>
    </li>
    <li class="b_algo">
      <h2><a href="https://example.com/two">Two</a></h2>
    </li>
  `;
  const hits = parseBingSerpHtml(html, 5);
  assert.equal(hits.length, 2);
  assert.equal(hits[0]!.url, "https://example.com/one");
  assert.equal(hits[0]!.title, "One Title");
  assert.match(hits[0]!.description, /Snippet/);
});

test("V-OUT-7: parseGoogleSerpHtml extracts organic hits", () => {
  const html = `
    <div class="g">
      <a href="https://news.example/story"><h3>Story</h3></a>
      <div data-sncf="1">About the story</div>
    </div>
    <div class="g">
      <a href="/url?q=https%3A%2F%2Fother.example%2Fx&sa=U"><h3>Other</h3></a>
    </div>
  `;
  const hits = parseGoogleSerpHtml(html, 5);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0]!.url, "https://news.example/story");
});

test("V-OUT-7: captcha/block detection", () => {
  assert.equal(looksLikeCaptchaOrBlock("<html>unusual traffic from your computer</html>"), true);
  assert.equal(looksLikeCaptchaOrBlock("<html><li class=b_algo>ok</li></html>"), false);
});

test("V-OUT-7: fallback off leaves primary error; no browser call", async () => {
  const { svc } = await freshService();
  let browserCalls = 0;
  svc.fetchImpl = (async () =>
    new Response("<html></html>", { status: 200 })) as typeof fetch;
  const out = JSON.parse(
    await svc.runSearch(
      { query: "q" },
      {
        authorizeBrowserFallback: async () => {
          browserCalls++;
          return true;
        },
        browserFetchHtml: async () => {
          browserCalls++;
          return "";
        },
      },
    ),
  ) as { fallback?: string; results: unknown[] };
  assert.equal(out.fallback, "none");
  assert.equal(browserCalls, 0);
  assert.equal(out.results.length, 0);
});

test("V-OUT-7: empty primary → Bing before Google when fallback browser", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await freshService();
  await svc.setConfig({ fallback: "browser" });
  svc.fetchImpl = (async () =>
    new Response("<html></html>", { status: 200 })) as typeof fetch;
  const order: string[] = [];
  let asks = 0;
  const out = JSON.parse(
    await svc.runSearch(
      { query: "find me" },
      {
        origin: "attended",
        authorizeBrowserFallback: async () => {
          asks++;
          return true;
        },
        browserFetchHtml: async (url) => {
          order.push(url);
          if (url.includes("bing.com")) {
            return `<li class="b_algo"><h2><a href="https://hit.example/">Hit</a></h2></li>`;
          }
          return `<div class="g"><a href="https://g.example/"><h3>G</h3></a></div>`;
        },
      },
    ),
  ) as {
    provider: string;
    fallback?: string;
    engine?: string;
    results: Array<{ url: string }>;
  };
  assert.equal(asks, 1);
  assert.equal(out.provider, "duckduckgo");
  assert.equal(out.fallback, "browser");
  assert.equal(out.engine, "bing");
  assert.equal(out.results[0]!.url, "https://hit.example/");
  assert.ok(order[0]?.includes("bing.com"));
  assert.equal(order.length, 1); // stop after Bing hit
});

test("V-OUT-7: Bing empty → Google; deny ask skips browser", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await freshService();
  await svc.setConfig({ fallback: "browser" });
  svc.fetchImpl = (async () =>
    new Response("<html></html>", { status: 200 })) as typeof fetch;

  const denied = JSON.parse(
    await svc.runSearch(
      { query: "q" },
      {
        authorizeBrowserFallback: async () => false,
        browserFetchHtml: async () => {
          throw new Error("should not run");
        },
      },
    ),
  ) as { error?: string; fallback?: string };
  assert.equal(denied.fallback, "none");
  assert.match(denied.error ?? "", /denied/i);

  __resetBrowserSerpGatesForTests();
  const order: string[] = [];
  const out = JSON.parse(
    await svc.runSearch(
      { query: "q" },
      {
        authorizeBrowserFallback: async () => true,
        browserFetchHtml: async (url) => {
          order.push(url);
          if (url.includes("bing.com")) return "<html>no results</html>";
          return `<div class="g"><a href="https://g.example/x"><h3>G</h3></a></div>`;
        },
      },
    ),
  ) as { engine?: string; results: Array<{ url: string }> };
  assert.ok(order[0]?.includes("bing.com"));
  assert.ok(order[1]?.includes("google.com"));
  assert.equal(out.engine, "google");
  assert.equal(out.results[0]!.url, "https://g.example/x");
});

test("V-OUT-7: unattended without unattendedBrowser skips fallback", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await freshService();
  await svc.setConfig({ fallback: "browser", unattendedBrowser: false });
  svc.fetchImpl = (async () =>
    new Response("<html></html>", { status: 200 })) as typeof fetch;
  let browser = 0;
  const out = JSON.parse(
    await svc.runSearch(
      { query: "q" },
      {
        origin: "unattended",
        authorizeBrowserFallback: async () => true,
        browserFetchHtml: async () => {
          browser++;
          return "";
        },
      },
    ),
  ) as { error?: string; fallback?: string };
  assert.equal(browser, 0);
  assert.equal(out.fallback, "none");
  assert.match(out.error ?? "", /unattendedBrowser/i);
});

test("V-OUT-7: rate / busy gates", async () => {
  __resetBrowserSerpGatesForTests();
  let t = 1_000_000;
  const html =
    `<li class="b_algo"><h2><a href="https://a.example/">A</a></h2></li>`;
  const first = await runBrowserSerpFallback({
    query: "q",
    count: 3,
    engines: ["bing"],
    fetchHtml: async () => html,
    now: () => t,
  });
  assert.equal(first.results.length, 1);
  const second = await runBrowserSerpFallback({
    query: "q",
    count: 3,
    engines: ["bing"],
    fetchHtml: async () => html,
    now: () => t + 1000,
  });
  assert.equal(second.code, "browser_busy");
  t += 11_000;
  const third = await runBrowserSerpFallback({
    query: "q",
    count: 3,
    engines: ["bing"],
    fetchHtml: async () => html,
    now: () => t,
  });
  assert.equal(third.results.length, 1);
});

test("V-OUT-7: empty attempt still arms rate limit", async () => {
  __resetBrowserSerpGatesForTests();
  let t = 2_000_000;
  const empty = await runBrowserSerpFallback({
    query: "q",
    count: 3,
    engines: ["bing"],
    fetchHtml: async () => "<html>no hits</html>",
    now: () => t,
  });
  assert.equal(empty.results.length, 0);
  const blocked = await runBrowserSerpFallback({
    query: "q",
    count: 3,
    engines: ["bing"],
    fetchHtml: async () => {
      throw new Error("should not run");
    },
    now: () => t + 500,
  });
  assert.equal(blocked.code, "browser_busy");
});

test("V-OUT-7: attended without approval hook fails closed", async () => {
  __resetBrowserSerpGatesForTests();
  const { svc } = await freshService();
  await svc.setConfig({ fallback: "browser" });
  svc.fetchImpl = (async () =>
    new Response("<html></html>", { status: 200 })) as typeof fetch;
  let browser = 0;
  const out = JSON.parse(
    await svc.runSearch(
      { query: "q" },
      {
        origin: "attended",
        browserFetchHtml: async () => {
          browser++;
          return `<li class="b_algo"><h2><a href="https://x.example/">X</a></h2></li>`;
        },
      },
    ),
  ) as { error?: string; fallback?: string };
  assert.equal(browser, 0);
  assert.equal(out.fallback, "none");
  assert.match(out.error ?? "", /approval hook/i);
});

test("V-OUT-7: Doctor warns when fallback on and runtime missing", async () => {
  const { svc, stateDir } = await freshService();
  await svc.setConfig({ fallback: "browser" });
  const pub = await svc.getPublicConfig();
  if (pub.browserRuntime === "ready") {
    // Host has Playwright — soft-skip warn assertion.
    return;
  }
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
    webSearch: svc,
  });
  assert.ok(issues.some((i) => i.id === "websearch.browser_runtime_missing"));
});
