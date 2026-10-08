// llama.cpp OpenAI-compat shim (Design §8.1) — same wire as openai-compat, local kind.

import { createOpenAICompatProvider } from "./openai-compat.js";
import type { ModelProvider, ProviderSecretStore } from "./provider.js";

export function createLlamaCppProvider(input: {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  secrets: ProviderSecretStore;
  fetchImpl?: typeof fetch;
}): ModelProvider {
  return createOpenAICompatProvider({
    ...input,
    kind: "openai-compat",
  });
}
