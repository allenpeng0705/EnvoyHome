// Pre-compaction flush write policy (Memory Design §8.1). V-MEM-8, V-MEM-21.

import { RAW_SOFT_CAP } from "./bootstrap-inject.js";
import type { LearnQueue, PendingLearnKind } from "./learn-queue.js";
import { provenanceLine, stampProvenance, type ProvenanceTrust } from "./provenance.js";
import type { StandingStore } from "./standing-store.js";
import { mayDirectStandingWrite } from "./taint.js";

export type FlushTarget = "l3" | "l2" | "l1" | "skill";

export interface FlushItem {
  target: FlushTarget;
  text: string;
  /** Profile key when target=l1. */
  key?: string;
  /** Skill path when target=skill. */
  skillPath?: string;
  summary?: string;
}

export interface FlushContext {
  accountId: string;
  trust: ProvenanceTrust;
  flushEnabled: boolean;
  turnId?: string;
  now?: Date;
}

export interface FlushResult {
  /** True when flush ran (or was skipped without error). Never blocks compact. */
  ok: true;
  skipped: boolean;
  reason?: string;
  directWrites: Array<"l2" | "l3">;
  pendingLearnIds: string[];
  rejectedFull: boolean;
}

/**
 * Apply flush items per §8.1. Compact callers MUST continue even if skipped/failed.
 * - untrusted → PendingLearn or drop (no direct L2/L3)
 * - L1/skill → always PendingLearn
 * - L3/L2 → direct only when trust ∈ {owner,agent} AND under rawSoftCap
 */
export async function applyFlush(
  store: StandingStore,
  queue: LearnQueue,
  ctx: FlushContext,
  items: FlushItem[],
): Promise<FlushResult> {
  if (!ctx.flushEnabled) {
    return {
      ok: true,
      skipped: true,
      reason: "flush_disabled",
      directWrites: [],
      pendingLearnIds: [],
      rejectedFull: false,
    };
  }

  const pendingLearnIds: string[] = [];
  const directWrites: Array<"l2" | "l3"> = [];
  let rejectedFull = false;
  const now = ctx.now ?? new Date();
  const prov = stampProvenance("flush", ctx.trust, {
    ...(ctx.turnId !== undefined ? { turnId: ctx.turnId } : {}),
    now,
  });

  for (const item of items) {
    const text = item.text.trim();
    if (!text) continue;

    const line = `${text}\n${provenanceLine(prov)}`;

    if (item.target === "l1" || item.target === "skill") {
      const kind: PendingLearnKind =
        item.target === "l1" ? "profile_patch" : "skill_create";
      const targetPath =
        item.target === "l1" ? "profile.json" : (item.skillPath ?? "skills/proposed.md");
      const loaded = await store.load(ctx.accountId);
      const current =
        item.target === "l1"
          ? JSON.stringify(loaded.profile)
          : "";
      const proposed = await queue.propose({
        accountId: ctx.accountId,
        kind,
        targetPath,
        payload: text,
        summary: item.summary ?? text.slice(0, 120),
        trust: ctx.trust,
        currentContent: current,
        ...(ctx.turnId !== undefined ? { sourceTurnId: ctx.turnId } : {}),
        ...(item.key !== undefined ? { profileKey: item.key } : {}),
        now,
      });
      if (proposed.ok) pendingLearnIds.push(proposed.learn.id);
      else rejectedFull = true;
      continue;
    }

    // L2 / L3
    if (!mayDirectStandingWrite(ctx.trust)) {
      const targetPath = item.target === "l2" ? "MEMORY.md" : `memory/${today(now)}.md`;
      const loaded = await store.load(ctx.accountId);
      const current =
        item.target === "l2"
          ? loaded.memoryMd
          : (loaded.dailies.get(today(now)) ?? "");
      const proposed = await queue.propose({
        accountId: ctx.accountId,
        kind: "memory_append",
        targetPath,
        payload: text,
        summary: item.summary ?? text.slice(0, 120),
        trust: ctx.trust,
        currentContent: current,
        ...(ctx.turnId !== undefined ? { sourceTurnId: ctx.turnId } : {}),
        now,
      });
      if (proposed.ok) pendingLearnIds.push(proposed.learn.id);
      else rejectedFull = true;
      continue;
    }

    if (item.target === "l3") {
      const loaded = await store.load(ctx.accountId);
      const day = today(now);
      const current = loaded.dailies.get(day) ?? "";
      if (current.length + line.length > RAW_SOFT_CAP.l3) {
        const proposed = await queue.propose({
          accountId: ctx.accountId,
          kind: "memory_append",
          targetPath: `memory/${day}.md`,
          payload: text,
          summary: item.summary ?? "flush L3 over cap",
          trust: ctx.trust,
          currentContent: current,
          ...(ctx.turnId !== undefined ? { sourceTurnId: ctx.turnId } : {}),
          now,
        });
        if (proposed.ok) pendingLearnIds.push(proposed.learn.id);
        else rejectedFull = true;
      } else {
        await store.appendDaily(ctx.accountId, line, now);
        directWrites.push("l3");
      }
    } else {
      // l2
      const loaded = await store.load(ctx.accountId);
      if (loaded.memoryMd.length + line.length > RAW_SOFT_CAP.l2) {
        const proposed = await queue.propose({
          accountId: ctx.accountId,
          kind: "memory_append",
          targetPath: "MEMORY.md",
          payload: text,
          summary: item.summary ?? "flush L2 over cap",
          trust: ctx.trust,
          currentContent: loaded.memoryMd,
          ...(ctx.turnId !== undefined ? { sourceTurnId: ctx.turnId } : {}),
          now,
        });
        if (proposed.ok) pendingLearnIds.push(proposed.learn.id);
        else rejectedFull = true;
      } else {
        await store.appendMemory(ctx.accountId, line, "## Standing");
        directWrites.push("l2");
      }
    }
  }

  return {
    ok: true,
    skipped: false,
    directWrites,
    pendingLearnIds,
    rejectedFull,
  };
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}
