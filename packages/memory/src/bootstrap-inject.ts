// Standing bootstrap inject — Memory Design §4.2 caps + duty line (V-MEM-4/10/18).

import {
  IDENTITY_INJECT_BUDGET,
  composeIdentityInject,
} from "./agent-identity.js";
import {
  buildL2Inject,
  buildL3Inject,
  todayIsoDate,
  yesterdayIsoDate,
} from "./notes.js";
import {
  serializeProfileForInject,
  type ProfileDocument,
  type ProfileFact,
} from "./profile.js";

/**
 * Exact v1 inject budgets (Memory Design §4.2 — OpenClaw-aligned).
 * L1 ↔ USER.md hard 4k; L2/L3 ↔ bootstrapMaxChars 20k.
 * Identity (floor + persona) is reserved separately — see IDENTITY_STANDING_RESERVE.
 */
export const INJECT_BUDGET = {
  l1: 4000,
  l2: 20_000,
  l3: 20_000,
  /** Editable IDENTITY.md body only (floor is fixed and always included). */
  identity: IDENTITY_INJECT_BUDGET,
} as const;

/** Exact v1 raw soft caps (Memory Design §4.2). */
export const RAW_SOFT_CAP = {
  l1: 20_000,
  l2: 40_000,
  l3: 10_000,
  identity: 20_000,
} as const;

/**
 * Fixed duty line when any standing inject is truncated (V-MEM-10).
 * Must mention recall, session_search, and knowledge_search (V-MEM-10 / Knowledge-RAG).
 */
export const STANDING_DUTY_LINE =
  "Standing bootstrap may be partial — use recall / session_search / knowledge_search for more.";

/** @deprecated Use PRODUCT_IDENTITY_FLOOR from agent-identity — kept for import stability. */
export { PRODUCT_IDENTITY_FLOOR as PRODUCT_IDENTITY_PROLOGUE } from "./agent-identity.js";

export interface AssetBudgetReport {
  rawChars: number;
  injectChars: number;
  truncated: boolean;
  injectBudget: number;
  rawSoftCap: number;
  sectionsOmitted?: string[];
}

export interface StandingInjectResult {
  /** Full standing prefix for TurnContext.standing_inject */
  text: string;
  truncated: boolean;
  dutyLine: string | null;
  /** Brand floor + editable persona (outside L1–L3 package; reserved in §4.2.1). */
  identity: AssetBudgetReport;
  profile: AssetBudgetReport & { factCount: number };
  memory: AssetBudgetReport & { sectionsOmitted: string[] };
  daily: AssetBudgetReport;
  /** Generation bumped on every successful standing mutation (V-MEM-7). */
  generation: number;
}

export interface InjectInputs {
  profile: ProfileDocument;
  memoryMd: string;
  todayContent: string;
  yesterdayContent: string;
  /** Editable assistant persona (IDENTITY.md). */
  identityMd?: string;
  /**
   * Account displayName from profile.json extras — injected as a `name` fact
   * when no name/preferred_name fact exists yet.
   */
  accountDisplayName?: string;
  now?: Date;
  injectPrioritySections?: string[];
  generation?: number;
  /** Optional per-account overrides from policy.json → caps */
  caps?: {
    l1?: { injectBudget?: number; rawSoftCap?: number };
    l2?: { injectBudget?: number; rawSoftCap?: number };
    l3?: { injectBudget?: number; rawSoftCap?: number };
  };
}

/** Merge account displayName into L1 facts for inject only (does not mutate disk). */
export function profileFactsForInject(
  profile: ProfileDocument,
  accountDisplayName?: string,
): Record<string, ProfileFact> {
  const facts = { ...(profile.facts as Record<string, ProfileFact>) };
  const display =
    (typeof accountDisplayName === "string" && accountDisplayName.trim()) ||
    (typeof profile.displayName === "string" ? profile.displayName.trim() : "");
  if (!display) return facts;
  const hasName =
    facts.name !== undefined ||
    facts.preferred_name !== undefined ||
    facts.displayName !== undefined;
  if (hasName) return facts;
  facts.name = {
    value: display,
    updatedAt:
      typeof profile.updatedAt === "string" ? profile.updatedAt : new Date().toISOString(),
    source: "migrate",
    trust: "owner",
  };
  return facts;
}

