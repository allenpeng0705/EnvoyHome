import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { MemoryFacade } from "@envoyhome/memory";
import {
  AccountStore,
  BindingStore,
  DaemonLogger,
  DeviceCredentialStore,
  PairingStore,
  ProviderStore,
  SubscriptionRegistry,
  assertLocalEngineBaseUrl,
  assertSafeArchiveEntry,
  buildHomeLlamaServerArgs,
  defaultConfig,
  dispatchForTest,
  HOME_LOCAL_ENGINE_PORT,
  HOME_LOCAL_PROVIDER_ID,
  LocalEngineService,
  OLLAMA_PROVIDER_ID,
  homePaths,
  loopbackSession,
  probeOpenAiModels,
  resolveLocalBinaryPath,
  resolveLocalModelPath,
  type HomeSession,
  type RouterDeps,
} from "../dist/index.js";
import { ChannelService } from "../dist/channels/service.js";
import { ActuationService } from "../dist/actuation-service.js";
import { ArtifactService } from "../dist/artifacts.js";
import { PushTokenStore } from "../dist/push-tokens.js";
import { ScheduleService } from "../dist/schedule/service.js";
import { SkillService } from "../dist/skills.js";
import { WorkflowStore } from "../dist/workflows.js";

function meshFetchOk(modelId = "mesh-model"): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(":18790") || url.includes(":11434") || url.includes(":18792")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: modelId }] }),
      } as Response;
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

function memberSession(accountIds: string[], deviceId = "dev-member"): HomeSession {
  return {
    scopeKey: deviceId,
    ownerId: deviceId,
    isOwnerScope: false,
    deviceId,
    caller: {
      kind: "device",
      deviceId,
      accountIds,
      ownerTrusted: false,
    },
  };
}

function ownerDeviceSession(accountIds: string[], deviceId = "dev-owner"): HomeSession {
  return {
    scopeKey: deviceId,
    ownerId: deviceId,
    isOwnerScope: true,
    deviceId,
    caller: {
      kind: "device",
      deviceId,
      accountIds,
      ownerTrusted: true,
    },
  };
}

function localEngineStub(): RouterDeps["localEngine"] {
  return {
    status: async () => ({
      enabled: false,
      mode: "off" as const,
      baseUrl: "",
      providerId: "",
      healthy: false,
      modelIds: [],
      meshAttachAvailable: false,
      runtimeInstalled: false,
      modelsOnDisk: [],
    }),
    enableLocal: async () => ({
      enabled: false,
      mode: "off" as const,
      healthy: false,
      baseUrl: "",
    }),
    enableOllama: async () => ({
      enabled: false,
      mode: "off" as const,
      healthy: false,
      baseUrl: "",
    }),
    disable: async () => ({
      enabled: false,
      mode: "off" as const,
      healthy: false,
    }),
  } as unknown as RouterDeps["localEngine"];
}

async function makeRouterDeps(stateDir: string): Promise<RouterDeps> {
  const devices = new DeviceCredentialStore();
  const accounts = new AccountStore(stateDir);
  const bindings = new BindingStore(stateDir, devices);
  const pairing = new PairingStore(stateDir, devices, bindings);
  const logger = new DaemonLogger();
  const channels = new ChannelService({ stateDir, bindings, logger });
  const paths = homePaths(stateDir);
  const providers = new ProviderStore(paths);
  await providers.load();
  const localEngine = new LocalEngineService(paths, providers, logger);
  await localEngine.load();
  return {
    config: defaultConfig({ stateDir, wsPort: 0, httpPort: 0 }),
    startedAt: new Date(),
    logger,
    subscriptions: new SubscriptionRegistry(),
    connections: () => 0,
    activeTurns: () => 0,
    onShutdown: () => undefined,
    packageVersion: "0.0.0-test",
    accounts,
    bindings,
    pairing,
    memory: new MemoryFacade({ stateDir }),
    channels,
    turns: {} as RouterDeps["turns"],
    providers,
    harnesses: {} as RouterDeps["harnesses"],
    workflows: new WorkflowStore(paths),
    schedules: new ScheduleService({ paths }),
    skills: new SkillService(paths),
    artifacts: new ArtifactService(paths, () => "http://127.0.0.1:1"),
    actuations: new ActuationService(paths),
    pushTokens: new PushTokenStore(paths),
    push: {
      init: async () => undefined,
      onProductEvent: async () => undefined,
      notifyAccount: async () => ({ sent: 0 }),
      sendTest: async () => ({ sent: 0 }),
    } as RouterDeps["push"],
    localEngine,
    meshStatus: () => ({ kind: "no-node" as const, peerId: "", multiaddrs: [], scopeKey: "" }),
  };
}

test("V-LLM-9: spawn argv binds Home port 18792 and GGUF path", () => {
  const args = buildHomeLlamaServerArgs({
    modelPath: "/tmp/models/qwen.gguf",
    modelAlias: "qwen",
    port: HOME_LOCAL_ENGINE_PORT,
    nGpuLayers: 0,
  });
  assert.equal(args[args.indexOf("--port") + 1], "18792");
  assert.equal(args[args.indexOf("-m") + 1], "/tmp/models/qwen.gguf");
});

