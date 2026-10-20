// Artifact catalogue + signed URLs — Design §4.1b / §9.6 / Plan B11 / §9.5d.

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { clampArtifactTtlSec } from "@envoyhome/protocol";
import {
  clampArtifactTtl,
  signArtifactToken,
  type ArtifactTokenPayload,
} from "./artifact-signer.js";
import {
  PathJailError,
  resolveSandboxPath,
  safeJoin,
  type WorkspaceMode,
  type WorkspaceMountRef,
} from "./fs-jail.js";
import type { HomePaths } from "./home-paths.js";

export interface ArtifactRow {
  id: string;
  path: string;
  createdAt: string;
}

/** R3-effective workspace mounts for open-by-path (Design §9.5d / §4.2.1). */
export type ArtifactWorkspaceLookup = (accountId: string) => Promise<{
  mounts: WorkspaceMountRef[];
  /** Legacy singular — first mount when present. */
  hostPath?: string;
  mode?: WorkspaceMode;
} | null>;

const ARTIFACT_SECRET_FILE = "artifact-secret";
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
/** File Explore one-level listing cap (Design §9.5d / V-OUT-4). */
const MAX_SANDBOX_LIST_ENTRIES = 500;

const SANDBOX_BROWSE_ROOTS = ["documents", "output", "knowledge", "uploads"] as const;

export interface SandboxEntry {
  name: string;
  kind: "dir" | "file";
  path: string;
  size?: number;
  modifiedAt?: string;
}

export interface SandboxListResult {
  path: string;
  parent?: string;
  roots: string[];
  entries: SandboxEntry[];
}

function isWorkspaceRelPath(relPath: string): boolean {
  const t = relPath.replace(/^\.\/+/, "").replace(/\\/g, "/");
  return t === "workspace" || t.startsWith("workspace/");
}

function normalizeBrowsePath(relPath: string): string {
  return relPath
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
}

function parentVirtualPath(relPath: string): string | undefined {
  const t = normalizeBrowsePath(relPath);
  if (!t) return undefined;
  const slash = t.lastIndexOf("/");
  if (slash < 0) return ""; // back to synthetic roots
  return t.slice(0, slash);
}

function isAllowedBrowsePrefix(relPath: string, workspaceActive: boolean): boolean {
  const t = normalizeBrowsePath(relPath);
  if (!t) return true;
  if (t === "share" || t.startsWith("share/")) return false;
  if (t === "workspace" || t.startsWith("workspace/")) return workspaceActive;
  for (const root of SANDBOX_BROWSE_ROOTS) {
    if (t === root || t.startsWith(`${root}/`)) return true;
  }
  return false;
}

export class ArtifactService {
  private secret: Buffer | null = null;
  private workspaceLookup: ArtifactWorkspaceLookup | null = null;

  constructor(
    private readonly paths: HomePaths,
    private readonly publicBaseUrl: () => string,
  ) {}

  /** Wire after AccountStore + household Owner lookup are ready. */
  setWorkspaceLookup(lookup: ArtifactWorkspaceLookup): void {
    this.workspaceLookup = lookup;
  }

  async ensureSecret(): Promise<Buffer> {
    if (this.secret) return this.secret;
    await mkdir(this.paths.secretsDir, { recursive: true });
    const secretPath = join(this.paths.secretsDir, ARTIFACT_SECRET_FILE);
    try {
      const existing = await readFile(secretPath);
      this.secret = existing;
      return existing;
    } catch {
      const generated = randomBytes(32);
      await writeFile(secretPath, generated, { mode: 0o600 });
      this.secret = generated;
      return generated;
    }
  }

  /**
   * Resolve a path for HTTP serve (sandbox under files/ only).
   * Workspace paths are mesh-open only — not signed HTTP (Design §9.5d).
   */
  resolveArtifactPath(accountId: string, relPath: string): string {
    const trimmed = relPath.replace(/^\.\/+/, "").replace(/^\/+/, "").replace(/\\/g, "/");
    if (isWorkspaceRelPath(trimmed)) {
      throw Object.assign(
        new Error("envoyhome.bad_params: workspace/ paths are mesh-open only (no signed HTTP)"),
        { code: "bad_params" },
      );
    }
    const filesRoot = this.paths.accountFiles(accountId);
    return safeJoin(filesRoot, trimmed);
  }

