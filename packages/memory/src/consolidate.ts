// Consolidation + compactMemory orchestration (Memory Design §9).
// Flush-before-compact when enabled; skip does not block (V-MEM-8).

import { CompactDiary, compactPaths } from "./compact-diary.js";
import { applyFlush, type FlushItem, type FlushResult } from "./flush.js";
import type { LearnQueue } from "./learn-queue.js";
import { provenanceLine, stampProvenance, type ProvenanceTrust } from "./provenance.js";
import type { StandingStore } from "./standing-store.js";
import { mayDirectStandingWrite } from "./taint.js";
import { RAW_SOFT_CAP } from "./bootstrap-inject.js";

export interface CompactOptions {
  accountId: string;
  trust: ProvenanceTrust;
  flushEnabled: boolean;
  /** Extracted facts the silent flush / consolidate pass wants to persist. */
  flushItems?: FlushItem[];
  /** Safe L3 appends from consolidate itself. */
  consolidateNotes?: string[];
  turnId?: string;
  now?: Date;
  /** When true, simulate flush failure — compact must still succeed (V-MEM-8). */
  simulateFlushFailure?: boolean;
}

export interface CompactResult {
  ok: true;
  pendingLearnIds: string[];
  compactSummaryPath: string;
  flush: FlushResult | { ok: true; skipped: true; reason: string };
  event: "home:memory-compacted";
}

export async function compactMemory(
  store: StandingStore,
  queue: LearnQueue,
  diary: CompactDiary,
  opts: CompactOptions,
): Promise<CompactResult> {
  const now = opts.now ?? new Date();
  let flushResult: FlushResult | { ok: true; skipped: true; reason: string };

  // V-MEM-8: flush runs before compact when enabled; failure/skip does not block.
  try {
    if (opts.simulateFlushFailure) {
      throw new Error("simulated flush failure");
    }
    flushResult = await applyFlush(store, queue, {
      accountId: opts.accountId,
      trust: opts.trust,
      flushEnabled: opts.flushEnabled,
      ...(opts.turnId !== undefined ? { turnId: opts.turnId } : {}),
      now,
    }, opts.flushItems ?? []);
  } catch (err) {
    flushResult = {
      ok: true,
      skipped: true,
      reason: `flush_error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const pendingLearnIds = [
    ...("pendingLearnIds" in flushResult ? flushResult.pendingLearnIds : []),
  ];
  const prov = stampProvenance("consolidate", opts.trust, {
    ...(opts.turnId !== undefined ? { turnId: opts.turnId } : {}),
    now,
  });

  // Consolidate notes: L3 when trusted+under cap; else pending. L1/L2 → pending or safe L2.
  for (const note of opts.consolidateNotes ?? []) {
    const text = note.trim();
    if (!text) continue;
    const line = `${text}\n${provenanceLine(prov)}`;
    if (mayDirectStandingWrite(opts.trust)) {
      const loaded = await store.load(opts.accountId);
      const day = now.toISOString().slice(0, 10);
      const current = loaded.dailies.get(day) ?? "";
      if (current.length + line.length <= RAW_SOFT_CAP.l3) {
        await store.appendDaily(opts.accountId, line, now);
        continue;
      }
    }
    const loaded = await store.load(opts.accountId);
    const day = now.toISOString().slice(0, 10);
    const proposed = await queue.propose({
      accountId: opts.accountId,
      kind: "memory_append",
      targetPath: `memory/${day}.md`,
      payload: text,
      summary: text.slice(0, 120),
      trust: opts.trust,
      currentContent: loaded.dailies.get(day) ?? "",
      ...(opts.turnId !== undefined ? { sourceTurnId: opts.turnId } : {}),
      now,
    });
    if (proposed.ok) pendingLearnIds.push(proposed.learn.id);
  }

  const summary = [
    `Consolidate at ${now.toISOString()}`,
    `trust=${opts.trust}`,
    `flush=${flushResult.skipped ? `skipped(${(flushResult as { reason?: string }).reason ?? ""})` : "ran"}`,
    `pending=${pendingLearnIds.length}`,
  ].join("; ");

  const { compactSummaryPath } = await diary.append(opts.accountId, {
    at: now.toISOString(),
    summary,
    pendingLearnIds,
  });

  return {
    ok: true,
    pendingLearnIds,
    compactSummaryPath,
    flush: flushResult,
    event: "home:memory-compacted",
  };
}

export function makeCompactDiary(store: StandingStore): CompactDiary {
  return new CompactDiary((accountId) => compactPaths(store.accountRoot(accountId)));
}
