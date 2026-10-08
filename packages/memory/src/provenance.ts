// Provenance stamped on every flush / consolidate / learn write (V-LEARN-3).
// Memory Design §13 — single source enum.

export type ProvenanceSource =
  | "user_tool"
  | "flush"
  | "consolidate"
  | "review"
  | "learn_accept"
  | "migrate"
  | "backend_ingest";

export type ProvenanceTrust = "owner" | "agent" | "untrusted";

export interface Provenance {
  source: ProvenanceSource;
  trust: ProvenanceTrust;
  at: string;
  turnId?: string;
}

export function stampProvenance(
  source: ProvenanceSource,
  trust: ProvenanceTrust,
  opts?: { turnId?: string; now?: Date },
): Provenance {
  const p: Provenance = {
    source,
    trust,
    at: (opts?.now ?? new Date()).toISOString(),
  };
  if (opts?.turnId !== undefined) p.turnId = opts.turnId;
  return p;
}

/** Render a one-line HTML comment / markdown footnote for standing files. */
export function provenanceLine(p: Provenance): string {
  const turn = p.turnId ? ` turn=${p.turnId}` : "";
  return `<!-- provenance source=${p.source} trust=${p.trust} at=${p.at}${turn} -->`;
}
