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

/** Explicit UI/API choice locks the filter; `auto` follows enabled providers. */
export type PlacementPreference = "auto" | PlacementFilter;

export interface AccountRouting {
  defaultProviderId?: string;
  placementFilter: PlacementFilter;
  autoModelSwitch: { enabled: boolean };
  /**
   * `auto` (default): placementFilter = cloud if any enabled cloud else local if any local else any.
   * Explicit `any` | `cloud` | `local` locks the filter (Smart Routing / Cloud only / Local only).
   */
  placementPreference?: PlacementPreference;
}

interface ProviderStateFile {
  providers: ProviderRecord[];
  /**
   * When true, `providers[0]` is the most recently added.
   * Older files used append order (oldest first) — migrated on load.
   */
  providersNewestFirst?: boolean;
  /** Compat — mirrored into routing.placementFilter via setMode. */
  modes: Record<string, ModelMode>;
  routing?: Record<string, AccountRouting>;
  /**
   * Daemon-wide. When true, every profile's pool is local (the shared llama.cpp / Ollama model).
   * New profiles inherit it. Not a per-profile choice.
   */
  localOnly?: boolean;
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
    placementPreference: "auto",
  };
}

function modeFromFilter(filter: PlacementFilter): ModelMode {
  if (filter === "local") return "local";
  if (filter === "cloud") return "cloud";
  return "mix";
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
      this.state = { providers: [], modes: {}, routing: {}, providersNewestFirst: true };
    }
    if (!this.state.routing) this.state.routing = {};
    let orderDirty = false;
    // Legacy files appended (oldest first). Flip once so index 0 = newest.
    if (!this.state.providersNewestFirst && Array.isArray(this.state.providers)) {
      this.state.providers.reverse();
      this.state.providersNewestFirst = true;
      orderDirty = true;
    } else {
      this.state.providersNewestFirst = true;
    }
    this.migrateModesIntoRouting();
    let routingDirty = false;
    for (const accountId of Object.keys(this.state.routing)) {
      const before = JSON.stringify(this.state.routing[accountId]);
      this.applyAdaptivePlacement(accountId);
      this.ensureDefaultProvider(accountId);
      if (JSON.stringify(this.state.routing[accountId]) !== before) routingDirty = true;
    }
    this.rebuildRouter();
    await this.loadSecretsFromDisk();
    // Persist adaptive migration (e.g. legacy filter=any without preference → cloud).
    if (routingDirty || orderDirty) await this.persist();
  }

  private migrateModesIntoRouting(): void {
    for (const [accountId, mode] of Object.entries(this.state.modes)) {
      const existing = this.state.routing![accountId];
      const cur = existing ?? defaultRouting();
      if (mode === "local") {
        cur.placementFilter = "local";
        cur.placementPreference = "local";
      } else if (mode === "cloud") {
        cur.placementFilter = "cloud";
        cur.placementPreference = "cloud";
      } else {
        cur.placementFilter = "any";
        // Historical mix → treat as locked Smart Routing so we do not rewrite to cloud.
        cur.placementPreference = existing?.placementPreference ?? "any";
      }
      // Never wipe a persisted autoModelSwitch on reload — only default on first create.
      if (!existing) {
        cur.autoModelSwitch = { enabled: false };
      }
      this.state.routing![accountId] = cur;
      this.ensureDefaultProvider(accountId);
    }
  }

  /** Cloud if any enabled cloud; else local if any local; else any (empty pool). */
  adaptivePlacementFilter(): PlacementFilter {
    const enabled = this.state.providers.filter((p) => p.enabled);
    if (enabled.some((p) => this.isCloudKind(p.kind))) return "cloud";
    if (enabled.some((p) => !this.isCloudKind(p.kind))) return "local";
    return "any";
  }

  /**
   * When placementPreference is `auto` (or missing on a new row), sync placementFilter
   * from enabled providers. Explicit preference locks the filter.
   */
  private applyAdaptivePlacement(accountId: string): void {
    if (!this.state.routing) this.state.routing = {};
    const routing = this.state.routing[accountId] ?? defaultRouting();
    const pref = routing.placementPreference ?? "auto";
    routing.placementPreference = pref;
    if (this.state.localOnly) {
      routing.placementFilter = "local";
      routing.placementPreference = "local";
      routing.autoModelSwitch = { enabled: false };
      this.state.modes[accountId] = "local";
      this.state.routing[accountId] = routing;
      return;
    }
    if (pref === "auto") {
      routing.placementFilter = this.adaptivePlacementFilter();
      this.state.modes[accountId] = modeFromFilter(routing.placementFilter);
    }
    this.state.routing[accountId] = routing;
  }

  private touchAccountRouting(accountId: string): AccountRouting {
    if (!this.state.routing) this.state.routing = {};
    if (!this.state.routing[accountId]) {
      this.state.routing[accountId] = defaultRouting();
    }
    this.applyAdaptivePlacement(accountId);
    return this.state.routing[accountId]!;
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
    if (r) {
      return {
        ...r,
        autoModelSwitch: { ...r.autoModelSwitch },
        placementPreference: r.placementPreference ?? "auto",
      };
    }
    const mode = this.state.modes[accountId];
    if (mode === "local") {
      return {
        placementFilter: "local",
        autoModelSwitch: { enabled: false },
        placementPreference: "local",
      };
    }
    if (mode === "cloud") {
      return {
        placementFilter: "cloud",
        autoModelSwitch: { enabled: false },
        placementPreference: "cloud",
      };
    }
    const fresh = defaultRouting();
    fresh.placementFilter = this.adaptivePlacementFilter();
    return fresh;
  }

  modeForAccount(accountId: string): ModelMode {
    const filter = this.routingForAccount(accountId).placementFilter;
    return modeFromFilter(filter);
  }

  private ensureDefaultProvider(accountId: string): void {
    const routing = this.state.routing![accountId] ?? defaultRouting();
    const enabled = this.state.providers.filter((p) => p.enabled);
    const clouds = enabled.filter((p) => this.isCloudKind(p.kind));
    // defaultProviderId is the cloud default (UI: "Use as default" on cloud cards).
    // Local-only setups fall back to the single local for operational picks.
    if (clouds.length > 0) {
      if (
        routing.defaultProviderId &&
        clouds.some((p) => p.id === routing.defaultProviderId)
      ) {
        this.state.routing![accountId] = routing;
        return;
      }
      // providers[0] is newest (see providersNewestFirst).
      routing.defaultProviderId = clouds[0]!.id;
      this.state.routing![accountId] = routing;
      return;
    }
    const locals = enabled.filter((p) => !this.isCloudKind(p.kind));
    if (locals.length === 0) {
      delete routing.defaultProviderId;
      this.state.routing![accountId] = routing;
      return;
    }
    if (
      routing.defaultProviderId &&
      locals.some((p) => p.id === routing.defaultProviderId)
    ) {
      this.state.routing![accountId] = routing;
      return;
    }
    routing.defaultProviderId = locals[0]!.id;
    this.state.routing![accountId] = routing;
  }

  /** At most one enabled local provider (EnvoyHome Local / Ollama / custom local). */
  private enforceSingleLocal(keepId: string): void {
    for (const p of this.state.providers) {
      if (p.id === keepId) continue;
      if (!this.isCloudKind(p.kind) && p.enabled) {
        p.enabled = false;
      }
    }
  }

  async setMode(accountId: string, mode: ModelMode): Promise<void> {
    this.state.modes[accountId] = mode;
    if (!this.state.routing) this.state.routing = {};
    const routing = this.routingForAccount(accountId);
    if (mode === "local") {
      routing.placementFilter = "local";
      routing.placementPreference = "local";
    } else if (mode === "cloud") {
      routing.placementFilter = "cloud";
      routing.placementPreference = "cloud";
    } else {
      routing.placementFilter = "any";
      routing.placementPreference = "any";
    }
    routing.autoModelSwitch = { enabled: false };
    this.state.routing[accountId] = routing;
    this.ensureDefaultProvider(accountId);
    await this.persist();
  }

  /**
   * Local-only is one switch for every profile: the shared local model, or not.
   * `accountIds` is the full account list so profiles with no routing row yet are included.
   */
  async setSharedLocalOnly(enabled: boolean, accountIds: string[]): Promise<void> {
    // Idempotent clear: do not rewrite per-profile locks when Local only is already off.
    if (!enabled && this.state.localOnly !== true) {
      return;
    }
    this.state.localOnly = enabled;
    if (!this.state.routing) this.state.routing = {};
    const ids = new Set<string>([
      ...accountIds,
      ...Object.keys(this.state.routing),
      ...Object.keys(this.state.modes ?? {}),
    ]);
    for (const accountId of ids) {
      if (!accountId) continue;
      if (enabled) {
        const routing = this.routingForAccount(accountId);
        routing.placementFilter = "local";
        routing.placementPreference = "local";
        routing.autoModelSwitch = { enabled: false };
        this.state.routing[accountId] = routing;
        this.state.modes[accountId] = "local";
        this.ensureDefaultProvider(accountId);
      } else {
        const routing = this.routingForAccount(accountId);
        routing.placementPreference = "auto";
        routing.autoModelSwitch = { enabled: false };
        this.state.routing[accountId] = routing;
        this.applyAdaptivePlacement(accountId);
        this.ensureDefaultProvider(accountId);
      }
    }
    await this.persist();
  }

  isSharedLocalOnly(): boolean {
    return this.state.localOnly === true;
  }

  async setPlacementFilter(accountId: string, filter: PlacementFilter): Promise<void> {
    if (!this.state.routing) this.state.routing = {};
    // Leaving Local only must clear the daemon-wide switch, or the next
    // listProviders touch forces this profile back to local.
    if (filter !== "local") this.state.localOnly = false;
    const routing = this.routingForAccount(accountId);
    routing.placementFilter = filter;
    // Explicit UI/API choice locks adaptive defaults (Smart Routing / Cloud / Local).
    routing.placementPreference = filter;
    if (filter !== "any") {
      routing.autoModelSwitch = { enabled: false };
    }
    this.state.routing[accountId] = routing;
    this.state.modes[accountId] = modeFromFilter(filter);
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
    if (!this.isCloudKind(rec.kind)) {
      throw Object.assign(
        new Error(
          `envoyhome.bad_params: default provider must be a cloud provider (got ${providerId})`,
        ),
        { code: "bad_params" },
      );
    }
    if (!this.state.routing) this.state.routing = {};
    const routing = this.routingForAccount(accountId);
    routing.defaultProviderId = providerId;
    this.state.routing[accountId] = routing;
    await this.persist();
  }

  async setAutoModelSwitch(accountId: string, enabled: boolean): Promise<void> {
    if (!this.state.routing) this.state.routing = {};
    const routing = this.routingForAccount(accountId);
    // Auto-switch is only meaningful under Smart Routing (placementFilter any).
    routing.autoModelSwitch = {
      enabled: enabled && routing.placementFilter === "any",
    };
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
    /** `null` clears to the kind default (Advanced Unset). */
    costRank?: number | null;
    /** `null` clears the stored value. */
    paramCountB?: number | null;
    capabilityRank?: number;
    /** `null` clears the stored value. */
    contextTokens?: number | null;
    supportsTools?: boolean;
    supportsVision?: boolean;
    supportsLogprobs?: boolean;
    /** `null` clears the stored value. */
    latencyClass?: LatencyClass | null;
  }): Promise<ProviderRecord> {
    const existing = this.state.providers.find((p) => p.id === input.id);
    const wasNew = !existing;
    const placement = input.placement ?? existing?.placement ?? placementFromKind(input.kind);
    const enabled = input.enabled ?? existing?.enabled ?? true;
    if (!this.isCloudKind(input.kind) && enabled) {
      this.enforceSingleLocal(input.id);
    }
    const costRank =
      input.costRank === null
        ? defaultCostRank(input.kind)
        : (input.costRank ?? existing?.costRank ?? defaultCostRank(input.kind));
    const rec: ProviderRecord = {
      id: input.id,
      kind: input.kind,
      enabled,
      placement,
      costRank,
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
      ...(input.paramCountB === null
        ? {}
        : input.paramCountB !== undefined
          ? { paramCountB: input.paramCountB }
          : existing?.paramCountB !== undefined
            ? { paramCountB: existing.paramCountB }
            : {}),
      ...(input.capabilityRank !== undefined
        ? { capabilityRank: input.capabilityRank }
        : existing?.capabilityRank !== undefined
          ? { capabilityRank: existing.capabilityRank }
          : {}),
      ...(input.contextTokens === null
        ? {}
        : input.contextTokens !== undefined
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
      ...(input.latencyClass === null
        ? {}
        : input.latencyClass !== undefined
          ? { latencyClass: input.latencyClass }
          : existing?.latencyClass
            ? { latencyClass: existing.latencyClass }
            : {}),
    };
    if (existing) {
      Object.assign(existing, rec);
      // Object.assign does not remove keys — clear Unset Advanced fields explicitly.
      if (input.paramCountB === null) delete existing.paramCountB;
      if (input.contextTokens === null) delete existing.contextTokens;
      if (input.latencyClass === null) delete existing.latencyClass;
    } else {
      // Newest first in store + listProviders (Design §8.2).
      this.state.providers.unshift(rec);
      this.state.providersNewestFirst = true;
    }
    const newestCloudDefault =
      wasNew && enabled && this.isCloudKind(input.kind) ? input.id : undefined;
    for (const accountId of new Set([
      ...Object.keys(this.state.modes),
      ...Object.keys(this.state.routing ?? {}),
      "default",
    ])) {
      this.touchAccountRouting(accountId);
      if (newestCloudDefault) {
        const routing = this.state.routing![accountId]!;
        routing.defaultProviderId = newestCloudDefault;
        // New cloud under auto preference → Cloud only (never leave legacy any).
        if ((routing.placementPreference ?? "auto") === "auto") {
          routing.placementFilter = "cloud";
          this.state.modes[accountId] = "cloud";
        }
      } else {
        this.ensureDefaultProvider(accountId);
      }
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
      this.applyAdaptivePlacement(accountId);
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

  /**
   * Context sources for Memory Design §4.2.1 inject profiles.
   * Cloud = account cloud default (else newest enabled cloud).
   * Local = the single enabled local provider.
   */
  injectContextSources(accountId: string): {
    cloud?: { providerId: string; contextTokens?: number };
    local?: { providerId: string; contextTokens?: number };
  } {
    this.touchAccountRouting(accountId);
    this.ensureDefaultProvider(accountId);
    const routing = this.routingForAccount(accountId);
    const enabled = this.state.providers.filter((p) => p.enabled);
    const clouds = enabled.filter((p) => this.isCloudKind(p.kind));
    const locals = enabled.filter((p) => !this.isCloudKind(p.kind));
    const out: {
      cloud?: { providerId: string; contextTokens?: number };
      local?: { providerId: string; contextTokens?: number };
    } = {};
    if (clouds.length > 0) {
      const preferred =
        (routing.defaultProviderId &&
          clouds.find((p) => p.id === routing.defaultProviderId)) ||
        clouds[0]!;
      out.cloud = {
        providerId: preferred.id,
        ...(preferred.contextTokens !== undefined
          ? { contextTokens: preferred.contextTokens }
          : {}),
      };
    }
    if (locals.length > 0) {
      const local = locals[0]!;
      out.local = {
        providerId: local.id,
        ...(local.contextTokens !== undefined
          ? { contextTokens: local.contextTokens }
          : {}),
      };
    }
    return out;
  }

  /** Placement of an enabled provider id (for post-pick inject profile). */
  placementOf(providerId: string): Placement | undefined {
    const rec = this.state.providers.find((p) => p.id === providerId && p.enabled);
    if (!rec) return undefined;
    return rec.placement ?? placementFromKind(rec.kind);
  }

  listProviders(accountId: string): {
    providers: Array<Record<string, unknown>>;
    mode: ModelMode;
    defaultProviderId?: string;
    placementFilter: PlacementFilter;
    placementPreference: PlacementPreference;
    autoModelSwitch: { enabled: boolean };
    /** Daemon-wide: every profile uses the shared local model. */
    localOnly: boolean;
  } {
    // Materialize adaptive routing + default for this account.
    const before = JSON.stringify(this.state.routing?.[accountId] ?? null);
    this.touchAccountRouting(accountId);
    this.ensureDefaultProvider(accountId);
    if (JSON.stringify(this.state.routing?.[accountId] ?? null) !== before) {
      void this.persist();
    }
    const routing = this.routingForAccount(accountId);
    // Store keeps newest first (`unshift` + load migration).
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
      placementPreference: routing.placementPreference ?? "auto",
      autoModelSwitch: { enabled: routing.autoModelSwitch.enabled },
      localOnly: this.state.localOnly === true,
    };
  }

  private async persist(): Promise<void> {
    await mkdir(this.paths.providersDir, { recursive: true });
    await writeFile(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}
