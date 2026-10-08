import type { ChannelKind } from "./manifest.js";
import type { OutboundMessage } from "./context.js";

export interface RawRefOwner {
  accountId: string;
  channel: string;
  channelAccount: string;
}

/**
 * Event-source plugins may only notify — never actuate through outbound (§5.3.1).
 */
export function normalizeOutbound(kind: ChannelKind, msg: OutboundMessage): OutboundMessage {
  if (kind === "event-source" && msg.kind === undefined) {
    return { ...msg, kind: "notify" };
  }
  return msg;
}

/**
 * V-CH-3 — outbound must not target another account's thread via spoofed rawRef.
 */
export function assertRawRefOwner(
  owners: ReadonlyMap<string, RawRefOwner>,
  channel: string,
  channelAccount: string,
  msg: OutboundMessage,
): void {
  if (!msg.rawRef) return;
  const key = `${channel}\0${channelAccount}\0${msg.rawRef}`;
  const owner = owners.get(key);
  if (owner && owner.accountId !== msg.accountId) {
    throw new Error(
      `envoyhome.auth: rawRef is bound to account ${owner.accountId}, not ${msg.accountId}`,
    );
  }
}

/** Reject event-source outbound that tries to actuate (no actuate capability). */
export function assertNotificationOnly(kind: ChannelKind, msg: OutboundMessage): void {
  if (kind === "event-source" && msg.kind === "reply") {
    throw new Error("envoyhome.auth: event-source outbound is notification-only");
  }
}
