import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSingleTriggerClass,
  compileWorkflowGraph,
  executeWorkflow,
  loadWorkflows,
  matchKeywordWorkflow,
  matchScheduleWorkflows,
  mergeWorkflows,
  normalizeLlmOutput,
  parseWorkflowFile,
  type WorkflowDef,
} from "../dist/index.js";

test("V-DAG-1/2: keyword match routes; unmatched falls through", () => {
  const workflows: WorkflowDef[] = [
    compileWorkflowGraph({
      id: "morning",
      match: { keywords: ["brief", "morning"] },
      steps: [{ type: "llm_summarize", prompt: "summarize" }],
    }),
  ];
  assert.equal(matchKeywordWorkflow("morning brief please", workflows)?.id, "morning");
  assert.equal(matchKeywordWorkflow("hello world", workflows), undefined);
});

test("disabled workflow is not matched", () => {
  const workflows: WorkflowDef[] = [
    compileWorkflowGraph({
      id: "morning",
      match: { keywords: ["brief"] },
      enabled: false,
      steps: [{ type: "llm_summarize", prompt: "summarize" }],
    }),
  ];
  assert.equal(matchKeywordWorkflow("brief", workflows), undefined);
});

test("V-DAG-5: schedule/event triggers; dual class rejected", () => {
  assert.throws(
    () =>
      assertSingleTriggerClass({
        id: "bad",
        match: { keywords: ["x"], schedule: "0 7 * * *" },
      }),
    /trigger_ambiguous/,
  );
  const scheduled: WorkflowDef[] = [
    compileWorkflowGraph({ id: "cron", match: { schedule: "0 7 * * *" }, steps: [] }),
  ];
  assert.equal(matchScheduleWorkflows(scheduled).length, 1);
});

test("V-DAG-3: tool step goes through injected runner (policy gate stand-in)", async () => {
  const calls: string[] = [];
  const results = await executeWorkflow(
    compileWorkflowGraph({
      id: "t",
      match: { keywords: ["go"] },
      steps: [{ type: "tool", name: "sandbox_write", args: { path: "a.txt" } }],
    }),
    {
      tool: async (name) => {
        calls.push(name);
      },
      llm: async () => "",
    },
  );
  assert.deepEqual(calls, ["sandbox_write"]);
  assert.equal(results[0]?.ok, true);
  assert.equal(results[0]?.nodeId, "step_0");
});

