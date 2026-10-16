import { test } from "node:test";
import assert from "node:assert/strict";
import wecomPlugin, { wecomManifest, createWecomChannel } from "../dist/index.js";

test("wecom manifest is chat kind without actuate", () => {
  assert.equal(wecomManifest.kind, "chat");
  assert.equal(wecomManifest.id, "wecom");
  assert.equal(wecomPlugin.manifest.kind, "chat");
});

test("wecom sync_msg text emits inbound", async () => {
  const inbound = [];
  let polls = 0;
  const fetchMock = async (input) => {
    const url = String(input);
    if (url.includes("gettoken")) {
      return new Response(JSON.stringify({ errcode: 0, access_token: "tok" }), { status: 200 });
    }
    if (url.includes("sync_msg")) {
      polls += 1;
      if (polls === 1) {
        return new Response(
          JSON.stringify({
            errcode: 0,
            next_cursor: "c2",
            msg_list: [
              {
                msgid: "m1",
                external_userid: "wm1",
                open_kfid: "wk1",
                msgtype: "text",
                text: { content: "hello" },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ errcode: 0, msg_list: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ errcode: 0 }), { status: 200 });
  };
  const plugin = createWecomChannel({ fetch: fetchMock, pollMs: 50 });
  await plugin.start({
    channel: "wecom",
    channelAccount: "default",
    config: { agentId: "1000001" },
    secrets: {
      get: (k) => (k === "corpId" ? "ww" : k === "secret" ? "sec" : undefined),
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    registerSources: () => {},
    emitInbound: async (p) => {
      inbound.push(p);
      return { accepted: true };
    },
    outbound: async () => {},
  });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(inbound.length, 1);
  assert.deepEqual(inbound[0], { senderId: "wm1", text: "hello", rawRef: "wm1:m1" });
  await plugin.stop?.();
});

test("wecom sync_msg includes open_kfid when configured", async () => {
  const syncBodies = [];
  let polls = 0;
  const fetchMock = async (input, init) => {
    const url = String(input);
    if (url.includes("gettoken")) {
      return new Response(JSON.stringify({ errcode: 0, access_token: "tok" }), { status: 200 });
    }
    if (url.includes("sync_msg")) {
      polls += 1;
      syncBodies.push(JSON.parse(String(init?.body || "{}")));
      return new Response(JSON.stringify({ errcode: 0, msg_list: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ errcode: 0 }), { status: 200 });
  };
  const plugin = createWecomChannel({ fetch: fetchMock, pollMs: 50 });
  await plugin.start({
    channel: "wecom",
    channelAccount: "default",
    config: { agentId: "1000001", openKfid: "wk-cfg" },
    secrets: {
      get: (k) => (k === "corpId" ? "ww" : k === "secret" ? "sec" : undefined),
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    registerSources: () => {},
    emitInbound: async () => ({ accepted: true }),
    outbound: async () => {},
  });
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(polls >= 1);
  assert.equal(syncBodies[0].open_kfid, "wk-cfg");
  await plugin.stop?.();
});

test("wecom pairing reply uses kf/send_msg not message/send", async () => {
  const posts = [];
  let polls = 0;
  const fetchMock = async (input, init) => {
    const url = String(input);
    if (url.includes("gettoken")) {
      return new Response(JSON.stringify({ errcode: 0, access_token: "tok" }), { status: 200 });
    }
    if (url.includes("sync_msg")) {
      polls += 1;
      if (polls === 1) {
        return new Response(
          JSON.stringify({
            errcode: 0,
            msg_list: [
              {
                msgid: "m2",
                external_userid: "wm2",
                open_kfid: "wk2",
                msgtype: "text",
                text: { content: "hi" },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ errcode: 0, msg_list: [] }), { status: 200 });
    }
    if (init?.method === "POST") {
      posts.push({ url, body: JSON.parse(String(init.body || "{}")) });
    }
    return new Response(JSON.stringify({ errcode: 0 }), { status: 200 });
  };
  const plugin = createWecomChannel({ fetch: fetchMock, pollMs: 50 });
  await plugin.start({
    channel: "wecom",
    channelAccount: "default",
    config: { agentId: "1000001", openKfid: "wk-fallback" },
    secrets: {
      get: (k) => (k === "corpId" ? "ww" : k === "secret" ? "sec" : undefined),
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    registerSources: () => {},
    emitInbound: async () => ({ accepted: false, pairingRequired: true }),
    outbound: async () => {},
  });
  await new Promise((r) => setTimeout(r, 80));
  const kfSend = posts.find((p) => p.url.includes("kf/send_msg"));
  assert.ok(kfSend, "expected kf/send_msg");
  assert.equal(kfSend.body.touser, "wm2");
  assert.equal(kfSend.body.open_kfid, "wk2");
  assert.equal(posts.some((p) => p.url.includes("message/send")), false);
  await plugin.stop?.();
});
