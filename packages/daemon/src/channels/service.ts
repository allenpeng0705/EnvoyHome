import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  ChannelLoader,
  createFakeChannel,
  createFakeEventSource,
  type ChannelPlugin,
  type InboundAck,
  type InboundEvent,
  type OutboundMessage,
} from "@envoyhome/channel-api";
import type { BindingStore } from "../bindings.js";
import type { DaemonLogger } from "../logger.js";
import { ObjectRegistry } from "../object-registry.js";
import { ChannelStateStore } from "./state.js";

export class ChannelError extends Error {
  override readonly name = "ChannelError";
  constructor(
    readonly code: "bad_params" | "not_found" | "not_configured",
    message: string,
  ) {
    super(message);
  }
}

export interface ChannelServiceDeps {
  stateDir: string;
  bindings: BindingStore;
  logger: DaemonLogger;
  /** Bundled plugins beyond in-tree fakes (telegram demo). */
  bundledPlugins?: ChannelPlugin[];
}

export class ChannelService {
  readonly loader: ChannelLoader;
  readonly objects: ObjectRegistry;
  readonly state: ChannelStateStore;
  private readonly secrets = new Map<string, Record<string, string>>();

  constructor(private readonly deps: ChannelServiceDeps) {
    this.objects = new ObjectRegistry(deps.stateDir);
    this.state = new ChannelStateStore(deps.stateDir);
    this.loader = new ChannelLoader(
      (event) => this.handleInbound(event),
      async (msg) => this.handlePluginOutbound(msg),
      async (channelId, channelAccount, descriptors) => {
        await this.objects.registerSources(channelId, channelAccount, descriptors);
      },
    );
    this.loader.registerPlugin(createFakeChannel());
    this.loader.registerPlugin(createFakeEventSource());
    for (const p of deps.bundledPlugins ?? []) {
      this.loader.registerPlugin(p);
    }
  }

  async loadPersisted(): Promise<void> {
    const rows = await this.state.list();
    for (const row of rows) {
      const secretValues: Record<string, string> = {};
      for (const key of row.secretKeys) {
        try {
          secretValues[key] = await readFile(this.state.secretPath(row.id, key), "utf8");
        } catch {
          // missing secret file — leave unset
        }
      }
      this.secrets.set(row.id, secretValues);
      await this.loader.setChannelConfig(row.id, row.config, secretValues);
      if (row.enabled) {
        await this.loader.enableChannel(row.id, row.channelAccount);
      }
    }
  }

  listChannels() {
    return this.loader.listChannels();
  }

  async setChannelConfig(
    id: string,
    config: Record<string, unknown> = {},
    secrets: Record<string, string> = {},
  ): Promise<{ id: string; enabled: boolean; healthy: boolean }> {
    await mkdir(this.state.paths.secretsDir, { recursive: true });
    try {
      await this.loader.setChannelConfig(id, config, secrets);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("undeclared")) {
        throw new ChannelError("bad_params", msg);
      }
      throw err;
    }
    const prev = await this.state.get(id);
    const status = this.loader.getChannelStatus(id);
    const secretKeys = new Set(prev?.secretKeys ?? []);
    for (const [field, value] of Object.entries(secrets)) {
      const path = this.state.secretPath(id, field);
      await writeFile(path, value, { mode: 0o600 });
      secretKeys.add(field);
      const bag = { ...(this.secrets.get(id) ?? {}), [field]: value };
      this.secrets.set(id, bag);
      void path;
    }
    await this.state.upsert({
      id,
      channelAccount: status.channelAccount,
      enabled: status.enabled,
      config: status.config,
      secretKeys: [...secretKeys],
    });
    const st = this.loader.getChannelStatus(id);
    return { id, enabled: st.enabled, healthy: st.healthy };
  }

  async enableChannel(id: string): Promise<void> {
    const row = await this.state.get(id);
    if (!row) throw new ChannelError("not_configured", `channel ${id} not configured`);
    await this.loader.enableChannel(id, row.channelAccount);
    await this.syncRegistryFromLoader(id);
    await this.state.upsert({ ...row, enabled: true });
  }

  async disableChannel(id: string): Promise<void> {
    await this.loader.disableChannel(id);
    const row = await this.state.get(id);
    if (row) await this.state.upsert({ ...row, enabled: false });
  }

  getChannelStatus(id: string, callerAccountId?: string, all?: boolean) {
    const st = this.loader.getChannelStatus(id);
    // V-SEC-11: account-scoped callers must not see a daemon-wide unbound inventory.
    const unbound =
      all === true || callerAccountId === undefined
        ? st.unboundSources.map((s) => s.sourceId)
        : [];
    return {
      id,
      enabled: st.enabled,
      healthy: st.healthy,
      detail: st.detail,
      sourceCount: st.unboundSources.length,
      unboundSources: unbound,
    };
  }

  async deliverOutbound(channelId: string, msg: OutboundMessage): Promise<void> {
    await this.loader.deliverOutbound(channelId, msg);
  }

  /** Hatch + sidecar path (V-CH-1 / V-CH-6) — shares binding rules with plugins. */
  async handleHatchText(input: {
    accountId: string;
    text: string;
  }): Promise<{
    turnId: string;
    text: string;
    format: "markdown";
    accepted: boolean;
    accountId: string;
  }> {
    const turnId = `turn-hatch-${Date.now()}`;
    this.deps.logger.info(`hatch inbound account=${input.accountId} chars=${input.text.length}`);
    return {
      turnId,
      text: "",
      format: "markdown",
      accepted: true,
      accountId: input.accountId,
    };
  }

  private async syncRegistryFromLoader(channelId: string): Promise<void> {
    const st = this.loader.getChannelStatus(channelId);
    await this.objects.registerSources(channelId, st.channelAccount, st.unboundSources);
  }

  private async handleInbound(event: InboundEvent): Promise<InboundAck> {
    const st = this.loader.getChannelStatus(event.channel);
    if (!st.enabled) {
      return { accepted: false, reason: "channel_disabled" };
    }

    if (event.senderId) {
      const binding = await this.deps.bindings.resolveSender(
        event.channel,
        event.channelAccount,
        event.senderId,
      );
      if (!binding) {
        return { accepted: false, pairingRequired: true, reason: "unknown_sender" };
      }
      if (event.rawRef) {
        this.loader.noteRawRefOwner(
          event.channel,
          event.channelAccount,
          event.rawRef,
          binding.accountId,
        );
      }
      this.deps.logger.info(
        `channel inbound ${event.channel}/${event.channelAccount} account=${binding.accountId}`,
      );
      return { accepted: true, sessionId: `sess-${binding.accountId}-${Date.now()}` };
    }

    if (event.sourceId) {
      const obj = await this.objects.get(event.channel, event.channelAccount, event.sourceId);
      if (!obj) {
        return { accepted: false, reason: "source_not_registered" };
      }
      if (!obj.accountId) {
        await this.objects.touchUnbound(event.channel, event.channelAccount, event.sourceId);
        return { accepted: true, reason: "unbound_no_turn" };
      }
      return { accepted: true, sessionId: `sess-${obj.accountId}-${Date.now()}` };
    }

    return { accepted: false, reason: "missing_sender_or_source" };
  }

  private async handlePluginOutbound(msg: OutboundMessage): Promise<void> {
    this.deps.logger.info(`channel outbound account=${msg.accountId} kind=${msg.kind ?? "reply"}`);
  }
}
