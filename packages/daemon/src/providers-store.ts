// Provider registry + secrets (Design A.6). Secrets never echoed in listProviders.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MixRouter,
  MemorySecretStore,
  createLlamaCppProvider,
  createOpenAICompatProvider,
  createAnthropicCompatProvider,
  type ModelProvider,
  type ModelMode,
  type PlacementFilter,
  type Placement,
  type ProviderSlot,
} from "@envoyhome/providers";
import type { HomePaths } from "./home-paths.js";

export type WireProviderKind =
  | "local_llama_cpp"
  | "local_openai_compat"
  | "cloud_openai_compat"
  | "cloud_anthropic_compat";

export type LatencyClass = "fast" | "standard" | "slow";

export interface ProviderCost {
  inputPerMTok?: number;
  outputPerMTok?: number;
  currency?: string;
}

/** Optional routing profile fields (Design §8). */
export interface ProviderRecord {
  id: string;
  kind: WireProviderKind;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
  label?: string;
  placement?: Placement;
  cost?: ProviderCost;
  costRank?: number;
  paramCountB?: number;
  capabilityRank?: number;
  contextTokens?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsLogprobs?: boolean;
  latencyClass?: LatencyClass;
}

export interface AccountRouting {
  defaultProviderId?: string;
  placementFilter: PlacementFilter;
  autoModelSwitch: { enabled: boolean };
}

interface ProviderStateFile {
  providers: ProviderRecord[];
  /** Compat — mirrored into routing.placementFilter via setMode. */
  modes: Record<string, ModelMode>;
  routing?: Record<string, AccountRouting>;
}

function placementFromKind(kind: WireProviderKind): Placement {
  return kind === "cloud_openai_compat" || kind === "cloud_anthropic_compat" ? "cloud" : "local";
}

function defaultCostRank(kind: WireProviderKind): number {
  return placementFromKind(kind) === "local" ? 0 : 100;
}

function defaultRouting(): AccountRouting {
  return {
    placementFilter: "any",
    autoModelSwitch: { enabled: false },
  };
}

export class ProviderStore {
  readonly secrets = new MemorySecretStore();
  private router = new MixRouter();
  private state: ProviderStateFile = { providers: [], modes: {}, routing: {} };
  private readonly statePath: string;

  constructor(private readonly paths: HomePaths) {
    this.statePath = join(paths.providersDir, "providers.json");
  }

  async load(): Promise<void> {
    await mkdir(this.paths.providersDir, { recursive: true });
    await mkdir(this.paths.secretsDir, { recursive: true });
    try {
      this.state = JSON.parse(await readFile(this.statePath, "utf8")) as ProviderStateFile;
    } catch {
      this.state = { providers: [], modes: {}, routing: {} };
    }
    if (!this.state.routing) this.state.routing = {};
    this.migrateModesIntoRouting();
    this.rebuildRouter();
    await this.loadSecretsFromDisk();
  }

  private migrateModesIntoRouting(): void {
    for (const [accountId, mode] of Object.entries(this.state.modes)) {
      const existing = this.state.routing![accountId];
      const cur = existing ?? defaultRouting();
      if (mode === "local") cur.placementFilter = "local";
      else if (mode === "cloud") cur.placementFilter = "cloud";
      else cur.placementFilter = "any";
      // Never wipe a persisted autoModelSwitch on reload — only default on first create.
      if (!existing) {
        cur.autoModelSwitch = { enabled: false };
      }
      this.state.routing![accountId] = cur;
      this.ensureDefaultProvider(accountId);
    }
  }

  private secretsPath(providerId: string): string {
    return join(this.paths.secretsDir, `${providerId}.secret`);
  }

  private async loadSecretsFromDisk(): Promise<void> {
    for (const p of this.state.providers) {
      try {
        const value = (await readFile(this.secretsPath(p.id), "utf8")).trim();
        if (value.length > 0) this.secrets.set(p.id, value);
      } catch {
        // no secret on disk
      }
    }
  }

  private isCloudKind(kind: WireProviderKind): boolean {
    return placementFromKind(kind) === "cloud";
  }

