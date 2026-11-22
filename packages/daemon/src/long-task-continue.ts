/**
 * Design §19.13 / 2026-10-27 / 2026-11-23 — attended long-task continue helpers
 * (pure, testable).
 */

/**
 * Silent in-run `maxContinuationPhases` for the parent Agent.
 * Attended interactive only; schedule / unattended always 0 (fail closed).
 */
export function parentContinuationPhasesForOrigin(opts: {
  origin: string;
  callerKind?: string;
  /** Attended default (already clamped). */
  attendedDefault: number;
}): number {
  if (opts.origin !== "attended" || opts.callerKind === "schedule") return 0;
  return opts.attendedDefault;
}

/** Emit “reply continue” only when an auto-hop will not follow. */
export function shouldEmitIncompleteCue(opts: {
  origin: string;
  /** Prior session flag — true means the one auto-hop was already used. */
  autoContinueUsed?: boolean;
}): boolean {
  if (opts.origin !== "attended") return true;
  if (opts.autoContinueUsed === true) return true;
  return false;
}

/** Attended only; at most one auto-hop while autoContinueUsed is not yet true. */
export function shouldAttemptAutoContinue(opts: {
  origin: string;
  iterationCapHit: boolean;
  aborted: boolean;
  statusOk: boolean;
  autoContinueUsed?: boolean;
}): boolean {
  return (
    opts.iterationCapHit &&
    opts.origin === "attended" &&
    opts.statusOk &&
    !opts.aborted &&
    opts.autoContinueUsed !== true
  );
}

/**
 * Preserve autoContinueUsed across an explicit continue turn so a prior
 * auto-hop is not reset (no second automatic hop for the same incomplete).
 */
export function nextAutoContinueUsedOnCap(opts: {
  priorAutoContinueUsed?: boolean;
  /** True when this Agent.run is the auto-continue hop itself. */
  isAutoContinueHop?: boolean;
}): boolean {
  if (opts.isAutoContinueHop) return true;
  return opts.priorAutoContinueUsed === true;
}
