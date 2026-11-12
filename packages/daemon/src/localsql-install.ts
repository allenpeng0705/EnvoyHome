/**
 * Managed DuckDB CLI install (Design §9.5k / P2-S1).
 * Owner-explicit only — NEVER silent first-boot (unlike LO/Obscura).
 */

import {
  createWriteStream,
  existsSync,
  readdirSync,
  renameSync,
  rmSync,
  constants as fsConstants,
} from "node:fs";
import {
  access,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, isAbsolute, resolve as resolvePath } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { HomePaths } from "./home-paths.js";
import { safeJoin } from "./fs-jail.js";
import { isBlockedHostname } from "./skill-remote.js";
import {
  LOCALSQL_CATALOG_VERSION,
  LOCALSQL_WHY_TEXT,
  isAllowedLocalSqlOriginHost,
  localSqlCatalogEntryForHost,
  localSqlDownloadMaxBytes,
  type LocalSqlCatalogEntry,
} from "./localsql-catalog.js";

export type LocalSqlManagedRuntimeStatus =
  | "ready"
  | "missing"
  | "downloading"
  | "failed";

export type LocalSqlInstallSource = "managed" | "env" | "none";

export interface LocalSqlInstallPersisted {
  catalogVersion: string;
  status: "idle" | "ready" | "failed";
  managedBinaryRelPath?: string;
  lastError?: string;
  updatedAt: string;
}

export interface LocalSqlInstallStatus {
  localSqlRuntime: LocalSqlManagedRuntimeStatus;
  localSqlInstallHint: string;
  whyText: string;
  versionLine?: string;
  installSource: LocalSqlInstallSource;
  catalogVersion: string;
  download?: {
    bytesReceived: number;
    bytesTotal?: number;
    phase: "download" | "extract" | "idle";
  };
  lastError?: string;
  approxBytes?: number;
  managedPath?: string;
  /** Always false — Design: no silent first-boot. */
  autoInstallEnabled: false;
}

type ExtractFn = (input: {
  archivePath: string;
  runtimeDir: string;
  entry: LocalSqlCatalogEntry;
}) => Promise<{ binaryRelPath: string }>;

type DownloadFn = (input: {
  url: string;
  destPath: string;
  signal: AbortSignal;
  onProgress: (received: number, total?: number) => void;
  maxBytes: number;
  expectedSha256: string;
}) => Promise<void>;

let testExtract: ExtractFn | null = null;
let testDownload: DownloadFn | null = null;
let testCatalogEntry: LocalSqlCatalogEntry | null = null;

export function __setLocalSqlInstallHooksForTests(hooks: {
  extract?: ExtractFn | null;
  download?: DownloadFn | null;
  catalogEntry?: LocalSqlCatalogEntry | null;
}): void {
  testExtract = hooks.extract === undefined ? testExtract : hooks.extract;
  testDownload = hooks.download === undefined ? testDownload : hooks.download;
  testCatalogEntry =
    hooks.catalogEntry === undefined ? testCatalogEntry : hooks.catalogEntry;
}

export function __resetLocalSqlInstallForTests(): void {
  testExtract = null;
  testDownload = null;
  testCatalogEntry = null;
  activeService?.resetForTests();
}

let activeService: LocalSqlInstallService | null = null;

export function getLocalSqlInstallService(): LocalSqlInstallService | null {
  return activeService;
}

export function resolveManagedLocalSqlPath(
  runtimeDir: string,
  binaryRelPath: string,
): string {
  const rel = binaryRelPath.replace(/\\/g, "/").trim();
  if (
    !rel ||
    isAbsolute(rel) ||
    rel.includes("\0") ||
    rel.split("/").some((s) => s === "..") ||
    /^[A-Za-z]:/.test(rel)
  ) {
    throw new Error(
      "envoyhome.localsql_bad_path: managed binaryRelPath escapes runtime jail",
    );
  }
  return safeJoin(runtimeDir, rel);
}

/** Env override: ENVOYHOME_DUCKDB or ENVOYHOME_LOCALSQL → absolute CLI path. */
export function resolveEnvLocalSqlBinary(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = (env.ENVOYHOME_DUCKDB ?? env.ENVOYHOME_LOCALSQL ?? "").trim();
  if (!raw) return null;
  if (!isAbsolute(raw) && !/^[A-Za-z]:[\\/]/.test(raw)) return null;
  return existsSync(raw) ? raw : null;
}

/**
 * True when DuckDB CLI is usable (managed ready or env override).
 * Design §9.5k / V-OFFICE-42 — sql_load / sql_query stay absent from the turn
 * catalogue until this is true.
 */
