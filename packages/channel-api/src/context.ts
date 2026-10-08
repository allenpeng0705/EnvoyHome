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
  /** Notification-only for event-source — never actuation. */
  kind?: "notify" | "reply";
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
