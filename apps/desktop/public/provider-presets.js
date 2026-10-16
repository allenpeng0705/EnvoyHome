/**
 * Curated Settings → LLM → Model Provider presets.
 * Adapt EnvoyMesh `packages/api/src/model-provider-presets.ts`.
 *
 * Model ids + routing profiles verified against vendor docs (2026-10-12).
 * Refresh periodically: bump PRESET_CATALOG_ASOF and re-check context / params / vision.
 * Lists cover the current chat/text catalog across price tiers (not only flagships).
 * Free-text model id is always allowed in the UI (Other).
 *
 * Routing props (Design §8.2 Smart Routing scorer):
 *   paramCountB, costRank (named cost tiers below), contextTokens, supportsVision
 * Tools are always assumed supported.
 * supportsVision defaults **off** — set true only when the vendor documents image input.
 *
 * Cost tiers = marginal expense for Smart Routing (quality first, then cheaper):
 *   Free / Subscription included ≈ already paid → prefer using these more
 *   Budget…Flagship = pay-per-use relative price (API prepaid / usage)
 *
 * Curated presets default to Subscription included; user may switch to a
 * pay-per-use tier on the Advanced card when the account is usage-billed.
 *
 * paramCountB: published total (MoE) when known; otherwise a capability-class proxy
 * (vendors often omit sizes). Used by the scorer’s size buckets, not as marketing copy.
 */

/** @typedef {"local_llama_cpp"|"local_openai_compat"|"cloud_openai_compat"|"cloud_anthropic_compat"} WireKind */

/**
 * @typedef {object} CostTier
 * @property {string} id
 * @property {number} costRank
 * @property {string} labelKey
 */

/**
 * @typedef {object} ModelProfile
 * @property {string} id — wire model id sent to the provider API
 * @property {string} [label] — UI display (defaults to id); use when product name ≠ API id
 * @property {number} [paramCountB]
 * @property {number} [costRank]
 * @property {number} [contextTokens]
 * @property {boolean} [supportsVision]
 */

/**
 * @typedef {object} ProviderPreset
 * @property {string} id
 * @property {string} label
 * @property {WireKind} kind
 * @property {string} defaultProviderId
 * @property {string} [baseUrl]
 * @property {(string|ModelProfile)[]} models
 * @property {boolean} needsSecret
 * @property {boolean} [endpointEditable]
 * @property {string} [endpointPlaceholder]
 * @property {string} [hint]
 * @property {boolean} [localOnly]
 */

/** ISO date of last catalog / property pass — bump when refreshing. */
export const PRESET_CATALOG_ASOF = "2026-10-12e";

/**
 * Named cost levels → costRank (0 cheap … 100 expensive).
 * Wire still stores numeric costRank; UI shows these labels.
 *
 * Subscription included (monthly/yearly already paid): near-zero *marginal* cost,
 * so Smart Routing prefers it over usage-billed APIs when quality is equal.
 * Default for curated presets; switch to Budget…Flagship when pay-per-use.
 */
export const COST_TIERS = /** @type {CostTier[]} */ ([
  { id: "free", costRank: 0, labelKey: "models.costFree" },
  { id: "subscription", costRank: 5, labelKey: "models.costSubscription" },
  { id: "budget", costRank: 20, labelKey: "models.costBudget" },
  { id: "standard", costRank: 45, labelKey: "models.costStandard" },
  { id: "premium", costRank: 75, labelKey: "models.costPremium" },
  { id: "flagship", costRank: 100, labelKey: "models.costFlagship" },
]);

/** Default for curated cloud presets (user can override to pay-per-use). */
const COST_SUBSCRIPTION = 5;

/** Common context windows (UI select + catalog). */
const CTX_128K = 128_000;
const CTX_200K = 200_000;
const CTX_256K = 256_000;
const CTX_400K = 400_000;
const CTX_500K = 500_000;
const CTX_512K = 512_000;
const CTX_1M = 1_000_000;
/** OpenAI GPT-5.4+ / GPT-6 documented window. */
const CTX_1M05 = 1_050_000;
const CTX_2M = 2_000_000;
const CTX_10M = 10_000_000;

/** MiniMax M2.x official window. */
const CTX_MINIMAX_M2 = 204_800;

/**
 * @param {string} id
 * @param {Omit<ModelProfile,"id"|"supportsVision"> & { supportsVision?: boolean }} [props]
 */