export function isLocalSqlRuntimeReady(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const svc = getLocalSqlInstallService();
  if (svc?.resolveBinaryPath()) return true;
  return resolveEnvLocalSqlBinary(env) != null;
}

async function sha256File(path: string): Promise<string> {
  const { createReadStream } = await import("node:fs");
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (c: string | Buffer) => {
      hash.update(typeof c === "string" ? Buffer.from(c) : c);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash.digest("hex");
}

async function fetchAllowingRedirects(
  startUrl: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop < 8; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "https:") {
      throw new Error("envoyhome.localsql_bad_url: only https downloads allowed");
    }
    if (isBlockedHostname(parsed.hostname)) {
      throw new Error(
        `envoyhome.localsql_bad_url: host ${parsed.hostname} refused (private/link-local)`,
      );
    }
    if (!isAllowedLocalSqlOriginHost(parsed.hostname)) {
      throw new Error(
        `envoyhome.localsql_bad_url: host ${parsed.hostname} refused`,
      );
    }
    const res = await fetchImpl(current, { redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new Error(
          "envoyhome.localsql_download_failed: redirect without Location",
        );
      }
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("envoyhome.localsql_download_failed: too many redirects");
}

async function defaultDownload(input: {
  url: string;
  destPath: string;
  signal: AbortSignal;
  onProgress: (received: number, total?: number) => void;
  maxBytes: number;
  expectedSha256: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const expected = input.expectedSha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error("envoyhome.localsql_bad_catalog: sha256 must be 64 hex chars");
  }
  const res = await fetchAllowingRedirects(
    input.url,
    input.fetchImpl ?? fetch,
    input.signal,
  );
  if (!res.ok || !res.body) {
    throw new Error(`envoyhome.localsql_download_failed: HTTP ${res.status}`);
  }
  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : undefined;
  if (Number.isFinite(total) && (total as number) > input.maxBytes) {
    throw new Error(
      `envoyhome.localsql_download_failed: Content-Length ${total} exceeds cap ${input.maxBytes}`,
    );
  }
  await mkdir(join(input.destPath, ".."), { recursive: true });
  const partial = `${input.destPath}.partial`;
  const file = createWriteStream(partial);
  const reader = res.body.getReader();
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > input.maxBytes) {
        throw new Error(
          `envoyhome.localsql_download_failed: exceeded size cap ${input.maxBytes}`,
        );
      }
      await new Promise<void>((resolve, reject) => {
        file.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()));
      });
      input.onProgress(received, Number.isFinite(total) ? total : undefined);
    }
    await new Promise<void>((resolve, reject) => {
      file.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
    });
    const digest = await sha256File(partial);
    if (digest !== expected) {
      throw new Error(
        `envoyhome.localsql_hash_mismatch: expected ${expected}, got ${digest}`,
      );
    }
    await rename(partial, input.destPath);
  } catch (err) {
    file.destroy();
    await rm(partial, { force: true }).catch(() => undefined);
    throw err;
  }
}

function runCmd(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`envoyhome.localsql_extract_failed: ${cmd} exited ${code}`),
        );
    });
  });
}

function findNamedFileSync(rootDir: string, name: string, maxDepth = 4): string | null {
  const queue: Array<[string, number]> = [[rootDir, 0]];
  while (queue.length) {
    const next = queue.shift();
    if (!next) break;
    const [dir, depth] = next;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isFile() && ent.name === name) return full;
      if (
        ent.isDirectory() &&
        depth < maxDepth &&
        ent.name !== "." &&
        ent.name !== ".."
      ) {
        queue.push([full, depth + 1]);
      }
    }
  }
  return null;
}

export function promoteLocalSqlLayoutSync(
  runtimeDir: string,
  binaryRelPath: string,
): string | null {
  const dest = join(runtimeDir, binaryRelPath);
  if (existsSync(dest)) return dest;
  const found = findNamedFileSync(runtimeDir, basename(binaryRelPath));
  if (!found) return null;
  const srcDir = dirname(found);
  if (resolvePath(srcDir) === resolvePath(runtimeDir)) return found;
  const from = found;
  const to = dest;
  if (existsSync(to)) rmSync(to, { force: true });
  renameSync(from, to);
  return existsSync(dest) ? dest : null;
}

