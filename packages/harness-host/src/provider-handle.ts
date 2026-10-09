// Daemon-mediated model calls (Design §6.1 provider_handle, §8.1).

import {
  MixRouter,
  type MixPolicy,
  type ModelMode,
  type PlacementFilter,
  type PickDecision,
  type ChatMessage,
  type CompletionRequest,
  type ModelProvider,
} from "@envoyhome/providers";

export interface ProviderHandleOptions {
  router: MixRouter;
  mode: ModelMode;
  placementFilter?: PlacementFilter;
  defaultProviderId?: string;
  autoModelSwitch?: boolean;
  /** Privacy-tagged / sensitive tool output forces local (V-SEC-9). */
  forceLocal?: boolean;
  /** Turn text for needClass when auto-switch is on (optional pre-hint). */
  text?: string;
  /** Account needClass rules prepended to the bundled pack. */
  needClassRules?: MixPolicy["needClassRules"];
  requiresTools?: boolean;
  requiresVision?: boolean;
  minContextTokens?: number;
  onPicked?: (decision: PickDecision) => void;
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

export class ProviderHandle {
  private lastDecision: PickDecision | undefined;

  constructor(private readonly opts: ProviderHandleOptions) {}

  setMode(mode: ModelMode): void {
    this.opts.mode = mode;
  }

  setRouter(router: MixRouter): void {
    (this.opts as { router: MixRouter }).router = router;
  }

  lastPick(): PickDecision | undefined {
    return this.lastDecision;
  }

  /** Resolve (and emit onPicked) without calling the model — used when completionText short-circuits. */
  ensurePicked(text?: string): PickDecision {
    this.resolve(text);
    return this.lastDecision!;
  }

  private resolve(text?: string): ModelProvider {
    const policy: MixPolicy = {
      mode: this.opts.mode,
      ...(this.opts.placementFilter !== undefined
        ? { placementFilter: this.opts.placementFilter }
        : {}),
      ...(this.opts.defaultProviderId !== undefined
        ? { defaultProviderId: this.opts.defaultProviderId }
        : {}),
      ...(this.opts.autoModelSwitch ? { autoModelSwitch: true } : {}),
      ...(this.opts.forceLocal ? { forceLocal: true } : {}),
      ...(this.opts.needClassRules !== undefined
        ? { needClassRules: this.opts.needClassRules }
        : {}),
      ...(this.opts.requiresTools !== undefined
        ? { requiresTools: this.opts.requiresTools }
        : {}),
      ...(this.opts.requiresVision !== undefined
        ? { requiresVision: this.opts.requiresVision }
        : {}),
      ...(this.opts.minContextTokens !== undefined
        ? { minContextTokens: this.opts.minContextTokens }
        : {}),
      ...(text !== undefined
        ? { text }
        : this.opts.text !== undefined
          ? { text: this.opts.text }
          : {}),
    };
    const decision = this.opts.router.pickDetailed(policy);
    this.lastDecision = decision;
    this.opts.onPicked?.(decision);
    return decision.provider;
  }

  async complete(req: Omit<CompletionRequest, "messages"> & { messages: ChatMessage[] }): Promise<{
    text: string;
    model: string;
    providerId: string;
    usage?: { promptTokens: number; completionTokens: number };
  }> {
    const text =
      this.opts.autoModelSwitch === true
        ? this.opts.text ?? lastUserText(req.messages)
        : this.opts.text;
    const provider = this.resolve(text);
    const result = await provider.complete(req);
    return {
      text: result.text,
      model: result.model,
      providerId: provider.id,
      ...(result.usage !== undefined ? { usage: result.usage } : {}),
    };
  }
}
