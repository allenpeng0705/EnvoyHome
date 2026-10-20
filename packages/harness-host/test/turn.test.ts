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
  formatSandboxToolResultLines,
  formatScheduleToolOutput,
  claimsReminderWithoutPropose,
  normalizeSandboxEchoPath,
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

test("V-OUT-6: web_search attended allow without prompt; http_fetch still asks", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-websearch-att-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-ws",
      sandbox_root: join(root, "alice", "files"),
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "standard", model_mode: "cloud" },
    };
    let asked = 0;
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
      onApprovalNeeded: () => {
        asked += 1;
      },
      waitForAnswer: async () => "allow",
    });
    const ws = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "cloud" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        extraToolImpl: async (tool) => {
          if (tool === "web_search") return JSON.stringify({ provider: "duckduckgo", results: [] });
          throw new Error(`unexpected ${tool}`);
        },
      },
      { tool: "web_search", args: { query: "test" } },
    );
    assert.equal(ws.ok, true);
    assert.equal(asked, 0);

    asked = 0;
    const fetchRes = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "cloud" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        httpFetchImpl: (async () => new Response("ok", { status: 200 })) as typeof fetch,
      },
      { tool: "http_fetch", args: { url: "https://example.com/" } },
    );
    assert.equal(fetchRes.ok, true);
    assert.ok(asked >= 1, "http_fetch should request attended approval");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-OUT-8: browser restricted denies", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-browser-restr-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-br-r",
      sandbox_root: join(root, "alice", "files"),
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "restricted", model_mode: "cloud" },
    };
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "restricted",
    });
    const res = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "cloud" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        extraToolImpl: async () => {
          throw new Error("should not run");
        },
      },
      { tool: "browser", args: { action: "status" } },
    );
    assert.equal(res.ok, false);
    assert.match(String("reason" in res ? res.reason : ""), /denied|approval/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-OUT-8: browser tool asks on attended with action summary", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-browser-ask-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-br",
      sandbox_root: join(root, "alice", "files"),
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "standard", model_mode: "cloud" },
    };
    let asked = 0;
    let lastSummary = "";
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
      onApprovalNeeded: (row) => {
        asked += 1;
        lastSummary = row.summary ?? "";
      },
      waitForAnswer: async () => "allow",
    });
    const res = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "cloud" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        extraToolImpl: async (tool) => {
          if (tool === "browser") return JSON.stringify({ action: "status", ready: true });
          throw new Error(`unexpected ${tool}`);
        },
      },
      { tool: "browser", args: { action: "navigate", url: "https://example.com/" } },
    );
    assert.equal(res.ok, true);
    assert.equal(asked, 1);
    assert.match(lastSummary, /browser navigate/i);
    assert.match(lastSummary, /\[managed\]/);
    assert.match(lastSummary, /example\.com/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-OUT-8: browser summary uses browserDefaultProfile when args omit profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-browser-defprof-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-br-def",
      sandbox_root: join(root, "alice", "files"),
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "standard", model_mode: "cloud" },
    };
    let lastSummary = "";
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
      onApprovalNeeded: (row) => {
        lastSummary = row.summary ?? "";
      },
      waitForAnswer: async () => "allow",
    });
    const res = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "cloud" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        browserDefaultProfile: "personal",
        extraToolImpl: async () => JSON.stringify({ ok: true }),
      },
      { tool: "browser", args: { action: "navigate", url: "https://example.com/" } },
    );
    assert.equal(res.ok, true);
    assert.match(lastSummary, /\[personal\]/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-OUT-9: browser personal profile tagged in approval summary", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-browser-personal-sum-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-br-p",
      sandbox_root: join(root, "alice", "files"),
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "standard", model_mode: "cloud" },
    };
    let lastSummary = "";
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
      onApprovalNeeded: (row) => {
        lastSummary = row.summary ?? "";
      },
      waitForAnswer: async () => "allow",
    });
    const res = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "cloud" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        extraToolImpl: async () => JSON.stringify({ ok: true }),
      },
      {
        tool: "browser",
        args: { action: "navigate", profile: "personal", url: "https://amazon.com/" },
      },
    );
    assert.equal(res.ok, true);
    assert.match(lastSummary, /\[personal\]/);
    assert.match(lastSummary, /amazon\.com/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-OUT-7: browser search fallback always asks on attended", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-websearch-br-ask-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-ws-br",
      sandbox_root: join(root, "alice", "files"),
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "standard", model_mode: "cloud" },
    };
    let asked = 0;
    let lastSummary = "";
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
      onApprovalNeeded: (row) => {
        asked += 1;
        lastSummary = row.summary ?? "";
      },
      waitForAnswer: async () => "allow",
    });
    const decision = await approval.authorizeBrowserSearchFallback({
      accountId: "alice",
      agentId: "default",
      turnId: "t-ws-br",
      tool: "web_search",
      args: { query: "x", _browserFallback: true },
      summary: "browser search fallback (bing→google)",
    });
    assert.equal(decision, "allowed");
    assert.equal(asked, 1);
    assert.match(lastSummary, /browser search fallback/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-OUT-6: web_search unattended denied without grant; restricted denies", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-websearch-unatt-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const unattCtx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-ws-u",
      sandbox_root: join(root, "alice", "files"),
      origin: "unattended",
      policy_snapshot: { origin: "unattended", tool_policy: "standard", model_mode: "local" },
    };
    const approval = new ApprovalSink({
      store,
      policy: unattCtx.policy_snapshot,
      toolPolicy: "standard",
    });
    const denied = await dispatchTool(
      {
        ctx: unattCtx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "local" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        extraToolImpl: async () => "{}",
      },
      { tool: "web_search", args: { query: "x" } },
    );
    assert.equal(denied.ok, false);

    const restrictedCtx: TurnContext = {
      ...unattCtx,
      origin: "attended",
      turn_id: "t-ws-r",
      policy_snapshot: { origin: "attended", tool_policy: "restricted", model_mode: "cloud" },
    };
    const restricted = new ApprovalSink({
      store,
      policy: restrictedCtx.policy_snapshot,
      toolPolicy: "restricted",
    });
    const blocked = await dispatchTool(
      {
        ctx: restrictedCtx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "cloud" }),
        approval: restricted,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        extraToolImpl: async () => "{}",
      },
      { tool: "web_search", args: { query: "x" } },
    );
    assert.equal(blocked.ok, false);
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

