// Chat media upload + sendMessage.media[] (Design A.6 / 2026-10-16q).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetActiveXForTests, flushLoop } from "@envoyhome/test-utils";
import {
  appendMediaToUserText,
  CHAT_MEDIA_MAX_BYTES,
  ChatMediaError,
  homePaths,
  kindFromMime,
  normalizeMediaList,
  startDaemon,
  storeChatMedia,
  type RunningDaemon,
} from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

test("kindFromMime classifies by mime and extension", () => {
  assert.equal(kindFromMime("image/png", "x.bin"), "image");
  assert.equal(kindFromMime("audio/mpeg", "x.bin"), "audio");
  assert.equal(kindFromMime(undefined, "photo.JPG"), "image");
  assert.equal(kindFromMime(undefined, "notes.txt"), "file");
});

test("normalizeMediaList rejects escapes and non-uploads paths", () => {
  assert.throws(
    () => normalizeMediaList([{ kind: "file", uri: "../etc/passwd" }]),
    ChatMediaError,
  );
  assert.throws(
    () => normalizeMediaList([{ kind: "file", uri: "/tmp/x" }]),
    ChatMediaError,
  );
  assert.throws(
    () => normalizeMediaList([{ kind: "file", uri: "docs/readme.md" }]),
    ChatMediaError,
  );
  const ok = normalizeMediaList([
    { kind: "file", uri: "uploads/abc-notes.txt", fileName: "notes.txt", bytes: 12 },
  ]);
  assert.equal(ok.length, 1);
  assert.equal(ok[0]?.uri, "uploads/abc-notes.txt");
});

test("storeChatMedia writes under account files/uploads and appendMediaToUserText lists paths", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-chat-media-"));
  try {
    const paths = homePaths(stateDir);
    const stored = await storeChatMedia({
      paths,
      accountId: "alice",
      fileName: "hello.txt",
      mimeType: "text/plain",
      contentBase64: Buffer.from("hello attach", "utf8").toString("base64"),
    });
    assert.equal(stored.kind, "file");
    assert.match(stored.uri, /^uploads\/.+-hello\.txt$/);
    assert.equal(stored.fileName, "hello.txt");
    assert.equal(stored.bytes, 12);
    const abs = join(paths.accountFiles("alice"), stored.uri);
    assert.equal(await readFile(abs, "utf8"), "hello attach");

    const withText = appendMediaToUserText("Summarize this", [stored]);
    assert.match(withText, /Summarize this/);
    assert.match(withText, /hello\.txt/);
    assert.match(withText, /`uploads\//);
    assert.match(appendMediaToUserText("", [stored]), /Attached files/);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("storeChatMedia rejects oversized payloads", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-chat-media-big-"));
  try {
    const paths = homePaths(stateDir);
    const big = Buffer.alloc(CHAT_MEDIA_MAX_BYTES + 1, 1);
    await assert.rejects(
      () =>
        storeChatMedia({
          paths,
          accountId: "alice",
          fileName: "big.bin",
          contentBase64: big.toString("base64"),
        }),
      (err: unknown) => err instanceof ChatMediaError && err.code === "too_large",
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("home.uploadChatMedia + sendMessage with media[] materializes into the turn text", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-chat-media-rpc-"));
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, stateDir, hatchApiKey: "k" },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    const opened = await rpc(daemon.config.wsPort, "home.openSession", { accountId: "alice" });
    assert.equal(opened["error"], undefined);
    const sessionId = (opened["result"] as { sessionId: string }).sessionId;

    const up = await rpc(daemon.config.wsPort, "home.uploadChatMedia", {
      accountId: "alice",
      fileName: "note.txt",
      mimeType: "text/plain",
      contentBase64: Buffer.from("attachment body", "utf8").toString("base64"),
    });
    assert.equal(up["error"], undefined, JSON.stringify(up["error"]));
    const media = up["result"] as {
      kind: string;
      uri: string;
      fileName: string;
      bytes: number;
    };
    assert.equal(media.kind, "file");
    assert.match(media.uri, /^uploads\//);

    await daemon.providers.setProvider({
      id: "local",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      model: "m",
      enabled: true,
    });
    await daemon.providers.setMode("alice", "local");

    const sent = await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "please read the file",
      callerKind: "loopback-owner",
      media: [
        {
          kind: "file",
          uri: media.uri,
          fileName: media.fileName,
          bytes: media.bytes,
        },
      ],
      completionText: "ok attached",
    });
    assert.equal(sent.status, "started");
    for (let i = 0; i < 50 && daemon.turns.activeTurnCount() > 0; i++) {
      await flushLoop(5);
    }
    const transcript = await daemon.turns.getTranscript("alice", sessionId);
    const user = transcript.find((m) => m["role"] === "user");
    assert.ok(user);
    assert.match(String(user["text"] || ""), /please read the file/);
    assert.match(String(user["text"] || ""), /note\.txt/);
    assert.match(String(user["text"] || ""), /uploads\//);
    assert.ok(transcript.some((m) => m["text"] === "ok attached"));
  } finally {
    await daemon.stop().catch(() => undefined);
    const idx = daemons.indexOf(daemon);
    if (idx >= 0) daemons.splice(idx, 1);
    await rm(stateDir, { recursive: true, force: true });
  }
});

async function rpc(
  port: number,
  method: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { WebSocket } = await import("ws");
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("timeout"));
    }, 8_000);
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as Record<string, unknown>;
      if (message["id"] !== 1) return;
      clearTimeout(timer);
      socket.close();
      resolve(message);
    });
    socket.on("open", () => socket.send(JSON.stringify({ id: 1, method, params })));
    socket.on("error", reject);
  });
}
