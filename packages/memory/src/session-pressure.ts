// Mid-session context pressure — Memory Design §8 (Adopt OpenClaw Gateway flush).
// Daemon owns thresholds; harness does not own standing-memory flush.

import { CHARS_PER_TOKEN } from "./inject-profiles.js";

/** OpenClaw-style default reserve (capped at ¼ of the window). */
export const DEFAULT_RESERVE_TOKENS = 20_000;
/** Soft margin below the compact threshold that triggers an early flush. */
export const DEFAULT_SOFT_MARGIN_TOKENS = 4_000;
/** Force a flush when the on-disk transcript grows this large (OpenClaw ~2 MiB). */
export const FORCE_FLUSH_TRANSCRIPT_BYTES = 2 * 1024 * 1024;

export interface SessionPressurePlan {
  /** Silent flush before compact / early soft threshold (once per compaction cycle). */
  needFlush: boolean;
  /** Rewrite L0 transcript so the next prompt fits. */
  needCompact: boolean;
  /** Estimated tokens for standing inject + history + new user text. */
  estimatedTokens: number;
  contextTokens: number;
  reserveTokens: number;
  softThresholdTokens: number;
  compactThresholdTokens: number;
  transcriptBytes: number;
  reason: string;
}

export interface TranscriptLineLike {
  role?: unknown;
  text?: unknown;
  content?: unknown;
  kind?: unknown;
}

export function estimateTextTokens(text: string): number {
  return Math.max(0, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export function lineText(line: TranscriptLineLike): string {
  if (typeof line.text === "string") return line.text;
  if (typeof line.content === "string") return line.content;
  return "";
}

export function estimateTranscriptTokens(lines: TranscriptLineLike[]): number {
  let total = 0;
  for (const line of lines) {
    total += estimateTextTokens(lineText(line)) + 4; // role / framing overhead
  }
  return total;
}

export function estimateTranscriptBytes(lines: TranscriptLineLike[]): number {
  let n = 0;
  for (const line of lines) {
    n += lineText(line).length + 32;
  }
  return n;
}

/**
 * OpenClaw-aligned thresholds for a known context window.
 * Unknown / non-positive context → no token-triggered maintenance (byte force still applies).
 */
export function pressureThresholds(contextTokens: number): {
  reserveTokens: number;
  softThresholdTokens: number;
  compactThresholdTokens: number;
} | undefined {
  if (!Number.isFinite(contextTokens) || contextTokens <= 0) return undefined;
  const reserveTokens = Math.min(
    DEFAULT_RESERVE_TOKENS,
    Math.max(1, Math.floor(contextTokens / 4)),
  );
  const compactThresholdTokens = Math.max(1, contextTokens - reserveTokens);
  const softMargin = Math.min(
    DEFAULT_SOFT_MARGIN_TOKENS,
    Math.max(0, Math.floor((contextTokens - reserveTokens) / 2)),
  );
  const softThresholdTokens = Math.max(1, compactThresholdTokens - softMargin);
  return { reserveTokens, softThresholdTokens, compactThresholdTokens };
}

/**
 * Decide flush / compact before the next model call (Daemon / Gateway role).
 * `alreadyFlushedThisCycle` mirrors OpenClaw's once-per-compaction-cycle flush.
 */
export function planSessionPressure(input: {
  contextTokens?: number;
  standingInjectText?: string;
  history: TranscriptLineLike[];
  newUserText: string;
  alreadyFlushedThisCycle?: boolean;
  forceFlushTranscriptBytes?: number;
}): SessionPressurePlan {
  const historyTokens = estimateTranscriptTokens(input.history);
  const injectTokens = estimateTextTokens(input.standingInjectText ?? "");
  const userTokens = estimateTextTokens(input.newUserText);
  const estimatedTokens = historyTokens + injectTokens + userTokens + 8;
  const transcriptBytes = estimateTranscriptBytes(input.history);
  const forceBytes = input.forceFlushTranscriptBytes ?? FORCE_FLUSH_TRANSCRIPT_BYTES;
  const thresholds = pressureThresholds(input.contextTokens ?? 0);
  const already = input.alreadyFlushedThisCycle === true;
  const byteForce = forceBytes > 0 && transcriptBytes >= forceBytes;

  if (!thresholds) {
    if (byteForce) {
      // Same-turn flush+compact (do not wait for a second turn).
      return {
        needFlush: !already,
        needCompact: true,
        estimatedTokens,
        contextTokens: 0,
        reserveTokens: 0,
        softThresholdTokens: 0,
        compactThresholdTokens: 0,
        transcriptBytes,
        reason: already ? "compact_bytes" : "flush_and_compact_bytes",
      };
    }
    return {
      needFlush: false,
      needCompact: false,
      estimatedTokens,
      contextTokens: 0,
      reserveTokens: 0,
      softThresholdTokens: 0,
      compactThresholdTokens: 0,
      transcriptBytes,
      reason: "unknown_context",
    };
  }

  const { reserveTokens, softThresholdTokens, compactThresholdTokens } = thresholds;
  const base = {
    estimatedTokens,
    contextTokens: input.contextTokens!,
    reserveTokens,
    softThresholdTokens,
    compactThresholdTokens,
    transcriptBytes,
  };

  if (estimatedTokens >= compactThresholdTokens || byteForce) {
    return {
      ...base,
      needFlush: !already,
      needCompact: true,
      reason: byteForce ? "compact_bytes" : "compact",
    };
  }
  if (estimatedTokens >= softThresholdTokens && !already) {
    return { ...base, needFlush: true, needCompact: false, reason: "soft_flush" };
  }
  return { ...base, needFlush: false, needCompact: false, reason: "ok" };
}
