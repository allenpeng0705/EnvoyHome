/**
 * Hardware probe + model recommendation for EnvoyHome Local
 * (Adapt EnvoyMesh apps/node/src/envoy-local-hw.ts).
 */
import { execFileSync } from "node:child_process";
import { totalmem } from "node:os";
import {
  HOME_LOCAL_DEFAULT_MODEL,
  getHomeLocalCatalogModel,
  type HomeLocalCatalogModel,
} from "./catalog.js";
import { detectLocalPlatform, type LocalAccel, type LocalPlatform } from "./platform.js";

/** Curated model ids used by the recommender (must exist in the catalog). */
export const HOME_LOCAL_MODEL_TIER_IDS = {
  tiny: HOME_LOCAL_DEFAULT_MODEL.id,
  qwen2b: "qwen3.5-2b-q4_k_m",
  small: "qwen3.5-4b-q4_k_m",
  medium: "qwen3.5-9b-q4_k_m",
  gemmaE2b: "gemma-4-e2b-it-q4_k_m",
  gemmaE4b: "gemma-4-e4b-it-q4_k_m",
} as const;

export interface HomeLocalHardwareInfo {
  accel: LocalAccel;
  systemRamBytes: number;
  gpuVramBytes?: number;
  effectiveMemoryBytes: number;
  /** Short label for Settings, e.g. "Metal · 36 GB unified". */
  summary: string;
}

export interface HomeLocalModelPick {
  id: string;
  label: string;
  description: string;
  fileName: string;
  url: string;
  approxBytes: number;
  installed: boolean;
}

export interface HomeLocalModelRecommendation {
  modelId: string;
  alsoRecommendedModelIds: string[];
  reason: string;
  hardware: HomeLocalHardwareInfo;
  /** Primary + also-fits resolved against the catalog (for wire/UI). */
  primary: HomeLocalModelPick;
  also: HomeLocalModelPick[];
}

const GB = 1024 * 1024 * 1024;

