// P2-C / P2-D1 / P2-E — V-P2-MSG / V-P2-MEDIA-1 / V-P2-AGENT.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BindingStore,
  DeviceCredentialStore,
  homePaths,
  SessionStore,
  sliceExtractByPageRange,
  runViewImageTool,
  runImageGenerateTool,
  runSessionsListTool,
  runSessionsHistoryTool,
  runSessionsSendTool,
  runMessageTool,
  runSpawnHelperTool,
  __resetPhase2ToolsForTests,
  ChannelService,
  DaemonLogger,
  MediaGenerateStore,
  PrivacyModeStore,
} from "../dist/index.js";
import { appendTranscriptLine } from "@envoyhome/harness-host";

test("V-P2-MEDIA-1: view_image refuses host paths and escapes", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-p2d-"));
  const paths = homePaths(stateDir);
  try {
    await assert.rejects(
      () =>
        runViewImageTool({
          args: { path: "/etc/passwd" },
          accountId: "alice",
          paths,
        }),
      /sandbox-relative/,
    );
    await assert.rejects(
      () =>
        runViewImageTool({
          args: { path: "../secret.png" },
          accountId: "alice",
          paths,
        }),
      /sandbox-relative/,
    );
    await assert.rejects(
      () =>
        runViewImageTool({
          args: { path: "file:///etc/passwd" },
          accountId: "alice",
          paths,
        }),
      /file:\/\/|non-TLS/,
    );
    await assert.rejects(
      () =>
        runViewImageTool({
          args: { path: "http://example.com/a.png" },
          accountId: "alice",
          paths,
        }),
      /file:\/\/|non-TLS/,
    );

    const files = paths.accountFiles("alice");
    await mkdir(join(files, "uploads"), { recursive: true });
    // Minimal PNG header
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    await writeFile(join(files, "uploads", "a.png"), png);
    const out = JSON.parse(
      await runViewImageTool({
        args: { path: "uploads/a.png" },
        accountId: "alice",
        paths,
      }),
    );
    assert.equal(out.mimeType, "image/png");
    assert.equal(out.path, "uploads/a.png");
    assert.equal(out.source, "jail");

    // https via SSRF-gated httpFetch mock.
    const urlOut = JSON.parse(
      await runViewImageTool({
        args: { path: "https://cdn.example.com/pic.png" },
        accountId: "alice",
        paths,
        httpFetch: async () =>
          new Response(png, {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
      }),
    );
    assert.equal(urlOut.source, "url");
    assert.equal(urlOut.mimeType, "image/png");

    await assert.rejects(
      () =>
        runViewImageTool({
          args: { path: "https://127.0.0.1/pic.png" },
          accountId: "alice",
          paths,
          httpFetch: async () => new Response(png),
        }),
      /private|ssrf|loopback|not public|refused|envoyhome/i,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-P2-MEDIA-1: PDF page-range slice", () => {
  const gfm = "# Page 1\none\n\n# Page 2\ntwo\n\n# Page 3\nthree";
  const mid = sliceExtractByPageRange(gfm, 2, 2);
  assert.match(mid, /Page 2/);
  assert.doesNotMatch(mid, /Page 1/);
});

test("V-P2-MSG-3: sessions_* are account-scoped and capped", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-p2c-sess-"));
  const paths = homePaths(stateDir);
  const sessions = new SessionStore(paths);
  try {
    const a = await sessions.open({ accountId: "alice", title: "A" });
    await sessions.open({ accountId: "bob", title: "B" });
    const listed = JSON.parse(
      await runSessionsListTool({ args: { limit: 10 }, accountId: "alice", sessions }),
    );
    assert.equal(listed.sessions.length, 1);
    assert.equal(listed.sessions[0].sessionId, a.sessionId);

    await assert.rejects(
      () =>
        runSessionsHistoryTool({
          args: { sessionId: a.sessionId },
          accountId: "bob",
          sessions,
          readTranscript: async () => [{ role: "user", content: "hi" }],
        }),
      /not found for this account/,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-P2-MSG: message rich actions send|notify|reply|react|edit|delete|pin; unknown fail closed", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-p2c-act-"));
  try {
    const devices = new DeviceCredentialStore();
    const bindings = new BindingStore(stateDir, devices);
    const logger = new DaemonLogger();
    const channels = new ChannelService({ stateDir, bindings, logger });
    await channels.loadPersisted();
    await channels.setChannelConfig("fake", {}, {});
    await channels.enableChannel("fake");
    await bindings.set(
      {
        accountId: "alice",
        channel: "fake",
        channelAccount: "default",
        senderId: "u1",
      },
      { kind: "loopback-owner", accountIds: [], ownerTrusted: true },
    );
    await assert.rejects(
      () =>
        runMessageTool({
          args: {
            action: "broadcast",
            channel: "fake",
            channelAccount: "default",
            peerId: "u1",
            text: "x",
          },
          accountId: "alice",
          channels,
          bindings,
        }),
      /not supported/,
    );
    const notify = JSON.parse(
      await runMessageTool({
        args: {
          action: "notify",
          channel: "fake",
          channelAccount: "default",
          peerId: "u1",
          text: "ping",
        },
        accountId: "alice",
        channels,
        bindings,
      }),
    );
    assert.equal(notify.kind, "notify");
    assert.equal(notify.action, "notify");

    const reply = JSON.parse(
      await runMessageTool({
        args: {
          action: "reply",
          channel: "fake",
          channelAccount: "default",
          peerId: "u1",
          text: "thread reply",
          rawRef: "msg-1",
        },
        accountId: "alice",
        channels,
        bindings,
      }),
    );
    assert.equal(reply.action, "reply");

    const react = JSON.parse(
      await runMessageTool({
        args: {
          action: "react",
          channel: "fake",
          channelAccount: "default",
          peerId: "u1",
          reaction: "👍",
          rawRef: "msg-1",
        },
        accountId: "alice",
        channels,
        bindings,
      }),
    );
    assert.equal(react.action, "react");
    assert.equal(react.reaction, "👍");

    const edit = JSON.parse(
      await runMessageTool({
        args: {
          action: "edit",
          channel: "fake",
          channelAccount: "default",
          peerId: "u1",
          text: "edited body",
          rawRef: "msg-1",
        },
        accountId: "alice",
        channels,
        bindings,
      }),
    );
    assert.equal(edit.action, "edit");
    assert.equal(edit.rawRef, "msg-1");

    const del = JSON.parse(
      await runMessageTool({
        args: {
          action: "delete",
          channel: "fake",
          channelAccount: "default",
          peerId: "u1",
          rawRef: "msg-1",
        },
        accountId: "alice",
        channels,
        bindings,
      }),
    );
    assert.equal(del.action, "delete");

    const pin = JSON.parse(
      await runMessageTool({
        args: {
          action: "pin",
          channel: "fake",
          channelAccount: "default",
          peerId: "u1",
          rawRef: "msg-1",
        },
        accountId: "alice",
        channels,
        bindings,
      }),
    );
    assert.equal(pin.action, "pin");

    const unpin = JSON.parse(
      await runMessageTool({
        args: {
          action: "unpin",
          channel: "fake",
          channelAccount: "default",
          peerId: "u1",
          rawRef: "msg-1",
        },
        accountId: "alice",
        channels,
        bindings,
      }),
    );
    assert.equal(unpin.action, "unpin");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-P2-MSG-3: sessions_send same-account only; no self-target", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-p2c-send-"));
  const paths = homePaths(stateDir);
  const sessions = new SessionStore(paths);
  try {
    const a = await sessions.open({ accountId: "alice", title: "A" });
    const b = await sessions.open({ accountId: "alice", title: "B" });
    await sessions.open({ accountId: "bob", title: "Bob" });
    await assert.rejects(
      () =>
        runSessionsSendTool({
          args: { sessionId: a.sessionId, text: "hi", run: false },
          accountId: "bob",
          sessions,
          origin: "attended",
          appendLine: appendTranscriptLine,
        }),
      /not found for this account/,
    );
    await assert.rejects(
      () =>
        runSessionsSendTool({
          args: { sessionId: a.sessionId, text: "hi", run: false },
          accountId: "alice",
          sessions,
          origin: "attended",
          fromSessionId: a.sessionId,
          appendLine: appendTranscriptLine,
        }),
      /current session/,
    );
    // Inject-only (run:false).
    const ok = JSON.parse(
      await runSessionsSendTool({
        args: { sessionId: b.sessionId, text: "please continue", run: false },
        accountId: "alice",
        sessions,
        origin: "attended",
        fromSessionId: a.sessionId,
        appendLine: appendTranscriptLine,
      }),
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.sessionId, b.sessionId);
    assert.equal(ok.run, false);

    // Default run:true requires wake; stub returns turn + reply.
    const woke = JSON.parse(
      await runSessionsSendTool({
        args: { sessionId: b.sessionId, text: "wake please", waitMs: 1000 },
        accountId: "alice",
        sessions,
        origin: "attended",
        fromSessionId: a.sessionId,
        appendLine: appendTranscriptLine,
        wake: async () => ({ turnId: "turn-stub", reply: "ack from B" }),
      }),
    );
    assert.equal(woke.run, true);
    assert.equal(woke.turnId, "turn-stub");
    assert.equal(woke.reply, "ack from B");

    await assert.rejects(
      () =>
        runSessionsSendTool({
          args: { sessionId: b.sessionId, text: "no wake" },
          accountId: "alice",
          sessions,
          origin: "attended",
          fromSessionId: a.sessionId,
          appendLine: appendTranscriptLine,
        }),
      /wake not configured/,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-P2-MSG-1/2: message requires binding; event-source is notify-only", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-p2c-msg-"));
  try {
    const devices = new DeviceCredentialStore();
    const bindings = new BindingStore(stateDir, devices);
    const logger = new DaemonLogger();
    const channels = new ChannelService({ stateDir, bindings, logger });
    await channels.loadPersisted();
    await channels.setChannelConfig("fake", {}, {});
    await channels.enableChannel("fake");

    await assert.rejects(
      () =>
        runMessageTool({
          args: {
            channel: "fake",
            channelAccount: "default",
            peerId: "nobody",
            text: "hi",
          },
          accountId: "alice",
          channels,
          bindings,
        }),
      /unbound|wrong account/,
    );

    await bindings.set(
      {
        accountId: "alice",
        channel: "fake",
        channelAccount: "default",
        senderId: "u1",
      },
      { kind: "loopback-owner", accountIds: [], ownerTrusted: true },
    );

    // Restricted policy blocks.
    await assert.rejects(
      () =>
        runMessageTool({
          args: {
            channel: "fake",
            channelAccount: "default",
            peerId: "u1",
            text: "hi",
          },
          accountId: "alice",
          channels,
          bindings,
          toolPolicy: "restricted",
        }),
      /restricted/,
    );

    const ok = JSON.parse(
      await runMessageTool({
        args: {
          channel: "fake",
          channelAccount: "default",
          peerId: "u1",
          text: "hello",
        },
        accountId: "alice",
        channels,
        bindings,
      }),
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.kind, "reply");

    // Event-source: notify-only (V-P2-MSG-2).
    await channels.setChannelConfig("fake-events", {}, {});
    await channels.enableChannel("fake-events");
    await bindings.set(
      {
        accountId: "alice",
        channel: "fake-events",
        channelAccount: "default",
        senderId: "src1",
      },
      { kind: "loopback-owner", accountIds: [], ownerTrusted: true },
    );
    const notify = JSON.parse(
      await runMessageTool({
        args: {
          channel: "fake-events",
          channelAccount: "default",
          peerId: "src1",
          text: "ping",
        },
        accountId: "alice",
        channels,
        bindings,
      }),
    );
    assert.equal(notify.kind, "notify");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-P2-MEDIA-1: view_image optional visionDescribe", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-p2d-vis-"));
  const paths = homePaths(stateDir);
  try {
    const files = paths.accountFiles("alice");
    await mkdir(join(files, "uploads"), { recursive: true });
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    await writeFile(join(files, "uploads", "a.png"), png);
    const out = JSON.parse(
      await runViewImageTool({
        args: { path: "uploads/a.png" },
        accountId: "alice",
        paths,
        visionDescribe: async () => "a small PNG header stub",
      }),
    );
    assert.equal(out.vision, true);
    assert.match(out.description, /PNG/);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-P2-MEDIA-2: image_generate fail-closed until Owner enable + provider", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-p2d2-"));
  const paths = homePaths(stateDir);
  const privacy = new PrivacyModeStore(paths);
  const media = new MediaGenerateStore(paths);
  try {
    await assert.rejects(
      () =>
        runImageGenerateTool({
          args: { prompt: "cat" },
          accountId: "alice",
          paths,
          origin: "attended",
          privacyMode: privacy,
          mediaGenerate: media,
        }),
      /disabled/,
    );
    await media.set("alice", { enabled: true });
    await privacy.set("alice", { enabled: true, blockSmartHomeEgress: true });
    await assert.rejects(
      () =>
        runImageGenerateTool({
          args: { prompt: "cat" },
          accountId: "alice",
          paths,
          origin: "attended",
          privacyMode: privacy,
          mediaGenerate: media,
        }),
      /privacy_mode/,
    );
    await privacy.set("alice", { enabled: false, blockSmartHomeEgress: true });
    await assert.rejects(
      () =>
        runImageGenerateTool({
          args: { prompt: "cat" },
          accountId: "alice",
          paths,
          origin: "attended",
          privacyMode: privacy,
          mediaGenerate: media,
        }),
      /no image generate provider/,
    );
    // Async default (enqueue).
    const asyncOk = JSON.parse(
      await runImageGenerateTool({
        args: { prompt: "cat" },
        accountId: "alice",
        paths,
        origin: "attended",
        privacyMode: privacy,
        mediaGenerate: media,
        enqueueGenerate: async () => ({ jobId: "mg-test1" }),
      }),
    );
    assert.equal(asyncOk.ok, true);
    assert.equal(asyncOk.jobId, "mg-test1");
    assert.equal(asyncOk.status, "pending");

    // wait:true sync path writes artifact.
    const ok = JSON.parse(
      await runImageGenerateTool({
        args: { prompt: "cat", wait: true },
        accountId: "alice",
        paths,
        origin: "attended",
        privacyMode: privacy,
        mediaGenerate: media,
        generateImpl: async () => ({
          bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
          mimeType: "image/png",
          ext: "png",
        }),
        enqueueGenerate: async () => ({ jobId: "should-not-use" }),
      }),
    );
    assert.equal(ok.ok, true);
    assert.match(ok.path, /^output\/media\//);
    assert.equal(ok.status, "done");
    // Daily cap fail-closed.
    await media.set("alice", { enabled: true, maxPerDay: 1 });
    await assert.rejects(
      () =>
        runImageGenerateTool({
          args: { prompt: "again", wait: true },
          accountId: "alice",
          paths,
          origin: "attended",
          privacyMode: privacy,
          mediaGenerate: media,
          generateImpl: async () => ({
            bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
            mimeType: "image/png",
            ext: "png",
          }),
        }),
      /rate_limited|daily cap/,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-P2-AGENT-1/2: spawn_helper depth and concurrency; inherits origin", async () => {
  __resetPhase2ToolsForTests();
  const out = JSON.parse(
    await runSpawnHelperTool({
      args: { prompt: "sum 1+1", allowTools: ["read_file", "exec", "spawn_helper", "task"] },
      accountId: "alice",
      origin: "unattended",
      helperDepth: 0,
      complete: async (prompt, allow) => {
        assert.ok(!allow.includes("exec"));
        assert.ok(!allow.includes("spawn_helper"));
        assert.ok(!allow.includes("task"));
        assert.match(prompt, /1\+1/);
        return "2";
      },
    }),
  );
  assert.equal(out.origin, "unattended");
  assert.equal(out.reply, "2");
  assert.equal(out.via, "task");

  await assert.rejects(
    () =>
      runSpawnHelperTool({
        args: { prompt: "x" },
        accountId: "alice",
        origin: "attended",
        helperDepth: 1,
        complete: async () => "nope",
      }),
    /depth limit/,
  );
});
