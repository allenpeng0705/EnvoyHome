// MemoryFacade — public API for B5 (L1–L3) + B8 (L4, LearnQueue, flush, compact).

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  INJECT_BUDGET,
  RAW_SOFT_CAP,
  STANDING_DUTY_LINE,
  buildStandingInject,
  rawSoftCapIssues,
  type StandingInjectResult,
} from "./bootstrap-inject.js";
import {
  filterRecallPaths,
  isDailyNoteFilename,
  recallOverCorpus,
  type RecallHit,
} from "./recall-fts.js";
import { StandingStore, type LoadedStanding } from "./standing-store.js";
import type {
  ProfileFactSource,
  ProfileFactValue,
  ProfileTrust,
} from "./profile.js";
import { __resetWriterLocksForTests } from "./writer-lock.js";
import { LearnQueue, PENDING_LEARN_CAP, baseDigest, type PendingLearnStatus } from "./learn-queue.js";
import { SessionIndex, DEFAULT_SESSION_RETENTION_DAYS } from "./session-index.js";
import { CompactDiary, compactPaths } from "./compact-diary.js";
import { makeCompactDiary, compactMemory } from "./consolidate.js";
import { applyFlush, type FlushItem } from "./flush.js";
import { SkillsStore } from "./skills-store.js";
import { deriveTrust, type TrustContext } from "./taint.js";
import type { ProvenanceTrust } from "./provenance.js";
import { stampProvenance, provenanceLine } from "./provenance.js";

export type RememberTarget = "profile" | "l2" | "l3" | "auto";

type InjectOpts = {
  now?: Date;
  injectPrioritySections?: string[];
  caps?: Parameters<typeof buildStandingInject>[0]["caps"];
};

export class MemoryError extends Error {
  override readonly name = "MemoryError";
  constructor(
    readonly code:
      | "cross_account"
      | "bad_params"
      | "not_found"
      | "conflict"
      | "learn_stale"
      | "learn_rejected_full",
    message: string,
  ) {
    super(message.startsWith("envoyhome.") ? message : `envoyhome.${code === "learn_stale" || code === "learn_rejected_full" ? code : `memory_${code}`}: ${message}`);
  }
}

export interface MemoryFacadeOptions {
  stateDir: string;
}

/**
 * Default `files` backend capabilities (V-MEM-5) — zero plugins required.
 * Deep L5 backends land later; this answers `capabilities` honestly in v1.
 */
export const FILES_BACKEND = {
  id: "files",
  name: "Standing files",
  version: "1",
  capabilities: ["read_standing", "search"] as const,
} as const;

/** In-memory L5 stub for containment tests (V-MEM-20) — never writes L1–L3. */
export interface DeepBackendHandle {
  id: string;
  enabled: boolean;
  /** Derived docs keyed by accountId → sessionId → chunks */
  docs: Map<string, Map<string, string[]>>;
}

export class MemoryFacade {
  readonly store: StandingStore;
  readonly learnQueue: LearnQueue;
  readonly sessions: SessionIndex;
  readonly diary: CompactDiary;
  readonly skills: SkillsStore;
  /** Per-account generation bump listeners (acceptLearn refresh — V-MEM-16). */
  private refreshListeners = new Set<(accountId: string, generation: number) => void>();
  /** Local model busy flag for background review deferral (V-MEM-15). */
  localModelBusy = false;
  private deepBackend: DeepBackendHandle | null = null;
  private accountSettings = new Map<
    string,
    { flushEnabled: boolean; reviewEnabled: boolean; sessionRetentionDays: number }
  >();

  constructor(opts: MemoryFacadeOptions) {
    this.store = new StandingStore(opts.stateDir);
    this.learnQueue = new LearnQueue((id) => this.store.accountRoot(id));
    this.sessions = new SessionIndex((id) => this.store.accountRoot(id));
    this.diary = makeCompactDiary(this.store);
    this.skills = new SkillsStore((id) => this.store.accountRoot(id));
  }

  get stateDir(): string {
    return this.store.stateDir;
  }

