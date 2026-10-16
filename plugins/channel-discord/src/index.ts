/**
 * Discord Bot API channel — chat kind, DM-only Chat ingress (Design §5.0 / §5.3.1).
 * Gateway MESSAGE_CREATE for DMs; replies via REST create-message.
 * No guild automation, no actuate, no Home chat surface.
 */

import type { ChannelContext, ChannelPlugin, OutboundMessage } from "@envoyhome/channel-api";

/** DIRECT_MESSAGES intent — Chat/DM only (no guild message flood). */
const INTENT_DIRECT_MESSAGES = 1 << 12;

export const discordManifest = {
  id: "discord",
  apiVersion: 1,
  kind: "chat" as const,
  label: "Discord",
  capabilities: ["text"] as const,
  configSchema: {
    channelAccount: { required: false },
    botToken: { secret: true, required: true, credentialScope: "read" as const },
    apiBase: { required: false },
  },
};

type DiscordFetch = typeof fetch;
type WsCtor = typeof WebSocket;

interface GatewayHello {
  op: 10;
  d: { heartbeat_interval: number };
}

interface DiscordUser {
  id: string;
  username?: string;
  bot?: boolean;
}

interface DiscordMessage {
  id: string;
  content?: string;
  channel_id: string;
  guild_id?: string;
  author?: DiscordUser;
}

/** Discord channel type 1 = DM; 3 = group DM (must ignore for Chat-only). */
const DISCORD_CHANNEL_DM = 1;

export type CreateDiscordChannelOpts = {
  fetch?: DiscordFetch;
  WebSocket?: WsCtor;
};

