// V-P2-AGENT-4 — parent turn via envoy-harness Agent (P2-E3).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelAdapter, ModelResponse } from "@envoymesh/envoy-harness";
import {
  HomeModelAdapter,
  buildParentToolRegistry,
  homeTaskArgsToHarness,
  parentAgentEnabled,
  parentToolNamesForSurface,
  runAgentTurn,
  createHomeMeshSubmitter,
  homeSubagentInput,
  textFromSubagentResult,
} from "../dist/index.js";
import type { TurnContext, TurnDeps } from "@envoyhome/harness-host";

function scriptedModel(script: ModelResponse[]): ModelAdapter {
  let i = 0;
  return {
    async complete() {
      const next = script[i++];
      if (!next) throw new Error("FakeModel script exhausted");
      return next;
    },
  };
}

function baseCtx(overrides?: Partial<TurnContext["policy_snapshot"]>): TurnContext {
  return {
    account_id: "acct-1",
    agent_id: "default",
    session_id: "sess-1",
    turn_id: "turn-1",
    sandbox_root: "/tmp/envoyhome-parent-agent",
    workspace_root: "/tmp/envoyhome-parent-agent",
    workspace_mode: "sandbox",
    workspace_mounts: [],
    origin: "attended",
    policy_snapshot: {
      origin: "attended",
      tool_policy: "standard",
      model_mode: "auto",
      homeSurface: false,
      schedulesSurface: false,
      ...overrides,
    },
  };
}

function stubDeps(ctx: TurnContext, dispatchImpl?: TurnDeps["fs"]): TurnDeps {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  return {
    ctx,
    provider: {
      complete: async () => ({ text: "unused" }),
      ensurePicked: () => undefined,
      lastPick: () => undefined,
    } as TurnDeps["provider"],
    approval: {
      authorize: async () => "allowed" as const,
    } as TurnDeps["approval"],
    fs: dispatchImpl ?? {
      readFile: async () => "file-body",
      writeFile: async () => undefined,
      listDir: async () => [],
      searchFiles: async () => [],
    },
    __calls: calls,
  } as TurnDeps & { __calls: typeof calls };
}

test("V-P2-AGENT-4: parentAgentEnabled defaults on; 0 disables", () => {
  const prev = process.env.ENVOYHOME_PARENT_AGENT;
  try {
    delete process.env.ENVOYHOME_PARENT_AGENT;
    assert.equal(parentAgentEnabled(), true);
    process.env.ENVOYHOME_PARENT_AGENT = "0";
    assert.equal(parentAgentEnabled(), false);
    process.env.ENVOYHOME_PARENT_AGENT = "1";
    assert.equal(parentAgentEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.ENVOYHOME_PARENT_AGENT;
    else process.env.ENVOYHOME_PARENT_AGENT = prev;
  }
});

test("V-P2-AGENT-4: parentToolNamesForSurface respects schedules/home", () => {
  const base = parentToolNamesForSurface({ homeSurface: false, schedulesSurface: false });
  assert.ok(base.includes("read_file"));
  assert.ok(!base.includes("task"));
  assert.ok(!base.includes("ha_call_service"));

  const home = parentToolNamesForSurface({ homeSurface: true, schedulesSurface: false });
  assert.ok(home.includes("ha_call_service"));
  assert.ok(home.includes("mqtt_publish"));

  const sched = parentToolNamesForSurface({ homeSurface: true, schedulesSurface: true });
  assert.deepEqual(sched, ["schedule"]);
});

test("V-P2-AGENT-4: homeTaskArgsToHarness fills capability/cost/deadline", () => {
  const one = homeTaskArgsToHarness({ objective: "summarize notes" });
  assert.equal(one.objective, "summarize notes");
  assert.equal(one.capability_tag, "home-helper");
  assert.equal(typeof one.cost_ceiling_usd, "number");
  assert.equal(typeof one.deadline_ms, "number");

  const batch = homeTaskArgsToHarness({
    tasks: [{ prompt: "a" }, { objective: "b" }],
  });
  assert.ok(Array.isArray(batch.tasks));
  assert.equal((batch.tasks as unknown[]).length, 2);
});

test("V-P2-AGENT-4: parent Agent end_turn text → TurnEvent text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-parent-"));
  const model = scriptedModel([
    { content: [{ type: "text", text: "Hello from parent Agent" }], stopReason: "end_turn" },
  ]);
  const deps = stubDeps(baseCtx());
  const events = [];
  for await (const ev of runAgentTurn({
    userText: "hi",
    history: [],
    deps,
    sessionDir: dir,
    sessionId: "sess-1",
    turnId: "turn-1",
    model,
  })) {
    events.push(ev);
  }
  const text = events.filter((e) => e.kind === "text").map((e) => e.text).join("");
  assert.match(text, /Hello from parent Agent/);
});

