/** Download a curated GGUF into local-engine/models/ (operator-triggered). */

import { createWriteStream } from "node:fs";
import { access, mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { getHomeLocalCatalogModel } from "./catalog.js";
import { resolveLocalModelPath } from "./path-jail.js";

export async function downloadCuratedGguf(
  modelsDir: string,
  modelId: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<{ fileName: string; path: string; bytes: number }> {
  const entry = getHomeLocalCatalogModel(modelId);
  if (!entry) {
    throw Object.assign(
      new Error(`envoyhome.local_engine_unknown_model: ${modelId}`),
      { code: "local_engine_unknown_model" },
    );
  }
  await mkdir(modelsDir, { recursive: true });
  const dest = resolveLocalModelPath(modelsDir, entry.fileName);
  try {
    await access(dest);
    return { fileName: entry.fileName, path: dest, bytes: entry.approxBytes };
  } catch {
    // not present — download
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(entry.url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw Object.assign(
      new Error(
        `envoyhome.local_engine_download_failed: HTTP ${res.status} for ${entry.fileName}`,
      ),
      { code: "local_engine_download_failed" },
    );
  }

  const partial = join(modelsDir, `${entry.fileName}.partial`);
  try {
    await unlink(partial);
  } catch {
    // ignore
  }
  const file = createWriteStream(partial);
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), file);

  let bytes = 0;
  try {
    const { stat } = await import("node:fs/promises");
    bytes = (await stat(partial)).size;
  } catch {
    bytes = entry.approxBytes;
  }
  // Soft size check — refuse empty / tiny stubs (HF error pages).
  if (bytes < 1_000_000) {
    try {
      await unlink(partial);
    } catch {
      // ignore
    }
    throw Object.assign(
      new Error(
        `envoyhome.local_engine_download_failed: downloaded file too small (${bytes} bytes) for ${entry.fileName}`,
      ),
      { code: "local_engine_download_failed" },
    );
  }
  await rename(partial, dest);
  return { fileName: entry.fileName, path: dest, bytes };
}
