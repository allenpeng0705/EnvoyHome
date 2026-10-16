/**
 * Resumable GGUF downloads with progress (Design §8.5).
 * Partial files live as `<file>.partial`; Stop keeps them; Continue uses Range.
 */

import { createWriteStream, existsSync, statSync } from "node:fs";
import { access, mkdir, readdir, rename, stat, unlink, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveLocalModelPath } from "./path-jail.js";

interface PartialMeta {
  url: string;
  modelId?: string;
  approxBytes?: number;
}

export type LocalModelDownloadStatus =
  | "downloading"
  | "paused"
  | "completed"
  | "failed";

export interface LocalModelDownloadJob {
  fileName: string;
  url: string;
  status: LocalModelDownloadStatus;
  bytesReceived: number;
  bytesTotal?: number;
  modelId?: string;
  path?: string;
  error?: string;
}

export type DownloadProgressEmit = (job: LocalModelDownloadJob) => void;

const MIN_COMPLETE_BYTES = 1_000_000;
const PROGRESS_EVERY_MS = 250;

function isAllowedDownloadHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "huggingface.co" ||
    h === "hf.co" ||
    h === "www.huggingface.co" ||
    h === "www.hf.co" ||
    h.endsWith(".huggingface.co") ||
    h.endsWith(".hf.co")
  );
}

async function fetchAllowingRedirects(
  startUrl: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  headers?: Record<string, string>,
): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop < 8; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "https:") {
      throw Object.assign(
        new Error("envoyhome.local_engine_bad_url: only https downloads allowed"),
        { code: "local_engine_bad_url" },
      );
    }
    if (!isAllowedDownloadHost(parsed.hostname)) {
      throw Object.assign(
        new Error(`envoyhome.local_engine_bad_url: host ${parsed.hostname} refused`),
        { code: "local_engine_bad_url" },
      );
    }
    const res = await fetchImpl(current, {
      redirect: "manual",
      signal,
      ...(headers ? { headers } : {}),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw Object.assign(
          new Error("envoyhome.local_engine_download_failed: redirect without Location"),
          { code: "local_engine_download_failed" },
        );
      }
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw Object.assign(
    new Error("envoyhome.local_engine_download_failed: too many redirects"),
    { code: "local_engine_download_failed" },
  );
}

export class ModelDownloadManager {
  private readonly jobs = new Map<string, LocalModelDownloadJob>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly running = new Map<string, Promise<void>>();
  private emitProgress: DownloadProgressEmit = () => undefined;

  constructor(private readonly modelsDir: string) {}

  setProgressEmit(fn: DownloadProgressEmit): void {
    this.emitProgress = fn;
  }

  list(): LocalModelDownloadJob[] {
    return [...this.jobs.values()].map((j) => ({ ...j }));
  }

  get(fileName: string): LocalModelDownloadJob | undefined {
    const j = this.jobs.get(fileName);
    return j ? { ...j } : undefined;
  }

  private metaPath(fileName: string): string {
    return join(this.modelsDir, `${fileName}.partial.meta.json`);
  }

  private async writeMeta(fileName: string, meta: PartialMeta): Promise<void> {
    try {
      await writeFile(this.metaPath(fileName), JSON.stringify(meta), "utf8");
    } catch {
      // best-effort
    }
  }

  private async readMeta(fileName: string): Promise<PartialMeta | undefined> {
    try {
      const raw = JSON.parse(await readFile(this.metaPath(fileName), "utf8")) as PartialMeta;
      if (typeof raw?.url === "string" && raw.url) return raw;
    } catch {
      // ignore
    }
    return undefined;
  }

  private async clearMeta(fileName: string): Promise<void> {
    try {
      await unlink(this.metaPath(fileName));
    } catch {
      // ignore
    }
  }

