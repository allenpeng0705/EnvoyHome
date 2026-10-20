// clearTranscript + deleteTranscriptMessages + messageId on lines.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type RunningDaemon } from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-tx-"));
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
  return daemon;
}

test("append + getTranscript carries messageId; delete and clear work", async () => {
  const daemon = await boot();
  await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
  const accountId = "alice";

  const opened = await daemon.turns.openSession({
    accountId,
    title: "Edit test",
    purpose: "general",
  });
  const sessionId = opened.sessionId as string;

  const { appendTranscriptLine } = await import("@envoyhome/harness-host");
  const sessionDir = daemon.turns.sessions.sessionDir(accountId, sessionId);
  await appendTranscriptLine(sessionDir, {
    role: "user",
    text: "hello",
    at: new Date().toISOString(),
    turnId: "t1",
  });
  await appendTranscriptLine(sessionDir, {
    role: "assistant",
    text: "hi",
    at: new Date().toISOString(),
    turnId: "t1",
  });

  // Two assistant chunks same turnId → coalesced on getTranscript (mobile/desktop hydrate).
  await appendTranscriptLine(sessionDir, {
    role: "assistant",
    text: " more",
    at: new Date().toISOString(),
    turnId: "t1",
  });

  const messages = await daemon.turns.getTranscript(accountId, sessionId);
  assert.equal(messages.length, 2);
  assert.equal(messages[1]?.text, "hi more");
  assert.ok(typeof messages[0]?.messageId === "string");
  assert.ok(typeof messages[1]?.messageId === "string");

  const del = await daemon.turns.deleteTranscriptMessages(accountId, sessionId, [
    String(messages[0]!.messageId),
  ]);
  assert.equal(del.removed, 1);
  const afterDel = await daemon.turns.getTranscript(accountId, sessionId);
  assert.equal(afterDel.length, 1);
  assert.equal(afterDel[0]?.text, "hi more");

  await daemon.turns.clearTranscript(accountId, sessionId);
  assert.equal((await daemon.turns.getTranscript(accountId, sessionId)).length, 0);
});

test("delete coalesced assistant drops all turnId chunks", async () => {
  const daemon = await boot();
  await daemon.accounts.create({ accountId: "carol", displayName: "Carol" });
  const accountId = "carol";
  const opened = await daemon.turns.openSession({
    accountId,
    title: "Coalesce delete",
    purpose: "general",
  });
  const sessionId = opened.sessionId as string;
  const { appendTranscriptLine } = await import("@envoyhome/harness-host");
  const sessionDir = daemon.turns.sessions.sessionDir(accountId, sessionId);
  await appendTranscriptLine(sessionDir, {
    role: "user",
    text: "q",
    at: new Date().toISOString(),
    turnId: "t9",
  });
  await appendTranscriptLine(sessionDir, {
    role: "assistant",
    text: "part-a",
    at: new Date().toISOString(),
    turnId: "t9",
  });
  await appendTranscriptLine(sessionDir, {
    role: "assistant",
    text: "part-b",
    at: new Date().toISOString(),
    turnId: "t9",
  });

  const messages = await daemon.turns.getTranscript(accountId, sessionId);
  assert.equal(messages.length, 2);
  assert.equal(messages[1]?.text, "part-apart-b");

  const del = await daemon.turns.deleteTranscriptMessages(accountId, sessionId, [
    String(messages[1]!.messageId),
  ]);
  assert.ok(del.removed >= 1);
  const after = await daemon.turns.getTranscript(accountId, sessionId);
  assert.equal(after.length, 1);
  assert.equal(after[0]?.role, "user");
});

test("legacy lines get synthetic messageId on read", async () => {
  const daemon = await boot();
  await daemon.accounts.create({ accountId: "bob", displayName: "Bob" });
  const accountId = "bob";
  const opened = await daemon.turns.openSession({ accountId, purpose: "general" });
  const sessionId = opened.sessionId as string;
  const { writeTranscript } = await import("@envoyhome/harness-host");
  const sessionDir = daemon.turns.sessions.sessionDir(accountId, sessionId);
  await writeTranscript(sessionDir, [
    { role: "user", text: "old", at: "2020-01-01T00:00:00.000Z", turnId: "legacy-t" },
  ]);
  const messages = await daemon.turns.getTranscript(accountId, sessionId);
  assert.equal(messages.length, 1);
  assert.match(String(messages[0]!.messageId), /^legacy:/);

  // Second read must keep the same id (persisted on first getTranscript).
  const again = await daemon.turns.getTranscript(accountId, sessionId);
  assert.equal(again[0]?.messageId, messages[0]?.messageId);

  const del = await daemon.turns.deleteTranscriptMessages(accountId, sessionId, [
    String(messages[0]!.messageId),
  ]);
  assert.equal(del.removed, 1);
  assert.equal((await daemon.turns.getTranscript(accountId, sessionId)).length, 0);
});

