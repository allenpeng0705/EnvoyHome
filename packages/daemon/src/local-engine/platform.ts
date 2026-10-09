/** Resolve ggml-org/llama.cpp release asset for this host (Adapt EnvoyMesh). */

export type LocalAccel = "metal" | "cuda" | "cpu";

export interface LocalPlatform {
  os: "darwin" | "linux" | "win32";
  arch: "arm64" | "x64";
  accel: LocalAccel;
}

/** Pinned release — bump with smoke tests (same channel as EnvoyMesh Envoy Local). */
export const HOME_LLAMA_CPP_TAG = "b10331";

export function detectLocalPlatform(): LocalPlatform {
  const os =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "win32"
        ? "win32"
        : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  let accel: LocalAccel = "cpu";
  if (os === "darwin") accel = "metal";
  // CUDA detection is best-effort; CPU archive is the safe default on Linux/Windows.
  return { os, arch, accel };
}

export function llamaCppAssetName(platform: LocalPlatform, tag = HOME_LLAMA_CPP_TAG): string {
  if (platform.os === "darwin") {
    return platform.arch === "arm64"
      ? `llama-${tag}-bin-macos-arm64.tar.gz`
      : `llama-${tag}-bin-macos-x64.tar.gz`;
  }
  if (platform.os === "linux") {
    return platform.arch === "arm64"
      ? `llama-${tag}-bin-ubuntu-arm64.tar.gz`
      : `llama-${tag}-bin-ubuntu-x64.tar.gz`;
  }
  return `llama-${tag}-bin-win-cpu-x64.zip`;
}

export function llamaCppReleaseUrl(platform: LocalPlatform, tag = HOME_LLAMA_CPP_TAG): string {
  const name = llamaCppAssetName(platform, tag);
  return `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/${name}`;
}
