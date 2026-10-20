// Smoke: chat markdown helper classifies + renders safely.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyChatFormat,
  humanizeScheduleChatText,
  renderChatMarkdown,
} from "../public/chat-markdown.js";

test("classifyChatFormat mirrors §9.5 tiers", () => {
  assert.equal(classifyChatFormat("OK"), "plain");
  assert.equal(classifyChatFormat("## Hello\n\nWorld"), "markdown");
  assert.equal(classifyChatFormat("- a\n- b"), "markdown");
});

test("renderChatMarkdown escapes script and keeps safe tags", () => {
  const html = renderChatMarkdown('Hello **bold** and <script>alert(1)</script>');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.doesNotMatch(html, /<script/i);
});

test("renderChatMarkdown renders fenced code", () => {
  const html = renderChatMarkdown("```\nconst x = 1;\n```");
  assert.match(html, /<pre>/);
  assert.match(html, /const x = 1/);
});

test("V-CRON-11: humanizeScheduleChatText surfaces resolvedLocal without raw JSON", () => {
  const raw = JSON.stringify({
    proposalId: "p1",
    resolvedLocal: "2026-10-10 08:00 Asia/Shanghai",
    kind: "at",
    note: "Not armed",
  });
  const line = humanizeScheduleChatText(raw);
  assert.match(line, /Proposed for 2026-10-10 08:00 Asia\/Shanghai/);
  assert.doesNotMatch(line, /proposalId/);
  assert.doesNotMatch(line, /\{/);
});
