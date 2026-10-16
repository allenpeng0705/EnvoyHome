/**
 * Curated GGUF allowlist for EnvoyHome Local (Adapt EnvoyMesh envoy-local-catalog).
 * Models are never packaged — URLs are post-install HTTPS downloads.
 */

export interface HomeLocalCatalogModel {
  id: string;
  label: string;
  description: string;
  fileName: string;
  /** Canonical Hugging Face resolve URL. */
  url: string;
  approxBytes: number;
  family: string;
  sizeClass: string;
  quant: string;
  /** llama-server `--chat-template` when required (e.g. gemma). */
  chatTemplate?: string;
}

export const HOME_LOCAL_DEFAULT_MODEL = {
  id: "qwen3.5-0.8b-q4_k_m",
  fileName: "Qwen3.5-0.8B-Q4_K_M.gguf",
  url: "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
} as const;

/** Edge instruct allowlist (Qwen3.5 + Gemma 4 + Llama 3.2 dense). */
export const HOME_LOCAL_CURATED_MODELS: readonly HomeLocalCatalogModel[] = [
  {
    id: HOME_LOCAL_DEFAULT_MODEL.id,
    label: "Qwen3.5 0.8B (Q4_K_M)",
    description: "Tiny Qwen3.5 — low-RAM / CPU-only. First-enable usually picks a larger tier.",
    fileName: HOME_LOCAL_DEFAULT_MODEL.fileName,
    url: HOME_LOCAL_DEFAULT_MODEL.url,
    approxBytes: 532_000_000,
    family: "qwen3.5",
    sizeClass: "0.8b",
    quant: "q4_k_m",
  },
  {
    id: "qwen3.5-2b-q4_k_m",
    label: "Qwen3.5 2B (Q4_K_M)",
    description: "Qwen3.5 2B Q4 — good CPU / mid-RAM pick between tiny and 4B.",
    fileName: "Qwen3.5-2B-Q4_K_M.gguf",
    url: "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf",
    approxBytes: 1_280_000_000,
    family: "qwen3.5",
    sizeClass: "2b",
    quant: "q4_k_m",
  },
  {
    id: "qwen3.5-4b-q4_k_m",
    label: "Qwen3.5 4B (Q4_K_M)",
    description: "Qwen3.5 4B Q4 — typical pick for 14–24 GB Metal/CUDA and strong CPU boxes.",
    fileName: "Qwen3.5-4B-Q4_K_M.gguf",
    url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf",
    approxBytes: 2_740_000_000,
    family: "qwen3.5",
    sizeClass: "4b",
    quant: "q4_k_m",
  },
  {
    id: "qwen3.5-9b-q4_k_m",
    label: "Qwen3.5 9B (Q4_K_M)",
    description: "Qwen3.5 9B Q4 — mid tier when you have ~24 GB+ unified/VRAM.",
    fileName: "Qwen3.5-9B-Q4_K_M.gguf",
    url: "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf",
    approxBytes: 5_500_000_000,
    family: "qwen3.5",
    sizeClass: "9b",
    quant: "q4_k_m",
  },
  {
    id: "gemma-4-e2b-it-q4_k_m",
    label: "Gemma 4 E2B IT (Q4_K_M)",
    description: "Google Gemma 4 E2B — compact (~2B-class). Also-fits alongside Qwen.",
    fileName: "google_gemma-4-E2B-it-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf",
    approxBytes: 3_500_000_000,
    chatTemplate: "gemma",
    family: "gemma4",
    sizeClass: "e2b",
    quant: "q4_k_m",
  },
  {
    id: "gemma-4-e4b-it-q4_k_m",
    label: "Gemma 4 E4B IT (Q4_K_M)",
    description: "Google Gemma 4 E4B — stronger Gemma 4 (~4B-class) on larger machines.",
    fileName: "google_gemma-4-E4B-it-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/google_gemma-4-E4B-it-GGUF/resolve/main/google_gemma-4-E4B-it-Q4_K_M.gguf",
    approxBytes: 5_400_000_000,
    chatTemplate: "gemma",
    family: "gemma4",
    sizeClass: "e4b",
    quant: "q4_k_m",
  },
  {
    id: "llama-3.2-3b-instruct-q4_k_m",
    label: "Llama 3.2 3B Instruct (Q4_K_M)",
    description: "Meta Llama 3.2 dense 3B — edge Llama (not Llama 4 MoE).",
    fileName: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    approxBytes: 2_000_000_000,
    family: "llama3.2",
    sizeClass: "3b",
    quant: "q4_k_m",
  },
];

export function getHomeLocalCatalogModel(modelId: string): HomeLocalCatalogModel | undefined {
  const id = modelId.trim();
  return HOME_LOCAL_CURATED_MODELS.find((m) => m.id === id);
}

export function getHomeLocalCatalogModelByFileName(
  fileName: string,
): HomeLocalCatalogModel | undefined {
  const name = fileName.trim().toLowerCase();
  if (!name) return undefined;
  return HOME_LOCAL_CURATED_MODELS.find((m) => m.fileName.toLowerCase() === name);
}

export function formatApproxBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${Math.round(gb * 10) / 10} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}