test("V-P2-AGENT-4: Agent systemPrompt must not write to Home transcript", async () => {
  const { isHarnessAgentSystemPromptLeak } = await import("../dist/index.js");
  const { appendTranscriptLine, readTranscript } = await import("@envoyhome/harness-host");
  const dir = await mkdtemp(join(tmpdir(), "eh-parent-sys-"));
  const model = scriptedModel([
    {
      content: [
        {
          type: "text",
          text: "<think>planning</think>\nHello — real reply only.",
        },
      ],
      stopReason: "end_turn",
    },
  ]);
  const deps = stubDeps(baseCtx());
  for await (const _ev of runAgentTurn({
    userText: "hi",
    history: [],
    deps,
    sessionDir: dir,
    sessionId: "sess-1",
    turnId: "turn-1",
    model,
  })) {
    /* drain */
  }
  // TurnService persists assistant text; HomeAgentSession must not persist systemPrompt.
  // Simulate what Agent would have written if persist leaked — ensure our session skips it.
  const { HomeAgentSession } = await import("../dist/index.js");
  const session = new HomeAgentSession({
    id: "s-leak",
    sessionDir: dir,
    cwd: dir,
    turnId: "turn-leak",
    userAlreadyPersisted: true,
  });
  session.appendMessage("system", [
    {
      type: "text",
      text: "You are EnvoyHome, the household agent (Design §19.13 P2-E3).\nAvailable tools: read_file",
    },
  ]);
  await session.flush();
  const lines = await readTranscript(dir);
  const leaked = lines.filter(
    (l) =>
      String(l.role) === "system" &&
      isHarnessAgentSystemPromptLeak(String(l.text ?? l.content ?? "")),
  );
  assert.equal(leaked.length, 0, "systemPrompt must not appear in transcript.jsonl");
  assert.ok(isHarnessAgentSystemPromptLeak("You are EnvoyHome, the household agent (Design §19.13 P2-E3)."));
  // Pre-existing leak still detectable for client filter.
  await appendTranscriptLine(dir, {
    role: "system",
    text: "You are EnvoyHome, the household agent (Design §19.13 P2-E3).\nAvailable tools: x",
    at: new Date().toISOString(),
  });
  const after = await readTranscript(dir);
  assert.ok(
    after.some((l) => isHarnessAgentSystemPromptLeak(String(l.text ?? ""))),
    "fixture leak present for filter test",
  );
});

test("V-P2-AGENT-4: parent fence → read_file via jail dispatch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-parent-"));
  const dispatched: string[] = [];
  let round = 0;
  const fenceModel = new HomeModelAdapter(
    async () => {
      round += 1;
      if (round === 1) {
        return '```envoyhome-tools\n[{"tool":"read_file","args":{"path":"notes/a.txt"}}]\n```';
      }
      return "File contents noted.";
    },
    { allowSandbox: true, normalizeTaskArgs: true },
  );

  const ctx = baseCtx();
  const deps: TurnDeps = {
    ctx,
    provider: {
      complete: async () => ({ text: "" }),
      ensurePicked: () => undefined,
      lastPick: () => undefined,
    } as TurnDeps["provider"],
    approval: {
      authorize: async () => "allowed" as const,
    } as TurnDeps["approval"],
    fs: {
      readFile: async (path: string) => {
        dispatched.push(path);
        return "hello-jail";
      },
      writeFile: async () => undefined,
    } as TurnDeps["fs"],
  };

  // Patch dispatch by wrapping runAgentTurn's registry path: use mesh stub + model
  // that drives tools through buildParentToolRegistry via Agent.
  const events = [];
  for await (const ev of runAgentTurn({
    userText: "read notes",
    history: [],
    deps,
    sessionDir: dir,
    sessionId: "sess-1",
    turnId: "turn-1",
    model: fenceModel,
  })) {
    events.push(ev);
  }
  assert.ok(
    events.some((e) => e.kind === "tool_call" && e.tool === "read_file"),
    "expected read_file tool_call",
  );
  assert.ok(
    events.some((e) => e.kind === "tool_result" && e.text?.includes("hello-jail")),
    "expected jail read result",
  );
});