export function createDiscordChannel(opts?: CreateDiscordChannelOpts): ChannelPlugin {
  const http = opts?.fetch ?? fetch;
  const Ws = opts?.WebSocket ?? WebSocket;
  let ctxRef: ChannelContext | undefined;
  let tokenRef: string | undefined;
  let apiBase = "https://discord.com/api/v10";
  let botUserId: string | undefined;
  let botUsername: string | undefined;
  let stopGateway: (() => void) | undefined;
  let seq: number | null = null;
  /** Cache channel_id → type so Group DMs (type 3) stay out of Chat. */
  const channelTypeCache = new Map<string, number>();

  async function api<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const token = tokenRef;
    if (!token) throw new Error("discord: no botToken");
    const init: RequestInit = {
      method,
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json",
        "user-agent": "EnvoyHome-Discord/0.0 (https://github.com/envoyhome)",
      },
    };
    if (body) init.body = JSON.stringify(body);
    const res = await http(`${apiBase}${path}`, init);
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as T & { message?: string; code?: number };
    if (!res.ok) {
      const msg = typeof json?.message === "string" ? json.message : `HTTP ${res.status}`;
      throw new Error(`discord API ${method} ${path}: ${msg}`);
    }
    return json;
  }

  async function sendText(channelId: string, text: string): Promise<void> {
    const content = text.length > 2000 ? `${text.slice(0, 1990)}…` : text;
    await api("POST", `/channels/${channelId}/messages`, { content });
  }

  async function isDmChannel(channelId: string): Promise<boolean> {
    const cached = channelTypeCache.get(channelId);
    if (cached !== undefined) return cached === DISCORD_CHANNEL_DM;
    try {
      const ch = await api<{ type?: number }>("GET", `/channels/${channelId}`);
      const type = typeof ch.type === "number" ? ch.type : -1;
      channelTypeCache.set(channelId, type);
      return type === DISCORD_CHANNEL_DM;
    } catch {
      // Fail closed — unknown channel shape is not Chat DM.
      return false;
    }
  }

  async function handleMessage(msg: DiscordMessage, ctx: ChannelContext): Promise<void> {
    if (!msg.author || msg.author.bot) return;
    // Chat only — ignore guild traffic even if intents expand later.
    if (msg.guild_id) return;
    // DIRECT_MESSAGES intent also delivers Group DMs (no guild_id, type 3).
    if (!(await isDmChannel(msg.channel_id))) return;
    const text = (msg.content || "").trim();
    if (!text) return;
    const senderId = msg.author.id;
    const rawRef = `${msg.channel_id}:${msg.id}`;
    const ack = await ctx.emitInbound({
      senderId,
      text,
      rawRef,
    });
    if (ack.pairingRequired) {
      const who = msg.author.username ? `@${msg.author.username}` : senderId;
      await sendText(
        msg.channel_id,
        `EnvoyHome: ${who} is not bound yet.\n` +
          `In Settings → Connections → Channels, link Discord sender ID \`${senderId}\` ` +
          `to a profile, then message again.`,
      ).catch((err) => {
        ctx.log.warn(`discord pairing reply: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  function startGateway(ctx: ChannelContext): void {
    stopGateway?.();
    let alive = true;
    let ws: WebSocket | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const clearHeartbeat = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    };

    stopGateway = () => {
      alive = false;
      clearHeartbeat();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = undefined;
    };

    const connect = async (): Promise<void> => {
      if (!alive || !tokenRef) return;
      try {
        // Drop any prior socket before opening a new one (reconnect path).
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
        ws = undefined;
        const gate = await api<{ url: string }>("GET", "/gateway/bot");
        if (!alive || !tokenRef) return;
        const url = `${gate.url}/?v=10&encoding=json`;
        ws = new Ws(url);
        ws.addEventListener("open", () => {
          ctx.log.info(`discord: gateway open for ${ctx.channelAccount}`);
        });
        ws.addEventListener("message", (ev) => {
          void (async () => {
            let packet: { op: number; d?: unknown; s?: number | null; t?: string };
            try {
              packet = JSON.parse(String(ev.data)) as typeof packet;
            } catch {
              return;
            }
            if (typeof packet.s === "number") seq = packet.s;
            if (packet.op === 10) {
              const hello = packet.d as GatewayHello["d"] | undefined;
              const interval = hello?.heartbeat_interval ?? 41250;
              clearHeartbeat();
              heartbeatTimer = setInterval(() => {
                try {
                  ws?.send(JSON.stringify({ op: 1, d: seq }));
                } catch {
                  /* ignore */
                }
              }, interval * 0.9);
              ws?.send(
                JSON.stringify({
                  op: 2,
                  d: {
                    token: tokenRef,
                    intents: INTENT_DIRECT_MESSAGES,
                    properties: {
                      os: process.platform,
                      browser: "envoyhome",
                      device: "envoyhome",
                    },
                  },
                }),
              );
              return;
            }
            if (packet.op === 0 && packet.t === "READY") {
              const d = packet.d as { user?: DiscordUser } | undefined;
              botUserId = d?.user?.id;
              botUsername = d?.user?.username;
              ctx.log.info(
                `discord: ready as @${botUsername ?? botUserId ?? "bot"} (DM Chat only)`,
              );
              return;
            }
            if (packet.op === 0 && packet.t === "MESSAGE_CREATE") {
              await handleMessage(packet.d as DiscordMessage, ctx);
            }
          })().catch((err) => {
            ctx.log.warn(`discord gateway msg: ${err instanceof Error ? err.message : String(err)}`);
          });
        });
        ws.addEventListener("close", () => {
          clearHeartbeat();
          if (!alive) return;
          ctx.log.warn("discord: gateway closed — reconnecting");
          reconnectTimer = setTimeout(() => {
            void connect();
          }, 3000);
        });
        ws.addEventListener("error", () => {
          ctx.log.warn("discord: gateway error");
        });
      } catch (err) {
        ctx.log.warn(`discord: gateway connect failed — ${err instanceof Error ? err.message : String(err)}`);
        if (!alive) return;
        reconnectTimer = setTimeout(() => {
          void connect();
        }, 5000);
      }
    };

    void connect();
  }

  return {
    manifest: discordManifest,
    async start(ctx) {
      ctxRef = ctx;
      const token = ctx.secrets.get("botToken");
      tokenRef = token;
      botUserId = undefined;
      botUsername = undefined;
      seq = null;
      if (typeof ctx.config.apiBase === "string" && ctx.config.apiBase) {
        apiBase = ctx.config.apiBase.replace(/\/$/, "");
      } else {
        apiBase = "https://discord.com/api/v10";
      }
      if (!token) {
        ctx.log.warn("discord: botToken not configured — channel idle until setChannelConfig");
        return;
      }
      try {
        const me = await api<DiscordUser>("GET", "/users/@me");
        botUserId = me.id;
        botUsername = me.username;
        ctx.log.info(`discord: bot @${me.username ?? me.id} for ${ctx.channelAccount}`);
      } catch (err) {
        ctx.log.warn(`discord: @me failed — ${err instanceof Error ? err.message : String(err)}`);
      }
      startGateway(ctx);
    },
    async stop() {
      stopGateway?.();
      stopGateway = undefined;
      tokenRef = undefined;
      botUserId = undefined;
      botUsername = undefined;
      seq = null;
      channelTypeCache.clear();
    },
    async health() {
      if (!tokenRef) return { ok: false, detail: "botToken missing" };
      try {
        const me = await api<DiscordUser>("GET", "/users/@me");
        botUserId = me.id;
        botUsername = me.username;
        return {
          ok: true,
          detail: me.username ? `discord @${me.username}` : `discord bot ${me.id}`,
        };
      } catch (err) {
        return {
          ok: false,
          detail: `users/@me failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    async send(msg: OutboundMessage) {
      if (!tokenRef) return;
      let channelId: string | undefined;
      if (msg.rawRef) {
        channelId = msg.rawRef.split(":")[0];
      }
      if (!channelId) {
        ctxRef?.log.warn("discord send: missing channel id (rawRef)");
        return;
      }
      await sendText(channelId, msg.text);
    },
  };
}

export default createDiscordChannel();
