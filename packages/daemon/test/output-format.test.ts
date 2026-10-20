import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyOutputFormat,
  formatForChannelOutbound,
  shouldSpillThinClientLink,
  summarizeForLinkBubble,
  THIN_CLIENT_LINK_SPILL_CHARS,
} from "../dist/output-format.js";

test("classifyOutputFormat: short prose is plain", () => {
  assert.equal(classifyOutputFormat("Lights are on."), "plain");
  assert.equal(classifyOutputFormat("OK"), "plain");
});

test("classifyOutputFormat: markdown cues", () => {
  assert.equal(classifyOutputFormat("## Summary\n\nDone."), "markdown");
  assert.equal(classifyOutputFormat("- one\n- two"), "markdown");
  assert.equal(classifyOutputFormat("See [docs](https://example.com)."), "markdown");
  assert.equal(classifyOutputFormat("Use `ha_call_service`."), "markdown");
  assert.equal(classifyOutputFormat("```\ncode\n```"), "markdown");
});

test("classifyOutputFormat: longer text defaults to markdown", () => {
  const long = "A".repeat(300);
  assert.equal(classifyOutputFormat(long), "markdown");
});

test("classifyOutputFormat: prefer overrides", () => {
  assert.equal(classifyOutputFormat("## Hi", { prefer: "plain" }), "plain");
  assert.equal(classifyOutputFormat("hi", { prefer: "markdown" }), "markdown");
  assert.equal(classifyOutputFormat("hi", { prefer: "link" }), "link");
});

test("formatForChannelOutbound: never link (no home HTTPS)", () => {
  assert.equal(formatForChannelOutbound("plain"), "plain");
  assert.equal(formatForChannelOutbound("markdown"), "markdown");
  assert.equal(formatForChannelOutbound("link"), "markdown");
  assert.equal(formatForChannelOutbound(undefined), "markdown");
});

test("shouldSpillThinClientLink + summarizeForLinkBubble", () => {
  assert.equal(shouldSpillThinClientLink("short"), false);
  assert.equal(shouldSpillThinClientLink("x".repeat(THIN_CLIENT_LINK_SPILL_CHARS)), true);
  const long = `${"Hello paragraph.\n\n"}` + "y".repeat(600);
  const sum = summarizeForLinkBubble(long, 480);
  assert.ok(sum.length <= 500);
  assert.ok(sum.includes("Hello") || sum.endsWith("…"));
});
