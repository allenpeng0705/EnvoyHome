// EnvoyHome Local engine + Ollama (Design §8.5) — Adapt EnvoyMesh Envoy Local.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readdir, readFile, writeFile, access } from "node:fs/promises";
import { basename, join } from "node:path";
import type { HomePaths } from "../home-paths.js";
import type { ProviderStore } from "../providers-store.js";
import type { DaemonLogger } from "../logger.js";
import {
  HOME_LOCAL_ENGINE_BASE,
  HOME_LOCAL_ENGINE_PORT,
  HOME_LOCAL_PROVIDER_ID,
  MESH_ENVOY_LOCAL_BASE,
  OLLAMA_DEFAULT_BASE,
  OLLAMA_PROVIDER_ID,
} from "./ports.js";
import { probeOpenAiModels } from "./probe.js";
import { buildHomeLlamaServerArgs } from "./server-args.js";
import {
  downloadAndExtractLlamaServer,
  findLlamaServerBinary,
} from "./download-runtime.js";
import { resolveLocalBinaryPath, resolveLocalModelPath } from "./path-jail.js";
import { assertLocalEngineBaseUrl } from "./url-allow.js";

export type LocalEngineMode = "off" | "attach" | "spawn" | "ollama";

export interface LocalEngineConfig {
  enabled: boolean;
  mode: LocalEngineMode;
  baseUrl: string;
  providerId: string;
  model?: string;
  binaryPath?: string;
  modelPath?: string;
  /** Last account that enabled (for default provider). */
  accountId?: string;
}

export interface LocalEngineStatus {
  enabled: boolean;
  mode: LocalEngineMode;
  baseUrl: string;
  providerId: string;
  healthy: boolean;
  modelIds: string[];
  meshAttachAvailable: boolean;
  runtimeInstalled: boolean;
  modelsOnDisk: string[];
  pid?: number;
  hint?: string;
  error?: string;
}

/** Wire shape for enable/disable RPCs (Design A.6 / protocol schemas). */
export interface LocalEngineEnableResult {
  enabled: boolean;
  mode: LocalEngineMode;
  healthy: boolean;
  baseUrl: string;
}

export interface LocalEngineDisableResult {
  enabled: boolean;
  mode: LocalEngineMode;
  healthy: boolean;
}

const DEFAULT_CFG: LocalEngineConfig = {
  enabled: false,
  mode: "off",
  baseUrl: HOME_LOCAL_ENGINE_BASE,
  providerId: HOME_LOCAL_PROVIDER_ID,
};

const STOP_CHILD_GRACE_MS = 2_000;

