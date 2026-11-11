// web_extract — Design §9.5f.2 / V-OUT-28 / V-OUT-30. HTTPS → readable Markdown (SSRF).

import { assertPublicHttpsUrl } from "./skill-remote.js";
import {
  probeObscuraRuntime,
  runObscuraExtract,
  type ObscuraExecFile,
} from "./web-extract-obscura.js";

export const WEB_EXTRACT_DEFAULT_MAX_CHARS = 20_000;
export const WEB_EXTRACT_MAX_CHARS = 40_000;
export const WEB_EXTRACT_TIMEOUT_MS = 15_000;
export const WEB_EXTRACT_RESULT_JSON_MAX = 20_000;

export type WebExtractBackend = "fetch" | "obscura";

export type WebExtractResult = {
  url: string;
  title?: string;
  markdown: string;
  chars: number;
  truncated?: boolean;
  error?: string;
  backend?: WebExtractBackend;
};

export type WebExtractFetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<Response>;

export type WebExtractObscuraRunner = (
  url: string,
  maxChars: number,
) => Promise<WebExtractResult>;

function clampMaxChars(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return WEB_EXTRACT_DEFAULT_MAX_CHARS;
  return Math.min(WEB_EXTRACT_MAX_CHARS, Math.max(500, Math.floor(n)));
}

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Best-effort CAPTCHA / challenge / paywall soft-fail (avoid vague phrases alone). */
export function looksBlockedHtml(html: string): boolean {
  const h = html.slice(0, 8000).toLowerCase();
  return (
    /recaptcha|hcaptcha|cf-challenge|challenge-platform|g-recaptcha|安全验证|请完成验证|just a moment\.\.\.|cf-browser-verification/i.test(
      h,
    ) ||
    /\bcaptcha\b/i.test(h) ||
    /paywall|subscribe to (continue|read)|sign in to continue reading/i.test(h) ||
    (/access denied/i.test(h) && /cloudflare|akamai|imperva/i.test(h))
  );
}

function extractTitle(html: string): string | undefined {
  const og =
    html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    );
  if (og?.[1]) return decodeHtml(og[1]).trim().slice(0, 300);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t?.[1]) return stripTags(decodeHtml(t[1])).slice(0, 300);
  return undefined;
}

function pickMainHtml(html: string): string {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article?.[1] && article[1].length > 200) return article[1];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main?.[1] && main[1].length > 200) return main[1];
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return body?.[1] ?? html;
}

/** Convert a chunk of HTML into rough Markdown (headings, links, paragraphs). */
export function htmlToReadableMarkdown(html: string, maxChars: number): {
  markdown: string;
  truncated: boolean;
} {
  let chunk = pickMainHtml(html);
  chunk = chunk
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const parts: string[] = [];
  const push = (line: string) => {
    const t = line.replace(/\s+/g, " ").trim();
    if (t) parts.push(t);
  };

  chunk = chunk.replace(
    /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_m, level, inner) => {
      const text = stripTags(decodeHtml(inner));
      if (text) push(`${"#".repeat(Number(level))} ${text}`);
      return " ";
    },
  );
  chunk = chunk.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
    const text = stripTags(decodeHtml(inner)) || href;
    const url = String(href).trim();
    if (/^https?:\/\//i.test(url)) return `[${text}](${url})`;
    return text;
  });
  chunk = chunk.replace(/<(?:p|li|blockquote|div|tr)\b[^>]*>([\s\S]*?)<\/(?:p|li|blockquote|div|tr)>/gi, (_m, inner) => {
    const text = stripTags(decodeHtml(inner));
    if (text.length > 20) push(text);
    return " ";
  });
  // Leftover text nodes
  const leftover = stripTags(decodeHtml(chunk));
  if (leftover.length > 40) push(leftover);

  // Dedupe consecutive identical lines
  const deduped: string[] = [];
  for (const p of parts) {
    if (deduped[deduped.length - 1] === p) continue;
    deduped.push(p);
  }
  let markdown = deduped.join("\n\n");
  let truncated = false;
  if (markdown.length > maxChars) {
    markdown = markdown.slice(0, maxChars);
    truncated = true;
  }
  return { markdown, truncated };
}

function truncateResultJson(payload: WebExtractResult): string {
  const text = JSON.stringify(payload);
  if (text.length <= WEB_EXTRACT_RESULT_JSON_MAX) return text;
  const budget = Math.max(
    200,
    WEB_EXTRACT_RESULT_JSON_MAX - 120 - (payload.title?.length ?? 0) - payload.url.length,
  );
  const md = payload.markdown.slice(0, budget);
  const trimmed: WebExtractResult = {
    url: payload.url,
    markdown: md,
    chars: md.length,
    truncated: true,
    error: payload.error ?? "results truncated",
  };
  if (payload.title) trimmed.title = payload.title;
  if (payload.backend) trimmed.backend = payload.backend;
  return JSON.stringify(trimmed);
}