  /** V-MEM-5: default files backend works with zero plugins. */
  backendInfo(): typeof FILES_BACKEND {
    return FILES_BACKEND;
  }

  /**
   * Cross-account guard — every public method funnels accountId through here.
   * Paths are always resolved under `accounts/<accountId>/` (V-MEM-1).
   */
  private assertAccount(accountId: string): string {
    if (!accountId || typeof accountId !== "string") {
      throw new MemoryError("bad_params", "accountId is required");
    }
    if (accountId.includes("..") || accountId.includes("/") || accountId.includes("\\")) {
      throw new MemoryError("cross_account", "invalid accountId");
    }
    return accountId;
  }

  async getProfile(accountId: string, keys?: string[]) {
    const id = this.assertAccount(accountId);
    return { profile: await this.store.getProfile(id, keys) };
  }

  async updateProfile(
    accountId: string,
    opts: {
      set?: Record<string, ProfileFactValue>;
      removeKeys?: string[];
      source?: ProfileFactSource;
      trust?: ProfileTrust;
    },
  ) {
    const id = this.assertAccount(accountId);
    const profile = await this.store.updateProfile(id, opts);
    return { profile };
  }

  /**
   * Remember routing (Memory Design §7.0).
   * - profile: L1 supersede-by-key (requires `key`)
   * - l2: append MEMORY.md
   * - l3: append today's daily
   * - auto: heuristic — preference/identity → L1; durable → L2; else L3
   */
  async remember(
    accountId: string,
    opts: {
      text: string;
      target?: RememberTarget;
      key?: string;
      sectionHeading?: string;
      now?: Date;
      source?: ProfileFactSource;
      trust?: ProfileTrust;
    },
  ): Promise<{
    ok: true;
    layer: "l1" | "l2" | "l3";
    generation: number;
    inject: StandingInjectResult;
  }> {
    const id = this.assertAccount(accountId);
    const text = opts.text?.trim();
    if (!text) throw new MemoryError("bad_params", "text is required");

    const target = opts.target ?? "auto";
    const routed = routeRemember(target, text, opts.key);

    if (routed.layer === "l1") {
      if (!routed.key) throw new MemoryError("bad_params", "profile remember requires key");
      await this.store.updateProfile(id, {
        set: { [routed.key]: text },
        ...(opts.source !== undefined ? { source: opts.source } : {}),
        ...(opts.trust !== undefined ? { trust: opts.trust } : {}),
      });
    } else if (routed.layer === "l2") {
      await this.store.appendMemory(id, text, opts.sectionHeading ?? "## Standing");
    } else {
      await this.store.appendDaily(id, text, opts.now);
    }

    // V-MEM-7: same-session refresh — rebuild inject after write.
    const inject = await this.buildStandingInject(
      id,
      opts.now !== undefined ? { now: opts.now } : {},
    );
    return {
      ok: true,
      layer: routed.layer,
      generation: inject.generation,
      inject,
    };
  }

  async recall(
    accountId: string,
    opts: { query: string; limit?: number; paths?: string[] },
  ): Promise<{ hits: RecallHit[] }> {
    const id = this.assertAccount(accountId);
    const query = opts.query?.trim();
    if (!query) throw new MemoryError("bad_params", "query is required");

    const root = this.store.accountRoot(id);
    const paths = filterRecallPaths(root, opts.paths);
    // Empty filter after jail → no hits (fail closed), not whole corpus.
    if (opts.paths && opts.paths.length > 0 && (!paths || paths.length === 0)) {
      return { hits: [] };
    }

    const docs = await this.collectCorpus(id);
    const hits = recallOverCorpus(docs, query, {
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
      ...(paths !== undefined ? { paths } : {}),
    });
    return { hits };
  }

