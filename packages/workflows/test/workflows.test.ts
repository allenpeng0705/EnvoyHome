import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSingleTriggerClass,
  executeWorkflow,
  loadWorkflows,
  matchKeywordWorkflow,
  matchScheduleWorkflows,
  mergeWorkflows,
  type WorkflowDef,
} from "../dist/index.js";

test("V-DAG-1/2: keyword match routes; unmatched falls through", () => {
  const workflows: WorkflowDef[] = [
    {
      id: "morning",
      match: { keywords: ["brief", "morning"] },
      steps: [{ type: "llm_summarize", prompt: "summarize" }],
    },
  ];
  assert.equal(matchKeywordWorkflow("morning brief please", workflows)?.id, "morning");
  assert.equal(matchKeywordWorkflow("hello world", workflows), undefined);
});

test("V-DAG-5: schedule/event triggers; dual class rejected", () => {
  assert.throws(
    () =>
      assertSingleTriggerClass({
        id: "bad",
        match: { keywords: ["x"], schedule: "0 7 * * *" },
        steps: [],
      }),
    /trigger_ambiguous/,
  );
  const scheduled: WorkflowDef[] = [
    { id: "cron", match: { schedule: "0 7 * * *" }, steps: [] },
  ];
  assert.equal(matchScheduleWorkflows(scheduled).length, 1);
});

test("V-DAG-3: tool step goes through injected runner (policy gate stand-in)", async () => {
  const calls: string[] = [];
  const results = await executeWorkflow(
    {
      id: "t",
      match: { keywords: ["go"] },
      steps: [{ type: "tool", name: "sandbox_write", args: { path: "a.txt" } }],
    },
    {
      tool: async (name) => {
        calls.push(name);
      },
      llm: async () => "",
    },
  );
  assert.deepEqual(calls, ["sandbox_write"]);
  assert.equal(results[0]?.ok, true);
});

test("V-DAG-4: llm_summarize step uses injected llm (local model stand-in)", async () => {
  const prompts: string[] = [];
  const results = await executeWorkflow(
    {
      id: "nightly",
      match: { keywords: ["digest"] },
      steps: [{ type: "llm_summarize", prompt: "summarize inbox" }],
    },
    {
      tool: async () => undefined,
      llm: async (p) => {
        prompts.push(p);
        return "local summary";
      },
    },
  );
  assert.deepEqual(prompts, ["summarize inbox"]);
  assert.equal(results[0]?.ok, true);
});

test("YAML workflow file loads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-wf-yaml-"));
  try {
    await writeFile(
      join(dir, "cron.yml"),
      "id: cron\nmatch:\n  schedule: '0 7 * * *'\nsteps: []\n",
    );
    const loaded = await loadWorkflows(dir);
    assert.equal(loaded[0]?.id, "cron");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("overlay replaces global by id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-wf-"));
  try {
    await writeFile(
      join(dir, "a.json"),
      JSON.stringify({ id: "a", match: { keywords: ["x"] }, steps: [] }),
    );
    const global = await loadWorkflows(dir);
    const merged = mergeWorkflows(global, [
      { id: "a", match: { keywords: ["y"] }, steps: [] },
    ]);
    assert.deepEqual(merged[0]?.match.keywords, ["y"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
