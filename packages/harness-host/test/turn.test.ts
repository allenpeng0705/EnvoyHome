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
  clearExtraToolSpecsForTests,
  dispatchTool,
  parseAssistantToolCalls,
  peekTurnFailure,
  registerToolSpec,
  runTurn,
  type TurnContext,
} from "../dist/index.js";
import { MixRouter } from "@envoyhome/providers";

function baseCtx(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    account_id: "alice",
    agent_id: "default",
    session_id: "s1",
    turn_id: "t1",
    sandbox_root: "/tmp",
    origin: "attended",
    policy_snapshot: {
      origin: "attended",
      tool_policy: "standard",
      model_mode: "local",
    },
    ...overrides,
  };
}

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

test("V-HA-21: dispatchTool refuses ha_*/mqtt_* when homeSurface is off", async () => {
  __resetActiveXForTests();
  clearExtraToolSpecsForTests();
  registerToolSpec({ name: "ha_get_state", risk: "read", grantable: false });
  registerToolSpec({ name: "mqtt_publish", risk: "admin", grantable: true });
  const root = await mkdtemp(join(tmpdir(), "eh-turn-homeoff-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx = baseCtx({
      sandbox_root: join(root, "files"),
      turn_id: "t-home-off",
      policy_snapshot: {
        origin: "attended",
        tool_policy: "standard",
        model_mode: "local",
        homeSurface: false,
      },
    });
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
    });
    const deps = {
      ctx,
      provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "local" }),
      approval,
      fs: { writeFile: async () => undefined, readFile: async () => "" },
      extraToolImpl: async () => {
        throw new Error("should not run");
      },
    };
    const ha = await dispatchTool(deps, {
      tool: "ha_get_state",
      args: { entity_id: "light.x" },
    });
    assert.equal(ha.ok, false);
    assert.match(ha.reason, /home tools not enabled/);

    const mqtt = await dispatchTool(deps, {
      tool: "mqtt_publish",
      args: { topic: "t", payload: "1" },
    });
    assert.equal(mqtt.ok, false);
    assert.match(mqtt.reason, /home tools not enabled/);
  } finally {
    clearExtraToolSpecsForTests();
    await rm(root, { recursive: true, force: true });
  }
});

test("V-HA-21: dispatchTool allows ha_* when homeSurface is true (read path)", async () => {
  __resetActiveXForTests();
  clearExtraToolSpecsForTests();
  registerToolSpec({ name: "ha_get_state", risk: "read", grantable: false });
  const root = await mkdtemp(join(tmpdir(), "eh-turn-homeon-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx = baseCtx({
      sandbox_root: join(root, "files"),
      turn_id: "t-home-on",
      policy_snapshot: {
        origin: "attended",
        tool_policy: "standard",
        model_mode: "local",
        homeSurface: true,
      },
    });
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
    });
    const allowed = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "local" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        extraToolImpl: async () => "state=on",
      },
      { tool: "ha_get_state", args: { entity_id: "light.x" } },
    );
    assert.equal(allowed.ok, true);
    if (allowed.ok) assert.equal(allowed.output, "state=on");
  } finally {
    clearExtraToolSpecsForTests();
    await rm(root, { recursive: true, force: true });
  }
});

