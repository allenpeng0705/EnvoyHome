import { assertManifestCompatible, type ChannelManifest } from "./manifest.js";
import type {
  ChannelContext,
  ChannelLogger,
  InboundEvent,
  OutboundMessage,
  SecretHandle,
  SourceDescriptor,
} from "./context.js";
import {
  buildInboundEvent,
  gateInbound,
  rawRefKey,
  type InboundAck,
} from "./emit-inbound.js";
import {
  assertNotificationOnly,
  assertRawRefOwner,
  normalizeOutbound,
  type RawRefOwner,
} from "./outbound.js";

export interface ChannelPlugin {
  manifest: ChannelManifest;
  start: (ctx: ChannelContext) => Promise<void> | void;
  stop?: () => Promise<void> | void;
  /** Daemon invokes after a turn (§5.3.1 outbound.send). */
  send?: (msg: OutboundMessage) => Promise<void>;
  health?: () => Promise<{ ok: boolean; detail?: string }>;
}

export interface LoadedChannel {
  manifest: ChannelManifest;
  channelAccount: string;
  sources: SourceDescriptor[];
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  enabled: boolean;
  healthy: boolean;
  detail: string;
}

export type InboundHandler = (event: InboundEvent) => Promise<InboundAck> | InboundAck;
export type OutboundHandler = (msg: OutboundMessage) => Promise<void>;

const noopLog: ChannelLogger = {
  info() {},
  warn() {},
};

/**
 * In-process channel loader. Daemon owns account binding lookup — plugins cannot spoof accountId.
 */
export class ChannelLoader {
  private readonly plugins = new Map<string, ChannelPlugin>();
  private readonly loaded = new Map<string, LoadedChannel>();
  private readonly registeredSources = new Map<string, SourceDescriptor[]>();
  private readonly rawRefOwners = new Map<string, RawRefOwner>();
  private readonly contexts = new Map<string, ChannelContext>();

  constructor(
    private readonly onInbound: InboundHandler,
    private readonly onOutbound: OutboundHandler,
    private readonly onSourcesRegistered?: (
      channelId: string,
      channelAccount: string,
      descriptors: SourceDescriptor[],
    ) => void | Promise<void>,
  ) {}

  registerPlugin(plugin: ChannelPlugin): void {
    assertManifestCompatible(plugin.manifest);
    this.plugins.set(plugin.manifest.id, plugin);
  }

  listChannels(): Array<{
    id: string;
    kind: string;
    channelKind: ChannelManifest["kind"];
    label: string;
    enabled: boolean;
    status: string;
    sourceCount: number;
    unboundSources: string[];
  }> {
    return [...this.plugins.values()].map((p) => {
      const row = this.loaded.get(p.manifest.id);
      const sources = this.registeredSources.get(p.manifest.id) ?? [];
      const enabled = row?.enabled === true;
      return {
        id: p.manifest.id,
        kind: "channel",
        channelKind: p.manifest.kind,
        label: p.manifest.label,
        enabled,
        status: row?.healthy === false ? "unhealthy" : enabled ? "running" : "stopped",
        sourceCount: sources.length,
        unboundSources: sources.map((s) => s.sourceId),
      };
    });
  }

  async setChannelConfig(
    channelId: string,
    config: Record<string, unknown>,
    secrets: Record<string, string> = {},
    options: { allowWriteCredentialOnEventSource?: boolean } = {},
  ): Promise<void> {
    const plugin = this.plugins.get(channelId);
    if (!plugin) throw new Error(`unknown channel ${channelId}`);
    for (const key of Object.keys(config)) {
      if (!(key in plugin.manifest.configSchema)) {
        throw new Error(`envoyhome.bad_params: undeclared config key ${key}`);
      }
    }
    for (const key of Object.keys(secrets)) {
      if (!(key in plugin.manifest.configSchema)) {
        throw new Error(`envoyhome.bad_params: undeclared secret key ${key}`);
      }
      const spec = plugin.manifest.configSchema[key];
      if (
        plugin.manifest.kind === "event-source" &&
        spec?.credentialScope === "write" &&
        options.allowWriteCredentialOnEventSource !== true
      ) {
        throw new Error(
          `envoyhome.bad_params: write credential ${key} refused on event-source plugin`,
        );
      }
    }
    const prev = this.loaded.get(channelId);
    const nextSecrets = { ...(prev?.secrets ?? {}), ...secrets };
    const channelAccount =
      typeof config.channelAccount === "string" && config.channelAccount.length > 0
        ? config.channelAccount
        : (prev?.channelAccount ?? "default");
    this.loaded.set(channelId, {
      manifest: plugin.manifest,
      channelAccount,
      sources: prev?.sources ?? [],
      config,
      secrets: nextSecrets,
      enabled: prev?.enabled ?? false,
      healthy: prev?.healthy ?? true,
      detail: prev?.detail ?? "",
    });
  }

