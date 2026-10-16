// V-HAR-5 confirm gate stays covered even with no non-built-in catalogue row.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_HARNESS_ID,
  canEnableHarness,
  resolveHarnessId,
  type HarnessManifest,
  type HarnessSelectionState,
} from "../dist/loader.js";

const futureAdapter: HarnessManifest = {
  id: "future-adapter",
  name: "Future",
  version: "0.0.0",
  builtin: false,
  requiresConfirm: true,
};

test("V-HAR-5: non-built-in harness requires confirm", () => {
  const state: HarnessSelectionState = { selections: {}, confirmed: [] };
  const denied = canEnableHarness(futureAdapter, state);
  assert.equal(denied.ok, false);
  const ok = canEnableHarness(futureAdapter, state, true);
  assert.equal(ok.ok, true);
  const remembered: HarnessSelectionState = {
    selections: {},
    confirmed: ["future-adapter"],
  };
  assert.equal(canEnableHarness(futureAdapter, remembered).ok, true);
});

test("resolveHarnessId falls back when selection is unknown (legacy codex etc.)", () => {
  const state: HarnessSelectionState = {
    selections: { "alice:default": "codex-adapter" },
    confirmed: ["codex-adapter"],
  };
  assert.equal(resolveHarnessId(state, "alice", "default"), DEFAULT_HARNESS_ID);
});

test("builtin envoy-harness needs no confirm", () => {
  const state: HarnessSelectionState = { selections: {}, confirmed: [] };
  const builtin: HarnessManifest = {
    id: DEFAULT_HARNESS_ID,
    name: "Envoy Harness",
    version: "1.0.0",
    builtin: true,
    requiresConfirm: false,
  };
  assert.equal(canEnableHarness(builtin, state).ok, true);
});
