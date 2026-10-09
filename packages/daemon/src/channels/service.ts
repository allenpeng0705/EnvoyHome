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
import type { TurnCompleteInfo, TurnService, TurnWireResult } from "../turn-service.js";
import type { PrivacyModeStore } from "../policy-store.js";

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
  private turns: TurnService | undefined;
  private privacyMode: PrivacyModeStore | undefined;

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

  /** Wire after TurnService is constructed (breaks init cycle). */
  attachTurns(turns: TurnService, privacyMode: PrivacyModeStore): void {
    this.turns = turns;
    this.privacyMode = privacyMode;
    turns.setOnComplete((info) => this.onTurnComplete(info));
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
    const prev = await this.state.get(id);
    const wasEnabled = prev?.enabled === true || this.loader.getChannelStatus(id).enabled;
    try {
      await this.loader.setChannelConfig(id, config, secrets);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("undeclared")) {
        throw new ChannelError("bad_params", msg);
      }
      throw err;
    }
    const status = this.loader.getChannelStatus(id);
    const secretKeys = new Set(prev?.secretKeys ?? []);
    for (const [field, value] of Object.entries(secrets)) {
      const path = this.state.secretPath(id, field);
      if (value === "") {
        secretKeys.delete(field);
        const bag = { ...(this.secrets.get(id) ?? {}) };
        delete bag[field];
        this.secrets.set(id, bag);
        try {
          await writeFile(path, "", { mode: 0o600 });
        } catch {
          // best-effort clear
        }
      } else {
        await writeFile(path, value, { mode: 0o600 });
        secretKeys.add(field);
        const bag = { ...(this.secrets.get(id) ?? {}), [field]: value };
        this.secrets.set(id, bag);
      }
    }
    await this.state.upsert({
      id,
      channelAccount: status.channelAccount,
      enabled: wasEnabled,
      config: status.config,
      secretKeys: [...secretKeys],
    });
    // Restart so a new botToken / apiBase takes effect without a daemon reboot.
    if (wasEnabled) {
      await this.loader.disableChannel(id);
      await this.loader.enableChannel(id, status.channelAccount);
      await this.syncRegistryFromLoader(id);
      await this.state.upsert({
        id,
        channelAccount: status.channelAccount,
        enabled: true,
        config: this.loader.getChannelStatus(id).config,
        secretKeys: [...secretKeys],
      });
    }
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
    if (this.privacyMode) {
      const privacy = await this.privacyMode.get(msg.accountId);
      if (privacy.enabled && privacy.blockSmartHomeEgress) {
        const st = this.loader.getChannelStatus(channelId);
        // Chat replies still allowed; event-source notify blocked under Privacy Mode.
        if (st && (await this.isEventSource(channelId))) {
          this.deps.logger.warn(
            `privacy mode: blocked event-source outbound channel=${channelId}`,
          );
          return;
        }
      }
    }
    await this.loader.deliverOutbound(channelId, msg);
  }

  private async isEventSource(channelId: string): Promise<boolean> {
    const list = this.loader.listChannels();
    const row = list.find((c) => c.id === channelId);
    return row?.channelKind === "event-source";
  }

  /** Hatch + sidecar path (V-CH-1 / V-CH-6) — opens a real turn. */
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
    this.deps.logger.info(`hatch inbound account=${input.accountId} chars=${input.text.length}`);
    const result = await this.startTurnForAccount({
      accountId: input.accountId,
      text: input.text,
      callerKind: "hatch",
      origin: "attended",
      channel: "hatch",
    });
    return {
      turnId: result.turnId,
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

  private async startTurnForAccount(input: {
    accountId: string;
    text: string;
    callerKind: string;
    origin: "attended" | "unattended";
    channel: string;
    rawRef?: string;
  }): Promise<TurnWireResult> {
    if (!this.turns) {
      // Pre-attach (tests that only exercise binding gates).
      return {
        turnId: `turn-deferred-${Date.now()}`,
        sessionId: `sess-${input.accountId}`,
        status: "started",
        route: "direct",
      };
    }
    return this.turns.startFromInbound({
      accountId: input.accountId,
      text: input.text || "(empty)",
      callerKind: input.callerKind,
      origin: input.origin,
      channel: input.channel,
      ...(input.rawRef !== undefined ? { rawRef: input.rawRef } : {}),
    });
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
      const turn = await this.startTurnForAccount({
        accountId: binding.accountId,
        text: event.text ?? "",
        callerKind: "channel",
        origin: "attended",
        channel: event.channel,
        ...(event.rawRef !== undefined ? { rawRef: event.rawRef } : {}),
      });
      return { accepted: true, sessionId: turn.sessionId };
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
      const text =
        event.text ??
        `event source=${event.sourceId} channel=${event.channel} at=${event.receivedAt}`;
      const turn = await this.startTurnForAccount({
        accountId: obj.accountId,
        text,
        callerKind: "event-source",
        origin: "unattended",
        channel: event.channel,
        ...(event.rawRef !== undefined ? { rawRef: event.rawRef } : {}),
      });
      return { accepted: true, sessionId: turn.sessionId };
    }

    return { accepted: false, reason: "missing_sender_or_source" };
  }

  private async onTurnComplete(info: TurnCompleteInfo): Promise<void> {
    if (!info.channel || info.channel === "hatch") return;
    if (!info.replyText || info.status !== "ok") return;
    const st = this.loader.listChannels().find((c) => c.id === info.channel);
    if (!st || st.channelKind === "event-source") {
      // Event-source: notification-only outbound optional later; never reply as actuation.
      return;
    }
    await this.deliverOutbound(info.channel, {
      accountId: info.accountId,
      text: info.replyText,
      kind: "reply",
      ...(info.rawRef !== undefined ? { rawRef: info.rawRef } : {}),
    });
  }

  private async handlePluginOutbound(msg: OutboundMessage): Promise<void> {
    this.deps.logger.info(`channel outbound account=${msg.accountId} kind=${msg.kind ?? "reply"}`);
  }
}
