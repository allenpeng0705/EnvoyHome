// Turn pipeline: sessions, harness, providers, approvals (B6) + product events.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { registerResetHook } from "@envoyhome/test-utils";
import {
  PRODUCT_IDENTITY_MARKER,
  PRODUCT_IDENTITY_PROLOGUE,
  extractStandingPatchValue,
} from "@envoyhome/memory";
import {
  ApprovalSink,
  ApprovalStore,
  ProviderHandle,
  appendTranscriptLine,
  canonicalDigest,
  coalesceAssistantByTurnId,
  countTranscriptLines,
  dispatchTool,
  newTurnId,
  readTranscript,
  readTranscriptEnsuringMessageIds,
  runTurn,
  updateTranscript,
  writeTranscript,
  type HistoryMessage,
  type PendingApproval,
  type TurnContext,
  type TurnDeps,
  type TurnOrigin,
  parseAssistantToolCalls,
} from "@envoyhome/harness-host";
import { isFilesystemRoot, resolveSandboxPath, safeJoin } from "./fs-jail.js";
import { isHarnessAgentSystemPromptLeak } from "./home-agent-session.js";
import type { HomePaths } from "./home-paths.js";
import { listSandboxDir, searchSandboxFiles } from "./sandbox-fs-browse.js";
import type { WebSearchService } from "./web-search.js";
import {
  browserDefaultProfileForOrigin,
  type BrowserControlService,
} from "./browser-control.js";
import type { ScheduleService } from "./schedule/service.js";
import type { WorkflowStore } from "./workflows.js";
import {
  compileWorkflowGraph,
  executeWorkflow,
  matchKeywordWorkflow,
  type WorkflowDef,
  type WorkflowStepResult,
} from "@envoyhome/workflows";
import {
  classifyOutputFormat,
  shouldSpillThinClientLink,
  summarizeForLinkBubble,
} from "./output-format.js";
import type { SessionStore } from "./sessions.js";
import type { ProviderStore } from "./providers-store.js";
import type { HarnessStore } from "./harness-store.js";
import type { AccountStore } from "./accounts.js";
import {
  compactTranscriptLines,
  deriveTrust,
  flushItemsFromOldestHalf,
  historyBudgetForPressure,
  parseCapsOverride,
  parseInjectBudgetMode,
  planSessionPressure,
  resolveInjectProfiles,
  type InjectProfileId,
  type MemoryFacade,
  type ResolveInjectProfilesResult,
  type StandingInjectResult,
} from "@envoyhome/memory";
import type { ProductEmit } from "./product-events.js";
import { PolicyStore, PrivacyModeStore } from "./policy-store.js";
import { MediaGenerateStore } from "./media-generate-store.js";
import { formatSchedulesChatCard } from "./schedule/chat-card.js";
import { isScheduleAffirmation, isScheduleDenial } from "./schedule/affirm.js";
import { formatScheduleIntentOffer } from "./schedule/intent-offer.js";
import { resolveScheduleFromText } from "./schedule/resolve-nl.js";
import {
  extractScheduleMessage,
  scheduleCandidateProposeAttempts,
} from "./schedule/choice-followup.js";
import { resolveReferenceNow } from "./client-context.js";
import {
  ChoiceStore,
  type ChoiceAnswer,
  type PendingChoice,
} from "./choice-store.js";
import type { SkillService } from "./skills.js";
import type { ChannelService } from "./channels/service.js";
import type { ActuationService } from "./actuation-service.js";
import {
  normalizeWorkflowToolName,
  runExtendedWorkflowTool,
  workflowHttpFetch,
} from "./workflow-tools.js";
import {
  buildBoundObjectCard,
  consumeStickyTurn,
  extractHomeProposalFromAssistant,
  isHomeDenial,
  isSmartHomeReady,
  normalizePurpose,
  pendingFromPlan,
  planAffirmedHomeActuation,
  planLocalHomeActuation,
  resolveHomeSurface,
  type SessionPurpose,
} from "./home-intent.js";

export interface TurnWireResult {
  turnId: string;
  sessionId: string;
  status: "started";
  route: "harness" | "workflow" | "direct";
}

export interface TurnCompleteInfo {
  turnId: string;
  sessionId: string;
  accountId: string;
  status: "ok" | "cancelled" | "error";
  replyText: string;
  channel?: string;
  rawRef?: string;
  origin: TurnOrigin;
  /** Paired device that sent home.sendMessage — turn-finished push prefers it. */
  deviceId?: string;
  /** Thin-client UI locale for generic turn-push body (preferred over account). */
  locale?: string;
  /** KnowYou write gate (V-KY-3) — owner/agent only; untrusted → no ADD. */
  memoryTrust?: "owner" | "agent" | "untrusted";
}

interface ActiveTurn {
  accountId: string;
  sessionId: string;
  abort: AbortController;
  approvalWaiters: Map<string, (d: "allow" | "deny") => void>;
  /** ask_user tool parks until home.answerChoice (or cancel/expire). */
  choiceWaiters: Map<string, (a: ChoiceAnswer | null | "expired") => void>;
}

const active = new Map<string, ActiveTurn>();
const finished = new Set<string>();

registerResetHook(() => {
  active.clear();
  finished.clear();
});

function sessionHasActiveTurn(sessionId: string): boolean {
  for (const t of active.values()) {
    if (t.sessionId === sessionId) return true;
  }
  return false;
}

function refuseIfTurnActive(sessionId: string): void {
  if (!sessionHasActiveTurn(sessionId)) return;
  throw Object.assign(
    new Error("envoyhome.bad_params: session has an active turn — wait or cancel first"),
    { code: "bad_params" },
  );
}

/** Every turn system prompt must lead with EnvoyHome identity (not the model brand). */
function withProductIdentity(standing: string | undefined): string {
  const body = (standing ?? "").trim();
  if (body.includes(PRODUCT_IDENTITY_MARKER)) return body;
  return body ? `${PRODUCT_IDENTITY_PROLOGUE}\n\n${body}` : PRODUCT_IDENTITY_PROLOGUE;
}

function deriveOrigin(callerKind: string, explicit?: TurnOrigin): TurnOrigin {
  if (explicit) return explicit;
  if (callerKind === "event-source" || callerKind === "unattended") return "unattended";
  return "attended";
}

function transcriptToHistory(lines: Record<string, unknown>[]): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  for (const line of coalesceAssistantByTurnId(lines)) {
    const role = String(line.role ?? "");
    const text =
      typeof line.text === "string"
        ? line.text
        : typeof line.content === "string"
          ? line.content
          : "";
    if (!text) continue;
    // Drop leaked Agent systemPrompt rows (pre-fix transcripts).
    if (role === "system" && isHarnessAgentSystemPromptLeak(text)) continue;
    if (role === "user" || role === "assistant" || role === "system") {
      out.push({ role, content: text });
    }
  }
  return out;
}

/** Hide harness systemPrompt leaks from mobile/desktop hydrate. */
function filterTranscriptForClient(
  lines: Record<string, unknown>[],
): Record<string, unknown>[] {
  return lines.filter((line) => {
    if (String(line.role ?? "") !== "system") return true;
    const text =
      typeof line.text === "string"
        ? line.text
        : typeof line.content === "string"
          ? line.content
          : "";
    return !isHarnessAgentSystemPromptLeak(text);
  });
}

function wireChoice(row: PendingChoice): Record<string, unknown> {
  return {
    id: row.id,
    accountId: row.accountId,
    sessionId: row.sessionId,
    question: row.question,
    options: row.options,
    selection: row.selection,
    purpose: row.purpose,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    ...(row.turnId ? { turnId: row.turnId } : {}),
    ...(row.detail ? { detail: row.detail } : {}),
    ...(row.multiline === true ? { multiline: true } : {}),
  };
}

function wireApproval(row: PendingApproval): Record<string, unknown> {
  return {
    id: row.id,
    accountId: row.accountId,
    agentId: row.agentId,
    turnId: row.turnId,
    tool: row.tool,
    argsDigest: row.argsDigest,
    risk: row.risk,
    origin: row.origin,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    ...(row.summary !== undefined ? { summary: row.summary } : {}),
    objectId: "",
    desiredState: "",
    safetyClass: row.risk === "admin" || row.risk === "sensitive",
    answerableBy: ["loopback-owner"],
  };
}

function wireGrant(g: {
  id: string;
  accountId: string;
  tool: string;
  argsDigest: string;
  risk: string;
  grantedBy: string;
  createdAt: string;
  expiresAt: string | null;
}): Record<string, unknown> {
  const full = /^sha256:[a-f0-9]{64}$/.test(g.argsDigest);
  return {
    id: g.id,
    accountId: g.accountId,
    tool: g.tool,
    argsDigest: g.argsDigest,
    isFullDigest: full,
    objectId: "",
    desiredState: "",
    risk: g.risk,
    grantedBy: g.grantedBy,
    createdAt: g.createdAt,
    expiresAt: g.expiresAt,
  };
}

export class TurnService {
  readonly approvals: ApprovalStore;
  readonly choices: ChoiceStore;
  readonly sessions: SessionStore;
  readonly policy: PolicyStore;
  readonly privacyMode: PrivacyModeStore;
  readonly mediaGenerate: MediaGenerateStore;
  private emit: ProductEmit = () => undefined;
  private onComplete: ((info: TurnCompleteInfo) => void | Promise<void>) | undefined;
  /** Household Owner id for R3 workspace effectiveness (Design §4.1.1). */
  private getOwnerAccountId: () => string | null = () => null;
  private webSearch: WebSearchService | null = null;
  private browserControl: BrowserControlService | null = null;
  private schedules: ScheduleService | null = null;
  private knowledge: import("./knowledge-service.js").KnowledgeService | null = null;

  constructor(
    private readonly paths: HomePaths,
    sessions: SessionStore,
    private readonly providers: ProviderStore,
    private readonly harnesses: HarnessStore,
    private readonly accounts: AccountStore,
    private readonly memory: MemoryFacade,
    private readonly workflows: WorkflowStore,
    private readonly skills: SkillService,
    private readonly channels: ChannelService,
    private readonly actuations: ActuationService,
  ) {
    this.sessions = sessions;
    this.approvals = new ApprovalStore((accountId) => this.paths.accountRoot(accountId));
    this.choices = new ChoiceStore(
      (accountId) => this.paths.accountRoot(accountId),
      (row) => this.onChoiceExpired(row),
    );
    this.policy = new PolicyStore(paths);
    this.privacyMode = new PrivacyModeStore(paths);
    this.mediaGenerate = new MediaGenerateStore(paths);
  }

  /** Fail-closed: prune wakes parked ask_user (tool emits); else notify UI. */
  private onChoiceExpired(row: PendingChoice): void {
    if (row.turnId) {
      const turn = active.get(row.turnId);
      const waiter = turn?.choiceWaiters.get(row.id);
      if (waiter) {
        turn!.choiceWaiters.delete(row.id);
        waiter("expired");
        return;
      }
    }
    this.emit("home:choice-resolved", {
      id: row.id,
      accountId: row.accountId,
      sessionId: row.sessionId,
      status: "expired",
    });
  }

  setEmit(emit: ProductEmit): void {
    this.emit = emit;
  }

  setOnComplete(handler: (info: TurnCompleteInfo) => void | Promise<void>): void {
    this.onComplete = handler;
  }

  setOwnerAccountIdLookup(fn: () => string | null): void {
    this.getOwnerAccountId = fn;
  }

  setKnowledge(svc: import("./knowledge-service.js").KnowledgeService): void {
    this.knowledge = svc;
  }

  /** Post-turn KnowYou extract + V-KY-7 PendingLearn on L1/L2 conflict. */
  private async ingestKnowYouAfterTurn(
    info: TurnCompleteInfo,
    userText: string,
    assistantText: string,
    allowWrites: boolean,
  ): Promise<void> {
    if (!this.knowledge) return;
    const { profile } = await this.memory.getProfile(info.accountId);
    const profileFacts: Record<string, string> = {};
    for (const [k, fact] of Object.entries(profile.facts ?? {})) {
      const v = fact?.value;
      if (typeof v === "string") profileFacts[k] = v;
      else if (typeof v === "number" || typeof v === "boolean") profileFacts[k] = String(v);
      else if (Array.isArray(v)) profileFacts[k] = v.join(", ");
    }
    let memoryMd = "";
    try {
      const listed = await this.memory.listMemory(info.accountId, {
        includeContent: true,
      });
      const note = listed.notes.find((n) => n.path === "MEMORY.md");
      memoryMd = typeof note?.content === "string" ? note.content : "";
    } catch {
      memoryMd = "";
    }
    const results = await this.knowledge.ingestTurn(
      info.accountId,
      userText,
      assistantText,
      {
        allowWrites,
        sourceTurnId: info.turnId,
        sourceSessionId: info.sessionId,
        profileFacts,
        memoryMd,
      },
    );
    for (const r of results) {
      if (r.action !== "PENDING_LEARN" || !r.text?.trim()) continue;
      try {
        if (r.profileKey) {
          const value = extractStandingPatchValue(r.text, r.profileKey);
          await this.memory.proposeLearn(info.accountId, {
            kind: "profile_patch",
            targetPath: "profile.json",
            profileKey: r.profileKey,
            // acceptLearn writes payload as the fact value (plain short text).
            payload: value,
            summary: `KnowYou conflict: update ${r.profileKey} (was ${r.conflictStanding ?? "?"})`,
            trust: allowWrites ? "agent" : "untrusted",
            sourceTurnId: info.turnId,
          });
        } else {
          await this.memory.proposeLearn(info.accountId, {
            kind: "memory_append",
            targetPath: "MEMORY.md",
            payload: r.text,
            summary: `KnowYou conflict with standing: ${r.conflictStanding ?? "L1/L2"}`,
            trust: allowWrites ? "agent" : "untrusted",
            sourceTurnId: info.turnId,
          });
        }
      } catch {
        /* queue full / learn errors must not fail turn */
      }
    }
  }

  /** Knowledge-RAG §6 — append budgeted KnowYou / Doc KB blocks when inject=auto. */
  private async withRagInject(
    accountId: string,
    standingText: string,
    userMessage?: string,
  ): Promise<string> {
    if (!this.knowledge || !userMessage?.trim()) return standingText;
    try {
      const { profile } = await this.memory.getProfile(accountId);
      const profileFacts: Record<string, string> = {};
      for (const [k, fact] of Object.entries(profile.facts ?? {})) {
        const v = fact?.value;
        if (typeof v === "string") profileFacts[k] = v;
        else if (typeof v === "number" || typeof v === "boolean") profileFacts[k] = String(v);
        else if (Array.isArray(v)) profileFacts[k] = v.join(", ");
      }
      let memoryMd = "";
      try {
        const listed = await this.memory.listMemory(accountId, { includeContent: true });
        const note = listed.notes.find((n) => n.path === "MEMORY.md");
        memoryMd = typeof note?.content === "string" ? note.content : "";
      } catch {
        memoryMd = "";
      }
      const rag = await this.knowledge.buildRagInject(accountId, userMessage, {
        profileFacts,
        memoryMd,
      });
      if (!rag.combined) return standingText;
      return `${standingText.trim()}\n\n${rag.combined}`.trim();
    } catch {
      return standingText;
    }
  }

  setWebSearch(svc: WebSearchService): void {
    this.webSearch = svc;
  }

