/**
 * Slack Socket Mode channel — chat kind, IM/DM only (Design §5.0 / §5.3.1).
 * App-level token opens the socket; bot token sends chat.postMessage replies.
 */

import type { ChannelContext, ChannelPlugin, OutboundMessage } from "@envoyhome/channel-api";

export const slackManifest = {
  id: "slack",
  apiVersion: 1,
  kind: "chat" as const,
  label: "Slack",
  capabilities: ["text"] as const,
  configSchema: {
    channelAccount: { required: false },
    botToken: { secret: true, required: true, credentialScope: "read" as const },
    appToken: { secret: true, required: true, credentialScope: "read" as const },
    apiBase: { required: false },
  },
};

type SlackFetch = typeof fetch;
type WsCtor = typeof WebSocket;

export type CreateSlackChannelOpts = {
  fetch?: SlackFetch;
  WebSocket?: WsCtor;
};

interface SlackMessageEvent {
  type?: string;
  subtype?: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  bot_id?: string;
  ts?: string;
}

export function createSlackChannel(opts?: CreateSlackChannelOpts): ChannelPlugin {
  const http = opts?.fetch ?? fetch;
  const Ws = opts?.WebSocket ?? WebSocket;
  let ctxRef: ChannelContext | undefined;
  let botToken: string | undefined;
  let appToken: string | undefined;
  let apiBase = "https://slack.com/api";
  let botUserId: string | undefined;
  let teamName: string | undefined;
  let stopSocket: (() => void) | undefined;

  async function api<T extends { ok?: boolean; error?: string }>(
    method: string,
    body?: Record<string, unknown>,
    token?: string,
  ): Promise<T> {
    const auth = token ?? botToken;
    if (!auth) throw new Error("slack: no botToken");
    const res = await http(`${apiBase}/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body ?? {}),
    });
    const json = (await res.json()) as T;
    if (!json.ok) {
      throw new Error(`slack API ${method}: ${json.error ?? res.status}`);
    }
    return json;
  }

  async function sendText(channel: string, text: string): Promise<void> {
    const content = text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
    await api("chat.postMessage", { channel, text: content });
  }

  async function handleMessage(ev: SlackMessageEvent, ctx: ChannelContext): Promise<void> {
    if (ev.type !== "message" || ev.subtype || ev.bot_id) return;
    // Chat only — DMs (im). Ignore channels / groups / mpim.
    if (ev.channel_type && ev.channel_type !== "im") return;
    if (!ev.channel_type && ev.channel && !ev.channel.startsWith("D")) return;
    const text = (ev.text || "").trim();
    if (!text || !ev.user || !ev.channel) return;
    if (botUserId && ev.user === botUserId) return;
    const rawRef = `${ev.channel}:${ev.ts ?? "0"}`;
    const ack = await ctx.emitInbound({
      senderId: ev.user,
      text,
      rawRef,
    });
    if (ack.pairingRequired) {
      await sendText(
        ev.channel,
        `EnvoyHome: you are not bound yet.\n` +
          `In Settings → Connections → Channels, link Slack sender ID \`${ev.user}\` ` +
          `to a profile, then message again.`,
      ).catch((err) => {
        ctx.log.warn(`slack pairing reply: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  function startSocket(ctx: ChannelContext): void {
    stopSocket?.();
    let alive = true;
    let ws: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    stopSocket = () => {
      alive = false;
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
      if (!alive || !appToken || !botToken) return;
      try {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
        ws = undefined;
        const opened = await api<{ ok: boolean; url: string }>(
          "apps.connections.open",
          {},
          appToken,
        );
        if (!alive || !appToken || !botToken) return;
        ws = new Ws(opened.url);
        ws.addEventListener("open", () => {
          ctx.log.info(`slack: socket open for ${ctx.channelAccount}`);
        });
        ws.addEventListener("message", (ev) => {
          void (async () => {
            let packet: {
              type?: string;
              envelope_id?: string;
              payload?: { event?: SlackMessageEvent; type?: string };
            };
            try {
              packet = JSON.parse(String(ev.data)) as typeof packet;
            } catch {
              return;
            }
            if (packet.type === "hello") return;
            if (packet.envelope_id) {
              try {
                ws?.send(JSON.stringify({ envelope_id: packet.envelope_id }));
              } catch {
                /* ignore */
              }
            }
            if (packet.type === "events_api") {
              const event = packet.payload?.event;
              if (event) await handleMessage(event, ctx);
            }
          })().catch((err) => {
            ctx.log.warn(`slack socket msg: ${err instanceof Error ? err.message : String(err)}`);
          });
        });
        ws.addEventListener("close", () => {
          if (!alive) return;
          ctx.log.warn("slack: socket closed — reconnecting");
          reconnectTimer = setTimeout(() => {
            void connect();
          }, 3000);
        });
        ws.addEventListener("error", () => {
          ctx.log.warn("slack: socket error");
        });
      } catch (err) {
        ctx.log.warn(`slack: socket connect failed — ${err instanceof Error ? err.message : String(err)}`);
        if (!alive) return;
        reconnectTimer = setTimeout(() => {
          void connect();
        }, 5000);
      }
    };

    void connect();
  }

  return {
    manifest: slackManifest,
    async start(ctx) {
      ctxRef = ctx;
      botToken = ctx.secrets.get("botToken");
      appToken = ctx.secrets.get("appToken");
      botUserId = undefined;
      teamName = undefined;
      if (typeof ctx.config.apiBase === "string" && ctx.config.apiBase) {
        apiBase = ctx.config.apiBase.replace(/\/$/, "");
      } else {
        apiBase = "https://slack.com/api";
      }
      if (!botToken || !appToken) {
        ctx.log.warn(
          "slack: botToken and appToken required — channel idle until setChannelConfig (Socket Mode)",
        );
        return;
      }
      try {
        const auth = await api<{
          ok: boolean;
          user_id?: string;
          team?: string;
        }>("auth.test", {});
        botUserId = auth.user_id;
        teamName = auth.team;
        ctx.log.info(`slack: bot ${botUserId ?? "?"} @ ${teamName ?? "workspace"}`);
      } catch (err) {
        ctx.log.warn(`slack: auth.test failed — ${err instanceof Error ? err.message : String(err)}`);
      }
      startSocket(ctx);
    },
    async stop() {
      stopSocket?.();
      stopSocket = undefined;
      botToken = undefined;
      appToken = undefined;
      botUserId = undefined;
      teamName = undefined;
    },
    async health() {
      if (!botToken) return { ok: false, detail: "botToken missing" };
      if (!appToken) return { ok: false, detail: "appToken missing (Socket Mode)" };
      try {
        const auth = await api<{ ok: boolean; user_id?: string; team?: string }>("auth.test", {});
        botUserId = auth.user_id;
        teamName = auth.team;
        return {
          ok: true,
          detail: teamName ? `slack @ ${teamName}` : `slack bot ${auth.user_id ?? ""}`,
        };
      } catch (err) {
        return {
          ok: false,
          detail: `auth.test failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    async send(msg: OutboundMessage) {
      if (!botToken) return;
      let channel: string | undefined;
      if (msg.rawRef) {
        channel = msg.rawRef.split(":")[0];
      }
      if (!channel) {
        ctxRef?.log.warn("slack send: missing channel id (rawRef)");
        return;
      }
      await sendText(channel, msg.text);
    },
  };
}

export default createSlackChannel();
