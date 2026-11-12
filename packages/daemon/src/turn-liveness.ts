// Turn-path liveness — process-alive + GET /health is not enough.
// Failure mode: HTTP health stayed ok while every harness turn finished
// instantly with status=error and no assistant reply. Track recent turn
// outcomes so the desktop supervisor can restart a logically stale daemon.
//
// Do NOT treat ordinary provider/API failures (401/429/bad model) as stale —
// restarting cannot fix those and would thrash the supervised process.

import { registerResetHook } from "@envoyhome/test-utils";

export type TurnOutcomeStatus = "ok" | "error" | "cancelled";

export interface TurnLivenessSnapshot {
  consecutiveTurnErrors: number;
  /** Errors that look like internal turn-pipeline failures (restart-relevant). */
  consecutiveInternalErrors: number;
  recentTurnOk: number;
  recentTurnError: number;
  recentTurnCancelled: number;
  lastTurnAt?: string;
  lastTurnErrorAt?: string;
  lastTurnErrorSummary?: string;
  /** True when the turn path looks stuck/broken and a restart is safe to consider. */
  stale: boolean;
  suggestRestart: boolean;
}

const WINDOW = 20;
/** Consecutive *internal* error turns before we call the daemon stale. */
export const STALE_CONSECUTIVE_TURN_ERRORS = 3;
/** Ignore early boot flaps — misconfig right after start is not "went stale". */
export const STALE_MIN_UPTIME_SEC = 60;

/** Provider/cloud failures a restart will not heal. */
export function isExternalProviderError(summary?: string): boolean {
  if (!summary?.trim()) return false;
  return /(?:^|\b)(401|403|429)\b|unauthorized|forbidden|invalid[_\s-]?api|incorrect[_\s-]?api|api[_\s-]?key|authentication|quota|billing|rate[\s_-]?limit|model[_ ]?not[_ ]?found|unknown model|no eligible provider|ENVOYHOME_NO_PROVIDER|ECONNREFUSED[^\n]*18792|fetch failed|network[\s_-]?error|ENOTFOUND|socket hang up/i.test(
    summary,
  );
}

export class TurnLivenessTracker {
  private consecutiveErrors = 0;
  private consecutiveInternalErrors = 0;
  private recent: TurnOutcomeStatus[] = [];
  private lastTurnAt: string | undefined;
  private lastTurnErrorAt: string | undefined;
  private lastTurnErrorSummary: string | undefined;

  record(status: TurnOutcomeStatus, errSummary?: string): void {
    this.lastTurnAt = new Date().toISOString();
    this.recent.push(status);
    if (this.recent.length > WINDOW) this.recent.shift();

    if (status === "error") {
      this.consecutiveErrors += 1;
      this.lastTurnErrorAt = this.lastTurnAt;
      if (errSummary?.trim()) {
        this.lastTurnErrorSummary = errSummary.trim().slice(0, 240);
      }
      if (isExternalProviderError(errSummary)) {
        // Config/API problem — do not escalate toward supervised restart.
        this.consecutiveInternalErrors = 0;
      } else {
        this.consecutiveInternalErrors += 1;
      }
      return;
    }
    if (status === "ok") {
      this.consecutiveErrors = 0;
      this.consecutiveInternalErrors = 0;
      return;
    }
    // cancelled: do not clear or inflate restart-relevant streaks
  }

  /** Test / doctor hook. */
  reset(): void {
    this.consecutiveErrors = 0;
    this.consecutiveInternalErrors = 0;
    this.recent = [];
    this.lastTurnAt = undefined;
    this.lastTurnErrorAt = undefined;
    this.lastTurnErrorSummary = undefined;
  }

  snapshot(activeTurns: number, uptimeSec = 0): TurnLivenessSnapshot {
    let recentTurnOk = 0;
    let recentTurnError = 0;
    let recentTurnCancelled = 0;
    for (const s of this.recent) {
      if (s === "ok") recentTurnOk += 1;
      else if (s === "error") recentTurnError += 1;
      else recentTurnCancelled += 1;
    }
    const streak = this.consecutiveInternalErrors >= STALE_CONSECUTIVE_TURN_ERRORS;
    // Never suggest restart while a turn is still running — wait for settle.
    // Require a minimum uptime so first-minute misconfig does not look "stale".
    const stale =
      streak && activeTurns === 0 && uptimeSec >= STALE_MIN_UPTIME_SEC;
    return {
      consecutiveTurnErrors: this.consecutiveErrors,
      consecutiveInternalErrors: this.consecutiveInternalErrors,
      recentTurnOk,
      recentTurnError,
      recentTurnCancelled,
      ...(this.lastTurnAt ? { lastTurnAt: this.lastTurnAt } : {}),
      ...(this.lastTurnErrorAt ? { lastTurnErrorAt: this.lastTurnErrorAt } : {}),
      ...(this.lastTurnErrorSummary
        ? { lastTurnErrorSummary: this.lastTurnErrorSummary }
        : {}),
      stale,
      suggestRestart: stale,
    };
  }
}

/** Process-wide tracker used by TurnService + health. */
export const turnLiveness = new TurnLivenessTracker();

registerResetHook(() => {
  turnLiveness.reset();
});
