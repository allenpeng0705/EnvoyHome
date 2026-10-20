// Account CRUD + on-disk skeleton — Design §4.2 / Appendix A.3 / Plan B3.

import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  access,
} from "node:fs/promises";
import { lstatSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { DEFAULT_IDENTITY_MD } from "@envoyhome/memory";
import { homePaths, type HomePaths } from "./home-paths.js";
import {
  isFilesystemRoot,
  safeJoin,
  type WorkspaceMode,
  type WorkspaceMountRef,
} from "./fs-jail.js";
import type { HomeCaller } from "./auth.js";

export type ToolPolicyPreset = "standard" | "restricted";

/** One named host folder (Design §4.2.1 multi-folder). */
export interface WorkspaceMount {
  id: string;
  hostPath: string;
  mode: WorkspaceMode;
  updatedAt: string;
}

/** @deprecated Prefer mounts[]; kept for type aliases at call sites that used singular. */
export interface AccountWorkspace {
  hostPath: string;
  mode: WorkspaceMode;
  updatedAt: string;
}

export const MAX_WORKSPACE_MOUNTS = 16;
const MOUNT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function uniqueMountId(base: string, used: Set<string>): string {
  let id = base || "folder";
  if (!MOUNT_ID_RE.test(id)) id = "folder";
  if (!used.has(id)) {
    used.add(id);
    return id;
  }
  for (let i = 2; i < 1000; i++) {
    const cand = `${id}-${i}`;
    if (!used.has(cand)) {
      used.add(cand);
      return cand;
    }
  }
  throw new AccountError("bad_params", "could not allocate unique mount id");
}

export function suggestMountId(hostPath: string, used: Set<string>): string {
  if (isFilesystemRoot(hostPath)) return uniqueMountId("root", used);
  const base = basename(hostPath.replace(/[\\/]+$/, "")) || "folder";
  const slug = base.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "folder";
  return uniqueMountId(slug.slice(0, 64), used);
}

export interface AccountRecord {
  accountId: string;
  displayName: string;
  createdAt: string;
  locale?: string;
  /** IANA time zone for schedule NL resolve (Design §7.4). */
  timeZone?: string;
  toolPolicy?: ToolPolicyPreset;
}

export interface AccountProfileFile {
  version: number;
  updatedAt: string;
  facts: Record<string, unknown>;
  displayName: string;
  locale?: string;
  timeZone?: string;
  toolPolicy: ToolPolicyPreset;
}

const ACCOUNT_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

const SKELETON_DIRS = [
  "memory",
  "learns",
  "sessions",
  "files",
  "files/documents",
  "files/output",
  "files/knowledge",
  "skills",
  "approvals",
  "grants",
] as const;

function slugFromDisplayName(displayName: string): string {
  const base = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (base.length > 0 && ACCOUNT_ID_RE.test(base)) return base;
  return `acct-${randomUUID().slice(0, 8)}`;
}

export class AccountError extends Error {
  override readonly name = "AccountError";
  constructor(
    readonly kind: "bad_params" | "auth" | "not_found" | "conflict",
    message: string,
  ) {
    super(message);
  }
}

/** Fail closed on unknown IANA names (Design §7.4 account TZ). */
export function assertIanaTimeZone(raw: string): string {
  const tz = raw.trim();
  if (!tz) {
    throw new AccountError("bad_params", "timeZone must be a non-empty IANA name");
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
  } catch {
    throw new AccountError("bad_params", `unknown IANA timeZone: ${tz}`);
  }
  return tz;
}

export class AccountStore {
  readonly paths: HomePaths;

  constructor(stateDir: string) {
    this.paths = homePaths(stateDir);
  }

  async ensureLayout(): Promise<void> {
    await mkdir(this.paths.accountsDir, { recursive: true });
    await mkdir(this.paths.shareDir, { recursive: true });
    await mkdir(this.paths.pairedDevicesDir, { recursive: true });
    await mkdir(this.paths.workflowsDir, { recursive: true });
    await mkdir(this.paths.skillsDir, { recursive: true });
    await mkdir(this.paths.providersDir, { recursive: true });
    await mkdir(this.paths.secretsDir, { recursive: true });
  }

  private metaPath(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "account.json");
  }

  private profilePath(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "profile.json");
  }

  async list(): Promise<AccountRecord[]> {
    await this.ensureLayout();
    let names: string[];
    try {
      names = await readdir(this.paths.accountsDir);
    } catch {
      return [];
    }
    const out: AccountRecord[] = [];
    for (const name of names.sort()) {
      const rec = await this.get(name);
      if (rec) out.push(rec);
    }
    return out;
  }

  async get(accountId: string): Promise<AccountRecord | undefined> {
    try {
      const raw = JSON.parse(await readFile(this.metaPath(accountId), "utf8")) as AccountRecord;
      if (typeof raw.accountId !== "string" || typeof raw.displayName !== "string") {
        return undefined;
      }
      const rec: AccountRecord = {
        accountId: raw.accountId,
        displayName: raw.displayName,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
      };
      if (typeof raw.locale === "string") rec.locale = raw.locale;
      if (typeof raw.timeZone === "string" && raw.timeZone.trim()) {
        try {
          rec.timeZone = assertIanaTimeZone(raw.timeZone);
        } catch {
          /* ignore corrupt on-disk TZ */
        }
      }
      if (raw.toolPolicy === "standard" || raw.toolPolicy === "restricted") {
        rec.toolPolicy = raw.toolPolicy;
      }
      return rec;
    } catch {
      return undefined;
    }
  }

  async create(input: {
    accountId?: string;
    displayName: string;
    locale?: string;
    timeZone?: string;
  }): Promise<AccountRecord> {
    await this.ensureLayout();
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new AccountError("bad_params", "displayName is required");
    }

    let accountId = input.accountId?.trim();
    if (!accountId) {
      accountId = slugFromDisplayName(displayName);
      // Avoid collision with an existing account.
      if (await this.get(accountId)) {
        accountId = `${accountId}-${randomUUID().slice(0, 6)}`;
      }
    }
    if (!ACCOUNT_ID_RE.test(accountId)) {
      throw new AccountError(
        "bad_params",
        "accountId must match ^[a-z0-9][a-z0-9_-]*$",
      );
    }
    if (await this.get(accountId)) {
      throw new AccountError("conflict", `account already exists: ${accountId}`);
    }

    const root = this.paths.accountRoot(accountId);
    await mkdir(root, { recursive: true });
    for (const dir of SKELETON_DIRS) {
      await mkdir(join(root, dir), { recursive: true });
    }

    const createdAt = new Date().toISOString();
    const record: AccountRecord = {
      accountId,
      displayName,
      createdAt,
    };
    if (input.locale !== undefined) record.locale = input.locale;
    if (input.timeZone !== undefined) {
      record.timeZone = assertIanaTimeZone(input.timeZone);
    }

    const profile: AccountProfileFile = {
      version: 1,
      updatedAt: createdAt,
      facts: {},
      displayName,
      toolPolicy: "standard",
    };
    if (input.locale !== undefined) profile.locale = input.locale;
    if (record.timeZone !== undefined) profile.timeZone = record.timeZone;

    await writeFile(this.metaPath(accountId), JSON.stringify(record, null, 2) + "\n", "utf8");
    await writeFile(this.profilePath(accountId), JSON.stringify(profile, null, 2) + "\n", "utf8");
    await writeFile(join(root, "MEMORY.md"), "# MEMORY\n", "utf8");
    await writeFile(
      join(root, "IDENTITY.md"),
      DEFAULT_IDENTITY_MD.endsWith("\n") ? DEFAULT_IDENTITY_MD : `${DEFAULT_IDENTITY_MD}\n`,
      "utf8",
    );
    await writeFile(join(root, "COMPACT.md"), "# COMPACT\n", "utf8");

    return record;
  }

  async update(input: {
    accountId: string;
    displayName?: string;
    locale?: string;
    timeZone?: string;
    toolPolicy?: ToolPolicyPreset;
  }): Promise<AccountRecord> {
    const existing = await this.get(input.accountId);
    if (!existing) {
      throw new AccountError("not_found", `unknown account: ${input.accountId}`);
    }
    const next: AccountRecord = {
      accountId: existing.accountId,
      displayName:
        input.displayName !== undefined ? input.displayName.trim() : existing.displayName,
      createdAt: existing.createdAt,
    };
    if (!next.displayName) {
      throw new AccountError("bad_params", "displayName must be non-empty");
    }
    const locale = input.locale !== undefined ? input.locale : existing.locale;
    if (locale !== undefined) next.locale = locale;
    if (input.timeZone !== undefined) {
      next.timeZone = assertIanaTimeZone(input.timeZone);
    } else if (existing.timeZone !== undefined) {
      next.timeZone = existing.timeZone;
    }
    const toolPolicy =
      input.toolPolicy !== undefined ? input.toolPolicy : existing.toolPolicy;
    if (toolPolicy !== undefined) next.toolPolicy = toolPolicy;

    await writeFile(this.metaPath(input.accountId), JSON.stringify(next, null, 2) + "\n", "utf8");

    // Keep profile.json display fields in sync (standing facts untouched).
    try {
      const profile = JSON.parse(
        await readFile(this.profilePath(input.accountId), "utf8"),
      ) as AccountProfileFile;
      profile.displayName = next.displayName;
      profile.updatedAt = new Date().toISOString();
      if (next.locale !== undefined) profile.locale = next.locale;
      if (next.timeZone !== undefined) profile.timeZone = next.timeZone;
      if (next.toolPolicy !== undefined) profile.toolPolicy = next.toolPolicy;
      await writeFile(
        this.profilePath(input.accountId),
        JSON.stringify(profile, null, 2) + "\n",
        "utf8",
      );
    } catch {
      // profile.json is best-effort here; meta is authoritative for list/update.
    }

    return next;
  }

  /**
   * Delete an account directory. Fails closed when sessions/ or approvals/ are
   * non-empty unless `force` (Design A.3).
   */
  async delete(input: {
    accountId: string;
    confirm: boolean;
    force?: boolean;
  }): Promise<void> {
    if (!input.confirm) {
      throw new AccountError("bad_params", "confirm must be true");
    }
    const existing = await this.get(input.accountId);
    if (!existing) {
      throw new AccountError("not_found", `unknown account: ${input.accountId}`);
    }

    if (!input.force) {
      const sessions = await this.dirHasEntries(input.accountId, "sessions");
      const approvals = await this.dirHasEntries(input.accountId, "approvals");
      if (sessions || approvals) {
        throw new AccountError(
          "conflict",
          "account has active sessions or pending approvals; pass force: true",
        );
      }
    }

    await rm(this.paths.accountRoot(input.accountId), { recursive: true, force: true });
  }

  private async dirHasEntries(accountId: string, rel: string): Promise<boolean> {
    try {
      const entries = await readdir(join(this.paths.accountRoot(accountId), rel));
      return entries.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * V-SEC-1: a non-owner principal may only touch accounts it is bound to.
   * Loopback owner may act for any account (Design §4.1 rule 6).
   */
  assertCanAccessAccount(caller: HomeCaller, accountId: string): void {
    if (caller.kind === "loopback-owner") return;
    if (caller.accountIds.includes(accountId)) return;
    throw new AccountError(
      "auth",
      `envoyhome.account_not_bound: not bound to account ${accountId}`,
    );
  }

  /**
   * Read a file under an account root via safeJoin (V-SEC-1 + V-SEC-2).
   * `relPath` is relative to the account root (e.g. `profile.json`, `files/documents/x`).
   */
  async readAccountFile(
    caller: HomeCaller,
    accountId: string,
    relPath: string,
  ): Promise<string> {
    this.assertCanAccessAccount(caller, accountId);
    const existing = await this.get(accountId);
    if (!existing) {
      throw new AccountError("not_found", `unknown account: ${accountId}`);
    }
    const abs = safeJoin(this.paths.accountRoot(accountId), relPath);
    try {
      await access(abs);
    } catch {
      throw new AccountError("not_found", `file not found: ${relPath}`);
    }
    return readFile(abs, "utf8");
  }

  /** Resolve a path under an account's files/ jail. */
  resolveAccountFilesPath(accountId: string, relPath: string): string {
    return safeJoin(this.paths.accountFiles(accountId), relPath);
  }

  private workspacePath(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "workspace.json");
  }

  /**
   * Design §4.2.1 — named host folder mounts for `workspace/<id>/…`.
   * Absent / empty ⇒ unset. Migrates legacy `{ hostPath, mode }` to one mount.
   */
  async getWorkspaceMounts(accountId: string): Promise<WorkspaceMount[]> {
    const existing = await this.get(accountId);
    if (!existing) {
      throw new AccountError("not_found", `unknown account: ${accountId}`);
    }
    try {
      const raw = JSON.parse(await readFile(this.workspacePath(accountId), "utf8")) as {
        hostPath?: unknown;
        mode?: unknown;
        updatedAt?: unknown;
        mounts?: unknown;
      };
      if (Array.isArray(raw.mounts)) {
        const out: WorkspaceMount[] = [];
        const used = new Set<string>();
        for (const item of raw.mounts) {
          if (!item || typeof item !== "object") continue;
          const m = item as Record<string, unknown>;
          if (typeof m.hostPath !== "string" || !m.hostPath.trim()) continue;
          const mode = m.mode === "rw" ? "rw" : m.mode === "ro" ? "ro" : null;
          if (!mode) continue;
          let id =
            typeof m.id === "string" && MOUNT_ID_RE.test(m.id)
              ? m.id
              : suggestMountId(m.hostPath.trim(), used);
          if (used.has(id)) id = uniqueMountId(id, used);
          else used.add(id);
          out.push({
            id,
            hostPath: m.hostPath.trim(),
            mode,
            updatedAt:
              typeof m.updatedAt === "string"
                ? m.updatedAt
                : typeof raw.updatedAt === "string"
                  ? raw.updatedAt
                  : new Date(0).toISOString(),
          });
        }
        return out;
      }
      // Legacy singular shape.
      if (typeof raw.hostPath !== "string" || !raw.hostPath.trim()) return [];
      const mode = raw.mode === "rw" ? "rw" : raw.mode === "ro" ? "ro" : null;
      if (!mode) return [];
      const used = new Set<string>();
      return [
        {
          id: suggestMountId(raw.hostPath.trim(), used),
          hostPath: raw.hostPath.trim(),
          mode,
          updatedAt:
            typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
        },
      ];
    } catch {
      return [];
    }
  }

  /** @deprecated Use getWorkspaceMounts — returns first mount or null. */
  async getWorkspace(accountId: string): Promise<AccountWorkspace | null> {
    const mounts = await this.getWorkspaceMounts(accountId);
    const first = mounts[0];
    if (!first) return null;
    return {
      hostPath: first.hostPath,
      mode: first.mode,
      updatedAt: first.updatedAt,
    };
  }

  /** Wire-facing getWorkspace (Design §4.2.1). Includes mounts[] + legacy singular fields. */
  async getWorkspacePublic(
    accountId: string,
    ownerAccountId?: string | null,
  ): Promise<{
    configured: boolean;
    mounts: Array<{
      id: string;
      displayPath: string;
      mode: WorkspaceMode;
      filesystemRoot: boolean;
      active: boolean;
    }>;
    mode?: WorkspaceMode;
    displayPath?: string;
    filesystemRoot?: boolean;
    active?: boolean;
  }> {
    const mounts = await this.getWorkspaceMounts(accountId);
    if (mounts.length === 0) return { configured: false, mounts: [] };
    const effective =
      ownerAccountId === undefined
        ? mounts
        : await this.getWorkspaceMountsEffective(accountId, ownerAccountId);
    const effectiveIds = new Set(effective.map((m) => m.id));
    const publicMounts = mounts.map((m) => ({
      id: m.id,
      displayPath: m.hostPath,
      mode: m.mode,
      filesystemRoot: isFilesystemRoot(m.hostPath),
      active: effectiveIds.has(m.id),
    }));
    const primary = publicMounts.find((m) => m.active) ?? publicMounts[0]!;
    return {
      configured: true,
      mounts: publicMounts,
      mode: primary.mode,
      displayPath: primary.displayPath,
      filesystemRoot: primary.filesystemRoot,
      active: primary.active,
    };
  }

  /**
   * Effective mounts for tools (Design §4.1.1 R3 / V-SEC-20).
   * Filesystem-root mounts are dropped for non-Owner seats.
   */
  async getWorkspaceMountsEffective(
    accountId: string,
    ownerAccountId: string | null | undefined,
  ): Promise<WorkspaceMount[]> {
    const mounts = await this.getWorkspaceMounts(accountId);
    return mounts.filter((m) => {
      if (!isFilesystemRoot(m.hostPath)) return true;
      return Boolean(ownerAccountId && accountId === ownerAccountId);
    });
  }

  /** @deprecated Prefer getWorkspaceMountsEffective — first effective mount or null. */
  async getWorkspaceEffective(
    accountId: string,
    ownerAccountId: string | null | undefined,
  ): Promise<AccountWorkspace | null> {
    const mounts = await this.getWorkspaceMountsEffective(accountId, ownerAccountId);
    const first = mounts[0];
    if (!first) return null;
    return {
      hostPath: first.hostPath,
      mode: first.mode,
      updatedAt: first.updatedAt,
    };
  }

  /** Mount refs for resolveSandboxPath. */
  async getWorkspaceMountRefs(
    accountId: string,
    ownerAccountId: string | null | undefined,
  ): Promise<WorkspaceMountRef[]> {
    const mounts = await this.getWorkspaceMountsEffective(accountId, ownerAccountId);
    return mounts.map((m) => ({ id: m.id, hostPath: m.hostPath, mode: m.mode }));
  }

  /**
   * Clear filesystem-root mounts on non-Owner seats (transfer / Doctor / R3).
   * Returns accountIds that had at least one mount removed.
   */
  async clearNonOwnerFilesystemRoots(
    ownerAccountId: string | null,
  ): Promise<string[]> {
    const cleared: string[] = [];
    for (const a of await this.list()) {
      if (ownerAccountId && a.accountId === ownerAccountId) continue;
      const mounts = await this.getWorkspaceMounts(a.accountId);
      const kept = mounts.filter((m) => !isFilesystemRoot(m.hostPath));
      if (kept.length === mounts.length) continue;
      if (kept.length === 0) {
        await this.clearWorkspace(a.accountId);
      } else {
        await this.setWorkspaceMounts({
          accountId: a.accountId,
          mounts: kept.map((m) => ({
            id: m.id,
            hostPath: m.hostPath,
            mode: m.mode,
          })),
          ownerAccountId,
        });
      }
      cleared.push(a.accountId);
    }
    return cleared;
  }

  private async normalizeHostPath(
    accountId: string,
    hostPathIn: string,
    mode: WorkspaceMode,
    ownerAccountId?: string | null,
  ): Promise<{ hostPath: string; mode: WorkspaceMode }> {
    const trimmed = hostPathIn.trim();
    if (!trimmed) {
      throw new AccountError("bad_params", "hostPath is required");
    }
    if (!isAbsolute(trimmed) && !/^[A-Za-z]:[\\/]/.test(trimmed)) {
      throw new AccountError("bad_params", "hostPath must be an absolute path");
    }
    const abs = resolve(trimmed);
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      throw new AccountError("bad_params", `hostPath does not exist: ${abs}`);
    }
    if (!st.isDirectory()) {
      throw new AccountError("bad_params", "hostPath must be a directory");
    }
    let hostPath = abs;
    try {
      hostPath = realpathSync(abs);
    } catch {
      /* keep resolve()'d path */
    }
    if (isFilesystemRoot(hostPath)) {
      const ownerId = ownerAccountId ?? null;
      if (!ownerId || accountId !== ownerId) {
        throw new AccountError(
          "auth",
          "envoyhome.workspace_root_owner_only: filesystem-root workspace is only for the household Owner account",
        );
      }
    }
    if (mode !== "ro" && mode !== "rw") {
      throw new AccountError("bad_params", "mode must be ro or rw");
    }
    return { hostPath, mode };
  }

  /** Replace all mounts (Design §4.2.1 multi-folder). */
  async setWorkspaceMounts(input: {
    accountId: string;
    mounts: Array<{ id?: string; hostPath: string; mode: WorkspaceMode }>;
    ownerAccountId?: string | null;
  }): Promise<WorkspaceMount[]> {
    const existing = await this.get(input.accountId);
    if (!existing) {
      throw new AccountError("not_found", `unknown account: ${input.accountId}`);
    }
    if (input.mounts.length > MAX_WORKSPACE_MOUNTS) {
      throw new AccountError(
        "bad_params",
        `at most ${MAX_WORKSPACE_MOUNTS} workspace folders per profile`,
      );
    }
    const updatedAt = new Date().toISOString();
    const used = new Set<string>();
    const seenPaths = new Set<string>();
    const record: WorkspaceMount[] = [];
    const pathKey = (p: string) =>
      process.platform === "win32" ? p.toLowerCase() : p;
    for (const raw of input.mounts) {
      const { hostPath, mode } = await this.normalizeHostPath(
        input.accountId,
        raw.hostPath,
        raw.mode,
        input.ownerAccountId,
      );
      const key = pathKey(hostPath);
      if (seenPaths.has(key)) {
        // Later entries win — drop the earlier mount with the same resolved path.
        const idx = record.findIndex((m) => pathKey(m.hostPath) === key);
        if (idx >= 0) {
          used.delete(record[idx]!.id);
          record.splice(idx, 1);
        }
      }
      seenPaths.add(key);
      let id =
        typeof raw.id === "string" && MOUNT_ID_RE.test(raw.id)
          ? raw.id
          : suggestMountId(hostPath, used);
      if (used.has(id)) id = uniqueMountId(id, used);
      else used.add(id);
      record.push({ id, hostPath, mode, updatedAt });
    }
    await writeFile(
      this.workspacePath(input.accountId),
      JSON.stringify({ mounts: record }, null, 2) + "\n",
      "utf8",
    );
    return record;
  }

  /** Set/replace with a single folder (compat). */
  async setWorkspace(input: {
    accountId: string;
    hostPath: string;
    mode: WorkspaceMode;
    id?: string;
    ownerAccountId?: string | null;
  }): Promise<AccountWorkspace> {
    const mounts = await this.setWorkspaceMounts({
      accountId: input.accountId,
      mounts: [
        {
          ...(input.id ? { id: input.id } : {}),
          hostPath: input.hostPath,
          mode: input.mode,
        },
      ],
      ...(input.ownerAccountId !== undefined
        ? { ownerAccountId: input.ownerAccountId }
        : {}),
    });
    const first = mounts[0]!;
    return {
      hostPath: first.hostPath,
      mode: first.mode,
      updatedAt: first.updatedAt,
    };
  }

  /** Add or update one mount by id (keeps other mounts). Dedupes by resolved hostPath. */
  async upsertWorkspaceMount(input: {
    accountId: string;
    hostPath: string;
    mode: WorkspaceMode;
    id?: string;
    ownerAccountId?: string | null;
  }): Promise<WorkspaceMount[]> {
    const current = await this.getWorkspaceMounts(input.accountId);
    const { hostPath, mode } = await this.normalizeHostPath(
      input.accountId,
      input.hostPath,
      input.mode,
      input.ownerAccountId,
    );
    const samePath = (a: string, b: string) =>
      process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
    const existingSamePath = current.find((m) => samePath(m.hostPath, hostPath));
    const used = new Set(current.map((m) => m.id));
    let id: string;
    if (typeof input.id === "string" && MOUNT_ID_RE.test(input.id)) {
      id = input.id;
    } else if (existingSamePath) {
      id = existingSamePath.id;
    } else {
      id = suggestMountId(hostPath, used);
    }
    // Drop this id and any other mount pointing at the same host folder.
    const next = current.filter(
      (m) => m.id !== id && !samePath(m.hostPath, hostPath),
    );
    if (next.length >= MAX_WORKSPACE_MOUNTS) {
      throw new AccountError(
        "bad_params",
        `at most ${MAX_WORKSPACE_MOUNTS} workspace folders per profile`,
      );
    }
    next.push({
      id,
      hostPath,
      mode,
      updatedAt: new Date().toISOString(),
    });
    return this.setWorkspaceMounts({
      accountId: input.accountId,
      mounts: next.map((m) => ({ id: m.id, hostPath: m.hostPath, mode: m.mode })),
      ...(input.ownerAccountId !== undefined
        ? { ownerAccountId: input.ownerAccountId }
        : {}),
    });
  }

  async removeWorkspaceMount(input: {
    accountId: string;
    id: string;
  }): Promise<WorkspaceMount[]> {
    const current = await this.getWorkspaceMounts(input.accountId);
    const next = current.filter((m) => m.id !== input.id);
    if (next.length === current.length) {
      throw new AccountError("not_found", `unknown workspace mount: ${input.id}`);
    }
    if (next.length === 0) {
      await this.clearWorkspace(input.accountId);
      return [];
    }
    return this.setWorkspaceMounts({
      accountId: input.accountId,
      mounts: next.map((m) => ({ id: m.id, hostPath: m.hostPath, mode: m.mode })),
    });
  }

  async clearWorkspace(accountId: string): Promise<void> {
    const existing = await this.get(accountId);
    if (!existing) {
      throw new AccountError("not_found", `unknown account: ${accountId}`);
    }
    try {
      await rm(this.workspacePath(accountId), { force: true });
    } catch {
      // already absent
    }
  }
}