  /** Build a live ModelProvider for a persisted record (also used by testProvider). */
  wireKindToProvider(rec: ProviderRecord): ModelProvider {
    const baseUrl = rec.baseUrl ?? "http://127.0.0.1:8080";
    const model = rec.model ?? "default";
    const label = rec.label ?? rec.id;
    if (rec.kind === "local_llama_cpp") {
      return createLlamaCppProvider({
        id: rec.id,
        label,
        baseUrl,
        defaultModel: model,
        secrets: this.secrets,
      });
    }
    if (rec.kind === "cloud_anthropic_compat") {
      return createAnthropicCompatProvider({
        id: rec.id,
        label,
        baseUrl,
        defaultModel: model,
        secrets: this.secrets,
      });
    }
    return createOpenAICompatProvider({
      id: rec.id,
      label,
      baseUrl,
      defaultModel: model,
      secrets: this.secrets,
      kind: rec.kind === "cloud_openai_compat" ? "cloud" : "openai-compat",
    });
  }

  private rebuildRouter(): void {
    const slots: ProviderSlot[] = [];
    for (const rec of this.state.providers) {
      if (!rec.enabled) continue;
      const placement = rec.placement ?? placementFromKind(rec.kind);
      slots.push({
        provider: this.wireKindToProvider(rec),
        placement,
        healthy: true,
        profile: {
          placement,
          cloudKind: this.isCloudKind(rec.kind),
          ...(rec.cost !== undefined ? { cost: rec.cost } : {}),
          ...(rec.costRank !== undefined ? { costRank: rec.costRank } : {}),
          ...(rec.paramCountB !== undefined ? { paramCountB: rec.paramCountB } : {}),
          ...(rec.capabilityRank !== undefined
            ? { capabilityRank: rec.capabilityRank }
            : {}),
          ...(rec.latencyClass !== undefined ? { latencyClass: rec.latencyClass } : {}),
          ...(rec.contextTokens !== undefined ? { contextTokens: rec.contextTokens } : {}),
          ...(rec.supportsTools !== undefined ? { supportsTools: rec.supportsTools } : {}),
          ...(rec.supportsVision !== undefined ? { supportsVision: rec.supportsVision } : {}),
          ...(rec.supportsLogprobs !== undefined
            ? { supportsLogprobs: rec.supportsLogprobs }
            : {}),
        },
      });
    }
    this.router = new MixRouter();
    this.router.setPool(slots);
  }

  getRouter(): MixRouter {
    return this.router;
  }

  routingForAccount(accountId: string): AccountRouting {
    const r = this.state.routing?.[accountId];
    if (r) return { ...r, autoModelSwitch: { ...r.autoModelSwitch } };
    const mode = this.state.modes[accountId];
    if (mode === "local") return { placementFilter: "local", autoModelSwitch: { enabled: false } };
    if (mode === "cloud") return { placementFilter: "cloud", autoModelSwitch: { enabled: false } };
    return defaultRouting();
  }

  modeForAccount(accountId: string): ModelMode {
    const filter = this.routingForAccount(accountId).placementFilter;
    if (filter === "local") return "local";
    if (filter === "cloud") return "cloud";
    return this.state.modes[accountId] ?? "mix";
  }

  private ensureDefaultProvider(accountId: string): void {
    const routing = this.state.routing![accountId] ?? defaultRouting();
    const enabled = this.state.providers.filter((p) => p.enabled);
    const inFilter = enabled.filter((p) => {
      const pl = p.placement ?? placementFromKind(p.kind);
      if (routing.placementFilter === "any") return true;
      return pl === routing.placementFilter;
    });
    const pool = inFilter.length > 0 ? inFilter : enabled;
    if (pool.length === 0) {
      delete routing.defaultProviderId;
      this.state.routing![accountId] = routing;
      return;
    }
    if (
      routing.defaultProviderId &&
      pool.some((p) => p.id === routing.defaultProviderId)
    ) {
      this.state.routing![accountId] = routing;
      return;
    }
    // Last enabled matching filter; cloud/local filters prefer last of that kind.
    let pick = pool[pool.length - 1]!;
    if (routing.placementFilter === "cloud") {
      const clouds = pool.filter((p) => this.isCloudKind(p.kind));
      if (clouds.length > 0) pick = clouds[clouds.length - 1]!;
    } else if (routing.placementFilter === "local") {
      const locals = pool.filter((p) => !this.isCloudKind(p.kind));
      if (locals.length > 0) pick = locals[locals.length - 1]!;
    }
    routing.defaultProviderId = pick.id;
    this.state.routing![accountId] = routing;
  }