export class LocalEngineService {
  private cfg: LocalEngineConfig = { ...DEFAULT_CFG };
  private child: ChildProcess | null = null;
  private stopping = false;
  private opChain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly paths: HomePaths,
    private readonly providers: ProviderStore,
    private readonly logger: DaemonLogger,
  ) {}

  async load(): Promise<void> {
    await mkdir(this.paths.localEngineDir, { recursive: true });
    await mkdir(this.paths.localEngineRuntimeDir, { recursive: true });
    await mkdir(this.paths.localEngineModelsDir, { recursive: true });
    try {
      const raw = JSON.parse(
        await readFile(this.paths.localEngineConfigJson, "utf8"),
      ) as LocalEngineConfig;
      this.cfg = { ...DEFAULT_CFG, ...raw };
    } catch {
      this.cfg = { ...DEFAULT_CFG };
    }
  }

  private async persist(): Promise<void> {
    await mkdir(this.paths.localEngineDir, { recursive: true });
    await writeFile(
      this.paths.localEngineConfigJson,
      JSON.stringify(this.cfg, null, 2),
      "utf8",
    );
  }

  /** Serialize enable/disable/spawn so overlapping calls cannot double-spawn. */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.opChain.then(fn, fn);
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async listGgufModels(): Promise<string[]> {
    try {
      const names = await readdir(this.paths.localEngineModelsDir);
      return names
        .filter((n) => n.toLowerCase().endsWith(".gguf"))
        .sort((a, b) => a.localeCompare(b))
        .map((n) => join(this.paths.localEngineModelsDir, n));
    } catch {
      return [];
    }
  }

  async status(): Promise<LocalEngineStatus> {
    const mesh = await probeOpenAiModels(MESH_ENVOY_LOCAL_BASE);
    const runtimeBin =
      this.cfg.binaryPath ||
      (await findLlamaServerBinary(this.paths.localEngineRuntimeDir));
    const modelsOnDisk = await this.listGgufModels();
    let healthy = false;
    let modelIds: string[] = [];
    let error: string | undefined;
    if (this.cfg.enabled && this.cfg.baseUrl) {
      const probe = await probeOpenAiModels(this.cfg.baseUrl);
      healthy = probe.ok;
      modelIds = probe.modelIds;
      if (!probe.ok) error = probe.error;
    }
    let hint: string | undefined;
    if (!this.cfg.enabled) {
      hint =
        "Enable EnvoyHome Local (attach Mesh engine, spawn llama-server, or use Ollama).";
    } else if (!healthy) {
      hint = "Local endpoint not responding — check llama-server / Ollama is up.";
    }
    return {
      enabled: this.cfg.enabled,
      mode: this.cfg.mode,
      baseUrl: this.cfg.baseUrl,
      providerId: this.cfg.providerId,
      healthy,
      modelIds,
      meshAttachAvailable: mesh.ok,
      runtimeInstalled: Boolean(runtimeBin),
      modelsOnDisk: modelsOnDisk.map((p) => basename(p)),
      ...(this.child?.pid ? { pid: this.child.pid } : {}),
      ...(hint ? { hint } : {}),
      ...(error ? { error } : {}),
    };
  }

  private async toEnableResult(): Promise<LocalEngineEnableResult> {
    const st = await this.status();
    return {
      enabled: st.enabled,
      mode: st.mode,
      healthy: st.healthy,
      baseUrl: st.baseUrl,
    };
  }

  private async toDisableResult(): Promise<LocalEngineDisableResult> {
    const st = await this.status();
    return { enabled: st.enabled, mode: st.mode, healthy: st.healthy };
  }

  /**
   * Boot hook: if previously enabled in spawn mode, try to restart sidecar
   * (assets already on disk — never download silently).
   */
  async restoreOnBoot(): Promise<void> {
    if (!this.cfg.enabled) return;
    if (this.cfg.mode === "attach" || this.cfg.mode === "ollama") {
      await this.registerProviderFromConfig({ setDefault: false });
      return;
    }
    if (this.cfg.mode === "spawn") {
      try {
        await this.spawnServer({
          ...(this.cfg.binaryPath ? { binaryPath: this.cfg.binaryPath } : {}),
          ...(this.cfg.modelPath ? { modelPath: this.cfg.modelPath } : {}),
          downloadRuntime: false,
        });
        await this.registerProviderFromConfig({ setDefault: false });
      } catch (err) {
        this.logger.warn(
          `local-engine restore failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async enableLocal(opts: {
    accountId?: string;
    /** auto = prefer Mesh attach, else spawn */
    prefer?: "auto" | "attach" | "spawn";
    modelPath?: string;
    binaryPath?: string;
    downloadRuntime?: boolean;
    modelAlias?: string;
  }): Promise<LocalEngineEnableResult> {
    return this.withLock(() => this.enableLocalLocked(opts));
  }

  private async enableLocalLocked(opts: {
    accountId?: string;
    prefer?: "auto" | "attach" | "spawn";
    modelPath?: string;
    binaryPath?: string;
    downloadRuntime?: boolean;
    modelAlias?: string;
  }): Promise<LocalEngineEnableResult> {
    const prefer = opts.prefer ?? "auto";
    const mesh = await probeOpenAiModels(MESH_ENVOY_LOCAL_BASE);
    if ((prefer === "auto" || prefer === "attach") && mesh.ok) {
      await this.leavePreviousMode("attach");
      const model = opts.modelAlias ?? mesh.modelIds[0];
      this.cfg = {
        enabled: true,
        mode: "attach",
        baseUrl: MESH_ENVOY_LOCAL_BASE,
        providerId: HOME_LOCAL_PROVIDER_ID,
        ...(model ? { model } : {}),
        ...(opts.accountId ? { accountId: opts.accountId } : {}),
      };
      await this.persist();
      await this.registerProviderFromConfig({ setDefault: true });
      this.logger.info("local-engine attached to EnvoyMesh Envoy Local :18790");
      return this.toEnableResult();
    }
    if (prefer === "attach") {
      throw Object.assign(
        new Error(
          "envoyhome.local_engine_unavailable: EnvoyMesh Envoy Local not reachable on :18790",
        ),
        { code: "local_engine_unavailable" },
      );
    }
    await this.leavePreviousMode("spawn");
    await this.spawnServer({
      ...(opts.binaryPath ? { binaryPath: opts.binaryPath } : {}),
      ...(opts.modelPath ? { modelPath: opts.modelPath } : {}),
      downloadRuntime: opts.downloadRuntime !== false,
      ...(opts.modelAlias ? { modelAlias: opts.modelAlias } : {}),
    });
    this.cfg = {
      enabled: true,
      mode: "spawn",
      baseUrl: HOME_LOCAL_ENGINE_BASE,
      providerId: HOME_LOCAL_PROVIDER_ID,
      ...(opts.modelAlias || this.cfg.model
        ? { model: opts.modelAlias ?? this.cfg.model }
        : {}),
      ...(this.cfg.binaryPath ? { binaryPath: this.cfg.binaryPath } : {}),
      ...(this.cfg.modelPath ? { modelPath: this.cfg.modelPath } : {}),
      ...(opts.accountId ? { accountId: opts.accountId } : {}),
    };
    await this.persist();
    await this.registerProviderFromConfig({ setDefault: true });
    return this.toEnableResult();
  }

  async enableOllama(opts: {
    accountId?: string;
    baseUrl?: string;
    model?: string;
  }): Promise<LocalEngineEnableResult> {
    return this.withLock(() => this.enableOllamaLocked(opts));
  }

  private async enableOllamaLocked(opts: {
    accountId?: string;
    baseUrl?: string;
    model?: string;
  }): Promise<LocalEngineEnableResult> {
    const normalized = assertLocalEngineBaseUrl(opts.baseUrl?.trim() || OLLAMA_DEFAULT_BASE);
    const probe = await probeOpenAiModels(normalized, { timeoutMs: 3_000 });
    if (!probe.ok) {
      throw Object.assign(
        new Error(
          `envoyhome.ollama_unavailable: ${probe.error ?? "not reachable"} — start Ollama (ollama serve) first`,
        ),
        { code: "ollama_unavailable" },
      );
    }
    await this.leavePreviousMode("ollama");
    const model = opts.model?.trim() || probe.modelIds[0] || "llama3.2";
    this.cfg = {
      enabled: true,
      mode: "ollama",
      baseUrl: normalized,
      providerId: OLLAMA_PROVIDER_ID,
      model,
      ...(opts.accountId ? { accountId: opts.accountId } : {}),
    };
    await this.persist();
    await this.providers.setProvider({
      id: OLLAMA_PROVIDER_ID,
      kind: "local_openai_compat",
      baseUrl: normalized,
      model,
      enabled: true,
      label: "Ollama",
      placement: "local",
      costRank: 0,
      latencyClass: "fast",
    });
    if (opts.accountId) {
      await this.maybeSetDefault(opts.accountId, OLLAMA_PROVIDER_ID);
    }
    this.logger.info(`local-engine using Ollama at ${normalized}`);
    return this.toEnableResult();
  }

  async disable(): Promise<LocalEngineDisableResult> {
    return this.withLock(() => this.disableLocked());
  }

  private async disableLocked(): Promise<LocalEngineDisableResult> {
    await this.stopChild();
    this.cfg = { ...DEFAULT_CFG };
    await this.persist();
    await this.disableEngineProviders();
    return this.toDisableResult();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await this.stopChild();
  }

  /** Stop spawn child + disable the other §8.5 provider when switching modes. */
  private async leavePreviousMode(next: LocalEngineMode): Promise<void> {
    if (this.cfg.mode === "spawn" || this.child) {
      await this.stopChild();
    }
    if (next !== "ollama") {
      await this.disableProviderQuiet(OLLAMA_PROVIDER_ID, "local_openai_compat");
    }
    if (next === "ollama") {
      await this.disableProviderQuiet(HOME_LOCAL_PROVIDER_ID, "local_llama_cpp");
    }
  }

  private async disableEngineProviders(): Promise<void> {
    await this.disableProviderQuiet(HOME_LOCAL_PROVIDER_ID, "local_llama_cpp");
    await this.disableProviderQuiet(OLLAMA_PROVIDER_ID, "local_openai_compat");
  }

  private async disableProviderQuiet(
    id: string,
    kind: "local_llama_cpp" | "local_openai_compat",
  ): Promise<void> {
    try {
      const existing = this.providers.getRecord(id);
      if (!existing) return;
      await this.providers.setProvider({
        id,
        kind: existing.kind === "local_openai_compat" ? "local_openai_compat" : kind,
        enabled: false,
        ...(existing.baseUrl ? { baseUrl: existing.baseUrl } : {}),
        ...(existing.model ? { model: existing.model } : {}),
      });
    } catch {
      // provider may not exist
    }
  }

  private async registerProviderFromConfig(opts: { setDefault: boolean }): Promise<void> {
    const kind =
      this.cfg.mode === "ollama" ? "local_openai_compat" : "local_llama_cpp";
    const label =
      this.cfg.mode === "attach"
        ? "EnvoyHome Local (Mesh)"
        : this.cfg.mode === "ollama"
          ? "Ollama"
          : "EnvoyHome Local";
    await this.providers.setProvider({
      id: this.cfg.providerId,
      kind,
      baseUrl: this.cfg.baseUrl,
      model: this.cfg.model ?? "default",
      enabled: true,
      label,
      placement: "local",
      costRank: 0,
      latencyClass: "fast",
      supportsTools: true,
    });
    if (opts.setDefault && this.cfg.accountId) {
      await this.maybeSetDefault(this.cfg.accountId, this.cfg.providerId);
    }
  }

  /**
   * Set default only when placementFilter allows. Never silently rewrite the filter.
   */
  private async maybeSetDefault(accountId: string, providerId: string): Promise<void> {
    try {
      await this.providers.setDefaultProvider(accountId, providerId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("outside filter") || msg.includes("bad_params")) {
        this.logger.warn(
          `local-engine: not setting defaultProvider=${providerId} for ${accountId}: ${msg}`,
        );
        return;
      }
      throw err;
    }
  }

  private async spawnServer(opts: {
    binaryPath?: string;
    modelPath?: string;
    downloadRuntime?: boolean;
    modelAlias?: string;
  }): Promise<void> {
    await this.stopChild();
    let binary: string | null = null;
    if (opts.binaryPath?.trim()) {
      binary = resolveLocalBinaryPath(this.paths.localEngineRuntimeDir, opts.binaryPath.trim());
    } else if (process.env.ENVOYHOME_LLAMA_SERVER?.trim()) {
      // Operator override on the host — still must exist; not RPC-attacker-controlled.
      binary = process.env.ENVOYHOME_LLAMA_SERVER.trim();
    } else {
      binary = await findLlamaServerBinary(this.paths.localEngineRuntimeDir);
    }
    if (!binary && opts.downloadRuntime) {
      this.logger.info("local-engine downloading llama-server runtime…");
      const dl = await downloadAndExtractLlamaServer(this.paths.localEngineRuntimeDir);
      binary = dl.binaryPath;
      this.logger.info(`local-engine runtime ready: ${dl.assetName}`);
    }
    if (!binary) {
      throw Object.assign(
        new Error(
          "envoyhome.local_engine_no_runtime: place llama-server under local-engine/runtime/ or set ENVOYHOME_LLAMA_SERVER, or pass downloadRuntime",
        ),
        { code: "local_engine_no_runtime" },
      );
    }
    let modelPath: string | undefined;
    if (opts.modelPath?.trim()) {
      modelPath = resolveLocalModelPath(this.paths.localEngineModelsDir, opts.modelPath.trim());
    } else {
      const models = await this.listGgufModels();
      modelPath = models[0];
    }
    if (!modelPath) {
      throw Object.assign(
        new Error(
          `envoyhome.local_engine_no_model: drop a .gguf into ${this.paths.localEngineModelsDir} or pass modelPath`,
        ),
        { code: "local_engine_no_model" },
      );
    }
    try {
      await access(modelPath);
    } catch {
      throw Object.assign(new Error(`envoyhome.local_engine_no_model: missing ${modelPath}`), {
        code: "local_engine_no_model",
      });
    }
    const alias = opts.modelAlias?.trim() || basename(modelPath).replace(/\.gguf$/i, "");
    const args = buildHomeLlamaServerArgs({
      modelPath,
      modelAlias: alias,
      port: HOME_LOCAL_ENGINE_PORT,
    });
    this.logger.info(`local-engine spawning ${binary} on :${HOME_LOCAL_ENGINE_PORT}`);
    const child = spawn(binary, args, {
      cwd: this.paths.localEngineRuntimeDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    this.child = child;
    child.stderr?.on("data", (buf: Buffer) => {
      const line = buf.toString("utf8").trim();
      if (line) this.logger.info(`llama-server: ${line.slice(0, 200)}`);
    });
    child.on("exit", (code) => {
      if (!this.stopping) {
        this.logger.warn(`llama-server exited code=${code}`);
      }
      if (this.child === child) this.child = null;
    });
    const deadline = Date.now() + 60_000;
    let lastErr = "timeout";
    while (Date.now() < deadline) {
      const probe = await probeOpenAiModels(HOME_LOCAL_ENGINE_BASE, { timeoutMs: 1_500 });
      if (probe.ok) {
        this.cfg.binaryPath = binary;
        this.cfg.modelPath = modelPath;
        this.cfg.model = alias;
        return;
      }
      lastErr = probe.error ?? "not ready";
      await new Promise((r) => setTimeout(r, 500));
    }
    await this.stopChild();
    throw Object.assign(
      new Error(`envoyhome.local_engine_start_failed: ${lastErr}`),
      { code: "local_engine_start_failed" },
    );
  }

  private async stopChild(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.killed) return;
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
    const exited = await new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        resolve(ok);
      };
      child.once("exit", () => finish(true));
      setTimeout(() => finish(false), STOP_CHILD_GRACE_MS);
    });
    if (!exited) {
      try {
        if (!child.killed) child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }
}
