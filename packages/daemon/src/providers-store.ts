// Provider registry + secrets (Design A.6). Secrets never echoed in listProviders.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MixRouter,
  MemorySecretStore,
  createLlamaCppProvider,
  createOpenAICompatProvider,
  type ModelProvider,
  type ModelMode,
} from "@envoyhome/providers";
import type { HomePaths } from "./home-paths.js";

export type WireProviderKind = "local_llama_cpp" | "local_openai_compat" | "cloud_openai_compat";

export interface ProviderRecord {
  id: string;
  kind: WireProviderKind;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
}

interface ProviderStateFile {
  providers: ProviderRecord[];
  modes: Record<string, ModelMode>;
}

export class ProviderStore {
  readonly secrets = new MemorySecretStore();
  private router = new MixRouter(undefined, undefined);
  private state: ProviderStateFile = { providers: [], modes: {} };
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
      this.state = { providers: [], modes: {} };
    }
    this.rebuildRouter();
    await this.loadSecretsFromDisk();
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

  private wireKindToProvider(rec: ProviderRecord): ModelProvider {
    const baseUrl = rec.baseUrl ?? "http://127.0.0.1:8080";
    const model = rec.model ?? "default";
    if (rec.kind === "local_llama_cpp") {
      return createLlamaCppProvider({
        id: rec.id,
        label: rec.id,
        baseUrl,
        defaultModel: model,
        secrets: this.secrets,
      });
    }
    return createOpenAICompatProvider({
      id: rec.id,
      label: rec.id,
      baseUrl,
      defaultModel: model,
      secrets: this.secrets,
      kind: rec.kind === "cloud_openai_compat" ? "cloud" : "openai-compat",
    });
  }

  private rebuildRouter(): void {
    let local: ModelProvider | undefined;
    let cloud: ModelProvider | undefined;
    for (const rec of this.state.providers) {
      if (!rec.enabled) continue;
      const p = this.wireKindToProvider(rec);
      if (rec.kind === "cloud_openai_compat") cloud = p;
      else local = p;
    }
    this.router = new MixRouter(local, cloud);
  }

  getRouter(): MixRouter {
    return this.router;
  }

  modeForAccount(accountId: string): ModelMode {
    return this.state.modes[accountId] ?? "mix";
  }

  async setMode(accountId: string, mode: ModelMode): Promise<void> {
    this.state.modes[accountId] = mode;
    await this.persist();
  }

  async setProvider(input: {
    id: string;
    kind: WireProviderKind;
    baseUrl?: string;
    model?: string;
    enabled?: boolean;
  }): Promise<ProviderRecord> {
    const existing = this.state.providers.find((p) => p.id === input.id);
    const rec: ProviderRecord = {
      id: input.id,
      kind: input.kind,
      enabled: input.enabled ?? existing?.enabled ?? true,
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : existing?.baseUrl ? { baseUrl: existing.baseUrl } : {}),
      ...(input.model !== undefined ? { model: input.model } : existing?.model ? { model: existing.model } : {}),
    };
    if (existing) Object.assign(existing, rec);
    else this.state.providers.push(rec);
    await this.persist();
    this.rebuildRouter();
    return rec;
  }

  async removeProvider(id: string): Promise<void> {
    this.state.providers = this.state.providers.filter((p) => p.id !== id);
    this.secrets.remove(id);
    await this.persist();
    this.rebuildRouter();
  }

  async setProviderSecret(id: string, value: string): Promise<void> {
    await mkdir(this.paths.secretsDir, { recursive: true });
    await writeFile(this.secretsPath(id), value, "utf8");
    this.secrets.set(id, value);
  }

  listProviders(accountId: string): { providers: Array<Record<string, unknown>>; mode: ModelMode } {
    const providers = this.state.providers.map((p) => ({
      id: p.id,
      kind: p.kind,
      healthy: p.enabled,
      enabled: p.enabled,
      ...(p.baseUrl !== undefined ? { baseUrl: p.baseUrl } : {}),
      ...(p.model !== undefined ? { model: p.model } : {}),
    }));
    return { providers, mode: this.modeForAccount(accountId) };
  }

  private async persist(): Promise<void> {
    await mkdir(this.paths.providersDir, { recursive: true });
    await writeFile(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}