function m(id, props = {}) {
  const { supportsVision, label, ...rest } = props;
  return {
    id,
    ...(label ? { label } : {}),
    ...rest,
    // Catalog may mark vision-capable models; Add Provider UI still defaults the checkbox off.
    supportsVision: supportsVision === true,
  };
}

/** Snap a stored costRank to the nearest named tier value. */
export function costRankSelectValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  let best = COST_TIERS[0];
  let bestDist = Math.abs(n - best.costRank);
  for (const tier of COST_TIERS) {
    const d = Math.abs(n - tier.costRank);
    if (d < bestDist) {
      best = tier;
      bestDist = d;
    }
  }
  return String(best.costRank);
}

/** @param {number|string|null|undefined} raw @returns {CostTier|undefined} */
export function costTierForRank(raw) {
  const sel = costRankSelectValue(raw);
  if (sel === "") return undefined;
  return COST_TIERS.find((t) => String(t.costRank) === sel);
}

/**
 * Shared MiniMax chat catalog (CN + intl).
 * Docs: M3 / M3.1-Flash = 1M + multimodal; M2.x = 204,800 text/tools only.
 * Params: M2 = 230B MoE (HF); M3 = ~428B MoE (HF). M3.1-Flash unpublished → M3-class.
 */
const MINIMAX_MODELS = [
  // Default pick = M3 (generally available). M3.1-Flash-Preview is M Plan / MiniMax Code only.
  m("MiniMax-M3", {
    label: "MiniMax-M3 (1M, multimodal)",
    paramCountB: 428,
    costRank: COST_SUBSCRIPTION,
    contextTokens: CTX_1M,
    supportsVision: true,
  }),
  m("MiniMax-M3.1-Flash-Preview", {
    label: "MiniMax-M3.1-Flash-Preview (1M, multimodal, M Plan)",
    paramCountB: 428,
    costRank: COST_SUBSCRIPTION,
    contextTokens: CTX_1M,
    supportsVision: true,
  }),
  m("MiniMax-M2.7", { paramCountB: 230, costRank: COST_SUBSCRIPTION, contextTokens: CTX_MINIMAX_M2 }),
  m("MiniMax-M2.7-highspeed", { paramCountB: 230, costRank: COST_SUBSCRIPTION, contextTokens: CTX_MINIMAX_M2 }),
  m("MiniMax-M2.5", { paramCountB: 230, costRank: COST_SUBSCRIPTION, contextTokens: CTX_MINIMAX_M2 }),
  m("MiniMax-M2.5-highspeed", { paramCountB: 230, costRank: COST_SUBSCRIPTION, contextTokens: CTX_MINIMAX_M2 }),
  m("MiniMax-M2.1", { paramCountB: 230, costRank: COST_SUBSCRIPTION, contextTokens: CTX_MINIMAX_M2 }),
  m("MiniMax-M2.1-highspeed", { paramCountB: 230, costRank: COST_SUBSCRIPTION, contextTokens: CTX_MINIMAX_M2 }),
  m("MiniMax-M2", { paramCountB: 230, costRank: COST_SUBSCRIPTION, contextTokens: CTX_MINIMAX_M2 }),
];

/**
 * Shared Kimi / Moonshot chat catalog (CN + intl).
 * platform.kimi.ai: kimi-k3 = 1M + vision; k2.6 / k2.7-code* = 256K + vision.
 * Params: K3 2.8T (HF); K2.6 / K2.7-code ≈ 1T class.
 */
const MOONSHOT_MODELS = [
  m("kimi-k3", {
    label: "Kimi K3 (kimi-k3)",
    paramCountB: 2800,
    costRank: COST_SUBSCRIPTION,
    contextTokens: CTX_1M,
    supportsVision: true,
  }),
  m("kimi-k2.6", {
    label: "Kimi K2.6 (kimi-k2.6)",
    paramCountB: 1000,
    costRank: COST_SUBSCRIPTION,
    contextTokens: CTX_256K,
    supportsVision: true,
  }),
  m("kimi-k2.7-code", {
    label: "Kimi K2.7 Code (kimi-k2.7-code)",
    paramCountB: 1000,
    costRank: COST_SUBSCRIPTION,
    contextTokens: CTX_256K,
    supportsVision: true,
  }),
  m("kimi-k2.7-code-highspeed", {
    label: "Kimi K2.7 Code Highspeed",
    paramCountB: 1000,
    costRank: COST_SUBSCRIPTION,
    contextTokens: CTX_256K,
    supportsVision: true,
  }),
];

