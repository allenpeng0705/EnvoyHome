/** Curated embedding GGUFs — Adapt EnvoyMesh envoy-local-embed-catalog (Knowledge-RAG §5.4). */

export interface HomeEmbedCatalogModel {
  id: string;
  label: string;
  description: string;
  fileName: string;
  url: string;
  approxBytes: number;
  pooling: "last" | "mean";
  /** Optional pinned sha256 (hex). Absent → TOFU beside the GGUF. */
  sha256?: string;
}

export const DEFAULT_HOME_EMBED_MODEL_ID = "qwen3-embedding-0.6b-q8_0";

export const DEFAULT_HOME_EMBED_MODEL: HomeEmbedCatalogModel = {
  id: DEFAULT_HOME_EMBED_MODEL_ID,
  label: "Qwen3 Embedding 0.6B (Q8_0)",
  description: "Default local text embedding for Knowledge / KnowYou RAG (~0.6 GB).",
  fileName: "Qwen3-Embedding-0.6B-Q8_0.gguf",
  // Pin revision + sha256 (HF commit 370f27d) — verify before spawn; mismatch quarantines *.bad-sha256.
  url: "https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/370f27d7550e0def9b39c1f16d3fbaa13aa67728/Qwen3-Embedding-0.6B-Q8_0.gguf",
  approxBytes: 639_150_592,
  pooling: "last",
  sha256: "06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439",
};

export const QWEN3_EMBEDDING_4B_MODEL: HomeEmbedCatalogModel = {
  id: "qwen3-embedding-4b-q4_k_m",
  label: "Qwen3 Embedding 4B (Q4_K_M)",
  description: "Higher-quality multilingual embedder (~2.5 GB).",
  fileName: "Qwen3-Embedding-4B-Q4_K_M.gguf",
  url: "https://huggingface.co/Qwen/Qwen3-Embedding-4B-GGUF/resolve/f680c213b8673d1ada99915b5b4c02480c3e6643/Qwen3-Embedding-4B-Q4_K_M.gguf",
  approxBytes: 2_500_000_000,
  pooling: "last",
  sha256: "2b0cf8f17b4c723c27303015383c27ec4bf2d8314bb677d05e920dd70bb0f16b",
};

export const HOME_EMBED_CURATED_MODELS: readonly HomeEmbedCatalogModel[] = [
  DEFAULT_HOME_EMBED_MODEL,
  QWEN3_EMBEDDING_4B_MODEL,
];

export function getHomeEmbedCatalogModel(id: string | undefined): HomeEmbedCatalogModel | undefined {
  if (!id) return undefined;
  return HOME_EMBED_CURATED_MODELS.find((m) => m.id === id);
}

export function embedPoolingForModel(modelId: string | undefined): "last" | "mean" {
  if (!modelId) return "last";
  if (modelId.includes("jina") || modelId.includes("nomic")) return "mean";
  return "last";
}
