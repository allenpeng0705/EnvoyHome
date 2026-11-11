// V-OUT-28 / V-OUT-29 — web_extract + web_research (Design §9.5f.2 / §9.5f.3).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  htmlToReadableMarkdown,
  looksBlockedHtml,
  runWebExtract,
} from "../dist/web-extract.js";
import { WebSearchService } from "../dist/web-search.js";
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
  const stateDir = await mkdtemp(join(tmpdir(), "eh-webresearch-"));
  dirs.push(stateDir);
  const svc = new WebSearchService(homePaths(stateDir));
  await svc.load();
  return svc;
}

test("V-OUT-28: htmlToReadableMarkdown extracts article body", () => {
  const html = `
    <html><head><title>Hello World</title></head>
    <body><nav>skip</nav>
    <article><h1>Hello World</h1><p>This is a long enough paragraph for extraction tests about EnvoyHome.</p>
    <p>Second paragraph with <a href="https://example.com/x">a link</a>.</p></article>
    </body></html>`;
  const { markdown } = htmlToReadableMarkdown(html, 5000);
  assert.match(markdown, /Hello World/);
  assert.match(markdown, /EnvoyHome/);
  assert.match(markdown, /example\.com\/x/);
});

test("V-OUT-28: looksBlockedHtml catches captcha pages", () => {
  assert.equal(looksBlockedHtml("<html><body>Please complete the captcha</body></html>"), true);
  assert.equal(looksBlockedHtml("<html><body>recaptcha challenge-platform</body></html>"), true);
  assert.equal(looksBlockedHtml("<html><body><article><p>Normal article text here</p></article></body></html>"), false);
  // Vague copy alone must not false-positive ordinary pages.
  assert.equal(looksBlockedHtml("<html><body>Your attention required for checkout</body></html>"), false);
});

test("V-OUT-28: runWebExtract refuses non-https / SSRF", async () => {
  await assert.rejects(
    () => runWebExtract({ url: "http://example.com/" }),
    /ssrf_refused|https/i,
  );
  await assert.rejects(
    () => runWebExtract({ url: "https://127.0.0.1/" }),
    /ssrf_refused/i,
  );
});

