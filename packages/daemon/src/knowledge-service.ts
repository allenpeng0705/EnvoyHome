// Doc KB + KnowYou facade for daemon — Knowledge-RAG Design.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EpisodicIndex,
  KnowledgeIndex,
  appendRagToStanding,
  buildEpisodicInjectBlock,
  buildKnowledgeInjectBlock,
  candidateConflictsWithStanding,
  filterEpisodicAgainstStanding,
  filterKnowledgeAgainstStanding,
  normalizeKnowledgeVirtualPath,
  type EpisodicHit,
  type IngestCandidate,
  type KnowledgeHit,
  type KnowYouAction,
  type RagInjectMode,
} from "@envoyhome/memory";
import type { HomePaths } from "./home-paths.js";
import type { EmbedEngineService } from "./local-engine/embed-engine.js";

export type KnowledgePolicy = {
  knowledgeInject: RagInjectMode;
  episodicInject: RagInjectMode;
  knowledgeInjectBudget: number;
  episodicInjectBudget: number;
};

const DEFAULT_POLICY: KnowledgePolicy = {
  /** Ship default after live KB/KnowYou eval gates (V-KB-6 / V-KY-5). Owner may set tool|off in Settings. */
  knowledgeInject: "auto",
  episodicInject: "auto",
  knowledgeInjectBudget: 4000,
  episodicInjectBudget: 4000,
};

/** Cap inject budgets (desktop UI also caps; RPC must fail closed). */
export const MAX_RAG_INJECT_BUDGET = 32_000;

function clampInjectBudget(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_RAG_INJECT_BUDGET, Math.floor(n));
}

function isRagMode(v: unknown): v is RagInjectMode {
  return v === "off" || v === "tool" || v === "auto";
}

export type IngestTurnResult = {
  action: KnowYouAction | "PENDING_LEARN";
  id?: string;
  key?: string;
  /** When action=PENDING_LEARN — standing conflict (V-KY-7). */
  conflictStanding?: string;
  profileKey?: string;
  text?: string;
};

export class KnowledgeService {
  readonly knowledge: KnowledgeIndex;
  readonly episodic: EpisodicIndex;

  constructor(
    private readonly paths: HomePaths,
    private readonly embed: EmbedEngineService,
  ) {
    this.knowledge = new KnowledgeIndex((id) => this.paths.accountRoot(id));
    this.episodic = new EpisodicIndex((id) => this.paths.accountRoot(id));
  }

