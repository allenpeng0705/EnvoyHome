// Chat session store — Design §4.2 `accounts/<id>/sessions/`.

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HomePaths } from "./home-paths.js";

export type SessionPurpose = "general" | "home" | "schedules";

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
  /** `user` = renamed by client; auto first-message title must not overwrite. */
  titleSource?: "auto" | "user";
  channel?: string;
  /** Design §5.7.8 / §7.4 — general, Home chat, or Schedules chat. */
  purpose?: SessionPurpose;
  /** Remaining sticky home turns after a local home hit (general sessions). */
  stickyHomeTurnsRemaining?: number;
  /**
   * Last concrete home actuation the assistant offered (or claimed) without
   * dispatching tools — consumed on affirmation so multi-round chat stays honest.
   */
  pendingHomeProposal?: PendingHomeProposal;
  /**
   * Unarmed schedule proposal from this session. A short "yes" / "请设置"
   * confirms it without another model pass.
   */
  pendingScheduleConfirm?: {
    proposalId: string;
    resolvedLocal: string;
    createdAt: string;
    expiresAt?: string;
    message?: string;
    name?: string;
  };
  createdAt: string;
  updatedAt: string;
  /** How many L0 session compactionsits have run (Memory Design §8 / OpenClaw cycle). */
  compactionCount?: number;
  /** Compaction count at which the last pre-compaction flush ran (once per cycle). */
  memoryFlushCompactionCount?: number;
  /** Soft-hide from Recents; transcript kept on disk until remove. */
  archivedAt?: string;
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
    const purpose =
      input.purpose === "home" || input.purpose === "schedules" ? input.purpose : "general";
    const title =
      typeof input.title === "string" ? input.title.trim().replace(/\s+/g, " ").slice(0, 120) : "";
    const meta: SessionMeta = {
      sessionId,
      accountId: input.accountId,
      agentId: input.agentId ?? "default",
      purpose,
      createdAt: now,
      updatedAt: now,
      // Client-supplied title locks out first-message auto-title (titleSource=user).
      ...(title ? { title, titleSource: "user" as const } : {}),
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
      Pick<
        SessionMeta,
        "compactionCount" | "memoryFlushCompactionCount" | "title" | "titleSource" | "purpose"
      >
    > & {
      /** Pass `null` to clear sticky home mode. */
      stickyHomeTurnsRemaining?: number | null;
      /** Pass `null` to clear a multi-round home offer. */
      pendingHomeProposal?: PendingHomeProposal | null;
      /** Pass `null` to clear a pending schedule confirm. */
      pendingScheduleConfirm?: {
        proposalId: string;
        resolvedLocal: string;
        createdAt: string;
        expiresAt?: string;
        message?: string;
        name?: string;
      } | null;
    },
  ): Promise<SessionMeta | undefined> {
    const meta = await this.get(accountId, sessionId);
    if (!meta) return undefined;
    if (patch.compactionCount !== undefined) meta.compactionCount = patch.compactionCount;
    if (patch.memoryFlushCompactionCount !== undefined) {
      meta.memoryFlushCompactionCount = patch.memoryFlushCompactionCount;
    }
    if (patch.title !== undefined) meta.title = patch.title;
    if (patch.titleSource !== undefined) meta.titleSource = patch.titleSource;
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
    if ("pendingScheduleConfirm" in patch) {
      const next = patch.pendingScheduleConfirm;
      if (next === undefined || next === null) {
        delete meta.pendingScheduleConfirm;
      } else {
        meta.pendingScheduleConfirm = next;
      }
    }
    meta.updatedAt = new Date().toISOString();
    await writeFile(this.metaPath(accountId, sessionId), JSON.stringify(meta, null, 2), "utf8");
    return meta;
  }

  async list(
    accountId: string,
    opts?: { includeArchived?: boolean },
  ): Promise<SessionMeta[]> {
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
      if (!meta) continue;
      if (!opts?.includeArchived && meta.archivedAt) continue;
      out.push(meta);
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async archive(accountId: string, sessionId: string): Promise<SessionMeta | undefined> {
    const meta = await this.get(accountId, sessionId);
    if (!meta) return undefined;
    meta.archivedAt = new Date().toISOString();
    meta.updatedAt = meta.archivedAt;
    await writeFile(this.metaPath(accountId, sessionId), JSON.stringify(meta, null, 2), "utf8");
    return meta;
  }

  /** Clear archivedAt so the session returns to the default Chats list. */
  async unarchive(accountId: string, sessionId: string): Promise<SessionMeta | undefined> {
    const meta = await this.get(accountId, sessionId);
    if (!meta) return undefined;
    delete meta.archivedAt;
    meta.updatedAt = new Date().toISOString();
    await writeFile(this.metaPath(accountId, sessionId), JSON.stringify(meta, null, 2), "utf8");
    return meta;
  }

  /** Delete a session directory (transcript + meta). */
  async remove(accountId: string, sessionId: string): Promise<void> {
    await rm(this.sessionDir(accountId, sessionId), { recursive: true, force: true });
  }
}
