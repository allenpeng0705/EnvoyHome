/**
 * Managed LibreOffice download + install (Design §9.5b / P2-K8).
 * Silent first-boot once; Owner retry; JS export always remains available.
 */

import { createWriteStream, existsSync, constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { HomePaths } from "./home-paths.js";
import { safeJoin } from "./fs-jail.js";
import {
  LIBREOFFICE_CATALOG_VERSION,
  LIBREOFFICE_WHY_TEXT,
  libreOfficeCatalogEntryForHost,
  libreOfficeDownloadMaxBytes,
  type LibreOfficeCatalogEntry,
} from "./libreoffice-catalog.js";
import { clearLibreOfficeProbeCache } from "./document-export-lo.js";
import { isBlockedHostname } from "./skill-remote.js";

export type LibreOfficeRuntimeStatus =
  | "ready"
  | "missing"
  | "downloading"
  | "failed";

export type LibreOfficeInstallSource = "system" | "managed" | "env";

export interface LibreOfficeInstallPersisted {
  catalogVersion: string;
  status: "idle" | "ready" | "failed" | "declined";
  autoEnabled: boolean;
  declined: boolean;
  attemptedSilent: boolean;
  managedSofficeRelPath?: string;
  lastError?: string;
  needsManualInstall?: boolean;
  updatedAt: string;
}

export interface LibreOfficeDownloadProgress {
  bytesReceived: number;
  bytesTotal?: number;
  phase: "download" | "extract" | "idle";
}

export interface DocumentExportStatus {
  libreOfficeRuntime: LibreOfficeRuntimeStatus;
  libreOfficeInstallHint: string;
  whyText: string;
  versionLine?: string;
  installSource?: LibreOfficeInstallSource;
  download?: LibreOfficeDownloadProgress;
  lastError?: string;
  autoInstall: {
    attempted: boolean;
    declined: boolean;
    enabled: boolean;
  };
  approxBytes?: number;
  needsManualInstall?: boolean;
}

type ExtractFn = (input: {
  archivePath: string;
  runtimeDir: string;
  entry: LibreOfficeCatalogEntry;
}) => Promise<{ sofficeRelPath: string }>;

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
/** When set, catalog resolution uses this entry (tests). */
let testCatalogEntry: LibreOfficeCatalogEntry | null = null;

export function __setLibreOfficeInstallHooksForTests(hooks: {
  extract?: ExtractFn | null;
  download?: DownloadFn | null;
  catalogEntry?: LibreOfficeCatalogEntry | null;
}): void {
  testExtract = hooks.extract === undefined ? testExtract : hooks.extract;
  testDownload = hooks.download === undefined ? testDownload : hooks.download;
  testCatalogEntry =
    hooks.catalogEntry === undefined ? testCatalogEntry : hooks.catalogEntry;
}

export function __resetLibreOfficeInstallForTests(): void {
  testExtract = null;
  testDownload = null;
  testCatalogEntry = null;
  activeService?.resetForTests();
}

let activeService: LibreOfficeInstallService | null = null;

export function getLibreOfficeInstallService(): LibreOfficeInstallService | null {
  return activeService;
}

function isAutoEnvEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.ENVOYHOME_LIBREOFFICE_AUTO ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}

/** Origin allow-list for catalog start URLs (TDF). Mirrors may follow after. */
export function isAllowedLoOriginHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "download.documentfoundation.org" ||
    h.endsWith(".documentfoundation.org") ||
    h === "download.libreoffice.org" ||
    h.endsWith(".libreoffice.org")
  );
}

/**
 * Manual redirects: start host must be TDF allow-list; each hop https.
 * Non-TDF redirect hosts are allowed only as MirrorBrain mirrors — content
 * MUST still match catalog sha256 after download. Refuse loopback / RFC1918 /
 * link-local / metadata hosts on every hop (defense-in-depth vs blind SSRF).
 */
export async function fetchLibreOfficeAllowingRedirects(
  startUrl: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Response> {
  let current = startUrl;
  let hop = 0;
  for (; hop < 8; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "https:") {
      throw new Error("envoyhome.libreoffice_bad_url: only https downloads allowed");
    }
    if (hop === 0 && !isAllowedLoOriginHost(parsed.hostname)) {
      throw new Error(
        `envoyhome.libreoffice_bad_url: origin host ${parsed.hostname} refused`,
      );
    }
    if (isBlockedHostname(parsed.hostname)) {
      throw new Error(
        `envoyhome.libreoffice_bad_url: host ${parsed.hostname} refused (private/link-local)`,
      );
    }
    const res = await fetchImpl(current, { redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new Error("envoyhome.libreoffice_download_failed: redirect without Location");
      }
      const next = new URL(loc, current);
      if (next.protocol !== "https:") {
        throw new Error(
          `envoyhome.libreoffice_bad_url: redirect to ${next.protocol} refused`,
        );
      }
      if (isBlockedHostname(next.hostname)) {
        throw new Error(
          `envoyhome.libreoffice_bad_url: redirect host ${next.hostname} refused (private/link-local)`,
        );
      }
      current = next.toString();
      continue;
    }
    return res;
  }
  throw new Error("envoyhome.libreoffice_download_failed: too many redirects");
}

