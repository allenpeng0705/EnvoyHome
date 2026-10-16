// Download + extract pinned llama-server (never bundled in the app installer).

import { createWriteStream } from "node:fs";
import { mkdir, chmod, access, readdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  detectLocalPlatform,
  HOME_LLAMA_CPP_TAG,
  llamaCppReleaseUrlForAsset,
  resolveLlamaCppReleaseAssets,
  type LocalAccel,
  type LocalPlatform,
} from "./platform.js";
import {
  assertTarEntriesSafe,
  assertZipEntriesSafe,
  verifyArchiveSha256,
} from "./integrity.js";
import { safeJoin } from "../fs-jail.js";

const execFileAsync = promisify(execFile);

const ACCEL_MARKER = "runtime-accel.json";

export interface RuntimeAccelMarker {
  accel: LocalAccel;
  runtimeName: string;
  gpuOffload: boolean;
  tag: string;
}

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

export async function readRuntimeAccelMarker(
  runtimeDir: string,
): Promise<RuntimeAccelMarker | null> {
  try {
    const raw = JSON.parse(await readFile(join(runtimeDir, ACCEL_MARKER), "utf8")) as RuntimeAccelMarker;
    if (!raw?.accel || !raw?.runtimeName) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * True when an on-disk runtime exists but was built for a different accel
 * (e.g. CPU zip while this host now has NVIDIA → should re-download CUDA/Vulkan).
 *
 * Missing marker: treat as mismatch on NVIDIA (`accel === "cuda"`) so pre-marker
 * CPU archives upgrade once. Metal unmarked installs are kept (always Metal).
 */
export async function runtimeAccelMismatch(
  runtimeDir: string,
  platform: LocalPlatform = detectLocalPlatform(),
): Promise<boolean> {
  const want = resolveLlamaCppReleaseAssets(platform);
  const marker = await readRuntimeAccelMarker(runtimeDir);
  if (!marker) {
    return platform.accel === "cuda" && want.gpuOffload;
  }
  return marker.runtimeName !== want.runtimeName || marker.accel !== platform.accel;
}

async function downloadOneArchive(
  runtimeDir: string,
  assetName: string,
  tag: string,
  fetchImpl: typeof fetch,
  expectedSha256?: string,
): Promise<{ archivePath: string; sha256: string }> {
  const url = llamaCppReleaseUrlForAsset(assetName, tag);
  const archivePath = join(runtimeDir, assetName);
  const res = await fetchImpl(url);
  if (!res.ok || !res.body) {
    throw new Error(`envoyhome.local_engine_download_failed: HTTP ${res.status} for ${assetName}`);
  }
  const nodeStream = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  await pipeline(nodeStream, createWriteStream(archivePath));
  const sha256 = await verifyArchiveSha256(archivePath, assetName, {
    ...(expectedSha256 ? { expectedSha256 } : {}),
    tofuDir: runtimeDir,
  });
  return { archivePath, sha256 };
}

async function extractArchive(archivePath: string, runtimeDir: string): Promise<void> {
  if (archivePath.endsWith(".tar.gz")) {
    await assertTarEntriesSafe(archivePath);
    await execFileAsync("tar", ["-xzf", archivePath, "-C", runtimeDir]);
    return;
  }
  if (archivePath.endsWith(".zip")) {
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
    return;
  }
  throw new Error(`envoyhome.local_engine_download_failed: unsupported archive ${archivePath}`);
}

/**
 * Download the pinned llama.cpp release archive(s) and extract into runtimeDir.
 * Verifies sha256 (pinned / env / TOFU) and refuses zip-slip entries.
 * Windows CUDA also pulls matching cudart DLLs.
 */
export async function downloadAndExtractLlamaServer(
  runtimeDir: string,
  opts?: {
    fetchImpl?: typeof fetch;
    tag?: string;
    expectedSha256?: string;
    platform?: LocalPlatform;
  },
): Promise<{
  binaryPath: string;
  assetName: string;
  sha256: string;
  accel: LocalAccel;
  gpuOffload: boolean;
}> {
  const platform = opts?.platform ?? detectLocalPlatform();
  const tag = opts?.tag ?? HOME_LLAMA_CPP_TAG;
  const assets = resolveLlamaCppReleaseAssets(platform, tag);
  await mkdir(runtimeDir, { recursive: true });

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const primary = await downloadOneArchive(
    runtimeDir,
    assets.runtimeName,
    tag,
    fetchImpl,
    opts?.expectedSha256,
  );
  await extractArchive(primary.archivePath, runtimeDir);

  if (assets.cudartName) {
    const cudart = await downloadOneArchive(runtimeDir, assets.cudartName, tag, fetchImpl);
    await extractArchive(cudart.archivePath, runtimeDir);
  }

  const binaryPath = await findLlamaServerBinary(runtimeDir);
  if (!binaryPath) {
    throw new Error(
      `envoyhome.local_engine_download_failed: llama-server not found after extracting ${assets.runtimeName}`,
    );
  }
  safeJoin(runtimeDir, binaryPath);
  if (process.platform !== "win32") {
    await chmod(binaryPath, 0o755);
  }

  const marker: RuntimeAccelMarker = {
    accel: platform.accel,
    runtimeName: assets.runtimeName,
    gpuOffload: assets.gpuOffload,
    tag,
  };
  await writeFile(join(runtimeDir, ACCEL_MARKER), JSON.stringify(marker, null, 2), "utf8");

  return {
    binaryPath,
    assetName: assets.runtimeName,
    sha256: primary.sha256,
    accel: platform.accel,
    gpuOffload: assets.gpuOffload,
  };
}
