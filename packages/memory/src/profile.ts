// L1 profile — Memory Design §4.4 supersede-by-key.

export type ProfileFactValue = string | number | boolean | string[];

export type ProfileFactSource =
  | "user_tool"
  | "flush"
  | "consolidate"
  | "review"
  | "learn_accept"
  | "migrate"
  | "backend_ingest";

export type ProfileTrust = "owner" | "agent" | "untrusted";

export interface ProfileFact {
  value: ProfileFactValue;
  updatedAt: string;
  source: ProfileFactSource | string;
  trust: ProfileTrust;
}

export interface ProfileDocument {
  version: number;
  updatedAt: string;
  facts: Record<string, ProfileFact>;
  /** Daemon may stash display fields alongside facts; preserved on write. */
  [extra: string]: unknown;
}

/** Stable identity keys preferred first when trimming inject (Memory Design §4.4). */
export const IDENTITY_KEY_ORDER = [
  "name",
  "preferred_name",
  "preferred_language",
  "locale",
  "timezone",
  "home",
  "family",
] as const;

export function emptyProfile(now = new Date().toISOString()): ProfileDocument {
  return { version: 1, updatedAt: now, facts: {} };
}

export function parseProfile(raw: string): ProfileDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyProfile();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyProfile();
  }
  const obj = parsed as Record<string, unknown>;
  const factsRaw =
    obj.facts && typeof obj.facts === "object" && !Array.isArray(obj.facts)
      ? (obj.facts as Record<string, unknown>)
      : {};
  const facts: Record<string, ProfileFact> = {};
  for (const [key, val] of Object.entries(factsRaw)) {
    const fact = normalizeFact(val);
    if (fact) facts[key] = fact;
  }
  const version = typeof obj.version === "number" && obj.version >= 1 ? obj.version : 1;
  const updatedAt =
    typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString();
  const out: ProfileDocument = { version, updatedAt, facts };
  for (const [k, v] of Object.entries(obj)) {
    if (k === "version" || k === "updatedAt" || k === "facts") continue;
    out[k] = v;
  }
  return out;
}

function normalizeFact(val: unknown): ProfileFact | null {
  if (val === null || val === undefined) return null;
  // Legacy flat value → wrap.
  if (
    typeof val === "string" ||
    typeof val === "number" ||
    typeof val === "boolean" ||
    (Array.isArray(val) && val.every((x) => typeof x === "string"))
  ) {
    return {
      value: val as ProfileFactValue,
      updatedAt: new Date().toISOString(),
      source: "migrate",
      trust: "owner",
    };
  }
  if (typeof val !== "object" || Array.isArray(val)) return null;
  const o = val as Record<string, unknown>;
  const value = o.value;
  if (
    !(
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (Array.isArray(value) && value.every((x) => typeof x === "string"))
    )
  ) {
    return null;
  }
  const trust: ProfileTrust =
    o.trust === "owner" || o.trust === "agent" || o.trust === "untrusted"
      ? o.trust
      : "owner";
  return {
    value: value as ProfileFactValue,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
    source: typeof o.source === "string" ? o.source : "user_tool",
    trust,
  };
}

/** Wire-facing profile (protocol A.9) — facts only, no daemon extras. */
export function toWireProfile(doc: ProfileDocument): {
  version: number;
  updatedAt: string;
  facts: Record<string, ProfileFact>;
} {
  return {
    version: doc.version,
    updatedAt: doc.updatedAt,
    facts: { ...doc.facts },
  };
}

export function applyProfileUpdate(
  doc: ProfileDocument,
  opts: {
    set?: Record<string, ProfileFactValue>;
    removeKeys?: string[];
    source?: ProfileFactSource;
    trust?: ProfileTrust;
    now?: string;
  },
): ProfileDocument {
  const now = opts.now ?? new Date().toISOString();
  const source = opts.source ?? "user_tool";
  const trust = opts.trust ?? "owner";
  const facts = { ...doc.facts };

  for (const key of opts.removeKeys ?? []) {
    delete facts[key];
  }
  for (const [key, value] of Object.entries(opts.set ?? {})) {
    // Supersede-by-key: replace, never append a second active value.
    facts[key] = { value, updatedAt: now, source, trust };
  }

  return {
    ...doc,
    version: typeof doc.version === "number" ? doc.version : 1,
    updatedAt: now,
    facts,
  };
}

/**
 * Serialize facts for inject. Prefer identity keys; drop lowest-priority facts
 * until the serialized block fits `injectBudget` (measured on exact JSON).
 */
export function serializeProfileForInject(
  facts: Record<string, ProfileFact>,
  injectBudget: number,
): { text: string; truncated: boolean; factCount: number } {
  const entries = Object.entries(facts);
  const ranked = [...entries].sort(([a], [b]) => rankKey(a) - rankKey(b));

  // Try full set first.
  let selected = Object.fromEntries(ranked);
  let text = JSON.stringify(selected, null, 2);
  if (text.length <= injectBudget) {
    return { text, truncated: false, factCount: ranked.length };
  }

  // Drop from the end (lowest priority) until under budget.
  const kept = [...ranked];
  while (kept.length > 0) {
    kept.pop();
    selected = Object.fromEntries(kept);
    text = kept.length === 0 ? "{}" : JSON.stringify(selected, null, 2);
    if (text.length <= injectBudget) {
      return { text, truncated: true, factCount: kept.length };
    }
  }
  return { text: "{}", truncated: true, factCount: 0 };
}

function rankKey(key: string): number {
  const idx = (IDENTITY_KEY_ORDER as readonly string[]).indexOf(key);
  return idx === -1 ? 1000 + key.charCodeAt(0) : idx;
}

export function stringifyProfile(doc: ProfileDocument): string {
  return JSON.stringify(doc, null, 2) + "\n";
}
