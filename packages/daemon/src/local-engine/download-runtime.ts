// Download + extract pinned llama-server (never bundled in the app installer).

import { createWriteStream } from "node:fs";
import { mkdir, chmod, access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  detectLocalPlatform,
  HOME_LLAMA_CPP_TAG,
  llamaCppAssetName,
  llamaCppReleaseUrl,
} from "./platform.js";
import {
  assertTarEntriesSafe,
  assertZipEntriesSafe,
  verifyArchiveSha256,
} from "./integrity.js";
import { safeJoin } from "../fs-jail.js";

const execFileAsync = promisify(execFile);

export async function findLlamaServerBinary(runtimeDir: string): Promise<string | null> {
  const candidates = [
    join(runtimeDir, "llama-server"),
    join(runtimeDir, "bin", "llama-server"),
    join(runtimeDir, "llama-server.exe"),
    join(runtimeDir, "bin", "llama-server.exe"),
  ];
  for (const c of candidates) {
    try {
      await access(c);
      return c;
    } catch {
      // try next
    }
  }
  try {
    const entries = await readdir(runtimeDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const nested = join(runtimeDir, e.name, "llama-server");
        try {
          await access(nested);
          // Must stay under runtimeDir
          safeJoin(runtimeDir, join(e.name, "llama-server"));
          return nested;
        } catch {
          // continue
        }
      }
      if (e.isFile() && /^llama-server(\.exe)?$/.test(e.name)) {
        return join(runtimeDir, e.name);
      }
    }
  } catch {
    // empty
  }
  return null;
}

/**
 * Download the pinned llama.cpp release archive and extract into runtimeDir.
 * Verifies sha256 (pinned / env / TOFU) and refuses zip-slip entries.
 */
export async function downloadAndExtractLlamaServer(
  runtimeDir: string,
  opts?: { fetchImpl?: typeof fetch; tag?: string; expectedSha256?: string },
): Promise<{ binaryPath: string; assetName: string; sha256: string }> {
  const platform = detectLocalPlatform();
  const tag = opts?.tag ?? HOME_LLAMA_CPP_TAG;
  const assetName = llamaCppAssetName(platform, tag);
  const url = llamaCppReleaseUrl(platform, tag);
  await mkdir(runtimeDir, { recursive: true });
  const archivePath = join(runtimeDir, assetName);

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(url);
  if (!res.ok || !res.body) {
    throw new Error(`envoyhome.local_engine_download_failed: HTTP ${res.status} for ${assetName}`);
  }
  const nodeStream = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  await pipeline(nodeStream, createWriteStream(archivePath));

  const sha256 = await verifyArchiveSha256(archivePath, assetName, {
    ...(opts?.expectedSha256 ? { expectedSha256: opts.expectedSha256 } : {}),
    tofuDir: runtimeDir,
  });

  if (assetName.endsWith(".tar.gz")) {
    await assertTarEntriesSafe(archivePath);
    await execFileAsync("tar", ["-xzf", archivePath, "-C", runtimeDir]);
  } else if (assetName.endsWith(".zip")) {
    await assertZipEntriesSafe(archivePath);
    if (process.platform === "win32") {
      await execFileAsync("powershell", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${runtimeDir.replace(/'/g, "''")}' -Force`,
      ]);
    } else {
      await execFileAsync("unzip", ["-o", archivePath, "-d", runtimeDir]);
    }
  }

  const binaryPath = await findLlamaServerBinary(runtimeDir);
  if (!binaryPath) {
    throw new Error(
      `envoyhome.local_engine_download_failed: llama-server not found after extracting ${assetName}`,
    );
  }
  // Ensure extracted binary stayed inside the jail
  safeJoin(runtimeDir, binaryPath);
  if (process.platform !== "win32") {
    await chmod(binaryPath, 0o755);
  }
  return { binaryPath, assetName, sha256 };
}
