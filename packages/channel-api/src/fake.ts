// In-tree fake channel for V-CH-5 — third-party shape without Telegram.

import type { ChannelContext, OutboundMessage } from "./context.js";
import type { ChannelPlugin } from "./loader.js";

let lastFakeChatCtx: ChannelContext | undefined;
let lastFakeEventCtx: ChannelContext | undefined;

export function getFakeChatContextForTests(): ChannelContext | undefined {
  return lastFakeChatCtx;
}

export function getFakeEventContextForTests(): ChannelContext | undefined {
  return lastFakeEventCtx;
}

export function createFakeChannel(): ChannelPlugin {
  const sent: OutboundMessage[] = [];
  return {
    manifest: {
      id: "fake",
      apiVersion: 1,
      kind: "chat",
      label: "Fake Channel",
      configSchema: { echo: { required: false }, token: { secret: true } },
      capabilities: ["text"],
    },
    async start(ctx) {
      lastFakeChatCtx = ctx;
    },
    async send(msg) {
      sent.push(msg);
    },
    /** Test-only read of outbound deliveries from daemon turn replies. */
    __sentForTests: sent,
  } as ChannelPlugin & { __sentForTests: OutboundMessage[] };
}

export function createFakeEventSource(): ChannelPlugin {
  return {
    manifest: {
      id: "fake-events",
      apiVersion: 1,
      kind: "event-source",
      label: "Fake Event Source",
      configSchema: {},
      capabilities: ["events"],
    },
    async start(ctx) {
      lastFakeEventCtx = ctx;
      ctx.registerSources([
        { sourceId: "sensor.1", displayName: "Sensor 1", class: "sensor" },
      ]);
    },
    async send(msg) {
      if (msg.kind !== "notify" && msg.kind !== undefined) {
        throw new Error("event-source send must be notify-only");
      }
    },
  };
}
