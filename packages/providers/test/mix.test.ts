import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MemorySecretStore,
  MixRouter,
  createOpenAICompatProvider,
  classifyNeedClass,
  rankByNeedClass,
  type ModelProvider,
  type ProviderSlot,
} from "../dist/index.js";

function fakeProvider(id: string): ModelProvider {
  const secrets = new MemorySecretStore();
  return createOpenAICompatProvider({
    id,
    label: id,
    baseUrl: "http://127.0.0.1:9",
    defaultModel: "m",
    secrets,
    fetchImpl: async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: id } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
}

function slot(
  id: string,
  placement: "local" | "cloud",
  profile: ProviderSlot["profile"],
): ProviderSlot {
  return { provider: fakeProvider(id), placement, profile: { placement, ...profile } };
}

test("V-LLM-1/3: local-only and forceLocal fail closed without local", () => {
  const router = new MixRouter(undefined, fakeProvider("cloud"));
  assert.throws(() => router.pick({ mode: "local" }), /privacy_local_unavailable/);
  assert.throws(() => router.pick({ mode: "mix", forceLocal: true }), /privacy_local_unavailable/);
});

test("V-LLM-2: swap local vs cloud via router setters", () => {
  const local = fakeProvider("local");
  const cloud = fakeProvider("cloud");
  const router = new MixRouter(local, cloud);
  assert.equal(router.pick({ mode: "local" }).id, "local");
  assert.equal(router.pick({ mode: "cloud" }).id, "cloud");
  router.setLocal(cloud);
  assert.equal(router.pick({ mode: "local" }).id, "cloud");
});

test("config: defaultProviderId wins when auto-switch off", () => {
  const local = fakeProvider("local");
  const cloud = fakeProvider("cloud");
  const router = new MixRouter(local, cloud);
  assert.equal(
    router.pick({ mode: "mix", defaultProviderId: "local", autoModelSwitch: false }).id,
    "local",
  );
  const deferred = router.pickDetailed({
    placementFilter: "any",
    defaultProviderId: "cloud",
    autoModelSwitch: true,
  });
  assert.equal(deferred.reason, "default");
  assert.equal(deferred.provider.id, "cloud");
});

test("config: single eligible provider uses config reason", () => {
  const local = fakeProvider("local");
  const router = new MixRouter(local, undefined);
  const d = router.pickDetailed({ placementFilter: "any", defaultProviderId: "local" });
  assert.equal(d.provider.id, "local");
  assert.equal(d.reason, "config");
  assert.equal(d.eligibleCount, 1);
});

test("V-LLM-4: describe never echoes secret", () => {
  const secrets = new MemorySecretStore();
  secrets.set("p1", "sk-secret");
  const p = createOpenAICompatProvider({
    id: "p1",
    label: "P",
    baseUrl: "http://127.0.0.1:9",
    defaultModel: "m",
    secrets,
    fetchImpl: async () => new Response("{}", { status: 500 }),
  });
  const d = p.describe();
  assert.equal(d.hasSecret, true);
  assert.equal(JSON.stringify(d).includes("sk-secret"), false);
});

test("needClass: hard keywords and length; cheap short/keywords; else standard", () => {
  assert.equal(classifyNeedClass("please implement a lock"), "hard");
  assert.equal(classifyNeedClass("深入研究这个问题"), "hard");
  assert.equal(classifyNeedClass("x".repeat(4001)), "hard");
  assert.equal(classifyNeedClass("hello"), "cheap");
  assert.equal(classifyNeedClass("提醒我买菜"), "cheap");
  assert.equal(
    classifyNeedClass(
      "How is the weather looking across the bay area this weekend for a short hike outdoors?",
    ),
    "standard",
  );
});

test("auto-switch: hard ≠ cheapest (picks strongest)", () => {
  const router = new MixRouter();
  router.setPool([
    slot("local-8b", "local", {
      paramCountB: 8,
      costRank: 0,
      latencyClass: "fast",
    }),
    slot("cloud-frontier", "cloud", {
      cloudKind: true,
      paramCountB: 70,
      costRank: 100,
      cost: { inputPerMTok: 10, outputPerMTok: 30 },
      latencyClass: "standard",
    }),
  ]);
  const d = router.pickDetailed({
    placementFilter: "any",
    defaultProviderId: "local-8b",
    autoModelSwitch: true,
    text: "Please architect and implement a distributed lock with proofs",
  });
  assert.equal(d.needClass, "hard");
  assert.equal(d.reason, "auto_switch");
  assert.equal(d.provider.id, "cloud-frontier");
});

test("auto-switch: cheap prefers low-cost capable local", () => {
  const router = new MixRouter();
  router.setPool([
    slot("local-8b", "local", {
      paramCountB: 8,
      costRank: 0,
      latencyClass: "fast",
    }),
    slot("cloud-frontier", "cloud", {
      cloudKind: true,
      paramCountB: 70,
      costRank: 100,
      cost: { inputPerMTok: 10, outputPerMTok: 30 },
      latencyClass: "slow",
    }),
  ]);
  const d = router.pickDetailed({
    placementFilter: "any",
    defaultProviderId: "cloud-frontier",
    autoModelSwitch: true,
    text: "hello",
  });
  assert.equal(d.needClass, "cheap");
  assert.equal(d.reason, "auto_switch");
  assert.equal(d.provider.id, "local-8b");
});

test("scorer: hard floor excludes weak models when stronger exists", () => {
  const ranked = rankByNeedClass("hard", [
    {
      item: "weak",
      profile: { placement: "local", paramCountB: 3, costRank: 0 },
    },
    {
      item: "strong",
      profile: {
        placement: "cloud",
        cloudKind: true,
        paramCountB: 70,
        costRank: 100,
      },
    },
  ]);
  assert.equal(ranked[0]!.item, "strong");
  assert.ok(ranked[0]!.capabilityNorm >= 0.7);
});

test("probe/triage stay off by default (no MixPolicy fields required)", () => {
  const router = new MixRouter(fakeProvider("local"), fakeProvider("cloud"));
  const d = router.pickDetailed({
    placementFilter: "any",
    defaultProviderId: "local",
    autoModelSwitch: false,
    text: "implement everything",
  });
  // Switch off → config path ignores needClass text.
  assert.equal(d.reason, "default");
  assert.equal(d.provider.id, "local");
  assert.equal(d.needClass, undefined);
});

test("healthy=false excludes provider from eligible pool", () => {
  const router = new MixRouter();
  router.setPool([
    { provider: fakeProvider("sick"), placement: "local", healthy: false },
    { provider: fakeProvider("ok"), placement: "cloud", healthy: true },
  ]);
  const d = router.pickDetailed({ placementFilter: "any", defaultProviderId: "sick" });
  assert.equal(d.provider.id, "ok");
  assert.equal(d.eligibleCount, 1);
});

test("account needClassRules prepend (first match wins)", () => {
  assert.equal(
    classifyNeedClass("hello", [{ needClass: "hard", keywords: ["hello"] }]),
    "hard",
  );
});
