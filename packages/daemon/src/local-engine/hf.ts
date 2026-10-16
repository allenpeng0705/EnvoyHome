/**
 * Hugging Face Hub helpers for Local Model browse + URL download (Design §8.5).
 * Fail-closed: only huggingface.co / hf.co (and their CDN hosts) over HTTPS.
 */

import { createWriteStream } from "node:fs";
import { access, mkdir, rename, unlink, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { resolveLocalModelPath } from "./path-jail.js";

const HF_API = "https://huggingface.co/api";

const ALLOWED_HOST_EXACT = new Set([
  "huggingface.co",
  "hf.co",
  "www.huggingface.co",
  "www.hf.co",
]);

function isAllowedHfHost(host: string): boolean {
  const h = host.toLowerCase();
  if (ALLOWED_HOST_EXACT.has(h)) return true;
  // LFS / CDN used after resolve redirects.
  return h.endsWith(".huggingface.co") || h.endsWith(".hf.co");
}

/**
 * Normalize common Hub file page URLs to a downloadable resolve URL.
 * `/blob/<rev>/…file.gguf` → `/resolve/<rev>/…file.gguf` (blob pages are HTML).
 */
export function normalizeHuggingFaceGgufUrl(raw: string): string {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw Object.assign(new Error(`envoyhome.local_engine_bad_url: invalid URL`), {
      code: "local_engine_bad_url",
    });
  }
  // Drop tracking / download query — pathname carries the file.
  url.search = "";
  url.hash = "";
  const blobMatch = url.pathname.match(
    /^(\/[^/]+\/[^/]+)\/blob\/([^/]+)\/(.+\.gguf)$/i,
  );
  if (blobMatch) {
    url.pathname = `${blobMatch[1]}/resolve/${blobMatch[2]}/${blobMatch[3]}`;
  }
  return url.toString();
}

export function assertHuggingFaceGgufUrl(raw: string): { url: URL; fileName: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw Object.assign(new Error("envoyhome.local_engine_bad_url: empty url"), {
      code: "local_engine_bad_url",
    });
  }
  let url: URL;
  try {
    url = new URL(normalizeHuggingFaceGgufUrl(trimmed));
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    throw Object.assign(new Error(`envoyhome.local_engine_bad_url: invalid URL`), {
      code: "local_engine_bad_url",
    });
  }
  if (url.protocol !== "https:") {
    throw Object.assign(
      new Error("envoyhome.local_engine_bad_url: only https Hugging Face URLs allowed"),
      { code: "local_engine_bad_url" },
    );
  }
  if (!isAllowedHfHost(url.hostname)) {
    throw Object.assign(
      new Error(
        `envoyhome.local_engine_bad_url: host ${url.hostname} refused — Hugging Face only`,
      ),
      { code: "local_engine_bad_url" },
    );
  }
  // Prefer resolve URLs; blob was normalized above. Reject repo/tree pages.
  if (!/\/resolve\//i.test(url.pathname)) {
    throw Object.assign(
      new Error(
        "envoyhome.local_engine_bad_url: paste a file URL (…/resolve/…/file.gguf or …/blob/…/file.gguf)",
      ),
      { code: "local_engine_bad_url" },
    );
  }
  const fileName = basename(decodeURIComponent(url.pathname));
  if (!fileName.toLowerCase().endsWith(".gguf")) {
    throw Object.assign(
      new Error("envoyhome.local_engine_bad_url: URL path must end with .gguf"),
      { code: "local_engine_bad_url" },
    );
  }
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    throw Object.assign(new Error("envoyhome.local_engine_bad_url: unsafe file name"), {
      code: "local_engine_bad_url",
    });
  }
  return { url, fileName };
}

/** Normalize org/name repo id. */
export function assertHfRepoId(raw: string): string {
  const id = raw.trim().replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(id)) {
    throw Object.assign(
      new Error("envoyhome.local_engine_bad_repo: expected org/name"),
      { code: "local_engine_bad_repo" },
    );
  }
  return id;
}

export function hfResolveUrl(repoId: string, filePath: string): string {
  const repo = assertHfRepoId(repoId);
  const parts = filePath
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => encodeURIComponent(p));
  if (parts.length === 0 || !parts[parts.length - 1]!.toLowerCase().endsWith(".gguf")) {
    throw Object.assign(
      new Error("envoyhome.local_engine_bad_url: file path must end with .gguf"),
      { code: "local_engine_bad_url" },
    );
  }
  return `https://huggingface.co/${repo}/resolve/main/${parts.join("/")}`;
}

