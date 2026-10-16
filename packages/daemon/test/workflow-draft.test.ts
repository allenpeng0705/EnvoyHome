// Workflow draft helpers — Design §7 / V-UX-10.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  draftWorkflowFromText,
  draftWorkflowNodePrompt,
  extractPromptCandidate,
  extractYamlCandidate,
} from "../dist/workflow-draft.js";

const GOOD_YAML = `id: morning_note
match:
  keywords: ["morning note"]
steps:
  - id: draft
    type: llm_summarize
    prompt: "One-line morning note."
`;

test("extractYamlCandidate unwraps fences and prose", () => {
  assert.match(extractYamlCandidate("```yaml\nid: x\nmatch:\n  keywords: [a]\nsteps: []\n```"), /id: x/);
  assert.match(
    extractYamlCandidate("Here you go:\nid: y\nmatch:\n  keywords: [b]\nsteps: []\n"),
    /^id: y/,
  );
});

test("extractPromptCandidate unwraps fences", () => {
  assert.equal(extractPromptCandidate('```\nReply normal or urgent\n```'), "Reply normal or urgent");
  assert.equal(extractPromptCandidate('"short prompt"'), "short prompt");
});

test("draftWorkflowFromText accepts mock YAML and re-serializes", async () => {
  const known = new Set(["write_file", "read_file", "notify"]);
  const out = await draftWorkflowFromText({
    text: "morning note for the house",
    toolNames: [...known],
    knownTools: known,
    complete: async () => `Sure.\n\`\`\`yaml\n${GOOD_YAML}\n\`\`\``,
  });
  assert.match(out.yaml, /id:\s*morning_note/);
  assert.equal(out.def.id, "morning_note");
});

test("draftWorkflowFromText rejects garbage", async () => {
  await assert.rejects(
    () =>
      draftWorkflowFromText({
        text: "anything",
        toolNames: ["write_file"],
        knownTools: new Set(["write_file"]),
        complete: async () => "I cannot help with that.",
      }),
    /envoyhome\.draft_invalid|workflow\.invalid/,
  );
});

test("draftWorkflowFromText rejects unknown tool names", async () => {
  const bad = `id: bad_tool
match:
  keywords: [x]
steps:
  - id: t
    type: tool
    name: totally_fake_tool
    args: {}
`;
  await assert.rejects(
    () =>
      draftWorkflowFromText({
        text: "use a fake tool",
        toolNames: ["write_file"],
        knownTools: new Set(["write_file"]),
        complete: async () => bad,
      }),
    /workflow\.unknown_tool|unknown_tool/,
  );
});

test("draftWorkflowNodePrompt returns non-empty prompt", async () => {
  const out = await draftWorkflowNodePrompt({
    nodeType: "llm_fill",
    goal: "classify urgency",
    complete: async () => '```\nReply with exactly normal or urgent\n```',
  });
  assert.match(out.prompt, /normal or urgent/i);
});

test("draftWorkflowFromText requires non-empty text", async () => {
  await assert.rejects(
    () =>
      draftWorkflowFromText({
        text: "  ",
        toolNames: [],
        knownTools: new Set(),
        complete: async () => GOOD_YAML,
      }),
    /text required/,
  );
});

test("draftWorkflowFromText with currentYaml uses revise prompt", async () => {
  const known = new Set(["write_file"]);
  const revised = `id: morning_note
match:
  keywords: ["morning note", "brief"]
steps:
  - id: draft
    type: llm_summarize
    prompt: "Two-line morning note."
`;
  let sawUser = "";
  const out = await draftWorkflowFromText({
    text: "also match the word brief",
    toolNames: [...known],
    knownTools: known,
    currentYaml: GOOD_YAML,
    complete: async (messages) => {
      sawUser = messages.find((m) => m.role === "user")?.content ?? "";
      return revised;
    },
  });
  assert.match(sawUser, /Revise this workflow YAML/i);
  assert.match(sawUser, /Current YAML:/);
  assert.match(sawUser, /morning_note/);
  assert.match(sawUser, /Instructions:/);
  assert.match(sawUser, /also match the word brief/);
  assert.match(out.yaml, /brief/);
  assert.equal(out.def.id, "morning_note");
});

test("draftWorkflowFromText revise still rejects unknown tools", async () => {
  const bad = `id: bad_tool
match:
  keywords: [x]
steps:
  - id: t
    type: tool
    name: totally_fake_tool
    args: {}
`;
  await assert.rejects(
    () =>
      draftWorkflowFromText({
        text: "add a tool",
        toolNames: ["write_file"],
        knownTools: new Set(["write_file"]),
        currentYaml: GOOD_YAML,
        complete: async () => bad,
      }),
    /workflow\.unknown_tool|unknown_tool/,
  );
});
