// V-P2-AGENT-6/7/8 — attended plan→execute helpers + complexity corpus.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SessionStore,
  buildSessionPlan,
  confirmSessionPlan,
  homePaths,
  looksLikeComplexHomeTask,
  normalizePlanEntries,
  planNeedsWriteConfirm,
  reviseSessionPlan,
  shouldAutoAdvancePlan,
  shouldEnterPlanPath,
  nextPlanHop,
  withPlanFirstFraming,
  stripPlanFirstFraming,
} from "../dist/index.js";

const SIMPLE = [
  "turn on the living room lights",
  "开灯",
  "remind me at 9am",
  "what's the weather",
  "set thermostat to 22",
  "lock the front door",
  "good morning",
  "list my schedules",
  "help",
  "thank you",
];

const MEDIUM = [
  "summarize today's calendar and then remind me about the dentist",
  "turn off all lights downstairs and set night mode",
  "write a short note about groceries in notes/list.txt",
  "compare these two photos and tell me which is sharper",
  "找一下客厅的温度传感器读数并告诉我",
];

const COMPLEX = [
  "Refactor the entire household automation architecture end-to-end across every room and account",
  "Investigate this home end-to-end and redesign how we migrate all device bindings",
  "Make a multi-phase roadmap to overhaul our whole home routines, documents, and schedules step by step",
  "plan this: audit every device binding, rewrite MEMORY notes, and migrate all workflows",
  "a".repeat(850),
];

test("V-P2-AGENT-6: simple corpus never enters plan path", () => {
  for (const prompt of SIMPLE) {
    assert.equal(looksLikeComplexHomeTask(prompt), false, prompt);
    assert.equal(
      shouldEnterPlanPath({ origin: "attended", prompt }),
      false,
      prompt,
    );
  }
});

test("V-P2-AGENT-6: medium corpus never enters plan path", () => {
  for (const prompt of MEDIUM) {
    assert.equal(looksLikeComplexHomeTask(prompt), false, prompt);
    assert.equal(
      shouldEnterPlanPath({ origin: "attended", prompt }),
      false,
      prompt,
    );
  }
});

test("V-P2-AGENT-6: complex fixtures enter; unattended never", () => {
  for (const prompt of COMPLEX) {
    assert.equal(looksLikeComplexHomeTask(prompt), true, prompt.slice(0, 80));
    assert.equal(
      shouldEnterPlanPath({ origin: "attended", prompt }),
      true,
      prompt.slice(0, 80),
    );
    assert.equal(
      shouldEnterPlanPath({ origin: "unattended", prompt }),
      false,
      prompt.slice(0, 80),
    );
  }
  assert.equal(
    looksLikeComplexHomeTask("short ask", { forcePlan: true }),
    true,
  );
});

test("V-P2-AGENT-7: write/admin needs confirm; read-only auto-executes", () => {
  const readOnly = normalizePlanEntries([
    { content: "Search docs", status: "pending", risk: "read" },
    { content: "Summarize findings", status: "pending", risk: "read" },
  ]);
  assert.equal(planNeedsWriteConfirm(readOnly), false);
  const readPlan = buildSessionPlan({
    entries: readOnly,
    sourceUserText: "big research",
  });
  assert.equal(readPlan.phase, "executing");
  assert.ok(readPlan.confirmedAt);

  const withWrite = normalizePlanEntries([
    { content: "Draft notes", status: "pending", risk: "read" },
    { content: "Write file", status: "pending", risk: "write" },
  ]);
  assert.equal(planNeedsWriteConfirm(withWrite), true);
  const writePlan = buildSessionPlan({
    entries: withWrite,
    sourceUserText: "complex write",
  });
  assert.equal(writePlan.phase, "awaiting_confirm");
  assert.equal(writePlan.confirmedAt, undefined);

  const confirmed = confirmSessionPlan(writePlan, "2026-11-03T00:00:00.000Z");
  assert.equal(confirmed.phase, "executing");
  assert.equal(confirmed.confirmedAt, "2026-11-03T00:00:00.000Z");
  assert.ok((confirmed.confirmedWriteKeys ?? []).length > 0);

  // Same write keys after confirm → stay executing (status update OK).
  const progressed = buildSessionPlan({
    entries: normalizePlanEntries([
      { content: "Draft notes", status: "completed", risk: "read" },
      { content: "Write file", status: "in_progress", risk: "write" },
    ]),
    sourceUserText: "complex write",
    prior: confirmed,
  });
  assert.equal(progressed.phase, "executing");
  assert.equal(progressed.confirmedAt, confirmed.confirmedAt);

  // New write/admin step after confirm → must re-confirm (no silent write).
  const addedWrite = buildSessionPlan({
    entries: normalizePlanEntries([
      { content: "Draft notes", status: "completed", risk: "read" },
      { content: "Write file", status: "completed", risk: "write" },
      { content: "Actuate lock", status: "pending", risk: "admin" },
    ]),
    sourceUserText: "complex write",
    prior: confirmed,
  });
  assert.equal(addedWrite.phase, "awaiting_confirm");
  assert.equal(addedWrite.confirmedAt, undefined);

  // Reopen a settled write step (same fingerprint) → must re-confirm.
  const afterWriteDone = buildSessionPlan({
    entries: normalizePlanEntries([
      { content: "Draft notes", status: "completed", risk: "read" },
      { content: "Write file", status: "completed", risk: "write" },
    ]),
    sourceUserText: "complex write",
    prior: confirmed,
  });
  assert.equal(afterWriteDone.phase, "done");
  const reopened = buildSessionPlan({
    entries: normalizePlanEntries([
      { content: "Draft notes", status: "completed", risk: "read" },
      { content: "Write file", status: "pending", risk: "write" },
    ]),
    sourceUserText: "complex write",
    prior: {
      ...confirmSessionPlan(
        buildSessionPlan({
          entries: normalizePlanEntries([
            { content: "Draft notes", status: "pending", risk: "read" },
            { content: "Write file", status: "pending", risk: "write" },
          ]),
          sourceUserText: "complex write",
        }),
      ),
      entries: normalizePlanEntries([
        { content: "Draft notes", status: "completed", risk: "read" },
        { content: "Write file", status: "completed", risk: "write" },
      ]),
      phase: "executing",
    },
  });
  assert.equal(reopened.phase, "awaiting_confirm");
  assert.equal(reopened.confirmedAt, undefined);

  const adminPlan = buildSessionPlan({
    entries: normalizePlanEntries([
      { content: "Unlock doors", status: "pending", risk: "admin" },
    ]),
    sourceUserText: "secure house audit then unlock",
  });
  assert.equal(adminPlan.phase, "awaiting_confirm");
});