async function defaultExtract(input: {
  archivePath: string;
  runtimeDir: string;
  entry: LocalSqlCatalogEntry;
}): Promise<{ binaryRelPath: string }> {
  await rm(input.runtimeDir, { recursive: true, force: true });
  await mkdir(input.runtimeDir, { recursive: true });
  await runCmd("tar", ["-xzf", input.archivePath, "-C", input.runtimeDir], input.runtimeDir);
  const promoted = promoteLocalSqlLayoutSync(
    input.runtimeDir,
    input.entry.binaryRelPath,
  );
  const abs = resolveManagedLocalSqlPath(
    input.runtimeDir,
    input.entry.binaryRelPath,
  );
  if (!promoted || !existsSync(abs)) {
    throw new Error(
      `envoyhome.localsql_extract_failed: missing ${input.entry.binaryRelPath} after extract`,
    );
  }
  if (process.platform !== "win32") {
    await chmod(abs, 0o755).catch(() => undefined);
  }
  return { binaryRelPath: input.entry.binaryRelPath };
}

export class LocalSqlInstallService {
  private persisted: LocalSqlInstallPersisted;
  private controller: AbortController | null = null;
  private running: Promise<void> | null = null;
  private starting = false;
  private liveStatus: LocalSqlManagedRuntimeStatus | null = null;
  private downloadProgress: {
    bytesReceived: number;
    bytesTotal?: number;
    phase: "download" | "extract" | "idle";
  } = { bytesReceived: 0, phase: "idle" };