function isExtractBackend(v: unknown): v is WebExtractBackend {
  return v === "fetch" || v === "obscura";
}

/**
 * Fetch one public HTTPS page and return readable Markdown.
 * Soft-fails into `{ error }` rather than throwing for page-quality issues.
 * `backend: "obscura"` (Owner config) uses Obscura when available; missing binary
 * throws `tool_unavailable` for standalone extract (research dig soft-fails).
 */
export async function runWebExtract(
  args: Record<string, unknown>,
  opts?: {
    fetchImpl?: WebExtractFetch;
    backend?: WebExtractBackend;
    /** When true, missing Obscura soft-fails into `{ error }` instead of throw. */
    softFailMissingObscura?: boolean;
    obscuraRunner?: WebExtractObscuraRunner;
    obscuraExecFile?: ObscuraExecFile;
  },
): Promise<string> {
  const rawUrl = typeof args.url === "string" ? args.url.trim() : "";
  if (!rawUrl) {
    throw Object.assign(new Error("envoyhome.bad_params: web_extract requires url"), {
      code: "bad_params",
    });
  }
  let parsed: URL;
  try {
    parsed = assertPublicHttpsUrl(rawUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(`envoyhome.ssrf_refused: ${msg}`), {
      code: "envoyhome.ssrf_refused",
    });
  }
  const maxChars = clampMaxChars(args.maxChars);
  const backend: WebExtractBackend = isExtractBackend(opts?.backend)
    ? opts.backend
    : "fetch";

  if (backend === "obscura") {
    if (opts?.obscuraRunner) {
      const out = await opts.obscuraRunner(parsed.href, maxChars);
      return truncateResultJson({ ...out, backend: "obscura" });
    }
    const probe = await probeObscuraRuntime(opts?.obscuraExecFile);
    if (!probe.binary) {
      if (opts?.softFailMissingObscura) {
        return truncateResultJson({
          url: parsed.href,
          markdown: "",
          chars: 0,
          error: "obscura_missing",
          backend: "obscura",
        });
      }
      throw Object.assign(
        new Error(
          `envoyhome.tool_unavailable: web_extract obscura backend needs Obscura — ${probe.installHint}`,
        ),
        { code: "tool_unavailable" },
      );
    }
    const obscuraOut = await runObscuraExtract(parsed.href, {
      maxChars,
      timeoutMs: WEB_EXTRACT_TIMEOUT_MS,
      binary: probe.binary,
      ...(opts?.obscuraExecFile ? { execFile: opts.obscuraExecFile } : {}),
    });
    return truncateResultJson(obscuraOut as WebExtractResult);
  }

  const fetchImpl: WebExtractFetch =
    opts?.fetchImpl ??
    (async (url, init) => fetch(url, { method: "GET", redirect: "error", ...init }));

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), WEB_EXTRACT_TIMEOUT_MS);
  try {
    const res = await fetchImpl(parsed.href, {
      signal: ac.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "EnvoyHome/0.0 (household web_extract; +https://envoyhome.local)",
      },
    });
    if (!res.ok) {
      return truncateResultJson({
        url: parsed.href,
        markdown: "",
        chars: 0,
        error: `http_${res.status}`,
        backend: "fetch",
      });
    }
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ctype && !/text\/html|application\/xhtml|text\/plain/i.test(ctype)) {
      return truncateResultJson({
        url: parsed.href,
        markdown: "",
        chars: 0,
        error: "not_html",
        backend: "fetch",
      });
    }
    const html = await res.text();
    if (looksBlockedHtml(html)) {
      return truncateResultJson({
        url: parsed.href,
        markdown: "",
        chars: 0,
        error: "captcha_or_block",
        backend: "fetch",
      });
    }
    const title = extractTitle(html);
    const { markdown, truncated } = htmlToReadableMarkdown(html, maxChars);
    if (!markdown.trim()) {
      return truncateResultJson({
        url: parsed.href,
        ...(title ? { title } : {}),
        markdown: "",
        chars: 0,
        error: "empty_content",
        backend: "fetch",
      });
    }
    const out: WebExtractResult = {
      url: parsed.href,
      markdown,
      chars: markdown.length,
      backend: "fetch",
    };
    if (title) out.title = title;
    if (truncated) out.truncated = true;
    return truncateResultJson(out);
  } catch (err) {
    const aborted = ac.signal.aborted || (err instanceof Error && err.name === "AbortError");
    return truncateResultJson({
      url: parsed.href,
      markdown: "",
      chars: 0,
      error: aborted ? "timeout" : err instanceof Error ? err.message.slice(0, 200) : "fetch_failed",
      backend: "fetch",
    });
  } finally {
    clearTimeout(timer);
  }
}