test("V-P2-AGENT-4: approval deny fail-closed on parent tool", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-parent-"));
  let round = 0;
  const fenceModel = new HomeModelAdapter(
    async () => {
      round += 1;
      if (round === 1) {
        return '```envoyhome-tools\n[{"tool":"write_file","args":{"path":"x.txt","content":"no"}}]\n```';
      }
      return "Could not write.";
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
    approval: {
      authorize: async () => "denied" as const,
    } as TurnDeps["approval"],
    fs: {
      readFile: async () => "",
      writeFile: async () => {
        throw new Error("should not write");
      },
    } as TurnDeps["fs"],
  };
  const events = [];
  for await (const ev of runAgentTurn({
    userText: "write",
    history: [],
    deps,
    sessionDir: dir,
    sessionId: "sess-1",
    turnId: "turn-1",
    model: fenceModel,
  })) {
    events.push(ev);
  }
  assert.ok(
    events.some(
      (e) =>
        (e.kind === "tool_result" && e.text?.includes("approval_denied")) ||
        (e.kind === "error" && e.text?.includes("approval_denied")),
    ),
    "expected approval_denied",
  );
});

test("V-P2-AGENT-4: schedulesSurface only registers schedule", () => {
  const names = parentToolNamesForSurface({ homeSurface: false, schedulesSurface: true });
  const reg = buildParentToolRegistry(names, async () => "ok");
  assert.equal(reg.get("schedule")?.name, "schedule");
  assert.equal(reg.get("read_file"), undefined);
});

test("V-P2-AGENT-4: parent meshSubmitter depth-1 (child has no nested mesh)", async () => {
  const model = scriptedModel([
    { content: [{ type: "text", text: "child done" }], stopReason: "end_turn" },
  ]);
  const submitter = createHomeMeshSubmitter({
    model,
    allowTools: ["read_file"],
    cwd: "/tmp",
    dispatch: async () => "x",
  });
  const result = await submitter.submit(homeSubagentInput("do thing"), AbortSignal.timeout(10_000));
  assert.equal(result.status, "completed");
  assert.match(textFromSubagentResult(result), /child done/);
});

test("V-P2-AGENT-4: HomeAgentSession seeds history (transcript durable read)", async () => {
  const { HomeAgentSession } = await import("../dist/index.js");
  const { appendTranscriptLine } = await import("@envoyhome/harness-host");
  const dir = await mkdtemp(join(tmpdir(), "eh-sess-"));
  await appendTranscriptLine(dir, {
    role: "user",
    text: "earlier",
    at: new Date().toISOString(),
  });
  await appendTranscriptLine(dir, {
    role: "assistant",
    text: "prior reply",
    at: new Date().toISOString(),
  });
  const raw = await readFile(join(dir, "transcript.jsonl"), "utf8");
  assert.match(raw, /prior reply/);
  const session = new HomeAgentSession({
    id: "s1",
    sessionDir: dir,
    cwd: dir,
    history: [
      { role: "user", content: "earlier" },
      { role: "assistant", content: "prior reply" },
    ],
    userAlreadyPersisted: true,
  });
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[1]?.role, "assistant");
});

