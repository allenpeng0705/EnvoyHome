// Smoke: Chat document pane wiring (Design 2026-11-10i).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("ui-dist Chat pane: open uses pane; Files forceModal; account switch clears", async () => {
  const app = await readFile(join(root, "ui-dist", "app.js"), "utf8");
  assert.match(app, /chat-doc-pane/);
  assert.match(app, /fillChatDocPane/);
  assert.match(app, /forceModal:\s*true/);
  assert.match(app, /closeChatDocPane/);
  assert.match(app, /canPromoteKnowledgePathClient/);
  // Profile switch must not leave another account's doc open.
  assert.match(app, /closeChatDocPane\(\)/);
});

test("styles: Chat layout has-doc-pane split", async () => {
  const css = await readFile(join(root, "ui-dist", "styles.css"), "utf8");
  assert.match(css, /\.chat-layout\.has-doc-pane/);
  assert.match(css, /\.chat-doc-pane/);
});
