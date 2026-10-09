// Product event bus — HostNodeService.on + emit for home:* (reuse-host eventDispositions).

import { eventNames } from "@envoyhome/protocol";
import type { EventDisposition, HostNodeService } from "@envoymesh/reuse-host";
import { createShellHostNodeService } from "@envoymesh/reuse-host";

export type ProductEmit = (event: string, data: unknown) => void;

/** Every home:* name is broadcast to subscribed WS clients (Design §3.5). */
export function homeEventDispositions(): Readonly<Record<string, EventDisposition>> {
  const table: Record<string, EventDisposition> = {};
  for (const name of eventNames()) {
    table[name] = { kind: "broadcast" };
  }
  return table;
}

/**
 * Capturable node surface: transport registers listeners via `on`; product code
 * calls `emit` so subscribed clients receive frames.
 */
export class ProductEventBus {
  private readonly listeners = new Map<string, Set<(data: unknown) => void>>();
  private readonly sideEffects: Array<ProductEmit> = [];
  private readonly shell = createShellHostNodeService();

  /** Extra hooks (e.g. push dispatch) — must not throw into the turn. */
  addSideEffect(fn: ProductEmit): void {
    this.sideEffects.push(fn);
  }

  /** True when at least one transport listener is registered for [event]. */
  hasListeners(event: string): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  readonly emit: ProductEmit = (event, data) => {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch {
          // never let a bad subscriber kill the turn
        }
      }
    }
    for (const side of this.sideEffects) {
      try {
        side(event, data);
      } catch {
        // side effects are best-effort
      }
    }
  };

  asNodeService(): HostNodeService {
    return {
      ...this.shell,
      on: (event: string, listener: (data: unknown) => void) => {
        let set = this.listeners.get(event);
        if (!set) {
          set = new Set();
          this.listeners.set(event, set);
        }
        set.add(listener);
      },
    };
  }
}
