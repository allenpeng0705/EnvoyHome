// @envoyhome/providers — model providers + mix router (B6).

export {
  type ChatMessage,
  type CompletionRequest,
  type CompletionResult,
  type ModelProvider,
  type ProviderKind,
  type ProviderSecretStore,
  MemorySecretStore,
} from "./provider.js";

export { createOpenAICompatProvider, type OpenAICompatOptions } from "./openai-compat.js";
export {
  createAnthropicCompatProvider,
  type AnthropicCompatOptions,
  __anthropicBodyForTests,
} from "./anthropic-compat.js";
export { createLlamaCppProvider } from "./llama-cpp.js";
export { joinProviderUrl } from "./url.js";
export {
  MixRouter,
  type MixPolicy,
  type ModelMode,
  type PlacementFilter,
  type Placement,
  type RouteReason,
  type ProviderSlot,
  type PickDecision,
  type NeedClass,
  type NeedClassRule,
  type ModelProfile,
} from "./mix-router.js";
export {
  classifyNeedClass,
  DEFAULT_NEED_CLASS_RULES,
} from "./need-class.js";
export {
  rankByNeedClass,
  type LatencyClass,
  type ScoredCandidate,
} from "./model-score.js";
export { UsageTracker, type UsageCounters } from "./usage.js";
