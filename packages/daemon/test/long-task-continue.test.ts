// V-P2-AGENT-5 — long-task continue helpers + incomplete cue / SessionStore marker.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HOME_PARENT_CONTINUATION_PHASES,
  HomeModelAdapter,
  SessionStore,
  TURN_INCOMPLETE_CONTINUE_CUE,
  TURN_INCOMPLETE_ERROR,
  clampParentContinuationPhases,
  clampParentMaxIterations,
  homePaths,
  isTurnContinueIntent,
  nextAutoContinueUsedOnCap,
  parentContinuationPhasesForOrigin,
  parseParentContinuationPhasesEnv,
  runAgentTurn,
  shouldAttemptAutoContinue,
  shouldEmitIncompleteCue,
} from "../dist/index.js";
import type { TurnContext, TurnDeps } from "@envoyhome/harness-host";

test("V-P2-AGENT-5: shouldEmitIncompleteCue — suppress only when auto-hop available", () => {
  assert.equal(shouldEmitIncompleteCue({ origin: "unattended" }), true);
  assert.equal(shouldEmitIncompleteCue({ origin: "attended" }), false);
  assert.equal(
    shouldEmitIncompleteCue({ origin: "attended", autoContinueUsed: false }),
    false,
  );
  assert.equal(
    shouldEmitIncompleteCue({ origin: "attended", autoContinueUsed: true }),
    true,
  );
});

test("V-P2-AGENT-5: shouldAttemptAutoContinue — attended once only", () => {
  assert.equal(
    shouldAttemptAutoContinue({
      origin: "attended",
      iterationCapHit: true,
      aborted: false,
      statusOk: true,
      autoContinueUsed: false,
    }),
    true,
  );
  assert.equal(
    shouldAttemptAutoContinue({
      origin: "attended",
      iterationCapHit: true,
      aborted: false,
      statusOk: true,
      autoContinueUsed: true,
    }),
    false,
  );
  assert.equal(
    shouldAttemptAutoContinue({
      origin: "unattended",
      iterationCapHit: true,
      aborted: false,
      statusOk: true,
      autoContinueUsed: false,
    }),
    false,
  );
  assert.equal(
    shouldAttemptAutoContinue({
      origin: "attended",
      iterationCapHit: true,
      aborted: true,
      statusOk: true,
      autoContinueUsed: false,
    }),
    false,
  );
});

test("V-P2-AGENT-5: nextAutoContinueUsedOnCap preserves prior / marks auto hop", () => {
  assert.equal(nextAutoContinueUsedOnCap({ priorAutoContinueUsed: false }), false);
  assert.equal(nextAutoContinueUsedOnCap({ priorAutoContinueUsed: true }), true);
  assert.equal(
    nextAutoContinueUsedOnCap({ priorAutoContinueUsed: false, isAutoContinueHop: true }),
    true,
  );
});

