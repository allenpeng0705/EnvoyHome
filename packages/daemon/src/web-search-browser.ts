// Opt-in headless SERP fallback — Design §9.5f.1 / V-OUT-7.
// Playwright is optional; probe + dynamic import so the daemon runs without it.

import { existsSync } from "node:fs";
import type { WebSearchHit } from "./web-search.js";

export type BrowserSerpEngine = "bing" | "google";

export const BROWSER_SERP_TIMEOUT_MS = 20_000;
export const BROWSER_SERP_MAX_HITS = 8;
export const BROWSER_SERP_RATE_MS = 10_000;

export type BrowserRuntimeStatus = "ready" | "missing";

/**
 * Owner-facing one-liner (copyable). The npm `playwright` driver is a daemon
 * dependency; Owners only download Chromium browsers — Design §9.5f.1.
 * Run on the **daemon host** (not a phone UI).
 */
export function browserInstallHint(): string {
  return "npx playwright install chromium";
}

/** Probe optional Playwright + Chromium (no launch). */
export async function probeBrowserRuntime(): Promise<{
  status: BrowserRuntimeStatus;
  installHint: string;
}> {
  const hint = browserInstallHint();
  try {
    const pw = await import("playwright").catch(() => null);
    if (!pw?.chromium) {
      return { status: "missing", installHint: hint };
    }
    // executablePath throws if browsers not installed.
    const path = pw.chromium.executablePath();
    if (!path || typeof path !== "string" || !existsSync(path)) {
      return { status: "missing", installHint: hint };
    }
    return { status: "ready", installHint: hint };
  } catch {
    return { status: "missing", installHint: hint };
  }
}

export function serpUrl(engine: BrowserSerpEngine, query: string): string {
  const q = encodeURIComponent(query);
  if (engine === "google") {
    return `https://www.google.com/search?q=${q}&hl=en`;
  }
  return `https://www.bing.com/search?q=${q}`;
}

/** Exported for fixture tests. */
export function parseBingSerpHtml(html: string, count: number): WebSearchHit[] {
  const results: WebSearchHit[] = [];
  // Bing organic: <li class="b_algo"> … <h2><a href>
  const blocks = html.matchAll(
    /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
  );
  for (const block of blocks) {
    if (results.length >= count) break;
    const chunk = block[1] ?? "";
    const am = chunk.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!am) continue;
    const url = cleanHref(am[1] ?? "");
    const title = stripTags(decodeHtml(am[2] ?? "")).trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (results.some((r) => r.url === url)) continue;
    const sm = chunk.match(/class="[^"]*b_caption[^"]*"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = sm ? stripTags(decodeHtml(sm[1] ?? "")).trim().slice(0, 500) : "";
    results.push({ title: title || url, url, description });
  }
  return results;
}

/** Exported for fixture tests. */
export function parseGoogleSerpHtml(html: string, count: number): WebSearchHit[] {
  const results: WebSearchHit[] = [];
  // Classic organic: <a href="/url?q=…"> or direct https in result blocks.
  // Prefer <div class="g"> … <a href="https://…">
  const blocks = html.matchAll(/<div[^>]*class="[^"]*\bg\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*\bg\b|<\/div>|<footer|$)/gi);
  for (const block of blocks) {
    if (results.length >= count) break;
    const chunk = block[1] ?? "";
    const am =
      chunk.match(/<a[^>]+href="(https?:\/\/(?!www\.google\.)[^"]+)"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/i) ??
      chunk.match(/<a[^>]+href="\/url\?q=([^&"]+)[^"]*"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!am) continue;
    let url = cleanHref(decodeURIComponent(am[1] ?? ""));
    if (url.startsWith("http") === false && am[1]) {
      try {
        url = decodeURIComponent(am[1]);
      } catch {
        continue;
      }
    }
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (/google\.(com|[a-z.]+)\//i.test(url)) continue;
    if (results.some((r) => r.url === url)) continue;
    const title = stripTags(decodeHtml(am[2] ?? "")).trim();
    const sm = chunk.match(/<div[^>]*data-sncf="1"[^>]*>([\s\S]*?)<\/div>/i) ??
      chunk.match(/<span[^>]*class="[^"]*aCOpRe[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const description = sm ? stripTags(decodeHtml(sm[1] ?? "")).trim().slice(0, 500) : "";
    results.push({ title: title || url, url, description });
  }
  // Fallback: loose https links with h3
  if (results.length === 0) {
    const loose = html.matchAll(
      /<a[^>]+href="(https?:\/\/(?!accounts\.google|www\.google)[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi,
    );
    for (const m of loose) {
      if (results.length >= count) break;
      const url = cleanHref(m[1] ?? "");
      if (!url || results.some((r) => r.url === url)) continue;
      results.push({
        title: stripTags(decodeHtml(m[2] ?? "")).trim() || url,
        url,
        description: "",
      });
    }
  }
  return results;
}