  /** Status must never echo secrets (V-CH-9 / V-HA-9). */
  getChannelStatus(channelId: string): {
    enabled: boolean;
    healthy: boolean;
    detail: string;
    config: Record<string, unknown>;
    channelAccount: string;
    unboundSources: SourceDescriptor[];
  } {
    const row = this.loaded.get(channelId);
    if (!row) {
      return {
        enabled: false,
        healthy: false,
        detail: "not configured",
        config: {},
        channelAccount: "default",
        unboundSources: [],
      };
    }
    return {
      enabled: row.enabled,
      healthy: row.healthy,
      detail: row.detail,
      config: { ...row.config },
      channelAccount: row.channelAccount,
      unboundSources: this.registeredSources.get(channelId) ?? [],
    };
  }

  getLoaded(channelId: string): LoadedChannel | undefined {
    return this.loaded.get(channelId);
  }

  noteRawRefOwner(channel: string, channelAccount: string, rawRef: string, accountId: string): void {
    this.rawRefOwners.set(rawRefKey(channel, channelAccount, rawRef), {
      accountId,
      channel,
      channelAccount,
    });
  }

  async enableChannel(channelId: string, channelAccount?: string): Promise<void> {
    const plugin = this.plugins.get(channelId);
    const row = this.loaded.get(channelId);
    if (!plugin || !row) throw new Error(`channel ${channelId} not configured`);
    const instanceAccount = channelAccount ?? row.channelAccount;
    row.channelAccount = instanceAccount;
    const sources: SourceDescriptor[] = [];
    const secrets: SecretHandle = {
      get: (name) => row.secrets[name],
    };
    const ctx: ChannelContext = {
      channel: channelId,
      channelAccount: instanceAccount,
      config: { ...row.config },
      secrets,
      log: noopLog,
      registerSources: (descriptors) => {
        sources.push(...descriptors);
        this.registeredSources.set(channelId, [...sources]);
        void this.onSourcesRegistered?.(channelId, instanceAccount, descriptors);
      },
      emitInbound: async (partial) => this.handlePluginEmit(channelId, instanceAccount, partial),
      outbound: async (msg) => {
        const normalized = normalizeOutbound(plugin.manifest.kind, msg);
        assertNotificationOnly(plugin.manifest.kind, normalized);
        assertRawRefOwner(this.rawRefOwners, channelId, instanceAccount, normalized);
        await this.onOutbound(normalized);
      },
    };

    await plugin.start(ctx);
    this.contexts.set(channelId, ctx);
    row.enabled = true;
    row.sources = sources;
    row.healthy = true;
    row.detail = "running";
    if (plugin.health) {
      const h = await plugin.health();
      row.healthy = h.ok;
      row.detail = h.detail ?? (h.ok ? "running" : "unhealthy");
    }
    this.loaded.set(channelId, row);
  }

  async disableChannel(channelId: string): Promise<void> {
    const plugin = this.plugins.get(channelId);
    const row = this.loaded.get(channelId);
    if (plugin?.stop) await plugin.stop();
    if (row) {
      row.enabled = false;
      row.detail = "stopped";
      this.loaded.set(channelId, row);
    }
    this.contexts.delete(channelId);
  }

  async deliverOutbound(channelId: string, msg: OutboundMessage): Promise<void> {
    const plugin = this.plugins.get(channelId);
    const row = this.loaded.get(channelId);
    if (!plugin || !row?.enabled) {
      throw new Error(`channel ${channelId} is not enabled`);
    }
    const normalized = normalizeOutbound(plugin.manifest.kind, msg);
    assertNotificationOnly(plugin.manifest.kind, normalized);
    assertRawRefOwner(this.rawRefOwners, channelId, row.channelAccount, normalized);
    if (plugin.send) {
      await plugin.send(normalized);
      return;
    }
    const ctx = this.contexts.get(channelId);
    if (ctx) await ctx.outbound(normalized);
  }

  isSourceRegistered(channelId: string, sourceId: string): boolean {
    return (this.registeredSources.get(channelId) ?? []).some((s) => s.sourceId === sourceId);
  }

  getContextForTests(channelId: string): ChannelContext | undefined {
    return this.contexts.get(channelId);
  }

  private async handlePluginEmit(
    channelId: string,
    channelAccount: string,
    partial: Omit<InboundEvent, "channel" | "channelAccount" | "receivedAt"> & {
      text?: string;
      senderId?: string;
      sourceId?: string;
    },
  ): Promise<InboundAck> {
    const event = buildInboundEvent(channelId, channelAccount, partial);
    const row = this.loaded.get(channelId);
    const intakeOpen = row?.enabled === true;
    const blocked = gateInbound(event, {
      intakeOpen,
      registeredSourceIds: (this.registeredSources.get(channelId) ?? []).map((s) => s.sourceId),
    });
    if (blocked) return blocked;
    return await this.onInbound(event);
  }
}
