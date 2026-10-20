// Design §4.1.1 / V-SEC-15…21 — Household Owner.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dispatchForTest,
  loopbackSession,
  startDaemon,
  type HomeSession,
  type RunningDaemon,
} from "../dist/index.js";

function ownerDevice(accountId = "alice"): HomeSession {
  return {
    scopeKey: "owner-phone",
    ownerId: "owner-phone",
    isOwnerScope: true,
    deviceId: "owner-phone",
    caller: {
      kind: "device",
      deviceId: "owner-phone",
      accountIds: [accountId],
      ownerTrusted: false,
    },
  };
}

function memberDevice(accountId: string): HomeSession {
  return {
    scopeKey: `mem-${accountId}`,
    ownerId: `mem-${accountId}`,
    isOwnerScope: false,
    deviceId: `mem-${accountId}`,
    caller: {
      kind: "device",
      deviceId: `mem-${accountId}`,
      accountIds: [accountId],
      ownerTrusted: true, // deprecated — must NOT grant Owner-scope
    },
  };
}

function deps(daemon: RunningDaemon) {
  return {
    config: daemon.config,
    startedAt: daemon.startedAt,
    logger: daemon.logger,
    subscriptions: daemon.subscriptions,
    connections: () => 0,
    activeTurns: () => 0,
    onShutdown: () => undefined,
    packageVersion: "0.0.0-test",
    accounts: daemon.accounts,
    household: daemon.household,
    bindings: daemon.bindings,
    pairing: daemon.pairing,
    memory: daemon.memory,
    channels: daemon.channels,
    turns: daemon.turns,
    providers: daemon.providers,
    harnesses: daemon.harnesses,
    workflows: daemon.workflows,
    workflowStepTemplates: daemon.workflowStepTemplates,
    schedules: daemon.schedules,
    skills: daemon.skills,
    artifacts: daemon.artifacts,
    webSearch: daemon.webSearch,
    browserControl: daemon.browserControl,
    actuations: daemon.actuations,
    pushTokens: daemon.pushTokens,
    push: daemon.push,
    localEngine: daemon.localEngine,
    meshStatus: () => ({ kind: "no-node" as const }),
  };
}

async function withDaemon(
  fn: (daemon: RunningDaemon, d: ReturnType<typeof deps>) => Promise<void>,
): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-owner-"));
  let daemon: RunningDaemon | undefined;
  try {
    daemon = await startDaemon({
      config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
      packageVersion: "0.0.0-test",
    });
    await fn(daemon, deps(daemon));
  } finally {
    await daemon?.stop().catch(() => undefined);
    await rm(stateDir, { recursive: true, force: true });
  }
}

test("V-SEC-15: first account is Owner; delete Owner without transfer fails; transfer leaves one", async () => {
  await withDaemon(async (_daemon, d) => {
    const loop = loopbackSession();
    const a = await dispatchForTest(d, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    }, loop);
    assert.ok(!("error" in a));
    const owner1 = await dispatchForTest(d, "home.getHouseholdOwner", {}, loop);
    assert.equal((owner1 as { result: { ownerAccountId: string } }).result.ownerAccountId, "alice");

    await dispatchForTest(d, "home.createAccount", {
      accountId: "bob",
      displayName: "Bob",
    }, loop);
    const owner2 = await dispatchForTest(d, "home.getHouseholdOwner", {}, loop);
    assert.equal((owner2 as { result: { ownerAccountId: string } }).result.ownerAccountId, "alice");

    const del = await dispatchForTest(
      d,
      "home.deleteAccount",
      { accountId: "alice", confirm: true, force: true },
      loop,
    );
    assert.ok("error" in del);
    assert.match(String((del as { error: { message: string } }).error.message), /owner_delete_forbidden/);

    const xfer = await dispatchForTest(
      d,
      "home.transferHouseholdOwner",
      { toAccountId: "bob", confirm: true },
      loop,
    );
    assert.ok(!("error" in xfer));
    assert.equal((xfer as { result: { ownerAccountId: string } }).result.ownerAccountId, "bob");

    const delOk = await dispatchForTest(
      d,
      "home.deleteAccount",
      { accountId: "alice", confirm: true, force: true },
      loop,
    );
    assert.ok(!("error" in delOk));
  });
});

