/**
 * Home Assistant event-source — read-only token, registerSources inventory.
 */

import type { ChannelPlugin, OutboundMessage } from "@envoyhome/channel-api";

export const haManifest = {
  id: "homeassistant",
  apiVersion: 1,
  kind: "event-source" as const,
  label: "Home Assistant",
  capabilities: ["events"] as const,
  configSchema: {
    baseUrl: { required: true },
    accessToken: { secret: true, required: true, credentialScope: "read" as const },
  },
};

export function createHomeAssistantChannel(): ChannelPlugin {
  return {
    manifest: haManifest,
    async start(ctx) {
      ctx.registerSources([]);
      ctx.log.info(`homeassistant: read-only stub for ${ctx.channelAccount}`);
    },
    async health() {
      return { ok: true, detail: "homeassistant stub (no live WS in B14 slice)" };
    },
    async send(msg: OutboundMessage) {
      if (msg.kind !== "notify" && msg.kind !== undefined) {
        throw new Error("event-source outbound must be notify-only");
      }
    },
  };
}

export default createHomeAssistantChannel();