test("media-only first send auto-titles from fileName", async () => {
  const daemon = await boot();
  await daemon.accounts.create({ accountId: "media", displayName: "Media" });
  const accountId = "media";
  const opened = await daemon.turns.openSession({ accountId, purpose: "general" });
  const sessionId = opened.sessionId as string;
  await daemon.turns.sendMessage({
    accountId,
    sessionId,
    text: "",
    callerKind: "test",
    completionText: "ok",
    media: [{ kind: "file", uri: "files/x.pdf", fileName: "budget.pdf" }],
  });
  await new Promise((r) => setTimeout(r, 50));
  const listed = await daemon.turns.listSessions(accountId);
  const row = (listed.sessions as Array<{ sessionId: string; title?: string }>).find(
    (s) => s.sessionId === sessionId,
  );
  assert.equal(row?.title, "budget.pdf");
});

test("first message auto-titles; rename locks title", async () => {
  const daemon = await boot();
  await daemon.accounts.create({ accountId: "rena", displayName: "Rena" });
  const accountId = "rena";
  const opened = await daemon.turns.openSession({ accountId, purpose: "general" });
  const sessionId = opened.sessionId as string;

  await daemon.turns.sendMessage({
    accountId,
    sessionId,
    text: "Plan weekend trip to Kyoto",
    callerKind: "test",
    completionText: "ok",
  });
  // Drain background turn briefly.
  await new Promise((r) => setTimeout(r, 50));
  const listed1 = await daemon.turns.listSessions(accountId);
  const row1 = (listed1.sessions as Array<{ sessionId: string; title?: string }>).find(
    (s) => s.sessionId === sessionId,
  );
  assert.equal(row1?.title, "Plan weekend trip to Kyoto");

  const renamed = await daemon.turns.renameSession(accountId, sessionId, "Kyoto plans");
  assert.equal(renamed.title, "Kyoto plans");

  await daemon.turns.clearTranscript(accountId, sessionId);
  await daemon.turns.sendMessage({
    accountId,
    sessionId,
    text: "This should not replace the user title",
    callerKind: "test",
    completionText: "ok",
  });
  await new Promise((r) => setTimeout(r, 50));
  const listed2 = await daemon.turns.listSessions(accountId);
  const row2 = (listed2.sessions as Array<{ sessionId: string; title?: string }>).find(
    (s) => s.sessionId === sessionId,
  );
  assert.equal(row2?.title, "Kyoto plans");
});

test("openSession title locks out first-message auto-title", async () => {
  const daemon = await boot();
  await daemon.accounts.create({ accountId: "namer", displayName: "Namer" });
  const accountId = "namer";
  const opened = await daemon.turns.openSession({
    accountId,
    purpose: "general",
    title: "My named chat",
  });
  const sessionId = opened.sessionId as string;
  assert.equal(opened.title, "My named chat");
  assert.equal(opened.titleSource, "user");

  await daemon.turns.sendMessage({
    accountId,
    sessionId,
    text: "This must not become the title",
    callerKind: "test",
    completionText: "ok",
  });
  await new Promise((r) => setTimeout(r, 50));
  const listed = await daemon.turns.listSessions(accountId);
  const row = (listed.sessions as Array<{ sessionId: string; title?: string }>).find(
    (s) => s.sessionId === sessionId,
  );
  assert.equal(row?.title, "My named chat");
});

test("archive hides from listSessions; remove deletes", async () => {
  const daemon = await boot();
  await daemon.accounts.create({ accountId: "cara", displayName: "Cara" });
  const accountId = "cara";
  const a = await daemon.turns.openSession({ accountId, purpose: "general", title: "A" });
  const b = await daemon.turns.openSession({ accountId, purpose: "general", title: "B" });
  const sidA = a.sessionId as string;
  const sidB = b.sessionId as string;

  await daemon.turns.archiveSession(accountId, sidA);
  const listed = await daemon.turns.listSessions(accountId);
  const ids = (listed.sessions as Array<{ sessionId: string }>).map((s) => s.sessionId);
  assert.ok(!ids.includes(sidA));
  assert.ok(ids.includes(sidB));

  const withArchived = await daemon.turns.listSessions(accountId, { includeArchived: true });
  const allIds = (withArchived.sessions as Array<{ sessionId: string }>).map((s) => s.sessionId);
  assert.ok(allIds.includes(sidA));

  await daemon.turns.unarchiveSession(accountId, sidA);
  const restored = await daemon.turns.listSessions(accountId);
  const restoredIds = (restored.sessions as Array<{ sessionId: string }>).map((s) => s.sessionId);
  assert.ok(restoredIds.includes(sidA));

  await daemon.turns.removeSession(accountId, sidB);
  const after = await daemon.turns.listSessions(accountId, { includeArchived: true });
  const afterIds = (after.sessions as Array<{ sessionId: string }>).map((s) => s.sessionId);
  assert.ok(!afterIds.includes(sidB));
});