  private policyPath(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "memory-backend", "knowledge-policy.json");
  }

  async getPolicy(accountId: string): Promise<KnowledgePolicy> {
    try {
      const raw = await readFile(this.policyPath(accountId), "utf8");
      const parsed = JSON.parse(raw) as Partial<KnowledgePolicy>;
      return {
        knowledgeInject: isRagMode(parsed.knowledgeInject)
          ? parsed.knowledgeInject
          : DEFAULT_POLICY.knowledgeInject,
        episodicInject: isRagMode(parsed.episodicInject)
          ? parsed.episodicInject
          : DEFAULT_POLICY.episodicInject,
        knowledgeInjectBudget:
          typeof parsed.knowledgeInjectBudget === "number" && parsed.knowledgeInjectBudget >= 0
            ? clampInjectBudget(parsed.knowledgeInjectBudget)
            : DEFAULT_POLICY.knowledgeInjectBudget,
        episodicInjectBudget:
          typeof parsed.episodicInjectBudget === "number" && parsed.episodicInjectBudget >= 0
            ? clampInjectBudget(parsed.episodicInjectBudget)
            : DEFAULT_POLICY.episodicInjectBudget,
      };
    } catch {
      return { ...DEFAULT_POLICY };
    }
  }

  async setPolicy(
    accountId: string,
    patch: Partial<KnowledgePolicy>,
  ): Promise<KnowledgePolicy> {
    const cur = await this.getPolicy(accountId);
    const next: KnowledgePolicy = {
      knowledgeInject: isRagMode(patch.knowledgeInject)
        ? patch.knowledgeInject
        : cur.knowledgeInject,
      episodicInject: isRagMode(patch.episodicInject)
        ? patch.episodicInject
        : cur.episodicInject,
      knowledgeInjectBudget:
        typeof patch.knowledgeInjectBudget === "number" && patch.knowledgeInjectBudget >= 0
          ? clampInjectBudget(patch.knowledgeInjectBudget)
          : cur.knowledgeInjectBudget,
      episodicInjectBudget:
        typeof patch.episodicInjectBudget === "number" && patch.episodicInjectBudget >= 0
          ? clampInjectBudget(patch.episodicInjectBudget)
          : cur.episodicInjectBudget,
    };
    await mkdir(join(this.paths.accountRoot(accountId), "memory-backend"), { recursive: true });
    await writeFile(this.policyPath(accountId), JSON.stringify(next, null, 2) + "\n", "utf8");
    return next;
  }

  knowledgeRoot(accountId: string): string {
    return join(this.paths.accountFiles(accountId), "knowledge");
  }

  private async embedFn(): Promise<
    ((texts: string[]) => Promise<number[][]>) | undefined
  > {
    if (!(await this.embed.isReady())) return undefined;
    return (texts) => this.embed.embedTexts(texts);
  }

  async reindexKnowledge(accountId: string): Promise<{
    sectionCount: number;
    paths: number;
  }> {
    const emb = await this.embedFn();
    return this.knowledge.reindex(accountId, this.knowledgeRoot(accountId), {
      ...(emb
        ? { embed: emb, embedModelId: this.embed.currentModelId() }
        : {}),
    });
  }

  async onKnowledgeFileWrite(accountId: string, virtualPath: string): Promise<void> {
    const norm = normalizeKnowledgeVirtualPath(virtualPath);
    if (!norm) return;
    const emb = await this.embedFn();
    await this.knowledge.upsertPath(accountId, this.knowledgeRoot(accountId), norm, {
      ...(emb ? { embed: emb, embedModelId: this.embed.currentModelId() } : {}),
    });
  }

  /** Mark Doc KB + KnowYou vectors stale for every known account (V-EMB-6). */
  async markAllEmbedStale(accountIds: string[]): Promise<void> {
    for (const id of accountIds) {
      try {
        await this.knowledge.markEmbedStale(id);
      } catch {
        /* account may lack index yet */
      }
      try {
        await this.episodic.markEmbedStale(id);
      } catch {
        /* optional */
      }
    }
  }

  /**
   * After embed engine becomes ready — reindex Doc KB + backfill KnowYou vectors.
   */
  async backfillEmbeddings(accountIds: string[]): Promise<void> {
    const emb = await this.embedFn();
    if (!emb) return;
    const modelId = this.embed.currentModelId();
    for (const id of accountIds) {
      try {
        await this.knowledge.reindex(id, this.knowledgeRoot(id), {
          embed: emb,
          embedModelId: modelId,
        });
      } catch {
        /* per-account soft */
      }
      try {
        await this.episodic.backfillEmbeddings(id, emb, {
          embedModelId: modelId,
          force: true,
        });
      } catch {
        /* per-account soft */
      }
    }
  }

  async searchKnowledge(
    accountId: string,
    query: string,
    opts?: { limit?: number },
  ): Promise<{ hits: KnowledgeHit[] }> {
    const limit = opts?.limit ?? 8;
    const st = await this.knowledge.status(accountId);
    if (st.embedStale) {
      return this.knowledge.search(accountId, query, { limit });
    }
    try {
      if (await this.embed.isReady()) {
        const [qv] = await this.embed.embedTexts([query]);
        if (qv && qv.length > 0) {
          return this.knowledge.searchHybrid(accountId, query, {
            limit,
            queryEmbedding: qv,
          });
        }
      }
    } catch {
      /* FTS */
    }
    return this.knowledge.search(accountId, query, { limit });
  }

  async knowledgeStatus(accountId: string) {
    const st = await this.knowledge.status(accountId);
    const ky = await this.episodic.status(accountId);
    const emb = await this.embed.getStatus();
    return {
      ...st,
      knowYouRows: ky.activeCount,
      knowYouEmbedStale: ky.embedStale,
      embedReady: emb.ready,
      embedMode: emb.mode,
    };
  }

  async searchKnowYou(
    accountId: string,
    query: string,
    opts?: { limit?: number },
  ): Promise<{ hits: EpisodicHit[] }> {
    const searchOpts: { limit?: number; queryEmbedding?: number[] } = {};
    if (opts?.limit !== undefined) searchOpts.limit = opts.limit;
    const st = await this.episodic.status(accountId);
    if (!st.embedStale) {
      try {
        if (await this.embed.isReady()) {
          const [qv] = await this.embed.embedTexts([query]);
          if (qv && qv.length > 0) searchOpts.queryEmbedding = qv;
        }
      } catch {
        /* FTS */
      }
    }
    return this.episodic.search(accountId, query, searchOpts);
  }

  async updateKnowYou(
    accountId: string,
    input: {
      action: "forget" | "supersede";
      id?: string;
      key?: string;
      text?: string;
    },
  ) {
    return this.episodic.updateKnowYou(accountId, input);
  }

  /**
   * Extract + ingest. Standing conflicts → PENDING_LEARN (no episodic ADD) — V-KY-7.
   */
  async ingestTurn(
    accountId: string,
    userText: string,
    assistantText: string | undefined,
    opts: {
      allowWrites: boolean;
      sourceTurnId?: string;
      sourceSessionId?: string;
      profileFacts?: Record<string, string>;
      memoryMd?: string;
    },
  ): Promise<IngestTurnResult[]> {
    const candidates: IngestCandidate[] = EpisodicIndex.extractCandidates(
      userText,
      assistantText,
    ).map((c) => {
      const next: IngestCandidate = { text: c.text };
      if (c.key !== undefined) next.key = c.key;
      if (opts.sourceTurnId !== undefined) next.sourceTurnId = opts.sourceTurnId;
      if (opts.sourceSessionId !== undefined) next.sourceSessionId = opts.sourceSessionId;
      return next;
    });
    if (candidates.length === 0) return [];

    const profileFacts = opts.profileFacts ?? {};
    const memoryMd = opts.memoryMd ?? "";
    const safe: IngestCandidate[] = [];
    const results: IngestTurnResult[] = [];

    for (const c of candidates) {
      const gate = candidateConflictsWithStanding(c, profileFacts, memoryMd);
      if (gate.conflicts) {
        const row: IngestTurnResult = {
          action: "PENDING_LEARN",
          text: c.text,
        };
        if (c.key !== undefined) row.key = c.key;
        if (gate.standing !== undefined) row.conflictStanding = gate.standing;
        if (gate.profileKey !== undefined) row.profileKey = gate.profileKey;
        results.push(row);
        continue;
      }
      safe.push(c);
    }

    if (safe.length > 0) {
      const embReady = await this.embed.isReady();
      const ingested = await this.episodic.ingest(accountId, safe, {
        allowWrites: opts.allowWrites,
        ...(embReady
          ? {
              queryEmbeddingFor: async (text: string) => {
                try {
                  const [v] = await this.embed.embedTexts([text]);
                  return v;
                } catch {
                  return undefined;
                }
              },
              embedModelId: this.embed.currentModelId(),
            }
          : {}),
      });
      for (const r of ingested) {
        const row: IngestTurnResult = { action: r.action };
        if (r.id !== undefined) row.id = r.id;
        if (r.key !== undefined) row.key = r.key;
        results.push(row);
      }
    }
    return results;
  }

  async purgeSession(accountId: string, sessionId: string): Promise<number> {
    return this.episodic.purgeSession(accountId, sessionId);
  }

  /**
   * Build optional RAG inject blocks for turn prologue (P3/P5).
   * Standing extras required for L1/L2 contradiction filters.
   */
  async buildRagInject(
    accountId: string,
    userMessage: string,
    standingExtras?: {
      profileFacts?: Record<string, string>;
      memoryMd?: string;
    },
  ): Promise<{ knowledge: string; episodic: string; combined: string }> {
    const policy = await this.getPolicy(accountId);
    const profileFacts = standingExtras?.profileFacts ?? {};
    const memoryMd = standingExtras?.memoryMd ?? "";
    let knowledge = "";
    let episodic = "";

    if (policy.knowledgeInject === "auto" && userMessage.trim()) {
      let { hits } = await this.searchKnowledge(accountId, userMessage, { limit: 6 });
      hits = filterKnowledgeAgainstStanding(hits, profileFacts, memoryMd);
      knowledge = buildKnowledgeInjectBlock(hits, policy.knowledgeInjectBudget).text;
    }

    if (policy.episodicInject === "auto" && userMessage.trim()) {
      let { hits } = await this.searchKnowYou(accountId, userMessage, { limit: 6 });
      hits = filterEpisodicAgainstStanding(hits, profileFacts, memoryMd);
      episodic = buildEpisodicInjectBlock(hits, policy.episodicInjectBudget).text;
    }

    return {
      knowledge,
      episodic,
      combined: appendRagToStanding("", knowledge, episodic).trim(),
    };
  }
}