test("Schedules chat drops non-schedule fences and refuses them at dispatch", async () => {
  const parsed = parseAssistantToolCalls(
    '```envoyhome-tools\n[{"tool":"read_file","args":{"path":"documents/a.md"}},{"tool":"schedule","args":{"action":"list"}}]\n```',
    { allowSandbox: false, allowSmartHome: false, schedulesOnly: true },
  );
  assert.equal(parsed.tools.length, 1);
  assert.equal(parsed.tools[0]?.tool, "schedule");
  __resetActiveXForTests();
  const root = await mkdtemp(join(tmpdir(), "eh-turn-sched-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx = baseCtx({
      sandbox_root: join(root, "files"),
      turn_id: "t-sched-only",
      policy_snapshot: {
        origin: "attended",
        tool_policy: "standard",
        model_mode: "local",
        homeSurface: false,
        schedulesSurface: true,
      },
    });
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
    });
    const denied = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({
          router: new MixRouter(undefined, undefined),
          mode: "local",
        }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
      },
      { tool: "read_file", args: { path: "documents/a.md" } },
    );
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.match(denied.reason, /schedule tool/);
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

test("V-CRON-9: schedule confirm asks on attended; propose alone does not arm", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-sched-tool-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-sched",
      sandbox_root: join(root, "alice", "files"),
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "standard", model_mode: "cloud" },
    };
    let asked = 0;
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
      onApprovalNeeded: () => {
        asked += 1;
      },
      waitForAnswer: async () => "allow",
    });
    const deps = {
      ctx,
      provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "cloud" }),
      approval,
      fs: { writeFile: async () => undefined, readFile: async () => "" },
      extraToolImpl: async (tool: string, args: Record<string, unknown>) => {
        calls.push({ tool, args });
        if (tool === "schedule" && args.action === "propose") {
          return JSON.stringify({
            proposalId: "prop-1",
            note: "Not armed",
          });
        }
        if (tool === "schedule" && args.action === "confirm") {
          return JSON.stringify({ armed: true, job: { id: "job-1", enabled: true } });
        }
        throw new Error(`unexpected ${tool}`);
      },
    };
    const propose = await dispatchTool(deps, {
      tool: "schedule",
      args: { action: "propose", text: "Remind me in 5 minutes to stretch" },
    });
    assert.equal(propose.ok, true);
    assert.equal(asked, 0, "schedule propose should not ask");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.args.action, "propose");
    assert.ok(!String((propose as { output?: string }).output ?? "").includes('"armed":true'));

    asked = 0;
    const confirm = await dispatchTool(deps, {
      tool: "schedule",
      args: { action: "confirm", proposalId: "prop-1" },
    });
    assert.equal(confirm.ok, true);
    assert.ok(asked >= 1, "schedule confirm should ask");
    assert.equal(calls[1]!.args.action, "confirm");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-CRON-11: schedule confirm summary includes resolvedLocal from peek", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-sched-resolved-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-sched-res",
      sandbox_root: join(root, "alice", "files"),
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "standard", model_mode: "cloud" },
    };
    let summarySeen = "";
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
      onApprovalNeeded: (row) => {
        summarySeen = row.summary ?? "";
      },
      waitForAnswer: async () => "allow",
    });
    const result = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({ router: new MixRouter(undefined, undefined), mode: "cloud" }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        peekScheduleProposal: () => ({
          resolvedLocal: "2026-10-10 08:00 Asia/Shanghai",
        }),
        extraToolImpl: async () => JSON.stringify({ armed: true }),
      },
      {
        tool: "schedule",
        args: {
          action: "confirm",
          proposalId: "prop-x",
          payload: { kind: "agentTurn", prompt: "Draft a morning briefing" },
        },
      },
    );
    assert.equal(result.ok, true);
    assert.match(summarySeen, /2026-10-10 08:00 Asia\/Shanghai/);
    assert.match(summarySeen, /agent: Draft a morning briefing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("schedule JSON inside think with flat fields is a propose", () => {
  const raw = [
    "<think>",
    '{"tool":"schedule","action":"propose","text":"每周一早上9点","message":"新的一周开始了"}',
    "</think>",
    "可以排成每周一。",
  ].join("\n");
  const parsed = parseAssistantToolCalls(raw);
  assert.equal(parsed.tools.length, 1);
  assert.equal(parsed.tools[0]!.tool, "schedule");
  assert.equal(parsed.tools[0]!.args.action, "propose");
  assert.equal(parsed.tools[0]!.args.text, "每周一早上9点");
  assert.equal(parsed.tools[0]!.args.message, "新的一周开始了");
});

test("V-CRON-9: schedule fence parses without sandbox flag", () => {
  const raw = [
    "I'll set a reminder.",
    "```envoyhome-tools",
    JSON.stringify([
      { tool: "schedule", args: { action: "propose", text: "tomorrow at 8am stretch" } },
      { tool: "exec", args: { cmd: "rm -rf /" } },
    ]),
    "```",
  ].join("\n");
  const parsed = parseAssistantToolCalls(raw);
  assert.equal(parsed.tools.length, 1);
  assert.equal(parsed.tools[0]!.tool, "schedule");
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
      { tool: "export_document", args: { format: "docx", markdown: "# x" } },
    ]),
    "```",
  ].join("\n");
  // Default: smart-home only (sandbox off) — export_document ignored; exec ignored.
  const parsed = parseAssistantToolCalls(raw);
  assert.equal(parsed.tools.length, 1);
  assert.equal(parsed.tools[0]!.tool, "ha_call_service");
  assert.equal(
    (parsed.tools[0]!.args as { objectId: string }).objectId,
    "homeassistant:light.kitchen",
  );
  assert.match(parsed.replyText, /I'll turn it on/);
});