  setBrowserControl(svc: BrowserControlService): void {
    this.browserControl = svc;
  }

  setSchedules(svc: ScheduleService): void {
    this.schedules = svc;
  }

  async getTranscript(accountId: string, sessionId: string): Promise<Record<string, unknown>[]> {
    const session = await this.sessions.get(accountId, sessionId);
    if (!session) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown session"), { code: "bad_params" });
    }
    // Locked migrate+read: messageIds + coalesce-by-turnId persisted (mobile/desktop hydrate).
    const lines = await readTranscriptEnsuringMessageIds(
      this.sessions.sessionDir(accountId, sessionId),
    );
    return filterTranscriptForClient(lines);
  }

  /** Empty the transcript; keep the session id (Home chat single-session + general Empty). */
  async clearTranscript(accountId: string, sessionId: string): Promise<{ ok: true }> {
    const session = await this.sessions.get(accountId, sessionId);
    if (!session) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown session"), { code: "bad_params" });
    }
    refuseIfTurnActive(sessionId);
    await updateTranscript(this.sessions.sessionDir(accountId, sessionId), () => []);
    await this.sessions.touch(accountId, sessionId);
    return { ok: true };
  }

  /** Delete transcript lines by messageId (synthetic legacy ids included). */
  async deleteTranscriptMessages(
    accountId: string,
    sessionId: string,
    messageIds: string[],
  ): Promise<{ ok: true; removed: number }> {
    const session = await this.sessions.get(accountId, sessionId);
    if (!session) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown session"), { code: "bad_params" });
    }
    refuseIfTurnActive(sessionId);
    const want = new Set(messageIds.filter((id) => typeof id === "string" && id.length > 0));
    if (want.size === 0) {
      throw Object.assign(new Error("envoyhome.bad_params: messageIds required"), {
        code: "bad_params",
      });
    }
    let removed = 0;
    await updateTranscript(this.sessions.sessionDir(accountId, sessionId), (lines) => {
      // If UI deletes a coalesced assistant bubble, drop every chunk with that turnId.
      const turnIdsToDrop = new Set<string>();
      for (const line of lines) {
        const id = String(line.messageId ?? "");
        if (!want.has(id)) continue;
        if (line.role === "assistant" && typeof line.turnId === "string" && line.turnId) {
          turnIdsToDrop.add(line.turnId);
        }
      }
      const kept: Record<string, unknown>[] = [];
      removed = 0;
      for (const line of lines) {
        const id = String(line.messageId ?? "");
        const turnId = typeof line.turnId === "string" ? line.turnId : "";
        if (
          want.has(id) ||
          (line.role === "assistant" && turnId && turnIdsToDrop.has(turnId))
        ) {
          removed += 1;
          continue;
        }
        kept.push(line);
      }
      return kept;
    });
    await this.sessions.touch(accountId, sessionId);
    return { ok: true, removed };
  }

  async archiveSession(accountId: string, sessionId: string): Promise<{ ok: true }> {
    refuseIfTurnActive(sessionId);
    const meta = await this.sessions.archive(accountId, sessionId);
    if (!meta) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown session"), { code: "bad_params" });
    }
    return { ok: true };
  }

  async unarchiveSession(accountId: string, sessionId: string): Promise<{ ok: true }> {
    refuseIfTurnActive(sessionId);
    const meta = await this.sessions.unarchive(accountId, sessionId);
    if (!meta) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown session"), { code: "bad_params" });
    }
    return { ok: true };
  }

  async removeSession(accountId: string, sessionId: string): Promise<{ ok: true }> {
    const session = await this.sessions.get(accountId, sessionId);
    if (!session) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown session"), { code: "bad_params" });
    }
    refuseIfTurnActive(sessionId);
    await this.sessions.remove(accountId, sessionId);
    // KnowYou: purge episodic rows tagged to this session (Knowledge-RAG cross-cutting).
    if (this.knowledge) {
      try {
        await this.knowledge.purgeSession(accountId, sessionId);
      } catch {
        /* non-fatal */
      }
    }
    try {
      await this.memory.deleteSession(accountId, sessionId);
    } catch {
      /* session FTS may already be absent */
    }
    return { ok: true };
  }

  /** Set display title; marks titleSource=user so first-message auto-title won't overwrite. */
  async renameSession(
    accountId: string,
    sessionId: string,
    title: string,
  ): Promise<{ ok: true; title: string }> {
    const session = await this.sessions.get(accountId, sessionId);
    if (!session) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown session"), { code: "bad_params" });
    }
    const next = title.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!next) {
      throw Object.assign(new Error("envoyhome.bad_params: title required"), { code: "bad_params" });
    }
    await this.sessions.patchMeta(accountId, sessionId, { title: next, titleSource: "user" });
    return { ok: true, title: next };
  }

  /**
   * Memory Design §8 — OpenClaw-style pre-turn flush + L0 compact (daemon / Gateway role).
   * Harness only receives the post-compaction history window.
   */
  private async maintainSessionWindow(input: {
    accountId: string;
    sessionId: string;
    turnId: string;
    newUserText: string;
    standingInjectText: string;
    contextTokens?: number;
    origin: TurnOrigin;
    callerKind: string;
    /** Explicit binding trust (Design §4.1.1 R5); falls back by origin/callerKind. */
    memoryTrust?: "owner" | "agent" | "untrusted";
  }): Promise<{ history: HistoryMessage[]; flushed: boolean; compacted: boolean }> {
    const sessionDir = this.sessions.sessionDir(input.accountId, input.sessionId);
    const meta = await this.sessions.get(input.accountId, input.sessionId);
    let lines = coalesceAssistantByTurnId(await readTranscript(sessionDir));
    const compactionCount = meta?.compactionCount ?? 0;
    const alreadyFlushedThisCycle =
      meta?.memoryFlushCompactionCount !== undefined &&
      meta.memoryFlushCompactionCount === compactionCount;

    const plan = planSessionPressure({
      ...(input.contextTokens !== undefined ? { contextTokens: input.contextTokens } : {}),
      standingInjectText: input.standingInjectText,
      history: lines,
      newUserText: input.newUserText,
      alreadyFlushedThisCycle,
    });

    let flushed = false;
    let compacted = false;

    if (!plan.needFlush && !plan.needCompact) {
      return { history: transcriptToHistory(lines), flushed, compacted };
    }

    const bindingTrust =
      input.memoryTrust ??
      (input.origin === "unattended"
        ? "agent"
        : input.callerKind === "loopback-owner"
          ? "owner"
          : "untrusted");
    const trust = deriveTrust({
      bindingTrust,
      ...(input.callerKind === "event-source" ? { channelKind: "event-source" as const } : {}),
    });

    // Soft-only → soft-threshold budget (non-empty drop-set); compact → compact budget;
    // unknown context → fixed small keep window (Memory Design §8).
    const historyBudget = historyBudgetForPressure({
      needCompact: plan.needCompact,
      ...(input.contextTokens !== undefined ? { contextTokens: input.contextTokens } : {}),
      standingInjectText: input.standingInjectText,
      newUserText: input.newUserText,
    });
    const preview = compactTranscriptLines(lines, historyBudget);
    let flushItems = preview.flushItems;
    // Soft-only: if soft preview still drops nothing durable, scan oldest half.
    if (plan.needFlush && !plan.needCompact && flushItems.length === 0) {
      flushItems = flushItemsFromOldestHalf(lines);
    }

    if (plan.needFlush) {
      try {
        const flushResult = await this.memory.flush(input.accountId, flushItems, {
          trust,
          turnId: input.turnId,
        });
        // Do not burn the once-per-cycle mark when flush is disabled/skipped, or
        // when soft-flush found nothing durable (retry later). Pre-compact empty
        // flush still marks so we do not loop forever before rewrite.
        const meaningful =
          !flushResult.skipped &&
          (flushItems.length > 0 ||
            flushResult.directWrites.length > 0 ||
            flushResult.pendingLearnIds.length > 0 ||
            plan.needCompact);
        if (meaningful) {
          await this.sessions.patchMeta(input.accountId, input.sessionId, {
            memoryFlushCompactionCount: compactionCount,
          });
          flushed = true;
        }
      } catch {
        // V-MEM-8: flush failure must not block compact / the user turn.
      }
    }

    if (plan.needCompact && preview.dropped.length > 0) {
      await writeTranscript(sessionDir, preview.kept);
      lines = preview.kept;
      await this.sessions.patchMeta(input.accountId, input.sessionId, {
        compactionCount: compactionCount + 1,
      });
      compacted = true;
      this.emit("home:session-compacted", {
        accountId: input.accountId,
        sessionId: input.sessionId,
        turnId: input.turnId,
        reason: plan.reason,
        droppedLines: preview.dropped.length,
      });
    }

    return { history: transcriptToHistory(lines), flushed, compacted };
  }

  activeTurnCount(): number {
    return active.size;
  }

  async openSession(input: {
    accountId: string;
    agentId?: string;
    title?: string;
    channel?: string;
    purpose?: SessionPurpose;
  }): Promise<Record<string, unknown>> {
    const purpose = normalizePurpose(input.purpose);
    if (purpose === "home") {
      const ready = await isSmartHomeReady(this.channels);
      if (!ready) {
        throw Object.assign(
          new Error(
            "envoyhome.tool_unavailable: Home chat requires Home Assistant or MQTT configured and enabled",
          ),
          { code: "bad_params" },
        );
      }
    }
    const meta = await this.sessions.open({ ...input, purpose });
    return {
      sessionId: meta.sessionId,
      accountId: meta.accountId,
      agentId: meta.agentId,
      createdAt: meta.createdAt,
      purpose: meta.purpose ?? "general",
      ...(meta.title ? { title: meta.title } : {}),
      ...(meta.titleSource ? { titleSource: meta.titleSource } : {}),
    };
  }

  async clearPendingScheduleConfirm(accountId: string, sessionId: string): Promise<void> {
    await this.sessions.patchMeta(accountId, sessionId, { pendingScheduleConfirm: null });
  }

  async listSessions(
    accountId: string,
    opts?: { includeArchived?: boolean },
  ): Promise<Record<string, unknown>> {
    const sessions = await this.sessions.list(accountId, opts);
    const out: Record<string, unknown>[] = [];
    for (const s of sessions) {
      const messageCount = await countTranscriptLines(
        this.sessions.sessionDir(accountId, s.sessionId),
      );
      const pending = s.pendingScheduleConfirm;
      out.push({
        sessionId: s.sessionId,
        ...(s.title !== undefined ? { title: s.title } : {}),
        ...(s.purpose !== undefined ? { purpose: s.purpose } : {}),
        ...(s.channel !== undefined ? { channel: s.channel } : {}),
        ...(s.archivedAt !== undefined ? { archivedAt: s.archivedAt } : {}),
        messageCount,
        updatedAt: s.updatedAt,
        ...(pending
          ? {
              pendingSchedule: {
                proposalId: pending.proposalId,
                resolvedLocal: pending.resolvedLocal,
                createdAt: pending.createdAt,
                ...(pending.expiresAt ? { expiresAt: pending.expiresAt } : {}),
                ...(pending.message ? { message: pending.message } : {}),
                ...(pending.name ? { name: pending.name } : {}),
              },
            }
          : {}),
      });
    }
    return { sessions: out };
  }

  async sendMessage(input: {
    accountId: string;
    sessionId: string;
    text: string;
    clientTurnId?: string;
    callerKind: string;
    /** Memory Design §13 binding trust for flush/compact (Design §4.1.1 R5). */
    memoryTrust?: "owner" | "agent" | "untrusted";
    /** Test hook: run tool plan without model. */
    plannedTools?: Array<{ tool: string; args: unknown; summary?: string }>;
    completionText?: string;
    origin?: TurnOrigin;
    channel?: string;
    rawRef?: string;
    /** Sandbox-relative media from home.uploadChatMedia (Design A.6). */
    media?: Array<{
      kind: "image" | "audio" | "video" | "file";
      uri: string;
      fileName?: string;
      mimeType?: string;
      bytes?: number;
    }>;
    /** True when the turn carries media attachments (Design §8.3 forceLocalForMedia). */
    hasMedia?: boolean;
    /** Design §7.4 / 2026-10-19m — thin-client now/TZ/locale/location. */
    clientContext?: import("./client-context.js").ClientTurnContext;
    /** Paired device id (thin-client) — for turn-finished push prefer-fan-out. */
    deviceId?: string;
  }): Promise<TurnWireResult> {
    const session = await this.sessions.get(input.accountId, input.sessionId);
    if (!session) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown session"), { code: "bad_params" });
    }
    const media = input.media ?? [];
    const { appendMediaToUserText, enrichMediaExtracts } = await import("./chat-media.js");
    const enriched = await enrichMediaExtracts(this.paths, input.accountId, media);
    const textForTurn = appendMediaToUserText(input.text, enriched);
    if (!textForTurn.trim()) {
      throw Object.assign(new Error("envoyhome.bad_params: text or media required"), {
        code: "bad_params",
      });
    }
    // ChatGPT-style: name from the first user message (or attachment) unless renamed.
    const priorLines = await readTranscript(
      this.sessions.sessionDir(input.accountId, input.sessionId),
    );
    if (priorLines.length === 0 && session.titleSource !== "user") {
      const fromText = input.text.trim().replace(/\s+/g, " ").slice(0, 60);
      const fromMedia =
        !fromText && media.length > 0
          ? String(media[0]?.fileName || media[0]?.uri || "Attached files")
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 60)
          : "";
      const title = fromText || fromMedia;
      if (title) {
        await this.sessions.patchMeta(input.accountId, input.sessionId, {
          title,
          titleSource: "auto",
        });
      }
    }
    const hasMedia = media.length > 0 || input.hasMedia === true;
    const turnId = newTurnId();
    await this.workflows.ensureLoaded();
    const matched = matchKeywordWorkflow(
      textForTurn,
      this.workflows.mergedForAccount(input.accountId),
    );
    const route = matched ? ("workflow" as const) : ("harness" as const);
    const abort = new AbortController();
    active.set(turnId, {
      accountId: input.accountId,
      sessionId: input.sessionId,
      abort,
      approvalWaiters: new Map(),
      choiceWaiters: new Map(),
    });

    const at = new Date().toISOString();
    this.emit("home:turn-started", {
      turnId,
      sessionId: input.sessionId,
      accountId: input.accountId,
      agentId: session.agentId,
      route,
      ...(input.clientTurnId !== undefined ? { clientTurnId: input.clientTurnId } : {}),
      at,
    });

    const turnInput = { ...input, text: textForTurn, hasMedia };
    if (matched) {
      void this.runWorkflowBackground({
        ...turnInput,
        turnId,
        agentId: session.agentId,
        abort,
        workflow: matched,
      });
    } else {
      void this.runTurnBackground({
        ...turnInput,
        turnId,
        agentId: session.agentId,
        abort,
      });
    }

    return { turnId, sessionId: input.sessionId, status: "started", route };
  }

  /**
   * ScheduleService system:review — heuristic PendingLearn from latest session user text.
   * Skips cleanly when reviewEnabled is off or local model is busy (MemoryFacade).
   */
  async runScheduledMemoryReview(accountId: string): Promise<{ proposed: number }> {
    const sessions = await this.sessions.list(accountId);
    const recent = sessions.slice(0, 5);
    let userText = "";
    for (const meta of recent) {
      try {
        const lines = await readTranscript(
          this.sessions.sessionDir(accountId, meta.sessionId),
        );
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i]?.role === "user") {
            const t = String(lines[i]?.text ?? "").trim();
            if (t) {
              userText = t;
              break;
            }
          }
        }
        if (userText) break;
      } catch {
        /* skip broken session */
      }
    }
    if (!userText) return { proposed: 0 };
    return this.memory.afterTurnEnrich(accountId, { userText });
  }

  /**
   * ScheduleService system:flush — soft-flush durable items from recent open sessions
   * when flushEnabled (turn-bound remains primary; this runs only if a flush job exists).
   */
  async runScheduledMemoryFlush(accountId: string): Promise<{ flushedSessions: number }> {
    const pol = await this.policy.get(accountId);
    if (!pol.flushEnabled) return { flushedSessions: 0 };
    const sessions = await this.sessions.list(accountId);
    let flushedSessions = 0;
    for (const meta of sessions.slice(0, 8)) {
      try {
        const sessionDir = this.sessions.sessionDir(accountId, meta.sessionId);
        const lines = coalesceAssistantByTurnId(await readTranscript(sessionDir));
        const flushItems = flushItemsFromOldestHalf(lines);
        if (flushItems.length === 0) continue;
        const result = await this.memory.flush(accountId, flushItems, {
          trust: "agent",
        });
        if (
          !result.skipped &&
          (result.directWrites.length > 0 || result.pendingLearnIds.length > 0)
        ) {
          flushedSessions += 1;
        }
      } catch {
        /* V-MEM-8: flush failure must not break the schedule tick */
      }
    }
    return { flushedSessions };
  }

  /**
   * ScheduleService fire path: single catalogue tool under §4.4 (unattended / grants).
   */
  async runScheduledTool(
    accountId: string,
    toolName: string,
    toolArgs: Record<string, unknown> = {},
  ): Promise<{ turnId: string; sessionId: string }> {
    const workflow = compileWorkflowGraph({
      id: `schedule-tool:${toolName}`,
      match: { schedule: "manual" },
      steps: [{ type: "tool", name: toolName, args: toolArgs }],
    });
    const session = await this.sessions.open({
      accountId,
      title: `schedule:tool:${toolName}`,
    });
    const turnId = newTurnId();
    const abort = new AbortController();
    active.set(turnId, {
      accountId,
      sessionId: session.sessionId,
      abort,
      approvalWaiters: new Map(),
      choiceWaiters: new Map(),
    });
    this.emit("home:turn-started", {
      turnId,
      sessionId: session.sessionId,
      accountId,
      agentId: session.agentId,
      route: "workflow",
      at: new Date().toISOString(),
    });
    void this.runWorkflowBackground({
      accountId,
      sessionId: session.sessionId,
      text: "",
      turnId,
      agentId: session.agentId,
      abort,
      callerKind: "schedule",
      workflow,
      origin: "unattended",
    });
    return { turnId, sessionId: session.sessionId };
  }

  /**
   * ScheduleService fire path: restricted agentTurn (Design §7.4 V-CRON-12).
   * Frozen prompt only — never re-parses WHEN. Elevated browser denied via unattended gates.
   */
  async runScheduledAgentTurn(
    accountId: string,
    opts: {
      prompt: string;
      toolPolicyPreset?: "standard" | "restricted";
      maxToolRounds?: number;
    },
  ): Promise<{ turnId: string; sessionId: string }> {
    const prompt = opts.prompt.trim();
    if (!prompt) {
      throw Object.assign(new Error("envoyhome.bad_params: agentTurn prompt required"), {
        code: "bad_params",
      });
    }
    const session = await this.sessions.open({
      accountId,
      title: `schedule:agentTurn`,
    });
    const turnId = newTurnId();
    const abort = new AbortController();
    active.set(turnId, {
      accountId,
      sessionId: session.sessionId,
      abort,
      approvalWaiters: new Map(),
      choiceWaiters: new Map(),
    });
    this.emit("home:turn-started", {
      turnId,
      sessionId: session.sessionId,
      accountId,
      agentId: session.agentId,
      route: "harness",
      at: new Date().toISOString(),
    });
    void this.runTurnBackground({
      accountId,
      sessionId: session.sessionId,
      text: prompt,
      turnId,
      agentId: session.agentId,
      abort,
      callerKind: "schedule",
      origin: "unattended",
      memoryTrust: "agent",
      toolPolicyOverride: opts.toolPolicyPreset ?? "restricted",
    });
    // Design 2026-10-19j — maxToolRounds validated/stored on the job; reserved
    // until a multi-round harness tool loop exists (then MUST enforce ≤ stored cap).
    void opts.maxToolRounds;
    return { turnId, sessionId: session.sessionId };
  }

  /**
   * Design §19.12 D2 — background image_generate job (async Adapt).
   * Quota consumed only on success; emits home:state-changed on settle.
   */
  private async runMediaGenerateJob(input: {
    accountId: string;
    jobId: string;
    prompt: string;
  }): Promise<void> {
    try {
      const out = await this.providers.generateImage({
        accountId: input.accountId,
        prompt: input.prompt,
      });
      if (!out.bytes.length || out.bytes.length > 8 * 1024 * 1024) {
        throw new Error("generated image empty or exceeds 8 MiB");
      }
      await this.mediaGenerate.consumeQuota(input.accountId);
      const stamp = Date.now().toString(36);
      const safeExt = out.ext.replace(/[^a-z0-9]/gi, "") || "png";
      const rel = `output/media/gen-${stamp}.${safeExt}`;
      const abs = join(this.paths.accountFiles(input.accountId), rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, out.bytes);
      await this.mediaGenerate.updateJob(input.accountId, input.jobId, {
        status: "done",
        path: rel,
        mimeType: out.mimeType,
      });
      this.emit("home:state-changed", {
        scope: "daemon",
        changedAt: new Date().toISOString(),
        detail: {
          kind: "media-generate",
          jobId: input.jobId,
          accountId: input.accountId,
          status: "done",
          path: rel,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.mediaGenerate.updateJob(input.accountId, input.jobId, {
        status: "error",
        error: message.slice(0, 500),
      });
      this.emit("home:state-changed", {
        scope: "daemon",
        changedAt: new Date().toISOString(),
        detail: {
          kind: "media-generate",
          jobId: input.jobId,
          accountId: input.accountId,
          status: "error",
          error: message.slice(0, 500),
        },
      });
    }
  }

  /**
   * Design §19.11 / V-P2-MSG-3 — sessions_send run+wait wake on an existing same-account session.
   * Appends via runTurnBackground (do not double-inject). waitMs 0 = fire-and-forget.
   */
  async runSessionsSendWake(opts: {
    accountId: string;
    sessionId: string;
    text: string;
    waitMs: number;
    fromSessionId?: string | null;
  }): Promise<{ turnId: string; reply?: string; timedOut?: boolean }> {
    const session = await this.sessions.get(opts.accountId, opts.sessionId);
    if (!session || session.accountId !== opts.accountId) {
      throw Object.assign(new Error("envoyhome.auth: session not found for this account"), {
        code: "auth",
      });
    }
    const text = opts.text.trim();
    if (!text) {
      throw Object.assign(new Error("envoyhome.bad_params: sessions_send text required"), {
        code: "bad_params",
      });
    }
    void opts.fromSessionId; // recorded by the tool layer / transcript provenance when inject-only
    const turnId = newTurnId();
    const abort = new AbortController();
    active.set(turnId, {
      accountId: opts.accountId,
      sessionId: opts.sessionId,
      abort,
      approvalWaiters: new Map(),
      choiceWaiters: new Map(),
    });
    this.emit("home:turn-started", {
      turnId,
      sessionId: opts.sessionId,
      accountId: opts.accountId,
      agentId: session.agentId,
      route: "harness",
      at: new Date().toISOString(),
    });
    const bg = this.runTurnBackground({
      accountId: opts.accountId,
      sessionId: opts.sessionId,
      text,
      turnId,
      agentId: session.agentId,
      abort,
      callerKind: "sessions_send",
      origin: "attended",
      memoryTrust: "agent",
    });
    if (opts.waitMs <= 0) {
      void bg;
      return { turnId };
    }
    let timedOut = false;
    await Promise.race([
      bg,
      new Promise<void>((resolve) => {
        setTimeout(() => {
          timedOut = true;
          resolve();
        }, opts.waitMs);
      }),
    ]);
    if (timedOut) {
      return { turnId, timedOut: true };
    }
    const sessionDir = this.sessions.sessionDir(opts.accountId, opts.sessionId);
    let reply = "";
    try {
      const { readTranscript, coalesceAssistantByTurnId } = await import(
        "@envoyhome/harness-host"
      );
      const lines = await readTranscript(sessionDir);
      const coalesced = coalesceAssistantByTurnId(lines);
      for (let i = coalesced.length - 1; i >= 0; i--) {
        const line = coalesced[i]!;
        if (line["role"] === "assistant" && line["turnId"] === turnId) {
          reply = typeof line["content"] === "string" ? line["content"] : "";
          break;
        }
      }
    } catch {
      reply = "";
    }
    return { turnId, ...(reply ? { reply } : {}) };
  }

  /**
   * Design §19.10 / V-P2-AMB-1 — heartbeat agentTurn; await reply; silent OK = no notify.
   */
  async runHeartbeatTurn(
    accountId: string,
    opts: { prompt: string },
  ): Promise<{ turnId: string; sessionId: string; silent: boolean; reply: string }> {
    const { isHeartbeatSilentOk } = await import("./schedule/heartbeat.js");
    const prompt = opts.prompt.trim();
    if (!prompt) {
      throw Object.assign(new Error("envoyhome.bad_params: heartbeat prompt required"), {
        code: "bad_params",
      });
    }
    const session = await this.sessions.open({
      accountId,
      title: `schedule:heartbeat`,
    });
    const turnId = newTurnId();
    const abort = new AbortController();
    active.set(turnId, {
      accountId,
      sessionId: session.sessionId,
      abort,
      approvalWaiters: new Map(),
      choiceWaiters: new Map(),
    });
    this.emit("home:turn-started", {
      turnId,
      sessionId: session.sessionId,
      accountId,
      agentId: session.agentId,
      route: "harness",
      at: new Date().toISOString(),
    });
    await this.runTurnBackground({
      accountId,
      sessionId: session.sessionId,
      text: prompt,
      turnId,
      agentId: session.agentId,
      abort,
      callerKind: "schedule",
      origin: "unattended",
      memoryTrust: "agent",
      toolPolicyOverride: "restricted",
    });
    const sessionDir = this.sessions.sessionDir(accountId, session.sessionId);
    let reply = "";
    try {
      const { readTranscript, coalesceAssistantByTurnId } = await import(
        "@envoyhome/harness-host"
      );
      const lines = await readTranscript(sessionDir);
      const coalesced = coalesceAssistantByTurnId(lines);
      for (let i = coalesced.length - 1; i >= 0; i--) {
        const line = coalesced[i]!;
        if (line["role"] === "assistant" && line["turnId"] === turnId) {
          reply = typeof line["content"] === "string" ? line["content"] : "";
          break;
        }
      }
    } catch {
      reply = "";
    }
    return {
      turnId,
      sessionId: session.sessionId,
      silent: isHeartbeatSilentOk(reply),
      reply,
    };
  }

  /**
   * ScheduleService fire path: run a workflow unattended with no keyword text (V-DAG-5).
   */
  async runScheduledWorkflow(accountId: string, workflowId: string): Promise<{ turnId: string; sessionId: string }> {
    await this.workflows.ensureLoaded();
    const matched = this.workflows.mergedForAccount(accountId).find((w) => w.id === workflowId);
    if (!matched) {
      throw Object.assign(new Error(`envoyhome.bad_params: unknown workflow ${workflowId}`), {
        code: "bad_params",
      });
    }
    const session = await this.sessions.open({
      accountId,
      title: `schedule:${workflowId}`,
    });
    const turnId = newTurnId();
    const abort = new AbortController();
    active.set(turnId, {
      accountId,
      sessionId: session.sessionId,
      abort,
      approvalWaiters: new Map(),
      choiceWaiters: new Map(),
    });
    this.emit("home:turn-started", {
      turnId,
      sessionId: session.sessionId,
      accountId,
      agentId: session.agentId,
      route: "workflow",
      at: new Date().toISOString(),
    });
    void this.runWorkflowBackground({
      accountId,
      sessionId: session.sessionId,
      text: "",
      turnId,
      agentId: session.agentId,
      abort,
      callerKind: "schedule",
      workflow: matched,
      origin: "unattended",
    });
    return { turnId, sessionId: session.sessionId };
  }

  /**
   * Channel / hatch entry: open a session and start a turn.
   * Returns immediately with turnId (work continues in background).
   */
  async startFromInbound(input: {
    accountId: string;
    text: string;
    callerKind: string;
    origin?: TurnOrigin;
    channel?: string;
    rawRef?: string;
    completionText?: string;
    memoryTrust?: "owner" | "agent" | "untrusted";
  }): Promise<TurnWireResult> {
    const session = await this.sessions.open({
      accountId: input.accountId,
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      title: input.channel ? `${input.channel} inbound` : "hatch",
    });
    return this.sendMessage({
      accountId: input.accountId,
      sessionId: session.sessionId,
      text: input.text,
      callerKind: input.callerKind,
      ...(input.origin !== undefined ? { origin: input.origin } : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.rawRef !== undefined ? { rawRef: input.rawRef } : {}),
      ...(input.completionText !== undefined ? { completionText: input.completionText } : {}),
      ...(input.memoryTrust !== undefined ? { memoryTrust: input.memoryTrust } : {}),
    });
  }

  private normalizeWorkflowTool(name: string): string {
    return normalizeWorkflowToolName(name);
  }

  /**
   * Shell for `exec` tool — cwd = account sandbox files root.
   * ApprovalSink still gates; soft-refuse a few host-escape patterns.
   */
  private sandboxExecImpl(accountId: string): (cmd: string) => Promise<string> {
    const cwd = this.paths.accountFiles(accountId);
    return async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) throw new Error("envoyhome.bad_params: cmd required");
      if (
        /\brm\s+(-[^\s]*f[^\s]*\s+)?\/\b|fork\s*bomb|\/etc\/(?:passwd|shadow)\b/i.test(
          trimmed,
        )
      ) {
        throw new Error("envoyhome.exec_refused: unsafe command pattern");
      }
      const { exec: execCb } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(execCb);
      try {
        const { stdout, stderr } = await execAsync(trimmed, {
          cwd,
          timeout: 30_000,
          maxBuffer: 1_000_000,
          env: { ...process.env, PWD: cwd },
        } as import("node:child_process").ExecOptions);
        return JSON.stringify({
          ok: true,
          stdout: String(stdout ?? "").slice(0, 32_000),
          stderr: String(stderr ?? "").slice(0, 8_000),
        });
      } catch (err) {
        const e = err as {
          stdout?: string;
          stderr?: string;
          message?: string;
          code?: number | string;
        };
        return JSON.stringify({
          ok: false,
          code: e.code ?? 1,
          stdout: String(e.stdout ?? "").slice(0, 32_000),
          stderr: String(e.stderr ?? e.message ?? "").slice(0, 8_000),
        });
      }
    };
  }

  /** Shared TurnDeps hooks for workflow tool nodes (builtins + skill/HA/MQTT). */
  private workflowDispatchExtras(input: {
    accountId: string;
    origin: TurnOrigin;
    approval?: ApprovalSink;
    ctx?: TurnContext;
    clientContext?: import("./client-context.js").ClientTurnContext;
    /** Design §9.2 / `2026-10-22b` — skill_propose PendingLearn trust. */
    memoryTrust?: "owner" | "agent" | "untrusted";
  }): Pick<
    TurnDeps,
    | "httpFetchImpl"
    | "execImpl"
    | "extraToolImpl"
    | "browserDefaultProfile"
    | "peekScheduleProposal"
  > {
    const origin: "attended" | "unattended" =
      input.origin === "unattended" ? "unattended" : "attended";
    return {
      execImpl: this.sandboxExecImpl(input.accountId),
      httpFetchImpl: workflowHttpFetch as typeof fetch,
      browserDefaultProfile: (() => {
        let configured: string | undefined;
        if (origin !== "unattended" && this.browserControl) {
          try {
            configured = this.browserControl.resolveProfile({});
          } catch {
            configured = undefined;
          }
        }
        return browserDefaultProfileForOrigin(origin, configured);
      })(),
      peekScheduleProposal: (proposalId) => {
        const p = this.schedules?.store.getProposal(proposalId);
        // Fail closed: never surface another account's resolvedLocal in the ask card.
        if (!p || p.accountId !== input.accountId) return undefined;
        return {
          resolvedLocal: p.resolvedLocal,
          kind: p.spec.kind,
          ...(p.payload.message ? { message: p.payload.message } : {}),
          ...(p.payload.kind === "agentTurn" && p.payload.prompt
            ? { prompt: p.payload.prompt }
            : {}),
          ...(p.replacesJobId ? { replacesJobId: p.replacesJobId } : {}),
        };
      },
      extraToolImpl: async (tool, args) => {
        const mounts = await this.accounts.getWorkspaceMountRefs(
          input.accountId,
          this.getOwnerAccountId(),
        );
        const primary = mounts[0];
        const pol = await this.policy.get(input.accountId);
        return runExtendedWorkflowTool({
          tool,
          args,
          skills: this.skills,
          memory: this.memory,
          memoryTrust: input.memoryTrust ?? "agent",
          ...(input.ctx?.turn_id ? { turnId: input.ctx.turn_id } : {}),
          channels: this.channels,
          paths: this.paths,
          accountId: input.accountId,
          origin,
          actuations: this.actuations,
          workspaceMounts: mounts,
          workspaceRoot: primary?.hostPath ?? null,
          workspaceMode: primary?.mode ?? null,
          webSearch: this.webSearch,
          browserControl: this.browserControl,
          schedules: this.schedules,
          workflows: this.workflows,
          sessions: this.sessions,
          knowledge: this.knowledge,
          ...(input.ctx?.session_id ? { sessionId: input.ctx.session_id } : {}),
          ...(input.ctx?.session_id
            ? {
                onScheduleCandidates: (info: {
                  candidates: string[];
                  detail: string;
                  reason: string;
                }) => {
                  const replyZh = /[\u4e00-\u9fff]/.test(info.detail);
                  void this.createChoiceAndEmit({
                    accountId: input.accountId,
                    sessionId: input.ctx!.session_id,
                    ...(input.ctx?.turn_id ? { turnId: input.ctx.turn_id } : {}),
                    question: replyZh
                      ? "时间还不明确，请选一个："
                      : "Time is not settled — pick one:",
                    options: info.candidates.map((c, i) => ({
                      id: String(i),
                      label: c,
                    })),
                    selection: "one",
                    purpose: "schedule_candidates",
                    detail: info.detail.trim().slice(0, 2000),
                  }).catch(() => undefined);
                },
              }
            : {}),
          toolPolicy: pol.toolPolicy,
          helperDepth: input.ctx?.helper_depth ?? 0,
          httpFetchImpl: workflowHttpFetch as typeof fetch,
          sessionsSendWake: async (opts) =>
            this.runSessionsSendWake({
              accountId: input.accountId,
              sessionId: opts.sessionId,
              text: opts.text,
              waitMs: opts.waitMs,
              ...(opts.fromSessionId !== undefined
                ? { fromSessionId: opts.fromSessionId }
                : {}),
            }),
          runMeshChild: async (opts) =>
            this.runHomeMeshChild({
              accountId: input.accountId,
              origin,
              objective: opts.objective,
              allowTools: opts.allowTools,
              ...(opts.signal ? { signal: opts.signal } : {}),
              ...(input.ctx ? { parentCtx: input.ctx } : {}),
              ...(input.approval ? { approval: input.approval } : {}),
            }),
          // Legacy text path still available for tests that inject spawnHelperComplete only.
          spawnHelperComplete: async (prompt, allowTools) => {
            const { textFromSubagentResult } = await import("./home-harness-bridge.js");
            const result = await this.runHomeMeshChild({
              accountId: input.accountId,
              origin,
              objective: prompt,
              allowTools,
              ...(input.ctx ? { parentCtx: input.ctx } : {}),
              ...(input.approval ? { approval: input.approval } : {}),
            });
            return textFromSubagentResult(result) || result.status;
          },
          mediaGenerate: this.mediaGenerate,
          imageGenerateImpl: async (prompt) => {
            const out = await this.providers.generateImage({
              accountId: input.accountId,
              prompt,
            });
            return { bytes: out.bytes, mimeType: out.mimeType, ext: out.ext };
          },
          enqueueImageGenerate: async (prompt) => {
            const job = await this.mediaGenerate.createJob(input.accountId, prompt);
            void this.runMediaGenerateJob({
              accountId: input.accountId,
              jobId: job.jobId,
              prompt,
            });
            return { jobId: job.jobId };
          },
          visionDescribe: async (meta) => {
            const privacy = await this.privacyMode.get(input.accountId);
            if (privacy.enabled) return null;
            const visionMessages = [
              {
                role: "system" as const,
                content:
                  "Describe the image briefly for a household assistant. OCR any visible text. Plain text only, under 400 words.",
              },
              {
                role: "user" as const,
                content: [
                  { type: "text" as const, text: `Describe this image (${meta.path}).` },
                  {
                    type: "image_url" as const,
                    image_url: {
                      url: `data:${meta.mimeType};base64,${meta.bytesBase64}`,
                    },
                  },
                ],
              },
            ];
            try {
              const routing = this.providers.routingForAccount(input.accountId);
              const policy = await this.policy.get(input.accountId);
              const ph = new ProviderHandle({
                router: this.providers.getRouter(),
                mode: this.providers.modeForAccount(input.accountId),
                ...(routing.placementFilter !== undefined
                  ? { placementFilter: routing.placementFilter }
                  : {}),
                ...(routing.defaultProviderId !== undefined
                  ? { defaultProviderId: routing.defaultProviderId }
                  : {}),
                requiresVision: true,
                ...(policy.needClassRules.length > 0
                  ? { needClassRules: policy.needClassRules }
                  : {}),
                text: `describe image ${meta.path}`,
              });
              const out = await ph.complete({
                messages: visionMessages,
                maxTokens: 512,
              });
              if (out.text?.trim()) return out.text.trim();
            } catch {
              /* fall through to direct openai/anthropic vision attempt */
            }
            // Fallback: any enabled cloud openai/anthropic with secret (even if
            // supportsVision flag was never set on the record).
            try {
              const listed = this.providers.listProviders(input.accountId).providers;
              const visionRec = listed.find(
                (p) =>
                  p.enabled === true &&
                  p.hasSecret === true &&
                  (p.kind === "cloud_openai_compat" ||
                    p.kind === "cloud_anthropic_compat" ||
                    p.supportsVision === true),
              );
              if (!visionRec || typeof visionRec.id !== "string") return null;
              const rec = this.providers.getRecord(visionRec.id);
              if (!rec) return null;
              const provider = this.providers.wireKindToProvider(rec);
              const out = await provider.complete({
                messages: visionMessages,
                maxTokens: 512,
              });
              return out.text?.trim() || null;
            } catch {
              return null;
            }
          },
          ...(input.clientContext ? { clientContext: input.clientContext } : {}),
          ...(input.ctx?.session_id ? { sessionId: input.ctx.session_id } : {}),
          ownerAccountId: this.getOwnerAccountId(),
          authorizeBrowserFallback:
            input.approval && input.ctx
              ? async ({ engines }) => {
                  const decision = await input.approval!.authorizeBrowserSearchFallback({
                    accountId: input.ctx!.account_id,
                    agentId: input.ctx!.agent_id,
                    turnId: input.ctx!.turn_id,
                    tool: "web_search",
                    args: { ...args, _browserFallback: true, engines },
                    summary: `browser search fallback (${engines.join("→")})`,
                  });
                  return decision === "allowed";
                }
              : async () => origin === "unattended",
        });
      },
    };
  }

  /** Design §4.2.1 — stamp workspace fields on TurnContext (R3-effective). */
  private async workspaceStamp(accountId: string): Promise<{
    workspace_root: string | null;
    workspace_mode: "ro" | "rw" | null;
    workspace_mounts: Array<{ id: string; host_path: string; mode: "ro" | "rw" }>;
  }> {
    const mounts = await this.accounts.getWorkspaceMountRefs(
      accountId,
      this.getOwnerAccountId(),
    );
    if (mounts.length === 0) {
      return { workspace_root: null, workspace_mode: null, workspace_mounts: [] };
    }
    const primary = mounts[0]!;
    return {
      workspace_root: primary.hostPath,
      workspace_mode: primary.mode,
      workspace_mounts: mounts.map((m) => ({
        id: m.id,
        host_path: m.hostPath,
        mode: m.mode,
      })),
    };
  }

  /** Prompt cue so the model uses `workspace/…` when host folders are configured. */
  private withWorkspaceInject(
    standing: string,
    workspace: {
      workspace_root: string | null;
      workspace_mode: "ro" | "rw" | null;
      workspace_mounts: Array<{ id: string; host_path: string; mode: "ro" | "rw" }>;
    },
  ): string {
    const mounts = workspace.workspace_mounts;
    if (mounts.length === 0) return standing;
    const lines =
      mounts.length === 1
        ? (() => {
            const m = mounts[0]!;
            const mode = m.mode === "rw" ? "read-write" : "read-only";
            const rootNote = isFilesystemRoot(m.host_path)
              ? " (whole-machine root)"
              : "";
            return [
              `- One host folder is configured${rootNote} with **${mode}** access.`,
              `- Reach it via \`workspace/…\` (single-folder flat paths) or \`workspace/${m.id}/…\`.`,
            ];
          })()
        : [
            `- ${mounts.length} host folders are configured. Use \`workspace/<mountId>/…\` (never raw absolute OS paths).`,
            ...mounts.map((m) => {
              const mode = m.mode === "rw" ? "rw" : "ro";
              const rootNote = isFilesystemRoot(m.host_path) ? " [whole-machine]" : "";
              return `- \`${m.id}\`${rootNote} (${mode})`;
            }),
          ];
    const block = `## Host workspace
${lines.join("\n")}
- For files the human should open in Shared files, prefer \`documents/\` or \`output/\` under the private sandbox; cite \`workspace/…\` when writing on the host so Open chips still work.
- The private sandbox remains under \`documents/\`, \`output/\`, \`knowledge/\`, and \`uploads/\`.`;
    return standing.trimEnd() + "\n\n" + block;
  }

  /**
   * Design §5.7.8 — resolve home surface for a chat turn and optionally append
   * the bound-object card. Updates sticky counter on the session.
   */
  private async resolveHomeTurnSurface(input: {
    accountId: string;
    sessionId: string;
    userText: string;
    standingInject: string;
  }): Promise<{ homeSurface: boolean; standingInject: string }> {
    const meta = await this.sessions.get(input.accountId, input.sessionId);
    const purpose = normalizePurpose(meta?.purpose);
    const boundForAccount = await this.channels.objects.list({ bound: true });
    const resolved = resolveHomeSurface({
      purpose,
      ...(meta?.stickyHomeTurnsRemaining !== undefined
        ? { stickyHomeTurnsRemaining: meta.stickyHomeTurnsRemaining }
        : {}),
      userText: input.userText,
      boundObjects: boundForAccount,
    });
    const nextSticky = consumeStickyTurn(
      purpose,
      meta?.stickyHomeTurnsRemaining,
      resolved.reason,
    );
    await this.sessions.patchMeta(input.accountId, input.sessionId, {
      stickyHomeTurnsRemaining: nextSticky ?? null,
    });
    if (!resolved.homeSurface) {
      return { homeSurface: false, standingInject: input.standingInject };
    }
    const card = buildBoundObjectCard(boundForAccount, input.accountId);
    const standingInject = input.standingInject
      ? `${input.standingInject}\n\n${card}`
      : card;
    return { homeSurface: true, standingInject };
  }

  /**
   * Design §5.7.8 — workflows are always a home surface: standing + identity +
   * the same bound-object card HomeChat gets (opaque handles, never a full dump).
   */
  private async standingInjectWithBoundCard(
    accountId: string,
    standingText: string,
  ): Promise<string> {
    const base = withProductIdentity(standingText);
    const boundForAccount = await this.channels.objects.list({ bound: true });
    const card = buildBoundObjectCard(boundForAccount, accountId);
    return `${base}\n\n${card}`;
  }

  /**
   * Memory Design §4.2.1 — cloud/local inject packages from provider contextTokens.
   * `active` is Settings preview (Routing) or turn-resolved placement.
   */
  async resolveInjectForAccount(
    accountId: string,
    active: InjectProfileId,
  ): Promise<ResolveInjectProfilesResult> {
    const policy = await this.policy.get(accountId);
    const sources = this.providers.injectContextSources(accountId);
    const caps = parseCapsOverride(policy.caps);
    return resolveInjectProfiles({
      mode: parseInjectBudgetMode(policy.injectBudgetMode),
      active,
      ...(sources.cloud?.contextTokens !== undefined
        ? { cloudContextTokens: sources.cloud.contextTokens }
        : {}),
      ...(sources.local?.contextTokens !== undefined
        ? { localContextTokens: sources.local.contextTokens }
        : {}),
      ...(sources.cloud?.providerId !== undefined
        ? { cloudProviderId: sources.cloud.providerId }
        : {}),
      ...(sources.local?.providerId !== undefined
        ? { localProviderId: sources.local.providerId }
        : {}),
      ...(caps !== undefined ? { caps } : {}),
    });
  }

  /** Settings preview: Routing local → local package; else cloud. */
  injectPreviewActive(accountId: string): InjectProfileId {
    const filter = this.providers.routingForAccount(accountId).placementFilter;
    return filter === "local" ? "local" : "cloud";
  }

  /**
   * Turn active profile: forceLocal / picked provider placement / Routing filter.
   */
  injectTurnActive(input: {
    accountId: string;
    forceLocal: boolean;
    pickedProviderId?: string;
  }): InjectProfileId {
    if (input.forceLocal) return "local";
    if (input.pickedProviderId) {
      const place = this.providers.placementOf(input.pickedProviderId);
      if (place === "local") return "local";
      if (place === "cloud") return "cloud";
    }
    return this.injectPreviewActive(input.accountId);
  }

  async buildStandingInjectFor(
    accountId: string,
    active: InjectProfileId,
  ): Promise<{ inject: StandingInjectResult; resolved: ResolveInjectProfilesResult }> {
    const resolved = await this.resolveInjectForAccount(accountId, active);
    const inject = await this.memory.buildStandingInject(accountId, {
      caps: resolved.caps,
    });
    return { inject, resolved };
  }

  private async makeProviderHandle(
    accountId: string,
    sessionId: string,
    turnId: string,
    forceLocal: boolean,
    text: string,
  ): Promise<ProviderHandle> {
    const routing = this.providers.routingForAccount(accountId);
    const policy = await this.policy.get(accountId);
    let emitted = false;
    return new ProviderHandle({
      router: this.providers.getRouter(),
      mode: this.providers.modeForAccount(accountId),
      placementFilter: routing.placementFilter,
      ...(routing.defaultProviderId !== undefined
        ? { defaultProviderId: routing.defaultProviderId }
        : {}),
      ...(routing.autoModelSwitch.enabled ? { autoModelSwitch: true } : {}),
      ...(forceLocal ? { forceLocal: true } : {}),
      ...(policy.needClassRules.length > 0
        ? { needClassRules: policy.needClassRules }
        : {}),
      text,
      onPicked: (decision) => {
        if (emitted) return;
        emitted = true;
        this.emit("home:route-decided", {
          turnId,
          accountId,
          sessionId,
          providerId: decision.provider.id,
          reason: decision.reason,
          placementFilter: decision.placementFilter,
          autoSwitch: decision.autoModelSwitch,
          ...(decision.needClass !== undefined ? { needClass: decision.needClass } : {}),
        });
      },
    });
  }

  private async resolveForceLocal(
    accountId: string,
    text: string,
    origin: TurnOrigin,
    callerKind: string,
    opts?: { hasMedia?: boolean },
  ): Promise<boolean> {
    const policy = await this.policy.get(accountId);
    const privacy = await this.privacyMode.get(accountId);
    if (privacy.enabled) return true;
    if (opts?.hasMedia && policy.forceLocalForMedia) return true;
    if (
      (origin === "unattended" || callerKind === "event-source") &&
      policy.forceLocalForEventSource
    ) {
      return true;
    }
    if (this.policy.isPrivacyTagged(policy, text)) return true;
    return false;
  }

  private async finishTurn(info: TurnCompleteInfo): Promise<void> {
    if (finished.has(info.turnId)) {
      active.delete(info.turnId);
      return;
    }
    finished.add(info.turnId);
    // Preview for interactive push (Design 2026-10-24) — best-effort; empty is fine.
    let preview: string | undefined;
    if (info.status === "ok") {
      try {
        const lines = await readTranscript(
          this.sessions.sessionDir(info.accountId, info.sessionId),
        );
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (line?.role === "assistant" && line.turnId === info.turnId) {
            const text = String(line.text ?? "").trim().replace(/\s+/g, " ");
            if (text) {
              preview = text.slice(0, 180);
              break;
            }
          }
        }
      } catch {
        /* preview is optional */
      }
    }
    // Locale for generic turn-push body: turn clientContext first, else account profile.
    let locale = info.locale?.trim() || undefined;
    if (!locale) {
      try {
        const account = await this.accounts.get(info.accountId);
        if (account?.locale?.trim()) locale = account.locale.trim();
      } catch {
        /* optional */
      }
    }
    this.emit("home:turn-finished", {
      turnId: info.turnId,
      sessionId: info.sessionId,
      accountId: info.accountId,
      agentId: "default",
      status: info.status,
      at: new Date().toISOString(),
      ...(preview ? { preview } : {}),
      ...(info.deviceId ? { deviceId: info.deviceId } : {}),
      ...(locale ? { locale } : {}),
    });
    if (info.status === "ok") {
      void this.maybeAfterTurnEnrich(info);
    }
    if (this.onComplete) {
      try {
        await this.onComplete(info);
      } catch {
        // channel outbound failures must not break the turn bookkeeping
      }
    }
    active.delete(info.turnId);
  }

  /** Heuristic PendingLearn proposals for user profile + IDENTITY.md (reviewEnabled). */
  private async maybeAfterTurnEnrich(info: TurnCompleteInfo): Promise<void> {
    try {
      const lines = await readTranscript(
        this.sessions.sessionDir(info.accountId, info.sessionId),
      );
      let userText = "";
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i]?.role === "user") {
          userText = String(lines[i]?.text ?? "");
          break;
        }
      }
      if (!userText.trim()) return;
      await this.memory.afterTurnEnrich(info.accountId, {
        userText,
        turnId: info.turnId,
      });
      // KnowYou L4′ heuristic extract (Knowledge-RAG §4)
      if (this.knowledge) {
        let assistantText = "";
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i]?.role === "assistant") {
            assistantText = String(lines[i]?.text ?? "");
            break;
          }
        }
        // V-KY-3: untrusted / missing trust / unattended → no durable KnowYou ADD.
        const allowWrites =
          info.origin !== "unattended" &&
          (info.memoryTrust === "owner" || info.memoryTrust === "agent");
        void this.ingestKnowYouAfterTurn(info, userText, assistantText, allowWrites).catch(
          () => undefined,
        );
      }
    } catch {
      /* enrichment must never fail the turn */
    }
  }

  /**
   * One-shot attended completion for Settings drafts (workflow authoring).
   * Uses the account's mix router; does not open a session or write transcript.
   */
  async completeForAccount(
    accountId: string,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  ): Promise<string> {
    const text =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "draft";
    const forceLocal = await this.resolveForceLocal(
      accountId,
      text,
      "attended",
      "loopback-owner",
    );
    const provider = await this.makeProviderHandle(
      accountId,
      "draft",
      newTurnId(),
      forceLocal,
      text,
    );
    const { inject } = await this.buildStandingInjectFor(
      accountId,
      this.injectTurnActive({ accountId, forceLocal }),
    );
    const standing = withProductIdentity(inject.text);
    const headed: Array<{ role: "system" | "user" | "assistant"; content: string }> =
      messages[0]?.role === "system"
        ? [
            {
              role: "system",
              content: `${standing}\n\n${messages[0].content}`,
            },
            ...messages.slice(1),
          ]
        : [{ role: "system", content: standing }, ...messages];
    const completed = await provider.complete({ messages: headed });
    return completed.text;
  }

  /**
   * Attended test-run for Settings (`home.runWorkflow`).
   * Ephemeral session (removed after). Ask-tier tools emit `home:approval-needed`
   * but do not block — without `waitForAnswer` they fail closed as
   * `envoyhome.approval_pending` so the RPC cannot hang. Grants still allow.
   */
  async runWorkflowTest(input: {
    accountId: string;
    workflowId: string;
    text?: string;
  }): Promise<{ runId: string; results: WorkflowStepResult[] }> {
    await this.workflows.ensureLoaded();
    const workflow = this.workflows.getDef(input.workflowId, input.accountId);
    if (!workflow) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown workflow"), {
        code: "bad_params",
        rpcError: undefined,
      });
    }

    const runId = randomUUID();
    const account = await this.accounts.get(input.accountId);
    const toolPolicy = account?.toolPolicy ?? "standard";
    const origin: TurnOrigin = "attended";
    const text = input.text ?? `test-run:${workflow.id}`;
    const sandboxRoot = this.paths.accountFiles(input.accountId);
    const session = await this.sessions.open({
      accountId: input.accountId,
      title: `workflow-test:${workflow.id}`,
    });
    const turnId = newTurnId();
    const abort = new AbortController();
    active.set(turnId, {
      accountId: input.accountId,
      sessionId: session.sessionId,
      abort,
      approvalWaiters: new Map(),
      choiceWaiters: new Map(),
    });

    const forceLocal = await this.resolveForceLocal(
      input.accountId,
      text,
      origin,
      "loopback-owner",
    );
    const provider = await this.makeProviderHandle(
      input.accountId,
      session.sessionId,
      turnId,
      forceLocal,
      text,
    );
    const { inject } = await this.buildStandingInjectFor(
      input.accountId,
      this.injectTurnActive({
        accountId: input.accountId,
        forceLocal,
      }),
    );
    // Knowledge-RAG §3.6 / §4.5 — skip Doc KB / KnowYou auto-inject for workflow turns.
    const standingWithCard = await this.standingInjectWithBoundCard(
      input.accountId,
      inject.text,
    );

    const workspace = await this.workspaceStamp(input.accountId);
    const ctx: TurnContext = {
      account_id: input.accountId,
      agent_id: session.agentId,
      session_id: session.sessionId,
      turn_id: turnId,
      sandbox_root: sandboxRoot,
      workspace_root: workspace.workspace_root,
      workspace_mode: workspace.workspace_mode,
      workspace_mounts: workspace.workspace_mounts,
      origin,
      standing_inject: this.withWorkspaceInject(standingWithCard, workspace),
      policy_snapshot: {
        origin,
        tool_policy: toolPolicy,
        model_mode: this.providers.modeForAccount(input.accountId),
        // Workflows name ha_*/mqtt_* explicitly (§5.7.8) — always a home surface.
        homeSurface: true,
      },
    };

    const approvalSink = new ApprovalSink({
      store: this.approvals,
      policy: ctx.policy_snapshot,
      toolPolicy,
      onApprovalNeeded: (row) => {
        this.emit("home:approval-needed", wireApproval(row));
      },
      // No waitForAnswer: Settings cannot answer mid-RPC; fail closed as pending.
    });

    const turnDeps: TurnDeps = {
      ctx,
      provider,
      approval: approvalSink,
      fs: this.sandboxFs(input.accountId),
      ...this.workflowDispatchExtras({
        accountId: input.accountId,
        origin,
        approval: approvalSink,
        ctx,
      }),
    };

    try {
      const results = await executeWorkflow(workflow, {
        tool: async (name, args) => {
          const tool = this.normalizeWorkflowTool(name);
          const mappedArgs =
            tool === "write_file" && typeof args.path === "string"
              ? { path: args.path, content: String(args.content ?? "") }
              : args;
          const result = await dispatchTool(turnDeps, { tool, args: mappedArgs });
          if (!result.ok) throw new Error(result.reason);
          return result.output;
        },
        llm: async (prompt) => {
          const completed = await provider.complete({
            messages: [
              { role: "system" as const, content: standingWithCard },
              { role: "user" as const, content: prompt },
            ],
          });
          return completed.text;
        },
        onStep: async (ev) => {
          this.emit("home:workflow-step", {
            runId,
            workflowId: workflow.id,
            accountId: input.accountId,
            nodeId: ev.nodeId,
            type: ev.type,
            phase: ev.phase,
            ...(ev.ok !== undefined ? { ok: ev.ok } : {}),
            ...(ev.detail !== undefined ? { detail: ev.detail } : {}),
            ...(ev.output !== undefined ? { output: ev.output } : {}),
          });
        },
      });
      this.emit("home:workflow-finished", {
        runId,
        workflowId: workflow.id,
        accountId: input.accountId,
        ok: results.every((r) => r.ok),
      });
      return { runId, results };
    } finally {
      active.delete(turnId);
      await this.sessions.remove(input.accountId, session.sessionId).catch(() => undefined);
    }
  }

  private async runWorkflowBackground(input: {
    accountId: string;
    sessionId: string;
    agentId: string;
    text: string;
    turnId: string;
    abort: AbortController;
    callerKind: string;
    workflow: WorkflowDef;
    origin?: TurnOrigin;
    channel?: string;
    rawRef?: string;
    hasMedia?: boolean;
    media?: Array<{
      kind: "image" | "audio" | "video" | "file";
      uri: string;
      fileName?: string;
      mimeType?: string;
      bytes?: number;
    }>;
    /** Design §7.4 / 2026-10-19m — must not drop on keyword→workflow route. */
    clientContext?: import("./client-context.js").ClientTurnContext;
    deviceId?: string;
  }): Promise<void> {
    const record = active.get(input.turnId);
    if (!record) return;

    const { formatClientContextInject } = await import("./client-context.js");
    const clientCtxInject = formatClientContextInject(input.clientContext);

    const account = await this.accounts.get(input.accountId);
    const toolPolicy = account?.toolPolicy ?? "standard";
    const origin = deriveOrigin(input.callerKind, input.origin);
    const forceLocal = await this.resolveForceLocal(
      input.accountId,
      input.text,
      origin,
      input.callerKind,
      { hasMedia: input.hasMedia === true },
    );
    const sandboxRoot = this.paths.accountFiles(input.accountId);

    const provider = await this.makeProviderHandle(
      input.accountId,
      input.sessionId,
      input.turnId,
      forceLocal,
      input.text,
    );
    const routingWf = this.providers.routingForAccount(input.accountId);
    if (routingWf.autoModelSwitch.enabled) {
      provider.ensurePicked(input.text);
    }
    const pickedWf = provider.lastPick()?.provider.id;
    const { inject } = await this.buildStandingInjectFor(
      input.accountId,
      this.injectTurnActive({
        accountId: input.accountId,
        forceLocal,
        ...(pickedWf !== undefined ? { pickedProviderId: pickedWf } : {}),
      }),
    );
    // Knowledge-RAG §3.6 / §4.5 — skip RAG auto-inject for workflow turns.
    const standingBase = clientCtxInject
      ? inject.text
        ? `${inject.text}\n\n${clientCtxInject}`
        : clientCtxInject
      : inject.text;
    const standingWithCard = await this.standingInjectWithBoundCard(
      input.accountId,
      standingBase,
    );

    const workspace = await this.workspaceStamp(input.accountId);
    const ctx: TurnContext = {
      account_id: input.accountId,
      agent_id: input.agentId,
      session_id: input.sessionId,
      turn_id: input.turnId,
      sandbox_root: sandboxRoot,
      workspace_root: workspace.workspace_root,
      workspace_mode: workspace.workspace_mode,
      workspace_mounts: workspace.workspace_mounts,
      origin,
      standing_inject: this.withWorkspaceInject(standingWithCard, workspace),
      policy_snapshot: {
        origin,
        tool_policy: toolPolicy,
        model_mode: this.providers.modeForAccount(input.accountId),
        homeSurface: true,
      },
    };

    const approvalSink = new ApprovalSink({
      store: this.approvals,
      policy: ctx.policy_snapshot,
      toolPolicy,
      onApprovalNeeded: (row) => {
        this.emit("home:approval-needed", wireApproval(row));
      },
      waitForAnswer: (approvalId) =>
        new Promise<"allow" | "deny">((resolve) => {
          record.approvalWaiters.set(approvalId, resolve);
        }),
    });

    const sessionDir = this.sessions.sessionDir(input.accountId, input.sessionId);
    await appendTranscriptLine(sessionDir, {
      role: "user",
      text: input.text,
      at: new Date().toISOString(),
      turnId: input.turnId,
      ...(input.media && input.media.length ? { media: input.media } : {}),
    });

    const turnDeps: TurnDeps = {
      ctx,
      provider,
      approval: approvalSink,
      fs: this.sandboxFs(input.accountId),
      ...this.workflowDispatchExtras({
        accountId: input.accountId,
        origin,
        approval: approvalSink,
        ctx,
        ...(input.clientContext ? { clientContext: input.clientContext } : {}),
      }),
    };

    let replyText = "";
    let status: "ok" | "cancelled" | "error" = "ok";
    try {
      const results = await executeWorkflow(input.workflow, {
        tool: async (name, args) => {
          const tool = this.normalizeWorkflowTool(name);
          const mappedArgs =
            tool === "write_file" && typeof args.path === "string"
              ? { path: args.path, content: String(args.content ?? "") }
              : args;
          const result = await dispatchTool(turnDeps, { tool, args: mappedArgs });
          if (!result.ok) throw new Error(result.reason);
          return result.output;
        },
        llm: async (prompt) => {
          const completed = await provider.complete({
            messages: [
              { role: "system" as const, content: standingWithCard },
              { role: "user" as const, content: prompt },
            ],
          });
          return completed.text;
        },
      });
      replyText = results.map((r) => `${r.type}:${r.ok ? "ok" : r.detail}`).join("; ") || "workflow finished";
      const format = classifyOutputFormat(replyText, { prefer: "plain" });
      this.emit("home:turn-delta", {
        turnId: input.turnId,
        sessionId: input.sessionId,
        accountId: input.accountId,
        agentId: input.agentId,
        kind: "text",
        text: replyText,
        format,
      });
      await appendTranscriptLine(sessionDir, {
        role: "assistant",
        text: replyText,
        format,
        at: new Date().toISOString(),
        turnId: input.turnId,
        route: "workflow",
        workflowId: input.workflow.id,
      });
      await this.sessions.touch(input.accountId, input.sessionId);
    } catch {
      status = "error";
    } finally {
      await this.finishTurn({
        turnId: input.turnId,
        sessionId: input.sessionId,
        accountId: input.accountId,
        status: input.abort.signal.aborted ? "cancelled" : status,
        replyText,
        origin,
        ...(input.channel !== undefined ? { channel: input.channel } : {}),
        ...(input.rawRef !== undefined ? { rawRef: input.rawRef } : {}),
        ...(input.deviceId ? { deviceId: input.deviceId } : {}),
        ...(input.clientContext?.locale
          ? { locale: input.clientContext.locale }
          : {}),
      });
    }
  }

  private async runTurnBackground(input: {
    accountId: string;
    sessionId: string;
    agentId: string;
    text: string;
    turnId: string;
    abort: AbortController;
    callerKind: string;
    memoryTrust?: "owner" | "agent" | "untrusted";
    plannedTools?: Array<{ tool: string; args: unknown; summary?: string }>;
    completionText?: string;
    origin?: TurnOrigin;
    channel?: string;
    rawRef?: string;
    hasMedia?: boolean;
    /** Schedule agentTurn may force restricted/standard over account default. */
    toolPolicyOverride?: "standard" | "restricted";
    media?: Array<{
      kind: "image" | "audio" | "video" | "file";
      uri: string;
      fileName?: string;
      mimeType?: string;
      bytes?: number;
    }>;
    /** Design §7.4 / 2026-10-19m. */
    clientContext?: import("./client-context.js").ClientTurnContext;
    deviceId?: string;
  }): Promise<void> {
    const record = active.get(input.turnId);
    if (!record) return;

    const { formatClientContextInject } = await import("./client-context.js");
    const clientCtxInject = formatClientContextInject(input.clientContext);

    const account = await this.accounts.get(input.accountId);
    const toolPolicy =
      input.toolPolicyOverride ?? account?.toolPolicy ?? "standard";
    const origin = deriveOrigin(input.callerKind, input.origin);
    const forceLocal = await this.resolveForceLocal(
      input.accountId,
      input.text,
      origin,
      input.callerKind,
      { hasMedia: input.hasMedia === true },
    );
    const sandboxRoot = this.paths.accountFiles(input.accountId);

    const provider = await this.makeProviderHandle(
      input.accountId,
      input.sessionId,
      input.turnId,
      forceLocal,
      input.text,
    );
    // Resolve route for inject profile + §8 session pressure. Prefer a real pick;
    // if the pool is empty (some completionText stubs), fall back to Routing sources.
    try {
      provider.ensurePicked(input.text);
    } catch {
      /* no eligible provider — pressure may still use injectContextSources below */
    }
    const pickedId = provider.lastPick()?.provider.id;
    const sources = this.providers.injectContextSources(input.accountId);
    const contextTokens =
      (pickedId !== undefined
        ? this.providers.getRecord(pickedId)?.contextTokens
        : undefined) ??
      sources.cloud?.contextTokens ??
      sources.local?.contextTokens;
    const { inject } = await this.buildStandingInjectFor(
      input.accountId,
      this.injectTurnActive({
        accountId: input.accountId,
        forceLocal,
        ...(pickedId !== undefined ? { pickedProviderId: pickedId } : {}),
      }),
    );

    // Knowledge-RAG §4.5 — harness turns only (workflow paths skip withRagInject).
    const standingWithRag = await this.withRagInject(
      input.accountId,
      inject.text,
      input.text,
    );

    const standingWithClient = clientCtxInject
      ? standingWithRag
        ? `${standingWithRag}\n\n${clientCtxInject}`
        : clientCtxInject
      : standingWithRag;

    const home = await this.resolveHomeTurnSurface({
      accountId: input.accountId,
      sessionId: input.sessionId,
      userText: input.text,
      standingInject: standingWithClient,
    });
    let standingForTurn = home.standingInject;
    const turnMeta = await this.sessions.get(input.accountId, input.sessionId);
    if (normalizePurpose(turnMeta?.purpose) === "schedules" && this.schedules) {
      const jobs = await this.schedules.store.listJobs(input.accountId);
      const card = formatSchedulesChatCard(jobs);
      standingForTurn = standingForTurn ? `${standingForTurn}\n\n${card}` : card;
    }

    const { history } = await this.maintainSessionWindow({
      accountId: input.accountId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      newUserText: input.text,
      standingInjectText: standingForTurn,
      origin,
      callerKind: input.callerKind,
      ...(input.memoryTrust !== undefined ? { memoryTrust: input.memoryTrust } : {}),
      ...(contextTokens !== undefined ? { contextTokens } : {}),
    });

    // Design §5.7.8 — P1 local planner / session pending / affirm; else tool-loop.
    let plannedTools = input.plannedTools;
    let completionText = input.completionText;
    let toolLoop = false;
    /** Bound devices for home-surface recover/stash (filled when homeSurface). */
    let boundForAccount: Array<{
      displayName: string;
      sourceId: string;
      class: string;
      channel?: string;
      accountId: string | null;
      shared?: boolean;
    }> = [];
    if (!plannedTools && home.homeSurface) {
      // Household: every bound object is available to every profile (Design 2026-10-16l).
      boundForAccount = await this.channels.objects.list({ bound: true });
      const sessionMeta = await this.sessions.get(input.accountId, input.sessionId);
      const pending = sessionMeta?.pendingHomeProposal;
      const replyZh = /[\u4e00-\u9fff]/.test(input.text);

      if (isHomeDenial(input.text) && pending) {
        await this.sessions.patchMeta(input.accountId, input.sessionId, {
          pendingHomeProposal: null,
        });
        plannedTools = [];
        completionText =
          completionText ??
          (replyZh ? "好的，已取消刚才的操作提议。" : "Okay — cancelled that home proposal.");
      } else {
        const localPlan =
          planLocalHomeActuation(input.text, boundForAccount) ??
          planAffirmedHomeActuation(input.text, history, boundForAccount, pending);
        if (localPlan) {
          // Empty tools = disambiguation reply only (no Approvals / no tool-loop).
          plannedTools = localPlan.tools;
          completionText = completionText ?? localPlan.reply;
          if (localPlan.tools.length > 0) {
            await this.sessions.patchMeta(input.accountId, input.sessionId, {
              pendingHomeProposal: null,
            });
          } else if (localPlan.choiceCandidates?.length) {
            const replyZh = /[\u4e00-\u9fff]/.test(input.text);
            void this.createChoiceAndEmit({
              accountId: input.accountId,
              sessionId: input.sessionId,
              turnId: input.turnId,
              question: replyZh
                ? "有多个设备符合描述，请选择一个："
                : "Several devices match — pick one:",
              options: localPlan.choiceCandidates.map((c, i) => ({
                id: (c.sourceId || String(i)).slice(0, 64),
                label: c.displayName || c.sourceId || String(i),
              })),
              selection: "one",
              purpose: "home_disambiguation",
              detail: input.text.trim().slice(0, 2000),
            }).catch(() => undefined);
          }
        } else {
          // Fuzzy NL: model may propose ha_*/mqtt_* with opaque objectId handles.
          toolLoop = true;
        }
      }
    }

    let preparedSchedule:
      | {
          proposalId: string;
          resolvedLocal: string;
          createdAt: string;
          expiresAt?: string;
          message?: string;
          name?: string;
        }
      | undefined;
    let scheduleOfferShown = false;
    if (this.schedules && plannedTools === undefined) {
      const sessionMeta = await this.sessions.get(input.accountId, input.sessionId);
      const pending = sessionMeta?.pendingScheduleConfirm;
      const replyZh = /[\u4e00-\u9fff]/.test(
        `${input.text}\n${pending?.resolvedLocal ?? ""}`,
      );
      if (pending && isScheduleDenial(input.text)) {
        try {
          await this.schedules.cancelProposal(input.accountId, pending.proposalId);
        } catch {
          /* already gone / expired — still clear session */
        }
        await this.sessions.patchMeta(input.accountId, input.sessionId, {
          pendingScheduleConfirm: null,
        });
        plannedTools = [];
        completionText =
          completionText ?? (replyZh ? "好的，已取消这个提醒。" : "Okay — cancelled that reminder.");
      } else if (pending && isScheduleAffirmation(input.text)) {
        plannedTools = [
          {
            tool: "schedule",
            args: { action: "confirm", proposalId: pending.proposalId },
            summary: `Arm schedule at ${pending.resolvedLocal}`,
          },
        ];
        completionText =
          completionText ??
          (replyZh
            ? `已设置：${pending.resolvedLocal}。`
            : `Set: ${pending.resolvedLocal}.`);
      }
    }
    if (this.schedules && plannedTools === undefined && !isScheduleAffirmation(input.text)) {
      try {
        const proposal = await this.schedules.proposeFromText(
          input.accountId,
          input.text,
          input.clientContext?.timeZone,
          {
            sessionId: input.sessionId,
            ...(input.clientContext ? { clientContext: input.clientContext } : {}),
          },
        );
        if (!("error" in proposal)) {
          preparedSchedule = {
            proposalId: proposal.proposalId,
            resolvedLocal: proposal.resolvedLocal,
            createdAt: new Date().toISOString(),
            expiresAt: proposal.expiresAt,
            name: proposal.name,
            ...(proposal.payload.message ? { message: proposal.payload.message } : {}),
          };
        }
      } catch {
        /* offer path still works without a stored proposal */
      }
    }

    const workspace = await this.workspaceStamp(input.accountId);
    const ctx: TurnContext = {
      account_id: input.accountId,
      agent_id: input.agentId,
      session_id: input.sessionId,
      turn_id: input.turnId,
      sandbox_root: sandboxRoot,
      workspace_root: workspace.workspace_root,
      workspace_mode: workspace.workspace_mode,
      workspace_mounts: workspace.workspace_mounts,
      origin,
      standing_inject: this.withWorkspaceInject(
        withProductIdentity(standingForTurn),
        workspace,
      ),
      policy_snapshot: {
        origin,
        tool_policy: toolPolicy,
        model_mode: this.providers.modeForAccount(input.accountId),
        homeSurface: home.homeSurface,
        schedulesSurface: normalizePurpose(turnMeta?.purpose) === "schedules",
      },
    };

    const offerTz = this.schedules
      ? await this.schedules.resolveTimeZone(input.accountId, input.clientContext?.timeZone)
      : "UTC";
    const offerLocale = this.schedules
      ? await this.schedules.resolveLocale(input.accountId, input.clientContext?.locale)
      : input.clientContext?.locale;

    const approvalSink = new ApprovalSink({
      store: this.approvals,
      policy: ctx.policy_snapshot,
      toolPolicy,
      onApprovalNeeded: (row) => {
        this.emit("home:approval-needed", wireApproval(row));
      },
      waitForAnswer: (approvalId) =>
        new Promise<"allow" | "deny">((resolve) => {
          record.approvalWaiters.set(approvalId, resolve);
        }),
    });

    const sessionDir = this.sessions.sessionDir(input.accountId, input.sessionId);
    await appendTranscriptLine(sessionDir, {
      role: "user",
      text: input.text,
      at: new Date().toISOString(),
      turnId: input.turnId,
      ...(input.media && input.media.length ? { media: input.media } : {}),
    });

    let replyText = "";
    let status: "ok" | "cancelled" | "error" = "ok";
    try {
      const turnDeps = {
        ctx,
        provider,
        approval: approvalSink,
        fs: this.sandboxFs(input.accountId),
        ...this.workflowDispatchExtras({
          accountId: input.accountId,
          origin,
          approval: approvalSink,
          ctx,
          ...(input.clientContext ? { clientContext: input.clientContext } : {}),
          ...(input.memoryTrust !== undefined
            ? { memoryTrust: input.memoryTrust }
            : {}),
        }),
        ...(completionText !== undefined ? { completionText } : {}),
        ...(toolLoop
          ? {
              recoverHomeTools: (assistantText: string) => {
                const plan = extractHomeProposalFromAssistant(
                  assistantText,
                  boundForAccount,
                );
                if (!plan || plan.tools.length === 0) return undefined;
                return plan.tools;
              },
              onHomeProposalOffer: (assistantText: string) => {
                const plan = extractHomeProposalFromAssistant(
                  assistantText,
                  boundForAccount,
                );
                const pending = plan ? pendingFromPlan(plan) : undefined;
                if (!pending) return;
                void this.sessions.patchMeta(input.accountId, input.sessionId, {
                  pendingHomeProposal: pending,
                });
              },
            }
          : {}),
        ...(this.schedules
          ? {
              scheduleIntentOffer: (userText: string) => {
                try {
                  const resolved = resolveScheduleFromText({
                    text: userText,
                    referenceNow: resolveReferenceNow(new Date(), input.clientContext),
                    timeZone: offerTz,
                    ...(offerLocale ? { locale: offerLocale } : {}),
                  });
                  const offer = formatScheduleIntentOffer(
                    resolved,
                    `${userText}\n${offerLocale ?? ""}`,
                  );
                  if (offer && preparedSchedule) scheduleOfferShown = true;
                  if (
                    !resolved.ok &&
                    (resolved.reason === "missing_time" || resolved.reason === "ambiguous") &&
                    resolved.candidates?.length
                  ) {
                    const replyZh = /[\u4e00-\u9fff]/.test(`${userText}\n${offerLocale ?? ""}`);
                    void this.createChoiceAndEmit({
                      accountId: input.accountId,
                      sessionId: input.sessionId,
                      turnId: input.turnId,
                      question: replyZh
                        ? "时间还不明确，请选一个："
                        : "Time is not settled — pick one:",
                      options: resolved.candidates.map((c, i) => ({
                        id: String(i),
                        label: c,
                      })),
                      selection: "one",
                      purpose: "schedule_candidates",
                      // Original WHEN+message so a pick can propose without reinjecting NL.
                      detail: userText.trim().slice(0, 2000),
                    }).catch(() => undefined);
                  }
                  return offer;
                } catch {
                  return undefined;
                }
              },
            }
          : {}),
        askUserImpl: async (args: Record<string, unknown>) =>
          this.runAskUserTool({
            accountId: input.accountId,
            sessionId: input.sessionId,
            turnId: input.turnId,
            args,
          }),
      };
      let toolsDispatched = false;
      let scheduleArmed = false;
      let capturedSchedule:
        | {
            proposalId: string;
            resolvedLocal: string;
            createdAt: string;
            expiresAt?: string;
            message?: string;
            name?: string;
          }
        | undefined;
      // P2-E3: parent Agent path (default on). Fall back to runTurn for
      // plannedTools / completionText injects and ENVOYHOME_PARENT_AGENT=0.
      const { parentAgentEnabled, runAgentTurn } = await import("./home-agent-turn.js");
      const useParentAgent =
        (plannedTools === undefined || plannedTools.length === 0) &&
        completionText === undefined &&
        parentAgentEnabled();
      const turnEvents = useParentAgent
        ? runAgentTurn({
            userText: input.text,
            history,
            deps: turnDeps,
            sessionDir,
            sessionId: input.sessionId,
            turnId: input.turnId,
            ...(toolLoop ? { toolLoop: true } : {}),
            abortSignal: input.abort.signal,
          })
        : runTurn({
            userText: input.text,
            history,
            deps: turnDeps,
            ...(plannedTools !== undefined ? { plannedTools } : {}),
            ...(toolLoop ? { toolLoop: true } : {}),
          });
      for await (const ev of turnEvents) {
        if (input.abort.signal.aborted) {
          status = "cancelled";
          break;
        }
        if (ev.kind === "tool_call") {
          toolsDispatched = true;
          // Protocol: tool = { name, id? }; text carries args JSON when present.
          this.emit("home:turn-delta", {
            turnId: input.turnId,
            sessionId: input.sessionId,
            accountId: input.accountId,
            agentId: input.agentId,
            kind: "tool_call",
            tool: { name: ev.tool ?? "unknown" },
            ...(ev.text ? { text: ev.text } : {}),
          });
        }
        if (ev.kind === "tool_result") {
          this.emit("home:turn-delta", {
            turnId: input.turnId,
            sessionId: input.sessionId,
            accountId: input.accountId,
            agentId: input.agentId,
            kind: "tool_result",
            tool: { name: ev.tool ?? "unknown" },
            ...(ev.text ? { text: ev.text } : {}),
          });
          if (ev.tool === "schedule" && ev.text) {
            try {
              const j = JSON.parse(ev.text) as {
                proposalId?: unknown;
                resolvedLocal?: unknown;
                armed?: unknown;
                updated?: unknown;
              };
              if (j.armed === true || j.updated === true) scheduleArmed = true;
              else if (typeof j.proposalId === "string" && j.proposalId.trim()) {
                const peek = this.schedules?.store.getProposal(j.proposalId.trim());
                capturedSchedule = {
                  proposalId: j.proposalId.trim(),
                  resolvedLocal:
                    typeof j.resolvedLocal === "string"
                      ? j.resolvedLocal
                      : (peek?.resolvedLocal ?? ""),
                  createdAt: new Date().toISOString(),
                  ...(peek?.expiresAt ? { expiresAt: peek.expiresAt } : {}),
                  ...(peek?.name ? { name: peek.name } : {}),
                  ...(peek?.payload.message ? { message: peek.payload.message } : {}),
                };
              }
            } catch {
              /* non-JSON schedule result */
            }
          }
        }
        if (ev.kind === "text" && ev.text) {
          replyText += ev.text;
          // Classify on the cumulative reply so early chunks stay consistent with the final tier.
          const format = classifyOutputFormat(replyText);
          this.emit("home:turn-delta", {
            turnId: input.turnId,
            sessionId: input.sessionId,
            accountId: input.accountId,
            agentId: input.agentId,
            kind: "text",
            text: ev.text,
            format,
          });
          await appendTranscriptLine(sessionDir, {
            role: "assistant",
            text: ev.text,
            format,
            at: new Date().toISOString(),
            turnId: input.turnId,
          });
        }
        if (ev.kind === "error" && ev.text) {
          this.emit("home:turn-delta", {
            turnId: input.turnId,
            sessionId: input.sessionId,
            accountId: input.accountId,
            agentId: input.agentId,
            kind: "error",
            text: ev.text,
          });
          await appendTranscriptLine(sessionDir, {
            role: "system",
            text: ev.text,
            at: new Date().toISOString(),
            turnId: input.turnId,
          });
        }
      }
      if (toolsDispatched) {
        await this.sessions.patchMeta(input.accountId, input.sessionId, {
          pendingHomeProposal: null,
        });
      }
      if (this.schedules) {
        if (scheduleArmed) {
          await this.sessions.patchMeta(input.accountId, input.sessionId, {
            pendingScheduleConfirm: null,
          });
        } else if (capturedSchedule) {
          await this.sessions.patchMeta(input.accountId, input.sessionId, {
            pendingScheduleConfirm: capturedSchedule,
          });
          const live = this.schedules.store.getProposal(capturedSchedule.proposalId);
          if (live) this.schedules.emitProposed(live);
        } else if (scheduleOfferShown && preparedSchedule) {
          await this.sessions.patchMeta(input.accountId, input.sessionId, {
            pendingScheduleConfirm: preparedSchedule,
          });
          const live = this.schedules.store.getProposal(preparedSchedule.proposalId);
          if (live) this.schedules.emitProposed(live);
        }
      }
      // Thin-client (desktop/mobile) long replies → link + artifactPath (mesh open).
      // IM channel turns keep full markdown in transcript + outbound (no home HTTPS).
      if (
        status === "ok" &&
        !input.abort.signal.aborted &&
        replyText &&
        shouldSpillThinClientLink(replyText) &&
        !(input.channel && input.channel !== "hatch")
      ) {
        await this.spillThinClientLinkReply({
          accountId: input.accountId,
          sessionId: input.sessionId,
          turnId: input.turnId,
          sessionDir,
          replyText,
        });
      }
      await this.sessions.touch(input.accountId, input.sessionId);
    } catch {
      status = "error";
    } finally {
      await this.finishTurn({
        turnId: input.turnId,
        sessionId: input.sessionId,
        accountId: input.accountId,
        status: input.abort.signal.aborted ? "cancelled" : status,
        replyText,
        origin,
        ...(input.channel !== undefined ? { channel: input.channel } : {}),
        ...(input.rawRef !== undefined ? { rawRef: input.rawRef } : {}),
        ...(input.deviceId ? { deviceId: input.deviceId } : {}),
        ...(input.clientContext?.locale
          ? { locale: input.clientContext.locale }
          : {}),
        ...(input.memoryTrust !== undefined ? { memoryTrust: input.memoryTrust } : {}),
      });
    }
  }

  /**
   * Design §9.5 — write full reply under files/output/replies/, collapse transcript to
   * `link` + `artifactPath` so EnvoyHome mobile opens via home.getArtifactContent.
   */
  private async spillThinClientLinkReply(input: {
    accountId: string;
    sessionId: string;
    turnId: string;
    sessionDir: string;
    replyText: string;
  }): Promise<void> {
    const relPath = `output/replies/${input.turnId}.md`;
    const abs = safeJoin(this.paths.accountFiles(input.accountId), relPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, input.replyText, "utf8");
    const summary = summarizeForLinkBubble(input.replyText);
    await updateTranscript(input.sessionDir, (lines) => {
      const out: Record<string, unknown>[] = [];
      let replaced = false;
      for (const line of lines) {
        if (line.role === "assistant" && line.turnId === input.turnId) {
          if (replaced) continue;
          out.push({
            ...line,
            text: summary,
            format: "link",
            artifactPath: relPath,
          });
          replaced = true;
          continue;
        }
        out.push(line);
      }
      return out;
    });
    // Live clients merge by turnId — replace bubble text with summary + path.
    this.emit("home:turn-delta", {
      turnId: input.turnId,
      sessionId: input.sessionId,
      accountId: input.accountId,
      agentId: "default",
      kind: "text",
      text: summary,
      format: "link",
      artifactPath: relPath,
    });
  }

  cancelTurn(turnId: string): boolean {
    const t = active.get(turnId);
    if (!t) return false;
    // Abort only — `finishTurn` emits home:turn-finished exactly once (Design A.4).
    t.abort.abort();
    return true;
  }

  async listApprovals(accountId: string): Promise<Record<string, unknown>> {
    const rows = await this.approvals.listApprovals(accountId);
    return { approvals: rows.map(wireApproval) };
  }

  async listChoices(
    accountId: string,
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.choices.list(accountId, sessionId);
    return { choices: rows.map(wireChoice) };
  }

  async createChoiceAndEmit(
    input: Omit<PendingChoice, "id" | "createdAt" | "expiresAt"> & { ttlSec?: number },
  ): Promise<PendingChoice> {
    const row = await this.choices.create(input);
    this.emit("home:choice-needed", wireChoice(row));
    return row;
  }

  async answerChoice(input: {
    accountId: string;
    id: string;
    optionId?: string;
    optionIds?: string[];
    text?: string;
    /** Explicit dismiss — fail closed, same as TTL expire for ask_user. */
    cancel?: boolean;
  }): Promise<Record<string, unknown>> {
    const row = await this.choices.get(input.accountId, input.id);
    if (!row) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown or expired choice"), {
        code: "bad_params",
      });
    }

    if (input.cancel === true) {
      await this.choices.remove(input.accountId, input.id);
      // ask_user: wake waiter only — tool emits choice-resolved once (no double emit).
      if (row.turnId) {
        const turn = active.get(row.turnId);
        const waiter = turn?.choiceWaiters.get(row.id);
        if (waiter) {
          turn!.choiceWaiters.delete(row.id);
          waiter(null);
          return { ok: true, canceled: true, followUp: false };
        }
      }
      this.emit("home:choice-resolved", {
        id: row.id,
        accountId: row.accountId,
        sessionId: row.sessionId,
        status: "canceled",
      });
      return { ok: true, canceled: true, followUp: false };
    }

    const resolved = this.choices.resolveAnswer(row, {
      ...(input.optionId !== undefined ? { optionId: input.optionId } : {}),
      ...(input.optionIds !== undefined ? { optionIds: input.optionIds } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
    });
    if (!resolved.ok) {
      throw Object.assign(new Error(`envoyhome.bad_params: ${resolved.reason}`), {
        code: "bad_params",
      });
    }
    await this.choices.remove(input.accountId, input.id);
    this.emit("home:choice-resolved", {
      id: row.id,
      accountId: row.accountId,
      sessionId: row.sessionId,
      status: "answered",
      ...(resolved.optionIds.length ? { optionIds: resolved.optionIds } : {}),
      ...(resolved.labels.length ? { labels: resolved.labels } : {}),
      ...(resolved.text !== undefined ? { text: resolved.text } : {}),
    });

    // Wake ask_user tool if this turn is parked.
    if (row.turnId) {
      const turn = active.get(row.turnId);
      const waiter = turn?.choiceWaiters.get(row.id);
      if (waiter) {
        turn!.choiceWaiters.delete(row.id);
        waiter({
          ...(resolved.optionIds[0] ? { optionId: resolved.optionIds[0] } : {}),
          ...(resolved.optionIds.length ? { optionIds: resolved.optionIds } : {}),
          ...(resolved.text !== undefined ? { text: resolved.text } : {}),
        });
        return {
          ok: true,
          labels: resolved.labels,
          optionIds: resolved.optionIds,
          ...(resolved.text !== undefined ? { text: resolved.text } : {}),
          followUp: false,
        };
      }
    }

    // Schedule candidates: propose from picked WHEN (not base — when; base can
    // still say "this weekend" and shadow Sat vs Sun).
    if (row.purpose === "schedule_candidates" && this.schedules) {
      const when = resolved.labels[0]?.trim() || "";
      const base = row.detail?.trim() || "";
      const attempts = scheduleCandidateProposeAttempts(base, when);
      const notifyMsg = base ? extractScheduleMessage(base) : "";
      for (const proposeText of attempts) {
        try {
          const proposal = await this.schedules.proposeFromText(
            row.accountId,
            proposeText,
            undefined,
            {
              sessionId: row.sessionId,
              ...(notifyMsg && notifyMsg !== "Reminder" ? { message: notifyMsg } : {}),
            },
          );
          if (!("error" in proposal)) {
            const pending = {
              proposalId: proposal.proposalId,
              resolvedLocal: proposal.resolvedLocal,
              createdAt: new Date().toISOString(),
              expiresAt: proposal.expiresAt,
              name: proposal.name,
              ...(proposal.payload.message ? { message: proposal.payload.message } : {}),
            };
            await this.sessions.patchMeta(row.accountId, row.sessionId, {
              pendingScheduleConfirm: pending,
            });
            const live = this.schedules.store.getProposal(proposal.proposalId);
            if (live) this.schedules.emitProposed(live);
            return {
              ok: true,
              labels: resolved.labels,
              optionIds: resolved.optionIds,
              followUp: false,
              proposed: true,
            };
          }
        } catch {
          /* try next attempt */
        }
      }
    }

    // Home / general / schedule fallback: labels as the next user message.
    const followText = resolved.labels.join(", ").trim();
    if (followText && row.purpose !== "ask_user") {
      const text =
        row.purpose === "home_disambiguation" && row.detail?.trim()
          ? `${row.detail.trim()} — ${followText}`
          : followText;
      void this.sendMessage({
        accountId: row.accountId,
        sessionId: row.sessionId,
        text,
        callerKind: "loopback-owner",
        origin: "attended",
      }).catch(() => undefined);
      return {
        ok: true,
        labels: resolved.labels,
        optionIds: resolved.optionIds,
        ...(resolved.text !== undefined ? { text: resolved.text } : {}),
        followUp: true,
      };
    }
    return {
      ok: true,
      labels: resolved.labels,
      optionIds: resolved.optionIds,
      ...(resolved.text !== undefined ? { text: resolved.text } : {}),
      followUp: false,
    };
  }

  private async runAskUserTool(
    input: {
      accountId: string;
      sessionId: string;
      turnId: string;
      args: Record<string, unknown>;
    },
  ): Promise<string> {
    const question =
      typeof input.args.question === "string"
        ? input.args.question.trim()
        : typeof input.args.prompt === "string"
          ? input.args.prompt.trim()
          : "";
    if (!question) throw new Error("envoyhome.bad_params: ask_user requires question");
    const rawOptions = Array.isArray(input.args.options) ? input.args.options : [];
    const options = rawOptions
      .map((o, i) => {
        if (typeof o === "string") return { id: String(i), label: o.trim() };
        if (o && typeof o === "object" && !Array.isArray(o)) {
          const rec = o as Record<string, unknown>;
          const label =
            typeof rec.label === "string"
              ? rec.label.trim()
              : typeof rec.text === "string"
                ? rec.text.trim()
                : "";
          const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : String(i);
          return label ? { id, label } : null;
        }
        return null;
      })
      .filter((o): o is { id: string; label: string } => Boolean(o));
    const selectionRaw =
      typeof input.args.selection === "string" ? input.args.selection.trim().toLowerCase() : "";
    const multiple = input.args.multiple === true;
    const selection =
      selectionRaw === "many" || selectionRaw === "text" || selectionRaw === "one"
        ? selectionRaw
        : multiple
          ? "many"
          : options.length === 0
            ? "text"
            : "one";
    const row = await this.createChoiceAndEmit({
      accountId: input.accountId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      question,
      options,
      selection,
      purpose: "ask_user",
      ...(typeof input.args.detail === "string" && input.args.detail.trim()
        ? { detail: input.args.detail.trim() }
        : {}),
      ...(input.args.multiline === true ? { multiline: true } : {}),
    });
    const turn = active.get(input.turnId);
    if (!turn) {
      await this.choices.remove(input.accountId, row.id);
      throw new Error("envoyhome.bad_params: turn gone");
    }
    type WaitOutcome =
      | { kind: "answer"; answer: ChoiceAnswer }
      | { kind: "canceled" }
      | { kind: "expired" };
    const outcome = await new Promise<WaitOutcome>((resolve) => {
      let settled = false;
      const settle = (o: WaitOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        turn.abort.signal.removeEventListener("abort", onAbort);
        turn.choiceWaiters.delete(row.id);
        resolve(o);
      };
      const ttlMs = Math.max(0, Date.parse(row.expiresAt) - Date.now());
      const timer = setTimeout(() => settle({ kind: "expired" }), ttlMs);
      const onAbort = () => settle({ kind: "canceled" });
      turn.choiceWaiters.set(row.id, (a) => {
        if (a === "expired") settle({ kind: "expired" });
        else if (a === null) settle({ kind: "canceled" });
        else settle({ kind: "answer", answer: a });
      });
      if (turn.abort.signal.aborted) onAbort();
      else turn.abort.signal.addEventListener("abort", onAbort, { once: true });
    });
    if (outcome.kind !== "answer") {
      await this.choices.remove(input.accountId, row.id).catch(() => undefined);
      this.emit("home:choice-resolved", {
        id: row.id,
        accountId: row.accountId,
        sessionId: row.sessionId,
        status: outcome.kind === "expired" ? "expired" : "canceled",
      });
      throw new Error(
        outcome.kind === "expired" ? "envoyhome.choice_expired" : "envoyhome.choice_canceled",
      );
    }
    const resolved = this.choices.resolveAnswer(row, outcome.answer);
    if (!resolved.ok) throw new Error(`envoyhome.bad_params: ${resolved.reason}`);
    return resolved.labels.join(", ");
  }

  async answerApproval(input: {
    id: string;
    decision: "allow" | "deny";
    scope?: "once" | "session" | "always";
    argsDigest: string;
    grantedBy: string;
  }): Promise<{ ok: boolean; grantId?: string }> {
    const row = await this.approvals.findApprovalById(input.id);
    if (!row) {
      throw Object.assign(new Error("envoyhome.approval_resolved: unknown approval"), {
        code: "approval_resolved",
      });
    }

    const answered = await this.approvals.answerApproval({
      accountId: row.accountId,
      id: input.id,
      decision: input.decision,
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      argsDigest: input.argsDigest,
      grantedBy: input.grantedBy,
    });

    this.emit("home:approval-resolved", {
      id: input.id,
      accountId: row.accountId,
      decision: input.decision,
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(answered.grant ? { grantId: answered.grant.id } : {}),
    });

    // Wake the turn that owns this approval (by turnId), not "any" active turn
    // for the account — overlapping turns would otherwise leave the waiter hanging.
    const turn = active.get(row.turnId);
    if (turn) {
      const waiter = turn.approvalWaiters.get(input.id);
      if (waiter) {
        waiter(input.decision === "allow" ? "allow" : "deny");
        turn.approvalWaiters.delete(input.id);
      }
    }

    return {
      ok: true,
      ...(answered.grant ? { grantId: answered.grant.id } : {}),
    };
  }

  async listGrants(accountId?: string): Promise<Record<string, unknown>> {
    if (accountId) {
      const grants = await this.approvals.listGrants(accountId);
      return { grants: grants.map(wireGrant) };
    }
    const grants: Record<string, unknown>[] = [];
    for (const rec of await this.accounts.list()) {
      const rows = await this.approvals.listGrants(rec.accountId);
      grants.push(...rows.map(wireGrant));
    }
    return { grants };
  }

  async revokeGrant(id: string): Promise<void> {
    const grant = await this.approvals.findGrantById(id);
    if (!grant) return;
    await this.approvals.revokeGrant(grant.accountId, id);
  }

  /** Cross-account sandbox probe for V-HAR-6. */
  assertSandboxScope(accountId: string, sandboxRoot: string): void {
    const expected = this.paths.accountFiles(accountId);
    if (sandboxRoot !== expected && !sandboxRoot.startsWith(expected + "/")) {
      throw Object.assign(new Error("envoyhome.auth: sandbox_root out of scope"), { code: "auth" });
    }
    safeJoin(this.paths.accountFiles(accountId), "documents");
  }

  /**
   * V-P2-AGENT-3 — LocalMeshSubmitter + Agent child (Home jail tools, inherit origin).
   */
  private async runHomeMeshChild(input: {
    accountId: string;
    origin: TurnOrigin;
    objective: string;
    allowTools: string[];
    parentCtx?: TurnContext;
    approval?: ApprovalSink;
    signal?: AbortSignal;
  }): Promise<import("@envoymesh/envoy-harness").SubagentResult> {
    const { createHomeMeshSubmitter, HomeModelAdapter, homeSubagentInput } =
      await import("./home-harness-bridge.js");
    const { filterChildAllowTools } = await import("./harness-subagents.js");
    const allow = filterChildAllowTools(input.allowTools);
    const sessionId = input.parentCtx?.session_id ?? "helper";
    const turnId = newTurnId();
    const account = await this.accounts.get(input.accountId);
    const toolPolicy = account?.toolPolicy ?? "standard";
    const forceLocal = await this.resolveForceLocal(
      input.accountId,
      input.objective,
      input.origin,
      "helper",
    );
    const provider = await this.makeProviderHandle(
      input.accountId,
      sessionId,
      turnId,
      forceLocal,
      input.objective,
    );
    const model = HomeModelAdapter.fromProviderHandle(provider);
    const workspace = await this.workspaceStamp(input.accountId);
    const childCtx: TurnContext = {
      account_id: input.accountId,
      agent_id: input.parentCtx?.agent_id ?? "default",
      session_id: sessionId,
      turn_id: turnId,
      sandbox_root: this.paths.accountFiles(input.accountId),
      workspace_root: workspace.workspace_root,
      workspace_mode: workspace.workspace_mode,
      workspace_mounts: workspace.workspace_mounts,
      origin: input.origin,
      helper_depth: 1,
      policy_snapshot: {
        origin: input.origin,
        tool_policy: toolPolicy,
        model_mode: this.providers.modeForAccount(input.accountId),
        homeSurface: false,
        schedulesSurface: false,
      },
    };
    const approval =
      input.approval ??
      new ApprovalSink({
        store: this.approvals,
        policy: childCtx.policy_snapshot,
        toolPolicy,
        onApprovalNeeded: () => {
          /* fail closed without waiter */
        },
        waitForAnswer: async () => "deny",
      });
    const deps: TurnDeps = {
      ctx: childCtx,
      provider,
      approval,
      fs: this.sandboxFs(input.accountId),
    };
    const allowSet = new Set(allow);
    const submitter = createHomeMeshSubmitter({
      model,
      allowTools: allow,
      cwd: this.paths.accountFiles(input.accountId),
      parentSessionId: sessionId,
      dispatch: async (tool, args) => {
        if (!allowSet.has(tool)) {
          throw new Error(`envoyhome.tool_unavailable: helper allow-list excludes ${tool}`);
        }
        if (tool === "task" || tool === "spawn_helper") {
          throw new Error(`envoyhome.tool_unavailable: helper allow-list excludes ${tool}`);
        }
        const result = await dispatchTool(deps, { tool, args });
        if (!result.ok) throw new Error(result.reason);
        return result.output;
      },
    });
    const signal = input.signal ?? AbortSignal.timeout(120_000);
    return submitter.submit(homeSubagentInput(input.objective), signal);
  }

  /**
   * V-P2-AGENT-1 — legacy child helper loop (kept for direct tests / fallback).
   * Prefer {@link runHomeMeshChild} in production.
   */
  private async runSpawnHelperChild(input: {
    accountId: string;
    origin: TurnOrigin;
    prompt: string;
    allowTools: string[];
    parentCtx?: TurnContext;
    approval?: ApprovalSink;
    clientContext?: import("./client-context.js").ClientTurnContext;
  }): Promise<string> {
    const allow = new Set(
      input.allowTools.filter(
        (t) =>
          t &&
          t !== "spawn_helper" &&
          t !== "task" &&
          !t.startsWith("ha_") &&
          !t.startsWith("mqtt_"),
      ),
    );
    const sessionId = input.parentCtx?.session_id ?? "helper";
    const turnId = newTurnId();
    const account = await this.accounts.get(input.accountId);
    const toolPolicy = account?.toolPolicy ?? "standard";
    const forceLocal = await this.resolveForceLocal(
      input.accountId,
      input.prompt,
      input.origin,
      "helper",
    );
    const provider = await this.makeProviderHandle(
      input.accountId,
      sessionId,
      turnId,
      forceLocal,
      input.prompt,
    );
    const allowList =
      allow.size > 0
        ? [...allow].join(", ")
        : "(none — answer from the prompt only)";
    const system =
      `You are a turn-scoped helper (EnvoyHome §19.13). Allowed tools only: ${allowList}. ` +
      "Never call spawn_helper, task, exec, ha_*, or mqtt_*. Prefer answering without tools when possible. " +
      "When you need a tool, emit a ```envoyhome-tools fence with JSON array of {tool,args}.";

    type Msg = { role: "system" | "user" | "assistant"; content: string };
    const messages: Msg[] = [
      { role: "system", content: system },
      { role: "user", content: input.prompt.slice(0, 8000) },
    ];

    const workspace = await this.workspaceStamp(input.accountId);
    const childCtx: TurnContext = {
      account_id: input.accountId,
      agent_id: input.parentCtx?.agent_id ?? "default",
      session_id: sessionId,
      turn_id: turnId,
      sandbox_root: this.paths.accountFiles(input.accountId),
      workspace_root: workspace.workspace_root,
      workspace_mode: workspace.workspace_mode,
      workspace_mounts: workspace.workspace_mounts,
      origin: input.origin,
      helper_depth: 1,
      policy_snapshot: {
        origin: input.origin,
        tool_policy: toolPolicy,
        model_mode: this.providers.modeForAccount(input.accountId),
        homeSurface: false,
        schedulesSurface: false,
      },
    };

    const approval =
      input.approval ??
      new ApprovalSink({
        store: this.approvals,
        policy: childCtx.policy_snapshot,
        toolPolicy,
        onApprovalNeeded: () => {
          /* unattended / no waiter — ApprovalSink denies grantable without grant */
        },
        waitForAnswer: async () => "deny",
      });

    const baseExtras = this.workflowDispatchExtras({
      accountId: input.accountId,
      origin: input.origin,
      approval,
      ctx: childCtx,
      ...(input.clientContext ? { clientContext: input.clientContext } : {}),
    });
    const parentExtra = baseExtras.extraToolImpl;
    const deps: TurnDeps = {
      ctx: childCtx,
      provider,
      approval,
      fs: this.sandboxFs(input.accountId),
      ...baseExtras,
      ...(parentExtra
        ? {
            extraToolImpl: async (tool: string, args: Record<string, unknown>) => {
              if (!allow.has(tool)) {
                throw new Error(
                  `envoyhome.tool_unavailable: helper allow-list excludes ${tool}`,
                );
              }
              return parentExtra(tool, args);
            },
          }
        : {}),
    };

    const MAX_ROUNDS = 2;
    let reply = "";
    try {
      for (let round = 0; round <= MAX_ROUNDS; round++) {
        const out = await provider.complete({ messages });
        reply = out.text;
        if (round === MAX_ROUNDS || allow.size === 0) break;

        const parsed = parseAssistantToolCalls(reply, { allowSandbox: true });
        const steps = parsed.tools.filter(
          (t) => allow.has(t.tool) && t.tool !== "spawn_helper",
        );
        if (steps.length === 0) {
          return (parsed.replyText || reply).slice(0, 16_000);
        }

        const results: string[] = [];
        for (const step of steps.slice(0, 6)) {
          const result = await dispatchTool(deps, {
            tool: step.tool,
            args: step.args,
            ...(step.summary ? { summary: step.summary } : {}),
          });
          if (result.ok) {
            results.push(`${step.tool}: ${result.output.slice(0, 4000)}`);
          } else {
            results.push(`${step.tool}: ERROR ${result.reason}`);
          }
        }
        messages.push({ role: "assistant", content: reply });
        messages.push({
          role: "user",
          content: `Tool results (helper round ${round + 1}):\n${results.join("\n")}\nReply with the final answer or more tools from the allow-list only.`,
        });
      }
      return reply.slice(0, 16_000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `helper_unavailable: ${message}`;
    }
  }

  /**
   * Sandbox fs for tool nodes. Creates parent dirs on write so paths like
   * `notes/foo.txt` work on a fresh account (demo workflows).
   * Resolves `workspace/…` under the account's optional host root (§4.2.1).
   */
  private sandboxFs(accountId: string): TurnDeps["fs"] {
    const accountFilesRoot = this.paths.accountFiles(accountId);
    const shareRoot = this.paths.shareDir;
    const resolvePath = async (rel: string, write: boolean) => {
      const mounts = await this.accounts.getWorkspaceMountRefs(
        accountId,
        this.getOwnerAccountId(),
      );
      const primary = mounts[0];
      return resolveSandboxPath({
        accountFilesRoot,
        shareRoot,
        path: rel,
        write,
        workspaceMounts: mounts,
        workspaceRoot: primary?.hostPath ?? null,
        workspaceMode: primary?.mode ?? null,
      });
    };
    const browseWs = async () => {
      const mounts = await this.accounts.getWorkspaceMountRefs(
        accountId,
        this.getOwnerAccountId(),
      );
      const primary = mounts[0];
      return {
        accountFilesRoot,
        shareRoot,
        workspaceMounts: mounts,
        workspaceRoot: primary?.hostPath ?? null,
        workspaceMode: primary?.mode ?? null,
      };
    };
    return {
      writeFile: async (rel: string, content: string) => {
        const resolved = await resolvePath(rel, true);
        await mkdir(dirname(resolved.absolute), { recursive: true });
        await writeFile(resolved.absolute, content, "utf8");
        const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
        if (this.knowledge && norm.startsWith("knowledge/") && norm.endsWith(".md")) {
          void this.knowledge.onKnowledgeFileWrite(accountId, norm).catch(() => undefined);
        }
      },
      readFile: async (rel: string) => {
        const resolved = await resolvePath(rel, false);
        return readFile(resolved.absolute, "utf8");
      },
      listDir: async (rel: string) => {
        const result = await listSandboxDir(await browseWs(), rel);
        return JSON.stringify(result);
      },
      searchFiles: async (opts) => {
        const result = await searchSandboxFiles(await browseWs(), opts);
        return JSON.stringify(result);
      },
    };
  }

  static digestForTool(tool: string, args: unknown): string {
    return canonicalDigest({ tool, data: args });
  }
}
