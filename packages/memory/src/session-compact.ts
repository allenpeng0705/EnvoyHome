// L0 session transcript compact + tool-only flush plan (Memory Design §8).
// Summarize/drop oldest turns; extract durable-looking flush items for L3.

import type { FlushItem } from "./flush.js";
import {
  estimateTextTokens,
  estimateTranscriptTokens,
  lineText,
  pressureThresholds,
  type TranscriptLineLike,
} from "./session-pressure.js";

const MAX_FLUSH_ITEMS = 12;
const MIN_FLUSH_CHARS = 40;
const MAX_FLUSH_CHARS = 500;
/** Always keep at least this many trailing transcript lines when possible. */
export const MIN_KEEP_LINES = 4;
/** When the whole session is shorter than MIN_KEEP_LINES, keep at least this many. */
const FORCE_KEEP_LINES = 2;

/** Home-actuation / presence cues — not ordinary words like "alarms" (clock). */
const SENSITIVE_RE =
  /\b(unlock|lock the|door lock|alarm_control|entity_id|ha_call|mqtt_|camera shows|occupancy|presence sensor|armed|disarmed|door (is|was)|motion sensor)\b/i;
const TOOLISH_RE = /^\s*\{[\s\S]*["']tool["']|\btool_result\b|\bargsDigest\b|\btool_call\b/i;
/**
 * Anchored durable cues for automatic L3 parking (v1 tool-only flush).
 * Deliberately narrow: bare "I am/I'm/always/never" match too much ordinary chat.
 */
const DURABLE_RE =
  /\b(prefer|preference|allerg(?:y|ic|ies)?|my name is|call me|i(?:'m| am) (?:allergic|vegetarian|vegan|celiac)|remember that|i always (?:prefer|remember|want)|i never (?:prefer|want|eat|drink)|always prefer|never prefer|please (?:always|never)|(?:my )?birthday|my timezone|timezone is|my locale|i live (?:in|at)|spouse|partner|(?:my )?(?:kids?|child|children)|gluten[- ]free|lactose|dietary)\b/i;
const CHATTER_RE = /^(ok|okay|thanks|thank you|sure|yes|no|hi|hello|hey|继续|好的|嗯)\b/i;

export interface CompactTranscriptResult {
  kept: Record<string, unknown>[];
  dropped: Record<string, unknown>[];
  summaryLine: Record<string, unknown>;
  flushItems: FlushItem[];
}

function asRecord(line: TranscriptLineLike): Record<string, unknown> {
  return { ...(line as Record<string, unknown>) };
}

/** True when text looks safe + durable enough for automatic L3 parking. */
export function isDurableFlushCandidate(text: string): boolean {
  const t = text.trim();
  if (t.length < MIN_FLUSH_CHARS) return false;
  if (SENSITIVE_RE.test(t) || TOOLISH_RE.test(t)) return false;
  if (CHATTER_RE.test(t)) return false;
  // Questions stay out unless they also carry a durable cue (rare).
  if (/\?\s*$/.test(t) && !DURABLE_RE.test(t)) return false;
  // Bullets / free chat need an anchored durable cue — no bare I-am / always.
  return DURABLE_RE.test(t);
}

/**
 * Heuristic tool-only flush plan from lines about to be dropped.
 * Prefer parking in L3 (Memory Design §8.1); skip sensitive / tool / chatter.
 */
export function flushItemsFromDropped(dropped: TranscriptLineLike[]): FlushItem[] {
  const items: FlushItem[] = [];
  for (const line of dropped) {
    if (items.length >= MAX_FLUSH_ITEMS) break;
    const role = String(line.role ?? "");
    if (role !== "user" && role !== "assistant") continue;
    if (line.kind === "compaction_summary") continue;
    const text = lineText(line).trim();
    if (!isDurableFlushCandidate(text)) continue;
    const clipped = text.length > MAX_FLUSH_CHARS ? `${text.slice(0, MAX_FLUSH_CHARS)}…` : text;
    items.push({
      target: "l3",
      text: clipped,
      summary: clipped.slice(0, 120),
    });
  }
  return items;
}

/**
 * Soft-flush fallback when a soft-threshold preview drops nothing:
 * scan the oldest half of the transcript for durable lines (do not rewrite).
 */
export function flushItemsFromOldestHalf(lines: TranscriptLineLike[]): FlushItem[] {
  if (lines.length === 0) return [];
  const n = Math.max(1, Math.floor(lines.length / 2));
  return flushItemsFromDropped(lines.slice(0, n));
}

/** Fixed keep window when contextTokens is unknown (byte-force compact). */
export const UNKNOWN_CONTEXT_HISTORY_BUDGET_TOKENS = 512;

/**
 * History keep-budget for §8 previews.
 * Soft-only uses the tighter soft threshold so the drop-set is non-empty;
 * compact / byte-force use the compact threshold (or a fixed small window
 * when contextTokens is unknown).
 */
export function historyBudgetForPressure(input: {
  needCompact: boolean;
  contextTokens?: number;
  standingInjectText?: string;
  newUserText?: string;
  /** Keep window when context is unknown (byte-force). */
  unknownContextBudgetTokens?: number;
}): number {
  const unknownBudget =
    input.unknownContextBudgetTokens ?? UNKNOWN_CONTEXT_HISTORY_BUDGET_TOKENS;
  const inject = estimateTextTokens(input.standingInjectText ?? "");
  const user = estimateTextTokens(input.newUserText ?? "");
  const thresholds = pressureThresholds(input.contextTokens ?? 0);
  if (!thresholds) return Math.max(64, unknownBudget);
  const target = input.needCompact
    ? thresholds.compactThresholdTokens
    : thresholds.softThresholdTokens;
  return Math.max(64, target - inject - user - 16);
}

function summarizeDropped(dropped: TranscriptLineLike[], maxChars: number): string {
  const bits: string[] = [];
  const budget = Math.max(80, maxChars);
  for (const line of dropped) {
    const role = String(line.role ?? "msg");
    const text = lineText(line).trim().replace(/\s+/g, " ");
    if (!text) continue;
    bits.push(`${role}: ${text.slice(0, 120)}`);
    if (bits.join(" ").length > budget) break;
  }
  const body = bits.join(" · ") || "(no text)";
  const head = `Earlier turns compacted (${dropped.length} lines): `;
  const combined = head + body;
  return combined.length > budget + head.length
    ? combined.slice(0, budget + head.length) + "…"
    : combined;
}

/**
 * Keep a trailing window that fits `historyBudgetTokens`; drop the prefix.
 * Always preserves at least {@link MIN_KEEP_LINES} trailing lines when possible.
 */
export function compactTranscriptLines(
  lines: TranscriptLineLike[],
  historyBudgetTokens: number,
): CompactTranscriptResult {
  const records = lines.map(asRecord);
  if (records.length === 0) {
    return {
      kept: [],
      dropped: [],
      summaryLine: {
        role: "system",
        kind: "compaction_summary",
        text: "Session compacted (empty).",
        at: new Date().toISOString(),
      },
      flushItems: [],
    };
  }

  const budget = Math.max(64, Math.floor(historyBudgetTokens));
  // Reserve room for the compaction summary so MIN_KEEP_LINES stays meaningful.
  const summaryReserveTokens = Math.min(80, Math.max(24, Math.floor(budget / 4)));
  const tailBudget = Math.max(32, budget - summaryReserveTokens);
  let keepFrom = records.length;
  let used = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    const cost = estimateTextTokens(lineText(records[i]!)) + 4;
    // Lines already selected are strictly after i.
    const alreadyKept = records.length - 1 - i;
    if (used + cost > tailBudget && alreadyKept >= MIN_KEEP_LINES) {
      keepFrom = i + 1;
      break;
    }
    used += cost;
    keepFrom = i;
  }

  // If everything still fits, no compact.
  if (keepFrom <= 0 && estimateTranscriptTokens(records) <= budget) {
    return {
      kept: records,
      dropped: [],
      summaryLine: {
        role: "system",
        kind: "compaction_summary",
        text: "Session within budget.",
        at: new Date().toISOString(),
      },
      flushItems: [],
    };
  }

  // Over budget but too few lines to satisfy MIN_KEEP — still force a trim.
  if (keepFrom <= 0 && estimateTranscriptTokens(records) > budget) {
    const keepN = Math.min(FORCE_KEEP_LINES, records.length);
    keepFrom = Math.max(0, records.length - keepN);
  }

  const dropped = records.slice(0, keepFrom);
  const keptTail = records.slice(keepFrom);
  if (dropped.length === 0) {
    return {
      kept: records,
      dropped: [],
      summaryLine: {
        role: "system",
        kind: "compaction_summary",
        text: "Session within budget.",
        at: new Date().toISOString(),
      },
      flushItems: [],
    };
  }

  const summaryText = summarizeDropped(dropped, summaryReserveTokens * 4);
  const summaryLine: Record<string, unknown> = {
    role: "system",
    kind: "compaction_summary",
    text: summaryText,
    at: new Date().toISOString(),
  };
  const minContent = Math.min(MIN_KEEP_LINES, keptTail.length);
  // Ensure summary + tail still fit; never trim content below minContent.
  let kept = [summaryLine, ...keptTail];
  while (
    kept.length > 1 + minContent &&
    estimateTranscriptTokens(kept) > budget
  ) {
    kept = [summaryLine, ...kept.slice(2)];
  }

  return {
    kept,
    dropped,
    summaryLine,
    flushItems: flushItemsFromDropped(dropped),
  };
}