test("toolLoop honesty: claim without fence is rewritten", async () => {
  __resetActiveXForTests();
  const root = await mkdtemp(join(tmpdir(), "eh-turn-honest-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx = baseCtx({
      sandbox_root: join(root, "files"),
      turn_id: "t-honest",
      policy_snapshot: {
        origin: "attended",
        tool_policy: "standard",
        model_mode: "local",
        homeSurface: true,
      },
    });
    const events = [];
    for await (const ev of runTurn({
      userText: "是的",
      toolLoop: true,
      deps: {
        ctx,
        provider: new ProviderHandle({
          router: new MixRouter(undefined, undefined),
          mode: "local",
        }),
        approval: new ApprovalSink({
          store,
          policy: ctx.policy_snapshot,
          toolPolicy: "standard",
        }),
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        completionText:
          "已请求将 Hallway thermostat 的目标温度设置为 24℃ — 请在 Approvals 中允许后生效。",
      },
    })) {
      events.push(ev);
    }
    assert.equal(events.some((e) => e.kind === "tool_call"), false);
    const text = events.find((e) => e.kind === "text")?.text ?? "";
    assert.match(text, /还没有真正提交|did not actually submit/i);
    assert.doesNotMatch(text, /请在 Approvals 中允许后生效/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parseAssistantToolCalls: extracts ha_*/mqtt_* from envoyhome-tools fence", () => {
  const raw = [
    "I'll turn it on.",
    "```envoyhome-tools",
    JSON.stringify([
      {
        tool: "ha_call_service",
        args: {
          objectId: "homeassistant:light.kitchen",
          domain: "light",
          service: "turn_on",
        },
        summary: "Turn on Kitchen",
      },
      { tool: "exec", args: { cmd: "rm -rf /" } },
    ]),
    "```",
  ].join("\n");
  const parsed = parseAssistantToolCalls(raw);
  assert.equal(parsed.tools.length, 1);
  assert.equal(parsed.tools[0]!.tool, "ha_call_service");
  assert.equal(
    (parsed.tools[0]!.args as { objectId: string }).objectId,
    "homeassistant:light.kitchen",
  );
  assert.match(parsed.replyText, /I'll turn it on/);
});

test("toolLoop: dispatches parsed home tools then yields reply", async () => {
  __resetActiveXForTests();
  clearExtraToolSpecsForTests();
  registerToolSpec({ name: "ha_call_service", risk: "admin", grantable: true });
  const root = await mkdtemp(join(tmpdir(), "eh-turn-tooloop-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx = baseCtx({
      sandbox_root: join(root, "files"),
      turn_id: "t-tool-loop",
      policy_snapshot: {
        origin: "attended",
        tool_policy: "standard",
        model_mode: "local",
        homeSurface: true,
      },
    });
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
      waitForAnswer: async (id) => {
        const digest = canonicalDigest({
          objectId: "homeassistant:light.x",
          domain: "light",
          service: "turn_on",
        });
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
    let called = false;
    const gen = runTurn({
      userText: "make the kitchen brighter somehow",
      toolLoop: true,
      deps: {
        ctx,
        provider: new ProviderHandle({
          router: new MixRouter(undefined, undefined),
          mode: "local",
        }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        extraToolImpl: async () => {
          called = true;
          return "ok";
        },
        completionText: [
          "Sure.",
          "```envoyhome-tools",
          '[{"tool":"ha_call_service","args":{"objectId":"homeassistant:light.x","domain":"light","service":"turn_on"},"summary":"Turn on light.x"}]',
          "```",
        ].join("\n"),
      },
    });
    const events = [];
    for await (const ev of gen) events.push(ev);
    assert.equal(called, true);
    assert.ok(events.some((e) => e.kind === "tool_call"));
    assert.ok(events.some((e) => e.kind === "tool_result"));
    assert.ok(events.some((e) => e.kind === "text" && /Sure/.test(e.text ?? "")));
  } finally {
    clearExtraToolSpecsForTests();
    await rm(root, { recursive: true, force: true });
  }
});

test("V-HA-21: omitted homeSurface defaults to off for smart-home tools", async () => {
  __resetActiveXForTests();
  clearExtraToolSpecsForTests();
  registerToolSpec({ name: "ha_list_entities", risk: "read", grantable: false });
  const root = await mkdtemp(join(tmpdir(), "eh-turn-homeomit-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx = baseCtx({
      sandbox_root: join(root, "files"),
      turn_id: "t-home-omit",
    });
    const denied = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "local" }),
        approval: new ApprovalSink({
          store,
          policy: ctx.policy_snapshot,
          toolPolicy: "standard",
        }),
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        extraToolImpl: async () => "leak",
      },
      { tool: "ha_list_entities", args: {} },
    );
    assert.equal(denied.ok, false);
    assert.match(denied.reason, /home tools not enabled/);
  } finally {
    clearExtraToolSpecsForTests();
    await rm(root, { recursive: true, force: true });
  }
});
