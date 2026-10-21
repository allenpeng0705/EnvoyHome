// Model provider interface (Design §8.1). Wire format is provider-owned; product keys stay in daemon.

export type ProviderKind = "llama-cpp" | "openai-compat" | "cloud";

/** OpenAI-style multimodal parts (Design §19.12 D1 vision). */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  /** String for text-only; parts array when a vision turn includes images. */
  content: string | ChatContentPart[];
}

/** Flatten multimodal content for providers that only accept strings. */
export function chatContentToText(content: string | ChatContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => (p.type === "text" ? p.text : "[image]"))
    .join("\n");
}

export interface CompletionRequest {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface ModelProvider {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly label: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  /** Never echo secrets. */
  describe(): { id: string; kind: ProviderKind; label: string; hasSecret: boolean };
}

export interface ProviderSecretStore {
  get(providerId: string): string | undefined;
  set(providerId: string, secret: string): void;
  remove(providerId: string): void;
}

export class MemorySecretStore implements ProviderSecretStore {
  private readonly secrets = new Map<string, string>();
  get(providerId: string): string | undefined {
    return this.secrets.get(providerId);
  }
  set(providerId: string, secret: string): void {
    this.secrets.set(providerId, secret);
  }
  remove(providerId: string): void {
    this.secrets.delete(providerId);
  }
}