test("V-P2-AGENT-8: attended hop budget; unattended never advances", () => {
  const plan = buildSessionPlan({
    entries: normalizePlanEntries([
      { content: "A", status: "pending", risk: "read" },
      { content: "B", status: "pending", risk: "read" },
    ]),
    sourceUserText: "complex",
    hopBudget: 2,
  });
  // Newly executing (no prior) → may advance once.
  assert.equal(
    shouldAutoAdvancePlan({ origin: "attended", plan, priorPlan: null }),
    true,
  );
  assert.equal(
    shouldAutoAdvancePlan({ origin: "unattended", plan, priorPlan: null }),
    false,
  );
  assert.equal(
    shouldAutoAdvancePlan({
      origin: "attended",
      plan,
      priorPlan: null,
      iterationCapHit: true,
    }),
    false,
  );
  // Already executing, no checklist progress → do not burn hop.
  assert.equal(
    shouldAutoAdvancePlan({
      origin: "attended",
      plan,
      priorPlan: plan,
      planTouched: false,
    }),
    false,
  );
  const progressedEntries = normalizePlanEntries([
    { content: "A", status: "completed", risk: "read" },
    { content: "B", status: "pending", risk: "read" },
  ]);
  const afterProgress = buildSessionPlan({
    entries: progressedEntries,
    sourceUserText: "complex",
    prior: plan,
    hopBudget: 2,
  });
  assert.equal(
    shouldAutoAdvancePlan({
      origin: "attended",
      plan: afterProgress,
      priorPlan: plan,
      planTouched: true,
    }),
    true,
  );
  const hopped = nextPlanHop(plan);
  assert.equal(hopped.hopCount, 1);
  const hopped2 = nextPlanHop(hopped);
  assert.equal(hopped2.hopCount, 2);
  assert.equal(
    shouldAutoAdvancePlan({
      origin: "attended",
      plan: hopped2,
      priorPlan: null,
      planTouched: true,
    }),
    false,
  );

  const awaiting = buildSessionPlan({
    entries: normalizePlanEntries([
      { content: "Write", status: "pending", risk: "write" },
    ]),
    sourceUserText: "x",
  });
  assert.equal(awaiting.phase, "awaiting_confirm");
  assert.equal(
    shouldAutoAdvancePlan({ origin: "attended", plan: awaiting }),
    false,
  );

  const revised = reviseSessionPlan(confirmSessionPlan(awaiting));
  assert.equal(revised.phase, "planning");
  assert.equal(revised.confirmedAt, undefined);
  assert.equal(revised.confirmedWriteKeys, undefined);
});

test("V-P2-AGENT-6: framing strip round-trip", () => {
  const framed = withPlanFirstFraming("hello complex world");
  assert.ok(framed.startsWith("[Plan carefully"));
  assert.equal(stripPlanFirstFraming(framed), "hello complex world");
});

test("V-P2-AGENT-7: sessionPlan persists on SessionStore", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-plan-"));
  try {
    const store = new SessionStore(homePaths(stateDir));
    const session = await store.open({ accountId: "alice", title: "t" });
    const plan = buildSessionPlan({
      entries: normalizePlanEntries([
        { content: "Step one", status: "pending", risk: "write" },
      ]),
      sourceUserText: "plan this overhaul",
    });
    await store.patchMeta("alice", session.sessionId, { sessionPlan: plan });
    const meta = await store.get("alice", session.sessionId);
    assert.equal(meta?.sessionPlan?.phase, "awaiting_confirm");
    await store.patchMeta("alice", session.sessionId, { sessionPlan: null });
    assert.equal((await store.get("alice", session.sessionId))?.sessionPlan, undefined);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
