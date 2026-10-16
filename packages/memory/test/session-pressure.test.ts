// Memory Design §8 — OpenClaw-aligned session pressure thresholds.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_RESERVE_TOKENS,
  DEFAULT_SOFT_MARGIN_TOKENS,
  FORCE_FLUSH_TRANSCRIPT_BYTES,
  planSessionPressure,
  pressureThresholds,
} from "../dist/session-pressure.js";
import {
  MIN_KEEP_LINES,
  UNKNOWN_CONTEXT_HISTORY_BUDGET_TOKENS,
  compactTranscriptLines,
  flushItemsFromDropped,
  flushItemsFromOldestHalf,
  historyBudgetForPressure,
  isDurableFlushCandidate,
} from "../dist/session-compact.js";

test("pressureThresholds: 128k matches OpenClaw-style reserve + soft margin", () => {
  const t = pressureThresholds(128_000)!;
  assert.equal(t.reserveTokens, DEFAULT_RESERVE_TOKENS);
  assert.equal(t.compactThresholdTokens, 128_000 - DEFAULT_RESERVE_TOKENS);
  assert.equal(t.softThresholdTokens, t.compactThresholdTokens - DEFAULT_SOFT_MARGIN_TOKENS);
});

test("pressureThresholds: small window caps reserve at ¼", () => {
  const t = pressureThresholds(8_192)!;
  assert.equal(t.reserveTokens, 2_048);
  assert.equal(t.compactThresholdTokens, 8_192 - 2_048);
});

test("planSessionPressure: soft flush then compact", () => {
  const ctx = 32_768;
  const t = pressureThresholds(ctx)!;
  const softLine = "x".repeat(t.softThresholdTokens * 4);
  const soft = planSessionPressure({
    contextTokens: ctx,
    history: [{ role: "user", text: softLine }],
    newUserText: "hi",
    standingInjectText: "",
  });
  assert.equal(soft.needFlush, true);
  assert.equal(soft.needCompact, false);

  const compactLine = "y".repeat(t.compactThresholdTokens * 4);
  const hard = planSessionPressure({
    contextTokens: ctx,
    history: [{ role: "user", text: compactLine }],
    newUserText: "hi",
    standingInjectText: "",
    alreadyFlushedThisCycle: true,
  });
  assert.equal(hard.needFlush, false);
  assert.equal(hard.needCompact, true);
});

test("planSessionPressure: unknown context skips token triggers", () => {
  const p = planSessionPressure({
    history: [{ role: "user", text: "x".repeat(100_000) }],
    newUserText: "hi",
  });
  assert.equal(p.needFlush, false);
  assert.equal(p.needCompact, false);
  assert.equal(p.reason, "unknown_context");
});

test("planSessionPressure: byte-force flush+compact same turn", () => {
  const big = [{ role: "user", text: "z".repeat(FORCE_FLUSH_TRANSCRIPT_BYTES) }];
  const first = planSessionPressure({
    history: big,
    newUserText: "hi",
    forceFlushTranscriptBytes: FORCE_FLUSH_TRANSCRIPT_BYTES,
  });
  assert.equal(first.needFlush, true);
  assert.equal(first.needCompact, true);

  const second = planSessionPressure({
    history: big,
    newUserText: "hi",
    alreadyFlushedThisCycle: true,
    forceFlushTranscriptBytes: FORCE_FLUSH_TRANSCRIPT_BYTES,
  });
  assert.equal(second.needFlush, false);
  assert.equal(second.needCompact, true);
});

test("isDurableFlushCandidate rejects sensitive / chatter; accepts prefs", () => {
  assert.equal(isDurableFlushCandidate("ok"), false);
  assert.equal(isDurableFlushCandidate("Please unlock the front door now thanks"), false);
  assert.equal(
    isDurableFlushCandidate("I prefer oat milk and I have a peanut allergy"),
    true,
  );
  assert.equal(
    isDurableFlushCandidate("- My kids bedtime is 20:30 on school nights always prefer quiet"),
    true,
  );
  // Bare always/never / I am / bullets without cues must not park chatter.
  assert.equal(
    isDurableFlushCandidate("I'll always be happy to help with anything you need"),
    false,
  );
  assert.equal(
    isDurableFlushCandidate("I never mind waiting a bit longer for the reply today"),
    false,
  );
  assert.equal(
    isDurableFlushCandidate("I am going to the store later this afternoon for groceries"),
    false,
  );
  assert.equal(
    isDurableFlushCandidate("- random bullet about the weather forecast for tomorrow"),
    false,
  );
  assert.equal(
    isDurableFlushCandidate("I always prefer quiet mornings before nine o'clock"),
    true,
  );
  assert.equal(
    isDurableFlushCandidate("Please always use dark mode on my dashboard screens"),
    true,
  );
  assert.equal(
    isDurableFlushCandidate("My name is Allen and my timezone is America/Los_Angeles"),
    true,
  );
});

