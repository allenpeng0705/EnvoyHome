// Unit test for assistant <think> split (mirrors apps/desktop/public/app.js).

import { test } from "node:test";
import assert from "node:assert/strict";

function splitAssistantSegments(text) {
  const raw = String(text || "");
  if (!raw) return [];
  const parts = [];
  const re = /<think\b[^>]*>([\s\S]*?)(?:<\/think>|$)/gi;
  let last = 0;
  let m;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) {
      const chunk = raw.slice(last, m.index).replace(/<\/?think\b[^>]*>/gi, "");
      if (chunk) parts.push({ kind: "text", text: chunk });
    }
    parts.push({ kind: "think", text: m[1] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < raw.length) {
    const chunk = raw.slice(last).replace(/<\/?think\b[^>]*>/gi, "");
    if (chunk) parts.push({ kind: "text", text: chunk });
  }
  if (parts.length === 0 && raw.trim()) parts.push({ kind: "text", text: raw });
  return parts;
}

test("closed think + reply", () => {
  const parts = splitAssistantSegments("<think>plan</think>\nHello");
  assert.equal(parts.length, 2);
  assert.equal(parts[0].kind, "think");
  assert.equal(parts[0].text, "plan");
  assert.equal(parts[1].kind, "text");
  assert.match(parts[1].text, /Hello/);
});

test("unclosed think stays collapsed segment", () => {
  const parts = splitAssistantSegments("<think>still working");
  assert.equal(parts.length, 1);
  assert.equal(parts[0].kind, "think");
  assert.equal(parts[0].text, "still working");
});

test("plain text", () => {
  const parts = splitAssistantSegments("Just a reply");
  assert.deepEqual(parts, [{ kind: "text", text: "Just a reply" }]);
});