test("probeOpenAiModels reports ok + model ids from /v1/models", async () => {
  const fetchImpl = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "llama3.2" }, { id: "nomic" }] }),
    }) as Response) as typeof fetch;
  const result = await probeOpenAiModels("http://127.0.0.1:11434/v1", {
    fetchImpl,
    timeoutMs: 500,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.modelIds, ["llama3.2", "nomic"]);
});

test("Ollama baseUrl loopback-only (SSRF)", () => {
  assert.match(assertLocalEngineBaseUrl("http://127.0.0.1:11434"), /11434/);
  assert.match(assertLocalEngineBaseUrl("http://localhost:11434/v1"), /localhost/);
  assert.throws(() => assertLocalEngineBaseUrl("http://evil.example/v1"), /ollama_bad_url/);
  assert.throws(() => assertLocalEngineBaseUrl("http://10.0.0.5:11434"), /ollama_bad_url/);
});

test("modelPath / binaryPath jail under local-engine dirs", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-jail-"));
  try {
    const paths = homePaths(stateDir);
    await mkdir(paths.localEngineModelsDir, { recursive: true });
    await mkdir(paths.localEngineRuntimeDir, { recursive: true });
    const ok = resolveLocalModelPath(paths.localEngineModelsDir, "qwen.gguf");
    assert.equal(ok, join(paths.localEngineModelsDir, "qwen.gguf"));
    assert.throws(
      () => resolveLocalModelPath(paths.localEngineModelsDir, "../../../etc/passwd"),
      /local_engine_path_jail/,
    );
    assert.throws(
      () => resolveLocalBinaryPath(paths.localEngineRuntimeDir, "/usr/bin/llama-server"),
      /local_engine_path_jail/,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("zip-slip archive entries refused", () => {
  assert.throws(() => assertSafeArchiveEntry("../evil"), /unsafe archive entry/);
  assert.throws(() => assertSafeArchiveEntry("/etc/passwd"), /absolute archive entry/);
  assert.doesNotThrow(() => assertSafeArchiveEntry("bin/llama-server"));
});

test("V-LLM-7: enableLocal prefer=attach registers Mesh provider when probe ok", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-"));
  try {
    const paths = homePaths(stateDir);
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const orig = globalThis.fetch;
    globalThis.fetch = meshFetchOk();
    try {
      const st = await svc.enableLocal({ prefer: "attach", accountId: "owner" });
      assert.equal(st.mode, "attach");
      assert.equal(st.enabled, true);
      assert.match(st.baseUrl, /18790/);
      assert.equal("modelIds" in st, false);
      const row = providers
        .listProviders("owner")
        .providers.find((p) => p.id === HOME_LOCAL_PROVIDER_ID);
      assert.ok(row);
      assert.equal(row!.enabled, true);
    } finally {
      globalThis.fetch = orig;
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-LLM-8: enableOllama refuses when unreachable", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-ol-"));
  try {
    const paths = homePaths(stateDir);
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    try {
      await assert.rejects(
        () => svc.enableOllama({}),
        (err: unknown) =>
          err instanceof Error && err.message.includes("ollama_unavailable"),
      );
    } finally {
      globalThis.fetch = orig;
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-LLM-8: enableOllama registers ollama; disable clears both providers", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-ol2-"));
  try {
    const paths = homePaths(stateDir);
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const orig = globalThis.fetch;
    globalThis.fetch = meshFetchOk("llama3.2");
    try {
      await svc.enableOllama({ accountId: "owner" });
      assert.equal(providers.getRecord(OLLAMA_PROVIDER_ID)?.enabled, true);
      const off = await svc.disable();
      assert.equal(off.enabled, false);
      assert.equal(off.mode, "off");
      assert.equal(providers.getRecord(OLLAMA_PROVIDER_ID)?.enabled, false);
      assert.equal(providers.getRecord(HOME_LOCAL_PROVIDER_ID)?.enabled ?? false, false);
    } finally {
      globalThis.fetch = orig;
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("mode switch Local ↔ Ollama disables the previous provider", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-sw-"));
  try {
    const paths = homePaths(stateDir);
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const orig = globalThis.fetch;
    globalThis.fetch = meshFetchOk();
    try {
      await svc.enableOllama({ accountId: "owner" });
      assert.equal(providers.getRecord(OLLAMA_PROVIDER_ID)?.enabled, true);
      await svc.enableLocal({ prefer: "attach", accountId: "owner" });
      assert.equal(providers.getRecord(HOME_LOCAL_PROVIDER_ID)?.enabled, true);
      assert.equal(providers.getRecord(OLLAMA_PROVIDER_ID)?.enabled, false);
      await svc.enableOllama({ accountId: "owner" });
      assert.equal(providers.getRecord(OLLAMA_PROVIDER_ID)?.enabled, true);
      assert.equal(providers.getRecord(HOME_LOCAL_PROVIDER_ID)?.enabled, false);
    } finally {
      globalThis.fetch = orig;
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("enableLocal with placementFilter cloud does not throw; skips default", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-pf-"));
  try {
    const paths = homePaths(stateDir);
    const providers = new ProviderStore(paths);
    await providers.load();
    await providers.setProvider({
      id: "cloud-a",
      kind: "cloud_openai_compat",
      baseUrl: "https://api.example/v1",
      model: "x",
      enabled: true,
      placement: "cloud",
    });
    await providers.setPlacementFilter("owner", "cloud");
    await providers.setDefaultProvider("owner", "cloud-a");
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const orig = globalThis.fetch;
    globalThis.fetch = meshFetchOk();
    try {
      const st = await svc.enableLocal({ prefer: "attach", accountId: "owner" });
      assert.equal(st.enabled, true);
      assert.equal(st.mode, "attach");
      const routing = providers.listProviders("owner");
      assert.equal(routing.placementFilter, "cloud");
      assert.equal(routing.defaultProviderId, "cloud-a");
      assert.equal(providers.getRecord(HOME_LOCAL_PROVIDER_ID)?.enabled, true);
    } finally {
      globalThis.fetch = orig;
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-LLM-9: spawn without GGUF fails closed", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-sp-"));
  try {
    const paths = homePaths(stateDir);
    await mkdir(paths.localEngineRuntimeDir, { recursive: true });
    await mkdir(paths.localEngineModelsDir, { recursive: true });
    await writeFile(join(paths.localEngineRuntimeDir, "llama-server"), "#!/bin/sh\nexit 0\n", {
      mode: 0o755,
    });
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(":18790")) {
        return { ok: false, status: 503, json: async () => ({}) } as Response;
      }
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;
    try {
      await assert.rejects(
        () => svc.enableLocal({ prefer: "spawn", downloadRuntime: false }),
        (err: unknown) =>
          err instanceof Error && err.message.includes("local_engine_no_model"),
      );
    } finally {
      globalThis.fetch = orig;
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("restoreOnBoot never downloads (downloadRuntime false)", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-boot-"));
  try {
    const paths = homePaths(stateDir);
    await mkdir(paths.localEngineDir, { recursive: true });
    await writeFile(
      paths.localEngineConfigJson,
      JSON.stringify({
        enabled: true,
        mode: "spawn",
        baseUrl: "http://127.0.0.1:18792/v1",
        providerId: HOME_LOCAL_PROVIDER_ID,
      }),
      "utf8",
    );
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    await svc.restoreOnBoot();
    const st = await svc.status();
    assert.equal(st.enabled, true);
    assert.equal(st.mode, "spawn");
    assert.equal(st.healthy, false);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("owner-scope: member device denied enableLocalEngine", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-scope-"));
  try {
    const deps = await makeRouterDeps(stateDir);
    await deps.accounts.create({ accountId: "alice", displayName: "Alice" });
    const denied = await dispatchForTest(
      deps,
      "home.enableLocalEngine",
      { prefer: "attach", accountId: "alice" },
      memberSession(["alice"]),
    );
    assert.equal("error" in denied, true);
    if ("error" in denied) {
      assert.match(denied.error.message, /owner-scope/i);
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-SEC-7: owner device cannot enable for unbound accountId", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-bind-"));
  try {
    const deps = await makeRouterDeps(stateDir);
    await deps.accounts.create({ accountId: "alice", displayName: "Alice" });
    await deps.accounts.create({ accountId: "bob", displayName: "Bob" });
    const orig = globalThis.fetch;
    globalThis.fetch = meshFetchOk();
    try {
      const denied = await dispatchForTest(
        deps,
        "home.enableLocalEngine",
        { prefer: "attach", accountId: "bob" },
        ownerDeviceSession(["alice"]),
      );
      assert.equal("error" in denied, true);
      if ("error" in denied) {
        assert.match(denied.error.message, /not bound|account_not_bound/i);
      }
    } finally {
      globalThis.fetch = orig;
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("loopback enableLocalEngine succeeds (owner-scope)", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-lb-"));
  try {
    const deps = await makeRouterDeps(stateDir);
    await deps.accounts.create({ accountId: "alice", displayName: "Alice" });
    const orig = globalThis.fetch;
    globalThis.fetch = meshFetchOk();
    try {
      const ans = await dispatchForTest(
        deps,
        "home.enableLocalEngine",
        { prefer: "attach", accountId: "alice" },
        loopbackSession(),
      );
      assert.equal("result" in ans, true);
      if ("result" in ans) {
        const r = ans.result as { mode: string; enabled: boolean };
        assert.equal(r.mode, "attach");
        assert.equal(r.enabled, true);
      }
    } finally {
      globalThis.fetch = orig;
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("GGUF list is sorted for stable pick", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-sort-"));
  try {
    const paths = homePaths(stateDir);
    await mkdir(paths.localEngineModelsDir, { recursive: true });
    await writeFile(join(paths.localEngineModelsDir, "zeta.gguf"), "x");
    await writeFile(join(paths.localEngineModelsDir, "alpha.gguf"), "x");
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const models = await svc.listGgufModels();
    assert.equal(basename(models[0]!), "alpha.gguf");
    assert.equal(basename(models[1]!), "zeta.gguf");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

// Keep a shared stub shape for other suites to copy.
void localEngineStub;