  /** Scan *.partial on disk into paused jobs (boot / status). */
  async hydratePartials(opts?: {
    resolveMeta?: (fileName: string) => { url?: string; modelId?: string; approxBytes?: number };
  }): Promise<void> {
    await mkdir(this.modelsDir, { recursive: true });
    let names: string[] = [];
    try {
      names = await readdir(this.modelsDir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.endsWith(".partial")) continue;
      const fileName = name.slice(0, -".partial".length);
      if (!fileName.toLowerCase().endsWith(".gguf")) continue;
      if (this.jobs.get(fileName)?.status === "downloading") continue;
      const partialPath = join(this.modelsDir, name);
      let bytesReceived = 0;
      try {
        bytesReceived = (await stat(partialPath)).size;
      } catch {
        continue;
      }
      const diskMeta = await this.readMeta(fileName);
      const catalogMeta = opts?.resolveMeta?.(fileName) ?? {};
      const existing = this.jobs.get(fileName);
      const url = existing?.url || diskMeta?.url || catalogMeta.url || "";
      this.jobs.set(fileName, {
        fileName,
        url,
        status: "paused",
        bytesReceived,
        ...(existing?.bytesTotal !== undefined
          ? { bytesTotal: existing.bytesTotal }
          : diskMeta?.approxBytes !== undefined
            ? { bytesTotal: diskMeta.approxBytes }
            : catalogMeta.approxBytes !== undefined
              ? { bytesTotal: catalogMeta.approxBytes }
              : {}),
        ...(existing?.modelId || diskMeta?.modelId || catalogMeta.modelId
          ? { modelId: existing?.modelId ?? diskMeta?.modelId ?? catalogMeta.modelId }
          : {}),
      });
    }
  }

  async cancel(fileName: string): Promise<LocalModelDownloadJob> {
    const job = this.jobs.get(fileName);
    if (!job) {
      throw Object.assign(
        new Error(`envoyhome.local_engine_download_unknown: ${fileName}`),
        { code: "local_engine_download_unknown" },
      );
    }
    const ctrl = this.controllers.get(fileName);
    if (ctrl) ctrl.abort();
    const pending = this.running.get(fileName);
    if (pending) {
      try {
        await pending;
      } catch {
        // ignore — runDownload settles to paused/failed itself
      }
    }
    const partialPath = join(this.modelsDir, `${fileName}.partial`);
    let bytesReceived = job.bytesReceived;
    try {
      bytesReceived = (await stat(partialPath)).size;
    } catch {
      // ignore
    }
    const next: LocalModelDownloadJob = {
      ...this.jobs.get(fileName)!,
      status: "paused",
      bytesReceived,
    };
    delete next.error;
    this.jobs.set(fileName, next);
    this.emitProgress({ ...next });
    return { ...next };
  }

  /**
   * Start or resume a download. Returns immediately with current job snapshot.
   * Completion/failure is delivered via progress emit.
   */
  start(opts: {
    url: string;
    fileName: string;
    modelId?: string;
    approxBytes?: number;
    fetchImpl?: typeof fetch;
  }): LocalModelDownloadJob {
    const fileName = opts.fileName;
    if (!fileName.toLowerCase().endsWith(".gguf")) {
      throw Object.assign(
        new Error("envoyhome.local_engine_bad_url: fileName must end with .gguf"),
        { code: "local_engine_bad_url" },
      );
    }
    const existing = this.jobs.get(fileName);
    if (existing?.status === "downloading" && this.running.has(fileName)) {
      return { ...existing };
    }

    // Fast path: already installed — return completed synchronously (RPC snapshot).
    try {
      const dest = resolveLocalModelPath(this.modelsDir, fileName);
      if (existsSync(dest)) {
        const st = statSync(dest);
        const doneModelId = opts.modelId ?? existing?.modelId;
        const done: LocalModelDownloadJob = {
          fileName,
          url: opts.url,
          status: "completed",
          bytesReceived: st.size,
          bytesTotal: st.size,
          path: dest,
          ...(doneModelId !== undefined ? { modelId: doneModelId } : {}),
        };
        this.jobs.set(fileName, done);
        this.emitProgress({ ...done });
        return { ...done };
      }
    } catch {
      // path jail / missing — fall through to download
    }

    const bytesTotal =
      opts.approxBytes !== undefined ? opts.approxBytes : existing?.bytesTotal;
    const modelId = opts.modelId ?? existing?.modelId;
    const job: LocalModelDownloadJob = {
      fileName,
      url: opts.url,
      status: "downloading",
      bytesReceived: existing?.bytesReceived ?? 0,
      ...(bytesTotal !== undefined ? { bytesTotal } : {}),
      ...(modelId !== undefined ? { modelId } : {}),
    };
    this.jobs.set(fileName, job);
    void this.writeMeta(fileName, {
      url: opts.url,
      ...(opts.modelId ? { modelId: opts.modelId } : {}),
      ...(opts.approxBytes !== undefined ? { approxBytes: opts.approxBytes } : {}),
    });
    this.emitProgress({ ...job });

    const run = this.runDownload(opts);
    this.running.set(fileName, run);
    void run.finally(() => {
      if (this.running.get(fileName) === run) this.running.delete(fileName);
    });
    return { ...job };
  }

