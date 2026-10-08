// Model provider interface (Design §8.1). Wire format is provider-owned; product keys stay in daemon.

export type ProviderKind = "llama-cpp" | "openai-compat" | "cloud";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
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
