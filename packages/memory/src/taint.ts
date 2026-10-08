// Trust derivation + result-level taint (Memory Design §13; V-MEM-21).

import type { ProvenanceTrust } from "./provenance.js";

export type ChannelKind = "chat" | "event-source";
export type BindingTrustHint = "owner" | "agent" | "untrusted";

export interface TrustContext {
  /** Binding-declared trust (Design Appendix A.3). */
  bindingTrust: BindingTrustHint;
  /** Channel plugin kind — event-source ⇒ always untrusted for memory. */
  channelKind?: ChannelKind;
  /** True when any sensitive-classified tool result was read this turn. */
  sensitiveResultSeen?: boolean;
  /** Spans derived from sensitive results (result-level taint). */
  taintSpans?: boolean;
}

/**
 * Derive effective trust for a memory write.
 * - event-source ⇒ untrusted regardless of binding
 * - sensitive result / taintSpans ⇒ untrusted for affected spans
 * - else binding trust
 */
export function deriveTrust(ctx: TrustContext): ProvenanceTrust {
  if (ctx.channelKind === "event-source") return "untrusted";
  if (ctx.sensitiveResultSeen || ctx.taintSpans) return "untrusted";
  return ctx.bindingTrust;
}

/** Flush/consolidate may write L2/L3 directly only for owner|agent. */
export function mayDirectStandingWrite(trust: ProvenanceTrust): boolean {
  return trust === "owner" || trust === "agent";
}
