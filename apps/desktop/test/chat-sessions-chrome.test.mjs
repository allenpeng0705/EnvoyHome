// Smoke: bundled UI exposes chat session chrome (New / Recents / Empty / delete).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = join(root, "ui-dist", "app.js");

test("ui-dist app.js includes chat session chrome helpers", async () => {
  const src = await readFile(appJs, "utf8");
  for (const needle of [
    "function chatChromeHtml",
    "function startNewGeneralChat",
    "function promptOptionalNewChatTitle",
    "function confirmDialog",
    "pendingNewChatTitle",
    "chat.newNamePrompt",
    "chat-menu-item",
    "function listGeneralChatSessions",
    "function isUserFacingGeneralChat",
    "function renameGeneralChatSession",
    "home.renameSession",
    "function clearCurrentChatTranscript",
    "function deleteChatMessage",
    "function archiveCurrentChat",
    "function removeCurrentChat",
    'id="chat-new"',
    'id="chat-rename"',
    'id="chat-rename-icon"',
    "data-rename-id",
    "data-more-toggle",
    "chat-session-more",
    "chat-sessions-archived",
    "home.unarchiveSession",
    "chat-sessions",
    "chat-sessions-new",
    'id="chat-trash"',
    "data-del-msg",
    "data-copy-msg",
    "bubble-actions",
    "home.clearTranscript",
    "home.deleteTranscriptMessages",
    "home.archiveSession",
    "home.removeSession",
  ]) {
    assert.match(src, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("ui-dist styles include chat-chrome + bubble-delete", async () => {
  const css = await readFile(join(root, "ui-dist", "styles.css"), "utf8");
  assert.match(css, /\.chat-chrome\b/);
  assert.match(css, /\.bubble-delete\b/);
  assert.match(css, /\.chat-sessions\b/);
  assert.match(css, /\.chat-sessions-new\b/);
  assert.match(css, /\.chat-page-split\b/);
});
