// EnvoyHome Local engine + Ollama (Design §8.5) — Home-owned; never Mesh Envoy Local.

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
  OLLAMA_DEFAULT_BASE,
  OLLAMA_PROVIDER_ID,
} from "./ports.js";
import { probeOpenAiModels } from "./probe.js";
import { buildHomeLlamaServerArgs } from "./server-args.js";
import {
  downloadAndExtractLlamaServer,
  findLlamaServerBinary,
  readRuntimeAccelMarker,
  runtimeAccelMismatch,
} from "./download-runtime.js";
import { resolveLocalBinaryPath, resolveLocalModelPath } from "./path-jail.js";
import { assertLocalEngineBaseUrl } from "./url-allow.js";
import {
  getHomeLocalCatalogModel,
  getHomeLocalCatalogModelByFileName,
} from "./catalog.js";
import { buildHomeLocalRecommendation, type HomeLocalModelPick } from "./hw.js";
import {
  assertHuggingFaceGgufUrl,
  listHuggingFaceGgufFiles,
  searchHuggingFaceGgufRepos,
  type HfGgufFile,
  type HfGgufRepoHit,
} from "./hf.js";
import {
  ModelDownloadManager,
  type LocalModelDownloadJob,
} from "./download-manager.js";
import { detectLocalPlatform, resolveLlamaCppReleaseAssets } from "./platform.js";

export type LocalEngineMode = "off" | "spawn" | "ollama";

export interface LocalEngineConfig {
  enabled: boolean;
  mode: LocalEngineMode;
  baseUrl: string;
  providerId: string;
  model?: string;
  binaryPath?: string;
  modelPath?: string;
}

export interface LocalEngineRecommendationWire {
  hardwareSummary: string;
  reason: string;
  primary: HomeLocalModelPick;
  also: HomeLocalModelPick[];
}

export interface LocalEngineStatus {
  enabled: boolean;
  mode: LocalEngineMode;
  baseUrl: string;
  providerId: string;
  healthy: boolean;
  modelIds: string[];
  runtimeInstalled: boolean;
  modelsOnDisk: string[];
  /** Basename of the selected GGUF (config modelPath) when still on disk. */
  activeModelFile?: string;
  pid?: number;
  hint?: string;
  error?: string;
  /** Hardware probe summary (Metal/CUDA/CPU + memory). */
  hardwareSummary?: string;
  /** Hardware-based curated GGUF recommendation (Adapt EnvoyMesh Envoy Local). */
  recommendation?: LocalEngineRecommendationWire;
  /** In-flight / paused / recent GGUF downloads. */
  downloads?: LocalModelDownloadJob[];
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

function normalizeMode(raw: unknown): LocalEngineMode {
  if (raw === "spawn" || raw === "ollama" || raw === "off") return raw;
  // Legacy "attach" (Mesh :18790) is withdrawn — never reuse Mesh Envoy Local.
  return "off";
}

export class LocalEngineService {
  private cfg: LocalEngineConfig = { ...DEFAULT_CFG };
  private child: ChildProcess | null = null;
  private stopping = false;
  private opChain: Promise<unknown> = Promise.resolve();
  private readonly downloads: ModelDownloadManager;
  private emitEvent: ((event: string, data: unknown) => void) | undefined;

  constructor(
    private readonly paths: HomePaths,
    private readonly providers: ProviderStore,
    private readonly logger: DaemonLogger,
  ) {
    this.downloads = new ModelDownloadManager(paths.localEngineModelsDir);
    this.downloads.setProgressEmit((job) => {
      this.emitEvent?.("home:local-model-download", job);
    });
  }

  setEmit(emit: (event: string, data: unknown) => void): void {
    this.emitEvent = emit;
  }

