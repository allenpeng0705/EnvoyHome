import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAssistantToolCalls } from "../dist/index.js";

test("V-UX-14: parseAssistantToolCalls accepts ask_user fence", () => {
  const text = `Pick one.
\`\`\`envoyhome-tools
{"tool":"ask_user","args":{"question":"Which?","options":["A","B"],"selection":"one"}}
\`\`\``;
  const { tools } = parseAssistantToolCalls(text, { allowSandbox: true });
  assert.equal(tools.length, 1);
  assert.equal(tools[0]!.tool, "ask_user");
  assert.equal((tools[0]!.args as { question?: string }).question, "Which?");
});

test("V-UX-14: schedulesOnly drops ask_user", () => {
  const text = `\`\`\`envoyhome-tools
{"tool":"ask_user","args":{"question":"x","options":["a"]}}
\`\`\``;
  const { tools } = parseAssistantToolCalls(text, { schedulesOnly: true });
  assert.equal(tools.length, 0);
});

test("parseAssistantToolCalls: nested ```json inside envoyhome-tools", () => {
  const text = `Sure.
\`\`\`envoyhome-tools
\`\`\`json
[{"tool":"schedule","args":{"action":"propose","text":"in a minute","message":"ping"}}]
\`\`\``;
  const { tools } = parseAssistantToolCalls(text, { allowSandbox: true });
  assert.equal(tools.length, 1);
  assert.equal(tools[0]!.tool, "schedule");
  assert.equal((tools[0]!.args as { text?: string }).text, "in a minute");
});

test("V-UX-14: parse ask_user many + text + object options", () => {
  const many = `\`\`\`envoyhome-tools
{"tool":"ask_user","args":{"question":"Rooms?","options":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"selection":"many"}}
\`\`\``;
  const { tools: t1 } = parseAssistantToolCalls(many, { allowSandbox: true });
  assert.equal(t1[0]!.tool, "ask_user");
  assert.equal((t1[0]!.args as { selection?: string }).selection, "many");

  const text = `\`\`\`envoyhome-tools
{"tool":"ask_user","args":{"question":"When?","selection":"text","multiline":true}}
\`\`\``;
  const { tools: t2 } = parseAssistantToolCalls(text, { allowSandbox: true });
  assert.equal((t2[0]!.args as { selection?: string }).selection, "text");
  assert.equal((t2[0]!.args as { multiline?: boolean }).multiline, true);
});
