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
import { join } from "node:path";
import { homePaths, type HomePaths } from "./home-paths.js";
import { safeJoin } from "./fs-jail.js";
import type { HomeCaller } from "./auth.js";

export type ToolPolicyPreset = "standard" | "restricted";

export interface AccountRecord {
  accountId: string;
  displayName: string;
  createdAt: string;
  locale?: string;
  toolPolicy?: ToolPolicyPreset;
}

export interface AccountProfileFile {
  version: number;
  updatedAt: string;
  facts: Record<string, unknown>;
  displayName: string;
  locale?: string;
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

    const profile: AccountProfileFile = {
      version: 1,
      updatedAt: createdAt,
      facts: {},
      displayName,
      toolPolicy: "standard",
    };
    if (input.locale !== undefined) profile.locale = input.locale;

    await writeFile(this.metaPath(accountId), JSON.stringify(record, null, 2) + "\n", "utf8");
    await writeFile(this.profilePath(accountId), JSON.stringify(profile, null, 2) + "\n", "utf8");
    await writeFile(join(root, "MEMORY.md"), "# MEMORY\n", "utf8");
    await writeFile(join(root, "COMPACT.md"), "# COMPACT\n", "utf8");

    return record;
  }

  async update(input: {
    accountId: string;
    displayName?: string;
    locale?: string;
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
}
