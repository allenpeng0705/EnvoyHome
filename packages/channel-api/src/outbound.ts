import type { ChannelKind } from "./manifest.js";
import type { OutboundMessage } from "./context.js";

export interface RawRefOwner {
  accountId: string;
  channel: string;
  channelAccount: string;
}

/**
 * Event-source plugins may only notify — never actuate through outbound (§5.3.1).
 * Chat plugins: coerce any `link` tier to `markdown` (Design §9.5 — no home HTTPS).
 */
export function normalizeOutbound(kind: ChannelKind, msg: OutboundMessage): OutboundMessage {
  const raw = msg as OutboundMessage & {
    format?: string;
    artifactUrl?: unknown;
    artifactPath?: unknown;
  };
  // Channels never open home artifacts over HTTPS (no public IP on most desktops).
  const format: OutboundMessage["format"] =
    raw.format === "plain" ? "plain" : raw.format === "markdown" || raw.format === "link"
      ? "markdown"
      : raw.format === undefined
        ? undefined
        : "markdown";
  const action =
    msg.action === "send" ||
    msg.action === "notify" ||
    msg.action === "reply" ||
    msg.action === "react" ||
    msg.action === "edit" ||
    msg.action === "delete" ||
    msg.action === "pin" ||
    msg.action === "unpin"
      ? msg.action
      : undefined;
  const mediaPaths = Array.isArray(msg.mediaPaths)
    ? msg.mediaPaths.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : undefined;
  const next: OutboundMessage = {
    accountId: msg.accountId,
    text: msg.text,
    ...(msg.rawRef !== undefined ? { rawRef: msg.rawRef } : {}),
    ...(format !== undefined ? { format } : {}),
    ...(msg.kind !== undefined ? { kind: msg.kind } : {}),
    ...(action !== undefined ? { action } : {}),
    ...(typeof msg.reaction === "string" && msg.reaction.trim()
      ? { reaction: msg.reaction.trim().slice(0, 64) }
      : {}),
    ...(mediaPaths && mediaPaths.length > 0 ? { mediaPaths: mediaPaths.slice(0, 8) } : {}),
  };
  if (kind === "event-source") {
    // Event-source: notify-only; strip chat-rich fields that imply actuation/thread.
    return {
      accountId: next.accountId,
      text: next.text,
      kind: "notify",
      ...(next.rawRef !== undefined ? { rawRef: next.rawRef } : {}),
      ...(next.format !== undefined ? { format: next.format } : {}),
    };
  }
  return next;
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
