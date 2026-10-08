// Per-account LearnQueue (Memory Design §7.2). V-MEM-16, V-MEM-19, V-LEARN-1.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { baseDigest, computeDiffKey } from "./digest.js";
import type { ProvenanceTrust } from "./provenance.js";
import { withAccountLock } from "./writer-lock.js";

export const PENDING_LEARN_CAP = 50;
export const PENDING_LEARN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type PendingLearnKind =
  | "profile_patch"
  | "memory_append"
  | "memory_edit"
  | "skill_create"
  | "skill_patch"
  | "skill_delete";

export type PendingLearnStatus = "pending" | "accepted" | "rejected" | "stale";

export interface PendingLearn {
  id: string;
  accountId: string;
  kind: PendingLearnKind;
  diff: { summary: string; patch?: string };
  sourceTurnId?: string;
  createdAt: string;
  expiresAt: string;
  trust: ProvenanceTrust;
  baseDigest: string;
  diffKey: string;
  stale: boolean;
  /** Target relative path under account root (e.g. MEMORY.md, profile.json, skills/x.md). */
  targetPath: string;
  /** Text to append / patch key for profile. */
  payload: string;
  /** Profile key when kind=profile_patch. */
  profileKey?: string;
  status: PendingLearnStatus;
}

export interface ProposeInput {
  accountId: string;
  kind: PendingLearnKind;
  targetPath: string;
  payload: string;
  summary: string;
  patch?: string;
  trust: ProvenanceTrust;
  currentContent: string;
  sourceTurnId?: string;
  profileKey?: string;
  now?: Date;
}

export type ProposeResult =
  | { ok: true; learn: PendingLearn; coalesced: boolean }
  | { ok: false; reason: "queue_full"; event: "home:learn-rejected-full" };

interface QueueFile {
  learns: PendingLearn[];
}

function queuePath(accountRoot: string): string {
  return join(accountRoot, "learn-queue.json");
}

export class LearnQueue {
  constructor(private readonly accountRoot: (accountId: string) => string) {}

