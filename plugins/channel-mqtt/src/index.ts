/**
 * MQTT event-source — read-only credentials, notification-only outbound (Design §5.7).
 */

import type { ChannelPlugin, OutboundMessage } from "@envoyhome/channel-api";

export const mqttManifest = {
  id: "mqtt",
  apiVersion: 1,
  kind: "event-source" as const,
  label: "MQTT",
  capabilities: ["events"] as const,
  configSchema: {
    brokerUrl: { required: true },
    username: { secret: true, credentialScope: "read" as const },
    password: { secret: true, credentialScope: "read" as const },
  },
};

export function createMqttChannel(): ChannelPlugin {
  return {
    manifest: mqttManifest,
    async start(ctx) {
      ctx.registerSources([]);
      ctx.log.info(`mqtt: read-only stub for ${ctx.channelAccount}`);
    },
    async health() {
      return { ok: true, detail: "mqtt stub (no live broker in B14 slice)" };
    },
    async send(msg: OutboundMessage) {
      if (msg.kind !== "notify" && msg.kind !== undefined) {
        throw new Error("event-source outbound must be notify-only");
      }
    },
  };
}

export default createMqttChannel();
