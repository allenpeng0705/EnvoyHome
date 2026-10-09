/** Popular model-provider presets for Settings → Models. */

/** @typedef {"local_llama_cpp"|"local_openai_compat"|"cloud_openai_compat"|"cloud_anthropic_compat"} WireKind */

/**
 * @typedef {object} ProviderPreset
 * @property {string} id
 * @property {string} label
 * @property {WireKind} kind
 * @property {string} defaultProviderId
 * @property {string} baseUrl
 * @property {string} model
 * @property {boolean} needsSecret
 * @property {string} [hint]
 */

/** @type {ProviderPreset[]} */
export const PROVIDER_PRESETS = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "cloud_openai_compat",
    defaultProviderId: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    needsSecret: true,
    hint: "OpenAI Chat Completions API",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "cloud_anthropic_compat",
    defaultProviderId: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-20250514",
    needsSecret: true,
    hint: "Anthropic Messages API",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "cloud_openai_compat",
    defaultProviderId: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    needsSecret: true,
  },
  {
    id: "glm",
    label: "GLM (Zhipu)",
    kind: "cloud_openai_compat",
    defaultProviderId: "glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    needsSecret: true,
  },
  {
    id: "minimax",
    label: "MiniMax",
    kind: "cloud_openai_compat",
    defaultProviderId: "minimax",
    baseUrl: "https://api.minimax.chat/v1",
    model: "MiniMax-Text-01",
    needsSecret: true,
  },
  {
    id: "ollama",
    label: "Ollama (manual)",
    kind: "local_openai_compat",
    defaultProviderId: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.2",
    needsSecret: false,
    hint: "Prefer one-click “Use Ollama” above; this adds a custom pool row",
  },
  {
    id: "llamacpp",
    label: "llama.cpp (Home :18792)",
    kind: "local_llama_cpp",
    defaultProviderId: "envoyhome-local",
    baseUrl: "http://127.0.0.1:18792/v1",
    model: "default",
    needsSecret: false,
    hint: "Prefer one-click Enable Local; Home spawn listens on :18792",
  },
  {
    id: "custom-openai-cloud",
    label: "Custom OpenAI-compat (cloud)",
    kind: "cloud_openai_compat",
    defaultProviderId: "custom-openai",
    baseUrl: "",
    model: "",
    needsSecret: true,
    hint: "Any OpenAI-compatible cloud endpoint",
  },
  {
    id: "custom-openai-local",
    label: "Custom OpenAI-compat (local)",
    kind: "local_openai_compat",
    defaultProviderId: "custom-local",
    baseUrl: "http://127.0.0.1:8000/v1",
    model: "",
    needsSecret: false,
    hint: "vLLM, LM Studio, etc.",
  },
  {
    id: "custom-anthropic",
    label: "Custom Anthropic-compat",
    kind: "cloud_anthropic_compat",
    defaultProviderId: "custom-anthropic",
    baseUrl: "",
    model: "",
    needsSecret: true,
    hint: "Anthropic Messages-compatible gateway",
  },
];

export function presetById(id) {
  return PROVIDER_PRESETS.find((p) => p.id === id) || PROVIDER_PRESETS[0];
}