  /**
   * Resolve sandbox or workspace/… for mesh getContent (Design §9.5d open-by-path).
   */
  async resolveOpenPath(accountId: string, relPath: string): Promise<string> {
    const trimmed = relPath.replace(/^\.\/+/, "").replace(/^\/+/, "").replace(/\\/g, "/");
    if (trimmed.startsWith("share/") || trimmed === "share") {
      throw Object.assign(
        new Error("envoyhome.bad_params: share/ open deferred (Design §4.2)"),
        { code: "bad_params" },
      );
    }
    if (!isWorkspaceRelPath(trimmed)) {
      return safeJoin(this.paths.accountFiles(accountId), trimmed);
    }
    const ws = this.workspaceLookup ? await this.workspaceLookup(accountId) : null;
    const mounts = ws?.mounts ?? [];
    const primary = mounts[0];
    try {
      const resolved = resolveSandboxPath({
        accountFilesRoot: this.paths.accountFiles(accountId),
        shareRoot: this.paths.shareDir,
        path: trimmed,
        write: false,
        workspaceMounts: mounts,
        workspaceRoot: primary?.hostPath ?? ws?.hostPath ?? null,
        workspaceMode: primary?.mode ?? ws?.mode ?? null,
      });
      return resolved.absolute;
    } catch (err) {
      if (err instanceof PathJailError) {
        throw Object.assign(new Error(`envoyhome.bad_params: ${err.message}`), {
          code: "bad_params",
        });
      }
      throw err;
    }
  }

  private artifactIdForPath(relPath: string): string {
    return createHash("sha256").update(relPath).digest("hex").slice(0, 16);
  }

  /**
   * File Explore — one-level browse of profile-reachable virtual paths
   * (Design §9.5d / V-OUT-4). Empty path → synthetic roots.
   */
  async listSandboxEntries(
    accountId: string,
    relPath?: string,
  ): Promise<SandboxListResult> {
    const ws = this.workspaceLookup ? await this.workspaceLookup(accountId) : null;
    const mounts = ws?.mounts ?? [];
    const workspaceActive = mounts.length > 0 || Boolean(ws?.hostPath);
    const roots: string[] = [...SANDBOX_BROWSE_ROOTS];
    if (workspaceActive) roots.push("workspace");

    const trimmed = normalizeBrowsePath(relPath ?? "");
    if (!trimmed) {
      const entries: SandboxEntry[] = roots.map((name) => ({
        name,
        kind: "dir" as const,
        path: name,
      }));
      return { path: "", roots, entries };
    }

    if (trimmed === "share" || trimmed.startsWith("share/")) {
      throw Object.assign(
        new Error("envoyhome.bad_params: share/ browse deferred (Design §4.2)"),
        { code: "bad_params" },
      );
    }
    if (!isAllowedBrowsePrefix(trimmed, workspaceActive)) {
      throw Object.assign(
        new Error(
          workspaceActive
            ? `envoyhome.bad_params: path not browsable: ${trimmed}`
            : `envoyhome.bad_params: workspace root unset or path not browsable: ${trimmed}`,
        ),
        { code: "bad_params" },
      );
    }

    // Multi-mount: list mount ids under virtual `workspace/` before host readdir.
    if (trimmed === "workspace" && mounts.length > 1) {
      const entries: SandboxEntry[] = mounts.map((m) => ({
        name: m.id,
        kind: "dir" as const,
        path: `workspace/${m.id}`,
      }));
      return {
        path: trimmed,
        parent: "",
        roots,
        entries,
      };
    }

    const abs = await this.resolveOpenPath(accountId, trimmed);
    let st;
    try {
      st = await stat(abs);
    } catch (err) {
      throw Object.assign(
        new Error(
          `envoyhome.not_found: directory not found: ${trimmed}${
            err instanceof Error && err.message ? ` (${err.message})` : ""
          }`,
        ),
        { code: "not_found" },
      );
    }
    if (!st.isDirectory()) {
      throw Object.assign(
        new Error(`envoyhome.bad_params: not a directory: ${trimmed}`),
        { code: "bad_params" },
      );
    }

    let names: string[];
    try {
      names = await readdir(abs);
    } catch (err) {
      throw Object.assign(
        new Error(
          `envoyhome.bad_params: cannot list: ${trimmed}${
            err instanceof Error && err.message ? ` (${err.message})` : ""
          }`,
        ),
        { code: "bad_params" },
      );
    }

    const entries: SandboxEntry[] = [];
    for (const name of names) {
      if (entries.length >= MAX_SANDBOX_LIST_ENTRIES) break;
      if (name === "." || name === "..") continue;
      // Skip hidden names at browse surface (peer HomeFolderBrowser).
      if (name.startsWith(".")) continue;
      const childAbs = join(abs, name);
      let childSt;
      try {
        childSt = await stat(childAbs);
      } catch {
        continue;
      }
      const childRel = `${trimmed}/${name}`.replace(/\/{2,}/g, "/");
      if (childSt.isDirectory()) {
        entries.push({ name, kind: "dir", path: childRel });
        continue;
      }
      if (childSt.isFile()) {
        entries.push({
          name,
          kind: "file",
          path: childRel,
          size: childSt.size,
          modifiedAt: childSt.mtime.toISOString(),
        });
      }
    }

    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const parent = parentVirtualPath(trimmed);
    return {
      path: trimmed,
      ...(parent !== undefined ? { parent } : {}),
      roots,
      entries,
    };
  }

