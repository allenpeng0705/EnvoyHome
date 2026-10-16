/**
 * MQTT event-source — read-only credentials, notification-only outbound (Design §5.7).
 */

import type { ChannelPlugin, OutboundMessage } from "@envoyhome/channel-api";
import { probeMqttBroker } from "./probe.js";

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
    /** When true, this instance points at EnvoyHome's local fake-mqtt demo. */
    demo: { required: false },
  },
};

export function createMqttChannel(): ChannelPlugin {
  let brokerUrl = "";
  return {
    manifest: mqttManifest,
    async start(ctx) {
      brokerUrl = typeof ctx.config.brokerUrl === "string" ? ctx.config.brokerUrl.trim() : "";
      ctx.registerSources([]);
      ctx.log.info(`mqtt: event-source for ${ctx.channelAccount} (${brokerUrl || "no brokerUrl"})`);
    },
    async health() {
      if (!brokerUrl) {
        return { ok: false, detail: "brokerUrl not configured" };
      }
      // Live pub/sub I/O is still a stub; health probes TCP/TLS reachability only.
      return probeMqttBroker(brokerUrl);
    },
    async send(msg: OutboundMessage) {
      if (msg.kind !== "notify" && msg.kind !== undefined) {
        throw new Error("event-source outbound must be notify-only");
      }
    },
  };
}

export default createMqttChannel();
