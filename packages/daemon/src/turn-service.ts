// Turn pipeline: sessions, harness, providers, approvals (B6) + product events.

import { readFile, writeFile } from "node:fs/promises";
import { registerResetHook } from "@envoyhome/test-utils";
import {
  ApprovalSink,
  ApprovalStore,
  ProviderHandle,
  appendTranscriptLine,
  canonicalDigest,
  dispatchTool,
  newTurnId,
  runTurn,
  type PendingApproval,
  type TurnContext,
  type TurnDeps,
  type TurnOrigin,
} from "@envoyhome/harness-host";
import { resolveSandboxPath, safeJoin } from "./fs-jail.js";
import type { HomePaths } from "./home-paths.js";
import type { WorkflowStore } from "./workflows.js";
import {
  executeWorkflow,
  matchKeywordWorkflow,
  type WorkflowDef,
} from "@envoyhome/workflows";
import type { SessionStore } from "./sessions.js";
import type { ProviderStore } from "./providers-store.js";
import type { HarnessStore } from "./harness-store.js";
import type { AccountStore } from "./accounts.js";
import type { MemoryFacade } from "@envoyhome/memory";
import type { ProductEmit } from "./product-events.js";
import { PolicyStore, PrivacyModeStore } from "./policy-store.js";

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