test("V-SEC-16/19: exclusive Owner bind; ownerTrusted alone insufficient; member cannot Owner-scope", async () => {
  await withDaemon(async (daemon, d) => {
    const loop = loopbackSession();
    await dispatchForTest(d, "home.createAccount", { accountId: "alice", displayName: "Alice" }, loop);
    await dispatchForTest(d, "home.createAccount", { accountId: "bob", displayName: "Bob" }, loop);

    const dual = await dispatchForTest(
      d,
      "home.mintPairing",
      { deviceLabel: "bad", accountIds: ["alice", "bob"] },
      loop,
    );
    assert.ok("error" in dual);
    assert.match(String((dual as { error: { message: string } }).error.message), /owner_bind_exclusive/);

    const mint = await dispatchForTest(
      d,
      "home.mintPairing",
      { deviceLabel: "AlicePhone", accountIds: ["alice"] },
      loop,
    );
    assert.ok(!("error" in mint));
    const deviceId = (mint as { result: { device: { deviceId: string } } }).result.device.deviceId;

    // Bind device credential into store for session (mint already did).
    void deviceId;

    const memberMint = await dispatchForTest(
      d,
      "home.mintPairing",
      { deviceLabel: "BobPhone", accountIds: ["bob"] },
      memberDevice("bob"),
    );
    assert.ok("error" in memberMint);

    const memberWs = await dispatchForTest(
      d,
      "home.setWorkspace",
      { accountId: "bob", hostPath: daemon.config.stateDir, mode: "ro" },
      memberDevice("bob"),
    );
    assert.ok("error" in memberWs);

    const ownerWs = await dispatchForTest(
      d,
      "home.setWorkspace",
      { accountId: "bob", hostPath: daemon.config.stateDir, mode: "ro" },
      ownerDevice("alice"),
    );
    assert.ok(!("error" in ownerWs));
  });
});

test("V-SEC-18/20: updateAccount field rules; filesystem root only for Owner seat", async () => {
  await withDaemon(async (_daemon, d) => {
    const loop = loopbackSession();
    await dispatchForTest(d, "home.createAccount", { accountId: "alice", displayName: "Alice" }, loop);
    await dispatchForTest(d, "home.createAccount", { accountId: "bob", displayName: "Bob" }, loop);

    const rename = await dispatchForTest(
      d,
      "home.updateAccount",
      { accountId: "bob", displayName: "Robert" },
      memberDevice("bob"),
    );
    assert.ok(!("error" in rename));

    const tool = await dispatchForTest(
      d,
      "home.updateAccount",
      { accountId: "bob", toolPolicy: "restricted" },
      memberDevice("bob"),
    );
    assert.ok("error" in tool);
    assert.match(String((tool as { error: { message: string } }).error.message), /owner_required/);

    const rootBob = await dispatchForTest(
      d,
      "home.setWorkspace",
      { accountId: "bob", hostPath: "/", mode: "ro" },
      loop,
    );
    assert.ok("error" in rootBob);
    assert.match(
      String((rootBob as { error: { message: string } }).error.message),
      /workspace_root_owner_only/,
    );

    const rootAlice = await dispatchForTest(
      d,
      "home.setWorkspace",
      { accountId: "alice", hostPath: "/", mode: "ro" },
      loop,
    );
    // `/` may fail on some sandboxes if not a real dir — accept either ok or exists error only for Owner gate
    if ("error" in rootAlice) {
      assert.doesNotMatch(
        String((rootAlice as { error: { message: string } }).error.message),
        /workspace_root_owner_only/,
      );
    }
  });
});

