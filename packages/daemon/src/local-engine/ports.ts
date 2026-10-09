/** Loopback OpenAI-compat ports (Adapt EnvoyMesh Envoy Local). */

/** Shared EnvoyMesh Envoy Local sidecar — prefer attach when healthy. */
export const MESH_ENVOY_LOCAL_PORT = 18790;

/** EnvoyHome-owned llama-server when Mesh engine is absent. */
export const HOME_LOCAL_ENGINE_PORT = 18792;

/** Ollama default. */
export const OLLAMA_DEFAULT_PORT = 11434;

export const MESH_ENVOY_LOCAL_BASE = `http://127.0.0.1:${MESH_ENVOY_LOCAL_PORT}/v1`;
export const HOME_LOCAL_ENGINE_BASE = `http://127.0.0.1:${HOME_LOCAL_ENGINE_PORT}/v1`;
export const OLLAMA_DEFAULT_BASE = `http://127.0.0.1:${OLLAMA_DEFAULT_PORT}/v1`;

export const HOME_LOCAL_PROVIDER_ID = "envoyhome-local";
export const OLLAMA_PROVIDER_ID = "ollama";