export function looksLikeCaptchaOrBlock(html: string): boolean {
  const h = html.toLowerCase();
  return (
    h.includes("captcha") ||
    h.includes("unusual traffic") ||
    h.includes("enable javascript") ||
    h.includes("detected unusual traffic") ||
    h.includes("our systems have detected") ||
    (h.includes("challenge") && h.includes("cloudflare"))
  );
}

export type BrowserSerpResult = {
  engine?: BrowserSerpEngine;
  results: WebSearchHit[];
  error?: string;
  code?: "captcha_or_block" | "timeout" | "runtime_missing" | "browser_busy" | "parse_empty";
};

/** Injectable for tests — returns HTML for a SERP URL. */
export type BrowserFetchHtml = (url: string, timeoutMs: number) => Promise<string>;

let browserBusy = false;
let lastBrowserAt = 0;

/** Test hook. */
export function __resetBrowserSerpGatesForTests(): void {
  browserBusy = false;
  lastBrowserAt = 0;
}

/**
 * Shared household browser lock (SERP fallback + §9.5g browser tool).
 * `rateLimit` (default true) applies the §9.5f.1 SERP 10s spacing — use
 * `rateLimit: false` for the interactive `browser` tool (concurrency only).
 */
export function tryAcquireBrowserGate(
  now: (() => number) | { now?: () => number; rateLimit?: boolean } = Date.now,
): {
  ok: boolean;
  error?: string;
  code?: "browser_busy";
} {
  const opts =
    typeof now === "function" ? { now, rateLimit: true as boolean } : { now: Date.now, rateLimit: true, ...now };
  const clock = opts.now ?? Date.now;
  const rateLimit = opts.rateLimit !== false;
  if (browserBusy) {
    return { ok: false, error: "browser_busy", code: "browser_busy" };
  }
  if (rateLimit && clock() - lastBrowserAt < BROWSER_SERP_RATE_MS) {
    return {
      ok: false,
      error: "browser rate-limited (max 1 / 10s)",
      code: "browser_busy",
    };
  }
  browserBusy = true;
  if (rateLimit) lastBrowserAt = clock();
  return { ok: true };
}

export function releaseBrowserGate(): void {
  browserBusy = false;
}

export async function runBrowserSerpFallback(input: {
  query: string;
  count: number;
  engines: BrowserSerpEngine[];
  /** Override launch (tests). */
  fetchHtml?: BrowserFetchHtml;
  now?: () => number;
}): Promise<BrowserSerpResult> {
  const now = input.now ?? Date.now;
  const gate = tryAcquireBrowserGate(now);
  if (!gate.ok) {
    return {
      results: [],
      error: gate.error ?? "browser_busy",
      code: gate.code ?? "browser_busy",
    };
  }

  const count = Math.min(BROWSER_SERP_MAX_HITS, Math.max(1, input.count));
  const engines =
    input.engines.length > 0 ? input.engines : (["bing", "google"] as BrowserSerpEngine[]);

  const fetchHtml = input.fetchHtml ?? defaultPlaywrightFetchHtml;
  if (!input.fetchHtml) {
    const probe = await probeBrowserRuntime();
    if (probe.status !== "ready") {
      releaseBrowserGate();
      return {
        results: [],
        error: `runtime_missing: ${probe.installHint}`,
        code: "runtime_missing",
      };
    }
  }

  const started = now();
  try {
    let lastError = "parse_empty";
    let lastCode: BrowserSerpResult["code"] = "parse_empty";
    for (const engine of engines) {
      const remaining = BROWSER_SERP_TIMEOUT_MS - (now() - started);
      if (remaining < 2000) {
        return { results: [], error: "timeout", code: "timeout", engine };
      }
      const url = serpUrl(engine, input.query);
      let html: string;
      try {
        html = await fetchHtml(url, remaining);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/timeout|aborted/i.test(msg)) {
          return { results: [], error: "timeout", code: "timeout", engine };
        }
        lastError = msg;
        lastCode = "parse_empty";
        continue;
      }
      if (looksLikeCaptchaOrBlock(html)) {
        lastError = "captcha_or_block";
        lastCode = "captcha_or_block";
        continue;
      }
      const results =
        engine === "bing"
          ? parseBingSerpHtml(html, count)
          : parseGoogleSerpHtml(html, count);
      if (results.length > 0) {
        return { engine, results };
      }
      lastError = "parse_empty";
      lastCode = "parse_empty";
    }
    return { results: [], error: lastError, code: lastCode };
  } finally {
    releaseBrowserGate();
  }
}

async function defaultPlaywrightFetchHtml(url: string, timeoutMs: number): Promise<string> {
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
    await context.route("**/*", (route) => {
      const t = route.request().resourceType();
      if (t === "image" || t === "media" || t === "font") {
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // Brief settle for late organic nodes.
    await new Promise((r) => setTimeout(r, Math.min(1500, Math.max(200, timeoutMs / 10))));
    return await page.content();
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function cleanHref(href: string): string {
  const t = href.trim();
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
