import { test } from "node:test";
import assert from "node:assert/strict";
import telegramPlugin, { telegramManifest } from "../dist/index.js";

test("V-CH-1: telegram manifest is chat kind without actuate", () => {
  assert.equal(telegramManifest.kind, "chat");
  assert.equal(telegramManifest.id, "telegram");
  assert.equal((telegramManifest.capabilities as string[]).includes("actuate"), false);
  assert.equal(telegramPlugin.manifest.kind, "chat");
});