export function detectNvidiaVramBytes(): number | undefined {
  try {
    const out = execFileSync(
      "nvidia-smi",
      ["--query-gpu=memory.total", "--format=csv,noheader,nounits"],
      { encoding: "utf8", timeout: 3_000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    const first = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!first) return undefined;
    const mib = Number(first);
    if (!Number.isFinite(mib) || mib <= 0) return undefined;
    return Math.round(mib * 1024 * 1024);
  } catch {
    return undefined;
  }
}

function formatGb(bytes: number): string {
  return String(Math.round((bytes / GB) * 10) / 10);
}

function also(...ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function detectHomeLocalHardware(
  platform: LocalPlatform = detectLocalPlatform(),
  opts?: { systemRamBytes?: number; gpuVramBytes?: number | null },
): HomeLocalHardwareInfo {
  const systemRamBytes = opts?.systemRamBytes ?? totalmem();
  const gpuVramBytes =
    opts?.gpuVramBytes === null
      ? undefined
      : (opts?.gpuVramBytes ??
        (platform.accel === "cuda" ? detectNvidiaVramBytes() : undefined));

  let effectiveMemoryBytes: number;
  let summary: string;
  const ramGb = formatGb(systemRamBytes);

  if (platform.accel === "metal") {
    effectiveMemoryBytes = systemRamBytes;
    summary = `Metal · ${ramGb} GB unified`;
  } else if (platform.accel === "cuda") {
    // Linux NVIDIA uses the Vulkan llama.cpp build (no ubuntu-cuda zip for the pin).
    const accelLabel = platform.os === "linux" ? "NVIDIA · Vulkan" : "CUDA";
    if (gpuVramBytes && gpuVramBytes > 0) {
      effectiveMemoryBytes = gpuVramBytes;
      summary = `${accelLabel} · ${formatGb(gpuVramBytes)} GB VRAM · ${ramGb} GB RAM`;
    } else {
      effectiveMemoryBytes = Math.min(systemRamBytes, 8 * GB);
      summary = `${accelLabel} · VRAM unknown · ${ramGb} GB RAM`;
    }
  } else {
    effectiveMemoryBytes = Math.floor(systemRamBytes * 0.75);
    summary = `CPU · ${ramGb} GB RAM`;
  }

  return {
    accel: platform.accel,
    systemRamBytes,
    ...(gpuVramBytes != null ? { gpuVramBytes } : {}),
    effectiveMemoryBytes,
    summary,
  };
}

/**
 * Pick curated edge models from effective memory (Mesh thresholds).
 * Primary stays Qwen3.5; Gemma 4 listed as also-fits.
 */
export function recommendHomeLocalModel(
  hardware: HomeLocalHardwareInfo,
): Omit<HomeLocalModelRecommendation, "primary" | "also"> {
  const mem = hardware.effectiveMemoryBytes;
  const { tiny, qwen2b, small, medium, gemmaE2b, gemmaE4b } = HOME_LOCAL_MODEL_TIER_IDS;
  const isAccel = hardware.accel === "metal" || hardware.accel === "cuda";

  if (isAccel) {
    const isMetal = hardware.accel === "metal";
    const nineBThreshold = isMetal ? 32 * GB : 24 * GB;
    if (mem >= nineBThreshold) {
      return {
        modelId: medium,
        alsoRecommendedModelIds: also(small, gemmaE4b, gemmaE2b),
        reason: `${hardware.summary} — plenty of memory for Qwen3.5 9B; 4B and Gemma 4 also fit.`,
        hardware,
      };
    }
    if (mem >= 14 * GB) {
      return {
        modelId: small,
        alsoRecommendedModelIds: also(medium, gemmaE4b, gemmaE2b, qwen2b),
        reason: `${hardware.summary} — recommending Qwen3.5 4B; 9B and Gemma 4 E2B/E4B also fit (9B may be tight).`,
        hardware,
      };
    }
    if (mem >= 8 * GB) {
      return {
        modelId: small,
        alsoRecommendedModelIds: also(qwen2b, gemmaE2b, tiny),
        reason: `${hardware.summary} — recommending Qwen3.5 4B (tight); 2B and Gemma 4 E2B also fit.`,
        hardware,
      };
    }
    if (mem >= 5 * GB) {
      return {
        modelId: qwen2b,
        alsoRecommendedModelIds: also(tiny, gemmaE2b),
        reason: `${hardware.summary} — recommending Qwen3.5 2B; tiny and Gemma 4 E2B also fit.`,
        hardware,
      };
    }
    return {
      modelId: tiny,
      alsoRecommendedModelIds: also(qwen2b),
      reason: `${hardware.summary} — recommending tiny Qwen3.5 0.8B.`,
      hardware,
    };
  }

  if (mem >= 18 * GB) {
    return {
      modelId: small,
      alsoRecommendedModelIds: also(qwen2b, gemmaE2b, gemmaE4b, tiny),
      reason: `${hardware.summary} — recommending Qwen3.5 4B on CPU; 2B and Gemma 4 also fit.`,
      hardware,
    };
  }
  if (mem >= 10 * GB) {
    return {
      modelId: qwen2b,
      alsoRecommendedModelIds: also(small, gemmaE2b, tiny),
      reason: `${hardware.summary} — recommending Qwen3.5 2B on CPU; 4B and Gemma 4 E2B also fit.`,
      hardware,
    };
  }
  if (mem >= 5 * GB) {
    return {
      modelId: qwen2b,
      alsoRecommendedModelIds: also(tiny, gemmaE2b),
      reason: `${hardware.summary} — recommending Qwen3.5 2B on CPU.`,
      hardware,
    };
  }
  return {
    modelId: tiny,
    alsoRecommendedModelIds: also(qwen2b),
    reason: `${hardware.summary} — recommending tiny Qwen3.5 0.8B on CPU.`,
    hardware,
  };
}

function toPick(entry: HomeLocalCatalogModel, installedNames: Set<string>): HomeLocalModelPick {
  return {
    id: entry.id,
    label: entry.label,
    description: entry.description,
    fileName: entry.fileName,
    url: entry.url,
    approxBytes: entry.approxBytes,
    installed: installedNames.has(entry.fileName.toLowerCase()),
  };
}

/** Full recommendation with catalog rows + installed flags. */
export function buildHomeLocalRecommendation(
  installedFileNames: string[],
  opts?: {
    platform?: LocalPlatform;
    systemRamBytes?: number;
    gpuVramBytes?: number | null;
  },
): HomeLocalModelRecommendation {
  const platform = opts?.platform ?? detectLocalPlatform();
  const hardware = detectHomeLocalHardware(platform, {
    ...(opts?.systemRamBytes != null ? { systemRamBytes: opts.systemRamBytes } : {}),
    ...(opts?.gpuVramBytes !== undefined ? { gpuVramBytes: opts.gpuVramBytes } : {}),
  });
  const raw = recommendHomeLocalModel(hardware);
  const installed = new Set(installedFileNames.map((n) => n.toLowerCase()));
  const primaryEntry = getHomeLocalCatalogModel(raw.modelId);
  if (!primaryEntry) {
    throw new Error(`envoyhome.local_engine_catalog: missing ${raw.modelId}`);
  }
  const also = raw.alsoRecommendedModelIds
    .map((id) => getHomeLocalCatalogModel(id))
    .filter((m): m is HomeLocalCatalogModel => Boolean(m))
    .map((m) => toPick(m, installed));
  return {
    ...raw,
    primary: toPick(primaryEntry, installed),
    also,
  };
}
