import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createDiscordChannel } from "../dist/index.js";

/** Minimal fake WebSocket for gateway unit tests. */
class FakeWs extends EventEmitter {
  static instances = [];
  readyState = 1;
  sent = [];
  url = "";
  constructor(url) {
    super();
    this.url = url;
    FakeWs.instances.push(this);
    queueMicrotask(() => this.emit("open"));
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.emit("close");
  }
  addEventListener(type, fn) {
    this.on(type, fn);
  }
}

test("discord DM MESSAGE_CREATE emits inbound + pairing reply", async () => {
  FakeWs.instances = [];
  const inbound = [];
  let pairingReply;

  const fetchMock = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/users/@me")) {
      return new Response(JSON.stringify({ id: "bot1", username: "EnvoyHomeBot" }), {
        status: 200,
      });
    }
    if (url.endsWith("/gateway/bot")) {
      return new Response(JSON.stringify({ url: "ws://fake-gateway" }), { status: 200 });
    }
    // Channel type probe — 1 = DM, 3 = group DM (must ignore).
    if (url.includes("/channels/") && !url.endsWith("/messages") && (!init || init.method === "GET" || !init.method)) {
      const id = url.split("/channels/")[1].split("?")[0];
      const type = id === "group99" ? 3 : 1;
      return new Response(JSON.stringify({ id, type }), { status: 200 });
    }
    if (url.includes("/channels/") && url.endsWith("/messages") && init?.method === "POST") {
      const body = JSON.parse(String(init.body || "{}"));
      const channelId = url.split("/channels/")[1].split("/")[0];
      pairingReply = { channelId, content: body.content || "" };
      return new Response(JSON.stringify({ id: "out1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: `unexpected ${url}` }), { status: 500 });
  };

  const plugin = createDiscordChannel({
    fetch: fetchMock,
    WebSocket: FakeWs,
  });

  const ctx = {
    channel: "discord",
    channelAccount: "default",
    config: {},
    secrets: { get: (k) => (k === "botToken" ? "test-token" : undefined) },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    registerSources: () => {},
    emitInbound: async (partial) => {
      inbound.push(partial);
      return { accepted: false, pairingRequired: true, reason: "unknown_sender" };
    },
    outbound: async () => {},
  };

  await plugin.start(ctx);
  await new Promise((r) => setTimeout(r, 20));
  const ws = FakeWs.instances[0];
  assert.ok(ws);

  ws.emit("message", {
    data: JSON.stringify({ op: 10, d: { heartbeat_interval: 50_000 } }),
  });
  await new Promise((r) => setTimeout(r, 10));
  const identify = ws.sent.map((s) => JSON.parse(s)).find((p) => p.op === 2);
  assert.ok(identify);
  assert.equal(identify.d.intents, 1 << 12);

  ws.emit("message", {
    data: JSON.stringify({
      op: 0,
      t: "MESSAGE_CREATE",
      s: 1,
      d: {
        id: "m1",
        content: "hello home",
        channel_id: "dm99",
        author: { id: "user42", username: "alice", bot: false },
      },
    }),
  });
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(inbound.length, 1);
  assert.deepEqual(inbound[0], {
    senderId: "user42",
    text: "hello home",
    rawRef: "dm99:m1",
  });
  assert.ok(pairingReply);
  assert.equal(pairingReply.channelId, "dm99");
  assert.match(pairingReply.content, /user42/);

  // Guild messages must be ignored (Chat / DM only).
  inbound.length = 0;
  ws.emit("message", {
    data: JSON.stringify({
      op: 0,
      t: "MESSAGE_CREATE",
      s: 2,
      d: {
        id: "m2",
        content: "guild noise",
        channel_id: "c1",
        guild_id: "g1",
        author: { id: "user42", username: "alice", bot: false },
      },
    }),
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(inbound.length, 0);

  // Group DMs (type 3, no guild_id) must be ignored.
  ws.emit("message", {
    data: JSON.stringify({
      op: 0,
      t: "MESSAGE_CREATE",
      s: 3,
      d: {
        id: "m3",
        content: "group dm",
        channel_id: "group99",
        author: { id: "user42", username: "alice", bot: false },
      },
    }),
  });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(inbound.length, 0);

  await plugin.stop?.();
});
