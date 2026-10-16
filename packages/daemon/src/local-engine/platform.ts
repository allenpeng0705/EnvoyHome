/** Resolve ggml-org/llama.cpp release asset for this host (Adapt EnvoyMesh). */

import { execFileSync } from "node:child_process";

export type LocalAccel = "metal" | "cuda" | "cpu";

export interface LocalPlatform {
  os: "darwin" | "linux" | "win32";
  arch: "arm64" | "x64";
  accel: LocalAccel;
}

/** Pinned release — bump with smoke tests (same channel as EnvoyMesh Envoy Local). */
export const HOME_LLAMA_CPP_TAG = "b10331";

/** CUDA toolkit channel used for Windows CUDA builds (+ matching cudart). */
export const HOME_LLAMA_CUDA_CHANNEL = "12.4" as const;

export function detectNvidiaGpu(): boolean {
  try {
    execFileSync("nvidia-smi", ["-L"], {
      stdio: "ignore",
      timeout: 3_000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

export function detectLocalPlatform(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { hasNvidia?: boolean },
): LocalPlatform {
  const os =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "win32"
        ? "win32"
        : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (os === "darwin") return { os, arch, accel: "metal" };
  if (env.ENVOYHOME_LOCAL_FORCE_CPU === "1") return { os, arch, accel: "cpu" };
  const hasNvidia = opts?.hasNvidia ?? detectNvidiaGpu();
  if (hasNvidia && (os === "win32" || os === "linux") && arch === "x64") {
    return { os, arch, accel: "cuda" };
  }
  return { os, arch, accel: "cpu" };
}

export interface LlamaCppReleaseAssets {
  /** Primary llama-server archive basename. */
  runtimeName: string;
  /** Windows CUDA needs matching cudart DLLs beside the binary. */
  cudartName?: string;
  /**
   * Effective offload backend for `-ngl`:
   * - metal / cuda → GPU layers
   * - cpu → CPU only
   *
   * On Linux + NVIDIA, official releases for this pin ship **Vulkan** (not a
   * dedicated CUDA zip); we still treat it as GPU accel for `-ngl`.
   */
  gpuOffload: boolean;
}

/**
 * Pick release assets for this host.
 * Windows+NVIDIA → CUDA 12.4 + cudart; Linux+NVIDIA → Vulkan (no CUDA zip in
 * this tag); else CPU / Metal macOS builds.
 */
export function resolveLlamaCppReleaseAssets(
  platform: LocalPlatform,
  tag = HOME_LLAMA_CPP_TAG,
): LlamaCppReleaseAssets {
  const { os, arch, accel } = platform;
  if (os === "darwin") {
    return {
      runtimeName:
        arch === "arm64"
          ? `llama-${tag}-bin-macos-arm64.tar.gz`
          : `llama-${tag}-bin-macos-x64.tar.gz`,
      gpuOffload: true,
    };
  }
  if (os === "win32" && arch === "x64" && accel === "cuda") {
    const ch = HOME_LLAMA_CUDA_CHANNEL;
    return {
      runtimeName: `llama-${tag}-bin-win-cuda-${ch}-x64.zip`,
      cudartName: `cudart-llama-bin-win-cuda-${ch}-x64.zip`,
      gpuOffload: true,
    };
  }
  if (os === "win32" && arch === "x64") {
    return {
      runtimeName: `llama-${tag}-bin-win-cpu-x64.zip`,
      gpuOffload: false,
    };
  }
  if (os === "win32" && arch === "arm64") {
    return {
      runtimeName: `llama-${tag}-bin-win-cpu-arm64.zip`,
      gpuOffload: false,
    };
  }
  if (os === "linux" && arch === "x64" && accel === "cuda") {
    // No official ubuntu-cuda zip for this pin — Vulkan build uses the GPU.
    return {
      runtimeName: `llama-${tag}-bin-ubuntu-vulkan-x64.tar.gz`,
      gpuOffload: true,
    };
  }
  if (os === "linux" && arch === "arm64") {
    return {
      runtimeName: `llama-${tag}-bin-ubuntu-arm64.tar.gz`,
      gpuOffload: false,
    };
  }
  return {
    runtimeName: `llama-${tag}-bin-ubuntu-x64.tar.gz`,
    gpuOffload: false,
  };
}

/** @deprecated Prefer {@link resolveLlamaCppReleaseAssets}. */
export function llamaCppAssetName(platform: LocalPlatform, tag = HOME_LLAMA_CPP_TAG): string {
  return resolveLlamaCppReleaseAssets(platform, tag).runtimeName;
}

export function llamaCppReleaseUrl(platform: LocalPlatform, tag = HOME_LLAMA_CPP_TAG): string {
  const name = llamaCppAssetName(platform, tag);
  return `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/${name}`;
}

export function llamaCppReleaseUrlForAsset(assetName: string, tag = HOME_LLAMA_CPP_TAG): string {
  return `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/${assetName}`;
}
