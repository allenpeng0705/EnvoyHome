import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { MemoryFacade } from "@envoyhome/memory";
import {
  AccountStore,
  HouseholdStore,
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
  type HomePaths,
  type HomeSession,
  type RouterDeps,
} from "../dist/index.js";
import { ChannelService } from "../dist/channels/service.js";
import { ActuationService } from "../dist/actuation-service.js";
import { ArtifactService } from "../dist/artifacts.js";
import { WebSearchService } from "../dist/web-search.js";
import { BrowserControlService } from "../dist/browser-control.js";
import { PushTokenStore } from "../dist/push-tokens.js";
import { ScheduleService } from "../dist/schedule/service.js";
import { SkillService } from "../dist/skills.js";
import { WorkflowStore } from "../dist/workflows.js";
import { WorkflowStepTemplateStore } from "../dist/workflow-step-templates.js";

/** Fake OpenAI-compat fetch for Ollama / Home spawn probe. */
function localFetchOk(modelId = "local-model"): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(":11434") || url.includes(":18792")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: modelId }] }),
      } as Response;
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

/**
 * Install a tiny Node HTTP server as `llama-server` so spawn tests need no real GGUF runtime.
 * Honours `--port` from Home's argv builder.
 */
async function installFakeLlamaServer(paths: HomePaths): Promise<void> {
  await mkdir(paths.localEngineRuntimeDir, { recursive: true });
  await mkdir(paths.localEngineModelsDir, { recursive: true });
  const bin = join(paths.localEngineRuntimeDir, "llama-server");
  const script = `#!/usr/bin/env node
const http = require("node:http");
const argv = process.argv;
const pi = argv.indexOf("--port");
const port = Number(pi >= 0 ? argv[pi + 1] : 18792);
http.createServer((req, res) => {
  if ((req.url || "").startsWith("/v1/models")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "fake-local" }] }));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(port, "127.0.0.1");
`;
  await writeFile(bin, script, "utf8");
  await chmod(bin, 0o755);
  await writeFile(join(paths.localEngineModelsDir, "alpha.gguf"), "gguf-stub\n");
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
    household: new HouseholdStore(stateDir),
    bindings,
    pairing,
    memory: new MemoryFacade({ stateDir }),
    channels,
    turns: {} as RouterDeps["turns"],
    providers,
    harnesses: {} as RouterDeps["harnesses"],
    workflows: new WorkflowStore(paths),
    workflowStepTemplates: new WorkflowStepTemplateStore(paths),
    schedules: new ScheduleService({ paths }),
    skills: new SkillService(paths),
    artifacts: new ArtifactService(paths, () => "http://127.0.0.1:1"),
    webSearch: new WebSearchService(paths),
    browserControl: new BrowserControlService(paths),
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

test("V-LLM-7: prefer=attach refused — Home never reuses Mesh Envoy Local", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-"));
  try {
    const paths = homePaths(stateDir);
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    await assert.rejects(
      () => svc.enableLocal({ prefer: "attach", accountId: "owner" }),
      (err: unknown) =>
        err instanceof Error && err.message.includes("local_engine_independent"),
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-LLM-7: enableLocal spawn registers envoyhome-local on :18792", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-spok-"));
  try {
    const paths = homePaths(stateDir);
    await installFakeLlamaServer(paths);
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    try {
      const st = await svc.enableLocal({
        prefer: "spawn",
        accountId: "owner",
        downloadRuntime: false,
      });
      assert.equal(st.mode, "spawn");
      assert.equal(st.enabled, true);
      assert.match(st.baseUrl, /18792/);
      const row = providers
        .listProviders("owner")
        .providers.find((p) => p.id === HOME_LOCAL_PROVIDER_ID);
      assert.ok(row);
      assert.equal(row!.enabled, true);
    } finally {
      await svc.disable();
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("legacy Mesh attach config cleared on load", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-legacy-"));
  try {
    const paths = homePaths(stateDir);
    await mkdir(paths.localEngineDir, { recursive: true });
    await writeFile(
      paths.localEngineConfigJson,
      JSON.stringify({
        enabled: true,
        mode: "attach",
        baseUrl: "http://127.0.0.1:18790/v1",
        providerId: HOME_LOCAL_PROVIDER_ID,
      }),
      "utf8",
    );
    const providers = new ProviderStore(paths);
    await providers.load();
    await providers.setProvider({
      id: HOME_LOCAL_PROVIDER_ID,
      kind: "local_llama_cpp",
      baseUrl: "http://127.0.0.1:18790/v1",
      model: "mesh-model",
      enabled: true,
      placement: "local",
    });
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const st = await svc.status();
    assert.equal(st.enabled, false);
    assert.equal(st.mode, "off");
    assert.match(st.baseUrl, /18792/);
    const row = providers.getRecord(HOME_LOCAL_PROVIDER_ID);
    assert.equal(row?.enabled, false);
    assert.match(row?.baseUrl ?? "", /18792/);
    assert.ok(!(row?.baseUrl ?? "").includes("18790"));
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

test("restoreOnBoot restores Ollama only after an explicit prior Connect", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-ol-boot-"));
  try {
    const paths = homePaths(stateDir);
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    // Fresh install: nothing enabled — running Ollama on :11434 must not appear.
    await svc.restoreOnBoot();
    assert.equal((await svc.status()).mode, "off");
    assert.equal(providers.getRecord(OLLAMA_PROVIDER_ID)?.enabled ?? false, false);

    const orig = globalThis.fetch;
    globalThis.fetch = localFetchOk("gemma4:12b");
    try {
      await svc.enableOllama({ accountId: "owner", model: "gemma4:12b" });
      assert.equal(providers.getRecord(OLLAMA_PROVIDER_ID)?.enabled, true);
      // After Connect, restart must restore the operator's choice.
      const svc2 = new LocalEngineService(paths, providers, new DaemonLogger());
      await svc2.load();
      await svc2.restoreOnBoot();
      const st = await svc2.status();
      assert.equal(st.enabled, true);
      assert.equal(st.mode, "ollama");
      assert.equal(providers.getRecord(OLLAMA_PROVIDER_ID)?.enabled, true);
    } finally {
      globalThis.fetch = orig;
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("load strips stale model id when mode is off", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-stale-model-"));
  try {
    const paths = homePaths(stateDir);
    await mkdir(paths.localEngineDir, { recursive: true });
    await writeFile(
      paths.localEngineConfigJson,
      JSON.stringify({
        enabled: false,
        mode: "off",
        baseUrl: "http://127.0.0.1:18792/v1",
        providerId: "envoyhome-local",
        model: "gemma4:12b",
      }),
      "utf8",
    );
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const st = await svc.status();
    assert.equal(st.mode, "off");
    assert.equal(st.enabled, false);
    const raw = JSON.parse(await readFile(paths.localEngineConfigJson, "utf8")) as {
      model?: string;
    };
    assert.equal(raw.model, undefined);
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
    globalThis.fetch = localFetchOk("llama3.2");
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
    await installFakeLlamaServer(paths);
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const orig = globalThis.fetch;
    globalThis.fetch = localFetchOk();
    try {
      await svc.enableOllama({ accountId: "owner" });
      assert.equal(providers.getRecord(OLLAMA_PROVIDER_ID)?.enabled, true);
      await svc.enableLocal({
        prefer: "spawn",
        accountId: "owner",
        downloadRuntime: false,
      });
      assert.equal(providers.getRecord(HOME_LOCAL_PROVIDER_ID)?.enabled, true);
      assert.equal(providers.getRecord(OLLAMA_PROVIDER_ID)?.enabled, false);
      await svc.enableOllama({ accountId: "owner" });
      assert.equal(providers.getRecord(OLLAMA_PROVIDER_ID)?.enabled, true);
      assert.equal(providers.getRecord(HOME_LOCAL_PROVIDER_ID)?.enabled, false);
    } finally {
      globalThis.fetch = orig;
      await svc.disable();
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("enableLocal with placementFilter cloud does not throw; skips default", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-pf-"));
  try {
    const paths = homePaths(stateDir);
    await installFakeLlamaServer(paths);
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
    try {
      const st = await svc.enableLocal({
        prefer: "spawn",
        accountId: "owner",
        downloadRuntime: false,
      });
      assert.equal(st.enabled, true);
      assert.equal(st.mode, "spawn");
      const routing = providers.listProviders("owner");
      assert.equal(routing.placementFilter, "cloud");
      assert.equal(routing.defaultProviderId, "cloud-a");
      assert.equal(providers.getRecord(HOME_LOCAL_PROVIDER_ID)?.enabled, true);
    } finally {
      await svc.disable();
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
    await assert.rejects(
      () => svc.enableLocal({ prefer: "spawn", downloadRuntime: false }),
      (err: unknown) =>
        err instanceof Error && err.message.includes("local_engine_no_model"),
    );
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
      { prefer: "spawn", accountId: "alice" },
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
    await installFakeLlamaServer(homePaths(stateDir));
    await deps.accounts.create({ accountId: "alice", displayName: "Alice" });
    await deps.accounts.create({ accountId: "bob", displayName: "Bob" });
    const denied = await dispatchForTest(
      deps,
      "home.enableLocalEngine",
      { prefer: "spawn", accountId: "bob", downloadRuntime: false },
      ownerDeviceSession(["alice"]),
    );
    assert.equal("error" in denied, true);
    if ("error" in denied) {
      assert.match(denied.error.message, /not bound|account_not_bound/i);
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("loopback enableLocalEngine succeeds (owner-scope)", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-lb-"));
  try {
    const deps = await makeRouterDeps(stateDir);
    await installFakeLlamaServer(homePaths(stateDir));
    await deps.accounts.create({ accountId: "alice", displayName: "Alice" });
    try {
      const ans = await dispatchForTest(
        deps,
        "home.enableLocalEngine",
        { prefer: "spawn", accountId: "alice", downloadRuntime: false },
        loopbackSession(),
      );
      assert.equal("result" in ans, true);
      if ("result" in ans) {
        const r = ans.result as { mode: string; enabled: boolean };
        assert.equal(r.mode, "spawn");
        assert.equal(r.enabled, true);
      }
    } finally {
      await deps.localEngine.disable();
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

test("V-LLM-10: home.downloadLocalModel via router (mock catalog download)", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-dlm-"));
  try {
    const deps = await makeRouterDeps(stateDir);
    const paths = homePaths(stateDir);
    const { HOME_LOCAL_DEFAULT_MODEL } = await import("../dist/local-engine/catalog.js");
    const { downloadCuratedGguf } = await import("../dist/local-engine/download-model.js");
    const payload = Buffer.alloc(1_500_000, 0x62);
    const fetchImpl = (async () =>
      ({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(payload);
            controller.close();
          },
        }),
      }) as Response) as typeof fetch;
    // Pre-seed via the same helper the service uses (RPC exercises owner-scope + wiring).
    await downloadCuratedGguf(paths.localEngineModelsDir, HOME_LOCAL_DEFAULT_MODEL.id, {
      fetchImpl,
    });
    const ans = await dispatchForTest(
      deps,
      "home.downloadLocalModel",
      { modelId: HOME_LOCAL_DEFAULT_MODEL.id },
      loopbackSession(),
    );
    assert.equal("result" in ans, true);
    if ("result" in ans) {
      const r = ans.result as {
        ok: boolean;
        fileName: string;
        status: string;
        bytes?: number;
        bytesReceived: number;
      };
      assert.equal(r.ok, true);
      assert.equal(r.fileName, HOME_LOCAL_DEFAULT_MODEL.fileName);
      // Already on disk → async API returns completed immediately.
      assert.equal(r.status, "completed");
      assert.ok((r.bytes ?? r.bytesReceived) > 0);
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("spawn prefers recommended GGUF when installed among several", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-pick-"));
  try {
    const paths = homePaths(stateDir);
    await mkdir(paths.localEngineModelsDir, { recursive: true });
    const { buildHomeLocalRecommendation } = await import("../dist/index.js");
    const rec = buildHomeLocalRecommendation([]);
    // Alphabetically first decoy would win without recommendation preference.
    await writeFile(join(paths.localEngineModelsDir, "aaa-decoy.gguf"), "x");
    await writeFile(join(paths.localEngineModelsDir, rec.primary.fileName), "x");
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const picked = await svc.pickGgufForSpawn();
    assert.equal(basename(picked!), rec.primary.fileName);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("spawn prefers last selected modelPath over recommended", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-le-pick-saved-"));
  try {
    const paths = homePaths(stateDir);
    await mkdir(paths.localEngineDir, { recursive: true });
    await mkdir(paths.localEngineModelsDir, { recursive: true });
    const { buildHomeLocalRecommendation } = await import("../dist/index.js");
    const rec = buildHomeLocalRecommendation([]);
    const chosen = "zzz-operator-pick.gguf";
    const chosenPath = join(paths.localEngineModelsDir, chosen);
    await writeFile(chosenPath, "x");
    await writeFile(join(paths.localEngineModelsDir, rec.primary.fileName), "x");
    // Prior "Use this" selection persisted in config.json.
    await writeFile(
      paths.localEngineConfigJson,
      JSON.stringify({
        enabled: false,
        mode: "off",
        baseUrl: "http://127.0.0.1:18792/v1",
        providerId: "envoyhome-local",
        modelPath: chosenPath,
      }),
    );
    const providers = new ProviderStore(paths);
    await providers.load();
    const svc = new LocalEngineService(paths, providers, new DaemonLogger());
    await svc.load();
    const picked = await svc.pickGgufForSpawn();
    assert.equal(basename(picked!), chosen);
    const st = await svc.status();
    assert.equal(st.activeModelFile, chosen);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

// Keep a shared stub shape for other suites to copy.
void localEngineStub;
