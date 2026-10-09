// Per-account policy.json (Design §8.3) — forceLocalForEventSource, privacy tags.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HomePaths } from "./home-paths.js";

/** Account needClass rules prepended to the bundled pack (Design §8.3). */
export interface PolicyNeedClassRule {
  needClass: "cheap" | "standard" | "hard";
  keywords?: string[];
  longerThan?: number;
  maxChars?: number;
}

export interface AccountPolicy {
  toolPolicy: "standard" | "restricted";
  toolDisposition: Record<string, "allow" | "ask" | "deny">;
  mixRules: unknown[];
  /** Prepended to bundled needClass rules when auto-switch is on. */
  needClassRules: PolicyNeedClassRule[];
  privacyKeywords: string[];
  privacyPatterns: string[];
  forceLocalForMedia: boolean;
  forceLocalForEventSource: boolean;
  trustedChannels: string[];
  searchTainted: boolean;
  injectPrioritySections: string[];
  sessionRetentionDays: number;
  reviewEnabled: boolean;
  flushEnabled: boolean;
  reviewInCloud: boolean;
  caps: Record<string, unknown>;
}

const DEFAULTS: AccountPolicy = {
  toolPolicy: "standard",
  toolDisposition: {},
  mixRules: [],
  needClassRules: [],
  privacyKeywords: [],
  privacyPatterns: [],
  forceLocalForMedia: true,
  forceLocalForEventSource: true,
  trustedChannels: [],
  searchTainted: false,
  injectPrioritySections: ["## Standing"],
  sessionRetentionDays: 180,
  reviewEnabled: true,
  flushEnabled: true,
  reviewInCloud: false,
  caps: {},
};

const KNOWN = new Set(Object.keys(DEFAULTS));

export class PolicyStore {
  constructor(private readonly paths: HomePaths) {}

  private pathFor(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "policy.json");
  }

  async get(accountId: string): Promise<AccountPolicy> {
    try {
      const raw = JSON.parse(await readFile(this.pathFor(accountId), "utf8")) as Record<
        string,
        unknown
      >;
      return { ...DEFAULTS, ...pickKnown(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  async write(accountId: string, partial: Partial<AccountPolicy>): Promise<AccountPolicy> {
    for (const key of Object.keys(partial)) {
      if (!KNOWN.has(key)) {
        throw Object.assign(new Error(`envoyhome.policy_unknown_field: ${key}`), {
          code: "bad_params",
        });
      }
    }
    const next = { ...(await this.get(accountId)), ...partial };
    const path = this.pathFor(accountId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(next, null, 2), "utf8");
    return next;
  }

  /** Privacy-tagged turn text ⇒ force local (Design §8.3). */
  isPrivacyTagged(policy: AccountPolicy, text: string): boolean {
    const trimmed = text.trimStart();
    if (/^local:/i.test(trimmed)) return true;
    const lower = text.toLowerCase();
    for (const kw of policy.privacyKeywords) {
      if (kw && lower.includes(kw.toLowerCase())) return true;
    }
    for (const pat of policy.privacyPatterns) {
      try {
        if (new RegExp(pat, "i").test(text)) return true;
      } catch {
        // bad pattern — ignore
      }
    }
    return false;
  }
}

function pickKnown(raw: Record<string, unknown>): Partial<AccountPolicy> {
  const out: Record<string, unknown> = {};
  for (const key of KNOWN) {
    if (key in raw) out[key] = raw[key];
  }
  return out as Partial<AccountPolicy>;
}

/**
 * Phase 2 Privacy Mode preview — separate file so Normative policy.json stays closed.
 * When enabled, block cloud LLM (via forceLocal) and smart-home egress (actuation + outbound).
 */
export interface PrivacyModeState {
  enabled: boolean;
  /** When true, also refuse HA/MQTT actuation and channel outbound (V-P2-PRIV-2). */
  blockSmartHomeEgress: boolean;
}

export class PrivacyModeStore {
  constructor(private readonly paths: HomePaths) {}

  private pathFor(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "privacy-mode.json");
  }

  async get(accountId: string): Promise<PrivacyModeState> {
    try {
      const raw = JSON.parse(await readFile(this.pathFor(accountId), "utf8")) as PrivacyModeState;
      return {
        enabled: Boolean(raw.enabled),
        blockSmartHomeEgress: raw.blockSmartHomeEgress !== false,
      };
    } catch {
      return { enabled: false, blockSmartHomeEgress: true };
    }
  }

  async set(accountId: string, state: PrivacyModeState): Promise<PrivacyModeState> {
    const path = this.pathFor(accountId);
    await mkdir(dirname(path), { recursive: true });
    const next: PrivacyModeState = {
      enabled: Boolean(state.enabled),
      blockSmartHomeEgress: state.blockSmartHomeEgress !== false,
    };
    await writeFile(path, JSON.stringify(next, null, 2), "utf8");
    return next;
  }
}