test("V-OUT-28: runWebExtract returns markdown via inject fetch", async () => {
  const html = `<!doctype html><html><head><title>Page Title</title></head>
    <body><main><h1>Page Title</h1><p>${"Word ".repeat(40)}</p></main></body></html>`;
  const out = JSON.parse(
    await runWebExtract(
      { url: "https://example.com/page", maxChars: 5000 },
      {
        fetchImpl: async () =>
          new Response(html, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
      },
    ),
  ) as { title?: string; markdown: string; chars: number; error?: string };
  assert.equal(out.error, undefined);
  assert.equal(out.title, "Page Title");
  assert.ok(out.chars > 20);
  assert.match(out.markdown, /Page Title/);
});

test("V-OUT-28: soft-fail captcha page", async () => {
  const out = JSON.parse(
    await runWebExtract(
      { url: "https://example.com/blocked" },
      {
        fetchImpl: async () =>
          new Response("<html><body>recaptcha challenge</body></html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
      },
    ),
  ) as { error?: string; markdown: string };
  assert.equal(out.error, "captcha_or_block");
  assert.equal(out.markdown, "");
});

test("V-OUT-29: research disabled by default; catalogue unavailable", async () => {
  const svc = await freshService();
  const pub = await svc.getPublicConfig();
  assert.equal(pub.researchEnabled, false);
  assert.equal(pub.digDepth, 3);
  assert.equal(svc.researchReadyInfo().ok, false);

  const stateDir = dirs[dirs.length - 1]!;
  const logger = new DaemonLogger();
  const devices = new DeviceCredentialStore();
  const bindings = new BindingStore(stateDir, devices);
  const channels = new ChannelService({ stateDir, bindings, logger });
  const skills = new SkillService(homePaths(stateDir));
  const tools = await listWorkflowTools({ skills, channels, webSearch: svc });
  const research = tools.find((t) => t.name === "web_research");
  const extract = tools.find((t) => t.name === "web_extract");
  assert.equal(research?.available, false);
  assert.equal(extract?.available, true);
});

test("V-OUT-29: web_research digs top N and returns organized + links", async () => {
  const svc = await freshService();
  await svc.setConfig({ researchEnabled: true, digDepth: 2, fallback: "none" });
  svc.fetchImpl = (async () =>
    new Response(
      `<html><body>
        <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fa.example%2Fone">One</a>
        <a class="result__snippet">Desc one</a>
        <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fb.example%2Ftwo">Two</a>
        <a class="result__snippet">Desc two</a>
      </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html" } },
    )) as typeof fetch;

  const pages: Record<string, string> = {
    "https://a.example/one": `<html><head><title>One</title></head><body><article><h1>One</h1><p>${"Alpha ".repeat(30)}</p></article></body></html>`,
    "https://b.example/two": `<html><head><title>Two</title></head><body><article><h1>Two</h1><p>${"Beta ".repeat(30)}</p></article></body></html>`,
  };

  const out = JSON.parse(
    await svc.runResearch(
      { query: "test topic", count: 5 },
      {
        extractFetch: async (url) => {
          const body = pages[url] ?? "<html><body>missing</body></html>";
          return new Response(body, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        },
      },
    ),
  ) as {
    organized: string;
    links: Array<{ url: string }>;
    extracts?: Array<{ url: string; markdown: string }>;
    digDepth: number;
  };

  assert.equal(out.digDepth, 2);
  assert.ok(out.links.length >= 2);
  assert.match(out.organized, /Research: test topic/);
  assert.match(out.organized, /Summary from top sources|Alpha|One/i);
  assert.ok((out.extracts?.length ?? 0) >= 1);
});

test("V-OUT-29: web_research refuses when researchEnabled false", async () => {
  const svc = await freshService();
  await assert.rejects(
    () => svc.runResearch({ query: "x" }),
    /tool_unavailable|disabled/i,
  );
});

test("V-OUT-28: runWebExtract uses og:title when content precedes property", async () => {
  const html = `<!doctype html><html><head>
    <meta content="OG Content First" property="og:title" />
    </head><body><main><h1>H</h1><p>${"Word ".repeat(40)}</p></main></body></html>`;
  const out = JSON.parse(
    await runWebExtract(
      { url: "https://example.com/og" },
      {
        fetchImpl: async () =>
          new Response(html, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
      },
    ),
  ) as { title?: string };
  assert.equal(out.title, "OG Content First");
});

test("V-OUT-28: not_html soft-fail", async () => {
  const out = JSON.parse(
    await runWebExtract(
      { url: "https://example.com/api.json" },
      {
        fetchImpl: async () =>
          new Response("{}", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      },
    ),
  ) as { error?: string };
  assert.equal(out.error, "not_html");
});

test("V-OUT-28: result JSON truncated under cap", async () => {
  const big = "x".repeat(50_000);
  const html = `<html><body><article><p>${big}</p></article></body></html>`;
  const text = await runWebExtract(
    { url: "https://example.com/big", maxChars: 40_000 },
    {
      fetchImpl: async () =>
        new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    },
  );
  assert.ok(text.length <= 20_000);
  const out = JSON.parse(text) as { truncated?: boolean; chars: number };
  assert.equal(out.truncated, true);
  assert.ok(out.chars <= 20_000);
});

test("V-OUT-29: digDepth clamp via setConfig; soft-fail one extract keeps links", async () => {
  const svc = await freshService();
  await svc.setConfig({
    researchEnabled: true,
    digDepth: 99,
    fallback: "none",
  });
  const pub = await svc.getPublicConfig();
  assert.equal(pub.digDepth, 10);

  await svc.setConfig({ digDepth: 2 });
  svc.fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        web: {
          results: [
            { title: "Good", url: "https://a.example/ok", description: "ok" },
            { title: "Bad", url: "https://b.example/fail", description: "fail" },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
  await svc.setConfig({ provider: "brave", apiKey: "k" });

  const out = JSON.parse(
    await svc.runResearch(
      { query: "q", digDepth: 2 },
      {
        extractFetch: async (url) => {
          if (url.includes("fail")) {
            return new Response("<html><body>recaptcha challenge</body></html>", {
              status: 200,
              headers: { "Content-Type": "text/html" },
            });
          }
          return new Response(
            `<html><head><title>Good</title></head><body><article><h1>Good</h1><p>${"Alpha ".repeat(25)}</p></article></body></html>`,
            { status: 200, headers: { "Content-Type": "text/html" } },
          );
        },
      },
    ),
  ) as {
    links: unknown[];
    extracts?: Array<{ error?: string; markdown: string }>;
    organized: string;
  };
  assert.equal(out.links.length, 2);
  assert.ok(out.extracts?.some((e) => e.error === "captcha_or_block"));
  assert.ok(out.extracts?.some((e) => e.markdown.includes("Alpha") || e.markdown.length > 10));
  assert.match(out.organized, /Summary from top sources|Good|Alpha/);
});

test("V-OUT-29: SSRF dig URL soft-fails without aborting research", async () => {
  const svc = await freshService();
  await svc.setConfig({
    researchEnabled: true,
    digDepth: 1,
    provider: "brave",
    apiKey: "k",
    fallback: "none",
  });
  svc.fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        web: {
          results: [
            { title: "Local", url: "https://127.0.0.1/secret", description: "nope" },
            { title: "Public", url: "https://ok.example/p", description: "ok" },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  const out = JSON.parse(
    await svc.runResearch(
      { query: "q", digDepth: 2 },
      {
        extractFetch: async (url) => {
          if (url.includes("127.0.0.1")) {
            throw new Error("should not be called for SSRF url — runWebExtract throws first");
          }
          return new Response(
            `<html><body><article><p>${"Public ".repeat(30)}</p></article></body></html>`,
            { status: 200, headers: { "Content-Type": "text/html" } },
          );
        },
      },
    ),
  ) as { extracts?: Array<{ error?: string }>; links: unknown[] };
  assert.equal(out.links.length, 2);
  assert.ok(out.extracts?.some((e) => /ssrf|refused/i.test(e.error ?? "")));
});

test("V-OUT-30/34: extractBackend defaults auto; setConfig persists obscura", async () => {
  const svc = await freshService();
  const pub0 = await svc.getPublicConfig();
  assert.equal(pub0.extractBackend, "auto");
  assert.ok(pub0.obscuraInstallHint.length > 10);
  assert.ok(pub0.obscuraRuntime === "ready" || pub0.obscuraRuntime === "missing");
  assert.ok(
    pub0.effectiveExtractBackend === "fetch" ||
      pub0.effectiveExtractBackend === "obscura",
  );

  await svc.setConfig({ extractBackend: "obscura" });
  assert.equal(svc.extractBackend(), "obscura");
  const pub1 = await svc.getPublicConfig();
  assert.equal(pub1.extractBackend, "obscura");

  await assert.rejects(
    () => svc.setConfig({ extractBackend: "chrome" }),
    /bad_params|unknown extractBackend/i,
  );
});

test("V-OUT-30: obscura backend missing soft-fails dig; throws on standalone extract", async () => {
  const svc = await freshService();
  await svc.setConfig({
    researchEnabled: true,
    digDepth: 1,
    extractBackend: "obscura",
    provider: "brave",
    apiKey: "k",
    fallback: "none",
  });
  svc.fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        web: {
          results: [{ title: "A", url: "https://a.example/p", description: "d" }],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  // Force missing Obscura via inject that never returns markdown and soft-fail path:
  // use obscuraRunner that reports as if binary ran empty — also test softFailMissing via unset runner
  // by calling runWebExtract with softFailMissingObscura.
  const { runWebExtract } = await import("../dist/web-extract.js");
  await assert.rejects(
    () =>
      runWebExtract(
        { url: "https://example.com/x" },
        {
          backend: "obscura",
          obscuraExecFile: async () => {
            throw Object.assign(new Error("not found"), { code: "ENOENT" });
          },
        },
      ),
    /tool_unavailable|obscura/i,
  );

  const soft = JSON.parse(
    await runWebExtract(
      { url: "https://example.com/x" },
      {
        backend: "obscura",
        softFailMissingObscura: true,
        obscuraExecFile: async () => {
          throw Object.assign(new Error("not found"), { code: "ENOENT" });
        },
      },
    ),
  ) as { error?: string; backend?: string };
  assert.equal(soft.error, "obscura_missing");
  assert.equal(soft.backend, "obscura");

  const dug = JSON.parse(
    await svc.runResearch(
      { query: "q", digDepth: 1 },
      {
        extractBackend: "obscura",
        obscuraRunner: async (url) => ({
          url,
          markdown: "# From Obscura\n\n" + "Rendered ".repeat(20),
          chars: 200,
          title: "From Obscura",
          backend: "obscura",
        }),
      },
    ),
  ) as {
    extractBackend?: string;
    extracts?: Array<{ backend?: string; markdown: string }>;
    organized: string;
  };
  assert.equal(dug.extractBackend, "obscura");
  assert.ok(dug.extracts?.[0]?.markdown.includes("Rendered"));
  assert.match(dug.organized, /From Obscura|Rendered/);
});

test("V-OUT-30: obscuraRunner inject returns markdown with backend tag", async () => {
  const out = JSON.parse(
    await runWebExtract(
      { url: "https://spa.example/app" },
      {
        backend: "obscura",
        obscuraRunner: async (url, maxChars) => ({
          url,
          title: "SPA Title",
          markdown: ("# SPA Title\n\n" + "Body ".repeat(50)).slice(0, maxChars),
          chars: 200,
          backend: "obscura",
        }),
      },
    ),
  ) as { title?: string; backend?: string; markdown: string };
  assert.equal(out.backend, "obscura");
  assert.equal(out.title, "SPA Title");
  assert.match(out.markdown, /SPA Title|Body/);
});

test("V-OUT-30: truncateResultJson preserves backend", async () => {
  const out = JSON.parse(
    await runWebExtract(
      { url: "https://spa.example/big", maxChars: 40_000 },
      {
        backend: "obscura",
        obscuraRunner: async (url) => ({
          url,
          title: "Big",
          markdown: "x".repeat(50_000),
          chars: 50_000,
          backend: "obscura",
        }),
      },
    ),
  ) as { backend?: string; truncated?: boolean };
  assert.equal(out.backend, "obscura");
  assert.equal(out.truncated, true);
});
