import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelegramChannel } from "../dist/index.js";
import type { ChannelContext, InboundAck } from "@envoyhome/channel-api";

function mockFetch(handlers: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = url.split("/").pop() ?? "";
    if (method === "getUpdates" && init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const result = handlers[method];
    if (result === undefined) {
      return new Response(JSON.stringify({ ok: false, description: `unexpected ${method}` }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  }) as typeof fetch;
}

test("V-CH-1: mock getUpdates → emitInbound → sendMessage reply path", async () => {
  const sent: Array<Record<string, unknown>> = [];
  let emitCount = 0;
  const fetchImpl = mockFetch({
    getMe: { id: 1, is_bot: true, username: "envoyhome_bot" },
    getUpdates: [
      {
        update_id: 10,
        message: {
          message_id: 99,
          text: "hello bot",
          chat: { id: 555 },
          from: { id: 777, username: "alice" },
        },
      },
    ],
    sendMessage: { message_id: 100 },
  });

  // Second getUpdates hangs until abort after first batch processed.
  let updatesCalls = 0;
  const fetchWrapped: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = url.split("/").pop() ?? "";
    if (method === "getUpdates") {
      updatesCalls += 1;
      if (updatesCalls === 1) {
        return fetchImpl(input, init);
      }
      await new Promise((r) => setTimeout(r, 50));
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
    }
    if (method === "sendMessage") {
      sent.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ ok: true, result: { message_id: 100 } }), {
        status: 200,
      });
    }
    return fetchImpl(input, init);
  };

  const plugin = createTelegramChannel({ fetch: fetchWrapped });
  const ctx: ChannelContext = {
    channel: "telegram",
    channelAccount: "default",
    config: {},
    secrets: { get: (k) => (k === "botToken" ? "TEST:TOKEN" : undefined) },
    log: { info() {}, warn() {} },
    registerSources() {},
    emitInbound: async (): Promise<InboundAck> => {
      emitCount += 1;
      return { accepted: true, sessionId: "s1" };
    },
    outbound: async () => undefined,
  };

  await plugin.start(ctx);
  for (let i = 0; i < 40 && emitCount < 1; i++) {
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.equal(emitCount, 1);

  await plugin.send?.({
    accountId: "alice",
    text: "pong",
    kind: "reply",
    rawRef: "555:99",
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.chat_id, "555");
  assert.equal(sent[0]?.text, "pong");

  const h = await plugin.health?.();
  assert.equal(h?.ok, true);
  assert.match(h?.detail ?? "", /envoyhome_bot/);

  await plugin.stop?.();
});

test("pairingRequired → instructional sendMessage", async () => {
  const sent: Array<Record<string, unknown>> = [];
  let updatesCalls = 0;
  const fetchWrapped: typeof fetch = async (input, init) => {
    const method = String(input).split("/").pop() ?? "";
    if (method === "getMe") {
      return new Response(
        JSON.stringify({ ok: true, result: { id: 1, is_bot: true, username: "b" } }),
        { status: 200 },
      );
    }
    if (method === "getUpdates") {
      updatesCalls += 1;
      if (updatesCalls === 1) {
        return new Response(
          JSON.stringify({
            ok: true,
            result: [
              {
                update_id: 1,
                message: {
                  message_id: 1,
                  text: "hi",
                  chat: { id: 9 },
                  from: { id: 42 },
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      await new Promise((r) => setTimeout(r, 50));
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
    }
    if (method === "sendMessage") {
      sent.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  };

  const plugin = createTelegramChannel({ fetch: fetchWrapped });
  await plugin.start({
    channel: "telegram",
    channelAccount: "default",
    config: {},
    secrets: { get: () => "T" },
    log: { info() {}, warn() {} },
    registerSources() {},
    emitInbound: async () => ({ accepted: false, pairingRequired: true }),
    outbound: async () => undefined,
  });
  for (let i = 0; i < 40 && sent.length < 1; i++) {
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.ok(sent.length >= 1);
  assert.match(String(sent[0]?.text), /senderId `42`/);
  await plugin.stop?.();
});
