// ChannelContext — deliberately omits sandbox roots, other accounts, model keys, mesh keys (V-CH-7).

import type { InboundAck } from "./emit-inbound.js";

export interface SourceDescriptor {
  sourceId: string;
  displayName: string;
  class: string;
}

export interface OutboundMessage {
  accountId: string;
  text: string;
  rawRef?: string;
  /**
   * Design §9.5 / §5.3.3 — chat plugins: `plain` | `markdown` only.
   * Daemon coerces `link` → `markdown` (no publicBaseUrl / HTTPS to home).
   */
  format?: "plain" | "markdown";
  /** Notification-only for event-source — never actuation. */
  kind?: "notify" | "reply";
  /**
   * Design §19.11 Adapt — rich action hint for chat plugins.
   * Unknown actions are stripped by normalizeOutbound; plugins MAY ignore.
   * Capability-gated: react / edit / delete / pin (unpin uses pin).
   */
  action?: "send" | "notify" | "reply" | "react" | "edit" | "delete" | "pin" | "unpin";
  /** Required when action is `react` (emoji / shortcode). */
  reaction?: string;
  /** Jail-relative media paths already validated by the daemon. */
  mediaPaths?: string[];
}

export interface InboundEvent {
  channel: string;
  channelAccount: string;
  senderId?: string;
  sourceId?: string;
  text?: string;
  rawRef?: string;
  receivedAt: string;
}

export interface SecretHandle {
  get(name: string): string | undefined;
}

export interface ChannelLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface ChannelContext {
  channel: string;
  channelAccount: string;
  config: Record<string, unknown>;
  secrets: SecretHandle;
  log: ChannelLogger;
  /** Daemon-observed registration — not plugin-asserted auth. */
  registerSources: (descriptors: SourceDescriptor[]) => void | Promise<void>;
  emitInbound: (
    event: Omit<InboundEvent, "channel" | "channelAccount" | "receivedAt"> & {
      text?: string;
      senderId?: string;
      sourceId?: string;
    },
  ) => Promise<InboundAck>;
  /** Daemon-delivered replies after a turn — notification-only for event-source. */
  outbound: (msg: OutboundMessage) => Promise<void>;
}

/** Compile-time guard: plugins must not depend on harness or filesystem APIs here. */
export type ChannelContextSurface = keyof ChannelContext;
