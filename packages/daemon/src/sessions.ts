// Chat session store — Design §4.2 `accounts/<id>/sessions/`.

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HomePaths } from "./home-paths.js";

export type SessionPurpose = "general" | "home";

/** Multi-round home offer awaiting “是的” / denial (Design §5.7.8). */
export interface PendingHomeProposal {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  createdAt: string;
}

export interface SessionMeta {
  sessionId: string;
  accountId: string;
  agentId: string;
  title?: string;
  channel?: string;
  /** Design §5.7.8 — Home chat vs general. */
  purpose?: SessionPurpose;
  /** Remaining sticky home turns after a local home hit (general sessions). */
  stickyHomeTurnsRemaining?: number;
  /**
   * Last concrete home actuation the assistant offered (or claimed) without
   * dispatching tools — consumed on affirmation so multi-round chat stays honest.
   */
  pendingHomeProposal?: PendingHomeProposal;
  createdAt: string;
  updatedAt: string;
  /** How many L0 session compactionsits have run (Memory Design §8 / OpenClaw cycle). */
  compactionCount?: number;
  /** Compaction count at which the last pre-compaction flush ran (once per cycle). */
  memoryFlushCompactionCount?: number;
}

export class SessionStore {
  constructor(private readonly paths: HomePaths) {}

  private sessionsDir(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "sessions");
  }

  private metaPath(accountId: string, sessionId: string): string {
    return join(this.sessionsDir(accountId), sessionId, "meta.json");
  }

  sessionDir(accountId: string, sessionId: string): string {
    return join(this.sessionsDir(accountId), sessionId);
  }

  async open(input: {
    accountId: string;
    agentId?: string;
    title?: string;
    channel?: string;
    purpose?: SessionPurpose;
  }): Promise<SessionMeta> {
    const now = new Date().toISOString();
    const sessionId = randomUUID();
    const purpose = input.purpose === "home" ? "home" : "general";
    const meta: SessionMeta = {
      sessionId,
      accountId: input.accountId,
      agentId: input.agentId ?? "default",
      purpose,
      createdAt: now,
      updatedAt: now,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
    };
    const dir = this.sessionDir(input.accountId, sessionId);
    await mkdir(dir, { recursive: true });
    await writeFile(this.metaPath(input.accountId, sessionId), JSON.stringify(meta, null, 2), "utf8");
    return meta;
  }

  async get(accountId: string, sessionId: string): Promise<SessionMeta | undefined> {
    try {
      return JSON.parse(await readFile(this.metaPath(accountId, sessionId), "utf8")) as SessionMeta;
    } catch {
      return undefined;
    }
  }

  async touch(accountId: string, sessionId: string): Promise<void> {
    const meta = await this.get(accountId, sessionId);
    if (!meta) return;
    meta.updatedAt = new Date().toISOString();
    await writeFile(this.metaPath(accountId, sessionId), JSON.stringify(meta, null, 2), "utf8");
  }

  async patchMeta(
    accountId: string,
    sessionId: string,
    patch: Partial<
      Pick<SessionMeta, "compactionCount" | "memoryFlushCompactionCount" | "title" | "purpose">
    > & {
      /** Pass `null` to clear sticky home mode. */
      stickyHomeTurnsRemaining?: number | null;
      /** Pass `null` to clear a multi-round home offer. */
      pendingHomeProposal?: PendingHomeProposal | null;
    },
  ): Promise<SessionMeta | undefined> {
    const meta = await this.get(accountId, sessionId);
    if (!meta) return undefined;
    if (patch.compactionCount !== undefined) meta.compactionCount = patch.compactionCount;
    if (patch.memoryFlushCompactionCount !== undefined) {
      meta.memoryFlushCompactionCount = patch.memoryFlushCompactionCount;
    }
    if (patch.title !== undefined) meta.title = patch.title;
    if (patch.purpose !== undefined) meta.purpose = patch.purpose;
    if ("stickyHomeTurnsRemaining" in patch) {
      const next = patch.stickyHomeTurnsRemaining;
      if (next === undefined || next === null || next <= 0) {
        delete meta.stickyHomeTurnsRemaining;
      } else {
        meta.stickyHomeTurnsRemaining = next;
      }
    }
    if ("pendingHomeProposal" in patch) {
      const next = patch.pendingHomeProposal;
      if (next === undefined || next === null) {
        delete meta.pendingHomeProposal;
      } else {
        meta.pendingHomeProposal = next;
      }
    }
    meta.updatedAt = new Date().toISOString();
    await writeFile(this.metaPath(accountId, sessionId), JSON.stringify(meta, null, 2), "utf8");
    return meta;
  }

  async list(accountId: string): Promise<SessionMeta[]> {
    const dir = this.sessionsDir(accountId);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const out: SessionMeta[] = [];
    for (const sessionId of names) {
      const meta = await this.get(accountId, sessionId);
      if (meta) out.push(meta);
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  /** Delete a session directory (test-run / ephemeral cleanup). */
  async remove(accountId: string, sessionId: string): Promise<void> {
    await rm(this.sessionDir(accountId, sessionId), { recursive: true, force: true });
  }
}
