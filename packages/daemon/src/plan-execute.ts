/**
 * Design §19.13 P2-E4 / 2026-11-03 — attended plan→execute helpers (pure, testable).
 * Adapt EnvoyCoder plan-gate — Home port must never be looser (V-P2-AGENT-6).
 */

export type SessionPlanEntryStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type SessionPlanEntryRisk =
  | "read"
  | "write"
  | "exec"
  | "network"
  | "admin"
  | "sensitive";

export type SessionPlanPhase = "planning" | "awaiting_confirm" | "executing" | "done";

export type SessionPlanEntry = {
  id?: string;
  content: string;
  status: SessionPlanEntryStatus;
  risk?: SessionPlanEntryRisk;
};

export type SessionPlan = {
  planId: string;
  phase: SessionPlanPhase;
  entries: SessionPlanEntry[];
  needsWriteConfirm: boolean;
  confirmedAt?: string;
  /**
   * Fingerprints of write/admin steps covered by the last soft confirm.
   * New pending write/admin keys not in this set force re-confirm (V-P2-AGENT-7).
   */
  confirmedWriteKeys?: string[];
  hopCount: number;
  hopBudget: number;
  sourceUserText: string;
  updatedAt: string;
};

/** Default attended auto-advance hops after confirm / read-only start. */
export const DEFAULT_PLAN_HOP_BUDGET = 8;

/** Prefix for plan-first framing — design only until checklist + confirm path. */
export const HOME_PLAN_FIRST_PREFIX =
  "[Plan carefully — design a step-by-step checklist first. Do not write files or " +
  "actuate smart-home yet. Call `session_plan` with a complete entries list " +
  "(content + status pending + risk read|write|admin when a step will write or actuate). " +
  "Wait for implement/confirm when write/admin steps are present.]\n\n";

// Strong cues only — bare "plan" / "steps" alone must not fire (protect simple/medium).
const STRONG =
  /\b(refactor|migrate|redesign|overhaul|rewrite)\b.{0,40}\b(system|architecture|codebase|repo|entire|whole|all|household|home)\b|\b(analyze|investigate|audit)\b.{0,40}\b(whole|entire|full)\b.{0,20}\b(repo|codebase|project|household|home)\b|\binvestigate (this )?(repo|household|home)\b|\b(end[\s.-]?to[\s.-]?end).{0,40}\b(refactor|migrate|redesign|overhaul|rewrite|audit|investigate|automate)\b|\b(refactor|migrate|redesign|overhaul|rewrite|audit|investigate|automate).{0,40}\b(end[\s.-]?to[\s.-]?end)\b|\bacross (all|every)\b.{0,20}\b(package|module|service|room|device|account)\b|\b(multi[\s-]?phase|phased roadmap|step[\s-]?by[\s-]?step plan for)\b/i;

const WEAK =
  /\b(refactor|migrate|redesign|architecture|overhaul|rewrite|multi[\s-]?step|phased|roadmap|decompose|break (it|this) down)\b/i;

const FORCE_PLAN =
  /^\s*(plan\s+this|make\s+a\s+plan|plan\s+mode|先做计划|制定计划|分步计划)\b/i;

const WRITE_ADMIN_RISKS = new Set<SessionPlanEntryRisk>(["write", "admin"]);

/**
 * Conservative complexity gate. Default false — short household asks never enter.
 * Never looser than EnvoyCoder looksLikeBigTask bands.
 */
export function looksLikeComplexHomeTask(
  prompt: string,
  opts?: { attachmentCount?: number; forcePlan?: boolean },
): boolean {
  const text = prompt.trim();
  if (text.length === 0) return false;
  if (opts?.forcePlan === true) return true;
  if (FORCE_PLAN.test(text)) return true;
  const attachmentCount = opts?.attachmentCount ?? 0;
  if (STRONG.test(text)) return true;
  if (attachmentCount >= 3) return true;
  if (text.length >= 800) return true;
  if (text.length >= 400 && (WEAK.test(text) || attachmentCount >= 2)) return true;
  return false;
}

export function shouldEnterPlanPath(input: {
  origin: string;
  prompt: string;
  attachmentCount?: number;
  forcePlan?: boolean;
  /** Existing executing/awaiting plan already owns the session. */
  hasActiveSessionPlan?: boolean;
}): boolean {
  if (input.origin !== "attended") return false;
  if (input.hasActiveSessionPlan) return true;
  return looksLikeComplexHomeTask(input.prompt, {
    ...(input.attachmentCount !== undefined
      ? { attachmentCount: input.attachmentCount }
      : {}),
    ...(input.forcePlan !== undefined ? { forcePlan: input.forcePlan } : {}),
  });
}

export function withPlanFirstFraming(userPrompt: string): string {
  const trimmed = userPrompt.trim();
  if (trimmed.startsWith("[Plan carefully")) return userPrompt;
  return HOME_PLAN_FIRST_PREFIX + userPrompt;
}

