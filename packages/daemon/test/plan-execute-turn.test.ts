// V-P2-AGENT-6/7/8 — TurnService plan gate + unattended / schedules no-op.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import type { ModelProvider } from "@envoyhome/providers";
import {
  buildSessionPlan,
  HOME_PLAN_FIRST_PREFIX,
  normalizePlanEntries,
  startDaemon,
  type RunningDaemon,
} from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-plan-turn-"));
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, stateDir, hatchApiKey: "k-plan" },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);
  return {
    daemon,
    stateDir,
    cleanup: async () => {
      await daemon.stop().catch(() => undefined);
      const idx = daemons.indexOf(daemon);
      if (idx >= 0) daemons.splice(idx, 1);
      await rm(stateDir, { recursive: true, force: true });
    },
  };
}

const COMPLEX_PROMPT =
  "Investigate this home end-to-end and redesign how we migrate all device bindings across every room and account step by step";

test("V-P2-AGENT-6: complex attended turn gets plan-first framing", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    const opened = await daemon.turns.openSession({ accountId: "alice" });
    const sessionId = String(opened.sessionId);

    const seen: string[] = [];
    const stub: ModelProvider = {
      id: "stub-plan",
      kind: "llama-cpp",
      label: "stub",
      async complete(input) {
        const blob = JSON.stringify(input.messages ?? []);
        seen.push(blob);
        return {
          text: "I'll design a checklist first.",
          model: "stub",
          usage: { promptTokens: 1, completionTokens: 1 },
        };
      },
      describe() {
        return { id: "stub-plan", kind: "llama-cpp", label: "stub", hasSecret: false };
      },
    };
    daemon.providers.getRouter().setLocal(stub);

    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: COMPLEX_PROMPT,
      callerKind: "loopback-owner",
      origin: "attended",
    });
    for (let i = 0; i < 80 && daemon.turns.activeTurnCount() > 0; i++) {
      await flushLoop(5);
    }

    const joined = seen.join("\n");
    assert.ok(
      joined.includes("Plan carefully") || joined.includes(HOME_PLAN_FIRST_PREFIX.trim().slice(0, 40)),
      `expected plan-first framing in model messages; got ${joined.slice(0, 400)}`,
    );
  } finally {
    await cleanup();
  }
});

test("V-P2-AGENT-7: attended session_plan writes meta + emit; unattended refuses", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    const opened = await daemon.turns.openSession({ accountId: "alice" });
    const sessionId = String(opened.sessionId);

    const planEvents: unknown[] = [];
    daemon.events.asNodeService().on("home:session-plan", (data) => {
      planEvents.push(data);
    });

    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: COMPLEX_PROMPT,
      callerKind: "loopback-owner",
      origin: "attended",
      plannedTools: [
        {
          tool: "session_plan",
          args: {
            entries: [
              { content: "Audit bindings", status: "pending", risk: "read" },
              { content: "Write migration notes", status: "pending", risk: "write" },
            ],
          },
        },
      ],
      completionText: "Plan posted for confirm.",
    });
    for (let i = 0; i < 50 && daemon.turns.activeTurnCount() > 0; i++) {
      await flushLoop(5);
    }

    const meta = await daemon.turns.sessions.get("alice", sessionId);
    assert.equal(meta?.sessionPlan?.phase, "awaiting_confirm");
    assert.ok(planEvents.length >= 1, "expected home:session-plan");

    const opened2 = await daemon.turns.openSession({ accountId: "alice" });
    const sessionId2 = String(opened2.sessionId);
    const toolResults: string[] = [];
    daemon.events.asNodeService().on("home:turn-delta", (data) => {
      const d = data as { kind?: string; tool?: { name?: string }; text?: string; sessionId?: string };
      if (d.sessionId && d.sessionId !== sessionId2) return;
      if (d.kind === "tool_result" && d.tool?.name === "session_plan" && d.text) {
        toolResults.push(d.text);
      }
    });
    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId: sessionId2,
      text: "please summarize standing notes only",
      callerKind: "loopback-owner",
      origin: "unattended",
      plannedTools: [
        {
          tool: "session_plan",
          args: {
            entries: [{ content: "Should not land", status: "pending", risk: "read" }],
          },
        },
      ],
      completionText: "unattended attempt",
    });
    for (let i = 0; i < 50 && daemon.turns.activeTurnCount() > 0; i++) {
      await flushLoop(5);
    }
    const meta2 = await daemon.turns.sessions.get("alice", sessionId2);
    assert.equal(meta2?.sessionPlan, undefined, "unattended must not persist sessionPlan");
    assert.ok(
      toolResults.some((t) => /plan_unattended|attended-only/i.test(t)),
      `expected plan_unattended in tool_result; got ${JSON.stringify(toolResults)}`,
    );
  } finally {
    await cleanup();
  }
});

test("V-P2-AGENT-8: schedules purpose never auto-advances session plan", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    const opened = await daemon.turns.openSession({
      accountId: "alice",
      purpose: "schedules",
    });
    const sessionId = String(opened.sessionId);

    const plan = buildSessionPlan({
      entries: normalizePlanEntries([
        { content: "A", status: "pending", risk: "read" },
        { content: "B", status: "pending", risk: "read" },
      ]),
      sourceUserText: "complex leftover",
      hopBudget: 8,
    });
    assert.equal(plan.phase, "executing");
    await daemon.turns.sessions.patchMeta("alice", sessionId, { sessionPlan: plan });

    const continueTexts: string[] = [];
    const origSend = daemon.turns.sendMessage.bind(daemon.turns);
    // Observe nested auto-advance sends without changing behavior.
    daemon.turns.sendMessage = async (input) => {
      if (/continue the next session plan step/i.test(String(input.text ?? ""))) {
        continueTexts.push(String(input.text));
      }
      return origSend(input);
    };

    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "list my schedules",
      callerKind: "loopback-owner",
      origin: "attended",
      completionText: "No reminders yet.",
    });
    for (let i = 0; i < 50 && daemon.turns.activeTurnCount() > 0; i++) {
      await flushLoop(5);
    }
    // Give any fire-and-forget auto-advance a beat.
    await flushLoop(20);

    assert.equal(continueTexts.length, 0, "schedules must not auto-advance plan hops");
    const meta = await daemon.turns.sessions.get("alice", sessionId);
    assert.equal(meta?.sessionPlan?.hopCount ?? 0, plan.hopCount);
  } finally {
    await cleanup();
  }
});