/** Refuse absolute / `..` managed binary paths (under runtime root). */
export function resolveManagedSofficePath(
  runtimeDir: string,
  sofficeRelPath: string,
): string {
  const rel = sofficeRelPath.replace(/\\/g, "/").trim();
  if (
    !rel ||
    isAbsolute(rel) ||
    rel.includes("\0") ||
    rel.split("/").some((s) => s === "..") ||
    /^[A-Za-z]:/.test(rel)
  ) {
    throw new Error(
      "envoyhome.libreoffice_bad_path: managed sofficeRelPath escapes runtime jail",
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

/** @internal test export — production uses this via startInstall. */
export async function __downloadLibreOfficeForTests(input: {
  url: string;
  destPath: string;
  signal: AbortSignal;
  onProgress: (received: number, total?: number) => void;
  maxBytes: number;
  expectedSha256: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  return defaultDownload(input);
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
    throw new Error("envoyhome.libreoffice_bad_catalog: sha256 must be 64 hex chars");
  }
  const res = await fetchLibreOfficeAllowingRedirects(
    input.url,
    input.fetchImpl ?? fetch,
    input.signal,
  );
  if (!res.ok || !res.body) {
    throw new Error(`envoyhome.libreoffice_download_failed: HTTP ${res.status}`);
  }
  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : undefined;
  if (Number.isFinite(total) && (total as number) > input.maxBytes) {
    throw new Error(
      `envoyhome.libreoffice_download_failed: Content-Length ${total} exceeds cap ${input.maxBytes}`,
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
          `envoyhome.libreoffice_download_failed: exceeded size cap ${input.maxBytes}`,
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
        `envoyhome.libreoffice_hash_mismatch: expected ${expected}, got ${digest}`,
      );
    }
    await rename(partial, input.destPath);
  } catch (err) {
    file.destroy();
    await rm(partial, { force: true }).catch(() => undefined);
    throw err;
  }
}

function runCmd(
  bin: string,
  args: string[],
  opts?: { cwd?: string },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function defaultExtract(input: {
  archivePath: string;
  runtimeDir: string;
  entry: LibreOfficeCatalogEntry;
}): Promise<{ sofficeRelPath: string }> {
  await rm(input.runtimeDir, { recursive: true, force: true });
  await mkdir(input.runtimeDir, { recursive: true });

  if (input.entry.kind === "dmg") {
    const mount = join(input.runtimeDir, "..", `mnt-${createHash("sha1").update(input.archivePath).digest("hex").slice(0, 8)}`);
    await mkdir(mount, { recursive: true });
    try {
      const attach = await runCmd("hdiutil", [
        "attach",
        input.archivePath,
        "-nobrowse",
        "-readonly",
        "-mountpoint",
        mount,
      ]);
      if (attach.code !== 0) {
        throw new Error(
          `envoyhome.libreoffice_extract_failed: hdiutil attach — ${(attach.stderr || attach.stdout).slice(0, 300)}`,
        );
      }
      const appSrc = join(mount, "LibreOffice.app");
      if (!existsSync(appSrc)) {
        throw new Error("envoyhome.libreoffice_extract_failed: LibreOffice.app missing in DMG");
      }
      const copy = await runCmd("cp", ["-R", appSrc, join(input.runtimeDir, "LibreOffice.app")]);
      if (copy.code !== 0) {
        throw new Error("envoyhome.libreoffice_extract_failed: copy LibreOffice.app");
      }
    } finally {
      await runCmd("hdiutil", ["detach", mount, "-quiet"]).catch(() => undefined);
      await rm(mount, { recursive: true, force: true }).catch(() => undefined);
    }
    return { sofficeRelPath: input.entry.sofficeRelPath };
  }

  if (input.entry.kind === "tar.gz") {
    const unpack = join(input.runtimeDir, "..", "unpack");
    await rm(unpack, { recursive: true, force: true });
    await mkdir(unpack, { recursive: true });
    const tar = await runCmd("tar", ["-xzf", input.archivePath, "-C", unpack]);
    if (tar.code !== 0) {
      throw new Error(
        `envoyhome.libreoffice_extract_failed: tar — ${(tar.stderr || tar.stdout).slice(0, 300)}`,
      );
    }
    // Deb tarball → extract main package with dpkg-deb -x (no root).
    const { readdir } = await import("node:fs/promises");
    const top = await readdir(unpack);
    const inner = top[0] ? join(unpack, top[0]) : unpack;
    const debsDir = join(inner, "DEBS");
    let debRoot = debsDir;
    if (!existsSync(debsDir)) {
      debRoot = inner;
    }
    const files = existsSync(debRoot) ? await readdir(debRoot) : [];
    const mainDeb = files.find(
      (f) => f.endsWith(".deb") && /libreoffice\d+/i.test(f) && !/dict|help|kde|gnome/i.test(f),
    ) ?? files.find((f) => f.endsWith(".deb"));
    if (!mainDeb) {
      throw new Error(
        "envoyhome.libreoffice_extract_failed: no .deb in archive (needsManualInstall)",
      );
    }
    const dpkg = await runCmd("dpkg-deb", ["-x", join(debRoot, mainDeb), input.runtimeDir]);
    if (dpkg.code !== 0) {
      throw new Error(
        `envoyhome.libreoffice_extract_failed: dpkg-deb — ${(dpkg.stderr || dpkg.stdout).slice(0, 300)}`,
      );
    }
    // Debian layout: opt/libreoffice*/program/soffice
    const opt = join(input.runtimeDir, "opt");
    if (existsSync(opt)) {
      const opts = await readdir(opt);
      const lo = opts.find((n) => n.startsWith("libreoffice"));
      if (lo) {
        return { sofficeRelPath: join("opt", lo, "program", "soffice") };
      }
    }
    return { sofficeRelPath: input.entry.sofficeRelPath };
  }

  if (input.entry.kind === "msi") {
    // Administrative extract to runtime (no full GUI install).
    const msi = await runCmd("msiexec", [
      "/a",
      input.archivePath,
      "/qn",
      `TARGETDIR=${input.runtimeDir}`,
    ]);
    if (msi.code !== 0) {
      const err = new Error(
        `envoyhome.libreoffice_extract_failed: msiexec — ${(msi.stderr || msi.stdout).slice(0, 300)}`,
      ) as Error & { needsManualInstall?: boolean };
      err.needsManualInstall = true;
      throw err;
    }
    return { sofficeRelPath: input.entry.sofficeRelPath };
  }

  throw new Error(`envoyhome.libreoffice_extract_failed: unknown kind ${input.entry.kind}`);
}

export class LibreOfficeInstallService {
  private persisted: LibreOfficeInstallPersisted;
  private progress: LibreOfficeDownloadProgress = {
    bytesReceived: 0,
    phase: "idle",
  };
  private controller: AbortController | null = null;
  private running: Promise<void> | null = null;
  /** Synchronous gate so concurrent startInstall cannot double-download. */
  private starting = false;
  private liveStatus: LibreOfficeRuntimeStatus | null = null;

  constructor(
    private readonly paths: HomePaths,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {
    this.persisted = {
      catalogVersion: LIBREOFFICE_CATALOG_VERSION,
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
    this.progress = { bytesReceived: 0, phase: "idle" };
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.paths.libreOfficeInstallJson, "utf8");
      const parsed = JSON.parse(raw) as Partial<LibreOfficeInstallPersisted>;
      this.persisted = {
        catalogVersion: parsed.catalogVersion ?? LIBREOFFICE_CATALOG_VERSION,
        status: parsed.status ?? "idle",
        autoEnabled: parsed.autoEnabled !== false,
        declined: parsed.declined === true,
        attemptedSilent: parsed.attemptedSilent === true,
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        ...(parsed.managedSofficeRelPath
          ? { managedSofficeRelPath: parsed.managedSofficeRelPath }
          : {}),
        ...(parsed.lastError ? { lastError: parsed.lastError } : {}),
        ...(parsed.needsManualInstall ? { needsManualInstall: true } : {}),
      };
    } catch {
      /* fresh */
    }
  }

  private async save(): Promise<void> {
    await mkdir(this.paths.libreOfficeDir, { recursive: true });
    this.persisted.updatedAt = new Date().toISOString();
    await writeFile(
      this.paths.libreOfficeInstallJson,
      `${JSON.stringify(this.persisted, null, 2)}\n`,
      "utf8",
    );
  }

  managedSofficePath(): string | null {
    const rel = this.persisted.managedSofficeRelPath;
    if (!rel || this.persisted.status !== "ready") return null;
    try {
      return resolveManagedSofficePath(this.paths.libreOfficeRuntimeDir, rel);
    } catch {
      return null;
    }
  }

  catalogEntry(): LibreOfficeCatalogEntry | null {
    return testCatalogEntry ?? libreOfficeCatalogEntryForHost();
  }

  autoEnabled(): boolean {
    return this.persisted.autoEnabled && isAutoEnvEnabled(this.env);
  }

  /**
   * Silent first-boot: one attempt when missing, auto on, not declined,
   * and not already failed for this catalog version.
   */
  async maybeAutoInstall(): Promise<void> {
    if (!this.autoEnabled() || this.persisted.declined) return;
    if (this.running || this.starting) return;
    const { probeLibreOffice } = await import("./document-export-lo.js");
    // Prefer managed path via env for this probe.
    const managed = this.managedSofficePath();
    const probeEnv = managed
      ? { ...this.env, ENVOYHOME_LIBREOFFICE: managed }
      : this.env;
    const probe = await probeLibreOffice(probeEnv, { force: true });
    if (probe.available) {
      if (managed && probe.binaryPath === managed) {
        this.persisted.status = "ready";
        await this.save();
      }
      return;
    }
    if (this.persisted.attemptedSilent && this.persisted.status === "failed") {
      return; // no silent retry storm
    }
    if (
      this.persisted.attemptedSilent &&
      this.persisted.catalogVersion === LIBREOFFICE_CATALOG_VERSION &&
      this.persisted.status !== "idle"
    ) {
      return;
    }
    this.persisted.attemptedSilent = true;
    await this.save();
    void this.startInstall({ silent: true });
  }

  async startInstall(_opts?: { silent?: boolean }): Promise<DocumentExportStatus> {
    // Sync lock before any await — prevents double ~1GB download (V-OFFICE soft-risk).
    if (this.running || this.starting) return this.getStatus();
    this.starting = true;
    try {
      const entry = this.catalogEntry();
      if (!entry) {
        this.persisted.status = "failed";
        this.persisted.lastError =
          "envoyhome.libreoffice_unsupported_platform: no managed artifact for this OS/arch";
        this.persisted.needsManualInstall = true;
        await this.save();
        this.starting = false;
        return this.getStatus();
      }

      this.controller = new AbortController();
      this.liveStatus = "downloading";
      this.progress = { bytesReceived: 0, bytesTotal: entry.approxBytes, phase: "download" };
      delete this.persisted.lastError;
      delete this.persisted.needsManualInstall;
      await this.save();

      const run = async (): Promise<void> => {
        try {
          await mkdir(this.paths.libreOfficeDownloadsDir, { recursive: true });
          await mkdir(this.paths.libreOfficeRuntimeDir, { recursive: true });
          const dest = join(this.paths.libreOfficeDownloadsDir, entry.fileName);
          const download = testDownload ?? defaultDownload;
          const maxBytes = libreOfficeDownloadMaxBytes(entry.approxBytes);
          await download({
            url: entry.url,
            destPath: dest,
            signal: this.controller!.signal,
            maxBytes,
            expectedSha256: entry.sha256,
            onProgress: (received, total) => {
              this.progress = {
                bytesReceived: received,
                ...(total !== undefined
                  ? { bytesTotal: total }
                  : { bytesTotal: entry.approxBytes }),
                phase: "download",
              };
            },
          });
          this.progress = {
            bytesReceived: this.progress.bytesReceived,
            bytesTotal: this.progress.bytesTotal ?? entry.approxBytes,
            phase: "extract",
          };
          const extract = testExtract ?? defaultExtract;
          const { sofficeRelPath } = await extract({
            archivePath: dest,
            runtimeDir: this.paths.libreOfficeRuntimeDir,
            entry,
          });
          const abs = resolveManagedSofficePath(
            this.paths.libreOfficeRuntimeDir,
            sofficeRelPath,
          );
          await access(abs, fsConstants.X_OK).catch(async () => {
            await access(abs, fsConstants.R_OK);
          });
          this.persisted.status = "ready";
          this.persisted.managedSofficeRelPath = sofficeRelPath;
          this.persisted.catalogVersion = entry.version;
          delete this.persisted.lastError;
          this.liveStatus = null;
          this.progress = { bytesReceived: 0, phase: "idle" };
          await this.save();
          clearLibreOfficeProbeCache();
        } catch (err) {
          if (this.controller?.signal.aborted) {
            this.liveStatus = null;
            this.progress = { bytesReceived: 0, phase: "idle" };
            this.persisted.status = "failed";
            this.persisted.lastError = "envoyhome.libreoffice_cancelled";
            await this.save();
            return;
          }
          const msg = err instanceof Error ? err.message : String(err);
          this.persisted.status = "failed";
          this.persisted.lastError = msg.slice(0, 500);
          if (
            (err as { needsManualInstall?: boolean })?.needsManualInstall ||
            /needsManualInstall/i.test(msg)
          ) {
            this.persisted.needsManualInstall = true;
          }
          this.liveStatus = null;
          this.progress = { bytesReceived: 0, phase: "idle" };
          await this.save();
        } finally {
          this.controller = null;
          this.running = null;
          this.starting = false;
        }
      };

      this.running = run();
      return this.getStatus();
    } catch (err) {
      this.starting = false;
      throw err;
    }
  }

  async cancelInstall(): Promise<DocumentExportStatus> {
    this.controller?.abort();
    if (this.running) {
      await this.running.catch(() => undefined);
    }
    return this.getStatus();
  }

  async setPreference(input: {
    auto?: boolean;
    declined?: boolean;
  }): Promise<DocumentExportStatus> {
    if (typeof input.auto === "boolean") this.persisted.autoEnabled = input.auto;
    if (typeof input.declined === "boolean") {
      this.persisted.declined = input.declined;
      if (input.declined) {
        this.controller?.abort();
        this.persisted.status =
          this.persisted.status === "ready" ? "ready" : "declined";
      }
    }
    await this.save();
    return this.getStatus();
  }

  async getStatus(): Promise<DocumentExportStatus> {
    const { libreOfficeInstallHint, probeLibreOffice } = await import(
      "./document-export-lo.js"
    );
    const entry = this.catalogEntry();
    const hint = libreOfficeInstallHint();
    const managed = this.managedSofficePath();

    if (this.liveStatus === "downloading" || this.running) {
      const out: DocumentExportStatus = {
        libreOfficeRuntime: "downloading",
        libreOfficeInstallHint: hint,
        whyText: LIBREOFFICE_WHY_TEXT,
        download: { ...this.progress },
        autoInstall: {
          attempted: this.persisted.attemptedSilent,
          declined: this.persisted.declined,
          enabled: this.autoEnabled(),
        },
        ...(entry ? { approxBytes: entry.approxBytes } : {}),
      };
      return out;
    }

    // Probe with managed path preferred.
    const probeEnv = managed
      ? { ...this.env, ENVOYHOME_LIBREOFFICE: managed }
      : { ...this.env };
    // When probing system, don't force failed env from tests.
    const probe = await probeLibreOffice(probeEnv, { force: true });

    if (probe.available) {
      let installSource: LibreOfficeInstallSource = "system";
      if (this.env.ENVOYHOME_LIBREOFFICE?.trim() && !managed) {
        installSource = "env";
      } else if (managed && probe.binaryPath === managed) {
        installSource = "managed";
      } else if (managed && probe.binaryPath?.includes(this.paths.libreOfficeRuntimeDir)) {
        installSource = "managed";
      }
      const out: DocumentExportStatus = {
        libreOfficeRuntime: "ready",
        libreOfficeInstallHint: hint,
        whyText: LIBREOFFICE_WHY_TEXT,
        installSource,
        autoInstall: {
          attempted: this.persisted.attemptedSilent,
          declined: this.persisted.declined,
          enabled: this.autoEnabled(),
        },
        ...(probe.versionLine ? { versionLine: probe.versionLine } : {}),
        ...(entry ? { approxBytes: entry.approxBytes } : {}),
      };
      return out;
    }

    if (this.persisted.status === "failed") {
      const out: DocumentExportStatus = {
        libreOfficeRuntime: "failed",
        libreOfficeInstallHint: hint,
        whyText: LIBREOFFICE_WHY_TEXT,
        autoInstall: {
          attempted: this.persisted.attemptedSilent,
          declined: this.persisted.declined,
          enabled: this.autoEnabled(),
        },
        ...(this.persisted.lastError ? { lastError: this.persisted.lastError } : {}),
        ...(this.persisted.needsManualInstall ? { needsManualInstall: true } : {}),
        ...(entry ? { approxBytes: entry.approxBytes } : {}),
      };
      return out;
    }

    return {
      libreOfficeRuntime: "missing",
      libreOfficeInstallHint: hint,
      whyText: LIBREOFFICE_WHY_TEXT,
      autoInstall: {
        attempted: this.persisted.attemptedSilent,
        declined: this.persisted.declined,
        enabled: this.autoEnabled(),
      },
      ...(entry ? { approxBytes: entry.approxBytes } : {}),
    };
  }
}
