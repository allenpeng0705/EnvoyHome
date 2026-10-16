// Adaptive placement defaults + locked Smart Routing (Design §8.2).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homePaths, ProviderStore } from "../dist/index.js";

async function withStore(fn: (store: ProviderStore) => Promise<void>) {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-route-"));
  try {
    const store = new ProviderStore(homePaths(stateDir));
    await store.load();
    await fn(store);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
}

test("adaptive default: one cloud → cloud", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    const listed = store.listProviders("alice");
    assert.equal(listed.placementFilter, "cloud");
    assert.equal(listed.placementPreference, "auto");
    assert.equal(listed.defaultProviderId, "c1");
  });
});

test("adaptive default: only local → local", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "l1",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    const listed = store.listProviders("default");
    assert.equal(listed.placementFilter, "local");
    assert.equal(listed.placementPreference, "auto");
    assert.equal(listed.defaultProviderId, "l1");
  });
});

test("adaptive default: cloud + local → cloud", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "l1",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    const listed = store.listProviders("default");
    assert.equal(listed.placementFilter, "cloud");
    assert.equal(listed.placementPreference, "auto");
    assert.equal(listed.defaultProviderId, "c1");
  });
});

test("locked Smart Routing (any) survives adding providers", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    await store.setPlacementFilter("alice", "any");
    assert.equal(store.listProviders("alice").placementPreference, "any");
    await store.setProvider({
      id: "l1",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    const listed = store.listProviders("alice");
    assert.equal(listed.placementFilter, "any");
    assert.equal(listed.placementPreference, "any");
  });
});

test("auto preference: removing last cloud leaves local", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "l1",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    assert.equal(store.listProviders("default").placementFilter, "cloud");
    await store.removeProvider("c1");
    const listed = store.listProviders("default");
    assert.equal(listed.placementFilter, "local");
    assert.equal(listed.placementPreference, "auto");
    assert.equal(listed.defaultProviderId, "l1");
  });
});

test("setPlacementFilter cloud clears auto-switch", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    await store.setProvider({
      id: "c2",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    await store.setPlacementFilter("alice", "any");
    await store.setAutoModelSwitch("alice", true);
    assert.equal(store.listProviders("alice").autoModelSwitch.enabled, true);
    await store.setPlacementFilter("alice", "cloud");
    const listed = store.listProviders("alice");
    assert.equal(listed.placementFilter, "cloud");
    assert.equal(listed.placementPreference, "cloud");
    assert.equal(listed.autoModelSwitch.enabled, false);
  });
});

test("setAutoModelSwitch ignored under cloud filter", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    await store.setPlacementFilter("alice", "cloud");
    await store.setAutoModelSwitch("alice", true);
    assert.equal(store.listProviders("alice").autoModelSwitch.enabled, false);
  });
});

test("defaultProviderId prefers cloud; local is not set as default when cloud exists", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "l1",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    const listed = store.listProviders("default");
    assert.equal(listed.defaultProviderId, "c1");
    assert.equal(listed.placementFilter, "cloud");
  });
});

test("newest added cloud becomes defaultProviderId", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    assert.equal(store.listProviders("default").defaultProviderId, "c1");
    await store.setProvider({
      id: "c2",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    assert.equal(store.listProviders("default").defaultProviderId, "c2");
    // Listed newest-first so the default card leads the Settings list.
    assert.deepEqual(
      store.listProviders("default").providers.map((p) => p.id),
      ["c2", "c1"],
    );
    await store.setDefaultProvider("default", "c1");
    assert.equal(store.listProviders("default").defaultProviderId, "c1");
    await store.setProvider({
      id: "c3",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    assert.equal(store.listProviders("default").defaultProviderId, "c3");
    assert.deepEqual(
      store.listProviders("default").providers.map((p) => p.id),
      ["c3", "c2", "c1"],
    );
  });
});

test("shared localOnly forces every profile onto local, then releases to cloud", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    await store.setSharedLocalOnly(true, ["alice", "bob"]);
    assert.equal(store.listProviders("alice").placementFilter, "local");
    assert.equal(store.listProviders("bob").localOnly, true);
    assert.equal(store.listProviders("carol").placementFilter, "local");
    await store.setSharedLocalOnly(false, ["alice", "bob", "carol"]);
    assert.equal(store.listProviders("alice").placementFilter, "cloud");
    assert.equal(store.listProviders("bob").localOnly, false);
    assert.equal(store.listProviders("carol").placementPreference, "auto");
  });
});

test("setSharedLocalOnly(false) is a no-op when Local only is already off", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    await store.setPlacementFilter("alice", "any");
    await store.setPlacementFilter("bob", "cloud");
    assert.equal(store.listProviders("alice").localOnly, false);
    await store.setSharedLocalOnly(false, ["alice", "bob"]);
    assert.equal(store.listProviders("alice").placementFilter, "any");
    assert.equal(store.listProviders("alice").placementPreference, "any");
    assert.equal(store.listProviders("bob").placementFilter, "cloud");
    assert.equal(store.listProviders("bob").placementPreference, "cloud");
  });
});

test("per-account setPlacementFilter does not reset another profile's lock", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    await store.setPlacementFilter("alice", "cloud");
    await store.setPlacementFilter("bob", "any");
    await store.setPlacementFilter("alice", "any");
    assert.equal(store.listProviders("alice").placementFilter, "any");
    assert.equal(store.listProviders("bob").placementFilter, "any");
    assert.equal(store.listProviders("bob").placementPreference, "any");
    assert.equal(store.listProviders("alice").localOnly, false);
  });
});

test("enabling a second local disables the previous local", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "l1",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
    });
    await store.setProvider({
      id: "l2",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:10",
      enabled: true,
    });
    const listed = store.listProviders("default");
    const l1 = listed.providers.find((p) => p.id === "l1");
    const l2 = listed.providers.find((p) => p.id === "l2");
    assert.equal(l1?.enabled, false);
    assert.equal(l2?.enabled, true);
  });
});

test("setProvider null clears Advanced Unset fields", async () => {
  await withStore(async (store) => {
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
      paramCountB: 8,
      contextTokens: 128_000,
      latencyClass: "fast",
      costRank: 40,
    });
    await store.setProvider({
      id: "c1",
      kind: "cloud_openai_compat",
      paramCountB: null,
      contextTokens: null,
      latencyClass: null,
      costRank: null,
    });
    const rec = store.getRecord("c1");
    assert.equal(rec?.paramCountB, undefined);
    assert.equal(rec?.contextTokens, undefined);
    assert.equal(rec?.latencyClass, undefined);
    // costRank Unset → kind default (not the prior premium rank)
    assert.notEqual(rec?.costRank, 40);
  });
});