export function stripPlanFirstFraming(text: string): string {
  if (text.startsWith(HOME_PLAN_FIRST_PREFIX)) return text.slice(HOME_PLAN_FIRST_PREFIX.length);
  if (text.startsWith("[Plan carefully")) {
    const end = text.indexOf("]\n\n");
    if (end >= 0) return text.slice(end + 3);
  }
  return text;
}

export function planNeedsWriteConfirm(entries: readonly SessionPlanEntry[]): boolean {
  return entries.some((e) => e.risk !== undefined && WRITE_ADMIN_RISKS.has(e.risk));
}

function writeAdminKey(e: SessionPlanEntry): string {
  return `${e.id ?? ""}|${e.content}|${e.risk}`;
}

/** Pending/in_progress write|admin fingerprints — used for confirm coverage. */
export function writeAdminPendingKeys(entries: readonly SessionPlanEntry[]): string[] {
  return entries
    .filter(
      (e) =>
        (e.status === "pending" || e.status === "in_progress") &&
        e.risk !== undefined &&
        WRITE_ADMIN_RISKS.has(e.risk),
    )
    .map(writeAdminKey)
    .sort();
}

/** Completed/cancelled write|admin fingerprints — detect status regression → re-confirm. */
export function writeAdminSettledKeys(entries: readonly SessionPlanEntry[]): string[] {
  return entries
    .filter(
      (e) =>
        (e.status === "completed" || e.status === "cancelled") &&
        e.risk !== undefined &&
        WRITE_ADMIN_RISKS.has(e.risk),
    )
    .map(writeAdminKey)
    .sort();
}

export function planEntriesChanged(
  before: SessionPlan | null | undefined,
  after: SessionPlan | null | undefined,
): boolean {
  if (!after) return false;
  if (!before) return true;
  return JSON.stringify(before.entries) !== JSON.stringify(after.entries);
}

export function normalizePlanEntries(raw: unknown): SessionPlanEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SessionPlanEntry[] = [];
  for (let i = 0; i < raw.length && out.length < 32; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rec = row as Record<string, unknown>;
    const content = typeof rec.content === "string" ? rec.content.trim() : "";
    if (!content) continue;
    const statusRaw = typeof rec.status === "string" ? rec.status.trim() : "pending";
    const status: SessionPlanEntryStatus =
      statusRaw === "in_progress" ||
      statusRaw === "completed" ||
      statusRaw === "cancelled" ||
      statusRaw === "pending"
        ? statusRaw
        : "pending";
    const riskRaw = typeof rec.risk === "string" ? rec.risk.trim() : undefined;
    const risk: SessionPlanEntryRisk | undefined =
      riskRaw === "read" ||
      riskRaw === "write" ||
      riskRaw === "exec" ||
      riskRaw === "network" ||
      riskRaw === "admin" ||
      riskRaw === "sensitive"
        ? riskRaw
        : undefined;
    const id =
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim().slice(0, 64)
        : `step-${i + 1}`;
    out.push({
      id,
      content: content.slice(0, 500),
      status,
      ...(risk !== undefined ? { risk } : {}),
    });
  }
  return out;
}

export function buildSessionPlan(input: {
  planId?: string;
  entries: SessionPlanEntry[];
  sourceUserText: string;
  hopBudget?: number;
  prior?: SessionPlan | null;
  now?: string;
}): SessionPlan {
  const now = input.now ?? new Date().toISOString();
  const pendingWriteKeys = writeAdminPendingKeys(input.entries);
  const needsWriteConfirm = pendingWriteKeys.length > 0;
  const priorKeys = new Set(input.prior?.confirmedWriteKeys ?? []);
  const priorSettled = new Set(
    input.prior ? writeAdminSettledKeys(input.prior.entries) : [],
  );
  /** New fingerprint OR a previously settled write/admin step reopened. */
  const uncoveredWrite =
    needsWriteConfirm &&
    pendingWriteKeys.some((k) => !priorKeys.has(k) || priorSettled.has(k));
  const priorConfirmed = input.prior?.confirmedAt;
  const allDone =
    input.entries.length > 0 &&
    input.entries.every((e) => e.status === "completed" || e.status === "cancelled");
  let phase: SessionPlanPhase;
  if (allDone) phase = "done";
  else if (uncoveredWrite) phase = "awaiting_confirm";
  else if (needsWriteConfirm && priorConfirmed) phase = "executing";
  else phase = "executing";
  const keepPriorConfirm =
    phase === "executing" && needsWriteConfirm && !!priorConfirmed && !uncoveredWrite;
  return {
    planId: input.planId?.trim() || input.prior?.planId || `plan-${now.slice(0, 19)}`,
    phase,
    entries: input.entries,
    needsWriteConfirm,
    hopCount: input.prior?.hopCount ?? 0,
    hopBudget:
      typeof input.hopBudget === "number" && Number.isFinite(input.hopBudget)
        ? Math.max(1, Math.min(24, Math.floor(input.hopBudget)))
        : (input.prior?.hopBudget ?? DEFAULT_PLAN_HOP_BUDGET),
    sourceUserText: (input.sourceUserText || input.prior?.sourceUserText || "").slice(0, 2000),
    updatedAt: now,
    ...(keepPriorConfirm
      ? {
          confirmedAt: priorConfirmed,
          confirmedWriteKeys: input.prior?.confirmedWriteKeys ?? pendingWriteKeys,
        }
      : {}),
    ...(!needsWriteConfirm && phase === "executing"
      ? { confirmedAt: priorConfirmed ?? now, confirmedWriteKeys: [] as string[] }
      : {}),
  };
}