test("V-DAG-4: llm_summarize step uses injected llm (local model stand-in)", async () => {
  const prompts: string[] = [];
  const results = await executeWorkflow(
    compileWorkflowGraph({
      id: "nightly",
      match: { keywords: ["digest"] },
      steps: [{ type: "llm_summarize", prompt: "summarize inbox" }],
    }),
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

test("V-DAG-6: cycle rejected at load", () => {
  assert.throws(
    () =>
      compileWorkflowGraph({
        id: "loop",
        match: { keywords: ["x"] },
        nodes: [
          { id: "a", type: "llm_fill", prompt: "a" },
          { id: "b", type: "llm_fill", prompt: "b" },
        ],
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
      }),
    /workflow\.cycle/,
  );
});

test("V-DAG-7: conditional branch takes matching edge only", async () => {
  const tools: string[] = [];
  const def = compileWorkflowGraph({
    id: "triage",
    match: { keywords: ["ticket"] },
    nodes: [
      { id: "classify", type: "llm_fill", prompt: "bucket", out: "bucket" },
      { id: "normal", type: "tool", name: "notify_normal" },
      { id: "urgent", type: "tool", name: "notify_urgent" },
    ],
    edges: [
      { from: "classify", to: "normal", when: "bucket == 'normal'" },
      { from: "classify", to: "urgent", when: "bucket == 'urgent'" },
    ],
  });
  const results = await executeWorkflow(def, {
    tool: async (name) => {
      tools.push(name);
    },
    llm: async () => "urgent",
  });
  assert.deepEqual(tools, ["notify_urgent"]);
  assert.equal(results.length, 2);
  assert.equal(results[1]?.nodeId, "urgent");
});

test("llm_fill strips <think> so when: conditions still match", async () => {
  assert.equal(
    normalizeLlmOutput('<think>I should pick urgent</think>\nurgent', "fill"),
    "urgent",
  );
  assert.equal(
    normalizeLlmOutput('<think>The user asked for normal or urgent. Without addit', "fill"),
    "normal",
  );

  const tools: string[] = [];
  const def = compileWorkflowGraph({
    id: "triage_think",
    match: { keywords: ["ticket"] },
    nodes: [
      { id: "classify", type: "llm_fill", prompt: "bucket", out: "bucket" },
      { id: "normal", type: "tool", name: "notify_normal" },
      { id: "urgent", type: "tool", name: "notify_urgent" },
    ],
    edges: [
      { from: "classify", to: "normal", when: "bucket == 'normal'" },
      { from: "classify", to: "urgent", when: "bucket == 'urgent'" },
    ],
  });
  const results = await executeWorkflow(def, {
    tool: async (name) => {
      tools.push(name);
    },
    llm: async () =>
      '<think>The user is asking me to reply with exactly "normal" or "urgent".</think>\nnormal',
  });
  assert.equal(results[0]?.output, "normal");
  assert.deepEqual(tools, ["notify_normal"]);
});

test("V-DAG-8: join=all waits for both parents", async () => {
  const order: string[] = [];
  const def = compileWorkflowGraph({
    id: "fan",
    match: { keywords: ["go"] },
    nodes: [
      { id: "start", type: "llm_fill", prompt: "s" },
      { id: "left", type: "tool", name: "L" },
      { id: "right", type: "tool", name: "R" },
      { id: "join", type: "llm_summarize", prompt: "done", join: "all" },
    ],
    edges: [
      { from: "start", to: "left" },
      { from: "start", to: "right" },
      { from: "left", to: "join" },
      { from: "right", to: "join" },
    ],
  });
  await executeWorkflow(def, {
    tool: async (name) => {
      order.push(name);
    },
    llm: async (p) => {
      order.push(p);
      return p;
    },
  });
  assert.deepEqual(order.slice(0, 1), ["s"]);
  assert.ok(order.includes("L") && order.includes("R"));
  assert.equal(order[order.length - 1], "done");
});

test("kind/tool/prompt_ref aliases normalize", () => {
  const def = parseWorkflowFile(
    "x.yml",
    [
      "id: x",
      "match:",
      "  keywords: [hi]",
      "steps:",
      "  - id: fetch",
      "    kind: tool",
      "    tool: get_weather",
      "  - id: fill",
      "    type: llm_fill",
      "    prompt_ref: place_prompt",
      "",
    ].join("\n"),
  );
  assert.equal(def.nodes[0]?.type, "tool");
  assert.equal(def.nodes[0]?.name, "get_weather");
  assert.equal(def.nodes[1]?.prompt, "place_prompt");
});

test("invalid when rejected at load", () => {
  assert.throws(
    () =>
      compileWorkflowGraph({
        id: "bad_when",
        match: { keywords: ["x"] },
        nodes: [
          { id: "a", type: "llm_fill", prompt: "a" },
          { id: "b", type: "tool", name: "t" },
        ],
        edges: [{ from: "a", to: "b", when: "not a valid expr" }],
      }),
    /invalid_when/,
  );
});

test("args_from resolves step refs into tool args", async () => {
  const seen: Record<string, unknown>[] = [];
  const def = compileWorkflowGraph({
    id: "af",
    match: { keywords: ["x"] },
    nodes: [
      { id: "extract", type: "llm_fill", prompt: "city", out: "place" },
      {
        id: "fetch",
        type: "tool",
        name: "get_weather",
        args_from: { place: "step.extract.place" },
      },
    ],
    edges: [{ from: "extract", to: "fetch" }],
  });
  await executeWorkflow(def, {
    tool: async (_n, args) => {
      seen.push(args);
    },
    llm: async () => "Paris",
  });
  assert.deepEqual(seen[0], { place: "Paris" });
});

test("llm prompt interpolates {{step.id.field}} from JSON tool output", async () => {
  const seenPrompts: string[] = [];
  const exportArgs: Record<string, unknown>[] = [];
  const def = compileWorkflowGraph({
    id: "doc_sum",
    match: { keywords: ["summarize document"] },
    nodes: [
      {
        id: "extract",
        type: "tool",
        name: "extract_document",
        args: { sourcePath: "documents/report.docx" },
      },
      {
        id: "summarize",
        type: "llm_summarize",
        prompt: "Summarize:\n{{step.extract.text}}",
        out: "summary",
      },
      {
        id: "export",
        type: "tool",
        name: "export_document",
        args: { format: "docx", title: "Summary" },
        args_from: { markdown: "step.summarize" },
      },
    ],
    edges: [
      { from: "extract", to: "summarize" },
      { from: "summarize", to: "export" },
    ],
  });
  const results = await executeWorkflow(def, {
    tool: async (name, args) => {
      if (name === "extract_document") {
        return JSON.stringify({
          uri: "output/extracts/report.md",
          extractChars: 12,
          extractor: "anydoc-v1",
          sourcePath: "documents/report.docx",
          text: "Quarterly budget notes",
        });
      }
      if (name === "export_document") {
        exportArgs.push(args);
        return JSON.stringify({ uri: "output/exports/summary.docx", bytes: 1, format: "docx" });
      }
      throw new Error(`unexpected tool ${name}`);
    },
    llm: async (prompt) => {
      seenPrompts.push(prompt);
      return "- Budget was fine";
    },
  });
  assert.equal(results.every((r) => r.ok), true);
  assert.match(seenPrompts[0]!, /Quarterly budget notes/);
  assert.equal(exportArgs[0]?.markdown, "- Budget was fine");
  assert.equal(exportArgs[0]?.format, "docx");
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
    assert.equal(loaded[0]?.enabled, true);
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
      compileWorkflowGraph({ id: "a", match: { keywords: ["y"] }, steps: [] }),
    ]);
    assert.deepEqual(merged[0]?.match.keywords, ["y"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
