/** Loopback OpenAI-compat ports (Design §8.5 — Home-owned; never Mesh :18790). */

/** EnvoyHome-owned llama-server. */
export const HOME_LOCAL_ENGINE_PORT = 18792;

/** Ollama default (BYO; Home does not install). */
export const OLLAMA_DEFAULT_PORT = 11434;

export const HOME_LOCAL_ENGINE_BASE = `http://127.0.0.1:${HOME_LOCAL_ENGINE_PORT}/v1`;
export const OLLAMA_DEFAULT_BASE = `http://127.0.0.1:${OLLAMA_DEFAULT_PORT}/v1`;

export const HOME_LOCAL_PROVIDER_ID = "envoyhome-local";
export const OLLAMA_PROVIDER_ID = "ollama";
