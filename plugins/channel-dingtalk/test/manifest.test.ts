import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import dingtalkPlugin, { dingtalkManifest, createDingtalkChannel } from "../dist/index.js";

test("dingtalk manifest is chat kind without actuate", () => {
  assert.equal(dingtalkManifest.kind, "chat");
  assert.equal(dingtalkManifest.id, "dingtalk");
  assert.equal(dingtalkPlugin.manifest.kind, "chat");
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

test("dingtalk 1:1 message emits inbound; group ignored", async () => {
  FakeWs.instances = [];
  const inbound = [];
  const fetchMock = async (input) => {
    const url = String(input);
    if (url.includes("accessToken") || url.includes("oauth2")) {
      return new Response(JSON.stringify({ accessToken: "tok" }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const plugin = createDingtalkChannel({
    fetch: fetchMock,
    WebSocket: FakeWs,
  });
  await plugin.start({
    channel: "dingtalk",
    channelAccount: "default",
    config: { streamUrl: "ws://fake-ding" },
    secrets: {
      get: (k) => (k === "clientId" ? "cid" : k === "clientSecret" ? "sec" : undefined),
    },
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
      headers: { messageId: "mid1" },
      data: JSON.stringify({
        conversationType: "1",
        senderStaffId: "staff1",
        text: { content: "ping" },
        sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=abc",
      }),
    }),
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(inbound.length, 1);
  assert.equal(inbound[0].senderId, "staff1");
  inbound.length = 0;
  ws.emit("message", {
    data: JSON.stringify({
      headers: { messageId: "mid2" },
      data: JSON.stringify({
        conversationType: "2",
        senderStaffId: "staff1",
        text: { content: "group" },
      }),
    }),
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(inbound.length, 0);
  // Missing conversationType fails closed (not treated as 单聊).
  ws.emit("message", {
    data: JSON.stringify({
      headers: { messageId: "mid3" },
      data: JSON.stringify({
        senderStaffId: "staff1",
        text: { content: "no type" },
      }),
    }),
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(inbound.length, 0);
  await plugin.stop?.();
});

test("dingtalk rejects non-dingtalk sessionWebhook hosts", async () => {
  FakeWs.instances = [];
  const posts = [];
  const fetchMock = async (input, init) => {
    const url = String(input);
    if (url.includes("accessToken") || url.includes("oauth2")) {
      return new Response(JSON.stringify({ accessToken: "tok" }), { status: 200 });
    }
    if (init?.method === "POST") posts.push(url);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const plugin = createDingtalkChannel({
    fetch: fetchMock,
    WebSocket: FakeWs,
  });
  await plugin.start({
    channel: "dingtalk",
    channelAccount: "default",
    config: { streamUrl: "ws://fake-ding" },
    secrets: {
      get: (k) => (k === "clientId" ? "cid" : k === "clientSecret" ? "sec" : undefined),
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    registerSources: () => {},
    emitInbound: async () => ({ accepted: false, pairingRequired: true }),
    outbound: async () => {},
  });
  await new Promise((r) => setTimeout(r, 20));
  const ws = FakeWs.instances[0];
  ws.emit("message", {
    data: JSON.stringify({
      headers: { messageId: "mid-ssrf" },
      data: JSON.stringify({
        conversationType: "1",
        senderStaffId: "staffX",
        text: { content: "ping" },
        sessionWebhook: "https://169.254.169.254/latest/meta-data/",
      }),
    }),
  });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(
    posts.some((u) => u.includes("169.254.169.254")),
    false,
    "must not POST to link-local sessionWebhook",
  );
  await plugin.stop?.();
});