  private async load(accountId: string): Promise<QueueFile> {
    const path = queuePath(this.accountRoot(accountId));
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as QueueFile;
      return { learns: Array.isArray(parsed.learns) ? parsed.learns : [] };
    } catch {
      return { learns: [] };
    }
  }

  private async save(accountId: string, file: QueueFile): Promise<void> {
    const path = queuePath(this.accountRoot(accountId));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(file, null, 2) + "\n", "utf8");
  }

  /** Drop expired pending rows (30d). */
  private purgeExpired(file: QueueFile, now: Date): void {
    const t = now.getTime();
    file.learns = file.learns.filter((l) => {
      if (l.status !== "pending" && l.status !== "stale") return true;
      return Date.parse(l.expiresAt) > t;
    });
  }

  async list(
    accountId: string,
    opts?: { status?: PendingLearnStatus; now?: Date },
  ): Promise<PendingLearn[]> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const file = await this.load(accountId);
      this.purgeExpired(file, opts?.now ?? new Date());
      await this.save(accountId, file);
      let rows = file.learns;
      if (opts?.status) {
        rows = rows.filter((l) =>
          opts.status === "stale" ? l.stale || l.status === "stale" : l.status === opts.status,
        );
      } else {
        rows = rows.filter((l) => l.status === "pending" || l.status === "stale");
      }
      return rows.map(toWire);
    });
  }

  async pendingCount(accountId: string, now?: Date): Promise<number> {
    const list = await this.list(accountId, {
      status: "pending",
      ...(now !== undefined ? { now } : {}),
    });
    return list.length;
  }

  async propose(input: ProposeInput): Promise<ProposeResult> {
    const now = input.now ?? new Date();
    return withAccountLock(input.accountId, this.accountRoot(input.accountId), async () => {
      const file = await this.load(input.accountId);
      this.purgeExpired(file, now);

      const diffKey = computeDiffKey(input.kind, input.targetPath, input.payload);
      const existing = file.learns.find(
        (l) =>
          (l.status === "pending" || l.status === "stale") && l.diffKey === diffKey,
      );
      if (existing) {
        // Coalesce — refresh expiresAt / payload to latest.
        existing.payload = input.payload;
        existing.diff = {
          summary: input.summary,
          ...(input.patch !== undefined ? { patch: input.patch } : {}),
        };
        existing.expiresAt = new Date(now.getTime() + PENDING_LEARN_TTL_MS).toISOString();
        existing.baseDigest = baseDigest(input.targetPath, input.currentContent);
        existing.trust = input.trust;
        if (input.sourceTurnId !== undefined) existing.sourceTurnId = input.sourceTurnId;
        await this.save(input.accountId, file);
        return { ok: true, learn: toWire(existing), coalesced: true };
      }

      const pending = file.learns.filter((l) => l.status === "pending" || l.status === "stale");
      if (pending.length >= PENDING_LEARN_CAP) {
        return {
          ok: false,
          reason: "queue_full",
          event: "home:learn-rejected-full",
        };
      }

      const learn: PendingLearn = {
        id: randomUUID(),
        accountId: input.accountId,
        kind: input.kind,
        diff: {
          summary: input.summary,
          ...(input.patch !== undefined ? { patch: input.patch } : {}),
        },
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + PENDING_LEARN_TTL_MS).toISOString(),
        trust: input.trust,
        baseDigest: baseDigest(input.targetPath, input.currentContent),
        diffKey,
        stale: false,
        targetPath: input.targetPath,
        payload: input.payload,
        status: "pending",
      };
      if (input.sourceTurnId !== undefined) learn.sourceTurnId = input.sourceTurnId;
      if (input.profileKey !== undefined) learn.profileKey = input.profileKey;

      file.learns.push(learn);
      await this.save(input.accountId, file);
      return { ok: true, learn: toWire(learn), coalesced: false };
    });
  }

  async get(accountId: string, id: string): Promise<PendingLearn | undefined> {
    const file = await this.load(accountId);
    const row = file.learns.find((l) => l.id === id);
    return row ? toWire(row) : undefined;
  }

  /**
   * Mark accept/reject inside the lock. Caller applies the standing write
   * and passes currentContent for staleness check on accept.
   */
  async markAccepted(accountId: string, id: string): Promise<void> {
    await withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const file = await this.load(accountId);
      const row = file.learns.find((l) => l.id === id);
      if (!row) throw new Error(`envoyhome.not_found: learn ${id}`);
      row.status = "accepted";
      row.stale = false;
      await this.save(accountId, file);
    });
  }

  async markRejected(accountId: string, id: string): Promise<void> {
    await withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const file = await this.load(accountId);
      const row = file.learns.find((l) => l.id === id);
      if (!row) throw new Error(`envoyhome.not_found: learn ${id}`);
      row.status = "rejected";
      await this.save(accountId, file);
    });
  }

  async markStale(accountId: string, id: string): Promise<PendingLearn> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const file = await this.load(accountId);
      const row = file.learns.find((l) => l.id === id);
      if (!row) throw new Error(`envoyhome.not_found: learn ${id}`);
      row.stale = true;
      row.status = "stale";
      await this.save(accountId, file);
      return toWire(row);
    });
  }

  /** Peek raw row inside lock for accept path. */
  async withLearn<T>(
    accountId: string,
    id: string,
    fn: (learn: PendingLearn, file: QueueFile) => Promise<T>,
  ): Promise<T> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const file = await this.load(accountId);
      const row = file.learns.find((l) => l.id === id);
      if (!row) throw new Error(`envoyhome.not_found: learn ${id}`);
      const result = await fn(row, file);
      await this.save(accountId, file);
      return result;
    });
  }
}

function toWire(l: PendingLearn): PendingLearn {
  return { ...l, diff: { ...l.diff } };
}

export { baseDigest };
