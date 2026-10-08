import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import {
  ApprovalSink,
  ApprovalStore,
  ProviderHandle,
  canonicalDigest,
  dispatchTool,
  peekTurnFailure,
  runTurn,
  type TurnContext,
} from "../dist/index.js";
import { MixRouter } from "@envoyhome/providers";

test("R1: pre-loop assert persists failure in store", async () => {
  __resetActiveXForTests();
  const root = await mkdtemp(join(tmpdir(), "eh-turn-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-missing-account",
      sandbox_root: join(root, "files"),
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "standard", model_mode: "local" },
    };
    const gen = runTurn({
      userText: "hi",
      deps: {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "local" }),
        approval: new ApprovalSink({ store, policy: ctx.policy_snapshot, toolPolicy: "standard" }),
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        completionText: "ok",
      },
    });
    await assert.rejects(async () => {
      for await (const _ of gen) {
        /* drain */
      }
    });
    assert.ok(peekTurnFailure("t-missing-account"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-HAR-4: exec blocked without approval when policy=ask (attended)", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-turn-exec-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-exec",
      sandbox_root: join(root, "alice", "files"),
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "standard", model_mode: "local" },
    };
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
    });
    const result = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "local" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
      },
      { tool: "exec", args: { cmd: "id" } },
    );
    assert.equal(result.ok, false);
    assert.match(result.reason, /approval_pending/);
    const pending = await store.listApprovals("alice");
    assert.equal(pending.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-SEC-5: unattended exec denied without grant", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-turn-unatt-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-unatt",
      sandbox_root: join(root, "alice", "files"),
      origin: "unattended",
      policy_snapshot: { origin: "unattended", tool_policy: "standard", model_mode: "local" },
    };
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
    });
    const denied = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "local" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
      },
      { tool: "exec", args: { cmd: "id" } },
    );
    assert.equal(denied.ok, false);

    const digest = canonicalDigest({ cmd: "id" });
    await store.writeGrant({
      accountId: "alice",
      tool: "exec",
      argsDigest: digest,
      risk: "exec",
      grantedBy: "loopback-owner",
      expiresAt: null,
    });
    const allowed = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "local" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        execImpl: async () => "ran",
      },
      { tool: "exec", args: { cmd: "id" } },
    );
    assert.equal(allowed.ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-SEC-9: sensitive completion forces local provider", async () => {
  const local = {
    id: "local",
    kind: "openai-compat" as const,
    label: "local",
    describe: () => ({ id: "local", kind: "openai-compat" as const, label: "local", hasSecret: false }),
    complete: async () => ({ text: "local-only", model: "m" }),
  };
  const cloud = {
    id: "cloud",
    kind: "cloud" as const,
    label: "cloud",
    describe: () => ({ id: "cloud", kind: "cloud" as const, label: "cloud", hasSecret: false }),
    complete: async () => ({ text: "cloud", model: "m" }),
  };
  const router = new MixRouter(local, cloud);
  const handle = new ProviderHandle({ router, mode: "mix", forceLocal: true });
  const out = await handle.complete({ messages: [{ role: "user", content: "x" }] });
  assert.equal(out.providerId, "local");
});

test("turn with approval waiter resumes after allow", async () => {
  __resetActiveXForTests();
  const root = await mkdtemp(join(tmpdir(), "eh-turn-wait-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-wait",
      sandbox_root: join(root, "alice", "files"),
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "standard", model_mode: "local" },
    };
    let approvalId = "";
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
      onApprovalNeeded: (row) => {
        approvalId = row.id;
      },
      waitForAnswer: async (id) => {
        const digest = canonicalDigest({ cmd: "echo hi" });
        await store.answerApproval({
          accountId: "alice",
          id,
          decision: "allow",
          scope: "once",
          argsDigest: digest,
          grantedBy: "loopback-owner",
        });
        return "allow";
      },
    });
    const gen = runTurn({
      userText: "run",
      plannedTools: [{ tool: "exec", args: { cmd: "echo hi" } }],
      deps: {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "local" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        execImpl: async () => "hi",
        completionText: "done",
      },
    });
    const events = [];
    for await (const ev of gen) events.push(ev);
    assert.ok(events.some((e) => e.kind === "tool_result"));
    assert.ok(approvalId.length > 0);
    await flushLoop();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
