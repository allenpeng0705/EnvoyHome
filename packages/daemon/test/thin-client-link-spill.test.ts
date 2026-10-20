// Design §9.5 — thin-client long replies spill to artifactPath; channels keep markdown.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type RunningDaemon } from "../dist/index.js";
import { THIN_CLIENT_LINK_SPILL_CHARS } from "../dist/output-format.js";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-spill-"));
  const daemon = await startDaemon({
    config: {
      wsPort: 0,
      httpPort: 0,
      stateDir,
      hatchApiKey: "test-hatch-key",
      meshHostingEnabled: false,
    },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);
  return { daemon, stateDir };
}

async function waitTurnIdle(daemon: RunningDaemon): Promise<void> {
  for (let i = 0; i < 80 && daemon.turns.activeTurnCount() > 0; i++) {
    await flushLoop(5);
  }
}

test("thin-client long reply → link + artifactPath; getArtifactContent returns body", async () => {
  const { daemon, stateDir } = await boot();
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    await daemon.providers.setProvider({
      id: "local",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      model: "m",
      enabled: true,
    });
    await daemon.providers.setMode("alice", "local");

    const opened = await daemon.turns.openSession({
      accountId: "alice",
      title: "Spill",
      purpose: "general",
    });
    const sessionId = opened.sessionId as string;
    const long = `# Report\n\n${"x".repeat(THIN_CLIENT_LINK_SPILL_CHARS)}`;

    const sent = await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "write a long report",
      callerKind: "loopback-owner",
      completionText: long,
    });
    assert.equal(sent.status, "started");
    await waitTurnIdle(daemon);

    const messages = await daemon.turns.getTranscript("alice", sessionId);
    const assistant = messages.filter((m) => m.role === "assistant").at(-1);
    assert.ok(assistant, "assistant line expected");
    assert.equal(assistant.format, "link");
    assert.equal(typeof assistant.artifactPath, "string");
    assert.ok(String(assistant.artifactPath).startsWith("output/replies/"));
    assert.ok(String(assistant.text).length < long.length);

    const body = await daemon.artifacts.getContent("alice", String(assistant.artifactPath));
    assert.equal(body.encoding, "utf8");
    assert.equal(body.text, long);
    assert.equal(body.mimeType, "text/markdown");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("channel turn does not spill (keeps markdown body for IM)", async () => {
  const { daemon, stateDir } = await boot();
  try {
    await daemon.accounts.create({ accountId: "bob", displayName: "Bob" });
    await daemon.providers.setProvider({
      id: "local",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      model: "m",
      enabled: true,
    });
    await daemon.providers.setMode("bob", "local");

    const opened = await daemon.turns.openSession({
      accountId: "bob",
      title: "Channel",
      purpose: "general",
    });
    const sessionId = opened.sessionId as string;
    const long = `# IM\n\n${"y".repeat(THIN_CLIENT_LINK_SPILL_CHARS)}`;

    await daemon.turns.sendMessage({
      accountId: "bob",
      sessionId,
      text: "long via telegram",
      callerKind: "channel",
      channel: "telegram",
      completionText: long,
    });
    await waitTurnIdle(daemon);

    const messages = await daemon.turns.getTranscript("bob", sessionId);
    const assistant = messages.filter((m) => m.role === "assistant").at(-1);
    assert.ok(assistant);
    assert.notEqual(assistant.format, "link");
    assert.equal(assistant.artifactPath, undefined);
    assert.equal(assistant.text, long);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