  constructor(
    private readonly paths: HomePaths,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {
    this.persisted = {
      catalogVersion: LOCALSQL_CATALOG_VERSION,
      status: "idle",
      updatedAt: new Date().toISOString(),
    };
    activeService = this;
  }

  resetForTests(): void {
    this.controller?.abort();
    this.controller = null;
    this.running = null;
    this.starting = false;
    this.liveStatus = null;
    this.downloadProgress = { bytesReceived: 0, phase: "idle" };
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.paths.localSqlInstallJson, "utf8");
      const parsed = JSON.parse(raw) as Partial<LocalSqlInstallPersisted>;
      this.persisted = {
        catalogVersion: parsed.catalogVersion ?? LOCALSQL_CATALOG_VERSION,
        status: parsed.status ?? "idle",
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        ...(parsed.managedBinaryRelPath
          ? { managedBinaryRelPath: parsed.managedBinaryRelPath }
          : {}),
        ...(parsed.lastError ? { lastError: parsed.lastError } : {}),
      };
    } catch {
      /* fresh */
    }
  }

  private async save(): Promise<void> {
    await mkdir(this.paths.localSqlDir, { recursive: true });
    this.persisted.updatedAt = new Date().toISOString();
    await writeFile(
      this.paths.localSqlInstallJson,
      `${JSON.stringify(this.persisted, null, 2)}\n`,
      "utf8",
    );
  }

  managedBinaryPath(): string | null {
    const rel = this.persisted.managedBinaryRelPath;
    if (!rel || this.persisted.status !== "ready") return null;
    try {
      const abs = resolveManagedLocalSqlPath(this.paths.localSqlRuntimeDir, rel);
      return existsSync(abs) ? abs : null;
    } catch {
      return null;
    }
  }

  /** Absolute CLI path when ready (env wins over managed). */
  resolveBinaryPath(): string | null {
    return resolveEnvLocalSqlBinary(this.env) ?? this.managedBinaryPath();
  }

  catalogEntry(): LocalSqlCatalogEntry | null {
    return testCatalogEntry ?? localSqlCatalogEntryForHost();
  }

  installHint(): string {
    const entry = this.catalogEntry();
    if (this.liveStatus === "downloading") {
      return "Downloading DuckDB… stays on this home computer.";
    }
    if (this.persisted.status === "failed") {
      return entry
        ? `DuckDB install failed — retry Install, or set ENVOYHOME_DUCKDB to a local CLI (${entry.fileName})`
        : "DuckDB install failed — set ENVOYHOME_DUCKDB to a local duckdb CLI";
    }
    if (this.resolveBinaryPath()) {
      return "DuckDB CLI ready for offline SQL (Owner-installed or ENVOYHOME_DUCKDB).";
    }
    return entry
      ? `Install DuckDB (~${Math.round(entry.approxBytes / (1024 * 1024))} MB) for offline SQL joins — never automatic.`
      : "This OS/arch has no managed DuckDB pin — set ENVOYHOME_DUCKDB to a local CLI.";
  }

  /**
   * Owner-explicit install only. There is intentionally no maybeAutoInstall.
   */
  async startInstall(): Promise<LocalSqlInstallStatus> {
    if (this.running || this.starting) return this.getStatus();
    this.starting = true;
    try {
      const envBin = resolveEnvLocalSqlBinary(this.env);
      if (envBin) {
        this.starting = false;
        return this.getStatus();
      }
      const entry = this.catalogEntry();
      if (!entry) {
        this.persisted.status = "failed";
        this.persisted.lastError =
          "envoyhome.localsql_unsupported_platform: no managed artifact for this OS/arch";
        await this.save();
        this.starting = false;
        return this.getStatus();
      }

      this.controller = new AbortController();
      this.liveStatus = "downloading";
      this.downloadProgress = { bytesReceived: 0, phase: "download" };
      delete this.persisted.lastError;
      await this.save();

      const run = async (): Promise<void> => {
        try {
          await mkdir(this.paths.localSqlDownloadsDir, { recursive: true });
          await mkdir(this.paths.localSqlRuntimeDir, { recursive: true });
          const dest = join(this.paths.localSqlDownloadsDir, entry.fileName);
          const download = testDownload ?? defaultDownload;
          const maxBytes = localSqlDownloadMaxBytes(entry.approxBytes);
          await download({
            url: entry.url,
            destPath: dest,
            signal: this.controller!.signal,
            maxBytes,
            expectedSha256: entry.sha256,
            onProgress: (received, total) => {
              this.downloadProgress = {
                bytesReceived: received,
                ...(total !== undefined ? { bytesTotal: total } : {}),
                phase: "download",
              };
            },
          });
          this.downloadProgress = {
            ...this.downloadProgress,
            phase: "extract",
          };
          const extract = testExtract ?? defaultExtract;
          const { binaryRelPath } = await extract({
            archivePath: dest,
            runtimeDir: this.paths.localSqlRuntimeDir,
            entry,
          });
          const abs = resolveManagedLocalSqlPath(
            this.paths.localSqlRuntimeDir,
            binaryRelPath,
          );
          await access(abs, fsConstants.F_OK);
          this.persisted.status = "ready";
          this.persisted.managedBinaryRelPath = binaryRelPath;
          this.persisted.catalogVersion = entry.version;
          delete this.persisted.lastError;
          this.liveStatus = null;
          this.downloadProgress = { bytesReceived: 0, phase: "idle" };
          await this.save();
        } catch (err) {
          this.persisted.status = "failed";
          this.persisted.lastError =
            err instanceof Error ? err.message : String(err);
          this.liveStatus = null;
          this.downloadProgress = { bytesReceived: 0, phase: "idle" };
          await this.save();
        } finally {
          this.running = null;
          this.controller = null;
          this.starting = false;
        }
      };

      this.running = run();
      this.starting = false;
      await this.running;
      return this.getStatus();
    } catch (err) {
      this.starting = false;
      this.persisted.status = "failed";
      this.persisted.lastError = err instanceof Error ? err.message : String(err);
      await this.save();
      return this.getStatus();
    }
  }

  async cancelInstall(): Promise<LocalSqlInstallStatus> {
    this.controller?.abort();
    if (this.liveStatus === "downloading") {
      this.liveStatus = null;
      this.persisted.status = "failed";
      this.persisted.lastError = "envoyhome.localsql_cancelled: download cancelled";
      this.downloadProgress = { bytesReceived: 0, phase: "idle" };
      await this.save();
    }
    return this.getStatus();
  }

  getStatus(): LocalSqlInstallStatus {
    const envBin = resolveEnvLocalSqlBinary(this.env);
    const managed = this.managedBinaryPath();
    let localSqlRuntime: LocalSqlManagedRuntimeStatus = "missing";
    let installSource: LocalSqlInstallSource = "none";
    if (this.liveStatus === "downloading") localSqlRuntime = "downloading";
    else if (envBin) {
      localSqlRuntime = "ready";
      installSource = "env";
    } else if (managed) {
      localSqlRuntime = "ready";
      installSource = "managed";
    } else if (this.persisted.status === "failed") localSqlRuntime = "failed";

    const entry = this.catalogEntry();
    const out: LocalSqlInstallStatus = {
      localSqlRuntime,
      localSqlInstallHint: this.installHint(),
      whyText: LOCALSQL_WHY_TEXT,
      installSource,
      catalogVersion: this.persisted.catalogVersion || LOCALSQL_CATALOG_VERSION,
      autoInstallEnabled: false,
    };
    if (localSqlRuntime === "ready") {
      out.versionLine = `DuckDB managed pin ${LOCALSQL_CATALOG_VERSION}`;
    }
    if (this.liveStatus === "downloading") {
      out.download = { ...this.downloadProgress };
    }
    if (this.persisted.lastError) out.lastError = this.persisted.lastError;
    if (entry) out.approxBytes = entry.approxBytes;
    if (envBin) out.managedPath = envBin;
    else if (managed) out.managedPath = managed;
    return out;
  }
}
