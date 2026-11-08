// V-P2-AGENT-5 — long-task continue helpers + incomplete cue / SessionStore marker.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HomeModelAdapter,
  SessionStore,
  TURN_INCOMPLETE_CONTINUE_CUE,
  TURN_INCOMPLETE_ERROR,
  clampParentMaxIterations,
  homePaths,
  isTurnContinueIntent,
  nextAutoContinueUsedOnCap,
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
