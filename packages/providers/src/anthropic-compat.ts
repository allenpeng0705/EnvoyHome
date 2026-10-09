// Anthropic Messages API adapter (Design §8.1 cloud_anthropic_compat).

import type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  ModelProvider,
  ProviderSecretStore,
} from "./provider.js";
import { joinProviderUrl } from "./url.js";

export interface AnthropicCompatOptions {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  secrets: ProviderSecretStore;
  fetchImpl?: typeof fetch;
  /** Anthropic-Version header; default 2023-06-01. */
  anthropicVersion?: string;
}

function toAnthropicBody(req: CompletionRequest, defaultModel: string): Record<string, unknown> {
  const model = req.model ?? defaultModel;
  let system: string | undefined;
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of req.messages) {
    if (m.role === "system") {
      system = system ? `${system}\n${m.content}` : m.content;
      continue;
    }
    if (m.role === "tool") {
      messages.push({ role: "user", content: m.content });
      continue;
    }
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }
  if (messages.length === 0) {
    messages.push({ role: "user", content: "(empty)" });
  }
  // Anthropic requires alternating roles starting with user — coalesce if needed.
  const normalized: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    const last = normalized[normalized.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n${m.content}`;
    } else {
      normalized.push({ ...m });
    }
  }
  if (normalized[0]?.role === "assistant") {
    normalized.unshift({ role: "user", content: "(continue)" });
  }
  const body: Record<string, unknown> = {
    model,
    max_tokens: req.maxTokens ?? 1024,
    messages: normalized,
  };
  if (system) body.system = system;
  return body;
}

export function createAnthropicCompatProvider(opts: AnthropicCompatOptions): ModelProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const version = opts.anthropicVersion ?? "2023-06-01";
  return {
    id: opts.id,
    kind: "cloud",
    label: opts.label,
    describe() {
      return {
        id: opts.id,
        kind: "cloud",
        label: opts.label,
        hasSecret: opts.secrets.get(opts.id) !== undefined,
      };
    },
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const model = req.model ?? opts.defaultModel;
      const secret = opts.secrets.get(opts.id);
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "anthropic-version": version,
      };
      if (secret) headers["x-api-key"] = secret;
      const init: RequestInit = {
        method: "POST",
        headers,
        body: JSON.stringify(toAnthropicBody(req, opts.defaultModel)),
      };
      if (req.signal !== undefined) init.signal = req.signal;
      const url = joinProviderUrl(opts.baseUrl, "/v1/messages");
      const res = await fetchImpl(url, init);
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `provider ${opts.id} HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        );
      }
      const body = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = (body.content ?? [])
        .filter((b) => b.type === "text" || b.text)
        .map((b) => b.text ?? "")
        .join("");
      const result: CompletionResult = { text, model };
      if (body.usage) {
        result.usage = {
          promptTokens: body.usage.input_tokens ?? 0,
          completionTokens: body.usage.output_tokens ?? 0,
        };
      }
      return result;
    },
  };
}

/** Test helper — expose message mapping. */
export function __anthropicBodyForTests(
  messages: ChatMessage[],
  defaultModel = "claude-test",
): Record<string, unknown> {
  return toAnthropicBody({ messages }, defaultModel);
}
