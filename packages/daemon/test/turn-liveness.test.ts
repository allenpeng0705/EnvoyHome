import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  STALE_CONSECUTIVE_TURN_ERRORS,
  STALE_MIN_UPTIME_SEC,
  TurnLivenessTracker,
  isExternalProviderError,
} from "../dist/turn-liveness.js";

describe("TurnLivenessTracker", () => {
  let t: TurnLivenessTracker;

  beforeEach(() => {
    t = new TurnLivenessTracker();
  });

  it("starts clean", () => {
    const s = t.snapshot(0, STALE_MIN_UPTIME_SEC);
    assert.equal(s.consecutiveTurnErrors, 0);
    assert.equal(s.consecutiveInternalErrors, 0);
    assert.equal(s.stale, false);
    assert.equal(s.suggestRestart, false);
  });

  it("marks stale after consecutive internal errors when idle and past min uptime", () => {
    for (let i = 0; i < STALE_CONSECUTIVE_TURN_ERRORS; i++) {
      t.record("error", `TypeError: boom-${i}`);
    }
    assert.equal(t.snapshot(1, STALE_MIN_UPTIME_SEC).stale, false);
    assert.equal(t.snapshot(0, STALE_MIN_UPTIME_SEC - 1).stale, false);
    const idle = t.snapshot(0, STALE_MIN_UPTIME_SEC);
    assert.equal(idle.stale, true);
    assert.equal(idle.suggestRestart, true);
    assert.equal(idle.consecutiveInternalErrors, STALE_CONSECUTIVE_TURN_ERRORS);
    assert.match(idle.lastTurnErrorSummary ?? "", /boom-/);
  });

  it("does not treat provider/API failures as restart-stale", () => {
    t.record("error", "401 Unauthorized: invalid api key");
    t.record("error", "429 rate limit");
    t.record("error", "model_not_found: deepseek-flash");
    const s = t.snapshot(0, STALE_MIN_UPTIME_SEC);
    assert.equal(s.consecutiveTurnErrors, 3);
    assert.equal(s.consecutiveInternalErrors, 0);
    assert.equal(s.stale, false);
    assert.equal(s.suggestRestart, false);
  });

  it("ok clears both streaks", () => {
    t.record("error", "TypeError: a");
    t.record("error", "TypeError: b");
    t.record("ok");
    t.record("error", "TypeError: c");
    const s = t.snapshot(0, STALE_MIN_UPTIME_SEC);
    assert.equal(s.consecutiveTurnErrors, 1);
    assert.equal(s.consecutiveInternalErrors, 1);
    assert.equal(s.stale, false);
  });

  it("cancelled neither clears nor inflates the streak", () => {
    t.record("error", "TypeError: a");
    t.record("cancelled");
    t.record("error", "TypeError: b");
    const s = t.snapshot(0, STALE_MIN_UPTIME_SEC);
    assert.equal(s.consecutiveInternalErrors, 2);
    assert.equal(s.recentTurnCancelled, 1);
  });
});

describe("isExternalProviderError", () => {
  it("classifies common provider failures", () => {
    assert.equal(isExternalProviderError("401 Unauthorized"), true);
    assert.equal(isExternalProviderError("invalid_api_key"), true);
    assert.equal(isExternalProviderError("TypeError: x is not a function"), false);
    assert.equal(isExternalProviderError(undefined), false);
  });
});
