// Daemon-owned approval gate surface exposed to harnesses (Design §4.4, §6.1).

import {
  ApprovalStore,
  canonicalDigest,
  type PendingApproval,
  type RiskTier,
} from "./approvals.js";
import type { TurnOrigin } from "./context.js";
import {
  execPolicyAllows,
  requiresAttendedApproval,
  toolSpec,
  unattendedRequiresGrant,
  type PolicySnapshot,
  type ToolPolicyPreset,
} from "./policy.js";

export type ApprovalDecision = "allowed" | "denied" | "pending";

export interface ToolDispatchRequest {
  accountId: string;
  agentId: string;
  turnId: string;
  tool: string;
  args: unknown;
  summary?: string;
  objectId?: string;
  desiredState?: string;
}

export interface ApprovalSinkDeps {
  store: ApprovalStore;
  policy: PolicySnapshot;
  toolPolicy: ToolPolicyPreset;
  onApprovalNeeded?: (row: PendingApproval) => void;
  /** Attended: resolve when home.answerApproval completes. */
  waitForAnswer?: (approvalId: string) => Promise<"allow" | "deny">;
}

export class ApprovalSink {
  constructor(private readonly deps: ApprovalSinkDeps) {}

  private digest(args: unknown): string {
    return canonicalDigest(args);
  }

  async authorize(req: ToolDispatchRequest): Promise<ApprovalDecision> {
    const spec = toolSpec(req.tool);
    if (!spec) {
      throw Object.assign(new Error(`envoyhome.bad_params: unknown tool ${req.tool}`), {
        code: "bad_params",
      });
    }

    const argsDigest = this.digest(req.args);
    const origin = this.deps.policy.origin;

    if (origin === "unattended") {
      if (!unattendedRequiresGrant(spec, origin)) {
        return "allowed";
      }
      const grant = await this.deps.store.claimGrant({
        accountId: req.accountId,
        tool: req.tool,
        argsDigest,
        actuationId: req.turnId,
      });
      return grant ? "allowed" : "denied";
    }

    if (spec.risk === "exec" || spec.risk === "network") {
      if (!execPolicyAllows(origin, this.deps.toolPolicy)) {
        return "denied";
      }
    }

    if (!requiresAttendedApproval(spec, origin, this.deps.toolPolicy)) {
      return "allowed";
    }

    const pending = await this.deps.store.createApproval({
      accountId: req.accountId,
      agentId: req.agentId,
      turnId: req.turnId,
      tool: req.tool,
      argsDigest,
      risk: spec.risk as RiskTier,
      origin,
      ...(req.summary !== undefined ? { summary: req.summary } : {}),
    });
    this.deps.onApprovalNeeded?.(pending);

    if (!this.deps.waitForAnswer) {
      return "pending";
    }
    const decision = await this.deps.waitForAnswer(pending.id);
    return decision === "allow" ? "allowed" : "denied";
  }
}