  async setMode(accountId: string, mode: ModelMode): Promise<void> {
    this.state.modes[accountId] = mode;
    const routing = this.routingForAccount(accountId);
    if (mode === "local") routing.placementFilter = "local";
    else if (mode === "cloud") routing.placementFilter = "cloud";
    else routing.placementFilter = "any";
    routing.autoModelSwitch = { enabled: false };
    if (!this.state.routing) this.state.routing = {};
    this.state.routing[accountId] = routing;
    this.ensureDefaultProvider(accountId);
    await this.persist();
  }

  async setPlacementFilter(accountId: string, filter: PlacementFilter): Promise<void> {
    if (!this.state.routing) this.state.routing = {};
    const routing = this.routingForAccount(accountId);
    routing.placementFilter = filter;
    this.state.routing[accountId] = routing;
    this.state.modes[accountId] =
      filter === "local" ? "local" : filter === "cloud" ? "cloud" : "mix";
    this.ensureDefaultProvider(accountId);
    await this.persist();
  }

  async setDefaultProvider(accountId: string, providerId: string): Promise<void> {
    const rec = this.getRecord(providerId);
    if (!rec || !rec.enabled) {
      throw Object.assign(new Error(`unknown or disabled provider ${providerId}`), {
        code: "provider_not_found",
      });
    }
    if (!this.state.routing) this.state.routing = {};
    const routing = this.routingForAccount(accountId);
    const placement = rec.placement ?? placementFromKind(rec.kind);
    if (
      routing.placementFilter !== "any" &&
      placement !== routing.placementFilter
    ) {
      throw Object.assign(
        new Error(
          `envoyhome.bad_params: provider ${providerId} placement ${placement} outside filter ${routing.placementFilter}`,
        ),
        { code: "bad_params" },
      );
    }
    routing.defaultProviderId = providerId;
    this.state.routing[accountId] = routing;
    await this.persist();
  }

  async setAutoModelSwitch(accountId: string, enabled: boolean): Promise<void> {
    if (!this.state.routing) this.state.routing = {};
    const routing = this.routingForAccount(accountId);
    routing.autoModelSwitch = { enabled };
    this.state.routing[accountId] = routing;
    await this.persist();
  }

  async setProvider(input: {
    id: string;
    kind: WireProviderKind;
    baseUrl?: string;
    model?: string;
    enabled?: boolean;
    label?: string;
    placement?: Placement;
    cost?: ProviderCost;
    costRank?: number;
    paramCountB?: number;
    capabilityRank?: number;
    contextTokens?: number;
    supportsTools?: boolean;
    supportsVision?: boolean;
    supportsLogprobs?: boolean;
    latencyClass?: LatencyClass;
  }): Promise<ProviderRecord> {
    const existing = this.state.providers.find((p) => p.id === input.id);
    const placement = input.placement ?? existing?.placement ?? placementFromKind(input.kind);
    const rec: ProviderRecord = {
      id: input.id,
      kind: input.kind,
      enabled: input.enabled ?? existing?.enabled ?? true,
      placement,
      costRank: input.costRank ?? existing?.costRank ?? defaultCostRank(input.kind),
      ...(input.baseUrl !== undefined
        ? { baseUrl: input.baseUrl }
        : existing?.baseUrl
          ? { baseUrl: existing.baseUrl }
          : {}),
      ...(input.model !== undefined
        ? { model: input.model }
        : existing?.model
          ? { model: existing.model }
          : {}),
      ...(input.label !== undefined
        ? { label: input.label }
        : existing?.label
          ? { label: existing.label }
          : {}),
      ...(input.cost !== undefined
        ? { cost: input.cost }
        : existing?.cost
          ? { cost: existing.cost }
          : {}),
      ...(input.paramCountB !== undefined
        ? { paramCountB: input.paramCountB }
        : existing?.paramCountB !== undefined
          ? { paramCountB: existing.paramCountB }
          : {}),
      ...(input.capabilityRank !== undefined
        ? { capabilityRank: input.capabilityRank }
        : existing?.capabilityRank !== undefined
          ? { capabilityRank: existing.capabilityRank }
          : {}),
      ...(input.contextTokens !== undefined
        ? { contextTokens: input.contextTokens }
        : existing?.contextTokens !== undefined
          ? { contextTokens: existing.contextTokens }
          : {}),
      ...(input.supportsTools !== undefined
        ? { supportsTools: input.supportsTools }
        : existing?.supportsTools !== undefined
          ? { supportsTools: existing.supportsTools }
          : {}),
      ...(input.supportsVision !== undefined
        ? { supportsVision: input.supportsVision }
        : existing?.supportsVision !== undefined
          ? { supportsVision: existing.supportsVision }
          : {}),
      ...(input.supportsLogprobs !== undefined
        ? { supportsLogprobs: input.supportsLogprobs }
        : existing?.supportsLogprobs !== undefined
          ? { supportsLogprobs: existing.supportsLogprobs }
          : {}),
      ...(input.latencyClass !== undefined
        ? { latencyClass: input.latencyClass }
        : existing?.latencyClass
          ? { latencyClass: existing.latencyClass }
          : {}),
    };
    if (existing) Object.assign(existing, rec);
    else this.state.providers.push(rec);
    for (const accountId of new Set([
      ...Object.keys(this.state.modes),
      ...Object.keys(this.state.routing ?? {}),
      "default",
    ])) {
      if (!this.state.routing) this.state.routing = {};
      if (!this.state.routing[accountId]) this.state.routing[accountId] = defaultRouting();
      this.ensureDefaultProvider(accountId);
    }
    await this.persist();
    this.rebuildRouter();
    return this.getRecord(input.id)!;
  }