export function buildStandingInject(input: InjectInputs): StandingInjectResult {
  const l1Budget = input.caps?.l1?.injectBudget ?? INJECT_BUDGET.l1;
  const l2Budget = input.caps?.l2?.injectBudget ?? INJECT_BUDGET.l2;
  const l3Budget = input.caps?.l3?.injectBudget ?? INJECT_BUDGET.l3;
  const l1Raw = input.caps?.l1?.rawSoftCap ?? RAW_SOFT_CAP.l1;
  const l2Raw = input.caps?.l2?.rawSoftCap ?? RAW_SOFT_CAP.l2;
  const l3Raw = input.caps?.l3?.rawSoftCap ?? RAW_SOFT_CAP.l3;
  const identityBudget = INJECT_BUDGET.identity;
  const identityRawCap = RAW_SOFT_CAP.identity;

  const facts = profileFactsForInject(input.profile, input.accountDisplayName);
  const profileSer = serializeProfileForInject(facts, l1Budget);
  const profileBlock = `## Profile\n${profileSer.text}`;
  // injectBudget is measured on the exact serialized block including label.
  const profileInjectChars = profileBlock.length;
  const profileTruncated =
    profileSer.truncated || profileInjectChars > l1Budget
      ? true
      : profileSer.text !== JSON.stringify(facts, null, 2) &&
        Object.keys(facts).length > profileSer.factCount;

  // Re-measure: if labeled block exceeds budget, shrink facts further.
  let profileText = profileSer.text;
  let profileFactCount = profileSer.factCount;
  let profileTrunc = profileSer.truncated;
  if (profileBlock.length > l1Budget) {
    const innerBudget = Math.max(2, l1Budget - "## Profile\n".length);
    const again = serializeProfileForInject(facts, innerBudget);
    profileText = again.text;
    profileFactCount = again.factCount;
    profileTrunc = true;
  }
  const profileFinal = `## Profile\n${profileText}`;

  const l2 = buildL2Inject(
    input.memoryMd,
    Math.max(0, l2Budget - "## MEMORY\n".length),
    input.injectPrioritySections ?? ["## Standing"],
  );
  const memoryFinal = `## MEMORY\n${l2.text}`;
  const memoryTrunc =
    l2.truncated ||
    memoryFinal.length > l2Budget ||
    (input.memoryMd.trim().length > 0 && l2.injectChars < input.memoryMd.length);

  const now = input.now ?? new Date();
  const today = todayIsoDate(now);
  const yesterday = yesterdayIsoDate(now);
  const l3 = buildL3Inject(
    { date: today, content: input.todayContent },
    { date: yesterday, content: input.yesterdayContent },
    Math.max(0, l3Budget - "## Daily\n".length),
  );
  const dailyFinal = l3.text ? `## Daily\n${l3.text}` : "## Daily\n";
  const dailyTrunc = l3.truncated;

  const identityMd = input.identityMd ?? "";
  const identity = composeIdentityInject(identityMd);
  const truncated = profileTrunc || memoryTrunc || dailyTrunc || identity.truncated;
  const parts = [identity.text, profileFinal, memoryFinal, dailyFinal];
  if (truncated) parts.push(STANDING_DUTY_LINE);
  const text = parts.join("\n\n");

  const profileRaw = JSON.stringify(input.profile);
  const memoryRaw = input.memoryMd.length;
  const dailyRaw = input.todayContent.length + input.yesterdayContent.length;

  return {
    text,
    truncated,
    dutyLine: truncated ? STANDING_DUTY_LINE : null,
    generation: input.generation ?? 0,
    identity: {
      rawChars: identityMd.length,
      injectChars: identity.text.length,
      truncated: identity.truncated,
      injectBudget: identityBudget,
      rawSoftCap: identityRawCap,
    },
    profile: {
      factCount: Object.keys(facts).length,
      rawChars: profileRaw.length,
      injectChars: profileFinal.length,
      truncated: profileTrunc,
      injectBudget: l1Budget,
      rawSoftCap: l1Raw,
    },
    memory: {
      rawChars: memoryRaw,
      injectChars: memoryFinal.length,
      truncated: memoryTrunc,
      injectBudget: l2Budget,
      rawSoftCap: l2Raw,
      sectionsOmitted: l2.sectionsOmitted,
    },
    daily: {
      rawChars: dailyRaw,
      injectChars: dailyFinal.length,
      truncated: dailyTrunc,
      injectBudget: l3Budget,
      rawSoftCap: l3Raw,
    },
  };
}

/** rawSoftCap crossing → doctor issue codes (action described in §4.2; no auto-delete). */
export function rawSoftCapIssues(report: {
  profileRaw: number;
  memoryRaw: number;
  dailyFileRaws: number[];
}): string[] {
  const issues: string[] = [];
  if (report.profileRaw > RAW_SOFT_CAP.l1) issues.push("memory.profile_raw_oversize");
  if (report.memoryRaw > RAW_SOFT_CAP.l2) issues.push("memory.memory_raw_oversize");
  if (report.memoryRaw > RAW_SOFT_CAP.l2 * 2) {
    issues.push("memory.memory_raw_oversize"); // severity=warn at 2× — same code, surfaced by doctor later
  }
  for (const n of report.dailyFileRaws) {
    if (n > RAW_SOFT_CAP.l3) issues.push("memory.daily_raw_oversize");
    if (n > 20_000) issues.push("memory.daily_raw_oversize");
  }
  return [...new Set(issues)];
}
