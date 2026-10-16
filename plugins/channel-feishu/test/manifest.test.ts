import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import feishuPlugin, { feishuManifest, createFeishuChannel } from "../dist/index.js";

test("feishu manifest is chat kind without actuate", () => {
  assert.equal(feishuManifest.kind, "chat");
  assert.equal(feishuManifest.id, "feishu");
  assert.equal(feishuPlugin.manifest.kind, "chat");
});

class FakeWs extends EventEmitter {
  static instances = [];
  sent = [];
  constructor(url) {
    super();
    this.url = url;
    FakeWs.instances.push(this);
    queueMicrotask(() => this.emit("open"));
  }
  send(d) {
    this.sent.push(d);
  }
  close() {
    this.emit("close");
  }
  addEventListener(t, fn) {
    this.on(t, fn);
  }
}

test("feishu p2p message emits inbound; group ignored", async () => {
  FakeWs.instances = [];
  const inbound = [];
  const fetchMock = async (input) => {
    const url = String(input);
    if (url.includes("tenant_access_token")) {
      return new Response(JSON.stringify({ code: 0, tenant_access_token: "t-1" }), { status: 200 });
    }
    if (url.includes("callback/ws/endpoint")) {
      return new Response(JSON.stringify({ code: 0, data: { url: "ws://fake-feishu" } }), {
        status: 200,
      });
    }
    if (url.includes("/im/v1/messages")) {
      return new Response(JSON.stringify({ code: 0 }), { status: 200 });
    }
    return new Response(JSON.stringify({ code: 1, msg: url }), { status: 200 });
  };
  const plugin = createFeishuChannel({ fetch: fetchMock, WebSocket: FakeWs });
  await plugin.start({
    channel: "feishu",
    channelAccount: "default",
    config: {},
    secrets: { get: (k) => (k === "appId" ? "id" : k === "appSecret" ? "sec" : undefined) },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    registerSources: () => {},
    emitInbound: async (p) => {
      inbound.push(p);
      return { accepted: true };
    },
    outbound: async () => {},
  });
  await new Promise((r) => setTimeout(r, 20));
  const ws = FakeWs.instances[0];
  assert.ok(ws);
  ws.emit("message", {
    data: JSON.stringify({
      envelope_id: "e1",
      data: {
        header: { event_type: "im.message.receive_v1" },
        event: {
          message: {
            chat_type: "p2p",
            message_id: "m1",
            message_type: "text",
            content: JSON.stringify({ text: "hi" }),
          },
          sender: { sender_id: { open_id: "ou_1" } },
        },
      },
    }),
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(inbound.length, 1);
  assert.equal(inbound[0].senderId, "ou_1");
  inbound.length = 0;
  ws.emit("message", {
    data: JSON.stringify({
      data: {
        header: { event_type: "im.message.receive_v1" },
        event: {
          message: {
            chat_type: "group",
            message_type: "text",
            content: JSON.stringify({ text: "nope" }),
          },
          sender: { sender_id: { open_id: "ou_1" } },
        },
      },
    }),
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(inbound.length, 0);
  await plugin.stop?.();
});
