import type { InboundEvent } from "./context.js";

export interface InboundAck {
  accepted: boolean;
  reason?: string;
  pairingRequired?: boolean;
  sessionId?: string;
}

export interface EmitInboundGate {
  /** Channel must be enabled for intake (V-CH-4). */
  intakeOpen: boolean;
  /** When set, sourceId must appear in this list or the event is dropped (§5.7.3). */
  registeredSourceIds?: readonly string[];
}

/**
 * Normalize partial plugin emit into a full inbound event and apply SDK-side gates
 * before the daemon binding lookup runs.
 */
export function buildInboundEvent(
  channel: string,
  channelAccount: string,
  partial: Omit<InboundEvent, "channel" | "channelAccount" | "receivedAt"> & {
    text?: string;
    senderId?: string;
    sourceId?: string;
  },
): InboundEvent {
  return {
    channel,
    channelAccount,
    receivedAt: new Date().toISOString(),
    ...partial,
  };
}

export function gateInbound(event: InboundEvent, gate: EmitInboundGate): InboundAck | null {
  if (!gate.intakeOpen) {
    return { accepted: false, reason: "channel_disabled" };
  }
  if (event.sourceId) {
    const known = gate.registeredSourceIds ?? [];
    if (!known.includes(event.sourceId)) {
      return { accepted: false, reason: "source_not_registered" };
    }
  }
  return null;
}

export function rawRefKey(channel: string, channelAccount: string, rawRef: string): string {
  return `${channel}\0${channelAccount}\0${rawRef}`;
}
