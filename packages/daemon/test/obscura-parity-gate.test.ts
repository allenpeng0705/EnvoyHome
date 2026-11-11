// Design Appendix C.5 — Obscura parity gate checklist.
// Stage E ships auto-with-fallback; hard Obscura-only still gated.

import { test } from "node:test";
import assert from "node:assert/strict";
import { probeObscuraRuntime, obscuraInstallHint } from "../dist/web-extract-obscura.js";
import { probeBrowserRuntime } from "../dist/web-search-browser.js";
import { OBSCURA_PARITY_GATE } from "./obscura-parity-gate.ts";

export { OBSCURA_PARITY_GATE };

test("Appendix C.5: Stage E auto is Normative default; hard Obscura-only still gated", () => {
  assert.equal(OBSCURA_PARITY_GATE.extractStageA.defaultBackend, "auto");
  assert.equal(OBSCURA_PARITY_GATE.serpStageB.shipped, true);
  assert.equal(OBSCURA_PARITY_GATE.serpStageB.defaultEngine, "auto");
  assert.equal(OBSCURA_PARITY_GATE.managedStageC.shipped, true);
  assert.equal(OBSCURA_PARITY_GATE.managedStageC.defaultEngine, "auto");
  assert.equal(OBSCURA_PARITY_GATE.bundleStageD.shipped, true);
  assert.equal(OBSCURA_PARITY_GATE.autoStageE.shipped, true);
  assert.ok(OBSCURA_PARITY_GATE.never.includes("silent Chromium download"));
  assert.ok(/obscura/i.test(obscuraInstallHint()));
});

test("Appendix C.5: probe helpers report ready|missing without throwing", async () => {
  const chrome = await probeBrowserRuntime();
  assert.ok(chrome.status === "ready" || chrome.status === "missing");
  assert.ok(chrome.installHint.length > 0);

  const obscura = await probeObscuraRuntime();
  assert.ok(obscura.status === "ready" || obscura.status === "missing");
  assert.ok(obscura.installHint.length > 0);
  if (obscura.status === "missing") {
    assert.equal(obscura.binary, null);
  } else {
    assert.ok(obscura.binary);
  }
});