test("parseAssistantToolCalls: allowSandbox accepts export_document, still drops exec", () => {
  const raw = [
    "Here is your file.",
    "```envoyhome-tools",
    JSON.stringify([
      { tool: "export_document", args: { format: "docx", markdown: "# Hi", title: "Hi" } },
      { tool: "exec", args: { cmd: "rm -rf /" } },
      { tool: "ha_call_service", args: { objectId: "x" } },
    ]),
    "```",
  ].join("\n");
  const parsed = parseAssistantToolCalls(raw, {
    allowSandbox: true,
    allowSmartHome: false,
  });
  assert.equal(parsed.tools.length, 1);
  assert.equal(parsed.tools[0]!.tool, "export_document");
});

test("parseAssistantToolCalls: allowSandbox accepts list_dir and search_files", () => {
  const raw = [
    "Looking around.",
    "```envoyhome-tools",
    JSON.stringify([
      { tool: "list_dir", args: { path: "documents" } },
      { tool: "search_files", args: { pattern: "*.md", path: "documents" } },
      { tool: "http_fetch", args: { url: "https://evil.example/" } },
    ]),
    "```",
  ].join("\n");
  const parsed = parseAssistantToolCalls(raw, {
    allowSandbox: true,
    allowSmartHome: false,
  });
  assert.equal(parsed.tools.length, 2);
  assert.equal(parsed.tools[0]!.tool, "list_dir");
  assert.equal(parsed.tools[1]!.tool, "search_files");
});