test("V-P2-AGENT-5: continue intent resumes unfinished marker shape", async () => {
  assert.equal(isTurnContinueIntent("continue"), true);
  assert.equal(isTurnContinueIntent("继续"), true);
  const stateDir = await mkdtemp(join(tmpdir(), "eh-long-task-"));
  try {
    const store = new SessionStore(homePaths(stateDir));
    const session = await store.open({ accountId: "alice", title: "t" });
    await store.patchMeta("alice", session.sessionId, {
      pendingTurnIncomplete: {
        lastUserText: "build a long report",
        at: new Date().toISOString(),
        autoContinueUsed: true,
      },
    });
    const meta = await store.get("alice", session.sessionId);
    assert.equal(meta?.pendingTurnIncomplete?.lastUserText, "build a long report");
    assert.equal(meta?.pendingTurnIncomplete?.autoContinueUsed, true);
    // Explicit continue + prior auto used → emit cue, do not auto again.
    assert.equal(
      shouldEmitIncompleteCue({
        origin: "attended",
        autoContinueUsed: meta!.pendingTurnIncomplete!.autoContinueUsed,
      }),
      true,
    );
    assert.equal(
      shouldAttemptAutoContinue({
        origin: "attended",
        iterationCapHit: true,
        aborted: false,
        statusOk: true,
        autoContinueUsed: true,
      }),
      false,
    );
    await store.patchMeta("alice", session.sessionId, { pendingTurnIncomplete: null });
    assert.equal((await store.get("alice", session.sessionId))?.pendingTurnIncomplete, undefined);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

function baseCtx(): TurnContext {
  return {
    account_id: "acct-1",
    agent_id: "default",
    session_id: "sess-1",
    turn_id: "turn-1",
    sandbox_root: "/tmp/envoyhome-long-task",
    workspace_root: "/tmp/envoyhome-long-task",
    workspace_mode: "sandbox",
    workspace_mounts: [],
    origin: "attended",
    policy_snapshot: {
      origin: "attended",
      tool_policy: "standard",
      model_mode: "auto",
      homeSurface: false,
      schedulesSurface: false,
    },
  };
}

test("V-P2-AGENT-5: emitIncompleteCue false omits continue footer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-long-cue-"));
  const fenceModel = new HomeModelAdapter(
    async () =>
      '```envoyhome-tools\n[{"tool":"read_file","args":{"path":"a.txt"}}]\n```',
    { allowSandbox: true },
  );
  const deps: TurnDeps = {
    ctx: baseCtx(),
    provider: {
      complete: async () => ({ text: "" }),
      ensurePicked: () => undefined,
      lastPick: () => undefined,
    } as TurnDeps["provider"],
    approval: { authorize: async () => "allowed" as const } as TurnDeps["approval"],
    fs: {
      readFile: async () => "body",
      writeFile: async () => undefined,
    } as TurnDeps["fs"],
  };
  const events = [];
  for await (const ev of runAgentTurn({
    userText: "read forever",
    history: [],
    deps,
    sessionDir: dir,
    sessionId: "sess-1",
    turnId: "turn-1",
    model: fenceModel,
    maxIterations: 1,
    // Cap UX under test — disable silent phases so max_iterations fires immediately.
    maxContinuationPhases: 0,
    emitIncompleteCue: false,
  })) {
    events.push(ev);
  }
  const joined = events.map((e) => e.text ?? "").join("\n");
  assert.ok(!joined.includes(TURN_INCOMPLETE_CONTINUE_CUE), joined.slice(0, 300));
  assert.ok(!joined.includes(TURN_INCOMPLETE_ERROR), joined.slice(0, 300));
});

test("V-P2-AGENT-5: maxIterations clamped to 80 ceiling", () => {
  assert.equal(clampParentMaxIterations(9999), 80);
  assert.equal(clampParentMaxIterations(0), 1);
  assert.equal(clampParentMaxIterations(48), 48);
});

test("V-P2-AGENT-5: continuation phases default 2; clamp 0…3", () => {
  assert.ok(HOME_PARENT_CONTINUATION_PHASES >= 0 && HOME_PARENT_CONTINUATION_PHASES <= 3);
  // Module-load constant follows process env at import time — parse the raw form.
  assert.equal(parseParentContinuationPhasesEnv(undefined), 2);
  assert.equal(parseParentContinuationPhasesEnv(""), 2);
  assert.equal(parseParentContinuationPhasesEnv("  "), 2);
  assert.equal(parseParentContinuationPhasesEnv("0"), 0);
  assert.equal(parseParentContinuationPhasesEnv("3"), 3);
  assert.equal(parseParentContinuationPhasesEnv("1.9"), 1); // floor via Math.floor after finite check
  assert.equal(parseParentContinuationPhasesEnv("4"), 2); // out of band → default
  assert.equal(parseParentContinuationPhasesEnv("-1"), 2);
  assert.equal(parseParentContinuationPhasesEnv("abc"), 2);
  assert.equal(clampParentContinuationPhases(99), 3);
  assert.equal(clampParentContinuationPhases(-1), 0);
  assert.equal(clampParentContinuationPhases(2), 2);
  assert.equal(clampParentContinuationPhases(0), 0);
  assert.equal(clampParentContinuationPhases(Number.NaN), HOME_PARENT_CONTINUATION_PHASES);
});

