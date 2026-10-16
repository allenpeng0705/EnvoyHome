import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createSlackChannel } from "../dist/index.js";

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

test("slack IM message emits inbound + pairing reply; channel messages ignored", async () => {
  FakeWs.instances = [];
  const inbound = [];
  let pairingReply;

  const fetchMock = async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith("/auth.test")) {
      return new Response(JSON.stringify({ ok: true, user_id: "UBOT", team: "Home" }), {
        status: 200,
      });
    }
    if (url.endsWith("/apps.connections.open")) {
      return new Response(JSON.stringify({ ok: true, url: "ws://fake-slack" }), { status: 200 });
    }
    if (url.endsWith("/chat.postMessage")) {
      pairingReply = body;
      return new Response(JSON.stringify({ ok: true, ts: "1.2" }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: false, error: `unexpected ${url}` }), { status: 200 });
  };

  const plugin = createSlackChannel({
    fetch: fetchMock,
    WebSocket: FakeWs,
  });

  const ctx = {
    channel: "slack",
    channelAccount: "default",
    config: {},
    secrets: {
      get: (k) => (k === "botToken" ? "xoxb-test" : k === "appToken" ? "xapp-test" : undefined),
    },
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
    data: JSON.stringify({
      type: "events_api",
      envelope_id: "env-1",
      payload: {
        event: {
          type: "message",
          user: "U42",
          text: "hello",
          channel: "D99",
          channel_type: "im",
          ts: "100.1",
        },
      },
    }),
  });
  await new Promise((r) => setTimeout(r, 30));

  assert.ok(ws.sent.some((s) => JSON.parse(s).envelope_id === "env-1"));
  assert.equal(inbound.length, 1);
  assert.deepEqual(inbound[0], {
    senderId: "U42",
    text: "hello",
    rawRef: "D99:100.1",
  });
  assert.equal(pairingReply?.channel, "D99");
  assert.match(String(pairingReply?.text), /U42/);

  inbound.length = 0;
  ws.emit("message", {
    data: JSON.stringify({
      type: "events_api",
      envelope_id: "env-2",
      payload: {
        event: {
          type: "message",
          user: "U42",
          text: "noise",
          channel: "C1",
          channel_type: "channel",
          ts: "100.2",
        },
      },
    }),
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(inbound.length, 0);

  await plugin.stop?.();
});