test("V-OUT-5: dispatchTool list_dir + search_files via SandboxFs", async () => {
  __resetActiveXForTests();
  clearExtraToolSpecsForTests();
  const listed: string[] = [];
  const searched: Array<{ pattern: string; path?: string }> = [];
  const approval = {
    authorize: async () => "allow" as const,
  };
  const ctx = {
    account_id: "a",
    agent_id: "agent",
    turn_id: "t1",
    session_id: "s1",
    origin: "attended" as const,
    policy_snapshot: {
      origin: "attended" as const,
      tool_policy: "standard" as const,
      model_mode: "cloud" as const,
    },
  };
  const deps = {
    ctx,
    provider: {} as never,
    approval: approval as never,
    fs: {
      writeFile: async () => undefined,
      readFile: async () => "",
      listDir: async (path: string) => {
        listed.push(path);
        return JSON.stringify({ path, roots: [], entries: [{ name: "a.md", kind: "file", path: "documents/a.md" }] });
      },
      searchFiles: async (opts: { pattern: string; path?: string }) => {
        searched.push(opts);
        return JSON.stringify({ pattern: opts.pattern, path: opts.path ?? "", hits: [] });
      },
    },
  };
  const listResult = await dispatchTool(deps as never, {
    tool: "list_dir",
    args: { path: "documents" },
    digest: "d1",
  });
  assert.equal(listResult.ok, true);
  if (listResult.ok) {
    assert.ok(listResult.output.includes("a.md"));
  }
  assert.deepEqual(listed, ["documents"]);

  const searchResult = await dispatchTool(deps as never, {
    tool: "search_files",
    args: { pattern: "*.md", path: "documents" },
    digest: "d2",
  });
  assert.equal(searchResult.ok, true);
  assert.equal(searched.length, 1);
  assert.equal(searched[0]!.pattern, "*.md");

  const lines = formatSandboxToolResultLines([
    { tool: "list_dir", output: listResult.ok ? listResult.output : "" },
    { tool: "search_files", output: searchResult.ok ? searchResult.output : "" },
  ]);
  assert.ok(lines.some((l) => l.startsWith("list_dir")));
  assert.ok(lines.some((l) => l.startsWith("search_files")));
});

test("V-OUT-3: normalizeSandboxEchoPath for Open chips", () => {
  assert.equal(normalizeSandboxEchoPath("./documents/note.md"), "documents/note.md");
  assert.equal(normalizeSandboxEchoPath("/documents/note.md"), "documents/note.md");
  assert.equal(normalizeSandboxEchoPath(String.raw`documents\note.md`), "documents/note.md");
  assert.equal(normalizeSandboxEchoPath("workspace/Desktop/a.md"), "workspace/Desktop/a.md");
});

test("V-OUT-3: write_file echo + formatSandboxToolResultLines keep chip path", async () => {
  __resetActiveXForTests();
  clearExtraToolSpecsForTests();
  const root = await mkdtemp(join(tmpdir(), "eh-write-echo-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx = baseCtx({
      sandbox_root: join(root, "files"),
      turn_id: "t-write-echo",
      origin: "attended",
      policy_snapshot: {
        origin: "attended",
        tool_policy: "standard",
        model_mode: "local",
      },
    });
    const approval = new ApprovalSink({
      store,
      policy: ctx.policy_snapshot,
      toolPolicy: "standard",
    });
    const result = await dispatchTool(
      {
        ctx,
        provider: new ProviderHandle({
          router: new MixRouter(undefined, undefined),
          mode: "local",
        }),
        approval,
        fs: {
          writeFile: async () => undefined,
          readFile: async () => "",
        },
      },
      {
        tool: "write_file",
        args: { path: "./documents/hello.md", content: "hi" },
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.output, "Written: `documents/hello.md`");
    const lines = formatSandboxToolResultLines([
      { tool: "write_file", output: result.output },
    ]);
    assert.equal(lines[0], "Written: `documents/hello.md`");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatSandboxToolResultLines: export_document uri", () => {
  const lines = formatSandboxToolResultLines([
    {
      tool: "export_document",
      output: JSON.stringify({
        uri: "output/exports/hi-abc.docx",
        bytes: 1200,
        format: "docx",
      }),
    },
  ]);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /output\/exports\/hi-abc\.docx/);
  assert.match(lines[0]!, /docx/);
});

test("formatSandboxToolResultLines: extract_document uri", () => {
  const lines = formatSandboxToolResultLines([
    {
      tool: "extract_document",
      output: JSON.stringify({
        uri: "output/extracts/note-abc.md",
        extractChars: 80,
        extractor: "anydoc-v1",
        sourcePath: "documents/note.docx",
      }),
    },
  ]);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /output\/extracts\/note-abc\.md/);
  assert.match(lines[0]!, /documents\/note\.docx/);
});