  async forget(
    accountId: string,
    opts: {
      target: "profile_key" | "note";
      key?: string;
      path?: string;
      query?: string;
    },
  ): Promise<{ ok: boolean; removed: string[] }> {
    const id = this.assertAccount(accountId);
    if (opts.target === "profile_key") {
      if (!opts.key) throw new MemoryError("bad_params", "key required for profile_key");
      const removed = await this.store.forgetProfileKey(id, opts.key);
      return { ok: true, removed };
    }
    const removed = await this.store.forgetNote(id, {
      ...(opts.path !== undefined ? { path: opts.path } : {}),
      ...(opts.query !== undefined ? { query: opts.query } : {}),
    });
    return { ok: true, removed };
  }

  /**
   * Bootstrap inject for TurnContext (V-MEM-4/10/18). Reloads on external edit.
   */
  async buildStandingInject(
    accountId: string,
    opts?: InjectOpts,
  ): Promise<StandingInjectResult> {
    const id = this.assertAccount(accountId);
    const loaded = await this.store.load(id);
    return this.injectFromLoaded(loaded, opts);
  }

  private injectFromLoaded(
    loaded: LoadedStanding,
    opts?: InjectOpts,
  ): StandingInjectResult {
    const days = this.store.todayYesterday(loaded, opts?.now);
    return buildStandingInject({
      profile: loaded.profile,
      memoryMd: loaded.memoryMd,
      todayContent: days.todayContent,
      yesterdayContent: days.yesterdayContent,
      generation: loaded.generation,
      ...(opts?.now !== undefined ? { now: opts.now } : {}),
      ...(opts?.injectPrioritySections !== undefined
        ? { injectPrioritySections: opts.injectPrioritySections }
        : {}),
      ...(opts?.caps !== undefined ? { caps: opts.caps } : {}),
    });
  }

  /** home.listMemory — echoes the caps contract (V-MEM-18). */
  async listMemory(
    accountId: string,
    opts?: { includeContent?: boolean; now?: Date },
  ) {
    const id = this.assertAccount(accountId);
    const loaded = await this.store.load(id);
    const inject = this.injectFromLoaded(
      loaded,
      opts?.now !== undefined ? { now: opts.now } : {},
    );
    const days = this.store.todayYesterday(loaded, opts?.now);

    const notes = [
      {
        path: "MEMORY.md",
        rawChars: inject.memory.rawChars,
        injectChars: inject.memory.injectChars,
        truncated: inject.memory.truncated,
        injectBudget: inject.memory.injectBudget,
        rawSoftCap: inject.memory.rawSoftCap,
        sectionsOmitted: inject.memory.sectionsOmitted,
        ...(opts?.includeContent ? { content: loaded.memoryMd } : {}),
      },
      {
        path: `memory/${days.today}.md`,
        rawChars: days.todayContent.length,
        injectChars: inject.daily.injectChars,
        truncated: inject.daily.truncated,
        injectBudget: inject.daily.injectBudget,
        rawSoftCap: inject.daily.rawSoftCap,
        sectionsOmitted: [] as string[],
        ...(opts?.includeContent ? { content: days.todayContent } : {}),
      },
    ];

    const doctorIssues = rawSoftCapIssues({
      profileRaw: inject.profile.rawChars,
      memoryRaw: inject.memory.rawChars,
      dailyFileRaws: [...loaded.dailies.values()].map((c) => c.length),
    });

    const settings = this.settingsFor(id);
    const pendingLearnCount = await this.learnQueue.pendingCount(id, opts?.now);

    return {
      accountId: id,
      profileSummary: {
        factCount: inject.profile.factCount,
        injectChars: inject.profile.injectChars,
        rawChars: inject.profile.rawChars,
        truncated: inject.profile.truncated,
        injectBudget: inject.profile.injectBudget,
        rawSoftCap: inject.profile.rawSoftCap,
      },
      notes,
      reviewEnabled: settings.reviewEnabled,
      flushEnabled: settings.flushEnabled,
      sessionRetentionDays: settings.sessionRetentionDays,
      pendingLearnCount,
      pendingLearnCap: PENDING_LEARN_CAP,
      backendId: this.deepBackend?.enabled ? this.deepBackend.id : FILES_BACKEND.id,
      truncated: inject.truncated,
      dutyLine: inject.dutyLine,
      doctorIssues,
      generation: inject.generation,
    };
  }

