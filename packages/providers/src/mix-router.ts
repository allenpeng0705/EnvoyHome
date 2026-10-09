// Model routing (Design §8.3). Config-first; auto-switch uses needClass + weighted score.

import type { ModelProvider } from "./provider.js";
import {
  classifyNeedClass,
  type NeedClass,
  type NeedClassRule,
} from "./need-class.js";
import { rankByNeedClass, type ModelProfile } from "./model-score.js";

export type ModelMode = "local" | "cloud" | "mix";
export type PlacementFilter = "any" | "local" | "cloud";
export type Placement = "local" | "cloud";
export type RouteReason =
  | "privacy"
  | "default"
  | "config"
  | "auto_switch"
  | "mode";

export type { NeedClass, NeedClassRule, ModelProfile };

export interface ProviderSlot {
  provider: ModelProvider;
  placement: Placement;
  /** Routing properties for auto-switch scoring (optional). */
  profile?: ModelProfile;
  /** Hard filter: false excludes from the eligible pool (§8.3). Omitted = healthy. */
  healthy?: boolean;
}

export interface MixPolicy {
  /** Compat with home.setModelMode — maps to placementFilter when placementFilter omitted. */
  mode?: ModelMode;
  placementFilter?: PlacementFilter;
  /** Privacy-tagged / sensitive turns must stay on local placement. */
  forceLocal?: boolean;
  defaultProviderId?: string;
  /** When true and ≥2 eligible, score by needClass (requires text for classification). */
  autoModelSwitch?: boolean;
  /** Turn text for needClass (auto-switch path). */
  text?: string;
  /** Account rules prepended to the bundled needClass pack. */
  needClassRules?: NeedClassRule[];
  /** Hard filters when auto-switch scores (missing property = allow). */
  requiresTools?: boolean;
  requiresVision?: boolean;
  minContextTokens?: number;
}

export interface PickDecision {
  provider: ModelProvider;
  reason: RouteReason;
  placementFilter: PlacementFilter;
  autoModelSwitch: boolean;
  eligibleCount: number;
  needClass?: NeedClass;
}

function filterFromMode(mode: ModelMode | undefined): PlacementFilter {
  if (mode === "local") return "local";
  if (mode === "cloud") return "cloud";
  return "any";
}

function profileOf(slot: ProviderSlot): ModelProfile {
  return (
    slot.profile ?? {
      placement: slot.placement,
    }
  );
}

function passesHardFilters(profile: ModelProfile, policy: MixPolicy): boolean {
  if (policy.requiresTools && profile.supportsTools === false) return false;
  if (policy.requiresVision && profile.supportsVision === false) return false;
  if (
    policy.minContextTokens !== undefined &&
    typeof profile.contextTokens === "number" &&
    profile.contextTokens < policy.minContextTokens
  ) {
    return false;
  }
  return true;
}

export class MixRouter {
  private slots: ProviderSlot[] = [];

  /** @deprecated Prefer setPool — kept for tests / gradual migration. */
  constructor(local?: ModelProvider, cloud?: ModelProvider) {
    const slots: ProviderSlot[] = [];
    if (local) slots.push({ provider: local, placement: "local" });
    if (cloud) slots.push({ provider: cloud, placement: "cloud" });
    this.slots = slots;
  }

  setPool(slots: ProviderSlot[]): void {
    this.slots = slots.slice();
  }

  setLocal(p: ModelProvider | undefined): void {
    this.slots = this.slots.filter((s) => s.placement !== "local");
    if (p) this.slots.push({ provider: p, placement: "local" });
  }

  setCloud(p: ModelProvider | undefined): void {
    this.slots = this.slots.filter((s) => s.placement !== "cloud");
    if (p) this.slots.push({ provider: p, placement: "cloud" });
  }

  pickDetailed(policy: MixPolicy): PickDecision {
    const autoModelSwitch = policy.autoModelSwitch === true;
    let placementFilter: PlacementFilter =
      policy.placementFilter ?? filterFromMode(policy.mode);

    if (policy.forceLocal) {
      placementFilter = "local";
    }

    let eligible = this.slots.filter((s) => {
      if (s.healthy === false) return false;
      if (placementFilter === "any") return true;
      return s.placement === placementFilter;
    });

    if (eligible.length === 0) {
      if (policy.forceLocal || placementFilter === "local") {
        throw Object.assign(new Error("envoyhome.privacy_local_unavailable: no local provider"), {
          code: "privacy_local_unavailable",
        });
      }
      throw new Error("no provider configured");
    }

    if (eligible.length === 1) {
      return {
        provider: eligible[0]!.provider,
        reason: policy.forceLocal ? "privacy" : "config",
        placementFilter,
        autoModelSwitch,
        eligibleCount: 1,
      };
    }

    const defaultId = policy.defaultProviderId;
    const byDefault = defaultId
      ? eligible.find((s) => s.provider.id === defaultId)
      : undefined;

    if (policy.forceLocal) {
      return {
        provider: (byDefault ?? eligible[0]!).provider,
        reason: "privacy",
        placementFilter,
        autoModelSwitch,
        eligibleCount: eligible.length,
      };
    }

    if (autoModelSwitch && policy.text !== undefined) {
      const needClass = classifyNeedClass(policy.text, policy.needClassRules ?? []);
      const filtered = eligible.filter((s) => passesHardFilters(profileOf(s), policy));
      if (filtered.length === 0) {
        throw new Error("no provider configured");
      }
      if (filtered.length === 1) {
        return {
          provider: filtered[0]!.provider,
          reason: "auto_switch",
          placementFilter,
          autoModelSwitch,
          eligibleCount: filtered.length,
          needClass,
        };
      }
      const ranked = rankByNeedClass(
        needClass,
        filtered.map((s) => ({ item: s, profile: profileOf(s) })),
      );
      const best = ranked[0]!;
      return {
        provider: best.item.provider,
        reason: "auto_switch",
        placementFilter,
        autoModelSwitch,
        eligibleCount: filtered.length,
        needClass,
      };
    }

    // Auto-switch on but no text yet — stay on default until complete() supplies text.
    if (autoModelSwitch) {
      return {
        provider: (byDefault ?? eligible[0]!).provider,
        reason: "default",
        placementFilter,
        autoModelSwitch,
        eligibleCount: eligible.length,
      };
    }

    if (byDefault) {
      return {
        provider: byDefault.provider,
        reason: "default",
        placementFilter,
        autoModelSwitch,
        eligibleCount: eligible.length,
      };
    }

    // Compat: mix without default historically preferred cloud.
    if ((policy.mode === "mix" || placementFilter === "any") && !defaultId) {
      const cloud = eligible.find((s) => s.placement === "cloud");
      if (cloud) {
        return {
          provider: cloud.provider,
          reason: "mode",
          placementFilter,
          autoModelSwitch,
          eligibleCount: eligible.length,
        };
      }
    }

    return {
      provider: eligible[0]!.provider,
      reason: "default",
      placementFilter,
      autoModelSwitch,
      eligibleCount: eligible.length,
    };
  }

  /**
   * Choose a provider. Privacy-tagged turns (forceLocal) require local placement.
   * mode=cloud with forceLocal ⇒ fail closed (caller maps to privacy_local_unavailable).
   */
  pick(policy: MixPolicy): ModelProvider {
    return this.pickDetailed(policy).provider;
  }
}