async function fetchHfJson(
  url: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<unknown> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 20_000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: ac.signal,
      headers: { Accept: "application/json" },
      redirect: "follow",
    });
    if (!res.ok) {
      throw Object.assign(
        new Error(`envoyhome.local_engine_hf_failed: HTTP ${res.status}`),
        { code: "local_engine_hf_failed" },
      );
    }
    return await res.json();
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    throw Object.assign(
      new Error(
        `envoyhome.local_engine_hf_failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
      { code: "local_engine_hf_failed" },
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface HfGgufRepoHit {
  id: string;
  downloads?: number;
  likes?: number;
  gated?: boolean;
  pipelineTag?: string;
}

export async function searchHuggingFaceGgufRepos(
  query: string,
  opts?: { limit?: number; fetchImpl?: typeof fetch },
): Promise<HfGgufRepoHit[]> {
  const q = query.trim();
  if (q.length < 1) {
    throw Object.assign(new Error("envoyhome.local_engine_bad_query: empty search"), {
      code: "local_engine_bad_query",
    });
  }
  if (q.length > 120) {
    throw Object.assign(new Error("envoyhome.local_engine_bad_query: search too long"), {
      code: "local_engine_bad_query",
    });
  }
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const url =
    `${HF_API}/models?search=${encodeURIComponent(q)}` +
    `&filter=gguf&sort=downloads&direction=-1&limit=${limit}`;
  const raw = await fetchHfJson(url, {
    ...(opts?.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  if (!Array.isArray(raw)) {
    throw Object.assign(new Error("envoyhome.local_engine_hf_failed: unexpected search shape"), {
      code: "local_engine_hf_failed",
    });
  }
  const out: HfGgufRepoHit[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id : "";
    if (!id.includes("/")) continue;
    const downloads = (row as { downloads?: unknown }).downloads;
    const likes = (row as { likes?: unknown }).likes;
    const gatedRaw = (row as { gated?: unknown }).gated;
    const pipelineTag = (row as { pipeline_tag?: unknown }).pipeline_tag;
    const gated =
      gatedRaw === true || gatedRaw === false
        ? gatedRaw
        : typeof gatedRaw === "string" && gatedRaw.length > 0
          ? true
          : undefined;
    out.push({
      id,
      ...(typeof downloads === "number" ? { downloads } : {}),
      ...(typeof likes === "number" ? { likes } : {}),
      ...(gated !== undefined ? { gated } : {}),
      ...(typeof pipelineTag === "string" ? { pipelineTag } : {}),
    });
  }
  return out;
}

export interface HfGgufFile {
  path: string;
  size?: number;
  url: string;
}

export async function listHuggingFaceGgufFiles(
  repoId: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<HfGgufFile[]> {
  const repo = assertHfRepoId(repoId);
  // Model info `siblings` is revision-aware and avoids hard-coding branch `main`.
  const url = `${HF_API}/models/${repo}`;
  const raw = await fetchHfJson(url, {
    timeoutMs: 30_000,
    ...(opts?.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  if (!raw || typeof raw !== "object") {
    throw Object.assign(new Error("envoyhome.local_engine_hf_failed: unexpected model shape"), {
      code: "local_engine_hf_failed",
    });
  }
  const siblings = (raw as { siblings?: unknown }).siblings;
  const out: HfGgufFile[] = [];
  if (Array.isArray(siblings)) {
    for (const row of siblings) {
      if (!row || typeof row !== "object") continue;
      const path = (row as { rfilename?: unknown }).rfilename;
      if (typeof path !== "string" || !path.toLowerCase().endsWith(".gguf")) continue;
      const size = (row as { size?: unknown }).size;
      out.push({
        path,
        ...(typeof size === "number" ? { size } : {}),
        url: hfResolveUrl(repo, path),
      });
    }
  }
  // Smaller files first (typical Q4 before Q8), then name — easier to pick a runnable GGUF.
  out.sort((a, b) => {
    const sa = a.size ?? Number.POSITIVE_INFINITY;
    const sb = b.size ?? Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa - sb;
    return a.path.localeCompare(b.path);
  });
  return out;
}

/**
 * Download a Hugging Face .gguf URL into modelsDir.
 * Follows redirects only while the next hop stays on an allow-listed HF host.
 */
export async function downloadHuggingFaceGgufUrl(
  modelsDir: string,
  rawUrl: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<{ fileName: string; path: string; bytes: number }> {
  const { url: startUrl, fileName } = assertHuggingFaceGgufUrl(rawUrl);
  await mkdir(modelsDir, { recursive: true });
  const dest = resolveLocalModelPath(modelsDir, fileName);
  try {
    await access(dest);
    const st = await stat(dest);
    return { fileName, path: dest, bytes: st.size };
  } catch {
    // not present
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;
  let current = startUrl.toString();
  let res: Response | undefined;
  for (let hop = 0; hop < 8; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "https:" || !isAllowedHfHost(parsed.hostname)) {
      throw Object.assign(
        new Error(
          `envoyhome.local_engine_bad_url: redirect host ${parsed.hostname} refused`,
        ),
        { code: "local_engine_bad_url" },
      );
    }
    res = await fetchImpl(current, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw Object.assign(
          new Error("envoyhome.local_engine_download_failed: redirect without Location"),
          { code: "local_engine_download_failed" },
        );
      }
      current = new URL(loc, current).toString();
      continue;
    }
    break;
  }
  if (!res || !res.ok || !res.body) {
    throw Object.assign(
      new Error(
        `envoyhome.local_engine_download_failed: HTTP ${res?.status ?? "?"} for ${fileName}`,
      ),
      { code: "local_engine_download_failed" },
    );
  }

  const partial = join(modelsDir, `${fileName}.partial`);
  try {
    await unlink(partial);
  } catch {
    // ignore
  }
  const file = createWriteStream(partial);
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), file);

  let bytes = 0;
  try {
    bytes = (await stat(partial)).size;
  } catch {
    bytes = 0;
  }
  if (bytes < 1_000_000) {
    try {
      await unlink(partial);
    } catch {
      // ignore
    }
    throw Object.assign(
      new Error(
        `envoyhome.local_engine_download_failed: downloaded file too small (${bytes} bytes) for ${fileName}`,
      ),
      { code: "local_engine_download_failed" },
    );
  }
  await rename(partial, dest);
  return { fileName, path: dest, bytes };
}