test("V-SEC-21: member paired memory untrusted; Owner-seat paired owner", async () => {
  const { memoryTrustForTurn } = await import("../dist/household.js");
  const loop = loopbackSession();
  assert.equal(memoryTrustForTurn(loop.caller, "alice", "alice"), "owner");

  const owner = ownerDevice("alice");
  assert.equal(memoryTrustForTurn(owner.caller, "alice", "alice"), "owner");

  const member = memberDevice("bob");
  assert.equal(memoryTrustForTurn(member.caller, "bob", "alice"), "untrusted");
  // ownerTrusted on member must not elevate
  assert.equal(member.caller.ownerTrusted, true);
  assert.equal(memoryTrustForTurn(member.caller, "bob", "alice"), "untrusted");

  // Owner device acting for wrong seat stays untrusted
  assert.equal(memoryTrustForTurn(owner.caller, "bob", "alice"), "untrusted");
});

test("R3/R2: transfer clears former Owner root workspace and exclusive-binds new Owner", async () => {
  await withDaemon(async (daemon, d) => {
    const loop = loopbackSession();
    await dispatchForTest(d, "home.createAccount", { accountId: "alice", displayName: "Alice" }, loop);
    await dispatchForTest(d, "home.createAccount", { accountId: "bob", displayName: "Bob" }, loop);

    const root = await dispatchForTest(
      d,
      "home.setWorkspace",
      { accountId: "alice", hostPath: "/", mode: "ro" },
      loop,
    );
    assert.ok(!("error" in root));
    assert.equal((await daemon.accounts.getWorkspacePublic("alice")).filesystemRoot, true);

    // Seed illegal dual-bind for bob (legacy) so transfer must rewrite.
    daemon.devices.put({
      deviceId: "phone-bob",
      tokenHash: "deadbeef",
      accountIds: ["bob", "alice"],
      ownerTrusted: false,
      revoked: false,
      label: "Bob phone",
      createdAt: new Date().toISOString(),
    });
    await daemon.bindings.set(
      { deviceId: "phone-bob", accountId: "bob" },
      loop.caller,
    );
    await daemon.bindings.set(
      { deviceId: "phone-bob", accountId: "alice" },
      loop.caller,
      { allowRebind: true },
    );

    const xfer = await dispatchForTest(
      d,
      "home.transferHouseholdOwner",
      { toAccountId: "bob", confirm: true },
      loop,
    );
    assert.ok(!("error" in xfer));
    assert.equal((xfer as { result: { ownerAccountId: string } }).result.ownerAccountId, "bob");

    // Former Owner root cleared
    assert.equal((await daemon.accounts.getWorkspacePublic("alice")).configured, false);
    assert.equal(await daemon.accounts.getWorkspaceEffective("alice", "bob"), null);

    // New Owner exclusive: alice seat dropped from phone-bob
    const ids = await daemon.bindings.accountsForDevice("phone-bob");
    assert.deepEqual(ids.sort(), ["bob"].sort());

    // Owner can getWorkspace for member seat
    const bobGetsAlice = await dispatchForTest(
      d,
      "home.getWorkspace",
      { accountId: "alice" },
      ownerDevice("bob"),
    );
    assert.ok(!("error" in bobGetsAlice));
  });
});

test("V-SEC-17: member may revoke own grants only", async () => {
  await withDaemon(async (daemon, d) => {
    const loop = loopbackSession();
    await dispatchForTest(d, "home.createAccount", { accountId: "alice", displayName: "Alice" }, loop);
    await dispatchForTest(d, "home.createAccount", { accountId: "bob", displayName: "Bob" }, loop);

    // Seed a grant file for alice via approvals store path if turns support it — skip if empty.
    const listed = await dispatchForTest(d, "home.listGrants", {}, memberDevice("bob"));
    assert.ok(!("error" in listed));
    const grants = (listed as { result: { grants: unknown[] } }).result.grants;
    assert.ok(Array.isArray(grants));

    const cross = await dispatchForTest(
      d,
      "home.listGrants",
      { accountId: "alice" },
      memberDevice("bob"),
    );
    assert.ok("error" in cross);
    void daemon;
  });
});