test("V-P2-AGENT-4: parent task fence → LocalMeshSubmitter child", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-parent-task-"));
  const meshCalls: string[] = [];
  const childModel = scriptedModel([
    {
      content: [{ type: "text", text: "child summarized the notes carefully" }],
      stopReason: "end_turn",
    },
  ]);
  const mesh = createHomeMeshSubmitter({
    model: childModel,
    allowTools: ["read_file"],
    cwd: "/tmp",
    dispatch: async () => "unused",
    parentSessionId: "sess-1",
  });
  const origSubmit = mesh.submit.bind(mesh);
  mesh.submit = async (input, signal) => {
    meshCalls.push(input.objective);
    return origSubmit(input, signal);
  };

  let parentRound = 0;
  const parentOnlyModel = new HomeModelAdapter(
    async () => {
      parentRound += 1;
      if (parentRound === 1) {
        return '```envoyhome-tools\n[{"tool":"task","args":{"objective":"summarize the notes"}}]\n```';
      }
      return "Done — helper summarized the notes.";
    },
    { allowSandbox: true, normalizeTaskArgs: true },
  );

  const events = [];
  for await (const ev of runAgentTurn({
    userText: "summarize via helper",
    history: [],
    deps: stubDeps(baseCtx()),
    sessionDir: dir,
    sessionId: "sess-1",
    turnId: "turn-1",
    model: parentOnlyModel,
    meshSubmitter: mesh,
  })) {
    events.push(ev);
  }

  assert.ok(meshCalls.some((o) => /summarize the notes/.test(o)), "mesh submit called");
  assert.ok(
    events.some((e) => e.kind === "tool_call" && e.tool === "task"),
    "expected task tool_call",
  );
  assert.ok(
    events.some((e) => e.kind === "tool_result" && e.tool === "task"),
    "expected task tool_result",
  );
  const text = events.filter((e) => e.kind === "text").map((e) => e.text).join("");
  assert.match(text, /Done|helper|summarized/i);
});

test("V-P2-AGENT-4: recover runs before claimsActuation honesty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-parent-recover-"));
  const model = scriptedModel([
    {
      content: [
        {
          type: "text",
          text: "I've submitted Approvals to turn on the hallway light.",
        },
      ],
      stopReason: "end_turn",
    },
  ]);
  const deps = stubDeps(baseCtx({ homeSurface: true }));
  deps.recoverHomeTools = () => [
    {
      tool: "ha_call_service",
      args: { objectId: "homeassistant:light.hallway", domain: "light", service: "turn_on" },
      summary: "Turn on hallway light",
    },
  ];
  // dispatchTool needs homeSurface; approve allow; workflow extras may be missing —
  // recover path calls dispatchTool which may fail without HA backends. Stub via
  // catching: if error, still assert we attempted recover (tool_call) not honesty string.
  const events = [];
  for await (const ev of runAgentTurn({
    userText: "turn on hallway light",
    history: [],
    deps,
    sessionDir: dir,
    sessionId: "sess-1",
    turnId: "turn-1",
    model,
    toolLoop: true,
  })) {
    events.push(ev);
  }
  assert.ok(
    events.some((e) => e.kind === "tool_call" && e.tool === "ha_call_service"),
    "expected recover to dispatch ha_call_service",
  );
  const text = events.filter((e) => e.kind === "text").map((e) => e.text).join("");
  assert.ok(
    !/I did not actually submit an Approvals request/i.test(text),
    "must not hit claimsActuation honesty when recover succeeds path started",
  );
});

test("V-P2-AGENT-4: tool_call yields before final text (live Tracer)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-parent-live-"));
  let round = 0;
  const fenceModel = new HomeModelAdapter(
    async () => {
      round += 1;
      if (round === 1) {
        return '```envoyhome-tools\n[{"tool":"read_file","args":{"path":"a.txt"}}]\n```';
      }
      return "Read done.";
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
      readFile: async () => {
        // Stall briefly so live yield can surface tool_call before agent ends.
        await new Promise((r) => setTimeout(r, 20));
        return "body";
      },
      writeFile: async () => undefined,
    } as TurnDeps["fs"],
  };
  const order: string[] = [];
  for await (const ev of runAgentTurn({
    userText: "read",
    history: [],
    deps,
    sessionDir: dir,
    sessionId: "sess-1",
    turnId: "turn-1",
    model: fenceModel,
  })) {
    order.push(ev.kind);
  }
  const toolIdx = order.indexOf("tool_call");
  const textIdx = order.indexOf("text");
  assert.ok(toolIdx >= 0 && textIdx >= 0, "need tool_call and text");
  assert.ok(toolIdx < textIdx, "tool_call must arrive before final text");
});