  /** Force reload after external edit (Settings "Reload standing"). */
  async reloadStanding(accountId: string): Promise<StandingInjectResult> {
    const id = this.assertAccount(accountId);
    this.store.invalidate(id);
    const loaded = await this.store.load(id, { force: true });
    return this.injectFromLoaded(loaded);
  }

  settingsFor(accountId: string) {
    const id = this.assertAccount(accountId);
    return (
      this.accountSettings.get(id) ?? {
        flushEnabled: true,
        reviewEnabled: true,
        sessionRetentionDays: DEFAULT_SESSION_RETENTION_DAYS,
      }
    );
  }

  setAccountMemorySettings(
    accountId: string,
    patch: Partial<{ flushEnabled: boolean; reviewEnabled: boolean; sessionRetentionDays: number }>,
  ): void {
    const id = this.assertAccount(accountId);
    const cur = this.settingsFor(id);
    this.accountSettings.set(id, { ...cur, ...patch });
  }

  onStandingRefresh(fn: (accountId: string, generation: number) => void): () => void {
    this.refreshListeners.add(fn);
    return () => this.refreshListeners.delete(fn);
  }

  private notifyRefresh(accountId: string, generation: number): void {
    for (const fn of this.refreshListeners) fn(accountId, generation);
  }

  /** Trust helper for callers (V-MEM-21). */
  deriveTrust(ctx: TrustContext): ProvenanceTrust {
    return deriveTrust(ctx);
  }

  async sessionSearch(
    accountId: string,
    opts: { query: string; limit?: number },
  ): Promise<{ hits: RecallHit[] }> {
    const id = this.assertAccount(accountId);
    const query = opts.query?.trim();
    if (!query) throw new MemoryError("bad_params", "query is required");
    return this.sessions.search(id, query, {
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    });
  }

  async indexSession(
    accountId: string,
    sessionId: string,
    content: string,
    opts?: { now?: Date },
  ): Promise<void> {
    const id = this.assertAccount(accountId);
    const settings = this.settingsFor(id);
    await this.sessions.upsert(id, sessionId, content, {
      ...(opts?.now !== undefined ? { now: opts.now } : {}),
      retentionDays: settings.sessionRetentionDays,
    });
  }

  async listPendingLearns(
    accountId: string,
    opts?: { status?: PendingLearnStatus; now?: Date },
  ) {
    const id = this.assertAccount(accountId);
    const learns = await this.learnQueue.list(id, opts);
    return {
      learns: learns.map((l) => ({
        id: l.id,
        accountId: l.accountId,
        kind: l.kind,
        diff: l.diff,
        ...(l.sourceTurnId !== undefined ? { sourceTurnId: l.sourceTurnId } : {}),
        createdAt: l.createdAt,
        expiresAt: l.expiresAt,
        trust: l.trust,
        baseDigest: l.baseDigest,
        diffKey: l.diffKey,
        stale: l.stale,
      })),
    };
  }

