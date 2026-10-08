// OpenAI-compatible local/cloud adapter (Design §8.1).

import type {
  CompletionRequest,
  CompletionResult,
  ModelProvider,
  ProviderSecretStore,
} from "./provider.js";

export interface OpenAICompatOptions {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  secrets: ProviderSecretStore;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
  kind?: "openai-compat" | "cloud";
}

export function createOpenAICompatProvider(opts: OpenAICompatOptions): ModelProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const kind = opts.kind ?? "openai-compat";
  return {
    id: opts.id,
    kind,
    label: opts.label,
    describe() {
      return {
        id: opts.id,
        kind,
        label: opts.label,
        hasSecret: opts.secrets.get(opts.id) !== undefined,
      };
    },
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const model = req.model ?? opts.defaultModel;
      const secret = opts.secrets.get(opts.id);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (secret) headers.authorization = `Bearer ${secret}`;
      const init: RequestInit = {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: req.messages,
          max_tokens: req.maxTokens ?? 1024,
        }),
      };
      if (req.signal !== undefined) init.signal = req.signal;
      const res = await fetchImpl(new URL("/v1/chat/completions", opts.baseUrl), init);
      if (!res.ok) {
        throw new Error(`provider ${opts.id} HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = body.choices?.[0]?.message?.content ?? "";
      const result: CompletionResult = { text, model };
      if (body.usage) {
        result.usage = {
          promptTokens: body.usage.prompt_tokens ?? 0,
          completionTokens: body.usage.completion_tokens ?? 0,
        };
      }
      return result;
    },
  };
}
