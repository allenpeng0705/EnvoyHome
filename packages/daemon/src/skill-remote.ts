/**
 * Remote skill install helpers — Design §9.2 (ClawHub + URL sources).
 * Downloads stay behind our verify gate; ClawHub trust is not inherited.
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { assertSafeArchiveEntry, assertZipEntriesSafe } from "./local-engine/integrity.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_CLAWHUB_REGISTRY = "https://clawhub.ai";
/** Soft cap for a skill ZIP / SKILL.md download. */
export const MAX_SKILL_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export type SkillFetchResult = {
  /** Directory that contains SKILL.md. */
  stagingDir: string;
  /** Temp root to delete after install (parent of extract / file staging). */
  cleanupDir: string;
  /** Suggested skill id (slug / basename). */
  suggestedId: string;
};

export class SkillRemoteError extends Error {
  constructor(
    readonly kind: "bad_params" | "download_failed" | "unsafe",
    message: string,
  ) {
    super(message);
    this.name = "SkillRemoteError";
  }
}

export function clawhubRegistryBase(): string {
  const raw = process.env.ENVOYHOME_CLAWHUB_REGISTRY?.trim() || DEFAULT_CLAWHUB_REGISTRY;
  return raw.replace(/\/+$/, "");
}

/** Parse `@owner/slug`, `owner/slug`, bare `slug`, optional `@version`. */
export function parseClawHubRef(ref: string): {
  slug: string;
  ownerHandle?: string;
  version?: string;
} {
  let raw = ref.trim();
  if (!raw) throw new SkillRemoteError("bad_params", "ClawHub ref is required");

  const page = /^https?:\/\/[^/]+\/([^/]+)\/skills\/([^/?#]+)/i.exec(raw);
  if (page) {
    return { ownerHandle: page[1]!, slug: page[2]! };
  }

  raw = raw.replace(/^clawhub:/i, "").replace(/^@/, "");

  let version: string | undefined;
  const atVer = /^([^@\s]+)@([vV]?\d[\w.-]*)$/.exec(raw);
  if (atVer) {
    raw = atVer[1]!;
    version = atVer[2]!;
  }

  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 1) {
    return { slug: parts[0]!, ...(version ? { version } : {}) };
  }
  if (parts.length === 2) {
    return {
      ownerHandle: parts[0]!,
      slug: parts[1]!,
      ...(version ? { version } : {}),
    };
  }
  throw new SkillRemoteError(
    "bad_params",
    "ClawHub ref must be slug, owner/slug, or @owner/slug",
  );
}

export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SkillRemoteError("bad_params", `invalid skill URL: ${raw}`);
  }
  if (url.protocol !== "https:") {
    throw new SkillRemoteError("unsafe", "skill URL must be https");
  }
  if (url.username || url.password) {
    throw new SkillRemoteError("unsafe", "skill URL must not include credentials");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new SkillRemoteError("unsafe", `skill URL host refused: ${url.hostname}`);
  }
  return url;
}

/** True when an IPv4 address is loopback / private / link-local / unspecified. */
export function isBlockedIpv4(a: number, b: number, c: number, d: number): boolean {
  if (![a, b, c, d].every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return false;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Parse dotted, decimal, octal-ish, or short IPv4 host forms used in SSRF bypasses
 * (e.g. 2130706433, 127.1, 0x7f.0.0.1). Returns null if not an IPv4-like host.
 */
export function parseIpv4Like(hostname: string): [number, number, number, number] | null {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (/^\d+$/.test(h)) {
    const n = Number(h);
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }
  if (!/^[\d.]+$/.test(h) && !/^0x[0-9a-f.]+$/i.test(h) && !h.includes(".")) {
    return null;
  }
  // Hex dotted: 0x7f.0.0.1
  if (/^0x/i.test(h) || h.includes("0x")) {
    const parts = h.split(".");
    if (parts.length === 4 && parts.every((p) => /^(0x)?[0-9a-f]+$/i.test(p))) {
      const nums = parts.map((p) => parseInt(p, p.toLowerCase().startsWith("0x") ? 16 : 10));
      if (nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
        return nums as [number, number, number, number];
      }
    }
  }
  const dotted = h.split(".");
  if (dotted.length === 4 && dotted.every((p) => /^\d+$/.test(p))) {
    const nums = dotted.map((p) => Number(p));
    if (nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return nums as [number, number, number, number];
    }
  }
  // Short forms: 127.1 → 127.0.0.1; 127.0.1 → 127.0.0.1
  if (dotted.length >= 2 && dotted.length <= 3 && dotted.every((p) => /^\d+$/.test(p))) {
    const nums = dotted.map((p) => Number(p));
    if (!nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return null;
    if (dotted.length === 2) return [nums[0]!, 0, 0, nums[1]!];
    return [nums[0]!, nums[1]!, 0, nums[2]!];
  }
  return null;
}

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "metadata.google.internal"
  ) {
    return true;
  }
  const ipv4 = parseIpv4Like(h);
  if (ipv4) {
    return isBlockedIpv4(...ipv4);
  }
  if (h.includes(":")) {
    if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
      return true;
    }
  }
  return false;
}

