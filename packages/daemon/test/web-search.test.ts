// V-OUT-6 — web_search config, providers, caps (Design §9.5f).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WebSearchService,
  parseDuckDuckGoHtml,
  WEB_SEARCH_RESULT_JSON_MAX,
} from "../dist/web-search.js";
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

async function freshService() {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-websearch-"));
  dirs.push(stateDir);
  const svc = new WebSearchService(homePaths(stateDir));
  await svc.load();
  return svc;
}

test("V-OUT-6: default DuckDuckGo is ready without a key", async () => {
  const svc = await freshService();
  const pub = await svc.getPublicConfig();
  assert.equal(pub.enabled, true);
  assert.equal(pub.provider, "duckduckgo");
  assert.equal(pub.ready, true);
  assert.equal(pub.hasApiKey, false);
});

test("V-OUT-6: Brave/Tavily without key are unavailable", async () => {
  const svc = await freshService();
  await svc.setConfig({ provider: "brave" });
  let pub = await svc.getPublicConfig();
  assert.equal(pub.ready, false);
  assert.match(pub.unavailableReason ?? "", /Brave/i);

  await svc.setConfig({ provider: "tavily", apiKey: "tvly-test" });
  pub = await svc.getPublicConfig();
  assert.equal(pub.ready, true);
  assert.equal(pub.hasApiKey, true);
  assert.equal(pub.provider, "tavily");
});

test("V-OUT-6: disabled → unavailable", async () => {
  const svc = await freshService();
  await svc.setConfig({ enabled: false });
  assert.equal(svc.readyInfo().ok, false);
});

test("V-OUT-6: parseDuckDuckGoHtml extracts result links", () => {
  const html = `
    <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">Example Title</a>
    <a class="result__snippet">A short description here.</a>
    <a class="result__a" href="https://other.example/path">Other</a>
  `;
  const hits = parseDuckDuckGoHtml(html, 5);
  assert.equal(hits.length, 2);
  assert.equal(hits[0]!.url, "https://example.com/page");
  assert.equal(hits[0]!.title, "Example Title");
});

test("V-OUT-6: Brave mock fetch returns normalized rows", async () => {
  const svc = await freshService();
  await svc.setConfig({ provider: "brave", apiKey: "brave-key" });
  svc.fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        web: {
          results: [
            { title: "One", url: "https://a.example/", description: "d1" },
            { title: "Two", url: "https://b.example/", description: "d2" },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
  const out = JSON.parse(await svc.runSearch({ query: "hello", count: 5 })) as {
    provider: string;
    results: Array<{ title: string; url: string }>;
  };
  assert.equal(out.provider, "brave");
  assert.equal(out.results.length, 2);
  assert.equal(out.results[0]!.url, "https://a.example/");
});

test("V-OUT-6: result JSON is capped", async () => {
  const svc = await freshService();
  await svc.setConfig({ provider: "brave", apiKey: "k" });
  const big = "x".repeat(8000);
  svc.fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        web: {
          results: Array.from({ length: 20 }, (_, i) => ({
            title: `T${i}`,
            url: `https://example.com/${i}`,
            description: big,
          })),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
  const text = await svc.runSearch({ query: "q", count: 10 });
  assert.ok(text.length <= WEB_SEARCH_RESULT_JSON_MAX);
  const parsed = JSON.parse(text) as { error?: string; results: unknown[] };
  assert.ok(parsed.results.length < 10);
  assert.match(parsed.error ?? "", /truncat/i);
});

test("V-OUT-6: catalogue marks web_search available for default DDG", async () => {
  const svc = await freshService();
  const stateDir = dirs[dirs.length - 1]!;
  const logger = new DaemonLogger();
  const devices = new DeviceCredentialStore();
  const bindings = new BindingStore(stateDir, devices);
  const channels = new ChannelService({ stateDir, bindings, logger });
  const skills = new SkillService(homePaths(stateDir));
  const tools = await listWorkflowTools({ skills, channels, webSearch: svc });
  const row = tools.find((t) => t.name === "web_search");
  assert.ok(row);
  assert.equal(row!.available, true);
  assert.equal(row!.risk, "network");
});

test("V-OUT-6: catalogue unavailable when Brave has no key", async () => {
  const svc = await freshService();
  await svc.setConfig({ provider: "brave" });
  const stateDir = dirs[dirs.length - 1]!;
  const logger = new DaemonLogger();
  const devices = new DeviceCredentialStore();
  const bindings = new BindingStore(stateDir, devices);
  const channels = new ChannelService({ stateDir, bindings, logger });
  const skills = new SkillService(homePaths(stateDir));
  const tools = await listWorkflowTools({ skills, channels, webSearch: svc });
  const row = tools.find((t) => t.name === "web_search");
  assert.equal(row?.available, false);
});