  async load(): Promise<void> {
    await mkdir(this.paths.localEngineDir, { recursive: true });
    await mkdir(this.paths.localEngineRuntimeDir, { recursive: true });
    await mkdir(this.paths.localEngineModelsDir, { recursive: true });
    await this.downloads.hydratePartials({
      resolveMeta: (fileName) => {
        const entry = getHomeLocalCatalogModelByFileName(fileName);
        if (!entry) return {};
        return { url: entry.url, modelId: entry.id, approxBytes: entry.approxBytes };
      },
    });
    try {
      const raw = JSON.parse(
        await readFile(this.paths.localEngineConfigJson, "utf8"),
      ) as Record<string, unknown>;
      const modeRaw = typeof raw.mode === "string" ? raw.mode : undefined;
      const mode = normalizeMode(modeRaw);
      const baseUrlRaw = typeof raw.baseUrl === "string" ? raw.baseUrl : "";
      const clearedAttach = modeRaw === "attach" || baseUrlRaw.includes(":18790");
      this.cfg = {
        ...DEFAULT_CFG,
        ...raw,
        mode,
        ...(clearedAttach
          ? {
              enabled: false,
              mode: "off" as const,
              baseUrl: HOME_LOCAL_ENGINE_BASE,
              providerId: HOME_LOCAL_PROVIDER_ID,
            }
          : {}),
      };
      // Selected GGUF / Ollama model is daemon-wide — drop a legacy per-account owner.
      if ("accountId" in this.cfg) {
        delete (this.cfg as { accountId?: string }).accountId;
      }
      // mode off must not keep a prior Ollama/spawn model id — Enable rebuilds it.
      const strippedStaleModel =
        (!this.cfg.enabled || this.cfg.mode === "off") && typeof raw.model === "string";
      if (strippedStaleModel) {
        delete (this.cfg as { model?: string }).model;
      }
      if (clearedAttach || "accountId" in raw || strippedStaleModel) {
        if (clearedAttach) {
          this.logger.warn(
            "local-engine: cleared legacy Mesh attach config — EnvoyHome Local is independent",
          );
        }
        await this.persist();
        if (clearedAttach) {
          // Provider pool may still point at Mesh :18790 from a prior attach — disable + retarget.
          await this.scrubMeshAttachProvider();
        }
      }
    } catch {
      this.cfg = { ...DEFAULT_CFG };
    }
  }