function deriveOrigin(callerKind: string, explicit?: TurnOrigin): TurnOrigin {
  if (explicit) return explicit;
  if (callerKind === "event-source" || callerKind === "unattended") return "unattended";
  return "attended";
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

  constructor(
    private readonly paths: HomePaths,
    sessions: SessionStore,
    private readonly providers: ProviderStore,
    private readonly harnesses: HarnessStore,
    private readonly accounts: AccountStore,
    private readonly memory: MemoryFacade,
    private readonly workflows: WorkflowStore,
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

  async getTranscript(accountId: string, sessionId: string): Promise<Record<string, unknown>[]> {
    const session = await this.sessions.get(accountId, sessionId);
    if (!session) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown session"), { code: "bad_params" });
    }
    const { readTranscript } = await import("@envoyhome/harness-host");
    return readTranscript(this.sessions.sessionDir(accountId, sessionId));
  }

  activeTurnCount(): number {
    return active.size;
  }

  async openSession(input: {
    accountId: string;
    agentId?: string;
    title?: string;
    channel?: string;
  }): Promise<Record<string, unknown>> {
    const meta = await this.sessions.open(input);
    return {
      sessionId: meta.sessionId,
      accountId: meta.accountId,
      agentId: meta.agentId,
      createdAt: meta.createdAt,
    };
  }

  async listSessions(accountId: string): Promise<Record<string, unknown>> {
    const sessions = await this.sessions.list(accountId);
    return {
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        ...(s.title !== undefined ? { title: s.title } : {}),
        updatedAt: s.updatedAt,
      })),
    };
  }

  async sendMessage(input: {
    accountId: string;
    sessionId: string;
    text: string;
    clientTurnId?: string;
    callerKind: string;
    /** Test hook: run tool plan without model. */
    plannedTools?: Array<{ tool: string; args: unknown; summary?: string }>;
    completionText?: string;
    origin?: TurnOrigin;
    channel?: string;
    rawRef?: string;
    /** True when the turn carries media attachments (Design §8.3 forceLocalForMedia). */
    hasMedia?: boolean;
  }): Promise<TurnWireResult> {
    const session = await this.sessions.get(input.accountId, input.sessionId);
    if (!session) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown session"), { code: "bad_params" });
    }
    const turnId = newTurnId();
    await this.workflows.ensureLoaded();
    const matched = matchKeywordWorkflow(
      input.text,
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

    if (matched) {
      void this.runWorkflowBackground({
        ...input,
        turnId,
        agentId: session.agentId,
        abort,
        workflow: matched,
      });
    } else {
      void this.runTurnBackground({
        ...input,
        turnId,
        agentId: session.agentId,
        abort,
      });
    }

    return { turnId, sessionId: input.sessionId, status: "started", route };
  }

  /**
   * ScheduleService fire path: single catalogue tool under §4.4 (unattended / grants).
   */
  async runScheduledTool(
    accountId: string,
    toolName: string,
    toolArgs: Record<string, unknown> = {},
  ): Promise<{ turnId: string; sessionId: string }> {
    const workflow: WorkflowDef = {
      id: `schedule-tool:${toolName}`,
      match: { schedule: "manual" },
      steps: [{ type: "tool", name: toolName, args: toolArgs }],
    };
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
    });
  }

  private normalizeWorkflowTool(name: string): string {
    if (name === "sandbox_write") return "write_file";
    if (name === "sandbox_read") return "read_file";
    return name;
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
    if (this.onComplete) {
      try {
        await this.onComplete(info);
      } catch {
        // channel outbound failures must not break the turn bookkeeping
      }
    }
    active.delete(info.turnId);
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
  }): Promise<void> {
    const record = active.get(input.turnId);
    if (!record) return;

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
    const inject = await this.memory.buildStandingInject(input.accountId);
    const sandboxRoot = this.paths.accountFiles(input.accountId);

    const ctx: TurnContext = {
      account_id: input.accountId,
      agent_id: input.agentId,
      session_id: input.sessionId,
      turn_id: input.turnId,
      sandbox_root: sandboxRoot,
      origin,
      standing_inject: inject.text,
      policy_snapshot: {
        origin,
        tool_policy: toolPolicy,
        model_mode: this.providers.modeForAccount(input.accountId),
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

    const provider = await this.makeProviderHandle(
      input.accountId,
      input.sessionId,
      input.turnId,
      forceLocal,
      input.text,
    );

    const sessionDir = this.sessions.sessionDir(input.accountId, input.sessionId);
    await appendTranscriptLine(sessionDir, {
      role: "user",
      text: input.text,
      at: new Date().toISOString(),
      turnId: input.turnId,
    });

    const turnDeps: TurnDeps = {
      ctx,
      provider,
      approval: approvalSink,
      fs: {
        writeFile: async (rel: string, content: string) => {
          const resolved = resolveSandboxPath({
            accountFilesRoot: sandboxRoot,
            shareRoot: this.paths.shareDir,
            path: rel,
            write: true,
          });
          await writeFile(resolved.absolute, content, "utf8");
        },
        readFile: async (rel: string) => {
          const resolved = resolveSandboxPath({
            accountFilesRoot: sandboxRoot,
            shareRoot: this.paths.shareDir,
            path: rel,
            write: false,
          });
          return readFile(resolved.absolute, "utf8");
        },
      },
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
              ...(inject.text ? [{ role: "system" as const, content: inject.text }] : []),
              { role: "user" as const, content: prompt },
            ],
          });
          return completed.text;
        },
      });
      replyText = results.map((r) => `${r.type}:${r.ok ? "ok" : r.detail}`).join("; ") || "workflow finished";
      this.emit("home:turn-delta", {
        turnId: input.turnId,
        sessionId: input.sessionId,
        accountId: input.accountId,
        agentId: input.agentId,
        kind: "text",
        text: replyText,
      });
      await appendTranscriptLine(sessionDir, {
        role: "assistant",
        text: replyText,
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
    plannedTools?: Array<{ tool: string; args: unknown; summary?: string }>;
    completionText?: string;
    origin?: TurnOrigin;
    channel?: string;
    rawRef?: string;
    hasMedia?: boolean;
  }): Promise<void> {
    const record = active.get(input.turnId);
    if (!record) return;

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
    const inject = await this.memory.buildStandingInject(input.accountId);
    const sandboxRoot = this.paths.accountFiles(input.accountId);

    const ctx: TurnContext = {
      account_id: input.accountId,
      agent_id: input.agentId,
      session_id: input.sessionId,
      turn_id: input.turnId,
      sandbox_root: sandboxRoot,
      origin,
      standing_inject: inject.text,
      policy_snapshot: {
        origin,
        tool_policy: toolPolicy,
        model_mode: this.providers.modeForAccount(input.accountId),
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

    const provider = await this.makeProviderHandle(
      input.accountId,
      input.sessionId,
      input.turnId,
      forceLocal,
      input.text,
    );
    // Emit home:route-decided before the model call. When completionText short-circuits
    // and auto-switch is off, skip pick so tests/harness stubs without a local pool still work.
    const routing = this.providers.routingForAccount(input.accountId);
    if (routing.autoModelSwitch.enabled || input.completionText === undefined) {
      provider.ensurePicked(input.text);
    }

    const sessionDir = this.sessions.sessionDir(input.accountId, input.sessionId);
    await appendTranscriptLine(sessionDir, {
      role: "user",
      text: input.text,
      at: new Date().toISOString(),
      turnId: input.turnId,
    });

    let replyText = "";
    let status: "ok" | "cancelled" | "error" = "ok";
    try {
      const turnDeps = {
        ctx,
        provider,
        approval: approvalSink,
        fs: {
          writeFile: async (rel: string, content: string) => {
            const resolved = resolveSandboxPath({
              accountFilesRoot: sandboxRoot,
              shareRoot: this.paths.shareDir,
              path: rel,
              write: true,
            });
            await writeFile(resolved.absolute, content, "utf8");
          },
          readFile: async (rel: string) => {
            const resolved = resolveSandboxPath({
              accountFilesRoot: sandboxRoot,
              shareRoot: this.paths.shareDir,
              path: rel,
              write: false,
            });
            return readFile(resolved.absolute, "utf8");
          },
        },
        ...(input.completionText !== undefined ? { completionText: input.completionText } : {}),
      };
      for await (const ev of runTurn({
        userText: input.text,
        deps: turnDeps,
        ...(input.plannedTools !== undefined ? { plannedTools: input.plannedTools } : {}),
      })) {
        if (input.abort.signal.aborted) {
          status = "cancelled";
          break;
        }
        if (ev.kind === "text" && ev.text) {
          replyText += ev.text;
          this.emit("home:turn-delta", {
            turnId: input.turnId,
            sessionId: input.sessionId,
            accountId: input.accountId,
            agentId: input.agentId,
            kind: "text",
            text: ev.text,
          });
          await appendTranscriptLine(sessionDir, {
            role: "assistant",
            text: ev.text,
            at: new Date().toISOString(),
            turnId: input.turnId,
          });
        }
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

    const turn = [...active.values()].find((t) => t.accountId === row.accountId);
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

  static digestForTool(tool: string, args: unknown): string {
    return canonicalDigest({ tool, data: args });
  }
}