test("V-P2-AGENT-5: parentContinuationPhasesForOrigin — unattended/schedule force 0", () => {
  assert.equal(
    parentContinuationPhasesForOrigin({
      origin: "attended",
      attendedDefault: 2,
    }),
    2,
  );
  assert.equal(
    parentContinuationPhasesForOrigin({
      origin: "attended",
      callerKind: "chat",
      attendedDefault: 2,
    }),
    2,
  );
  assert.equal(
    parentContinuationPhasesForOrigin({
      origin: "unattended",
      attendedDefault: 2,
    }),
    0,
  );
  assert.equal(
    parentContinuationPhasesForOrigin({
      origin: "attended",
      callerKind: "schedule",
      attendedDefault: 2,
    }),
    0,
  );
  assert.equal(
    parentContinuationPhasesForOrigin({
      origin: "unattended",
      callerKind: "schedule",
      attendedDefault: 2,
    }),
    0,
  );
});

test("V-P2-AGENT-5: silent continuation phase runs before continue cue", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-long-phase-"));
  let completes = 0;
  let capped = 0;
  const fenceModel = new HomeModelAdapter(
    async () => {
      completes += 1;
      return '```envoyhome-tools\n[{"tool":"read_file","args":{"path":"a.txt"}}]\n```';
    },
    { allowSandbox: true },
  );
  const deps: TurnDeps = {
    ctx: baseCtx(),
    provider: {
      complete: async () => ({ text: "" }),
      ensurePicked: () => undefined,
      lastPick: () => undefined,
    } as TurnDeps["provider"],
    approval: { authorize: async () => "allowed" as const } as TurnDeps["approval"],
    fs: {
      readFile: async () => "body",
      writeFile: async () => undefined,
    } as TurnDeps["fs"],
  };
  const events = [];
  for await (const ev of runAgentTurn({
    userText: "read forever",
    history: [],
    deps,
    sessionDir: dir,
    sessionId: "sess-1",
    turnId: "turn-1",
    model: fenceModel,
    maxIterations: 1,
    // One silent phase → two model rounds before max_iterations.
    maxContinuationPhases: 1,
    emitIncompleteCue: true,
    onIterationCap: () => {
      capped += 1;
    },
  })) {
    events.push(ev);
  }
  assert.equal(completes, 2, `expected 2 model rounds (1+1 phase), got ${completes}`);
  assert.equal(capped, 1);
  const joined = events.map((e) => e.text ?? "").join("\n");
  assert.ok(
    joined.includes(TURN_INCOMPLETE_CONTINUE_CUE) ||
      joined.includes(TURN_INCOMPLETE_ERROR) ||
      /continue/i.test(joined),
    `expected continue cue after phases, got: ${joined.slice(0, 400)}`,
  );
});

test("V-P2-AGENT-5: phases=0 caps on first budget (no silent continue)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-long-nophase-"));
  let completes = 0;
  const fenceModel = new HomeModelAdapter(
    async () => {
      completes += 1;
      return '```envoyhome-tools\n[{"tool":"read_file","args":{"path":"a.txt"}}]\n```';
    },
    { allowSandbox: true },
  );
  const deps: TurnDeps = {
    ctx: baseCtx(),
    provider: {
      complete: async () => ({ text: "" }),
      ensurePicked: () => undefined,
      lastPick: () => undefined,
    } as TurnDeps["provider"],
    approval: { authorize: async () => "allowed" as const } as TurnDeps["approval"],
    fs: {
      readFile: async () => "body",
      writeFile: async () => undefined,
    } as TurnDeps["fs"],
  };
  for await (const _ev of runAgentTurn({
    userText: "read forever",
    history: [],
    deps,
    sessionDir: dir,
    sessionId: "sess-1",
    turnId: "turn-1",
    model: fenceModel,
    maxIterations: 1,
    maxContinuationPhases: 0,
    emitIncompleteCue: true,
  })) {
    /* drain */
  }
  assert.equal(completes, 1);
});