  /** After withdrawing attach, never leave `envoyhome-local` enabled on Mesh :18790. */
  private async scrubMeshAttachProvider(): Promise<void> {
    const existing = this.providers.getRecord(HOME_LOCAL_PROVIDER_ID);
    if (!existing) return;
    const url = existing.baseUrl ?? "";
    if (!url.includes(":18790") && existing.enabled !== true) return;
    try {
      await this.providers.setProvider({
        id: HOME_LOCAL_PROVIDER_ID,
        kind: "local_llama_cpp",
        enabled: false,
        baseUrl: HOME_LOCAL_ENGINE_BASE,
        ...(existing.model ? { model: existing.model } : {}),
        label: "EnvoyHome Local",
        placement: "local",
        costRank: 0,
        latencyClass: "fast",
      });
    } catch (err) {
      this.logger.warn(
        `local-engine: failed to scrub Mesh attach provider: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
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

  /**
   * Pick a GGUF for spawn: explicit path wins upstream; else modelAlias match,
   * else last selected modelPath if still on disk, else hardware-recommended
   * primary if installed, else first sorted name.
   */
  async pickGgufForSpawn(opts?: { modelAlias?: string }): Promise<string | undefined> {
    const models = await this.listGgufModels();
    if (models.length === 0) return undefined;
    const alias = opts?.modelAlias?.trim();
    if (alias) {
      const byAlias = models.find((p) => {
        const base = basename(p);
        return base === alias || base.replace(/\.gguf$/i, "") === alias;
      });
      if (byAlias) return byAlias;
    }
    const saved = this.cfg.modelPath?.trim();
    if (saved) {
      const savedBase = basename(saved);
      const bySaved = models.find((p) => basename(p) === savedBase);
      if (bySaved) return bySaved;
    }
    const rec = buildHomeLocalRecommendation(models.map((p) => basename(p)));
    if (rec.primary.installed) {
      const byRec = models.find((p) => basename(p) === rec.primary.fileName);
      if (byRec) return byRec;
    }
    return models[0];
  }

  async status(): Promise<LocalEngineStatus> {
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
    // Guide toward built-in llama.cpp by default — Ollama is opt-in only (Design §8.5).
    if (!this.cfg.enabled) {
      hint =
        "Default path: download a GGUF below, then Enable llama.cpp (Home-owned llama-server on :18792).";
    } else if (!healthy) {
      hint =
        this.cfg.mode === "ollama"
          ? "Ollama endpoint not responding — start Ollama (ollama serve) or switch back to llama.cpp."
          : "llama-server not responding — try Enable again, or check local-engine/runtime.";
    }
    const onDiskNames = modelsOnDisk.map((p) => basename(p));
    const rec = buildHomeLocalRecommendation(onDiskNames);
    if (!this.cfg.enabled && onDiskNames.length === 0) {
      hint = `${rec.reason} Download the recommended GGUF, then Enable llama.cpp.`;
    }
    const activeModelFile = this.cfg.modelPath?.trim()
      ? basename(this.cfg.modelPath.trim())
      : undefined;
    return {
      enabled: this.cfg.enabled,
      mode: this.cfg.mode,
      baseUrl: this.cfg.baseUrl,
      providerId: this.cfg.providerId,
      healthy,
      modelIds,
      runtimeInstalled: Boolean(runtimeBin),
      modelsOnDisk: onDiskNames,
      hardwareSummary: rec.hardware.summary,
      recommendation: {
        hardwareSummary: rec.hardware.summary,
        reason: rec.reason,
        primary: rec.primary,
        also: rec.also,
      },
      ...(activeModelFile && onDiskNames.includes(activeModelFile)
        ? { activeModelFile }
        : {}),
      downloads: this.downloads.list(),
      ...(this.child?.pid ? { pid: this.child.pid } : {}),
      ...(hint ? { hint } : {}),
      ...(error ? { error } : {}),
    };
  }

  /**
   * Start / resume a curated GGUF download (async). Progress via `home:local-model-download`.
   */
  downloadModel(opts: { modelId: string }): {
    ok: true;
    fileName: string;
    status: LocalModelDownloadJob["status"];
    bytesReceived: number;
    bytesTotal?: number;
    path?: string;
    bytes?: number;
  } {
    const id = opts.modelId?.trim();
    if (!id) {
      throw Object.assign(new Error("envoyhome.local_engine_unknown_model: missing modelId"), {
        code: "local_engine_unknown_model",
      });
    }
    const entry = getHomeLocalCatalogModel(id);
    if (!entry) {
      throw Object.assign(new Error(`envoyhome.local_engine_unknown_model: ${id}`), {
        code: "local_engine_unknown_model",
      });
    }
    this.logger.info(`local-engine download start curated ${id}`);
    const job = this.downloads.start({
      url: entry.url,
      fileName: entry.fileName,
      modelId: entry.id,
      approxBytes: entry.approxBytes,
    });
    return {
      ok: true as const,
      fileName: job.fileName,
      status: job.status,
      bytesReceived: job.bytesReceived,
      ...(job.bytesTotal !== undefined ? { bytesTotal: job.bytesTotal } : {}),
      ...(job.path ? { path: job.path, bytes: job.bytesReceived } : {}),
    };
  }

  /** Search Hugging Face Hub for GGUF-tagged model repos (read-only Hub API). */
  async searchHuggingFaceModels(opts: {
    query: string;
    limit?: number;
  }): Promise<{ models: HfGgufRepoHit[] }> {
    const models = await searchHuggingFaceGgufRepos(opts.query, {
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    });
    return { models };
  }

  /** List `.gguf` files in a Hugging Face model repo. */
  async listHuggingFaceGgufFiles(opts: {
    repoId: string;
  }): Promise<{ files: HfGgufFile[] }> {
    const files = await listHuggingFaceGgufFiles(opts.repoId);
    return { files };
  }

  /**
   * Start / resume a Hugging Face `.gguf` URL download (async).
   * Progress via `home:local-model-download`.
   */
  downloadModelUrl(opts: { url: string }): {
    ok: true;
    fileName: string;
    status: LocalModelDownloadJob["status"];
    bytesReceived: number;
    bytesTotal?: number;
    path?: string;
    bytes?: number;
  } {
    const url = opts.url?.trim();
    if (!url) {
      throw Object.assign(new Error("envoyhome.local_engine_bad_url: missing url"), {
        code: "local_engine_bad_url",
      });
    }
    const { url: normalized, fileName } = assertHuggingFaceGgufUrl(url);
    this.logger.info(`local-engine download start URL ${fileName}`);
    const job = this.downloads.start({
      url: normalized.toString(),
      fileName,
    });
    return {
      ok: true as const,
      fileName: job.fileName,
      status: job.status,
      bytesReceived: job.bytesReceived,
      ...(job.bytesTotal !== undefined ? { bytesTotal: job.bytesTotal } : {}),
      ...(job.path ? { path: job.path, bytes: job.bytesReceived } : {}),
    };
  }

  /** Stop an in-flight download; keeps `.partial` for Continue. */
  async cancelModelDownload(opts: { fileName: string }): Promise<LocalModelDownloadJob> {
    const fileName = opts.fileName?.trim();
    if (!fileName) {
      throw Object.assign(new Error("envoyhome.local_engine_download_unknown: missing fileName"), {
        code: "local_engine_download_unknown",
      });
    }
    return this.downloads.cancel(fileName);
  }

  /** Resume a paused download (same as start with stored URL / catalog). */
  resumeModelDownload(opts: { fileName: string }): {
    ok: true;
    fileName: string;
    status: LocalModelDownloadJob["status"];
    bytesReceived: number;
    bytesTotal?: number;
  } {
    const fileName = opts.fileName?.trim();
    if (!fileName) {
      throw Object.assign(new Error("envoyhome.local_engine_download_unknown: missing fileName"), {
        code: "local_engine_download_unknown",
      });
    }
    const job = this.downloads.get(fileName);
    const catalog = getHomeLocalCatalogModelByFileName(fileName);
    const url = job?.url || catalog?.url;
    if (!url) {
      throw Object.assign(
        new Error(
          `envoyhome.local_engine_download_unknown: no URL to resume ${fileName}`,
        ),
        { code: "local_engine_download_unknown" },
      );
    }
    const modelId = job?.modelId ?? catalog?.id;
    const approxBytes = job?.bytesTotal ?? catalog?.approxBytes;
    const started = this.downloads.start({
      url,
      fileName,
      ...(modelId !== undefined ? { modelId } : {}),
      ...(approxBytes !== undefined ? { approxBytes } : {}),
    });
    return {
      ok: true as const,
      fileName: started.fileName,
      status: started.status,
      bytesReceived: started.bytesReceived,
      ...(started.bytesTotal !== undefined ? { bytesTotal: started.bytesTotal } : {}),
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
   * Boot hook:
   * - spawn: restart Home llama-server from on-disk assets (never silent download).
   * - ollama: re-register only if the operator previously Connect'd (persisted enable).
   *   Installing/running Ollama alone never writes this config — llama.cpp stays default
   *   until the user selects an engine.
   */
  async restoreOnBoot(): Promise<void> {
    if (!this.cfg.enabled) return;
    if (this.cfg.mode === "ollama") {
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
    /** `auto` ≡ spawn. `attach` is refused (Home never reuses Mesh :18790). */
    prefer?: "auto" | "spawn" | "attach";
    modelPath?: string;
    binaryPath?: string;
    downloadRuntime?: boolean;
    modelAlias?: string;
  }): Promise<LocalEngineEnableResult> {
    return this.withLock(() => this.enableLocalLocked(opts));
  }

  private async enableLocalLocked(opts: {
    accountId?: string;
    prefer?: "auto" | "spawn" | "attach" | string;
    modelPath?: string;
    binaryPath?: string;
    downloadRuntime?: boolean;
    modelAlias?: string;
  }): Promise<LocalEngineEnableResult> {
    if (opts.prefer === "attach") {
      throw Object.assign(
        new Error(
          "envoyhome.local_engine_independent: EnvoyHome Local never attaches to Mesh Envoy Local (:18790); use spawn or Ollama",
        ),
        { code: "local_engine_independent" },
      );
    }
    await this.leavePreviousMode("spawn");
    await this.spawnServer({
      ...(opts.binaryPath ? { binaryPath: opts.binaryPath } : {}),
      ...(opts.modelPath ? { modelPath: opts.modelPath } : {}),
      downloadRuntime: opts.downloadRuntime !== false,
      ...(opts.modelAlias ? { modelAlias: opts.modelAlias } : {}),
    });
    // spawnServer sets model/modelPath from the GGUF — never inherit a prior Ollama id.
    const model = opts.modelAlias?.trim() || this.cfg.model;
    this.cfg = {
      enabled: true,
      mode: "spawn",
      baseUrl: HOME_LOCAL_ENGINE_BASE,
      providerId: HOME_LOCAL_PROVIDER_ID,
      ...(model ? { model } : {}),
      ...(this.cfg.binaryPath ? { binaryPath: this.cfg.binaryPath } : {}),
      ...(this.cfg.modelPath ? { modelPath: this.cfg.modelPath } : {}),
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
    // defaultProviderId is cloud-only — do not promote Ollama to account default.
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
    const label = this.cfg.mode === "ollama" ? "Ollama" : "EnvoyHome Local";
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
    // defaultProviderId is cloud-only (Design §8.2 / 2026-10-12b). Local registration
    // never becomes the account default; cloud-only routing keeps the cloud default.
    void opts.setDefault;
  }

  private async spawnServer(opts: {
    binaryPath?: string;
    modelPath?: string;
    downloadRuntime?: boolean;
    modelAlias?: string;
  }): Promise<void> {
    await this.stopChild();
    const platform = detectLocalPlatform();
    const assets = resolveLlamaCppReleaseAssets(platform);
    let binary: string | null = null;
    let gpuOffload = assets.gpuOffload;
    if (opts.binaryPath?.trim()) {
      binary = resolveLocalBinaryPath(this.paths.localEngineRuntimeDir, opts.binaryPath.trim());
    } else if (process.env.ENVOYHOME_LLAMA_SERVER?.trim()) {
      // Operator override on the host — still must exist; not RPC-attacker-controlled.
      binary = process.env.ENVOYHOME_LLAMA_SERVER.trim();
    } else {
      binary = await findLlamaServerBinary(this.paths.localEngineRuntimeDir);
      const mismatch = binary
        ? await runtimeAccelMismatch(this.paths.localEngineRuntimeDir, platform)
        : false;
      if (mismatch && opts.downloadRuntime) {
        this.logger.info(
          `local-engine runtime accel mismatch (want ${platform.accel} / ${assets.runtimeName}) — re-downloading…`,
        );
        binary = null;
      } else if (binary) {
        const marker = await readRuntimeAccelMarker(this.paths.localEngineRuntimeDir);
        if (marker) {
          gpuOffload = marker.gpuOffload;
        } else {
          // Unmarked legacy: Metal binaries are GPU; NVIDIA unmarked may still be CPU.
          gpuOffload = platform.accel === "metal";
        }
      }
    }
    if (!binary && opts.downloadRuntime) {
      this.logger.info(
        `local-engine downloading llama-server runtime (${platform.accel}${assets.gpuOffload ? ", GPU offload" : ", CPU"})…`,
      );
      const dl = await downloadAndExtractLlamaServer(this.paths.localEngineRuntimeDir, {
        platform,
      });
      binary = dl.binaryPath;
      gpuOffload = dl.gpuOffload;
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
      modelPath = await this.pickGgufForSpawn({
        ...(opts.modelAlias ? { modelAlias: opts.modelAlias } : {}),
      });
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
    const catalog = getHomeLocalCatalogModelByFileName(basename(modelPath));
    const args = buildHomeLlamaServerArgs({
      modelPath,
      modelAlias: alias,
      port: HOME_LOCAL_ENGINE_PORT,
      gpuOffload,
      ...(catalog?.chatTemplate ? { chatTemplate: catalog.chatTemplate } : {}),
    });
    this.logger.info(
      `local-engine spawning ${binary} on :${HOME_LOCAL_ENGINE_PORT} (ngl=${gpuOffload ? -1 : 0})`,
    );
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
