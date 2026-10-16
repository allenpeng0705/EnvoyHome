import { test } from "node:test";
import assert from "node:assert/strict";
import slackPlugin, { slackManifest, createSlackChannel } from "../dist/index.js";

test("slack manifest is chat kind without actuate (Chat only)", () => {
  assert.equal(slackManifest.kind, "chat");
  assert.equal(slackManifest.id, "slack");
  assert.equal((slackManifest.capabilities as string[]).includes("actuate"), false);
  assert.equal(slackPlugin.manifest.kind, "chat");
  assert.ok("appToken" in slackManifest.configSchema);
});

test("slack health fails closed without tokens", async () => {
  const plugin = createSlackChannel();
  const h = await plugin.health?.();
  assert.equal(h?.ok, false);
  assert.match(String(h?.detail), /botToken|appToken/i);
});