test("flushItemsFromDropped filters non-durable lines", () => {
  const items = flushItemsFromDropped([
    { role: "user", text: "hi" },
    { role: "user", text: "I prefer quiet mornings and hate loud alarms at dawn" },
    { role: "assistant", text: "The lock is unlocked and camera shows motion" },
  ]);
  assert.equal(items.length, 1);
  assert.match(items[0]!.text, /prefer quiet/);
});

test("historyBudgetForPressure: soft-only tighter than compact; unknown is fixed", () => {
  const ctx = 32_768;
  const softBudget = historyBudgetForPressure({
    needCompact: false,
    contextTokens: ctx,
    standingInjectText: "",
    newUserText: "hi",
  });
  const compactBudget = historyBudgetForPressure({
    needCompact: true,
    contextTokens: ctx,
    standingInjectText: "",
    newUserText: "hi",
  });
  assert.ok(softBudget < compactBudget, `soft ${softBudget} < compact ${compactBudget}`);
  assert.equal(
    historyBudgetForPressure({ needCompact: true, newUserText: "hi" }),
    UNKNOWN_CONTEXT_HISTORY_BUDGET_TOKENS,
  );
});

test("soft-threshold budget drops durable prefix (soft-only flush writes)", () => {
  const ctx = 32_768;
  const t = pressureThresholds(ctx)!;
  // Land ~1.5k tokens into the soft-only zone (above soft, below compact).
  const filler = "x".repeat(Math.floor((t.softThresholdTokens + 1_500) * 4));
  const durable =
    "I prefer oat milk in the morning and I have a peanut allergy noted for cooks";
  const lines = [
    { role: "user", text: durable },
    { role: "assistant", text: "Got it, I'll remember your preference." },
    { role: "user", text: filler },
    { role: "assistant", text: "continuing the long work session with more detail here" },
  ];
  const softBudget = historyBudgetForPressure({
    needCompact: false,
    contextTokens: ctx,
    standingInjectText: "",
    newUserText: "hi",
  });
  const compactBudget = historyBudgetForPressure({
    needCompact: true,
    contextTokens: ctx,
    standingInjectText: "",
    newUserText: "hi",
  });
  const softPreview = compactTranscriptLines(lines, softBudget);
  const compactPreview = compactTranscriptLines(lines, compactBudget);
  // Soft budget must drop the durable prefix; compact budget keeps everything.
  assert.ok(softPreview.dropped.length > 0, "soft preview should drop");
  assert.ok(softPreview.flushItems.length >= 1, "soft flush should find durable items");
  assert.match(softPreview.flushItems[0]!.text, /prefer oat milk/);
  assert.equal(compactPreview.dropped.length, 0, "compact budget should keep all in soft zone");
});

test("flushItemsFromOldestHalf recovers durable when soft preview empty", () => {
  const lines = [
    {
      role: "user",
      text: "I prefer dark mode and my timezone is America/Los_Angeles for calendars",
    },
    { role: "assistant", text: "noted" },
    { role: "user", text: "what's the weather" },
    { role: "assistant", text: "sunny" },
  ];
  const items = flushItemsFromOldestHalf(lines);
  assert.equal(items.length, 1);
  assert.match(items[0]!.text, /prefer dark mode/);
});

test("compactTranscriptLines keeps at least MIN_KEEP_LINES when possible", () => {
  const lines = [];
  for (let i = 0; i < 20; i++) {
    lines.push({
      role: i % 2 === 0 ? "user" : "assistant",
      text: `turn-${i} I prefer item ${i} as a standing preference note`,
    });
  }
  const result = compactTranscriptLines(lines, 200);
  assert.ok(result.dropped.length > 0);
  // kept = summary + tail; tail should be >= MIN_KEEP_LINES when input is long enough
  // summary + at least MIN_KEEP_LINES content lines
  assert.ok(
    result.kept.length >= MIN_KEEP_LINES + 1,
    `kept ${result.kept.length}, want >= ${MIN_KEEP_LINES + 1}`,
  );
  assert.equal(result.kept[0]?.kind, "compaction_summary");
  assert.ok(result.flushItems.length >= 1);
});

test("compactTranscriptLines force-trims tiny over-budget sessions", () => {
  const lines = [
    { role: "user", text: "a".repeat(4000) },
    { role: "assistant", text: "b".repeat(4000) },
    { role: "user", text: "c".repeat(4000) },
  ];
  const result = compactTranscriptLines(lines, 100);
  assert.ok(result.dropped.length > 0);
  assert.ok(result.kept.length >= 1);
});