  /**
   * Sandbox Shared files only — never recurse host workspace (Design §9.5d).
   * `sessionId` is accepted for wire compat but ignored (filter was ineffective).
   */
  async listArtifacts(accountId: string, _sessionId?: string): Promise<ArtifactRow[]> {
    void _sessionId;
    const filesRoot = this.paths.accountFiles(accountId);
    await mkdir(filesRoot, { recursive: true });
    const scanRoots = ["output", "documents", "knowledge", "uploads"].map((d) =>
      join(filesRoot, d),
    );
    const rows: ArtifactRow[] = [];
    for (const root of scanRoots) {
      await this.collectArtifactFiles(filesRoot, root, rows);
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async collectArtifactFiles(
    filesRoot: string,
    dir: string,
    rows: ArtifactRow[],
  ): Promise<void> {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const abs = join(dir, name);
      let st;
      try {
        st = await stat(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        await this.collectArtifactFiles(filesRoot, abs, rows);
        continue;
      }
      if (!st.isFile()) continue;
      const rel = abs.slice(filesRoot.length + 1).replace(/\\/g, "/");
      rows.push({
        id: this.artifactIdForPath(rel),
        path: rel,
        createdAt: st.mtime.toISOString(),
      });
    }
  }

  async mintUrl(input: {
    accountId: string;
    path: string;
    ttlSec?: number;
  }): Promise<{ url: string; expiresAt: string }> {
    const trimmed = input.path.replace(/^\.\/+/, "").replace(/^\/+/, "").replace(/\\/g, "/");
    // Signed HTTP is sandbox-only; workspace is mesh-open (getArtifactContent).
    this.resolveArtifactPath(input.accountId, trimmed);
    const secret = await this.ensureSecret();
    const ttl = clampArtifactTtlSec(input.ttlSec ?? clampArtifactTtl(undefined));
    const expUnix = Math.floor(Date.now() / 1000) + ttl;
    const payload: ArtifactTokenPayload = {
      accountId: input.accountId,
      expUnix,
      path: trimmed,
    };
    const token = signArtifactToken(secret, payload);
    const base = this.publicBaseUrl().replace(/\/+$/, "");
    const url = `${base}/artifacts/${encodeURIComponent(input.accountId)}/${token}`;
    return { url, expiresAt: new Date(expUnix * 1000).toISOString() };
  }

  /** Write a UTF-8 artifact under accounts/<id>/files/ (path-jail). */
  async writeText(accountId: string, relPath: string, text: string): Promise<string> {
    const trimmed = relPath.replace(/^\.\/+/, "").replace(/^\/+/, "");
    const abs = this.resolveArtifactPath(accountId, trimmed);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, text, "utf8");
    return trimmed;
  }

  /**
   * Pull artifact bytes over the control plane (Design §9.5 mesh-first open).
   * Supports sandbox paths and workspace/… (open-by-path; not listed).
   */
  async getContent(
    accountId: string,
    relPath: string,
  ): Promise<{
    path: string;
    mimeType: string;
    encoding: "utf8" | "base64";
    text?: string;
    base64?: string;
    bytes: number;
  }> {
    const trimmed = relPath.replace(/^\.\/+/, "").replace(/^\/+/, "").replace(/\\/g, "/");
    const abs = await this.resolveOpenPath(accountId, trimmed);
    // Cap before read — whole-machine workspace/ or device nodes must not OOM (Design §9.5d).
    let st;
    try {
      st = await stat(abs);
    } catch (err) {
      throw Object.assign(
        new Error(
          `envoyhome.not_found: artifact not found: ${trimmed}${
            err instanceof Error && err.message ? ` (${err.message})` : ""
          }`,
        ),
        { code: "not_found" },
      );
    }
    if (!st.isFile()) {
      throw Object.assign(
        new Error(`envoyhome.bad_params: artifact path is not a regular file: ${trimmed}`),
        { code: "bad_params" },
      );
    }
    if (st.size > MAX_ARTIFACT_BYTES) {
      throw Object.assign(
        new Error(
          `envoyhome.bad_params: artifact exceeds ${MAX_ARTIFACT_BYTES} bytes (8 MiB open cap)`,
        ),
        { code: "bad_params" },
      );
    }
    const buf = await readFile(abs);
    const mimeType = mimeFromPath(trimmed);
    const isText =
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType === "application/xml";
    if (isText) {
      return {
        path: trimmed,
        mimeType,
        encoding: "utf8",
        text: buf.toString("utf8"),
        bytes: buf.byteLength,
      };
    }
    return {
      path: trimmed,
      mimeType,
      encoding: "base64",
      base64: buf.toString("base64"),
      bytes: buf.byteLength,
    };
  }
}

function mimeFromPath(relPath: string): string {
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".txt") || lower.endsWith(".log")) return "text/plain";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".rtf")) return "application/rtf";
  if (lower.endsWith(".epub")) return "application/epub+zip";
  if (lower.endsWith(".odt")) return "application/vnd.oasis.opendocument.text";
  if (lower.endsWith(".ods")) return "application/vnd.oasis.opendocument.spreadsheet";
  if (lower.endsWith(".odp")) return "application/vnd.oasis.opendocument.presentation";
  return "application/octet-stream";
}

export { MAX_ARTIFACT_BYTES, MAX_SANDBOX_LIST_ENTRIES, mimeFromPath };
