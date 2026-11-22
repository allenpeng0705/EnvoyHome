// Harness contract sync — `Session` + explicit Home tool surface.
//
// Guards the two things that silently drifted when `../envoy-harness` moved
// ahead of `scripts/envoy-harness.pin`:
//   1. `Session` gained required methods (plan items, pending inbox/children).
//   2. `Agent` registers into ANY `ToolRegistry` handed to it — `wait_inbox`,
//      `todo_write`, and (with a `meshSubmitter`) `workflow` plus the
//      `spawn_agent` alias family — widening Home's declared allow-list.
//
// This is a maintenance guard for the B6 / P2-E3 integration, not a new Plan §4
// row — so it carries no fresh `V-…` id (reusing `V-HAR-1` here would make the
// verification table ambiguous). Both tests fail at compile/first-run time when
// the pin is bumped without re-checking the contract.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Agent,
  InMemorySession,
  LocalMeshSubmitter,
  ToolRegistry,
  newSessionId,
  type ModelAdapter,
  type ModelResponse,
  type Session,
} from "@envoymesh/envoy-harness";
import {
  buildParentToolRegistry,
  HomeAgentSession,
  stripHarnessAutoTools,
} from "../dist/index.js";

const okModel: ModelAdapter = {
  async complete(): Promise<ModelResponse> {
    return { content: [{ type: "text", text: "ok" }], stopReason: "end_turn" };
  },
};

const sessionDirs: string[] = [];

after(async () => {
  for (const dir of sessionDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function newSession(): Promise<HomeAgentSession> {
  const sessionDir = await mkdtemp(join(tmpdir(), "home-contract-"));
  sessionDirs.push(sessionDir);
  return new HomeAgentSession({
    id: "sess-contract",
    sessionDir,
    cwd: "/tmp/envoyhome-contract",
  });
}

test("B6 contract: HomeAgentSession satisfies the pinned Session methods", async () => {
  const session = await newSession();
  // Compile-time proof: the class implements every required method.
  const asSession: Session = session;
  assert.equal(asSession.id, "sess-contract");
  assert.deepEqual(asSession.getPendingChildren(), []);
  assert.equal(asSession.getPendingInbox(), undefined);

  // Plan items (ACP checklist) round-trip and clear.
  asSession.setPlanItems([
    { id: "1", content: "check the porch light", status: "pending" },
    { id: "2", content: "report", status: "in_progress", priority: "high" },
  ]);
  assert.equal(asSession.getPlanItems().length, 2);
  assert.equal(asSession.getPlanItems()[1]?.priority, "high");
  asSession.setPlanItems([]);
  assert.deepEqual(asSession.getPlanItems(), []);

  // Gap 4b — pending inbox round-trips, then clears on empty/undefined.
  asSession.setPendingInbox({
    nextTurn: [{ target: "next-turn", content: "also water the plants", enqueuedAt: "2026-11-22T00:00:00.000Z" }],
    nextStep: [],
  });
  assert.equal(asSession.getPendingInbox()?.nextTurn.length, 1);
  asSession.setPendingInbox({ nextTurn: [], nextStep: [] });
  assert.equal(asSession.getPendingInbox(), undefined);
  asSession.setPendingInbox({
    nextTurn: [],
    nextStep: [{ target: "next-step", content: "stop", enqueuedAt: "2026-11-22T00:00:00.000Z" }],
  });
  asSession.setPendingInbox(undefined);
  assert.equal(asSession.getPendingInbox(), undefined);

  // Gap 1 — continuable-child snapshot round-trips, then clears.
  asSession.setPendingChildren([
    {
      sessionId: "child-1",
      objective: "summarize notes",
      status: "running",
      startedAt: "2026-11-22T00:00:00.000Z",
    },
  ]);
  assert.equal(asSession.getPendingChildren()[0]?.sessionId, "child-1");
  asSession.setPendingChildren([]);
  assert.deepEqual(asSession.getPendingChildren(), []);
});

test("B6 contract: harness-added tools stay off Home's surface", async () => {
  // Mirrors a real parent turn: Home pre-registers its allow-list (plus
  // `spawn_helper`), then a `meshSubmitter` makes the harness add `task`.
  const tools = buildParentToolRegistry(
    ["echo", "spawn_helper", "task"],
    async () => "echoed",
  );
  const declared = tools.list().map((t) => t.name);

  const mesh = new LocalMeshSubmitter({
    workerPeerId: "envoyhome-local",
    buildSubagent: () =>
      new Agent({
        model: okModel,
        tools: new ToolRegistry(),
        session: new InMemorySession(newSessionId(), {
          cwd: "/tmp/envoyhome-contract",
          permissionMode: "read-only",
          startedAt: new Date().toISOString(),
        }),
      }),
  });

  const agent = new Agent({
    model: okModel,
    tools,
    session: new InMemorySession(newSessionId(), {
      cwd: "/tmp/envoyhome-contract",
      permissionMode: "workspace-write",
      startedAt: new Date().toISOString(),
    }),
    meshSubmitter: mesh,
  });

  // The constructor genuinely widens the registry — this is the drift being guarded.
  const widened = tools.list().map((t) => t.name);
  for (const injected of [
    "wait_inbox",
    "todo_write",
    "workflow",
    "spawn_agent",
    "send_message",
  ]) {
    assert.ok(
      widened.includes(injected),
      `expected harness to register ${injected}; got ${widened.join(",")}`,
    );
  }

  stripHarnessAutoTools(tools, declared);
  const after = tools.list().map((t) => t.name).sort();
  // Exactly Home's declared tools + the two harness tools Home keeps.
  assert.deepEqual(after, [
    "echo",
    "spawn_helper",
    "suggest_follow_ups",
    "task",
  ]);
  // `workflow` would be a second orchestration engine; the child-control trio
  // would advertise steering Home's synchronous children cannot use.
  for (const stripped of [
    "workflow",
    "wait_inbox",
    "todo_write",
    "spawn_agent",
    "send_message",
    "list_agents",
    "interrupt_agent",
  ]) {
    assert.equal(after.includes(stripped), false, `${stripped} must be stripped`);
  }
  // Stripping is post-construction and must not disturb the Agent handle.
  assert.equal(typeof agent.run, "function");
});
