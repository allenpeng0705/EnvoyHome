/**
 * Managed Obscura download + install (Design §9.5f Stage D).
 * Silent first-boot once when missing; desktop may also ship a bundled binary.
 * Never stealth. Chromium remains Owner-opt-in separately.
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
  OBSCURA_CATALOG_VERSION,
  OBSCURA_WHY_TEXT,
  isAllowedObscuraOriginHost,
  obscuraCatalogEntryForHost,
  obscuraDownloadMaxBytes,
  type ObscuraCatalogEntry,
} from "./obscura-catalog.js";

export type ObscuraManagedRuntimeStatus =
  | "ready"
  | "missing"
  | "downloading"
  | "failed";

export interface ObscuraInstallPersisted {
  catalogVersion: string;
  status: "idle" | "ready" | "failed" | "declined";
  autoEnabled: boolean;
  declined: boolean;
  attemptedSilent: boolean;
  managedBinaryRelPath?: string;
  lastError?: string;
  updatedAt: string;
}

export interface ObscuraInstallStatus {
  obscuraRuntime: ObscuraManagedRuntimeStatus;
  obscuraInstallHint: string;
  whyText: string;
  autoInstall: {
    attempted: boolean;
    declined: boolean;
    enabled: boolean;
  };
  lastError?: string;
  approxBytes?: number;
  managedPath?: string;
}

type ExtractFn = (input: {
  archivePath: string;
  runtimeDir: string;
  entry: ObscuraCatalogEntry;
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
let testCatalogEntry: ObscuraCatalogEntry | null = null;

export function __setObscuraInstallHooksForTests(hooks: {
  extract?: ExtractFn | null;
  download?: DownloadFn | null;
  catalogEntry?: ObscuraCatalogEntry | null;
}): void {
  testExtract = hooks.extract === undefined ? testExtract : hooks.extract;
  testDownload = hooks.download === undefined ? testDownload : hooks.download;
  testCatalogEntry =
    hooks.catalogEntry === undefined ? testCatalogEntry : hooks.catalogEntry;
}

export function __resetObscuraInstallForTests(): void {
  testExtract = null;
  testDownload = null;
  testCatalogEntry = null;
  activeService?.resetForTests();
}

let activeService: ObscuraInstallService | null = null;

export function getObscuraInstallService(): ObscuraInstallService | null {
  return activeService;
}

function isAutoEnvEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.ENVOYHOME_OBSCURA_AUTO ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}

export function resolveManagedObscuraPath(
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
      "envoyhome.obscura_bad_path: managed binaryRelPath escapes runtime jail",
    );
  }
  return safeJoin(runtimeDir, rel);
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

async function fetchObscuraAllowingRedirects(
  startUrl: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop < 8; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "https:") {
      throw new Error("envoyhome.obscura_bad_url: only https downloads allowed");
    }
    if (hop === 0 && !isAllowedObscuraOriginHost(parsed.hostname)) {
      throw new Error(
        `envoyhome.obscura_bad_url: origin host ${parsed.hostname} refused`,
      );
    }
    if (isBlockedHostname(parsed.hostname)) {
      throw new Error(
        `envoyhome.obscura_bad_url: host ${parsed.hostname} refused (private/link-local)`,
      );
    }
    const res = await fetchImpl(current, { redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new Error("envoyhome.obscura_download_failed: redirect without Location");
      }
      const next = new URL(loc, current);
      if (next.protocol !== "https:") {
        throw new Error(
          `envoyhome.obscura_bad_url: redirect to ${next.protocol} refused`,
        );
      }
      if (isBlockedHostname(next.hostname)) {
        throw new Error(
          `envoyhome.obscura_bad_url: redirect host ${next.hostname} refused (private/link-local)`,
        );
      }
      // GitHub release → objects.githubusercontent.com is expected.
      if (!isAllowedObscuraOriginHost(next.hostname) && hop === 0) {
        // first hop already validated origin; subsequent CDN hosts must still be allow-listed
      }
      if (!isAllowedObscuraOriginHost(next.hostname)) {
        throw new Error(
          `envoyhome.obscura_bad_url: redirect host ${next.hostname} refused`,
        );
      }
      current = next.toString();
      continue;
    }
    return res;
  }
  throw new Error("envoyhome.obscura_download_failed: too many redirects");
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
    throw new Error("envoyhome.obscura_bad_catalog: sha256 must be 64 hex chars");
  }
  const res = await fetchObscuraAllowingRedirects(
    input.url,
    input.fetchImpl ?? fetch,
    input.signal,
  );
  if (!res.ok || !res.body) {
    throw new Error(`envoyhome.obscura_download_failed: HTTP ${res.status}`);
  }
  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : undefined;
  if (Number.isFinite(total) && (total as number) > input.maxBytes) {
    throw new Error(
      `envoyhome.obscura_download_failed: Content-Length ${total} exceeds cap ${input.maxBytes}`,
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
          `envoyhome.obscura_download_failed: exceeded size cap ${input.maxBytes}`,
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
        `envoyhome.obscura_hash_mismatch: expected ${expected}, got ${digest}`,
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
      else reject(new Error(`envoyhome.obscura_extract_failed: ${cmd} exited ${code}`));
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
      if (ent.isDirectory() && depth < maxDepth && ent.name !== "." && ent.name !== "..") {
        queue.push([full, depth + 1]);
      }
    }
  }
  return null;
}

/** Flatten nested archive layouts so CLI (+ worker/DLL) sit at runtimeDir root. */
export function promoteObscuraLayoutSync(
  runtimeDir: string,
  binaryRelPath: string,
): string | null {
  const dest = join(runtimeDir, binaryRelPath);
  if (existsSync(dest)) return dest;
  const found = findNamedFileSync(runtimeDir, basename(binaryRelPath));
  if (!found) return null;
  const srcDir = dirname(found);
  if (resolvePath(srcDir) === resolvePath(runtimeDir)) return found;
  for (const name of readdirSync(srcDir)) {
    if (
      name === binaryRelPath ||
      name === basename(binaryRelPath) ||
      /^obscura-worker(\.exe)?$/i.test(name) ||
      /\.dll$/i.test(name)
    ) {
      const from = join(srcDir, name);
      const to = join(
        runtimeDir,
        name === basename(binaryRelPath) ? binaryRelPath : name,
      );
      if (resolvePath(from) === resolvePath(to)) continue;
      if (existsSync(to)) rmSync(to, { force: true });
      renameSync(from, to);
    }
  }
  return existsSync(dest) ? dest : null;
}

