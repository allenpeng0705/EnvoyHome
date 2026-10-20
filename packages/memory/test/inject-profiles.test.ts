// V-MEM-22 — Memory Design §4.2.1 derivation (OpenClaw-aligned package).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BASELINE_TOTAL,
  CEILING_TOTAL,
  HARD_MIN_TOTAL,
  IDENTITY_STANDING_RESERVE,
  baselineInjectPackage,
  deriveInjectPackage,
  resolveInjectProfiles,
  splitInjectTotal,
} from "../dist/inject-profiles.js";
import { INJECT_BUDGET } from "../dist/bootstrap-inject.js";

function expectedL123Total(contextTokens: number): number {
  const affordableStanding = Math.floor(contextTokens * 4 * 0.2);
  if (affordableStanding >= BASELINE_TOTAL + IDENTITY_STANDING_RESERVE) {
    return BASELINE_TOTAL;
  }
  const affordableL123 = Math.max(0, affordableStanding - IDENTITY_STANDING_RESERVE);
  return Math.min(
    affordableL123,
    BASELINE_TOTAL,
    Math.max(0, CEILING_TOTAL - IDENTITY_STANDING_RESERVE),
  );
}

test("baseline package matches OpenClaw §4.2 table", () => {
  const b = baselineInjectPackage();
  assert.equal(b.l1, 4000);
  assert.equal(b.l2, 20_000);
  assert.equal(b.l3, 20_000);
  assert.equal(b.l1, INJECT_BUDGET.l1);
  assert.equal(b.l2, INJECT_BUDGET.l2);
  assert.equal(b.l3, INJECT_BUDGET.l3);
  assert.equal(b.l1 + b.l2 + b.l3, BASELINE_TOTAL);
  assert.equal(BASELINE_TOTAL, 44_000);
  assert.equal(CEILING_TOTAL, 60_000);
});

test("unknown cloud → OpenClaw baseline; unknown local → HARD_MIN", () => {
  assert.deepEqual(deriveInjectPackage(undefined, "cloud"), baselineInjectPackage());
  assert.deepEqual(deriveInjectPackage(0, "cloud"), baselineInjectPackage());
  const localUnknown = deriveInjectPackage(undefined, "local");
  assert.equal(localUnknown.l1 + localUnknown.l2 + localUnknown.l3, HARD_MIN_TOTAL);
  assert.deepEqual(deriveInjectPackage(Number.NaN, "local"), splitInjectTotal(HARD_MIN_TOTAL));
});

test("8k local scales to affordable after identity reserve", () => {
  const pkg = deriveInjectPackage(8192, "local");
  const total = expectedL123Total(8192);
  assert.equal(pkg.l1 + pkg.l2 + pkg.l3, total);
  assert.equal(pkg.l1, Math.floor((total * 4000) / 44_000));
  assert.equal(pkg.l2, Math.floor((total * 20_000) / 44_000));
  assert.equal(pkg.l3, total - pkg.l1 - pkg.l2);
  // identity + L1–L3 stays within MAX_FRACTION of context
  assert.ok(total + IDENTITY_STANDING_RESERVE <= Math.floor(8192 * 4 * 0.2));
});

test("tiny known context never inflates above affordable after identity reserve", () => {
  // 4096 tokens → affordableStanding 3276; L1–L3 gets remainder after identity
  const pkg = deriveInjectPackage(4096, "local");
  const affordableStanding = Math.floor(4096 * 4 * 0.2);
  assert.equal(affordableStanding, 3276);
  assert.ok(affordableStanding < HARD_MIN_TOTAL);
  assert.equal(pkg.l1 + pkg.l2 + pkg.l3, expectedL123Total(4096));
});

test("128k cloud gets full OpenClaw package", () => {
  const pkg = deriveInjectPackage(128_000, "cloud");
  assert.deepEqual(pkg, baselineInjectPackage());
});

test("32k local scales below OpenClaw package after identity reserve", () => {
  const local = deriveInjectPackage(32_000, "local");
  const total = local.l1 + local.l2 + local.l3;
  assert.ok(total < BASELINE_TOTAL);
  assert.equal(total, expectedL123Total(32_000));
});

test("splitInjectTotal preserves total and OpenClaw ratios at baseline", () => {
  for (const n of [0, 1, 3, 7, 8000, 25600, 44000, 60000]) {
    const s = splitInjectTotal(n);
    if (n >= BASELINE_TOTAL) {
      assert.deepEqual(s, baselineInjectPackage());
    } else {
      assert.equal(s.l1 + s.l2 + s.l3, Math.floor(n));
    }
  }
});

test("resolveInjectProfiles: active selects caps; both profiles reported", () => {
  const r = resolveInjectProfiles({
    mode: "auto",
    active: "local",
    cloudContextTokens: 128_000,
    localContextTokens: 8192,
    cloudProviderId: "openai",
    localProviderId: "envoyhome-local",
  });
  assert.equal(r.injectBudgetMode, "auto");
  assert.equal(r.injectProfiles.active, "local");
  assert.equal(r.injectProfiles.cloud.l2, 20_000);
  assert.equal(
    r.injectProfiles.local.l1 + r.injectProfiles.local.l2 + r.injectProfiles.local.l3,
    expectedL123Total(8192),
  );
  assert.equal(r.caps.l2?.injectBudget, r.injectProfiles.local.l2);
  assert.equal(r.injectProfiles.cloud.sourceProviderId, "openai");
  assert.equal(r.injectProfiles.local.sourceProviderId, "envoyhome-local");
});

test("resolveInjectProfiles: custom mode uses caps override for both", () => {
  const r = resolveInjectProfiles({
    mode: "custom",
    active: "cloud",
    cloudContextTokens: 128_000,
    localContextTokens: 8192,
    caps: { l1: { injectBudget: 111 }, l2: { injectBudget: 222 }, l3: { injectBudget: 333 } },
  });
  assert.equal(r.injectProfiles.cloud.l1, 111);
  assert.equal(r.injectProfiles.local.l2, 222);
  assert.equal(r.caps.l3?.injectBudget, 333);
});
