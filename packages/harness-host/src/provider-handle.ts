// Daemon-mediated model calls (Design §6.1 provider_handle, §8.1).

import { MixRouter, type ModelMode, type MixPolicy } from "@envoyhome/providers";
import type { ChatMessage, CompletionRequest, ModelProvider } from "@envoyhome/providers";

export interface ProviderHandleOptions {
  router: MixRouter;
  mode: ModelMode;
  /** Privacy-tagged / sensitive tool output forces local (V-SEC-9). */
  forceLocal?: boolean;
}

export class ProviderHandle {
  constructor(private readonly opts: ProviderHandleOptions) {}

  setMode(mode: ModelMode): void {
    this.opts.mode = mode;
  }

  setRouter(router: MixRouter): void {
    (this.opts as { router: MixRouter }).router = router;
  }

  async complete(req: Omit<CompletionRequest, "messages"> & { messages: ChatMessage[] }): Promise<{
    text: string;
    model: string;
    providerId: string;
    usage?: { promptTokens: number; completionTokens: number };
  }> {
    const policy: MixPolicy = {
      mode: this.opts.mode,
      ...(this.opts.forceLocal ? { forceLocal: true } : {}),
    };
    const provider: ModelProvider = this.opts.router.pick(policy);
    const result = await provider.complete(req);
    return {
      text: result.text,
      model: result.model,
      providerId: provider.id,
      ...(result.usage !== undefined ? { usage: result.usage } : {}),
    };
  }
}
