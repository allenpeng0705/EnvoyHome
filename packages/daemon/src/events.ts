// Product event subscription bookkeeping (home.subscribe).
// Transport `on`/`off` is handled by reuse-host after auth (§3.3.1 rule 3).

import { isKnownEvent, validateSubscriptions } from "@envoyhome/protocol";

export class SubscriptionRegistry {
  private readonly byScope = new Map<string, Set<string>>();

  subscribe(scopeKey: string, events: readonly string[]): { ok: true } | { error: string } {
    const unknown = validateSubscriptions(events);
    if (unknown.length > 0) {
      return { error: `unknown events: ${unknown.join(", ")}` };
    }
    let set = this.byScope.get(scopeKey);
    if (!set) {
      set = new Set();
      this.byScope.set(scopeKey, set);
    }
    for (const e of events) {
      if (isKnownEvent(e)) set.add(e);
    }
    return { ok: true };
  }

  /** Deduped union for a scope. */
  list(scopeKey: string): string[] {
    return [...(this.byScope.get(scopeKey) ?? [])].sort();
  }

  clear(scopeKey: string): void {
    this.byScope.delete(scopeKey);
  }
}
