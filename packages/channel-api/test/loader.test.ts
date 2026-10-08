import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ChannelLoader,
  assertRawRefOwner,
  createFakeChannel,
  createFakeEventSource,
  getFakeChatContextForTests,
  getFakeEventContextForTests,
  postSidecarInbound,
  type InboundEvent,
  type OutboundMessage,
  type RawRefOwner,
} from "../dist/index.js";

test("V-CH-5/8/9: fake channel round-trip; secrets never read back; event-source registers", async () => {
  const inbound: InboundEvent[] = [];
  const outbound: OutboundMessage[] = [];
  const loader = new ChannelLoader(
    async (e) => {
      inbound.push(e);
      if (e.rawRef) loader.noteRawRefOwner(e.channel, e.channelAccount, e.rawRef, "alice");
      return { accepted: true, sessionId: "sess-1" };
    },
    async (m) => {
      outbound.push(m);
    },
  );
  loader.registerPlugin(createFakeChannel());
  loader.registerPlugin(createFakeEventSource());

  await loader.setChannelConfig("fake", { echo: true }, { token: "secret-token" });
  const status = loader.getChannelStatus("fake");
  assert.equal(status.config.echo, true);
  assert.equal(JSON.stringify(status).includes("secret-token"), false);

  await assert.rejects(
    () => loader.setChannelConfig("fake", { undeclared: 1 }),
    /undeclared/,
  );

  await loader.enableChannel("fake", "acct-1");
  assert.equal(loader.listChannels().find((c) => c.id === "fake")?.enabled, true);

  const chatCtx = getFakeChatContextForTests();
  assert.ok(chatCtx);
  const ack = await chatCtx!.emitInbound({
    senderId: "sender-1",
    text: "hello",
    rawRef: "thread-1",
  });
  assert.equal(ack.accepted, true);
  assert.equal(inbound.length, 1);

  await loader.setChannelConfig("fake-events", {});
  await loader.enableChannel("fake-events", "acct-1");
  assert.equal(loader.isSourceRegistered("fake-events", "sensor.1"), true);
  assert.equal(loader.isSourceRegistered("fake-events", "spoofed"), false);

  const evCtx = getFakeEventContextForTests();
  const dropped = await evCtx!.emitInbound({ sourceId: "spoofed", text: "motion" });
  assert.equal(dropped.accepted, false);

  const evOk = await evCtx!.emitInbound({ sourceId: "sensor.1", text: "motion" });
  assert.equal(evOk.accepted, true);

  await loader.deliverOutbound("fake-events", {
    accountId: "alice",
    text: "notify",
    kind: "notify",
  });
  assert.equal(outbound.length, 0);
});

test("V-CH-3: outbound cannot spoof another account rawRef", async () => {
  const owners = new Map<string, RawRefOwner>();
  owners.set("telegram\0bot\0thread-1", {
    accountId: "alice",
    channel: "telegram",
    channelAccount: "bot",
  });
  assert.throws(
    () =>
      assertRawRefOwner(owners, "telegram", "bot", {
        accountId: "bob",
        text: "hi",
        rawRef: "thread-1",
      }),
    /rawRef is bound/,
  );
});

test("V-CH-4: disable stops intake", async () => {
  const loader = new ChannelLoader(
    async () => ({ accepted: true }),
    async () => undefined,
  );
  loader.registerPlugin(createFakeChannel());
  await loader.setChannelConfig("fake", {});
  await loader.enableChannel("fake", "a");
  await loader.disableChannel("fake");
  assert.equal(loader.getChannelStatus("fake").enabled, false);
  const ctx = getFakeChatContextForTests();
  assert.ok(ctx);
  const ack = await ctx!.emitInbound({ senderId: "s", text: "x" });
  assert.equal(ack.accepted, false);
  assert.equal(ack.reason, "channel_disabled");
});

test("V-CH-7: ChannelContext surface omits harness/filesystem keys", async () => {
  const allowed = new Set([
    "channel",
    "channelAccount",
    "config",
    "secrets",
    "log",
    "registerSources",
    "emitInbound",
    "outbound",
  ]);
  loaderRegisterAndInspect();
  async function loaderRegisterAndInspect() {
    const loader = new ChannelLoader(
      async () => ({ accepted: true }),
      async () => undefined,
    );
    loader.registerPlugin(createFakeChannel());
    await loader.setChannelConfig("fake", {});
    await loader.enableChannel("fake", "a");
    const ctx = getFakeChatContextForTests()!;
    for (const key of Object.keys(ctx)) {
      assert.ok(allowed.has(key), `unexpected ChannelContext key: ${key}`);
    }
    assert.equal("harness" in ctx, false);
    assert.equal("sandboxRoot" in ctx, false);
    assert.equal("readAccountFile" in ctx, false);
  }
});

test("V-CH-6: sidecar client refuses non-localhost by default", async () => {
  await assert.rejects(
    () =>
      postSidecarInbound(
        { baseUrl: "http://203.0.113.1:4781", apiKey: "k" },
        { text: "hi" },
      ),
    /localhost-only/,
  );
});
