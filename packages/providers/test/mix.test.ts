import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MemorySecretStore,
  MixRouter,
  createOpenAICompatProvider,
  type ModelProvider,
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
