import { test } from "node:test";
import assert from "node:assert/strict";
import discordPlugin, { discordManifest, createDiscordChannel } from "../dist/index.js";

test("discord manifest is chat kind without actuate (Chat only)", () => {
  assert.equal(discordManifest.kind, "chat");
  assert.equal(discordManifest.id, "discord");
  assert.equal(discordManifest.label, "Discord");
  assert.equal((discordManifest.capabilities as string[]).includes("actuate"), false);
  assert.equal(discordPlugin.manifest.kind, "chat");
});

test("discord health fails closed without botToken", async () => {
  const plugin = createDiscordChannel();
  const h = await plugin.health?.();
  assert.equal(h?.ok, false);
  assert.match(String(h?.detail), /botToken/i);
});
