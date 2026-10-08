// Mix routing (Design §8.3 — Provisional). Keep behind rules; do not freeze schema early.

import type { ModelProvider } from "./provider.js";

export type ModelMode = "local" | "cloud" | "mix";

export interface MixPolicy {
  mode: ModelMode;
  /** Privacy-tagged / sensitive turns must stay local. */
  forceLocal?: boolean;
}

export class MixRouter {
  constructor(
    private local: ModelProvider | undefined,
    private cloud: ModelProvider | undefined,
  ) {}

  setLocal(p: ModelProvider | undefined): void {
    this.local = p;
  }

  setCloud(p: ModelProvider | undefined): void {
    this.cloud = p;
  }

  /**
   * Choose a provider. Privacy-tagged turns (forceLocal) or mode=local require local.
   * mode=cloud with no local and forceLocal ⇒ fail closed (caller maps to privacy_local_unavailable).
   */
  pick(policy: MixPolicy): ModelProvider {
    if (policy.forceLocal || policy.mode === "local") {
      if (!this.local) {
        throw Object.assign(new Error("envoyhome.privacy_local_unavailable: no local provider"), {
          code: "privacy_local_unavailable",
        });
      }
      return this.local;
    }
    if (policy.mode === "cloud") {
      if (!this.cloud) throw new Error("no cloud provider configured");
      return this.cloud;
    }
    // mix: prefer local when forceLocal already handled; otherwise cloud if present else local
    return this.cloud ?? this.local ?? (() => {
      throw new Error("no provider configured");
    })();
  }
}