async function defaultExtract(input: {
  archivePath: string;
  runtimeDir: string;
  entry: ObscuraCatalogEntry;
}): Promise<{ binaryRelPath: string }> {
  await rm(input.runtimeDir, { recursive: true, force: true });
  await mkdir(input.runtimeDir, { recursive: true });
  if (input.entry.kind === "tar.gz") {
    await runCmd("tar", ["-xzf", input.archivePath, "-C", input.runtimeDir], input.runtimeDir);
  } else {
    // Windows 10+ tar handles zip; macOS/Linux also fine for zip via tar.
    await runCmd("tar", ["-xf", input.archivePath, "-C", input.runtimeDir], input.runtimeDir);
  }
  const promoted = promoteObscuraLayoutSync(
    input.runtimeDir,
    input.entry.binaryRelPath,
  );
  const abs = resolveManagedObscuraPath(input.runtimeDir, input.entry.binaryRelPath);
  if (!promoted || !existsSync(abs)) {
    throw new Error(
      `envoyhome.obscura_extract_failed: missing ${input.entry.binaryRelPath} after extract`,
    );
  }
  if (process.platform !== "win32") {
    await chmod(abs, 0o755).catch(() => undefined);
    const worker = join(input.runtimeDir, "obscura-worker");
    if (existsSync(worker)) {
      await chmod(worker, 0o755).catch(() => undefined);
    }
  }
  return { binaryRelPath: input.entry.binaryRelPath };
}

export class ObscuraInstallService {
  private persisted: ObscuraInstallPersisted;
  private controller: AbortController | null = null;
  private running: Promise<void> | null = null;
  private starting = false;
  private liveStatus: ObscuraManagedRuntimeStatus | null = null;