/** @type {ProviderPreset[]} */
export const PROVIDER_PRESETS = [
  {
    id: "minimax-cn",
    label: "MiniMax CN",
    kind: "cloud_openai_compat",
    defaultProviderId: "minimax-cn",
    baseUrl: "https://api.minimaxi.com/v1",
    models: MINIMAX_MODELS,
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://api.minimaxi.com/v1",
    hint: "M3.1-Flash-Preview is M Plan / MiniMax Code only. M2.x are text/tools (no vision).",
  },
  {
    id: "minimax",
    label: "MiniMax",
    kind: "cloud_openai_compat",
    defaultProviderId: "minimax",
    baseUrl: "https://api.minimax.io/v1",
    models: MINIMAX_MODELS,
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://api.minimax.io/v1",
    hint: "M3.1-Flash-Preview is M Plan / MiniMax Code only. M2.x are text/tools (no vision).",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "cloud_anthropic_compat",
    defaultProviderId: "anthropic",
    baseUrl: "https://api.anthropic.com",
    models: [
      // Context: 5.x + Opus/Sonnet 4.6+ = 1M; Opus/Sonnet/Haiku 4.5 = 200K. All: text+image.
      // paramCountB = capability proxy (Anthropic does not publish sizes).
      // Current lineup first (platform.claude.com models overview), then legacy.
      m("claude-opus-5-5", {
        label: "Claude Opus 5.5",
        paramCountB: 200,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("claude-fable-5-1", {
        label: "Claude Fable 5.1",
        paramCountB: 250,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("claude-sonnet-5-5", {
        label: "Claude Sonnet 5.5",
        paramCountB: 100,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("claude-haiku-5-5", {
        label: "Claude Haiku 5.5",
        paramCountB: 20,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("claude-fable-5", { label: "Claude Fable 5 (legacy)", paramCountB: 250, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M, supportsVision: true }),
      m("claude-opus-5", { label: "Claude Opus 5 (legacy)", paramCountB: 200, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M, supportsVision: true }),
      m("claude-sonnet-5", { label: "Claude Sonnet 5 (legacy)", paramCountB: 100, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M, supportsVision: true }),
      m("claude-opus-4-8", { label: "Claude Opus 4.8 (legacy)", paramCountB: 200, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M, supportsVision: true }),
      m("claude-opus-4-7", { label: "Claude Opus 4.7 (legacy)", paramCountB: 200, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M, supportsVision: true }),
      m("claude-opus-4-6", { label: "Claude Opus 4.6 (legacy)", paramCountB: 200, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M, supportsVision: true }),
      m("claude-sonnet-4-6", { label: "Claude Sonnet 4.6 (legacy)", paramCountB: 100, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M, supportsVision: true }),
      m("claude-opus-4-5", { label: "Claude Opus 4.5 (200K)", paramCountB: 200, costRank: COST_SUBSCRIPTION, contextTokens: CTX_200K, supportsVision: true }),
      m("claude-haiku-4-5", { label: "Claude Haiku 4.5 (200K)", paramCountB: 20, costRank: COST_SUBSCRIPTION, contextTokens: CTX_200K, supportsVision: true }),
    ],
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://api.anthropic.com",
    hint: "Anthropic Messages API. Current: Opus/Fable/Sonnet/Haiku 5.x = 1M. Legacy = Anthropic “still available” list. Sonnet 4.5 is deprecated (retires 2026-11-30) — use Other if needed.",
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "cloud_openai_compat",
    defaultProviderId: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: [
      // Context from OpenAI model pages: GPT-6 / 5.5 / 5.4 / 5.4-pro = 1.05M;
      // GPT-5.4-mini/nano + GPT-5 family = 400K; GPT-4.1 = ~1.05M; GPT-4o = 128K.
      // All listed: text+image. paramCountB = capability proxy (sizes unpublished).
      m("gpt-6-astra", {
        label: "GPT-6 Astra (1.05M)",
        paramCountB: 260,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-6.1-sol", {
        label: "GPT-6.1 Sol (1.05M)",
        paramCountB: 300,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-6-luna", {
        label: "GPT-6 Luna (1.05M)",
        paramCountB: 280,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-5.6-luna", {
        label: "GPT-5.6 Luna (1.05M)",
        paramCountB: 220,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-5.6-sol", {
        label: "GPT-5.6 Sol (1.05M)",
        paramCountB: 200,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-5.6-terra", {
        label: "GPT-5.6 Terra (1.05M)",
        paramCountB: 180,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-5.5", {
        label: "GPT-5.5 (1.05M)",
        paramCountB: 200,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-5.4", {
        label: "GPT-5.4 (1.05M)",
        paramCountB: 150,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-5.4-pro", {
        label: "GPT-5.4 Pro (1.05M)",
        paramCountB: 300,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-5.4-mini", {
        label: "GPT-5.4 Mini (400K)",
        paramCountB: 20,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_400K,
        supportsVision: true,
      }),
      m("gpt-5.4-nano", {
        label: "GPT-5.4 nano (400K)",
        paramCountB: 4,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_400K,
        supportsVision: true,
      }),
      m("gpt-5", {
        label: "GPT-5 (400K)",
        paramCountB: 120,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_400K,
        supportsVision: true,
      }),
      m("gpt-5-mini", {
        label: "GPT-5 Mini (400K)",
        paramCountB: 16,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_400K,
        supportsVision: true,
      }),
      m("gpt-5-nano", {
        label: "GPT-5 nano (400K)",
        paramCountB: 3,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_400K,
        supportsVision: true,
      }),
      m("gpt-5-chat", {
        label: "GPT-5 Chat (400K)",
        paramCountB: 100,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_400K,
        supportsVision: true,
      }),
      m("gpt-4.1", {
        label: "GPT-4.1 (1.05M)",
        paramCountB: 80,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-4.1-mini", {
        label: "GPT-4.1 Mini (1.05M)",
        paramCountB: 12,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-4.1-nano", {
        label: "GPT-4.1 nano (1.05M)",
        paramCountB: 3,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M05,
        supportsVision: true,
      }),
      m("gpt-4o", {
        label: "GPT-4o (128K)",
        paramCountB: 70,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_128K,
        supportsVision: true,
      }),
      m("gpt-4o-mini", {
        label: "GPT-4o Mini (128K)",
        paramCountB: 8,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_128K,
        supportsVision: true,
      }),
    ],
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://api.openai.com/v1",
    hint: "EnvoyHome dials Chat Completions. OpenAI recommends Responses (/v1/responses) for GPT-6 tool calling.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "cloud_openai_compat",
    defaultProviderId: "gemini",
    // OpenAI-compat mount (ai.google.dev/gemini-api/docs/openai). joinProviderUrl
    // maps …/openai + /v1/chat/completions → …/openai/chat/completions.
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: [
      // Chat / agent text models only (not Live, TTS, image-gen, or Veo).
      // Context: current Gemini 3.x + 2.5 = 1,048,576 input; store as 1M for UI.
      m("gemini-3.8-flash", {
        label: "Gemini 3.8 Flash (1M)",
        paramCountB: 80,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("gemini-3.6-flash", {
        label: "Gemini 3.6 Flash (1M)",
        paramCountB: 60,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("gemini-3.5-flash-lite", {
        label: "Gemini 3.5 Flash-Lite (1M)",
        paramCountB: 20,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("gemini-3.1-flash-lite", {
        label: "Gemini 3.1 Flash-Lite (1M)",
        paramCountB: 16,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("gemini-3.1-pro-preview", {
        label: "Gemini 3.1 Pro Preview (1M)",
        paramCountB: 200,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("gemini-3-flash-preview", {
        label: "Gemini 3 Flash Preview (1M)",
        paramCountB: 50,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("gemini-2.5-pro", {
        label: "Gemini 2.5 Pro (1M, legacy)",
        paramCountB: 150,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("gemini-2.5-flash", {
        label: "Gemini 2.5 Flash (1M, legacy)",
        paramCountB: 40,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("gemini-2.5-flash-lite", {
        label: "Gemini 2.5 Flash-Lite (1M, legacy)",
        paramCountB: 12,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
    ],
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://generativelanguage.googleapis.com/v1beta/openai",
    hint: "Gemini API via OpenAI Chat Completions. Key from Google AI Studio. New projects: prefer 3.8 Flash / 3.5 Flash-Lite (2.5 family is legacy / restricted).",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "cloud_openai_compat",
    defaultProviderId: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    models: [
      // Official API ids (api-docs.deepseek.com): deepseek-flash serves DeepSeek-V4.1-Flash.
      // V4.1-Pro is not released yet — deepseek-v4-pro is still V4-Pro-0813.
      m("deepseek-flash", {
        label: "DeepSeek-V4.1-Flash (deepseek-flash)",
        paramCountB: 552,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("deepseek-v4-pro", {
        label: "DeepSeek-V4-Pro (deepseek-v4-pro)",
        paramCountB: 1600,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
      }),
      m("deepseek-v4-flash", {
        label: "deepseek-v4-flash → V4.1-Flash (legacy)",
        paramCountB: 552,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("deepseek-v4-flash-vision-exp", {
        label: "deepseek-v4-flash-vision-exp → V4.1-Flash (legacy)",
        paramCountB: 552,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
    ],
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://api.deepseek.com/v1",
    hint: "Current: deepseek-flash = DeepSeek-V4.1-Flash (552B, 1M, vision). deepseek-v4-pro = V4-Pro (no vision). V4.1-Pro not released yet. Legacy flash ids route to V4.1-Flash.",
  },
  {
    id: "glm",
    label: "GLM (Zhipu)",
    kind: "cloud_openai_compat",
    defaultProviderId: "glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      // From docs.bigmodel.cn model overview (text + native multimodal Flash).
      // glm-5.3 / 5.2 / 5.3-flash* = 1M; glm-5.1 / 5 / 5-turbo / 4.7* / 4.6 = 200K; air/flash older = 128K.
      m("glm-5.3", { label: "GLM-5.3", paramCountB: 744, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M }),
      m("glm-5.3-flash", {
        label: "GLM-5.3-Flash (multimodal)",
        paramCountB: 744,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("glm-5.3-flashx", {
        label: "GLM-5.3-FlashX (multimodal)",
        paramCountB: 744,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("glm-5.2", { label: "GLM-5.2", paramCountB: 744, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M }),
      m("glm-5.1", { label: "GLM-5.1", paramCountB: 744, costRank: COST_SUBSCRIPTION, contextTokens: CTX_200K }),
      m("glm-5", { label: "GLM-5", paramCountB: 744, costRank: COST_SUBSCRIPTION, contextTokens: CTX_200K }),
      m("glm-5-turbo", { label: "GLM-5-Turbo", paramCountB: 744, costRank: COST_SUBSCRIPTION, contextTokens: CTX_200K }),
      m("glm-4.7", { label: "GLM-4.7", paramCountB: 400, costRank: COST_SUBSCRIPTION, contextTokens: CTX_200K }),
      m("glm-4.7-flash", { label: "GLM-4.7-Flash", paramCountB: 400, costRank: COST_SUBSCRIPTION, contextTokens: CTX_200K }),
      m("glm-4.7-flashx", { label: "GLM-4.7-FlashX", paramCountB: 400, costRank: COST_SUBSCRIPTION, contextTokens: CTX_200K }),
      m("glm-4.6", { label: "GLM-4.6", paramCountB: 380, costRank: COST_SUBSCRIPTION, contextTokens: CTX_200K }),
      m("glm-4.5-air", { label: "GLM-4.5-Air", paramCountB: 106, costRank: COST_SUBSCRIPTION, contextTokens: CTX_128K }),
      m("glm-4.5-airx", { label: "GLM-4.5-AirX", paramCountB: 106, costRank: COST_SUBSCRIPTION, contextTokens: CTX_128K }),
      m("glm-4.5-flash", { label: "GLM-4.5-Flash", paramCountB: 12, costRank: COST_SUBSCRIPTION, contextTokens: CTX_128K }),
      m("glm-4-long", { label: "GLM-4-Long", paramCountB: 90, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M }),
      m("glm-4-flash-250414", { label: "GLM-4-Flash-250414", paramCountB: 8, costRank: COST_SUBSCRIPTION, contextTokens: CTX_128K }),
      m("glm-4-flashx-250414", {
        label: "GLM-4-FlashX-250414",
        paramCountB: 10,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_128K,
      }),
    ],
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://open.bigmodel.cn/api/paas/v4",
    hint: "Text models from Zhipu overview. GLM-5.3-Flash / FlashX are native multimodal (enable Supports vision on Advanced if needed).",
  },
  {
    id: "qwen",
    label: "Qwen (DashScope)",
    kind: "cloud_openai_compat",
    defaultProviderId: "qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      // Current Qwen3.x first (1M multimodal), then stable aliases, then long/coder/text-only.
      m("qwen3.8-max", {
        label: "Qwen3.8-Max (1M)",
        paramCountB: 160,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.7-plus", {
        label: "Qwen3.7-Plus (1M)",
        paramCountB: 75,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.8-flash", {
        label: "Qwen3.8-Flash (1M)",
        paramCountB: 18,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.7-flash", {
        label: "Qwen3.7-Flash (1M)",
        paramCountB: 16,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.6-plus", {
        label: "Qwen3.6-Plus (1M)",
        paramCountB: 70,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.6-flash", {
        label: "Qwen3.6-Flash (1M)",
        paramCountB: 16,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.5-plus", {
        label: "Qwen3.5-Plus (1M)",
        paramCountB: 65,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.5-flash", {
        label: "Qwen3.5-Flash (1M)",
        paramCountB: 14,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen-max", {
        label: "qwen-max (alias)",
        paramCountB: 150,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen-plus", {
        label: "qwen-plus (alias)",
        paramCountB: 70,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen-flash", {
        label: "qwen-flash (alias)",
        paramCountB: 16,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen-turbo", { label: "qwen-turbo (text)", paramCountB: 20, costRank: COST_SUBSCRIPTION, contextTokens: CTX_128K }),
      m("qwen-long", { label: "qwen-long (10M text)", paramCountB: 70, costRank: COST_SUBSCRIPTION, contextTokens: CTX_10M }),
      m("qwq-plus", { label: "qwq-plus (text)", paramCountB: 80, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M }),
      m("qwen3-coder-plus", {
        label: "qwen3-coder-plus",
        paramCountB: 90,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
      }),
      m("qwen3-coder-flash", {
        label: "qwen3-coder-flash",
        paramCountB: 22,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
      }),
    ],
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "qwen-intl",
    label: "Qwen (DashScope Intl)",
    kind: "cloud_openai_compat",
    defaultProviderId: "qwen-intl",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    models: [
      m("qwen3.8-max", {
        label: "Qwen3.8-Max (1M)",
        paramCountB: 160,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.7-plus", {
        label: "Qwen3.7-Plus (1M)",
        paramCountB: 75,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.8-flash", {
        label: "Qwen3.8-Flash (1M)",
        paramCountB: 18,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.7-flash", {
        label: "Qwen3.7-Flash (1M)",
        paramCountB: 16,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.6-plus", {
        label: "Qwen3.6-Plus (1M)",
        paramCountB: 70,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.6-flash", {
        label: "Qwen3.6-Flash (1M)",
        paramCountB: 16,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.5-plus", {
        label: "Qwen3.5-Plus (1M)",
        paramCountB: 65,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen3.5-flash", {
        label: "Qwen3.5-Flash (1M)",
        paramCountB: 14,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen-max", {
        label: "qwen-max (alias)",
        paramCountB: 150,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen-plus", {
        label: "qwen-plus (alias)",
        paramCountB: 70,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen-flash", {
        label: "qwen-flash (alias)",
        paramCountB: 16,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("qwen-turbo", { label: "qwen-turbo (text)", paramCountB: 20, costRank: COST_SUBSCRIPTION, contextTokens: CTX_128K }),
      m("qwq-plus", { label: "qwq-plus (text)", paramCountB: 80, costRank: COST_SUBSCRIPTION, contextTokens: CTX_1M }),
      m("qwen3-coder-plus", {
        label: "qwen3-coder-plus",
        paramCountB: 90,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
      }),
      m("qwen3-coder-flash", {
        label: "qwen3-coder-flash",
        paramCountB: 22,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
      }),
    ],
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "moonshot",
    label: "Moonshot (Kimi)",
    kind: "cloud_openai_compat",
    defaultProviderId: "moonshot",
    baseUrl: "https://api.moonshot.ai/v1",
    models: MOONSHOT_MODELS,
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://api.moonshot.ai/v1",
    hint: "Intl endpoint (platform.kimi.ai). kimi-k3 = 1M + vision; k2.6 / k2.7-code = 256K.",
  },
  {
    id: "moonshot-cn",
    label: "Moonshot CN (Kimi)",
    kind: "cloud_openai_compat",
    defaultProviderId: "moonshot-cn",
    baseUrl: "https://api.moonshot.cn/v1",
    models: MOONSHOT_MODELS,
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://api.moonshot.cn/v1",
    hint: "CN endpoint. Same model ids as intl.",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    kind: "cloud_openai_compat",
    defaultProviderId: "xai",
    baseUrl: "https://api.x.ai/v1",
    models: [
      // docs.x.ai: recommend grok-4.7. Contexts: 4.7/4.6/4.5 = 500K; 4.3 + 4.20-* = 1M; build = 256K.
      m("grok-4.7", {
        label: "Grok 4.7 (500K)",
        paramCountB: 200,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_500K,
        supportsVision: true,
      }),
      m("grok-4.6", {
        label: "Grok 4.6 (500K)",
        paramCountB: 160,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_500K,
        supportsVision: true,
      }),
      m("grok-4.5", {
        label: "Grok 4.5 (500K)",
        paramCountB: 140,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_500K,
        supportsVision: true,
      }),
      m("grok-4.3", {
        label: "Grok 4.3 (1M)",
        paramCountB: 100,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("grok-4.20-0309-reasoning", {
        label: "Grok 4.20 Reasoning (1M)",
        paramCountB: 160,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("grok-4.20-0309-non-reasoning", {
        label: "Grok 4.20 Non-reasoning (1M)",
        paramCountB: 120,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("grok-4.20-multi-agent-0309", {
        label: "Grok 4.20 Multi-agent (1M)",
        paramCountB: 220,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_1M,
        supportsVision: true,
      }),
      m("grok-build-0.1", {
        label: "Grok Build 0.1 (256K)",
        paramCountB: 40,
        costRank: COST_SUBSCRIPTION,
        contextTokens: CTX_256K,
      }),
    ],
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://api.x.ai/v1",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "cloud_openai_compat",
    defaultProviderId: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [],
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://openrouter.ai/api/v1",
    hint: "Any model id OpenRouter exposes (provider/model) — set Advanced properties on the card after add.",
  },
  {
    id: "openai-compatible",
    label: "Custom OpenAI-compatible",
    kind: "cloud_openai_compat",
    defaultProviderId: "custom-openai",
    baseUrl: "",
    models: [],
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://api.example.com/v1",
    hint: "DeepSeek-style, vLLM cloud, or any OpenAI Chat Completions API",
  },
  {
    id: "anthropic-compatible",
    label: "Custom Anthropic-compatible",
    kind: "cloud_anthropic_compat",
    defaultProviderId: "custom-anthropic",
    baseUrl: "",
    models: [],
    needsSecret: true,
    endpointEditable: true,
    endpointPlaceholder: "https://api.anthropic.com",
    hint: "Anthropic Messages-compatible gateway",
  },
  {
    id: "openai-compatible-local",
    label: "Custom OpenAI-compatible (local)",
    kind: "local_openai_compat",
    defaultProviderId: "custom-local",
    baseUrl: "http://127.0.0.1:8000/v1",
    models: [],
    needsSecret: false,
    endpointEditable: true,
    endpointPlaceholder: "http://127.0.0.1:8000/v1",
    hint: "vLLM, LM Studio, etc. Prefer Local Model tab for Ollama / Home llama-server.",
    localOnly: true,
  },
];

/** @param {string|ModelProfile} entry @returns {ModelProfile} */
export function normalizeModelEntry(entry) {
  if (typeof entry === "string") return { id: entry, supportsVision: false };
  if (!entry || typeof entry.id !== "string") return { id: String(entry?.id || ""), supportsVision: false };
  return { ...entry, supportsVision: entry.supportsVision === true };
}

/** @param {ProviderPreset} preset @returns {ModelProfile[]} */
export function listPresetModels(preset) {
  return (Array.isArray(preset?.models) ? preset.models : []).map(normalizeModelEntry).filter((m) => m.id);
}

/** @param {ProviderPreset} preset @param {string} modelId @returns {ModelProfile} */
export function resolveModelProfile(preset, modelId) {
  const id = String(modelId || "").trim();
  if (!id || id === "__custom__") return { id: "", supportsVision: false };
  for (const entry of listPresetModels(preset)) {
    if (entry.id === id) return entry;
  }
  return { id, supportsVision: false };
}

/** Cloud + BYO custom presets for the Add Provider picker (Mesh-style). */
export function listProviderPresets(opts) {
  const includeLocal = opts?.includeLocal === true;
  return PROVIDER_PRESETS.filter((p) => includeLocal || !p.localOnly);
}

export function presetById(id) {
  const cloud = listProviderPresets({ includeLocal: true });
  return cloud.find((p) => p.id === id) || listProviderPresets()[0] || PROVIDER_PRESETS[0];
}