  async removeProvider(id: string): Promise<void> {
    this.state.providers = this.state.providers.filter((p) => p.id !== id);
    this.secrets.remove(id);
    try {
      await writeFile(this.secretsPath(id), "", { mode: 0o600 });
    } catch {
      // best-effort
    }
    for (const accountId of Object.keys(this.state.routing ?? {})) {
      this.ensureDefaultProvider(accountId);
    }
    await this.persist();
    this.rebuildRouter();
  }

  async setProviderSecret(id: string, value: string): Promise<void> {
    await mkdir(this.paths.secretsDir, { recursive: true });
    await writeFile(this.secretsPath(id), value, { mode: 0o600 });
    this.secrets.set(id, value);
  }

  getRecord(id: string): ProviderRecord | undefined {
    return this.state.providers.find((p) => p.id === id);
  }

  async testProvider(id: string): Promise<{
    ok: boolean;
    latencyMs?: number;
    error?: string;
    model?: string;
  }> {
    const rec = this.getRecord(id);
    if (!rec) return { ok: false, error: `unknown provider ${id}` };
    const provider = this.wireKindToProvider(rec);
    const started = Date.now();
    try {
      const result = await provider.complete({
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        maxTokens: 16,
      });
      return {
        ok: true,
        latencyMs: Date.now() - started,
        model: result.model,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  listProviders(accountId: string): {
    providers: Array<Record<string, unknown>>;
    mode: ModelMode;
    defaultProviderId?: string;
    placementFilter: PlacementFilter;
    autoModelSwitch: { enabled: boolean };
  } {
    const routing = this.routingForAccount(accountId);
    const providers = this.state.providers.map((p) => ({
      id: p.id,
      kind: p.kind,
      healthy: p.enabled,
      enabled: p.enabled,
      hasSecret: this.secrets.get(p.id) !== undefined,
      placement: p.placement ?? placementFromKind(p.kind),
      ...(p.baseUrl !== undefined ? { baseUrl: p.baseUrl } : {}),
      ...(p.model !== undefined ? { model: p.model } : {}),
      ...(p.label !== undefined ? { label: p.label } : {}),
      ...(p.cost !== undefined ? { cost: p.cost } : {}),
      ...(p.costRank !== undefined ? { costRank: p.costRank } : {}),
      ...(p.paramCountB !== undefined ? { paramCountB: p.paramCountB } : {}),
      ...(p.capabilityRank !== undefined ? { capabilityRank: p.capabilityRank } : {}),
      ...(p.contextTokens !== undefined ? { contextTokens: p.contextTokens } : {}),
      ...(p.supportsTools !== undefined ? { supportsTools: p.supportsTools } : {}),
      ...(p.supportsVision !== undefined ? { supportsVision: p.supportsVision } : {}),
      ...(p.supportsLogprobs !== undefined ? { supportsLogprobs: p.supportsLogprobs } : {}),
      ...(p.latencyClass !== undefined ? { latencyClass: p.latencyClass } : {}),
    }));
    return {
      providers,
      mode: this.modeForAccount(accountId),
      ...(routing.defaultProviderId !== undefined
        ? { defaultProviderId: routing.defaultProviderId }
        : {}),
      placementFilter: routing.placementFilter,
      autoModelSwitch: { enabled: routing.autoModelSwitch.enabled },
    };
  }

  private async persist(): Promise<void> {
    await mkdir(this.paths.providersDir, { recursive: true });
    await writeFile(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}
