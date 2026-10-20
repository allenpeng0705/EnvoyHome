// Household web_search — Design §9.5f / V-OUT-6 + §9.5f.1 / V-OUT-7.

import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { HomePaths } from "./home-paths.js";
import {
  probeBrowserRuntime,
  runBrowserSerpFallback,
  type BrowserFetchHtml,
  type BrowserSerpEngine,
  type BrowserRuntimeStatus,
} from "./web-search-browser.js";

export type WebSearchProviderId = "duckduckgo" | "brave" | "tavily";
export type WebSearchFallback = "none" | "browser";

export const WEB_SEARCH_PROVIDERS: readonly WebSearchProviderId[] = [
  "duckduckgo",
  "brave",
  "tavily",
] as const;

export const WEB_SEARCH_MAX_COUNT = 10;
export const WEB_SEARCH_DEFAULT_COUNT = 5;
export const WEB_SEARCH_TIMEOUT_MS = 15_000;
export const WEB_SEARCH_RESULT_JSON_MAX = 20_000;

const SECRET_FILE = "web_search_api_key.secret";
const DEFAULT_ENGINES: BrowserSerpEngine[] = ["bing", "google"];

export type WebSearchConfigFile = {
  enabled: boolean;
  provider: WebSearchProviderId;
  fallback: WebSearchFallback;
  browserEngines: BrowserSerpEngine[];
  unattendedBrowser: boolean;
  updatedAt: string;
};

export type WebSearchPublicConfig = {
  enabled: boolean;
  provider: WebSearchProviderId;
  hasApiKey: boolean;
  ready: boolean;
  fallback: WebSearchFallback;
  browserEngines: BrowserSerpEngine[];
  unattendedBrowser: boolean;
  browserRuntime: BrowserRuntimeStatus;
  browserInstallHint: string;
  unavailableReason?: string;
  updatedAt?: string;
};

export type WebSearchHit = {
  title: string;
  url: string;
  description: string;
};

export type WebSearchResult = {
  provider: WebSearchProviderId;
  results: WebSearchHit[];
  error?: string;
  fallback?: WebSearchFallback;
  engine?: BrowserSerpEngine;
};

export type RunSearchOptions = {
  origin?: "attended" | "unattended";
  /** Mid-tool ask for browser leg (Design §9.5f.1). Return false to skip. */
  authorizeBrowserFallback?: (detail: {
    engines: BrowserSerpEngine[];
  }) => Promise<boolean>;
  /** Test inject — HTML fetcher for Playwright path. */
  browserFetchHtml?: BrowserFetchHtml;
};

function isProvider(v: unknown): v is WebSearchProviderId {
  return v === "duckduckgo" || v === "brave" || v === "tavily";
}

function isFallback(v: unknown): v is WebSearchFallback {
  return v === "none" || v === "browser";
}

function isEngine(v: unknown): v is BrowserSerpEngine {
  return v === "bing" || v === "google";
}

function parseEngines(raw: unknown): BrowserSerpEngine[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_ENGINES];
  const out: BrowserSerpEngine[] = [];
  for (const e of raw) {
    if (isEngine(e) && !out.includes(e)) out.push(e);
  }
  return out.length > 0 ? out : [...DEFAULT_ENGINES];
}

function clampCount(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return WEB_SEARCH_DEFAULT_COUNT;
  return Math.min(WEB_SEARCH_MAX_COUNT, Math.max(1, Math.floor(n)));
}

function truncateResultJson(payload: WebSearchResult): string {
  const text = JSON.stringify(payload);
  if (text.length <= WEB_SEARCH_RESULT_JSON_MAX) return text;
  const trimmed: WebSearchResult = {
    provider: payload.provider,
    results: [],
    error: payload.error ?? "results truncated",
    ...(payload.fallback !== undefined ? { fallback: payload.fallback } : {}),
    ...(payload.engine !== undefined ? { engine: payload.engine } : {}),
  };
  for (const hit of payload.results) {
    const next = { ...trimmed, results: [...trimmed.results, hit] };
    if (JSON.stringify(next).length > WEB_SEARCH_RESULT_JSON_MAX - 80) break;
    trimmed.results.push(hit);
  }
  trimmed.error = "results truncated to cap";
  return JSON.stringify(trimmed);
}

