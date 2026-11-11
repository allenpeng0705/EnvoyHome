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
  type SerpBrowserEngine,
} from "./web-search-browser.js";
import {
  probeObscuraRuntime,
  type ObscuraRuntimeStatus,
} from "./web-extract-obscura.js";
import type { WebExtractBackend } from "./web-extract.js";
import {
  applyReadinessOverride,
  isExtractBackendChoice,
  isHeadlessEngineReady,
  isSerpBrowserEngineChoice,
  probeEngineReadiness,
  resolveExtractBackend,
  resolveSerpBrowserEngine,
  type ExtractBackendChoice,
  type EffectiveExtractBackend,
  type SerpBrowserEngineChoice,
  type EffectiveSerpBrowserEngine,
} from "./engine-auto.js";

export type WebSearchProviderId = "duckduckgo" | "brave" | "tavily" | "browser";
export type WebSearchFallback = "none" | "browser";
export type { WebExtractBackend, SerpBrowserEngine };
export type { ExtractBackendChoice, SerpBrowserEngineChoice };

export const WEB_SEARCH_PROVIDERS: readonly WebSearchProviderId[] = [
  "duckduckgo",
  "brave",
  "tavily",
  "browser",
] as const;

export const WEB_SEARCH_MAX_COUNT = 10;
export const WEB_SEARCH_DEFAULT_COUNT = 5;
export const WEB_SEARCH_TIMEOUT_MS = 15_000;
export const WEB_SEARCH_RESULT_JSON_MAX = 20_000;

const SECRET_FILE = "web_search_api_key.secret";
const DEFAULT_ENGINES: BrowserSerpEngine[] = ["bing", "google"];

export const WEB_RESEARCH_DEFAULT_DIG_DEPTH = 3;
export const WEB_RESEARCH_MAX_DIG_DEPTH = 10;

export type WebSearchConfigFile = {
  enabled: boolean;
  provider: WebSearchProviderId;
  fallback: WebSearchFallback;
  browserEngines: BrowserSerpEngine[];
  unattendedBrowser: boolean;
  /** Owner opt-in dig tool — Design §9.5f.3. */
  researchEnabled: boolean;
  digDepth: number;
  /** Dig/extract engine — Stage E `auto` default (V-OUT-34). */
  extractBackend: ExtractBackendChoice;
  /** SERP HTML engine — Stage E `auto` default (V-OUT-34). */
  serpBrowserEngine: SerpBrowserEngineChoice;
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
  researchEnabled: boolean;
  digDepth: number;
  extractBackend: ExtractBackendChoice;
  serpBrowserEngine: SerpBrowserEngineChoice;
  /** Resolved dig backend for this probe (Stage E). */
  effectiveExtractBackend: EffectiveExtractBackend;
  /** Resolved SERP engine when a headless engine is available; omitted if neither ready under auto. */
  effectiveSerpBrowserEngine?: EffectiveSerpBrowserEngine;
  browserRuntime: BrowserRuntimeStatus;
  browserInstallHint: string;
  obscuraRuntime: ObscuraRuntimeStatus;
  obscuraInstallHint: string;
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
  /** Mid-tool ask for browser SERP (primary or fallback — Design §9.5f.1). Return false to skip. */
  authorizeBrowserFallback?: (detail: {
    engines: BrowserSerpEngine[];
    mode: "primary" | "fallback";
  }) => Promise<boolean>;
  /** Test inject — HTML fetcher for Playwright path. */
  browserFetchHtml?: BrowserFetchHtml;
};

function isProvider(v: unknown): v is WebSearchProviderId {
  return (
    v === "duckduckgo" || v === "brave" || v === "tavily" || v === "browser"
  );
}

function isFallback(v: unknown): v is WebSearchFallback {
  return v === "none" || v === "browser";
}

