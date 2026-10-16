// V-UX-9: Diagram ↔ YAML round-trip (client model).

import { test } from "node:test";
import assert from "node:assert/strict";
import { graphToYaml, yamlToGraph } from "../public/workflow-model.js";

const LINEAR = `id: morning_note
match:
  keywords:
    - morning note
steps:
  - id: draft
    type: llm_summarize
    prompt: One-line morning note.
  - id: save
    type: tool
    name: write_file
    args:
      path: notes/morning.txt
`;

const BRANCH = `id: intake_triage
match:
  keywords:
    - intake
nodes:
  - id: classify
    type: llm_fill
    prompt: normal or urgent
    out: bucket
    x: 40
    y: 40
  - id: note_normal
    type: tool
    name: write_file
    x: 260
    y: 40
  - id: note_urgent
    type: tool
    name: write_file
    x: 260
    y: 160
edges:
  - from: classify
    to: note_normal
    when: bucket == 'normal'
  - from: classify
    to: note_urgent
    when: bucket == 'urgent'
`;

test("yamlToGraph parses linear steps into nodes+edges", () => {
  const parsed = yamlToGraph(LINEAR);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.graph.id, "morning_note");
  assert.equal(parsed.graph.nodes.length, 2);
  assert.equal(parsed.graph.edges.length, 1);
  assert.equal(parsed.graph.edges[0].from, "draft");
  assert.equal(parsed.graph.edges[0].to, "save");
});

test("branched graph round-trips nodes, edges, when, and layout", () => {
  const parsed = yamlToGraph(BRANCH);
  assert.equal(parsed.ok, true);
  const yaml2 = graphToYaml(parsed.graph);
  const again = yamlToGraph(yaml2);
  assert.equal(again.ok, true);
  assert.equal(again.graph.nodes.length, 3);
  assert.equal(again.graph.edges.length, 2);
  assert.ok(again.graph.edges.some((e) => e.when?.includes("normal")));
  assert.equal(again.graph.nodes.find((n) => n.id === "classify")?.x, 40);
});

test("invalid yaml fails closed", () => {
  const parsed = yamlToGraph("not: a workflow");
  assert.equal(parsed.ok, false);
});