function defaultConfig(): WebSearchConfigFile {
  return {
    enabled: true,
    provider: "duckduckgo",
    fallback: "none",
    browserEngines: [...DEFAULT_ENGINES],
    unattendedBrowser: false,
    updatedAt: new Date(0).toISOString(),
  };
}

export class WebSearchService {
  private cfg: WebSearchConfigFile = defaultConfig();
  private apiKey = "";
  /** Injectable fetch for tests. */
  fetchImpl: typeof fetch = fetch;

  constructor(private readonly paths: HomePaths) {}

  private secretPath(): string {
    return join(this.paths.secretsDir, SECRET_FILE);
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.paths.webSearchJson, "utf8")) as Record<
        string,
        unknown
      >;
      const provider = isProvider(raw.provider) ? raw.provider : "duckduckgo";
      this.cfg = {
        enabled: raw.enabled !== false,
        provider,
        fallback: isFallback(raw.fallback) ? raw.fallback : "none",
        browserEngines: parseEngines(raw.browserEngines),
        unattendedBrowser: raw.unattendedBrowser === true,
        updatedAt:
          typeof raw.updatedAt === "string" && raw.updatedAt
            ? raw.updatedAt
            : new Date(0).toISOString(),
      };
    } catch {
      this.cfg = defaultConfig();
    }
    try {
      this.apiKey = (await readFile(this.secretPath(), "utf8")).trim();
    } catch {
      this.apiKey = "";
    }
  }

  async getPublicConfig(): Promise<WebSearchPublicConfig> {
    const readyInfo = this.readyInfo();
    const runtime = await probeBrowserRuntime();
    const out: WebSearchPublicConfig = {
      enabled: this.cfg.enabled,
      provider: this.cfg.provider,
      hasApiKey: this.apiKey.length > 0,
      ready: readyInfo.ok,
      fallback: this.cfg.fallback,
      browserEngines: [...this.cfg.browserEngines],
      unattendedBrowser: this.cfg.unattendedBrowser,
      browserRuntime: runtime.status,
      browserInstallHint: runtime.installHint,
    };
    if (this.cfg.updatedAt && this.cfg.updatedAt !== new Date(0).toISOString()) {
      out.updatedAt = this.cfg.updatedAt;
    }
    if (!readyInfo.ok && readyInfo.reason) out.unavailableReason = readyInfo.reason;
    return out;
  }

  /** Catalogue / dispatch gate (primary path). */
  readyInfo(): { ok: boolean; reason?: string } {
    if (!this.cfg.enabled) {
      return { ok: false, reason: "Web search is disabled under Connections → Web search" };
    }
    if (this.cfg.provider === "duckduckgo") return { ok: true };
    if (!this.apiKey) {
      return {
        ok: false,
        reason:
          this.cfg.provider === "brave"
            ? "Brave Search needs an API key (Connections → Web search)"
            : "Tavily needs an API key (Connections → Web search)",
      };
    }
    return { ok: true };
  }

  fallbackMode(): WebSearchFallback {
    return this.cfg.fallback;
  }

  async setConfig(input: {
    enabled?: boolean;
    provider?: string;
    apiKey?: string | null;
    fallback?: string;
    browserEngines?: string[];
    unattendedBrowser?: boolean;
  }): Promise<WebSearchPublicConfig> {
    if (typeof input.enabled === "boolean") this.cfg.enabled = input.enabled;
    if (typeof input.provider === "string") {
      const p = input.provider.trim().toLowerCase();
      if (!isProvider(p)) {
        throw Object.assign(
          new Error(`envoyhome.bad_params: unknown web search provider: ${input.provider}`),
          { code: "bad_params" },
        );
      }
      this.cfg.provider = p;
    }
    if (typeof input.fallback === "string") {
      const f = input.fallback.trim().toLowerCase();
      if (!isFallback(f)) {
        throw Object.assign(
          new Error(`envoyhome.bad_params: unknown web search fallback: ${input.fallback}`),
          { code: "bad_params" },
        );
      }
      this.cfg.fallback = f;
    }
    if (input.browserEngines !== undefined) {
      this.cfg.browserEngines = parseEngines(input.browserEngines);
    }
    if (typeof input.unattendedBrowser === "boolean") {
      this.cfg.unattendedBrowser = input.unattendedBrowser;
    }
    if (input.apiKey !== undefined) {
      await mkdir(this.paths.secretsDir, { recursive: true });
      const next = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
      if (!next) {
        this.apiKey = "";
        await unlink(this.secretPath()).catch(() => undefined);
      } else {
        this.apiKey = next;
        await writeFile(this.secretPath(), next, { encoding: "utf8", mode: 0o600 });
      }
    }
    this.cfg.updatedAt = new Date().toISOString();
    await mkdir(this.paths.stateDir, { recursive: true });
    await writeFile(
      this.paths.webSearchJson,
      `${JSON.stringify(
        {
          enabled: this.cfg.enabled,
          provider: this.cfg.provider,
          fallback: this.cfg.fallback,
          browserEngines: this.cfg.browserEngines,
          unattendedBrowser: this.cfg.unattendedBrowser,
          updatedAt: this.cfg.updatedAt,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    return this.getPublicConfig();
  }

  async runSearch(
    args: Record<string, unknown>,
    opts: RunSearchOptions = {},
  ): Promise<string> {
    const ready = this.readyInfo();
    if (!ready.ok) {
      throw Object.assign(
        new Error(`envoyhome.tool_unavailable: ${ready.reason ?? "web search unavailable"}`),
        { code: "tool_unavailable" },
      );
    }
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) {
      throw Object.assign(new Error("envoyhome.bad_params: query required"), {
        code: "bad_params",
      });
    }
    const count = clampCount(args.count);
    const provider = this.cfg.provider;
    let result: WebSearchResult;
    try {
      if (provider === "brave") {
        result = await this.searchBrave(query, count);
      } else if (provider === "tavily") {
        result = await this.searchTavily(query, count);
      } else {
        result = await this.searchDuckDuckGo(query, count);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result = { provider, results: [], error: message };
    }

    const primaryUsable = result.results.length > 0;
    if (primaryUsable || this.cfg.fallback !== "browser") {
      return truncateResultJson({
        ...result,
        fallback: "none",
      });
    }

    // §9.5f.1 — browser SERP fallback after empty/error primary.
    const origin = opts.origin ?? "attended";
    if (origin === "unattended" && !this.cfg.unattendedBrowser) {
      return truncateResultJson({
        ...result,
        fallback: "none",
        error: [result.error, "browser fallback skipped (unattendedBrowser off)"]
          .filter(Boolean)
          .join("; "),
      });
    }

    const engines = this.cfg.browserEngines;
    // Attended browser leg MUST ask — fail closed if no approval hook (Design §9.5f.1).
    if (origin === "attended" && !opts.authorizeBrowserFallback) {
      return truncateResultJson({
        ...result,
        fallback: "none",
        error: [result.error, "browser fallback skipped (no approval hook)"]
          .filter(Boolean)
          .join("; "),
      });
    }
    if (opts.authorizeBrowserFallback) {
      const allowed = await opts.authorizeBrowserFallback({ engines });
      if (!allowed) {
        return truncateResultJson({
          ...result,
          fallback: "none",
          error: [result.error, "browser fallback denied"].filter(Boolean).join("; "),
        });
      }
    }

    const browser = await runBrowserSerpFallback({
      query,
      count,
      engines,
      ...(opts.browserFetchHtml ? { fetchHtml: opts.browserFetchHtml } : {}),
    });

    if (browser.results.length > 0) {
      return truncateResultJson({
        provider,
        results: browser.results,
        fallback: "browser",
        ...(browser.engine ? { engine: browser.engine } : {}),
      });
    }

    const fbErr = browser.error ?? browser.code ?? "browser fallback failed";
    return truncateResultJson({
      provider,
      results: [],
      fallback: "browser",
      ...(browser.engine ? { engine: browser.engine } : {}),
      error: [result.error, fbErr].filter(Boolean).join("; "),
    });
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), WEB_SEARCH_TIMEOUT_MS);
    try {
      return await this.fetchImpl(url, { ...init, signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async searchBrave(query: string, count: number): Promise<WebSearchResult> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));
    const res = await this.fetchWithTimeout(url.href, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.apiKey,
      },
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return {
        provider: "brave",
        results: [],
        error: `Brave Search ${res.status}: ${body || res.statusText}`,
      };
    }
    const data = (await res.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    const results: WebSearchHit[] = [];
    for (const r of data.web?.results ?? []) {
      if (results.length >= count) break;
      const title = typeof r.title === "string" ? r.title : "";
      const href = typeof r.url === "string" ? r.url : "";
      if (!href) continue;
      results.push({
        title,
        url: href,
        description: typeof r.description === "string" ? r.description : "",
      });
    }
    return { provider: "brave", results };
  }

  private async searchTavily(query: string, count: number): Promise<WebSearchResult> {
    const res = await this.fetchWithTimeout("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: count,
        search_depth: "basic",
        include_answer: false,
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return {
        provider: "tavily",
        results: [],
        error: `Tavily ${res.status}: ${body || res.statusText}`,
      };
    }
    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const results: WebSearchHit[] = [];
    for (const r of data.results ?? []) {
      if (results.length >= count) break;
      const href = typeof r.url === "string" ? r.url : "";
      if (!href) continue;
      results.push({
        title: typeof r.title === "string" ? r.title : "",
        url: href,
        description: typeof r.content === "string" ? r.content.slice(0, 500) : "",
      });
    }
    return { provider: "tavily", results };
  }

  /**
   * Best-effort DuckDuckGo HTML lite results (no API key).
   * Parses result links; fails closed with a clear error if the markup changes.
   */
  private async searchDuckDuckGo(query: string, count: number): Promise<WebSearchResult> {
    const body = new URLSearchParams({ q: query });
    const res = await this.fetchWithTimeout("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
        "User-Agent": "EnvoyHome/0.0 (household web_search; +https://envoyhome.local)",
      },
      body: body.toString(),
    });
    if (!res.ok) {
      return {
        provider: "duckduckgo",
        results: [],
        error: `DuckDuckGo ${res.status}: ${res.statusText}`,
      };
    }
    const html = await res.text();
    const results = parseDuckDuckGoHtml(html, count);
    if (results.length === 0) {
      return {
        provider: "duckduckgo",
        results: [],
        error: "DuckDuckGo returned no parseable results (try Brave or Tavily with an API key)",
      };
    }
    return { provider: "duckduckgo", results };
  }
}

/** Exported for unit tests. */
export function parseDuckDuckGoHtml(html: string, count: number): WebSearchHit[] {
  const results: WebSearchHit[] = [];
  // result__a anchors; uddg redirect unwrap when present.
  const re =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && results.length < count) {
    const rawHref = decodeHtmlEntities(m[1] ?? "");
    const title = stripTags(decodeHtmlEntities(m[2] ?? "")).trim();
    const url = unwrapDuckRedirect(rawHref);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (results.some((r) => r.url === url)) continue;
    results.push({ title: title || url, url, description: "" });
  }
  // Snippets: result__snippet near results — best-effort fill by order.
  const snips = [
    ...html.matchAll(/<a?[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi),
  ].map((x) => stripTags(decodeHtmlEntities(x[1] ?? "")).trim());
  for (let i = 0; i < results.length && i < snips.length; i++) {
    const s = snips[i];
    if (s) results[i]!.description = s.slice(0, 500);
  }
  return results;
}

function unwrapDuckRedirect(href: string): string {
  try {
    if (href.includes("uddg=")) {
      const u = new URL(href, "https://duckduckgo.com");
      const target = u.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
    }
    return href;
  } catch {
    return href;
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