  private async runDownload(opts: {
    url: string;
    fileName: string;
    modelId?: string;
    approxBytes?: number;
    fetchImpl?: typeof fetch;
  }): Promise<void> {
    const { fileName } = opts;
    const fetchImpl = opts.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    this.controllers.set(fileName, ctrl);

    try {
      await mkdir(this.modelsDir, { recursive: true });
      const dest = resolveLocalModelPath(this.modelsDir, fileName);
      try {
        await access(dest);
        const st = await stat(dest);
        const done: LocalModelDownloadJob = {
          fileName,
          url: opts.url,
          status: "completed",
          bytesReceived: st.size,
          bytesTotal: st.size,
          path: dest,
          ...(opts.modelId ? { modelId: opts.modelId } : {}),
        };
        this.jobs.set(fileName, done);
        this.emitProgress({ ...done });
        return;
      } catch {
        // not complete
      }

      const partialPath = join(this.modelsDir, `${fileName}.partial`);
      let existingBytes = 0;
      try {
        existingBytes = (await stat(partialPath)).size;
      } catch {
        existingBytes = 0;
      }

      let res: Response;
      let append = false;
      if (existingBytes > 0) {
        res = await fetchAllowingRedirects(opts.url, fetchImpl, ctrl.signal, {
          Range: `bytes=${existingBytes}-`,
        });
        if (res.status === 206 && res.body) {
          append = true;
          const contentRange = res.headers.get("content-range");
          const m = contentRange?.match(/\/(\d+)\s*$/);
          if (m) {
            const total = Number(m[1]);
            if (Number.isFinite(total) && total > 0) {
              const cur = this.jobs.get(fileName)!;
              cur.bytesTotal = total;
              this.jobs.set(fileName, cur);
            }
          }
        } else if (res.status === 200 && res.body) {
          // Server ignored Range — restart clean.
          try {
            await unlink(partialPath);
          } catch {
            // ignore
          }
          existingBytes = 0;
          append = false;
        } else {
          throw Object.assign(
            new Error(
              `envoyhome.local_engine_download_failed: HTTP ${res.status} for ${fileName}`,
            ),
            { code: "local_engine_download_failed" },
          );
        }
      } else {
        res = await fetchAllowingRedirects(opts.url, fetchImpl, ctrl.signal);
        if (!res.ok || !res.body) {
          throw Object.assign(
            new Error(
              `envoyhome.local_engine_download_failed: HTTP ${res.status} for ${fileName}`,
            ),
            { code: "local_engine_download_failed" },
          );
        }
      }

      const lenHeader = res.headers.get("content-length");
      if (lenHeader) {
        const n = Number(lenHeader);
        if (Number.isFinite(n) && n > 0) {
          const cur = this.jobs.get(fileName)!;
          cur.bytesTotal = append ? existingBytes + n : n;
          this.jobs.set(fileName, cur);
        }
      } else if (opts.approxBytes !== undefined) {
        const cur = this.jobs.get(fileName)!;
        if (cur.bytesTotal === undefined) {
          cur.bytesTotal = opts.approxBytes;
          this.jobs.set(fileName, cur);
        }
      }

      if (!res.body) {
        throw Object.assign(
          new Error(`envoyhome.local_engine_download_failed: empty body for ${fileName}`),
          { code: "local_engine_download_failed" },
        );
      }

      const file = createWriteStream(partialPath, { flags: append ? "a" : "w" });
      const reader = res.body.getReader();
      let received = existingBytes;
      let lastEmit = 0;
      try {
        for (;;) {
          if (ctrl.signal.aborted) {
            try {
              await reader.cancel();
            } catch {
              // ignore
            }
            throw Object.assign(new Error("envoyhome.local_engine_download_paused"), {
              code: "local_engine_download_paused",
            });
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.byteLength) {
            await new Promise<void>((resolve, reject) => {
              file.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()));
            });
            received += value.byteLength;
            const now = Date.now();
            if (now - lastEmit >= PROGRESS_EVERY_MS) {
              lastEmit = now;
              const cur = this.jobs.get(fileName)!;
              cur.bytesReceived = received;
              cur.status = "downloading";
              this.jobs.set(fileName, cur);
              this.emitProgress({ ...cur });
            }
          }
        }
        await new Promise<void>((resolve, reject) => {
          file.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
        });
      } catch (err) {
        try {
          file.destroy();
        } catch {
          // ignore
        }
        throw err;
      }

