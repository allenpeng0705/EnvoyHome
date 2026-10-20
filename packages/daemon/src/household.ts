// Household Owner — Design §4.1.1 (ownerAccountId, transfer, exclusive-bind).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { homePaths } from "./home-paths.js";
import type { HomeCaller } from "./auth.js";

export class HouseholdError extends Error {
  override readonly name = "HouseholdError";
  constructor(
    readonly kind: "bad_params" | "auth" | "not_found" | "conflict" | "forbidden",
    message: string,
  ) {
    super(message);
  }
}

interface HouseholdFile {
  ownerAccountId?: string;
}

/** Design §4.1.1 — loopback or exclusive bind to ownerAccountId. */
export function isHouseholdOwner(
  caller: HomeCaller,
  ownerAccountId: string | null | undefined,
): boolean {
  if (caller.kind === "loopback-owner") return true;
  if (caller.kind !== "device" || !ownerAccountId) return false;
  return caller.accountIds.length === 1 && caller.accountIds[0] === ownerAccountId;
}

/**
 * Memory Design §13 + Design §4.1.1 R5 — paired member → untrusted;
 * loopback / exclusive-Owner seat → owner. Channel `trustedChannel` / schedules
 * pass `agent` via the turn path, not this helper.
 */
export function memoryTrustForTurn(
  caller: HomeCaller,
  accountId: string,
  ownerAccountId: string | null | undefined,
): "owner" | "untrusted" {
  if (caller.kind === "loopback-owner") return "owner";
  if (
    caller.kind === "device" &&
    isHouseholdOwner(caller, ownerAccountId) &&
    accountId === ownerAccountId
  ) {
    return "owner";
  }
  return "untrusted";
}

/** Design §4.1.1 seat-or-Owner — own seats, or household Owner, or loopback. */
export function mayActForSeat(
  caller: HomeCaller,
  accountId: string,
  ownerAccountId: string | null | undefined,
): boolean {
  if (caller.kind === "loopback-owner") return true;
  if (isHouseholdOwner(caller, ownerAccountId)) return true;
  return caller.accountIds.includes(accountId);
}

/**
 * Refuse Owner + other seats on one device (Design §4.1.1 R2 / V-SEC-19).
 * No-op when ownerAccountId is unset or not in the list.
 */
export function assertOwnerExclusiveBind(
  accountIds: string[],
  ownerAccountId: string | null | undefined,
): void {
  if (!ownerAccountId) return;
  if (!accountIds.includes(ownerAccountId)) return;
  if (accountIds.length === 1 && accountIds[0] === ownerAccountId) return;
  throw new HouseholdError(
    "forbidden",
    "envoyhome.owner_bind_exclusive: Owner device must bind only to ownerAccountId",
  );
}

export class HouseholdStore {
  private readonly path: string;
  private ownerAccountId: string | null = null;
  private loaded = false;

  constructor(stateDir: string) {
    this.path = homePaths(stateDir).householdJson;
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.path, "utf8")) as HouseholdFile;
      this.ownerAccountId =
        typeof raw.ownerAccountId === "string" && raw.ownerAccountId.length > 0
          ? raw.ownerAccountId
          : null;
    } catch {
      this.ownerAccountId = null;
    }
    this.loaded = true;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load();
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const body: HouseholdFile = {};
    if (this.ownerAccountId) body.ownerAccountId = this.ownerAccountId;
    await writeFile(this.path, JSON.stringify(body, null, 2) + "\n", "utf8");
  }

  getOwnerAccountId(): string | null {
    return this.ownerAccountId;
  }

  /** First account becomes Owner; further creates leave Owner unchanged. */
  async onAccountCreated(accountId: string): Promise<void> {
    await this.ensureLoaded();
    if (this.ownerAccountId) return;
    this.ownerAccountId = accountId;
    await this.persist();
  }

  /**
   * Refuse deleting the Owner until transfer (Design §4.1.1).
   */
  async assertDeletable(accountId: string): Promise<void> {
    await this.ensureLoaded();
    if (this.ownerAccountId === accountId) {
      throw new HouseholdError(
        "forbidden",
        "envoyhome.owner_delete_forbidden: transfer household Owner before deleting this account",
      );
    }
  }

  async transfer(toAccountId: string): Promise<string> {
    await this.ensureLoaded();
    if (!toAccountId.trim()) {
      throw new HouseholdError("bad_params", "toAccountId is required");
    }
    this.ownerAccountId = toAccountId;
    await this.persist();
    return this.ownerAccountId;
  }

  /**
   * Doctor Fix: accounts exist but owner missing/invalid → oldest by `createdAt`
   * (then accountId); Design §4.1.1 bootstrap.
   */
  async fixMissingOwner(
    accounts: Array<{ accountId: string; createdAt?: string } | string>,
  ): Promise<string | null> {
    await this.ensureLoaded();
    const rows = accounts
      .map((a) =>
        typeof a === "string"
          ? { accountId: a, createdAt: "" }
          : { accountId: a.accountId, createdAt: a.createdAt ?? "" },
      )
      .filter((a) => a.accountId.length > 0)
      .sort((a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
        return a.accountId.localeCompare(b.accountId);
      });
    if (rows.length === 0) {
      this.ownerAccountId = null;
      await this.persist();
      return null;
    }
    const ids = rows.map((r) => r.accountId);
    if (this.ownerAccountId && ids.includes(this.ownerAccountId)) {
      return this.ownerAccountId;
    }
    this.ownerAccountId = rows[0]!.accountId;
    await this.persist();
    return this.ownerAccountId;
  }
}
