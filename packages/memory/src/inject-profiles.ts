// Model-aware inject packages — Memory Design §4.2.1 (V-MEM-22).
// Target package aligns with OpenClaw bootstrap caps (2026-10-13l / 2026-10-13m).
// Identity (floor + persona) is reserved outside the L1–L3 package.

import { IDENTITY_STANDING_RESERVE } from "./agent-identity.js";
import { INJECT_BUDGET, RAW_SOFT_CAP } from "./bootstrap-inject.js";

export { IDENTITY_STANDING_RESERVE };

export type InjectBudgetMode = "auto" | "baseline" | "custom";
export type InjectProfileId = "cloud" | "local";

export interface InjectAssetBudgets {
  l1: number;
  l2: number;
  l3: number;
}

export interface InjectProfileReport {
  contextTokens?: number;
  sourceProviderId?: string;
  l1: number;
  l2: number;
  l3: number;
}

export interface InjectProfilesWire {
  active: InjectProfileId;
  cloud: InjectProfileReport;
  local: InjectProfileReport;
}

/** Optional per-asset overrides from policy.json → caps. */
export type CapsOverride = {
  l1?: { injectBudget?: number; rawSoftCap?: number };
  l2?: { injectBudget?: number; rawSoftCap?: number };
  l3?: { injectBudget?: number; rawSoftCap?: number };
};

export const CHARS_PER_TOKEN = 4;
/** OpenClaw bootstrapTotalMaxChars — Memory Design §4.2.1. */
export const CEILING_TOTAL = 60_000;
/**
 * Safe standing total when context is unknown on the **local** profile, or the
 * preferred floor when a known window can afford it (never above `affordable`).
 */
export const HARD_MIN_TOTAL = 6_000;
/** Standing inject may use at most this fraction of contextChars. */
export const MAX_FRACTION = 0.2;
export const BASELINE_TOTAL =
  INJECT_BUDGET.l1 + INJECT_BUDGET.l2 + INJECT_BUDGET.l3;

export function baselineInjectPackage(): InjectAssetBudgets {
  return { l1: INJECT_BUDGET.l1, l2: INJECT_BUDGET.l2, l3: INJECT_BUDGET.l3 };
}

/**
 * Split total with OpenClaw baseline ratios 4:20:20 (L1:L2:L3).
 * Remainder goes to L3 so the sum is exact.
 */
export function splitInjectTotal(total: number): InjectAssetBudgets {
  const t = Math.max(0, Math.floor(total));
  if (t === 0) return { l1: 0, l2: 0, l3: 0 };
  if (t >= BASELINE_TOTAL) return baselineInjectPackage();
  const l1 = Math.floor((t * INJECT_BUDGET.l1) / BASELINE_TOTAL);
  const l2 = Math.floor((t * INJECT_BUDGET.l2) / BASELINE_TOTAL);
  const l3 = t - l1 - l2;
  return { l1, l2, l3 };
}

/**
 * Derive one L1–L3 inject package from contextTokens (Memory Design §4.2.1).
 * Identity (floor + persona) is reserved first via IDENTITY_STANDING_RESERVE so
 * total standing (identity + L1–L3) stays within MAX_FRACTION / CEILING.
 * - Unknown cloud → full OpenClaw baseline (identity still reserved at inject).
 * - Unknown local → HARD_MIN L1–L3 package (do not dump 44k into a small GGUF).
 * - Known context → never exceed affordable after identity reserve.
 */
export function deriveInjectPackage(
  contextTokens: number | undefined,
  profile: InjectProfileId,
): InjectAssetBudgets {
  if (
    typeof contextTokens !== "number" ||
    !Number.isFinite(contextTokens) ||
    contextTokens <= 0
  ) {
    if (profile === "local") return splitInjectTotal(HARD_MIN_TOTAL);
    return baselineInjectPackage();
  }
  const contextChars = contextTokens * CHARS_PER_TOKEN;
  const affordableStanding = Math.floor(contextChars * MAX_FRACTION);
  const ceilingL123 = Math.max(0, CEILING_TOTAL - IDENTITY_STANDING_RESERVE);
  if (affordableStanding >= BASELINE_TOTAL + IDENTITY_STANDING_RESERVE) {
    return baselineInjectPackage();
  }
  // L1–L3 share what remains after identity reserve; never above baseline/ceiling.
  const affordableL123 = Math.max(0, affordableStanding - IDENTITY_STANDING_RESERVE);
  const total = Math.min(affordableL123, BASELINE_TOTAL, ceilingL123);
  return splitInjectTotal(total);
}