test("V-CRON-11: formatScheduleToolOutput / sandbox lines surface resolvedLocal", () => {
  const out = JSON.stringify({
    proposalId: "p1",
    resolvedLocal: "2026-10-10 08:00 Asia/Shanghai",
    relativeHint: "in 18 hours",
    kind: "at",
  });
  assert.match(formatScheduleToolOutput(out)!, /Proposed for 2026-10-10 08:00/);
  assert.match(formatScheduleToolOutput(out)!, /in 18 hours/);
  const lines = formatSandboxToolResultLines([{ tool: "schedule", output: out }]);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /Proposed for 2026-10-10 08:00 Asia\/Shanghai/);
  assert.doesNotMatch(lines[0]!, /proposalId/);
});

test("reminder honesty guard: soft offers do not trip claimsReminderWithoutPropose", () => {
  assert.equal(claimsReminderWithoutPropose("I can remind you tomorrow if you want."), false);
  assert.equal(claimsReminderWithoutPropose("Would you like me to set a reminder?"), false);
  assert.equal(claimsReminderWithoutPropose("要不要我提醒你？"), false);
  assert.equal(claimsReminderWithoutPropose("Soll ich dich erinnern?"), false);
  assert.equal(claimsReminderWithoutPropose("Veux-tu que je te rappelle?"), false);
  assert.equal(claimsReminderWithoutPropose("리마인더를 설정할까요?"), false);
  assert.equal(claimsReminderWithoutPropose("I'll set a reminder for you tomorrow."), true);
  assert.equal(claimsReminderWithoutPropose("I've scheduled a reminder for 9am."), true);
  assert.equal(claimsReminderWithoutPropose("已经帮你设好提醒了"), true);
  assert.equal(claimsReminderWithoutPropose("Ich habe eine Erinnerung gesetzt."), true);
  assert.equal(claimsReminderWithoutPropose("J'ai créé un rappel pour demain."), true);
  assert.equal(claimsReminderWithoutPropose("リマインダーを設定しました"), true);
});

test("reminder honesty guard: promise without schedule propose gets disclaimer", async () => {
  __resetActiveXForTests();
  const root = await mkdtemp(join(tmpdir(), "eh-turn-remind-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx = baseCtx({
      sandbox_root: join(root, "files"),
      turn_id: "t-remind-honest",
      policy_snapshot: {
        origin: "attended",
        tool_policy: "standard",
        model_mode: "local",
      },
    });
    const events = [];
    for await (const ev of runTurn({
      userText: "remind me tomorrow",
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
        completionText: "I'll set a reminder for you tomorrow morning.",
      },
    })) {
      events.push(ev);
    }
    const text = events.find((e) => e.kind === "text")?.text ?? "";
    assert.match(text, /No schedule propose ran/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("chat turn: export_document fence dispatches without home toolLoop", async () => {
  __resetActiveXForTests();
  clearExtraToolSpecsForTests();
  const root = await mkdtemp(join(tmpdir(), "eh-turn-export-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const ctx = baseCtx({
      sandbox_root: join(root, "files"),
      turn_id: "t-export",
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
    let exportArgs: Record<string, unknown> | undefined;
    const gen = runTurn({
      userText: "make a word doc",
      toolLoop: false,
      deps: {
        ctx,
        provider: new ProviderHandle({
          router: new MixRouter(undefined, undefined),
          mode: "local",
        }),
        approval,
        fs: { writeFile: async () => undefined, readFile: async () => "" },
        extraToolImpl: async (tool, args) => {
          assert.equal(tool, "export_document");
          exportArgs = args;
          return JSON.stringify({
            uri: "output/exports/hi.docx",
            bytes: 42,
            format: "docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
        },
        completionText: [
          "I'll export it.",
          "```envoyhome-tools",
          JSON.stringify({
            tool: "export_document",
            args: { format: "docx", markdown: "# Hi", title: "Hi" },
          }),
          "```",
        ].join("\n"),
      },
    });
    const events = [];
    for await (const ev of gen) events.push(ev);
    assert.ok(exportArgs);
    assert.equal(exportArgs!.format, "docx");
    assert.ok(events.some((e) => e.kind === "tool_call" && e.tool === "export_document"));
    assert.ok(events.some((e) => e.kind === "tool_result"));
    const textEv = events.find((e) => e.kind === "text");
    assert.ok(textEv?.text);
    assert.match(textEv!.text!, /output\/exports\/hi\.docx/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