async function fetchBytes(
  url: string,
  fetchImpl: typeof fetch,
  opts?: { accept?: string },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let current = assertPublicHttpsUrl(url).href;
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const res = await fetchImpl(current, {
      redirect: "manual",
      headers: {
        Accept: opts?.accept ?? "*/*",
        "User-Agent": "EnvoyHome-daemon/0.0 (skill-install)",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new SkillRemoteError("download_failed", "redirect without Location");
      }
      const next = new URL(loc, current);
      assertPublicHttpsUrl(next.href);
      current = next.href;
      continue;
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 240);
      throw new SkillRemoteError(
        "download_failed",
        `download failed HTTP ${res.status}${text ? `: ${text}` : ""}`,
      );
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0) {
      throw new SkillRemoteError("download_failed", "empty download");
    }
    if (buf.byteLength > MAX_SKILL_DOWNLOAD_BYTES) {
      throw new SkillRemoteError(
        "unsafe",
        `skill download exceeds ${MAX_SKILL_DOWNLOAD_BYTES} bytes`,
      );
    }
    return {
      bytes: buf,
      contentType: (res.headers.get("content-type") || "").toLowerCase(),
    };
  }
  throw new SkillRemoteError("download_failed", "too many redirects");
}

async function extractZipToDir(archivePath: string, destDir: string): Promise<void> {
  await assertZipEntriesSafe(archivePath);
  const list = await execFileAsync("unzip", ["-Z1", archivePath], {
    maxBuffer: 16 * 1024 * 1024,
  }).catch(() =>
    execFileAsync("zipinfo", ["-1", archivePath], { maxBuffer: 16 * 1024 * 1024 }),
  );
  for (const line of list.stdout.split("\n")) {
    const name = line.trim();
    if (!name) continue;
    assertSafeArchiveEntry(name);
  }
  if (process.platform === "win32") {
    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ]);
  } else {
    await execFileAsync("unzip", ["-o", archivePath, "-d", destDir]);
  }
}

/** Locate the directory that contains SKILL.md (root or single nested folder). */
export async function resolveSkillRoot(extractRoot: string): Promise<string> {
  const direct = join(extractRoot, "SKILL.md");
  try {
    await stat(direct);
    return extractRoot;
  } catch {
    /* look one level down */
  }
  const entries = await readdir(extractRoot, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));
  for (const d of dirs) {
    const candidate = join(extractRoot, d.name, "SKILL.md");
    try {
      await stat(candidate);
      return join(extractRoot, d.name);
    } catch {
      /* continue */
    }
  }
  throw new SkillRemoteError(
    "bad_params",
    "downloaded archive has no SKILL.md (not a skill bundle)",
  );
}

/** Refuse OpenClaw code-plugin packages that are not SKILL.md skills. */
export async function assertSkillBundleNotPlugin(root: string): Promise<void> {
  const pkgPath = join(root, "package.json");
  try {
    const raw = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
    const oc = raw.openclaw;
    if (oc && typeof oc === "object") {
      const family = String((oc as { family?: string }).family || "").toLowerCase();
      if (family === "plugin" || family === "bundle") {
        throw new SkillRemoteError(
          "unsafe",
          "refusing ClawHub/OpenClaw plugin package — only SKILL.md skills are supported",
        );
      }
    }
    if (raw["openclaw.plugin"] != null || raw["claw.compat.pluginApi"] != null) {
      throw new SkillRemoteError(
        "unsafe",
        "refusing OpenClaw plugin package — only SKILL.md skills are supported",
      );
    }
  } catch (err) {
    if (err instanceof SkillRemoteError) throw err;
  }
}