      if (received < MIN_COMPLETE_BYTES) {
        try {
          await unlink(partialPath);
        } catch {
          // ignore
        }
        throw Object.assign(
          new Error(
            `envoyhome.local_engine_download_failed: downloaded file too small (${received} bytes) for ${fileName}`,
          ),
          { code: "local_engine_download_failed" },
        );
      }

      await rename(partialPath, dest);
      await this.clearMeta(fileName);
      const done: LocalModelDownloadJob = {
        fileName,
        url: opts.url,
        status: "completed",
        bytesReceived: received,
        bytesTotal: received,
        path: dest,
        ...(opts.modelId ? { modelId: opts.modelId } : {}),
      };
      this.jobs.set(fileName, done);
      this.emitProgress({ ...done });
    } catch (err) {
      const aborted =
        ctrl.signal.aborted ||
        (err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: string }).code === "local_engine_download_paused");
      const partialPath = join(this.modelsDir, `${fileName}.partial`);
      let bytesReceived = this.jobs.get(fileName)?.bytesReceived ?? 0;
      try {
        bytesReceived = (await stat(partialPath)).size;
      } catch {
        // ignore
      }
      if (aborted) {
        const paused: LocalModelDownloadJob = {
          fileName,
          url: opts.url,
          status: "paused",
          bytesReceived,
          ...(this.jobs.get(fileName)?.bytesTotal !== undefined
            ? { bytesTotal: this.jobs.get(fileName)!.bytesTotal }
            : opts.approxBytes !== undefined
              ? { bytesTotal: opts.approxBytes }
              : {}),
          ...(opts.modelId ? { modelId: opts.modelId } : {}),
        };
        this.jobs.set(fileName, paused);
        this.emitProgress({ ...paused });
        return;
      }
      const failed: LocalModelDownloadJob = {
        fileName,
        url: opts.url,
        status: "failed",
        bytesReceived,
        error: err instanceof Error ? err.message : String(err),
        ...(this.jobs.get(fileName)?.bytesTotal !== undefined
          ? { bytesTotal: this.jobs.get(fileName)!.bytesTotal }
          : opts.approxBytes !== undefined
            ? { bytesTotal: opts.approxBytes }
            : {}),
        ...(opts.modelId ? { modelId: opts.modelId } : {}),
      };
      this.jobs.set(fileName, failed);
      this.emitProgress({ ...failed });
    } finally {
      this.controllers.delete(fileName);
    }
  }
}