export function customInjectPackage(caps?: CapsOverride): InjectAssetBudgets {
  const base = baselineInjectPackage();
  return {
    l1: caps?.l1?.injectBudget ?? base.l1,
    l2: caps?.l2?.injectBudget ?? base.l2,
    l3: caps?.l3?.injectBudget ?? base.l3,
  };
}

export function packageForMode(
  mode: InjectBudgetMode,
  profile: InjectProfileId,
  contextTokens: number | undefined,
  caps?: CapsOverride,
): InjectAssetBudgets {
  if (mode === "custom") return customInjectPackage(caps);
  if (mode === "baseline") return baselineInjectPackage();
  return deriveInjectPackage(contextTokens, profile);
}

export type StandingCapsInput = {
  l1?: { injectBudget?: number; rawSoftCap?: number };
  l2?: { injectBudget?: number; rawSoftCap?: number };
  l3?: { injectBudget?: number; rawSoftCap?: number };
};

export function capsInputFromPackage(
  pkg: InjectAssetBudgets,
  caps?: CapsOverride,
): StandingCapsInput {
  return {
    l1: {
      injectBudget: pkg.l1,
      rawSoftCap: caps?.l1?.rawSoftCap ?? RAW_SOFT_CAP.l1,
    },
    l2: {
      injectBudget: pkg.l2,
      rawSoftCap: caps?.l2?.rawSoftCap ?? RAW_SOFT_CAP.l2,
    },
    l3: {
      injectBudget: pkg.l3,
      rawSoftCap: caps?.l3?.rawSoftCap ?? RAW_SOFT_CAP.l3,
    },
  };
}

export interface ResolveInjectProfilesInput {
  mode: InjectBudgetMode;
  active: InjectProfileId;
  cloudContextTokens?: number;
  localContextTokens?: number;
  cloudProviderId?: string;
  localProviderId?: string;
  caps?: CapsOverride;
}

export interface ResolveInjectProfilesResult {
  injectBudgetMode: InjectBudgetMode;
  injectProfiles: InjectProfilesWire;
  /** Caps to pass into buildStandingInject for `active`. */
  caps: StandingCapsInput;
}

export function resolveInjectProfiles(
  input: ResolveInjectProfilesInput,
): ResolveInjectProfilesResult {
  const mode = input.mode;
  const cloudPkg = packageForMode(mode, "cloud", input.cloudContextTokens, input.caps);
  const localPkg = packageForMode(mode, "local", input.localContextTokens, input.caps);
  const activePkg = input.active === "local" ? localPkg : cloudPkg;

  const cloud: InjectProfileReport = {
    ...cloudPkg,
    ...(input.cloudContextTokens !== undefined
      ? { contextTokens: input.cloudContextTokens }
      : {}),
    ...(input.cloudProviderId !== undefined
      ? { sourceProviderId: input.cloudProviderId }
      : {}),
  };
  const local: InjectProfileReport = {
    ...localPkg,
    ...(input.localContextTokens !== undefined
      ? { contextTokens: input.localContextTokens }
      : {}),
    ...(input.localProviderId !== undefined
      ? { sourceProviderId: input.localProviderId }
      : {}),
  };

  return {
    injectBudgetMode: mode,
    injectProfiles: { active: input.active, cloud, local },
    caps: capsInputFromPackage(activePkg, input.caps),
  };
}

export function parseInjectBudgetMode(raw: unknown): InjectBudgetMode {
  if (raw === "baseline" || raw === "custom" || raw === "auto") return raw;
  return "auto";
}

export function parseCapsOverride(raw: unknown): CapsOverride | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const readAsset = (key: string) => {
    const a = o[key];
    if (!a || typeof a !== "object" || Array.isArray(a)) return undefined;
    const row = a as Record<string, unknown>;
    const out: { injectBudget?: number; rawSoftCap?: number } = {};
    if (typeof row.injectBudget === "number" && Number.isFinite(row.injectBudget)) {
      out.injectBudget = Math.max(0, Math.floor(row.injectBudget));
    }
    if (typeof row.rawSoftCap === "number" && Number.isFinite(row.rawSoftCap)) {
      out.rawSoftCap = Math.max(0, Math.floor(row.rawSoftCap));
    }
    return Object.keys(out).length ? out : undefined;
  };
  const l1 = readAsset("l1");
  const l2 = readAsset("l2");
  const l3 = readAsset("l3");
  if (!l1 && !l2 && !l3) return undefined;
  return {
    ...(l1 ? { l1 } : {}),
    ...(l2 ? { l2 } : {}),
    ...(l3 ? { l3 } : {}),
  };
}
