// Durable approvals + grants (Design §4.4). Fail-closed TTL. Not HomeClaw in-memory.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type RiskTier = "read" | "write" | "exec" | "network" | "admin" | "sensitive";
export type TurnOrigin = "attended" | "unattended";

export interface PendingApproval {
  id: string;
  accountId: string;
  agentId: string;
  turnId: string;
  tool: string;
  argsDigest: string;
  risk: RiskTier;
  origin: TurnOrigin;
  summary?: string;
  createdAt: string;
  expiresAt: string;
}

export interface Grant {
  id: string;
  accountId: string;
  tool: string;
  argsDigest: string;
  risk: RiskTier;
  grantedBy: string;
  createdAt: string;
  expiresAt: string | null;
  claimedBy?: string | null;
}

const DEFAULT_TTL_SEC = 600;

export function canonicalDigest(value: unknown): string {
  const json = canonicalJson(value);
  return `sha256:${createHash("sha256").update(json, "utf8").digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export class ApprovalStore {
  constructor(private readonly accountDir: (accountId: string) => string) {}

  private approvalsDir(accountId: string): string {
    return join(this.accountDir(accountId), "approvals");
  }

  private grantsDir(accountId: string): string {
    return join(this.accountDir(accountId), "grants");
  }

  async createApproval(
    input: Omit<PendingApproval, "id" | "createdAt" | "expiresAt"> & { ttlSec?: number },
  ): Promise<PendingApproval> {
    const now = new Date();
    const ttl = input.ttlSec ?? DEFAULT_TTL_SEC;
    const row: PendingApproval = {
      id: randomUUID(),
      accountId: input.accountId,
      agentId: input.agentId,
      turnId: input.turnId,
      tool: input.tool,
      argsDigest: input.argsDigest,
      risk: input.risk,
      origin: input.origin,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
    };
    if (
      (row.risk === "admin" || row.risk === "sensitive") &&
      (row.summary === undefined || row.summary.length === 0)
    ) {
      throw Object.assign(new Error("envoyhome.bad_params: admin/sensitive approval needs summary"), {
        code: "bad_params",
      });
    }
    const dir = this.approvalsDir(row.accountId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${row.id}.json`);
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(row, null, 2), "utf8");
    await rename(tmp, path);
    return row;
  }

  /** Locate a pending approval by id (any account under this store root). */
  async findApprovalById(id: string): Promise<PendingApproval | undefined> {
    const probe = this.approvalsDir("__probe__");
    const accountsRoot = join(probe, "..", "..");
    let accountNames: string[];
    try {
      accountNames = await readdir(accountsRoot);
    } catch {
      return undefined;
    }
    for (const accountId of accountNames) {
      const path = join(this.approvalsDir(accountId), `${id}.json`);
      try {
        const row = JSON.parse(await readFile(path, "utf8")) as PendingApproval;
        if (Date.parse(row.expiresAt) <= Date.now()) {
          await unlink(path).catch(() => undefined);
          continue;
        }
        return row;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  async findGrantById(id: string): Promise<Grant | undefined> {
    const probe = this.approvalsDir("__probe__");
    const accountsRoot = join(probe, "..", "..");
    let accountNames: string[];
    try {
      accountNames = await readdir(accountsRoot);
    } catch {
      return undefined;
    }
    for (const accountId of accountNames) {
      const path = join(this.grantsDir(accountId), `${id}.json`);
      try {
        return JSON.parse(await readFile(path, "utf8")) as Grant;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  async listApprovals(accountId: string): Promise<PendingApproval[]> {
    const dir = this.approvalsDir(accountId);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const out: PendingApproval[] = [];
    const now = Date.now();
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const row = JSON.parse(await readFile(join(dir, name), "utf8")) as PendingApproval;
      if (Date.parse(row.expiresAt) <= now) {
        await unlink(join(dir, name)).catch(() => undefined);
        continue; // fail closed: expired ⇒ deny / drop
      }
      out.push(row);
    }
    return out;
  }

  async answerApproval(input: {
    accountId: string;
    id: string;
    decision: "allow" | "deny";
    scope?: "once" | "session" | "always";
    argsDigest: string;
    grantedBy: string;
  }): Promise<{ ok: true; grant?: Grant }> {
    const path = join(this.approvalsDir(input.accountId), `${input.id}.json`);
    let row: PendingApproval;
    try {
      row = JSON.parse(await readFile(path, "utf8")) as PendingApproval;
    } catch {
      throw Object.assign(new Error("envoyhome.approval_resolved: unknown approval"), {
        code: "approval_resolved",
      });
    }
    if (row.accountId !== input.accountId) {
      throw Object.assign(new Error("envoyhome.approval_not_yours"), { code: "approval_not_yours" });
    }
    if (row.argsDigest !== input.argsDigest) {
      throw Object.assign(new Error("envoyhome.approval_mismatch: argsDigest"), {
        code: "approval_mismatch",
      });
    }
    if (Date.parse(row.expiresAt) <= Date.now()) {
      await unlink(path).catch(() => undefined);
      throw Object.assign(new Error("envoyhome.approval_expired"), { code: "approval_expired" });
    }
    await unlink(path);
    if (input.decision === "deny") return { ok: true };
    if (input.scope === "always") {
      if (
        (row.risk === "admin" || row.risk === "sensitive") &&
        (!row.argsDigest.startsWith("sha256:") || row.argsDigest.length < 71)
      ) {
        throw Object.assign(new Error("envoyhome.grant_too_broad"), { code: "grant_too_broad" });
      }
      const grant = await this.writeGrant({
        accountId: row.accountId,
        tool: row.tool,
        argsDigest: row.argsDigest,
        risk: row.risk,
        grantedBy: input.grantedBy,
        expiresAt: null,
      });
      return { ok: true, grant };
    }
    return { ok: true };
  }

  async writeGrant(
    input: Omit<Grant, "id" | "createdAt"> & { expiresAt: string | null },
  ): Promise<Grant> {
    if (
      (input.risk === "admin" || input.risk === "sensitive") &&
      (input.argsDigest === null ||
        input.argsDigest === "sha256:" ||
        !/^sha256:[a-f0-9]{64}$/.test(input.argsDigest))
    ) {
      throw Object.assign(new Error("envoyhome.grant_too_broad"), { code: "grant_too_broad" });
    }
    const grant: Grant = {
      id: randomUUID(),
      accountId: input.accountId,
      tool: input.tool,
      argsDigest: input.argsDigest,
      risk: input.risk,
      grantedBy: input.grantedBy,
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      claimedBy: null,
    };
    const dir = this.grantsDir(grant.accountId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${grant.id}.json`);
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(grant, null, 2), "utf8");
    await rename(tmp, path);
    return grant;
  }

  async listGrants(accountId: string): Promise<Grant[]> {
    const dir = this.grantsDir(accountId);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const out: Grant[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      out.push(JSON.parse(await readFile(join(dir, name), "utf8")) as Grant);
    }
    return out;
  }

  async revokeGrant(accountId: string, grantId: string): Promise<void> {
    await unlink(join(this.grantsDir(accountId), `${grantId}.json`)).catch(() => undefined);
  }

  /**
   * Claim (not consume) a matching unexpired grant for dispatch (V-HA-12 / §4.4).
   * Returns null if none match.
   */
  async claimGrant(input: {
    accountId: string;
    tool: string;
    argsDigest: string;
    actuationId: string;
  }): Promise<Grant | null> {
    const grants = await this.listGrants(input.accountId);
    const now = Date.now();
    for (const g of grants) {
      if (g.tool !== input.tool) continue;
      if (g.argsDigest !== input.argsDigest) continue;
      if (g.expiresAt !== null && Date.parse(g.expiresAt) <= now) continue;
      const path = join(this.grantsDir(input.accountId), `${g.id}.json`);
      const next = { ...g, claimedBy: input.actuationId };
      const tmp = `${path}.tmp`;
      await writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
      await rename(tmp, path);
      return next;
    }
    return null;
  }
}
