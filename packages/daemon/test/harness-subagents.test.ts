// V-P2-AGENT-3 — LocalMeshSubmitter + Agent children (P2-E2 full).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runTaskTool,
  runSpawnHelperTool,
  __resetPhase2ToolsForTests,
  TASK_MAX_SUBAGENTS,
  createHomeMeshSubmitter,
  homeSubagentInput,
  textFromSubagentResult,
  HomeModelAdapter,
} from "../dist/index.js";
import type { ModelAdapter, ModelResponse } from "@envoymesh/envoy-harness";

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

test("V-P2-AGENT-3: LocalMeshSubmitter + Agent returns completed text", async () => {
  const model = scriptedModel([
    {
      content: [{ type: "text", text: "reviewed PR carefully" }],
      stopReason: "end_turn",
    },
  ]);
  const submitter = createHomeMeshSubmitter({
    model,
    allowTools: ["read_file"],
    cwd: "/tmp",
    dispatch: async () => "should-not-run",
  });
  const result = await submitter.submit(
    homeSubagentInput("review this PR"),
    AbortSignal.timeout(15_000),
  );
  assert.equal(result.status, "completed");
  assert.match(textFromSubagentResult(result), /reviewed PR/);
  assert.equal(result.workerPeerId, "envoyhome-local");
});

test("V-P2-AGENT-3: Agent runs Home tool from envoyhome-tools fence", async () => {
  const calls: string[] = [];
  const model = scriptedModel([
    {
      content: [
        {
          type: "text",
          text: '```envoyhome-tools\n[{"tool":"read_file","args":{"path":"notes/a.txt"}}]\n```',
        },
      ],
      stopReason: "end_turn", // HomeModelAdapter would rewrite; here we emit tool_call directly next
    },
  ]);
  // Use HomeModelAdapter wrapping a text complete that returns a fence once, then final answer.
  let round = 0;
  const fenceModel = new HomeModelAdapter(async () => {
    round += 1;
    if (round === 1) {
      return 'Looking.\n```envoyhome-tools\n[{"tool":"read_file","args":{"path":"notes/a.txt"}}]\n```';
    }
    return "File says hello";
  });
  void model;
  const submitter = createHomeMeshSubmitter({
    model: fenceModel,
    allowTools: ["read_file"],
    cwd: "/tmp",
    dispatch: async (tool, args) => {
      calls.push(`${tool}:${String(args.path ?? "")}`);
      return "hello from jail";
    },
  });
  const result = await submitter.submit(
    homeSubagentInput("read notes/a.txt"),
    AbortSignal.timeout(15_000),
  );
  assert.equal(result.status, "completed");
  assert.deepEqual(calls, ["read_file:notes/a.txt"]);
  assert.match(textFromSubagentResult(result), /hello|File says/i);
});

test("V-P2-AGENT-3: task batches via runMeshChild; inherits origin", async () => {
  __resetPhase2ToolsForTests();
  const out = JSON.parse(
    await runTaskTool({
      args: {
        tasks: [{ objective: "a" }, { objective: "b" }],
        allowTools: ["read_file", "exec", "task"],
      },
      accountId: "alice",
      origin: "attended",
      helperDepth: 0,
      maxParallel: 2,
      runMeshChild: async ({ objective, allowTools }) => {
        assert.ok(!allowTools.includes("exec"));
        assert.ok(!allowTools.includes("task"));
        const model = scriptedModel([
          { content: [{ type: "text", text: `done:${objective}` }], stopReason: "end_turn" },
        ]);
        const submitter = createHomeMeshSubmitter({
          model,
          allowTools,
          cwd: "/tmp",
          dispatch: async () => "",
        });
        return submitter.submit(homeSubagentInput(objective), AbortSignal.timeout(10_000));
      },
    }),
  );
  assert.equal(out.ok, true);
  assert.equal(out.engine, "local-mesh");
  assert.equal(out.count, 2);
  assert.equal(out.origin, "attended");
  assert.equal(out.results[0].via, "local-mesh");
  assert.match(out.results[0].reply, /done:a/);
  assert.match(out.results[1].reply, /done:b/);
});

test("V-P2-AGENT-3: refuse-all when over maxSubagents", async () => {
  __resetPhase2ToolsForTests();
  const tasks = Array.from({ length: TASK_MAX_SUBAGENTS + 1 }, (_, i) => ({
    objective: `item ${i}`,
  }));
  await assert.rejects(
    () =>
      runTaskTool({
        args: { tasks },
        accountId: "alice",
        origin: "attended",
        helperDepth: 0,
        complete: async () => "x",
      }),
    /maxSubagents reached/,
  );
});

test("V-P2-AGENT-3: nested task refused; spawn_helper wraps mesh task", async () => {
  __resetPhase2ToolsForTests();
  await assert.rejects(
    () =>
      runTaskTool({
        args: { objective: "nested" },
        accountId: "alice",
        origin: "unattended",
        helperDepth: 1,
        complete: async () => "nope",
      }),
    /depth limit/,
  );

  const single = JSON.parse(
    await runSpawnHelperTool({
      args: { prompt: "one child", allowTools: ["read_file", "exec"] },
      accountId: "bob",
      origin: "unattended",
      helperDepth: 0,
      runMeshChild: async ({ objective, allowTools }) => {
        assert.deepEqual(allowTools, ["read_file"]);
        const model = scriptedModel([
          { content: [{ type: "text", text: "ok-reply" }], stopReason: "end_turn" },
        ]);
        const submitter = createHomeMeshSubmitter({
          model,
          allowTools,
          cwd: "/tmp",
          dispatch: async () => "",
        });
        return submitter.submit(homeSubagentInput(objective), AbortSignal.timeout(10_000));
      },
    }),
  );
  assert.equal(single.ok, true);
  assert.equal(single.via, "task");
  assert.equal(single.engine, "local-mesh");
  assert.equal(single.origin, "unattended");
  assert.equal(single.reply, "ok-reply");
});

test("V-P2-AGENT-3: complete fallback still works for unit tests", async () => {
  __resetPhase2ToolsForTests();
  const out = JSON.parse(
    await runTaskTool({
      args: { tasks: [{ objective: "ok" }, { objective: "boom" }] },
      accountId: "alice",
      origin: "attended",
      helperDepth: 0,
      complete: async (prompt) => {
        if (prompt.includes("boom")) throw new Error("child exploded");
        return "fine";
      },
    }),
  );
  assert.equal(out.ok, false);
  assert.equal(out.engine, "complete");
  assert.equal(out.results[0].ok, true);
  assert.equal(out.results[1].ok, false);
});
