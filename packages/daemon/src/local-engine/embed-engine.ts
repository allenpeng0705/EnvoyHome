// Home embed engine — Design §8.5.1 / Knowledge-RAG §5.
// Spawn llama-server :18793 XOR Ollama embeddings; never Mesh :18791; never chat :18792.

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HomePaths } from "../home-paths.js";
import type { DaemonLogger } from "../logger.js";
import { findLlamaServerBinary } from "./download-runtime.js";
import { ModelDownloadManager, type LocalModelDownloadJob } from "./download-manager.js";
import {
  DEFAULT_HOME_EMBED_MODEL,
  DEFAULT_HOME_EMBED_MODEL_ID,
  HOME_EMBED_CURATED_MODELS,
  embedPoolingForModel,
  getHomeEmbedCatalogModel,
  type HomeEmbedCatalogModel,
} from "./embed-catalog.js";
import { verifyArchiveSha256 } from "./integrity.js";
import {
  HOME_EMBED_ENGINE_BASE,
  HOME_EMBED_ENGINE_PORT,
  OLLAMA_DEFAULT_PORT,
} from "./ports.js";
import { assertLocalEngineBaseUrl } from "./url-allow.js";
import { assertHuggingFaceGgufUrl } from "./hf.js";

export { HOME_EMBED_ENGINE_PORT, HOME_EMBED_ENGINE_BASE };

export type EmbedEngineMode = "off" | "spawn" | "ollama" | "auto";

export interface EmbedEngineConfig {
  enabled: boolean;
  mode: EmbedEngineMode;
  modelId: string;
  modelPath?: string;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  /** Test-only: use deterministic hash embeddings (no HTTP). */
  mockEmbeddings?: boolean;
}

export interface EmbedEngineStatus {
  enabled: boolean;
  mode: EmbedEngineMode;
  ready: boolean;
  modelId: string;
  port: number;
  baseUrl: string;
  catalog: Array<{
    id: string;
    label: string;
    description?: string;
    fileName: string;
    url?: string;
    approxBytes: number;
    installed: boolean;
  }>;
  modelsOnDisk: string[];
  downloads: LocalModelDownloadJob[];
  /** Basename of selected GGUF when present under embed-models/. */
  activeModelFile?: string;
  ollamaModel?: string;
  lastError?: string;
  hint?: string;
  pid?: number;
  mock?: boolean;
}

const DEFAULT_CFG: EmbedEngineConfig = {
  enabled: false,
  mode: "off",
  modelId: DEFAULT_HOME_EMBED_MODEL_ID,
  ollamaModel: "nomic-embed-text",
  mockEmbeddings: false,
};

export class EmbedEngineService {
  private cfg: EmbedEngineConfig = { ...DEFAULT_CFG };
  private child: ChildProcess | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly idleMs = 10 * 60 * 1000;
  private readonly downloads: ModelDownloadManager;
  private emitEvent: ((event: string, data: unknown) => void) | undefined;
  /** Fired when embed vector space changes — modelId / ollamaModel / mode (V-EMB-6). */
  private onModelChange: ((modelId: string) => void) | undefined;

