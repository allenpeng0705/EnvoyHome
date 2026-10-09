// Weighted multi-property model score (Design §8.3 locked formula).

import type { NeedClass } from "./need-class.js";
import type { Placement } from "./mix-router.js";

export type LatencyClass = "fast" | "standard" | "slow";

export interface ModelProfile {
  placement: Placement;
  /** True when kind is cloud_* (capability bump if paramCount unknown). */
  cloudKind?: boolean;
  costRank?: number;
  cost?: { inputPerMTok?: number; outputPerMTok?: number };
  paramCountB?: number;
  capabilityRank?: number;
  latencyClass?: LatencyClass;
  contextTokens?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsLogprobs?: boolean;
}

export interface ScoredCandidate<T> {
  item: T;
  profile: ModelProfile;
  capabilityNorm: number;
  costNorm: number;
  latencyNorm: number;
  score: number;
}

const WEIGHTS: Record<NeedClass, { wCap: number; wCost: number; wLat: number; floor: number }> = {
  cheap: { wCap: 0.35, wCost: 0.45, wLat: 0.2, floor: 0.25 },
  standard: { wCap: 0.55, wCost: 0.25, wLat: 0.2, floor: 0.45 },
  hard: { wCap: 0.8, wCost: 0.05, wLat: 0.15, floor: 0.7 },
};

function capabilityNorm(p: ModelProfile): number {
  if (typeof p.capabilityRank === "number" && Number.isFinite(p.capabilityRank)) {
    // Treat capabilityRank as already ~0–100 scale if > 1, else 0–1.
    const raw = p.capabilityRank > 1 ? p.capabilityRank / 100 : p.capabilityRank;
    return Math.min(1, Math.max(0, raw));
  }
  const b = p.paramCountB;
  let n: number;
  if (typeof b !== "number" || !Number.isFinite(b)) {
    n = p.cloudKind ? 0.55 : 0.3;
  } else if (b < 8) n = 0.3;
  else if (b < 30) n = 0.55;
  else if (b < 70) n = 0.75;
  else n = 0.95;
  if (p.cloudKind && (typeof b !== "number" || !Number.isFinite(b))) {
    n = Math.min(1, n + 0.05);
  }
  return n;
}

function midCost(p: ModelProfile): number | undefined {
  const c = p.cost;
  if (!c) return undefined;
  const a = c.inputPerMTok;
  const b = c.outputPerMTok;
  if (typeof a === "number" && typeof b === "number") return (a + b) / 2;
  if (typeof a === "number") return a;
  if (typeof b === "number") return b;
  return undefined;
}

function latencyNorm(p: ModelProfile): number {
  if (p.latencyClass === "fast") return 1;
  if (p.latencyClass === "slow") return 0.3;
  return 0.6;
}

/**
 * Score candidates; return only those meeting the needClass capability floor,
 * sorted best-first. If none meet the floor, return best overall (fail-soft quality).
 */
export function rankByNeedClass<T>(
  needClass: NeedClass,
  candidates: Array<{ item: T; profile: ModelProfile }>,
): ScoredCandidate<T>[] {
  if (candidates.length === 0) return [];
  const w = WEIGHTS[needClass];

  const mids = candidates.map((c) => midCost(c.profile)).filter((x): x is number => x !== undefined);
  const maxMid = mids.length > 0 ? Math.max(...mids, 1e-9) : undefined;
  const ranks = candidates
    .map((c) => c.profile.costRank)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const maxRank = ranks.length > 0 ? Math.max(...ranks, 1e-9) : undefined;

  const scored: ScoredCandidate<T>[] = candidates.map((c) => {
    const cap = capabilityNorm(c.profile);
    const mid = midCost(c.profile);
    let costN: number;
    if (mid !== undefined && maxMid !== undefined) {
      costN = 1 - mid / maxMid;
    } else if (typeof c.profile.costRank === "number" && maxRank !== undefined) {
      costN = 1 - c.profile.costRank / maxRank;
    } else {
      costN = 0.5;
    }
    costN = Math.min(1, Math.max(0, costN));
    const lat = latencyNorm(c.profile);
    const score = w.wCap * cap + w.wCost * costN + w.wLat * lat;
    return {
      item: c.item,
      profile: c.profile,
      capabilityNorm: cap,
      costNorm: costN,
      latencyNorm: lat,
      score,
    };
  });

  const meeting = scored.filter((s) => s.capabilityNorm >= w.floor);
  const pool = meeting.length > 0 ? meeting : scored;

  // Best score; then higher capability; then higher costNorm (cheaper).
  pool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.capabilityNorm !== a.capabilityNorm) return b.capabilityNorm - a.capabilityNorm;
    return b.costNorm - a.costNorm;
  });

  return pool;
}