export function confirmSessionPlan(plan: SessionPlan, now = new Date().toISOString()): SessionPlan {
  if (plan.phase === "done") return plan;
  return {
    ...plan,
    phase: "executing",
    confirmedAt: now,
    confirmedWriteKeys: writeAdminPendingKeys(plan.entries),
    updatedAt: now,
    needsWriteConfirm: writeAdminPendingKeys(plan.entries).length > 0,
  };
}

export function reviseSessionPlan(plan: SessionPlan, now = new Date().toISOString()): SessionPlan {
  const { confirmedAt: _c, confirmedWriteKeys: _k, ...rest } = plan;
  return {
    ...rest,
    phase: "planning",
    updatedAt: now,
    hopCount: 0,
    entries: plan.entries.map((e) =>
      e.status === "completed" || e.status === "cancelled"
        ? e
        : { ...e, status: "pending" as const },
    ),
  };
}

/**
 * Attended only; requires confirm when write/admin; respects hop budget.
 * Advances only after checklist progress or first transition into executing
 * (do not burn hops when the agent made no plan update — V-P2-AGENT-8).
 */
export function shouldAutoAdvancePlan(opts: {
  origin: string;
  plan: SessionPlan | null | undefined;
  /** Plan meta at turn start (before this turn's session_plan calls). */
  priorPlan?: SessionPlan | null;
  /** True when session_plan ran this turn. */
  planTouched?: boolean;
  /** Long-task cap hit — defer plan hops (compete with V-P2-AGENT-5). */
  iterationCapHit?: boolean;
}): boolean {
  if (opts.origin !== "attended") return false;
  if (opts.iterationCapHit === true) return false;
  const plan = opts.plan;
  if (!plan) return false;
  if (plan.phase !== "executing") return false;
  if (plan.needsWriteConfirm && !plan.confirmedAt) return false;
  if (plan.hopCount >= plan.hopBudget) return false;
  const hasWork = plan.entries.some(
    (e) => e.status === "pending" || e.status === "in_progress",
  );
  if (!hasWork) return false;
  const prior = opts.priorPlan;
  const newlyExecuting =
    !prior ||
    prior.phase !== "executing" ||
    (plan.confirmedAt !== undefined && prior.confirmedAt === undefined);
  const progressed =
    opts.planTouched === true && planEntriesChanged(prior, plan);
  // First hop into execute, or checklist actually moved this turn.
  return newlyExecuting || progressed;
}

export function nextPlanHop(plan: SessionPlan, now = new Date().toISOString()): SessionPlan {
  return {
    ...plan,
    hopCount: plan.hopCount + 1,
    updatedAt: now,
    phase: "executing",
  };
}

export function nextPendingPlanEntry(
  plan: SessionPlan,
): SessionPlanEntry | undefined {
  return (
    plan.entries.find((e) => e.status === "in_progress") ??
    plan.entries.find((e) => e.status === "pending")
  );
}

export function planExecutePreamble(plan: SessionPlan): string {
  const next = nextPendingPlanEntry(plan);
  const lines = plan.entries
    .map((e, i) => `${i + 1}. [${e.status}] ${e.content}${e.risk ? ` (risk:${e.risk})` : ""}`)
    .join("\n");
  return (
    `[Session plan execute — hop ${plan.hopCount + 1}/${plan.hopBudget}. ` +
    `Work on the next pending/in_progress step only, then call session_plan to update statuses. ` +
    `Do not re-plan from scratch.]\n` +
    `Next: ${next?.content ?? "(none)"}\nChecklist:\n${lines}\n\n` +
    `Original ask: ${plan.sourceUserText}`
  );
}

export function planRevisePreamble(plan: SessionPlan): string {
  return (
    `[Revise the session plan — design only. Update session_plan entries; ` +
    `no write/actuate until implement is confirmed.]\n` +
    `Current checklist:\n` +
    plan.entries.map((e, i) => `${i + 1}. [${e.status}] ${e.content}`).join("\n") +
    `\n\nOriginal ask: ${plan.sourceUserText}`
  );
}

export function sessionPlanEventPayload(
  accountId: string,
  sessionId: string,
  plan: SessionPlan,
): Record<string, unknown> {
  return {
    accountId,
    sessionId,
    planId: plan.planId,
    phase: plan.phase,
    entries: plan.entries.map((e) => ({
      ...(e.id ? { id: e.id } : {}),
      content: e.content,
      status: e.status,
      ...(e.risk ? { risk: e.risk } : {}),
    })),
    needsWriteConfirm: plan.needsWriteConfirm,
    ...(plan.confirmedAt ? { confirmedAt: plan.confirmedAt } : {}),
    hopCount: plan.hopCount,
    hopBudget: plan.hopBudget,
    at: plan.updatedAt,
  };
}
