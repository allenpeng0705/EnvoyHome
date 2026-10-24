// V-MEM-22 — turn/settings pick cloud vs local inject packages (Memory Design §4.2.1).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon } from "../dist/index.js";
import { HARD_MIN_TOTAL, deriveInjectPackage } from "@envoyhome/memory";

test("V-MEM-22: force-local turn uses local inject package; unknown local → HARD_MIN", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-inj-"));
  let daemon: Awaited<ReturnType<typeof startDaemon>> | undefined;
  try {
    daemon = await startDaemon({
      config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
      packageVersion: "0.0.0-test",
    });
    await daemon.accounts.create({ accountId: "inj1", displayName: "Inj" });

    await daemon.providers.setProvider({
      id: "cloud-big",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
      contextTokens: 128_000,
    });
    await daemon.providers.setProvider({
      id: "local-8k",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
      contextTokens: 8192,
    });
    await daemon.providers.setDefaultProvider("inj1", "cloud-big");
    await daemon.providers.setPlacementFilter("inj1", "cloud");

    const cloudActive = daemon.turns.injectTurnActive({
      accountId: "inj1",
      forceLocal: false,
      pickedProviderId: "cloud-big",
    });
    assert.equal(cloudActive, "cloud");
    const cloud = await daemon.turns.buildStandingInjectFor("inj1", cloudActive);
    assert.equal(cloud.resolved.injectProfiles.cloud.l2, 20_000);
    assert.equal(cloud.resolved.caps.l2?.injectBudget, 20_000);

    const localActive = daemon.turns.injectTurnActive({
      accountId: "inj1",
      forceLocal: true,
      pickedProviderId: "cloud-big",
    });
    assert.equal(localActive, "local");
    const local = await daemon.turns.buildStandingInjectFor("inj1", localActive);
    const localTotal =
      (local.resolved.caps.l1?.injectBudget ?? 0) +
      (local.resolved.caps.l2?.injectBudget ?? 0) +
      (local.resolved.caps.l3?.injectBudget ?? 0);
    const expectedLocal = deriveInjectPackage(8192, "local");
    assert.equal(
      localTotal,
      expectedLocal.l1 + expectedLocal.l2 + expectedLocal.l3,
    );
    assert.ok(localTotal < 20_000);

    // Unknown local context → HARD_MIN, not full OpenClaw 44k.
    await daemon.providers.setProvider({
      id: "local-unk",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    // Enabling a second local disables the previous (Design §8.5).
    const unk = await daemon.turns.resolveInjectForAccount("inj1", "local");
    const unkTotal =
      unk.injectProfiles.local.l1 + unk.injectProfiles.local.l2 + unk.injectProfiles.local.l3;
    assert.equal(unkTotal, HARD_MIN_TOTAL);
    assert.equal(unk.injectProfiles.local.contextTokens, undefined);
  } finally {
    await daemon?.stop().catch(() => undefined);
    await rm(stateDir, { recursive: true, force: true });
  }
});