  constructor(
    private readonly paths: HomePaths,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {
    this.persisted = {
      catalogVersion: OBSCURA_CATALOG_VERSION,
      status: "idle",
      autoEnabled: true,
      declined: false,
      attemptedSilent: false,
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
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.paths.obscuraInstallJson, "utf8");
      const parsed = JSON.parse(raw) as Partial<ObscuraInstallPersisted>;
      this.persisted = {
        catalogVersion: parsed.catalogVersion ?? OBSCURA_CATALOG_VERSION,
        status: parsed.status ?? "idle",
        autoEnabled: parsed.autoEnabled !== false,
        declined: parsed.declined === true,
        attemptedSilent: parsed.attemptedSilent === true,
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
    await mkdir(this.paths.obscuraDir, { recursive: true });
    this.persisted.updatedAt = new Date().toISOString();
    await writeFile(
      this.paths.obscuraInstallJson,
      `${JSON.stringify(this.persisted, null, 2)}\n`,
      "utf8",
    );
  }

  managedBinaryPath(): string | null {
    const rel = this.persisted.managedBinaryRelPath;
    if (!rel || this.persisted.status !== "ready") return null;
    try {
      const abs = resolveManagedObscuraPath(this.paths.obscuraRuntimeDir, rel);
      return existsSync(abs) ? abs : null;
    } catch {
      return null;
    }
  }

  catalogEntry(): ObscuraCatalogEntry | null {
    return testCatalogEntry ?? obscuraCatalogEntryForHost();
  }

  autoEnabled(): boolean {
    return this.persisted.autoEnabled && isAutoEnvEnabled(this.env);
  }

  installHint(): string {
    const entry = this.catalogEntry();
    if (this.liveStatus === "downloading" || this.persisted.status === "idle") {
      return "Obscura installs automatically on first boot (~70 MB, local). Set ENVOYHOME_OBSCURA_AUTO=0 to disable.";
    }
    if (this.persisted.status === "failed") {
      return entry
        ? `Obscura auto-install failed — retry by clearing state or download ${entry.fileName} from GitHub releases and set ENVOYHOME_OBSCURA`
        : "Obscura auto-install failed — set ENVOYHOME_OBSCURA to a local binary";
    }
    return "Obscura is packaged with the desktop app, or installs automatically on first boot (ENVOYHOME_OBSCURA_AUTO=0 to disable)";
  }

  /**
   * Silent first-boot: one attempt when missing, auto on, not declined.
   * Skipped when a bundled/env binary is already usable (caller checks resolve).
   */
  async maybeAutoInstall(opts?: { alreadyReady?: boolean }): Promise<void> {
    if (opts?.alreadyReady) return;
    if (!this.autoEnabled() || this.persisted.declined) return;
    if (this.running || this.starting) return;
    const managed = this.managedBinaryPath();
    if (managed) {
      this.persisted.status = "ready";
      await this.save();
      return;
    }
    if (this.persisted.attemptedSilent && this.persisted.status === "failed") {
      return;
    }
    if (
      this.persisted.attemptedSilent &&
      this.persisted.catalogVersion === OBSCURA_CATALOG_VERSION &&
      this.persisted.status !== "idle"
    ) {
      return;
    }
    this.persisted.attemptedSilent = true;
    await this.save();
    // Caller (daemon boot) void's maybeAutoInstall — await here so one attempt finishes.
    await this.startInstall({ silent: true });
  }

  async startInstall(_opts?: { silent?: boolean }): Promise<ObscuraInstallStatus> {
    if (this.running || this.starting) return this.getStatus();
    this.starting = true;
    try {
      const entry = this.catalogEntry();
      if (!entry) {
        this.persisted.status = "failed";
        this.persisted.lastError =
          "envoyhome.obscura_unsupported_platform: no managed artifact for this OS/arch";
        await this.save();
        this.starting = false;
        return this.getStatus();
      }

      this.controller = new AbortController();
      this.liveStatus = "downloading";
      delete this.persisted.lastError;
      await this.save();

      const run = async (): Promise<void> => {
        try {
          await mkdir(this.paths.obscuraDownloadsDir, { recursive: true });
          await mkdir(this.paths.obscuraRuntimeDir, { recursive: true });
          const dest = join(this.paths.obscuraDownloadsDir, entry.fileName);
          const download = testDownload ?? defaultDownload;
          const maxBytes = obscuraDownloadMaxBytes(entry.approxBytes);
          await download({
            url: entry.url,
            destPath: dest,
            signal: this.controller!.signal,
            maxBytes,
            expectedSha256: entry.sha256,
            onProgress: () => {
              /* progress optional for Obscura */
            },
          });
          const extract = testExtract ?? defaultExtract;
          const { binaryRelPath } = await extract({
            archivePath: dest,
            runtimeDir: this.paths.obscuraRuntimeDir,
            entry,
          });
          const abs = resolveManagedObscuraPath(
            this.paths.obscuraRuntimeDir,
            binaryRelPath,
          );
          await access(abs, fsConstants.F_OK);
          this.persisted.status = "ready";
          this.persisted.managedBinaryRelPath = binaryRelPath;
          this.persisted.catalogVersion = entry.version;
          delete this.persisted.lastError;
          this.liveStatus = null;
          await this.save();
        } catch (err) {
          this.persisted.status = "failed";
          this.persisted.lastError =
            err instanceof Error ? err.message : String(err);
          this.liveStatus = null;
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

  getStatus(): ObscuraInstallStatus {
    const managed = this.managedBinaryPath();
    let obscuraRuntime: ObscuraManagedRuntimeStatus = "missing";
    if (this.liveStatus === "downloading") obscuraRuntime = "downloading";
    else if (managed) obscuraRuntime = "ready";
    else if (this.persisted.status === "failed") obscuraRuntime = "failed";

    const entry = this.catalogEntry();
    return {
      obscuraRuntime,
      obscuraInstallHint: this.installHint(),
      whyText: OBSCURA_WHY_TEXT,
      autoInstall: {
        attempted: this.persisted.attemptedSilent,
        declined: this.persisted.declined,
        enabled: this.autoEnabled(),
      },
      ...(this.persisted.lastError ? { lastError: this.persisted.lastError } : {}),
      ...(entry ? { approxBytes: entry.approxBytes } : {}),
      ...(managed ? { managedPath: managed } : {}),
    };
  }
}
