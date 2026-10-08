/**
 * Telegram Bot API demo channel — chat kind, no actuate capability (Design §5.3.1).
 * Production polling/webhook wiring lands incrementally; B7 proves manifest + contract.
 */

import type { ChannelPlugin } from "@envoyhome/channel-api";
import type { OutboundMessage } from "@envoyhome/channel-api";

export const telegramManifest = {
  id: "telegram",
  apiVersion: 1,
  kind: "chat" as const,
  label: "Telegram",
  capabilities: ["text", "media", "edit", "react", "threads"] as const,
  configSchema: {
    channelAccount: { required: false },
    botToken: { secret: true, required: true, credentialScope: "read" as const },
    apiBase: { required: false },
  },
};

export function createTelegramChannel(): ChannelPlugin {
  return {
    manifest: telegramManifest,
    async start(ctx) {
      const token = ctx.secrets.get("botToken");
      if (!token) {
        ctx.log.warn("telegram: botToken not configured — channel idle until setChannelConfig");
        return;
      }
      ctx.log.info(`telegram: ready for ${ctx.channelAccount}`);
    },
    async health() {
      return { ok: true, detail: "telegram demo (no live poll in B7)" };
    },
    async send(msg: OutboundMessage) {
      // Daemon-owned outbound after a turn — map to Bot API in a later slice.
      void msg;
    },
  };
}

export default createTelegramChannel();