  async proposeLearn(
    accountId: string,
    opts: {
      kind: import("./learn-queue.js").PendingLearnKind;
      targetPath: string;
      payload: string;
      summary: string;
      trust: ProvenanceTrust;
      profileKey?: string;
      sourceTurnId?: string;
      now?: Date;
    },
  ) {
    const id = this.assertAccount(accountId);
    const loaded = await this.store.load(id);
    let current = "";
    if (opts.targetPath === "profile.json") current = JSON.stringify(loaded.profile);
    else if (opts.targetPath === "MEMORY.md") current = loaded.memoryMd;
    else if (opts.targetPath.startsWith("skills/")) {
      const name = opts.targetPath.replace(/^skills\//, "").replace(/\.md$/, "");
      current = (await this.skills.read(id, name)) ?? "";
    }
    const result = await this.learnQueue.propose({
      accountId: id,
      kind: opts.kind,
      targetPath: opts.targetPath,
      payload: opts.payload,
      summary: opts.summary,
      trust: opts.trust,
      currentContent: current,
      ...(opts.profileKey !== undefined ? { profileKey: opts.profileKey } : {}),
      ...(opts.sourceTurnId !== undefined ? { sourceTurnId: opts.sourceTurnId } : {}),
      ...(opts.now !== undefined ? { now: opts.now } : {}),
    });
    if (!result.ok) {
      throw new MemoryError("learn_rejected_full", "queue_full");
    }
    return result;
  }

  /**
   * Accept PendingLearn — re-validates baseDigest (V-MEM-19).
   * Skill content unchanged until this runs (V-LEARN-1).
   * Originating trust copied into provenance (V-MEM-21).
   * Standing writes use StandingStore locks; queue update is separate (no nested lock).
   */
  async acceptLearn(accountId: string, learnId: string, opts?: { now?: Date }) {
    const id = this.assertAccount(accountId);
    const now = opts?.now ?? new Date();
    const learn = await this.learnQueue.get(id, learnId);
    if (!learn) throw new MemoryError("not_found", `learn ${learnId}`);
    if (learn.status === "accepted" || learn.status === "rejected") {
      throw new MemoryError("bad_params", `learn already ${learn.status}`);
    }

    const loaded = await this.store.load(id);
    let current = "";
    if (learn.targetPath === "profile.json") {
      current = JSON.stringify(loaded.profile);
    } else if (learn.targetPath === "MEMORY.md") {
      current = loaded.memoryMd;
    } else if (learn.targetPath.startsWith("memory/")) {
      const date = learn.targetPath.replace(/^memory\//, "").replace(/\.md$/, "");
      current = loaded.dailies.get(date) ?? "";
    } else if (learn.targetPath.startsWith("skills/")) {
      const name = learn.targetPath.replace(/^skills\//, "").replace(/\.md$/, "");
      current = (await this.skills.read(id, name)) ?? "";
    }

    const currentDigest = baseDigest(learn.targetPath, current);
    if (currentDigest !== learn.baseDigest) {
      const stillApplies =
        learn.kind === "memory_append" || learn.kind === "skill_create"
          ? !current.includes(learn.payload)
          : learn.kind === "profile_patch";
      if (!stillApplies) {
        await this.learnQueue.markStale(id, learnId);
        throw new MemoryError(
          "learn_stale",
          `base moved for ${learn.id}; re-review required`,
        );
      }
    }

    const prov = stampProvenance("learn_accept", learn.trust, { now });
    const stamped = `${learn.payload}\n${provenanceLine(prov)}`;

    if (learn.kind === "profile_patch") {
      const key = learn.profileKey ?? "preference";
      await this.store.updateProfile(id, {
        set: { [key]: learn.payload },
        source: "learn_accept",
        trust: learn.trust,
      });
    } else if (learn.kind === "memory_append" || learn.kind === "memory_edit") {
      if (learn.targetPath === "MEMORY.md") {
        await this.store.appendMemory(id, stamped, "## Standing");
      } else {
        await this.store.appendDaily(id, stamped, now);
      }
    } else if (learn.kind === "skill_create" || learn.kind === "skill_patch") {
      const name = learn.targetPath.replace(/^skills\//, "").replace(/\.md$/, "");
      const prev = (await this.skills.read(id, name)) ?? "";
      const next = learn.kind === "skill_create" ? stamped : `${prev}\n${stamped}`;
      await this.skills.write(id, name, next);
    } else if (learn.kind === "skill_delete") {
      const name = learn.targetPath.replace(/^skills\//, "").replace(/\.md$/, "");
      await this.skills.remove(id, name);
    }

    await this.learnQueue.markAccepted(id, learnId);
    const inject = await this.buildStandingInject(id, { now });
    this.notifyRefresh(id, inject.generation);
    return { ok: true as const, generation: inject.generation };
  }

  async rejectLearn(accountId: string, learnId: string) {
    const id = this.assertAccount(accountId);
    await this.learnQueue.markRejected(id, learnId);
    return { ok: true as const };
  }

  async compactMemory(
    accountId: string,
    opts?: {
      trust?: ProvenanceTrust;
      flushItems?: FlushItem[];
      consolidateNotes?: string[];
      turnId?: string;
      now?: Date;
      simulateFlushFailure?: boolean;
    },
  ) {
    const id = this.assertAccount(accountId);
    const settings = this.settingsFor(id);
    return compactMemory(this.store, this.learnQueue, this.diary, {
      accountId: id,
      trust: opts?.trust ?? "agent",
      flushEnabled: settings.flushEnabled,
      ...(opts?.flushItems !== undefined ? { flushItems: opts.flushItems } : {}),
      ...(opts?.consolidateNotes !== undefined
        ? { consolidateNotes: opts.consolidateNotes }
        : {}),
      ...(opts?.turnId !== undefined ? { turnId: opts.turnId } : {}),
      ...(opts?.now !== undefined ? { now: opts.now } : {}),
      ...(opts?.simulateFlushFailure !== undefined
        ? { simulateFlushFailure: opts.simulateFlushFailure }
        : {}),
    });
  }

  async flush(
    accountId: string,
    items: FlushItem[],
    opts: { trust: ProvenanceTrust; turnId?: string; now?: Date },
  ) {
    const id = this.assertAccount(accountId);
    const settings = this.settingsFor(id);
    return applyFlush(this.store, this.learnQueue, {
      accountId: id,
      trust: opts.trust,
      flushEnabled: settings.flushEnabled,
      ...(opts.turnId !== undefined ? { turnId: opts.turnId } : {}),
      ...(opts.now !== undefined ? { now: opts.now } : {}),
    }, items);
  }

  /**
   * Background review entry — skills always pending; L1/L2 pending by default (V-LEARN-2).
   * Defers when localModelBusy (V-MEM-15).
   */
  async runBackgroundReview(
    accountId: string,
    proposal: {
      kind: "profile_patch" | "memory_append" | "skill_create";
      targetPath: string;
      payload: string;
      summary: string;
      trust: ProvenanceTrust;
      profileKey?: string;
    },
  ): Promise<{ deferred: boolean; learnId?: string }> {
    const id = this.assertAccount(accountId);
    if (this.localModelBusy) {
      return { deferred: true };
    }
    // Skills always pending; L1/L2 pending by default — never direct write from review.
    const result = await this.proposeLearn(id, {
      kind: proposal.kind,
      targetPath: proposal.targetPath,
      payload: proposal.payload,
      summary: proposal.summary,
      trust: proposal.trust,
      ...(proposal.profileKey !== undefined ? { profileKey: proposal.profileKey } : {}),
    });
    return { deferred: false, learnId: result.learn.id };
  }

  /* ---- Backend containment (V-MEM-6, V-MEM-12, V-MEM-20) ---- */

  attachDeepBackend(backend: DeepBackendHandle): void {
    this.deepBackend = backend;
  }

  disableDeepBackend(): void {
    if (this.deepBackend) this.deepBackend.enabled = false;
  }

  /** Backend may only read standing; cannot write L2/L3 (V-MEM-6). */
  async backendReadStanding(accountId: string): Promise<{ memoryMd: string }> {
    const id = this.assertAccount(accountId);
    const loaded = await this.store.load(id);
    return { memoryMd: loaded.memoryMd };
  }

  async backendIngestDerived(
    accountId: string,
    sessionId: string,
    chunk: string,
  ): Promise<void> {
    const id = this.assertAccount(accountId);
    if (!this.deepBackend?.enabled) {
      throw new MemoryError("bad_params", "no enabled deep backend");
    }
    let bySession = this.deepBackend.docs.get(id);
    if (!bySession) {
      bySession = new Map();
      this.deepBackend.docs.set(id, bySession);
    }
    const list = bySession.get(sessionId) ?? [];
    list.push(chunk);
    bySession.set(sessionId, list);
    // Also write under memory-backend/ for account-removal purge (V-MEM-20).
    const dir = join(this.store.accountRoot(id), "memory-backend", this.deepBackend.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${sessionId}.json`), JSON.stringify(list), "utf8");
  }

  async backendQuery(
    accountId: string,
    sessionId: string,
  ): Promise<string[]> {
    const id = this.assertAccount(accountId);
    if (!this.deepBackend) return [];
    return this.deepBackend.docs.get(id)?.get(sessionId) ?? [];
  }

  async deleteSession(accountId: string, sessionId: string): Promise<void> {
    const id = this.assertAccount(accountId);
    await this.sessions.deleteSession(id, sessionId);
    if (this.deepBackend) {
      this.deepBackend.docs.get(id)?.delete(sessionId);
      if (this.deepBackend.enabled) {
        await rm(
          join(this.store.accountRoot(id), "memory-backend", this.deepBackend.id, `${sessionId}.json`),
          { force: true },
        );
      }
    }
  }

  async purgeAccountBackendState(accountId: string): Promise<void> {
    const id = this.assertAccount(accountId);
    await rm(join(this.store.accountRoot(id), "memory-backend"), {
      recursive: true,
      force: true,
    });
    this.deepBackend?.docs.delete(id);
  }

  /** Compact archives must not appear in recall (B8 acceptance). */
  async compactArchivePaths(accountId: string): Promise<string[]> {
    const id = this.assertAccount(accountId);
    const dir = compactPaths(this.store.accountRoot(id)).compactDir;
    try {
      const names = await readdir(dir);
      return names.map((n) => `memory/compact/${n}`);
    } catch {
      return [];
    }
  }

  private async collectCorpus(
    accountId: string,
  ): Promise<Array<{ path: string; content: string }>> {
    const loaded = await this.store.load(accountId);
    const docs: Array<{ path: string; content: string }> = [
      { path: "MEMORY.md", content: loaded.memoryMd },
    ];
    const memoryDir = this.store.paths(accountId).memoryDir;
    let names: string[] = [];
    try {
      names = await readdir(memoryDir);
    } catch {
      names = [];
    }
    for (const name of names) {
      if (!isDailyNoteFilename(name)) continue;
      // Explicitly skip anything under compact/ (readdir of memory/ is flat).
      const content =
        loaded.dailies.get(name.replace(/\.md$/, "")) ??
        (await readFile(join(memoryDir, name), "utf8").catch(() => ""));
      docs.push({ path: `memory/${name}`, content });
    }
    // Never include compact diaries even if somehow cached.
    return docs.filter((d) => !d.path.includes("memory/compact/"));
  }
}

function routeRemember(
  target: RememberTarget,
  text: string,
  key?: string,
): { layer: "l1" | "l2" | "l3"; key?: string } {
  if (target === "profile") return { layer: "l1", ...(key !== undefined ? { key } : {}) };
  if (target === "l2") return { layer: "l2" };
  if (target === "l3") return { layer: "l3" };

  // auto heuristics (§7.0)
  if (key) return { layer: "l1", key };
  const lower = text.toLowerCase();
  if (
    /\b(my name is|i am called|i prefer|preferred_language|call me)\b/i.test(text) ||
    /我叫|我偏好|我喜欢/.test(text)
  ) {
    const inferred =
      key ??
      (/\bname\b/i.test(lower) || /我叫/.test(text) ? "name" : "preference");
    return { layer: "l1", key: inferred };
  }
  if (/\b(today|this morning|just now|earlier)\b/i.test(text) || /今天|刚才/.test(text)) {
    return { layer: "l3" };
  }
  // Durable non-profile → L2; ambiguous → L3 (safer).
  if (text.length > 80 || /\b(decided|always|never|rule)\b/i.test(text)) {
    return { layer: "l2" };
  }
  return { layer: "l3" };
}

export function __resetMemoryForTests(): void {
  __resetWriterLocksForTests();
}

export { INJECT_BUDGET, RAW_SOFT_CAP, STANDING_DUTY_LINE };
