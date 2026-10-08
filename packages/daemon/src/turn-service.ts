// Turn pipeline: sessions, harness, providers, approvals (B6).

import { randomUUID } from "node:crypto";
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

export interface TurnWireResult {
  turnId: string;
  sessionId: string;
  status: "started";
  route: "harness" | "workflow" | "direct";
}

interface ActiveTurn {
  accountId: string;
  sessionId: string;
  abort: AbortController;
  approvalWaiters: Map<string, (d: "allow" | "deny") => void>;
}

const active = new Map<string, ActiveTurn>();

registerResetHook(() => {
  active.clear();
});

function deriveOrigin(_callerKind: string): TurnOrigin {
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

  private normalizeWorkflowTool(name: string): string {
    if (name === "sandbox_write") return "write_file";
    if (name === "sandbox_read") return "read_file";
    return name;
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
  }): Promise<void> {
    const record = active.get(input.turnId);
    if (!record) return;

    const account = await this.accounts.get(input.accountId);
    const toolPolicy = account?.toolPolicy ?? "standard";
    const origin = input.origin ?? deriveOrigin(input.callerKind);
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
      onApprovalNeeded: () => undefined,
      waitForAnswer: (approvalId) =>
        new Promise<"allow" | "deny">((resolve) => {
          record.approvalWaiters.set(approvalId, resolve);
        }),
    });

    const provider = new ProviderHandle({
      router: this.providers.getRouter(),
      mode: this.providers.modeForAccount(input.accountId),
    });

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
      const summary = results.map((r) => `${r.type}:${r.ok ? "ok" : r.detail}`).join("; ");
      await appendTranscriptLine(sessionDir, {
        role: "assistant",
        text: summary || "workflow finished",
        at: new Date().toISOString(),
        turnId: input.turnId,
        route: "workflow",
        workflowId: input.workflow.id,
      });
      await this.sessions.touch(input.accountId, input.sessionId);
    } finally {
      active.delete(input.turnId);
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
  }): Promise<void> {
    const record = active.get(input.turnId);
    if (!record) return;

    const account = await this.accounts.get(input.accountId);
    const toolPolicy = account?.toolPolicy ?? "standard";
    const origin = input.origin ?? deriveOrigin(input.callerKind);
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
        const turn = active.get(input.turnId);
        if (!turn) return;
        // Event bus lands in B12; durable store is source of truth for tests.
        void row;
      },
      waitForAnswer: (approvalId) =>
        new Promise<"allow" | "deny">((resolve) => {
          record.approvalWaiters.set(approvalId, resolve);
        }),
    });

    const provider = new ProviderHandle({
      router: this.providers.getRouter(),
      mode: this.providers.modeForAccount(input.accountId),
    });

    const sessionDir = this.sessions.sessionDir(input.accountId, input.sessionId);
    await appendTranscriptLine(sessionDir, {
      role: "user",
      text: input.text,
      at: new Date().toISOString(),
      turnId: input.turnId,
    });

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
        if (input.abort.signal.aborted) break;
        if (ev.kind === "text" && ev.text) {
          await appendTranscriptLine(sessionDir, {
            role: "assistant",
            text: ev.text,
            at: new Date().toISOString(),
            turnId: input.turnId,
          });
        }
      }
      await this.sessions.touch(input.accountId, input.sessionId);
    } finally {
      active.delete(input.turnId);
    }
  }

  cancelTurn(turnId: string): boolean {
    const t = active.get(turnId);
    if (!t) return false;
    t.abort.abort();
    active.delete(turnId);
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
    // Owner listing all accounts — walk accounts dir
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
    // Also refuse opening another account's root via safeJoin chokepoint
    safeJoin(this.paths.accountFiles(accountId), "documents");
  }

  static digestForTool(tool: string, args: unknown): string {
    return canonicalDigest({ tool, data: args });
  }
}