function looksLikeMarkdown(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf8", { fatal: false })
    .decode(bytes.slice(0, 256))
    .trimStart();
  return head.startsWith("---") || head.startsWith("#");
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function looksLikeJson(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf8", { fatal: false })
    .decode(bytes.slice(0, 32))
    .trimStart();
  return head.startsWith("{");
}

async function materializeFromBytes(
  bytes: Uint8Array,
  contentType: string,
  suggestedId: string,
  fetchImpl: typeof fetch,
): Promise<SkillFetchResult> {
  if (looksLikeJson(bytes) && !looksLikeZip(bytes)) {
    return materializeGithubHandoff(
      JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>,
      fetchImpl,
    );
  }

  const cleanupDir = await mkdtemp(join(tmpdir(), "eh-skill-"));
  try {
    if (looksLikeZip(bytes) || contentType.includes("zip")) {
      if (!looksLikeZip(bytes)) {
        throw new SkillRemoteError("download_failed", "response is not a zip archive");
      }
      const zipPath = join(cleanupDir, "skill.zip");
      await writeFile(zipPath, bytes);
      const extractDir = join(cleanupDir, "extract");
      await mkdir(extractDir, { recursive: true });
      await extractZipToDir(zipPath, extractDir);
      const root = await resolveSkillRoot(extractDir);
      await assertSkillBundleNotPlugin(root);
      return { stagingDir: root, cleanupDir, suggestedId };
    }

    if (
      looksLikeMarkdown(bytes) ||
      contentType.includes("markdown") ||
      contentType.includes("text/plain")
    ) {
      await writeFile(join(cleanupDir, "SKILL.md"), bytes);
      return { stagingDir: cleanupDir, cleanupDir, suggestedId };
    }

    throw new SkillRemoteError(
      "bad_params",
      "URL did not return a skill ZIP or SKILL.md",
    );
  } catch (err) {
    await rm(cleanupDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

async function materializeGithubHandoff(
  handoff: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<SkillFetchResult> {
  const sourceRef = String(handoff.sourceRef || "");
  if (sourceRef !== "public-github") {
    throw new SkillRemoteError(
      "download_failed",
      `unsupported ClawHub handoff: ${sourceRef || "unknown"}`,
    );
  }
  const archiveUrl = String(handoff.archiveUrl || "");
  if (!archiveUrl) {
    throw new SkillRemoteError("download_failed", "ClawHub GitHub handoff missing archiveUrl");
  }
  assertPublicHttpsUrl(archiveUrl);
  const host = new URL(archiveUrl).hostname.toLowerCase();
  if (
    host !== "codeload.github.com" &&
    host !== "github.com" &&
    !host.endsWith(".githubusercontent.com")
  ) {
    throw new SkillRemoteError("unsafe", `GitHub handoff host refused: ${host}`);
  }
  const { bytes, contentType } = await fetchBytes(archiveUrl, fetchImpl);
  const repo = String(handoff.repo || "skill").split("/").pop() || "skill";
  const pathInRepo = String(handoff.path || "").replace(/^\/+|\/+$/g, "");
  const result = await materializeFromBytes(bytes, contentType, repo, fetchImpl);
  if (pathInRepo) {
    const nested = join(result.stagingDir, ...pathInRepo.split("/"));
    try {
      await stat(join(nested, "SKILL.md"));
      return {
        stagingDir: nested,
        cleanupDir: result.cleanupDir,
        suggestedId: basename(pathInRepo) || repo,
      };
    } catch {
      /* archive may already be the skill subdirectory */
    }
  }
  return result;
}

export async function fetchSkillFromUrl(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<SkillFetchResult> {
  const parsed = assertPublicHttpsUrl(url);
  const { bytes, contentType } = await fetchBytes(parsed.href, fetchImpl);
  const base = basename(parsed.pathname).replace(/\.(zip|md)$/i, "") || "skill";
  return materializeFromBytes(bytes, contentType, base, fetchImpl);
}

/** One hit from ClawHub search (peer: EnvoyMesh `searchOpenClawPluginsViaRuntime`). */
export type ClawHubSearchHit = {
  slug: string;
  ownerHandle: string;
  name: string;
  description: string;
  /** Install ref for `home.installSkill` source=clawhub — always `owner/slug` when owner known. */
  ref: string;
  url: string;
};

function ownerHandleFromRaw(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const h = (raw as { handle?: unknown; ownerHandle?: unknown }).handle
      ?? (raw as { ownerHandle?: unknown }).ownerHandle;
    if (typeof h === "string") return h.trim();
  }
  return "";
}

function normalizeClawHubSearchItem(raw: unknown): ClawHubSearchHit | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const slug = String(s.slug ?? "").trim();
  if (!slug) return null;
  const ownerHandle =
    ownerHandleFromRaw(s.ownerHandle) || ownerHandleFromRaw(s.owner);
  const name = String(s.name ?? slug).trim() || slug;
  const description = String(s.description ?? "")
    .trim()
    .slice(0, 160);
  const ref = ownerHandle ? `${ownerHandle}/${slug}` : slug;
  const url = ownerHandle
    ? `${clawhubRegistryBase()}/${ownerHandle}/${slug}`
    : `${clawhubRegistryBase()}/skills/${slug}`;
  return { slug, ownerHandle, name, description, ref, url };
}

/**
 * Search the public ClawHub registry (HTTP API — no clawhub CLI).
 * Peer: EnvoyMesh `apps/node/src/node-service-clawhub.ts` `searchOpenClawPluginsViaRuntime`.
 */
export async function searchClawHubSkills(
  query: string,
  opts?: { limit?: number; fetchImpl?: typeof fetch },
): Promise<ClawHubSearchHit[]> {
  const q = query.trim();
  if (!q) throw new SkillRemoteError("bad_params", "search query is required");
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
  const registry = clawhubRegistryBase();
  assertPublicHttpsUrl(registry);

  const url = new URL(`${registry}/api/v1/search`);
  url.searchParams.set("q", q);
  const res = await fetchImpl(url.href, {
    headers: {
      Accept: "application/json",
      "User-Agent": "EnvoyHome-daemon/0.0 (skill-search)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 200);
    throw new SkillRemoteError(
      "download_failed",
      `ClawHub search failed HTTP ${res.status}${text ? `: ${text}` : ""}`,
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  const items = (data.skills ?? data.items ?? data.results ?? data) as unknown;
  if (!Array.isArray(items)) return [];
  const out: ClawHubSearchHit[] = [];
  for (const raw of items) {
    const hit = normalizeClawHubSearchItem(raw);
    if (hit) out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

export async function fetchSkillFromClawHub(
  ref: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<SkillFetchResult> {
  let { slug, ownerHandle, version } = parseClawHubRef(ref);
  const registry = clawhubRegistryBase();
  assertPublicHttpsUrl(registry);

  if (!ownerHandle) {
    const q = new URL(`${registry}/api/v1/search`);
    q.searchParams.set("q", slug);
    q.searchParams.set("mode", "exact");
    const res = await fetchImpl(q.href, {
      headers: {
        Accept: "application/json",
        "User-Agent": "EnvoyHome-daemon/0.0 (skill-install)",
      },
    });
    if (res.ok) {
      const body = (await res.json()) as {
        results?: Array<{ ownerHandle?: string; slug?: string }>;
      };
      const hits = body.results || [];
      if (hits.length === 1 && hits[0]?.ownerHandle) {
        ownerHandle = hits[0].ownerHandle;
        if (hits[0].slug) slug = hits[0].slug;
      } else if (hits.length > 1) {
        const owners = hits
          .map((h) => h.ownerHandle)
          .filter(Boolean)
          .slice(0, 3)
          .join(", ");
        throw new SkillRemoteError(
          "bad_params",
          `ambiguous ClawHub slug "${slug}" — use owner/slug (e.g. ${owners.split(", ")[0]}/${slug})`,
        );
      }
    }
  }

  const dl = new URL(`${registry}/api/v1/download`);
  dl.searchParams.set("slug", slug);
  if (ownerHandle) dl.searchParams.set("ownerHandle", ownerHandle);
  if (version) dl.searchParams.set("version", version);

  const { bytes, contentType } = await fetchBytes(dl.href, fetchImpl, {
    accept: "application/zip, application/json, */*",
  });
  const id = slug;
  return materializeFromBytes(bytes, contentType, id, fetchImpl);
}