  constructor(
    private readonly paths: HomePaths,
    private readonly logger: DaemonLogger,
  ) {
    this.downloads = new ModelDownloadManager(this.embedModelsDir());
    this.downloads.setProgressEmit((job) => {
      this.emitEvent?.("home:embed-model-download", job);
      if (job.status === "completed" && job.path) {
        void this.verifyEmbedFile(job.fileName, job.path).catch((err) => {
          this.logger.warn(
            `embed-engine sha256: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    });
  }

  setEmit(emit: (event: string, data: unknown) => void): void {
    this.emitEvent = emit;
  }

  setOnModelChange(fn: (modelId: string) => void): void {
    this.onModelChange = fn;
  }

  /** Fingerprint of the active embedding space (not just curated GGUF id). */
  private embedSpaceKey(): string {
    return `${this.cfg.mode}|${this.cfg.modelId}|${this.cfg.ollamaModel}`;
  }

  private noteModelChange(prevSpace: string, nextSpace: string): void {
    if (prevSpace === nextSpace) return;
    this.onModelChange?.(this.cfg.modelId);
  }

  embedModelsDir(): string {
    return join(this.paths.localEngineDir, "embed-models");
  }

  private configPath(): string {
    return join(this.paths.localEngineDir, "embed-config.json");
  }

  async load(): Promise<void> {
    await mkdir(this.embedModelsDir(), { recursive: true });
    await this.downloads.hydratePartials({
      resolveMeta: (fileName) => {
        const entry = HOME_EMBED_CURATED_MODELS.find((m) => m.fileName === fileName);
        if (!entry) return {};
        return {
          url: entry.url,
          modelId: entry.id,
          approxBytes: entry.approxBytes,
        };
      },
    });
    try {
      const raw = await readFile(this.configPath(), "utf8");
      const parsed = JSON.parse(raw) as Partial<EmbedEngineConfig> & {
        prefer?: string;
        ollamaBaseUrl?: string;
      };
      this.cfg = { ...DEFAULT_CFG, ...parsed };
      // Refuse Mesh attach leftovers
      if (parsed.prefer === "attach") {
        this.cfg.mode = "off";
        this.cfg.enabled = false;
      }
      // V-EMB-7: re-validate loopback on restore (poisoned config fail-closed).
      if (typeof parsed.ollamaBaseUrl === "string" && parsed.ollamaBaseUrl.trim()) {
        try {
          assertLocalEngineBaseUrl(parsed.ollamaBaseUrl);
          this.cfg.ollamaBaseUrl = parsed.ollamaBaseUrl;
        } catch {
          this.logger.warn("embed-engine: refusing non-loopback ollamaBaseUrl from config");
          delete this.cfg.ollamaBaseUrl;
          if (this.cfg.mode === "ollama") {
            this.cfg.mode = "off";
            this.cfg.enabled = false;
          }
        }
      }
    } catch {
      this.cfg = { ...DEFAULT_CFG };
    }
    if (this.cfg.enabled && (this.cfg.mode === "spawn" || this.cfg.mode === "auto")) {
      // Soft restore — don't block boot on failure
      void this.ensureReady().catch((err) => {
        this.logger.warn(
          `embed-engine restore: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
  }

  private async save(): Promise<void> {
    await mkdir(this.paths.localEngineDir, { recursive: true });
    const { mockEmbeddings: _, ...persist } = this.cfg;
    await writeFile(this.configPath(), JSON.stringify(persist, null, 2) + "\n", "utf8");
  }

  /** Tests: force mock embeddings without HTTP. */
  setMockEmbeddings(on: boolean): void {
    this.cfg.mockEmbeddings = on;
    if (on) {
      this.cfg.enabled = true;
      this.cfg.mode = "spawn";
    }
  }

  async getStatus(): Promise<EmbedEngineStatus> {
    const modelsOnDisk = await this.listEmbedGgufs();
    const ready = await this.isReady();
    const onDisk = new Set(modelsOnDisk);
    const activeEntry =
      getHomeEmbedCatalogModel(this.cfg.modelId) ?? DEFAULT_HOME_EMBED_MODEL;
    const catalog = HOME_EMBED_CURATED_MODELS.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      fileName: m.fileName,
      url: m.url,
      approxBytes: m.approxBytes,
      installed: onDisk.has(m.fileName),
    }));
    return {
      enabled: this.cfg.enabled,
      mode: this.cfg.mode,
      ready,
      modelId: this.cfg.modelId,
      port: HOME_EMBED_ENGINE_PORT,
      baseUrl: this.embeddingsBaseUrl(),
      catalog,
      modelsOnDisk,
      downloads: this.downloads.list(),
      ...(onDisk.has(activeEntry.fileName)
        ? { activeModelFile: activeEntry.fileName }
        : {}),
      ...(this.cfg.ollamaModel ? { ollamaModel: this.cfg.ollamaModel } : {}),
      ...(this.child?.pid ? { pid: this.child.pid } : {}),
      ...(this.cfg.mockEmbeddings ? { mock: true } : {}),
      ...(ready
        ? {}
        : {
            hint: this.cfg.enabled
              ? "Embed engine not ready — check model download or Ollama"
              : "Enable Knowledge embed in Settings (Home :18793 or Ollama)",
          }),
    };
  }

  /**
   * Enable embed engine. prefer=attach → refuse (V-EMB-1).
   */
  async enable(input: {
    prefer?: "auto" | "spawn" | "ollama" | "attach";
    modelId?: string;
    ollamaModel?: string;
    ollamaBaseUrl?: string;
    mockEmbeddings?: boolean;
  }): Promise<EmbedEngineStatus> {
    if (input.prefer === "attach") {
      throw new Error(
        "envoyhome.local_engine_independent: Home embed never attaches to Mesh :18791 — use spawn or ollama",
      );
    }
    const prefer = input.prefer ?? "auto";
    const prevSpace = this.embedSpaceKey();
    if (input.modelId) this.cfg.modelId = input.modelId;
    if (input.ollamaModel) this.cfg.ollamaModel = input.ollamaModel;
    if (input.ollamaBaseUrl) {
      assertLocalEngineBaseUrl(input.ollamaBaseUrl);
      this.cfg.ollamaBaseUrl = input.ollamaBaseUrl;
    }
    // mockEmbeddings is test-only via setMockEmbeddings — ignore wire attempts
    if (input.mockEmbeddings) {
      this.logger.warn("embed-engine: ignoring mockEmbeddings from enable() (test hook only)");
    }

    this.cfg.enabled = true;
    if (prefer === "ollama") {
      this.cfg.mode = "ollama";
      await this.probeOllama();
    } else if (prefer === "spawn") {
      this.cfg.mode = "spawn";
      if (!this.cfg.mockEmbeddings) await this.startSpawn();
    } else {
      // auto
      try {
        if (!this.cfg.mockEmbeddings) await this.startSpawn();
        this.cfg.mode = "spawn";
      } catch {
        try {
          await this.probeOllama();
          this.cfg.mode = "ollama";
        } catch {
          if (this.cfg.mockEmbeddings) {
            this.cfg.mode = "spawn";
          } else {
            this.cfg.mode = "off";
            this.cfg.enabled = false;
            throw new Error("envoyhome.embed_unavailable: spawn and ollama both failed");
          }
        }
      }
    }
    this.noteModelChange(prevSpace, this.embedSpaceKey());
    await this.save();
    return this.getStatus();
  }

  async disable(): Promise<EmbedEngineStatus> {
    this.stopChild();
    this.cfg.enabled = false;
    this.cfg.mode = "off";
    this.cfg.mockEmbeddings = false;
    await this.save();
    return this.getStatus();
  }

  embeddingsBaseUrl(): string {
    if (this.cfg.mode === "ollama") {
      const base = this.cfg.ollamaBaseUrl ?? `http://127.0.0.1:${OLLAMA_DEFAULT_PORT}`;
      return base.replace(/\/$/, "").endsWith("/v1")
        ? base.replace(/\/$/, "")
        : `${base.replace(/\/$/, "")}/v1`;
    }
    return HOME_EMBED_ENGINE_BASE;
  }

  async ensureReady(): Promise<boolean> {
    if (!this.cfg.enabled || this.cfg.mode === "off") return false;
    if (this.cfg.mockEmbeddings) return true;
    if (this.cfg.mode === "ollama") {
      await this.probeOllama();
      return true;
    }
    if (this.cfg.mode === "spawn" || this.cfg.mode === "auto") {
      if (!(await this.probeSpawn())) await this.startSpawn();
      return this.probeSpawn();
    }
    return false;
  }

  async isReady(): Promise<boolean> {
    if (!this.cfg.enabled) return false;
    if (this.cfg.mockEmbeddings) return true;
    if (this.cfg.mode === "off") return false;
    try {
      if (this.cfg.mode === "ollama") {
        await this.probeOllama();
        return true;
      }
      return await this.probeSpawn();
    } catch {
      return false;
    }
  }

  /**
   * Embed texts. Soft-fails by throwing — callers degrade to FTS.
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    this.bumpIdle();
    if (!this.cfg.enabled || this.cfg.mode === "off") {
      throw new Error("envoyhome.embed_off");
    }
    if (texts.length === 0) return [];
    if (this.cfg.mockEmbeddings) {
      return texts.map((t) => mockEmbedding(t));
    }
    await this.ensureReady();
    const base = this.embeddingsBaseUrl();
    const model =
      this.cfg.mode === "ollama"
        ? (this.cfg.ollamaModel ?? "nomic-embed-text")
        : (getHomeEmbedCatalogModel(this.cfg.modelId)?.fileName ?? this.cfg.modelId);

    // Knowledge-RAG §5.7 — timeout + retry once; callers degrade to FTS on failure.
    const once = async (): Promise<number[][]> => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      try {
        const res = await fetch(`${base}/embeddings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, input: texts }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          throw new Error(`envoyhome.embed_http: ${res.status}`);
        }
        const json = (await res.json()) as {
          data?: Array<{ embedding?: number[]; index?: number }>;
        };
        const data = json.data ?? [];
        const out: number[][] = [];
        for (let i = 0; i < texts.length; i++) {
          const row = data.find((d) => d.index === i) ?? data[i];
          if (!row?.embedding?.length) throw new Error("envoyhome.embed_empty");
          out.push(row.embedding);
        }
        return out;
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      return await once();
    } catch (err) {
      this.logger.warn(
        `embed-engine embedTexts retry: ${err instanceof Error ? err.message : String(err)}`,
      );
      return await once();
    }
  }

  catalog(): readonly HomeEmbedCatalogModel[] {
    return HOME_EMBED_CURATED_MODELS;
  }

  currentModelId(): string {
    return this.cfg.modelId;
  }

  /**
   * Start / resume curated embed GGUF download (async).
   * Progress via `home:embed-model-download`; sha256 pinned or TOFU beside the file.
   */
  downloadModel(modelId?: string): {
    ok: true;
    modelId: string;
    fileName: string;
    targetDir: string;
    approxBytes: number;
    status: LocalModelDownloadJob["status"];
    bytesReceived: number;
    bytesTotal?: number;
    path?: string;
  } {
    const id = (modelId ?? this.cfg.modelId).trim();
    const catalog = getHomeEmbedCatalogModel(id);
    if (!catalog) {
      throw Object.assign(new Error(`envoyhome.embed_unknown_model: ${id}`), {
        code: "embed_unknown_model",
      });
    }
    assertHuggingFaceGgufUrl(catalog.url);
    const prevSpace = this.embedSpaceKey();
    this.cfg.modelId = catalog.id;
    void this.save();
    this.noteModelChange(prevSpace, this.embedSpaceKey());
    this.logger.info(`embed-engine download start ${catalog.id}`);
    const job = this.downloads.start({
      url: catalog.url,
      fileName: catalog.fileName,
      modelId: catalog.id,
      approxBytes: catalog.approxBytes,
    });
    if (job.status === "completed" && job.path) {
      void this.verifyEmbedFile(catalog.fileName, job.path).catch((err) => {
        this.logger.warn(
          `embed-engine sha256: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
    return {
      ok: true as const,
      modelId: catalog.id,
      fileName: job.fileName,
      targetDir: this.embedModelsDir(),
      approxBytes: catalog.approxBytes,
      status: job.status,
      bytesReceived: job.bytesReceived,
      ...(job.bytesTotal !== undefined ? { bytesTotal: job.bytesTotal } : {}),
      ...(job.path ? { path: job.path } : {}),
    };
  }

  listDownloads(): LocalModelDownloadJob[] {
    return this.downloads.list();
  }

  async cancelModelDownload(opts: { fileName: string }): Promise<LocalModelDownloadJob> {
    const fileName = opts.fileName?.trim();
    if (!fileName) {
      throw Object.assign(new Error("envoyhome.embed_download_unknown: missing fileName"), {
        code: "embed_download_unknown",
      });
    }
    return this.downloads.cancel(fileName);
  }

  resumeModelDownload(opts: { fileName: string }): {
    ok: true;
    fileName: string;
    status: LocalModelDownloadJob["status"];
    bytesReceived: number;
    bytesTotal?: number;
  } {
    const fileName = opts.fileName?.trim();
    if (!fileName) {
      throw Object.assign(new Error("envoyhome.embed_download_unknown: missing fileName"), {
        code: "embed_download_unknown",
      });
    }
    const job = this.downloads.get(fileName);
    const catalog = HOME_EMBED_CURATED_MODELS.find((m) => m.fileName === fileName);
    const url = job?.url || catalog?.url;
    if (!url) {
      throw Object.assign(
        new Error(`envoyhome.embed_download_unknown: no URL for ${fileName}`),
        { code: "embed_download_unknown" },
      );
    }
    const next = this.downloads.start({
      url,
      fileName,
      ...(catalog ? { modelId: catalog.id, approxBytes: catalog.approxBytes } : {}),
      ...(job?.modelId ? { modelId: job.modelId } : {}),
    });
    return {
      ok: true as const,
      fileName: next.fileName,
      status: next.status,
      bytesReceived: next.bytesReceived,
      ...(next.bytesTotal !== undefined ? { bytesTotal: next.bytesTotal } : {}),
    };
  }

  private async verifyEmbedFile(fileName: string, absPath: string): Promise<string> {
    const entry = HOME_EMBED_CURATED_MODELS.find((m) => m.fileName === fileName);
    try {
      return await verifyArchiveSha256(absPath, fileName, {
        tofuDir: this.embedModelsDir(),
        ...(entry?.sha256 ? { expectedSha256: entry.sha256 } : {}),
      });
    } catch (err) {
      // Quarantine bad GGUF so spawn cannot load it.
      const bad = `${absPath}.bad-sha256`;
      try {
        await unlink(bad).catch(() => undefined);
        await rename(absPath, bad);
      } catch {
        try {
          await unlink(absPath);
        } catch {
          /* ignore */
        }
      }
      this.logger.warn(
        `embed-engine quarantined ${fileName}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  private async listEmbedGgufs(): Promise<string[]> {
    try {
      const names = await readdir(this.embedModelsDir());
      return names.filter((n) => n.endsWith(".gguf")).sort();
    } catch {
      return [];
    }
  }

  private async probeOllama(): Promise<void> {
    const base = (this.cfg.ollamaBaseUrl ?? `http://127.0.0.1:${OLLAMA_DEFAULT_PORT}`).replace(
      /\/$/,
      "",
    );
    assertLocalEngineBaseUrl(base.includes("://") ? base : `http://${base}`);
    const url = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("envoyhome.ollama_unavailable");
  }

  private async probeSpawn(): Promise<boolean> {
    try {
      const res = await fetch(`${HOME_EMBED_ENGINE_BASE}/models`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async startSpawn(): Promise<void> {
    if (await this.probeSpawn()) return;
    this.stopChild();
    const binary = await findLlamaServerBinary(this.paths.localEngineRuntimeDir);
    if (!binary) {
      throw new Error(
        "envoyhome.local_engine_no_runtime: place llama-server under local-engine/runtime/ (shared with chat)",
      );
    }
    const catalog = getHomeEmbedCatalogModel(this.cfg.modelId) ?? DEFAULT_HOME_EMBED_MODEL;
    const modelFile = join(this.embedModelsDir(), catalog.fileName);
    try {
      await access(modelFile);
    } catch {
      throw new Error(
        `envoyhome.embed_no_model: download ${catalog.fileName} into local-engine/embed-models/`,
      );
    }
    const pooling = embedPoolingForModel(catalog.id);
    const args = [
      "--host",
      "127.0.0.1",
      "--port",
      String(HOME_EMBED_ENGINE_PORT),
      "-m",
      modelFile,
      "--embedding",
      "--pooling",
      pooling,
      "-ngl",
      "0",
    ];
    this.logger.info(`embed-engine spawning ${binary} on :${HOME_EMBED_ENGINE_PORT}`);
    this.child = spawn(binary, args, {
      stdio: "ignore",
      detached: false,
    });
    this.child.on("exit", () => {
      this.child = null;
    });
    // Wait briefly for listen
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await this.probeSpawn()) return;
    }
    throw new Error("envoyhome.embed_spawn_timeout");
  }

  private stopChild(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.child) {
      try {
        this.child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      this.child = null;
    }
  }

  private bumpIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.cfg.mode !== "spawn" || this.cfg.mockEmbeddings) return;
    this.idleTimer = setTimeout(() => {
      this.logger.info("embed-engine idle unload");
      this.stopChild();
    }, this.idleMs);
  }
}

/** Deterministic 32-dim embedding for tests (V-EMB without GPU). */
export function mockEmbedding(text: string, dim = 32): number[] {
  const out = new Array<number>(dim).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const t of tokens) {
    const h = createHash("sha256").update(t).digest();
    for (let i = 0; i < dim; i++) {
      out[i]! += (h[i % h.length]! / 255) * 2 - 1;
    }
  }
  const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0)) || 1;
  return out.map((x) => x / norm);
}
