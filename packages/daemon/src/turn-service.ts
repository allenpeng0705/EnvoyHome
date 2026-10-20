// Turn pipeline: sessions, harness, providers, approvals (B6) + product events.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { registerResetHook } from "@envoyhome/test-utils";
import {
  PRODUCT_IDENTITY_MARKER,
  PRODUCT_IDENTITY_PROLOGUE,
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
} from "@envoyhome/harness-host";
import { isFilesystemRoot, resolveSandboxPath, safeJoin } from "./fs-jail.js";
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
import { formatSchedulesChatCard } from "./schedule/chat-card.js";
import { isScheduleAffirmation, isScheduleDenial } from "./schedule/affirm.js";
import { formatScheduleIntentOffer } from "./schedule/intent-offer.js";
import { resolveScheduleFromText } from "./schedule/resolve-nl.js";
import { resolveReferenceNow } from "./client-context.js";
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
}

interface ActiveTurn {
  accountId: string;
  sessionId: string;
  abort: AbortController;
  approvalWaiters: Map<string, (d: "allow" | "deny") => void>;
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
    if (role === "user" || role === "assistant" || role === "system") {
      out.push({ role, content: text });
    }
  }
  return out;
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
  readonly sessions: SessionStore;
  readonly policy: PolicyStore;
  readonly privacyMode: PrivacyModeStore;
  private emit: ProductEmit = () => undefined;
  private onComplete: ((info: TurnCompleteInfo) => void | Promise<void>) | undefined;
  /** Household Owner id for R3 workspace effectiveness (Design §4.1.1). */
  private getOwnerAccountId: () => string | null = () => null;
  private webSearch: WebSearchService | null = null;
  private browserControl: BrowserControlService | null = null;
  private schedules: ScheduleService | null = null;

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
    this.policy = new PolicyStore(paths);
    this.privacyMode = new PrivacyModeStore(paths);
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
    return readTranscriptEnsuringMessageIds(this.sessions.sessionDir(accountId, sessionId));
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

  /** Shared TurnDeps hooks for workflow tool nodes (builtins + skill/HA/MQTT). */
  private workflowDispatchExtras(input: {
    accountId: string;
    origin: TurnOrigin;
    approval?: ApprovalSink;
    ctx?: TurnContext;
    clientContext?: import("./client-context.js").ClientTurnContext;
  }): Pick<
    TurnDeps,
    "httpFetchImpl" | "extraToolImpl" | "browserDefaultProfile" | "peekScheduleProposal"
  > {
    const origin: "attended" | "unattended" =
      input.origin === "unattended" ? "unattended" : "attended";
    return {
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
        return runExtendedWorkflowTool({
          tool,
          args,
          skills: this.skills,
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
    this.emit("home:turn-finished", {
      turnId: info.turnId,
      sessionId: info.sessionId,
      accountId: info.accountId,
      agentId: "default",
      status: info.status,
      at: new Date().toISOString(),
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

    const standingWithClient = clientCtxInject
      ? inject.text
        ? `${inject.text}\n\n${clientCtxInject}`
        : clientCtxInject
      : inject.text;

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
                  return offer;
                } catch {
                  return undefined;
                }
              },
            }
          : {}),
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
      for await (const ev of runTurn({
        userText: input.text,
        history,
        deps: turnDeps,
        ...(plannedTools !== undefined ? { plannedTools } : {}),
        ...(toolLoop ? { toolLoop: true } : {}),
      })) {
        if (input.abort.signal.aborted) {
          status = "cancelled";
          break;
        }
        if (ev.kind === "tool_call") toolsDispatched = true;
        if (ev.kind === "tool_result" && ev.tool === "schedule" && ev.text) {
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