function isEngine(v: unknown): v is BrowserSerpEngine {
  return v === "bing" || v === "google" || v === "baidu";
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

function clampDigDepth(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return WEB_RESEARCH_DEFAULT_DIG_DEPTH;
  return Math.min(WEB_RESEARCH_MAX_DIG_DEPTH, Math.max(1, Math.floor(n)));
}

/** Template brief from extracts — LLM rewrite stays in the agent reply. */
function buildOrganizedBrief(
  args: Record<string, unknown>,
  links: WebSearchHit[],
  extracts: Array<{
    url: string;
    title?: string;
    markdown: string;
    chars: number;
    error?: string;
  }>,
): string {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const lines: string[] = [];
  lines.push(`# Research: ${query || "(query)"}`);
  lines.push("");
  const ok = extracts.filter((e) => e.markdown.trim() && !e.error);
  if (ok.length === 0) {
    lines.push(
      "No page extracts succeeded. Present the link list below to the user.",
    );
  } else {
    lines.push("## Summary from top sources");
    lines.push("");
    for (const [i, e] of ok.entries()) {
      const title =
        e.title ||
        links.find((l) => l.url === e.url)?.title ||
        e.url;
      const excerpt = e.markdown.replace(/\s+/g, " ").trim().slice(0, 400);
      lines.push(`### ${i + 1}. ${title}`);
      lines.push(excerpt + (e.markdown.length > 400 ? "…" : ""));
      lines.push(`Source: ${e.url}`);
      lines.push("");
    }
  }
  lines.push("## Links");
  for (const [i, l] of links.entries()) {
    lines.push(`${i + 1}. [${l.title}](${l.url}) — ${l.description.slice(0, 160)}`);
  }
  lines.push("");
  lines.push(
    "(Present the organized summary first, then the link list, clearly to the user.)",
  );
  return lines.join("\n");
}

function defaultConfig(): WebSearchConfigFile {
  return {
    enabled: true,
    provider: "duckduckgo",
    // Zero-config: DDG first, then Bing/Google(/Baidu) via Chromium when needed.
    fallback: "browser",
    browserEngines: [...DEFAULT_ENGINES],
    unattendedBrowser: false,
    researchEnabled: false,
    digDepth: WEB_RESEARCH_DEFAULT_DIG_DEPTH,
    extractBackend: "auto",
    serpBrowserEngine: "auto",
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
        // Missing key → browser fallback (zero-config SERP). Explicit "none" stays off.
        fallback: isFallback(raw.fallback) ? raw.fallback : "browser",
        browserEngines: parseEngines(raw.browserEngines),
        unattendedBrowser: raw.unattendedBrowser === true,
        researchEnabled: raw.researchEnabled === true,
        digDepth: clampDigDepth(raw.digDepth),
        extractBackend: isExtractBackendChoice(raw.extractBackend)
          ? raw.extractBackend
          : "auto",
        serpBrowserEngine: isSerpBrowserEngineChoice(raw.serpBrowserEngine)
          ? raw.serpBrowserEngine
          : "auto",
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
    const runtime = await probeBrowserRuntime();
    const obscura = await probeObscuraRuntime();
    const readiness = applyReadinessOverride({
      obscuraReady: obscura.status === "ready",
      chromiumReady: runtime.status === "ready",
    });
    const effectiveExtract = resolveExtractBackend(this.cfg.extractBackend, readiness);
    const effectiveSerp = resolveSerpBrowserEngine(
      this.cfg.serpBrowserEngine,
      readiness,
    );
    // Forced engine with binary missing must not report ready (V-OUT-34).
    const serpReady = isHeadlessEngineReady(effectiveSerp, readiness);
    const primary = this.primaryReadyInfo();
    let ready = false;
    let unavailableReason: string | undefined;
    if (!this.cfg.enabled) {
      unavailableReason = "Web search is disabled under Connections → Web search";
    } else if (this.cfg.provider === "browser") {
      ready = serpReady;
      if (!ready) {
        unavailableReason = this.serpUnavailableReason(
          this.cfg.serpBrowserEngine,
          obscura.installHint,
          runtime.installHint,
        );
      }
    } else if (primary.ok) {
      ready = true;
    } else if (this.cfg.fallback === "browser") {
      ready = serpReady;
      if (!ready) {
        unavailableReason = [
          primary.reason,
          this.serpUnavailableReason(
            this.cfg.serpBrowserEngine,
            obscura.installHint,
            runtime.installHint,
          ),
        ]
          .filter(Boolean)
          .join("; ");
      }
    } else {
      unavailableReason = primary.reason;
    }
    const out: WebSearchPublicConfig = {
      enabled: this.cfg.enabled,
      provider: this.cfg.provider,
      hasApiKey: this.apiKey.length > 0,
      ready,
      fallback: this.cfg.fallback,
      browserEngines: [...this.cfg.browserEngines],
      unattendedBrowser: this.cfg.unattendedBrowser,
      researchEnabled: this.cfg.researchEnabled,
      digDepth: this.cfg.digDepth,
      extractBackend: this.cfg.extractBackend,
      serpBrowserEngine: this.cfg.serpBrowserEngine,
      effectiveExtractBackend: effectiveExtract,
      browserRuntime: readiness.chromiumReady ? "ready" : "missing",
      browserInstallHint: runtime.installHint,
      obscuraRuntime: readiness.obscuraReady ? "ready" : "missing",
      obscuraInstallHint: obscura.installHint,
      ...(effectiveSerp ? { effectiveSerpBrowserEngine: effectiveSerp } : {}),
    };
    if (this.cfg.updatedAt && this.cfg.updatedAt !== new Date(0).toISOString()) {
      out.updatedAt = this.cfg.updatedAt;
    }
    if (!ready && unavailableReason) out.unavailableReason = unavailableReason;
    return out;
  }

  /** Configured dig/extract choice (may be `auto`). */
  extractBackend(): ExtractBackendChoice {
    return this.cfg.extractBackend;
  }

  /** Resolve effective dig backend (Stage E). */
  async resolveExtractBackendEffective(): Promise<EffectiveExtractBackend> {
    return resolveExtractBackend(
      this.cfg.extractBackend,
      await probeEngineReadiness(),
    );
  }

  /** True when the configured API/DDG primary can run without browser. */
  primaryReadyInfo(): { ok: boolean; reason?: string } {
    if (!this.cfg.enabled) {
      return { ok: false, reason: "Web search is disabled under Connections → Web search" };
    }
    if (this.cfg.provider === "duckduckgo") return { ok: true };
    if (this.cfg.provider === "browser") {
      return { ok: false, reason: "provider is browser (SERP primary)" };
    }
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

  /** Catalogue / dispatch gate — primary OR browser fallback path. */
  readyInfo(): { ok: boolean; reason?: string } {
    if (!this.cfg.enabled) {
      return { ok: false, reason: "Web search is disabled under Connections → Web search" };
    }
    const primary = this.primaryReadyInfo();
    if (primary.ok) return { ok: true };
    if (this.cfg.provider === "browser") return { ok: true };
    // Sync catalogue: browser fallback counts as available; Chromium checked at run/getPublicConfig.
    if (this.cfg.fallback === "browser") return { ok: true };
    return primary;
  }

  fallbackMode(): WebSearchFallback {
    return this.cfg.fallback;
  }

  private serpUnavailableReason(
    choice: SerpBrowserEngineChoice,
    obscuraHint: string,
    chromeHint: string,
  ): string {
    if (choice === "obscura") {
      return `Browser SERP needs Obscura on the daemon host — ${obscuraHint}`;
    }
    if (choice === "chromium") {
      return `Browser SERP needs Chromium on the daemon host — ${chromeHint}`;
    }
    return `Browser SERP needs Obscura or Chromium — Obscura: ${obscuraHint}; Chromium: ${chromeHint}`;
  }

  /** Catalogue gate for web_research — Design §9.5f.3. */
  researchReadyInfo(): { ok: boolean; reason?: string } {
    if (!this.cfg.researchEnabled) {
      return {
        ok: false,
        reason: "Web research is disabled under Connections → Web search",
      };
    }
    return this.readyInfo();
  }

  async setConfig(input: {
    enabled?: boolean;
    provider?: string;
    apiKey?: string | null;
    fallback?: string;
    browserEngines?: string[];
    unattendedBrowser?: boolean;
    researchEnabled?: boolean;
    digDepth?: number;
    extractBackend?: string;
    serpBrowserEngine?: string;
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
    if (typeof input.researchEnabled === "boolean") {
      this.cfg.researchEnabled = input.researchEnabled;
    }
    if (input.digDepth !== undefined) {
      this.cfg.digDepth = clampDigDepth(input.digDepth);
    }
    if (typeof input.extractBackend === "string") {
      const b = input.extractBackend.trim().toLowerCase();
      if (!isExtractBackendChoice(b)) {
        throw Object.assign(
          new Error(`envoyhome.bad_params: unknown extractBackend: ${input.extractBackend}`),
          { code: "bad_params" },
        );
      }
      this.cfg.extractBackend = b;
    }
    if (typeof input.serpBrowserEngine === "string") {
      const e = input.serpBrowserEngine.trim().toLowerCase();
      if (!isSerpBrowserEngineChoice(e)) {
        throw Object.assign(
          new Error(`envoyhome.bad_params: unknown serpBrowserEngine: ${input.serpBrowserEngine}`),
          { code: "bad_params" },
        );
      }
      this.cfg.serpBrowserEngine = e;
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
          researchEnabled: this.cfg.researchEnabled,
          digDepth: this.cfg.digDepth,
          extractBackend: this.cfg.extractBackend,
          serpBrowserEngine: this.cfg.serpBrowserEngine,
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

    // §9.5f.1 — Owner elects browser SERP as primary (Bing/Google/Baidu directly).
    if (provider === "browser") {
      return this.runBrowserSerpPath(query, count, opts, {
        mode: "primary",
        primaryProvider: "browser",
      });
    }

    const primaryReady = this.primaryReadyInfo();
    // No API key / unusable primary + browser fallback → go straight to Bing/Google/Baidu.
    if (!primaryReady.ok) {
      if (this.cfg.fallback !== "browser") {
        throw Object.assign(
          new Error(`envoyhome.tool_unavailable: ${primaryReady.reason ?? "web search unavailable"}`),
          { code: "tool_unavailable" },
        );
      }
      return this.runBrowserSerpPath(query, count, opts, {
        mode: "fallback",
        primaryProvider: provider,
        ...(primaryReady.reason ? { priorError: primaryReady.reason } : {}),
      });
    }

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

    // §9.5f.1 — browser SERP fallback after empty/error primary (show engines to the user).
    return this.runBrowserSerpPath(query, count, opts, {
      mode: "fallback",
      primaryProvider: provider,
      ...(result.error ? { priorError: result.error } : {}),
    });
  }

  /**
   * Design §9.5f.3 — search then dig top N via web_extract.
   * Returns organized brief + link list (does not change web_search).
   */
  async runResearch(
    args: Record<string, unknown>,
    opts: RunSearchOptions & {
      extractFetch?: import("./web-extract.js").WebExtractFetch;
      /** Effective dig backend override (tests). */
      extractBackend?: EffectiveExtractBackend;
      obscuraRunner?: import("./web-extract.js").WebExtractObscuraRunner;
    } = {},
  ): Promise<string> {
    const gate = this.researchReadyInfo();
    if (!gate.ok) {
      throw Object.assign(
        new Error(`envoyhome.tool_unavailable: ${gate.reason ?? "web research unavailable"}`),
        { code: "tool_unavailable" },
      );
    }
    const digDepth = clampDigDepth(
      args.digDepth !== undefined ? args.digDepth : this.cfg.digDepth,
    );
    const extractBackend: EffectiveExtractBackend =
      opts.extractBackend ??
      (await this.resolveExtractBackendEffective());
    const searchJson = await this.runSearch(args, opts);
    const search = JSON.parse(searchJson) as WebSearchResult;
    const links = Array.isArray(search.results) ? search.results : [];
    const { runWebExtract } = await import("./web-extract.js");
    const extracts: Array<{
      url: string;
      title?: string;
      markdown: string;
      chars: number;
      error?: string;
      backend?: WebExtractBackend;
    }> = [];
    const toDig = links.slice(0, digDepth);
    const extractOpts = {
      softFailMissingObscura: true as const,
      ...(opts.extractFetch ? { fetchImpl: opts.extractFetch } : {}),
      ...(opts.obscuraRunner ? { obscuraRunner: opts.obscuraRunner } : {}),
    };
    for (const hit of toDig) {
      if (!hit.url || typeof hit.url !== "string") continue;
      try {
        let extracted = JSON.parse(
          await runWebExtract(
            { url: hit.url, maxChars: 4000 },
            { backend: extractBackend, ...extractOpts },
          ),
        ) as {
          url: string;
          title?: string;
          markdown: string;
          chars: number;
          error?: string;
          backend?: WebExtractBackend;
        };
        // Auto prefer Obscura: if binary races away after resolve, fall back to fetch.
        if (
          extracted.error === "obscura_missing" &&
          this.cfg.extractBackend === "auto" &&
          extractBackend === "obscura" &&
          !opts.obscuraRunner
        ) {
          extracted = JSON.parse(
            await runWebExtract(
              { url: hit.url, maxChars: 4000 },
              { backend: "fetch", ...extractOpts },
            ),
          ) as typeof extracted;
        }
        extracts.push({
          url: extracted.url,
          markdown: extracted.markdown ?? "",
          chars: extracted.chars ?? 0,
          ...(extracted.title ? { title: extracted.title } : {}),
          ...(extracted.error ? { error: extracted.error } : {}),
          ...(extracted.backend ? { backend: extracted.backend } : {}),
        });
      } catch (err) {
        // SSRF / bad_params — soft-fail this hit; keep researching others.
        extracts.push({
          url: hit.url,
          markdown: "",
          chars: 0,
          error: err instanceof Error ? err.message.slice(0, 200) : "extract_failed",
          backend: extractBackend,
        });
      }
    }
    const organized = buildOrganizedBrief(args, links, extracts);
    const payload: Record<string, unknown> = {
      organized,
      links,
      extracts: extracts.map((e) => ({
        url: e.url,
        ...(e.title ? { title: e.title } : {}),
        markdown: e.markdown.slice(0, 1500),
        chars: e.chars,
        ...(e.error ? { error: e.error } : {}),
        ...(e.backend ? { backend: e.backend } : {}),
      })),
      provider: search.provider,
      digDepth,
      extractBackend,
    };
    if (search.engine) payload.engine = search.engine;
    if (search.fallback) payload.fallback = search.fallback;
    if (search.error) payload.error = search.error;
    const text = JSON.stringify(payload);
    if (text.length <= WEB_SEARCH_RESULT_JSON_MAX) return text;
    // Drop extract bodies first, keep organized + links + backend marker.
    const slim = {
      organized: organized.slice(0, 6000),
      links,
      provider: search.provider,
      digDepth,
      extractBackend,
      error: "results truncated",
      ...(search.engine ? { engine: search.engine } : {}),
      ...(search.fallback ? { fallback: search.fallback } : {}),
    };
    return JSON.stringify(slim).slice(0, WEB_SEARCH_RESULT_JSON_MAX);
  }

  /** Shared browser SERP leg — primary (`provider: browser`) or fallback after API/DDG. */
  private async runBrowserSerpPath(
    query: string,
    count: number,
    opts: RunSearchOptions,
    meta: {
      mode: "primary" | "fallback";
      primaryProvider: WebSearchProviderId;
      priorError?: string;
    },
  ): Promise<string> {
    const origin = opts.origin ?? "attended";
    const label = meta.mode === "primary" ? "browser search" : "browser fallback";
    if (origin === "unattended" && !this.cfg.unattendedBrowser) {
      return truncateResultJson({
        provider: meta.primaryProvider,
        results: [],
        fallback: meta.mode === "fallback" ? "none" : "none",
        error: [meta.priorError, `${label} skipped (unattendedBrowser off)`]
          .filter(Boolean)
          .join("; "),
      });
    }

    const engines = this.cfg.browserEngines;
    // Attended browser leg MUST ask — fail closed if no approval hook (Design §9.5f.1).
    if (origin === "attended" && !opts.authorizeBrowserFallback) {
      return truncateResultJson({
        provider: meta.primaryProvider,
        results: [],
        fallback: "none",
        error: [meta.priorError, `${label} skipped (no approval hook)`]
          .filter(Boolean)
          .join("; "),
      });
    }
    if (opts.authorizeBrowserFallback) {
      const allowed = await opts.authorizeBrowserFallback({
        engines,
        mode: meta.mode,
      });
      if (!allowed) {
        return truncateResultJson({
          provider: meta.primaryProvider,
          results: [],
          fallback: "none",
          error: [meta.priorError, `${label} denied`].filter(Boolean).join("; "),
        });
      }
    }

    const readiness = await probeEngineReadiness();
    const effectiveSerp = resolveSerpBrowserEngine(
      this.cfg.serpBrowserEngine,
      readiness,
    );
    const serpRunnable = isHeadlessEngineReady(effectiveSerp, readiness);
    if (!opts.browserFetchHtml && !serpRunnable) {
      const { obscuraInstallHint } = await import("./web-extract-obscura.js");
      const { browserInstallHint } = await import("./web-search-browser.js");
      const reason = this.serpUnavailableReason(
        this.cfg.serpBrowserEngine,
        obscuraInstallHint(),
        browserInstallHint(),
      );
      if (meta.mode === "primary") {
        throw Object.assign(
          new Error(`envoyhome.tool_unavailable: ${reason}`),
          { code: "tool_unavailable" },
        );
      }
      return truncateResultJson({
        provider: meta.primaryProvider,
        results: [],
        fallback: "browser",
        error: [meta.priorError, `runtime_missing: ${reason}`]
          .filter(Boolean)
          .join("; "),
      });
    }

    const browser = await runBrowserSerpFallback({
      query,
      count,
      engines,
      // Inject path may omit readiness; prefer resolved engine, else chromium for fixtures.
      serpBrowserEngine: effectiveSerp ?? "chromium",
      ...(opts.browserFetchHtml ? { fetchHtml: opts.browserFetchHtml } : {}),
    });

    if (browser.results.length > 0) {
      return truncateResultJson({
        provider: meta.primaryProvider,
        results: browser.results,
        fallback: meta.mode === "primary" ? "none" : "browser",
        ...(browser.engine ? { engine: browser.engine } : {}),
      });
    }

    const fbErr = browser.error ?? browser.code ?? `${label} failed`;
    return truncateResultJson({
      provider: meta.primaryProvider,
      results: [],
      fallback: meta.mode === "primary" ? "none" : "browser",
      ...(browser.engine ? { engine: browser.engine } : {}),
      error: [meta.priorError, fbErr].filter(Boolean).join("; "),
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
