export {
  HOME_LOCAL_ENGINE_PORT,
  OLLAMA_DEFAULT_PORT,
  HOME_LOCAL_ENGINE_BASE,
  OLLAMA_DEFAULT_BASE,
  HOME_LOCAL_PROVIDER_ID,
  OLLAMA_PROVIDER_ID,
} from "./ports.js";
export { probeOpenAiModels, type ProbeResult } from "./probe.js";
export { buildHomeLlamaServerArgs } from "./server-args.js";
export {
  detectLocalPlatform,
  detectNvidiaGpu,
  HOME_LLAMA_CPP_TAG,
  HOME_LLAMA_CUDA_CHANNEL,
  llamaCppAssetName,
  llamaCppReleaseUrl,
  llamaCppReleaseUrlForAsset,
  resolveLlamaCppReleaseAssets,
  type LocalPlatform,
  type LocalAccel,
  type LlamaCppReleaseAssets,
} from "./platform.js";
export {
  HOME_LOCAL_CURATED_MODELS,
  HOME_LOCAL_DEFAULT_MODEL,
  getHomeLocalCatalogModel,
  getHomeLocalCatalogModelByFileName,
  formatApproxBytes,
  type HomeLocalCatalogModel,
} from "./catalog.js";
export {
  HOME_LOCAL_MODEL_TIER_IDS,
  detectHomeLocalHardware,
  recommendHomeLocalModel,
  buildHomeLocalRecommendation,
  detectNvidiaVramBytes,
  type HomeLocalHardwareInfo,
  type HomeLocalModelRecommendation,
  type HomeLocalModelPick,
} from "./hw.js";
export {
  LocalEngineService,
  type LocalEngineConfig,
  type LocalEngineStatus,
  type LocalEngineMode,
  type LocalEngineEnableResult,
  type LocalEngineDisableResult,
  type LocalEngineRecommendationWire,
} from "./service.js";
export { assertLocalEngineBaseUrl } from "./url-allow.js";
export {
  assertHuggingFaceGgufUrl,
  assertHfRepoId,
  hfResolveUrl,
  searchHuggingFaceGgufRepos,
  listHuggingFaceGgufFiles,
  downloadHuggingFaceGgufUrl,
  type HfGgufRepoHit,
  type HfGgufFile,
} from "./hf.js";
export {
  ModelDownloadManager,
  type LocalModelDownloadJob,
  type LocalModelDownloadStatus,
} from "./download-manager.js";
export { resolveLocalModelPath, resolveLocalBinaryPath } from "./path-jail.js";
export {
  assertSafeArchiveEntry,
  verifyArchiveSha256,
  HOME_LLAMA_CPP_SHA256,
} from "./integrity.js";
export {
  runtimeAccelMismatch,
  readRuntimeAccelMarker,
  findLlamaServerBinary,
} from "./download-runtime.js";
