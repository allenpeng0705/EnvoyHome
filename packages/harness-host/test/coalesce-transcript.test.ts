import { test } from "node:test";
import assert from "node:assert/strict";
import { coalesceAssistantByTurnId } from "../dist/turn.js";

test("coalesceAssistantByTurnId merges streaming assistant chunks", () => {
  const lines = [
    { role: "user", text: "hi", turnId: "t1", messageId: "u1" },
    { role: "assistant", text: "Hel", turnId: "t1", messageId: "a1", format: "plain" },
    {
      role: "assistant",
      text: "lo world",
      turnId: "t1",
      messageId: "a2",
      format: "markdown",
      artifactPath: "output/replies/t1.md",
    },
    { role: "user", text: "next", turnId: "t2", messageId: "u2" },
  ];
  const out = coalesceAssistantByTurnId(lines);
  assert.equal(out.length, 3);
  assert.equal(out[1]?.text, "Hello world");
  assert.equal(out[1]?.messageId, "a1");
  assert.equal(out[1]?.format, "markdown");
  assert.equal(out[1]?.artifactPath, "output/replies/t1.md");
});

test("coalesceAssistantByTurnId replaces when later chunk is cumulative", () => {
  const out = coalesceAssistantByTurnId([
    { role: "assistant", text: "ab", turnId: "t1" },
    { role: "assistant", text: "abcd", turnId: "t1" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.text, "abcd");
});
