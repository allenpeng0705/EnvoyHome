/**
 * Feishu / Lark chat channel — p2p Chat only (Design §5.0).
 * Uses tenant_access_token + long-connection WebSocket (injectable for tests).
 * Event: im.message.receive_v1 (p2p); group messages ignored.
 */

import type { ChannelContext, ChannelPlugin, OutboundMessage } from "@envoyhome/channel-api";

export const feishuManifest = {
  id: "feishu",
  apiVersion: 1,
  kind: "chat" as const,
  label: "Feishu / Lark",
  capabilities: ["text"] as const,
  configSchema: {
    channelAccount: { required: false },
    appId: { secret: true, required: true, credentialScope: "read" as const },
    appSecret: { secret: true, required: true, credentialScope: "read" as const },
    apiBase: { required: false },
  },
};

type FeishuFetch = typeof fetch;
type WsCtor = typeof WebSocket;

export type CreateFeishuChannelOpts = {
  fetch?: FeishuFetch;
  WebSocket?: WsCtor;
};

export function createFeishuChannel(opts?: CreateFeishuChannelOpts): ChannelPlugin {
  const http = opts?.fetch ?? fetch;
  const Ws = opts?.WebSocket ?? WebSocket;
  let ctxRef: ChannelContext | undefined;
  let appId: string | undefined;
  let appSecret: string | undefined;
  let apiBase = "https://open.feishu.cn";
  let tenantToken: string | undefined;
  let stopWs: (() => void) | undefined;

  async function refreshToken(): Promise<string> {
    if (!appId || !appSecret) throw new Error("feishu: missing appId/appSecret");
    const res = await http(`${apiBase}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const json = (await res.json()) as {
      code?: number;
      msg?: string;
      tenant_access_token?: string;
    };
    if (json.code !== 0 || !json.tenant_access_token) {
      throw new Error(`feishu token: ${json.msg ?? res.status}`);
    }
    tenantToken = json.tenant_access_token;
    return tenantToken;
  }

  async function api<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const token = tenantToken ?? (await refreshToken());
    const res = await http(`${apiBase}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json()) as T & { code?: number; msg?: string };
    if (typeof json === "object" && json && "code" in json && json.code !== 0) {
      throw new Error(`feishu API ${path}: ${json.msg ?? json.code}`);
    }
    return json;
  }

  async function sendText(receiveId: string, text: string): Promise<void> {
    const content = text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
    await api("POST", "/open-apis/im/v1/messages?receive_id_type=open_id", {
      receive_id: receiveId,
      msg_type: "text",
      content: JSON.stringify({ text: content }),
    });
  }

  async function handleEvent(raw: unknown, ctx: ChannelContext): Promise<void> {
    const envelope = raw as {
      header?: { event_type?: string };
      event?: {
        message?: {
          chat_type?: string;
          chat_id?: string;
          message_id?: string;
          message_type?: string;
          content?: string;
        };
        sender?: { sender_id?: { open_id?: string } };
      };
    };
    if (envelope.header?.event_type !== "im.message.receive_v1") return;
    const msg = envelope.event?.message;
    if (!msg || msg.chat_type !== "p2p") return; // Chat only — ignore group
    if (msg.message_type !== "text") return;
    let text = "";
    try {
      text = String(JSON.parse(msg.content || "{}").text || "").trim();
    } catch {
      return;
    }
    const senderId = envelope.event?.sender?.sender_id?.open_id;
    if (!text || !senderId) return;
    const rawRef = `${senderId}:${msg.message_id ?? "0"}`;
    const ack = await ctx.emitInbound({ senderId, text, rawRef });
    if (ack.pairingRequired) {
      await sendText(
        senderId,
        `EnvoyHome: you are not bound yet.\n` +
          `In Settings → Connections → Channels, link Feishu sender ID \`${senderId}\` ` +
          `to a profile, then message again.`,
      ).catch((err) => {
        ctx.log.warn(`feishu pairing reply: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  function startLongConnection(ctx: ChannelContext): void {
    stopWs?.();
    let alive = true;
    let ws: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    stopWs = () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = undefined;
    };

    const connect = async (): Promise<void> => {
      if (!alive || !appId || !appSecret) return;
      try {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
        await refreshToken();
        if (!alive || !appId || !appSecret) return;
        // Endpoint discovery — overridable via apiBase host; tests inject WS URL via fake fetch.
        const ep = await api<{ data?: { url?: string } }>(
          "POST",
          "/open-apis/callback/ws/endpoint",
          {},
        );
        if (!alive || !appId || !appSecret) return;
        const url = ep.data?.url;
        if (!url) throw new Error("feishu: no ws endpoint");
        ws = new Ws(url);
        ws.addEventListener("open", () => {
          ctx.log.info(`feishu: long-connection open for ${ctx.channelAccount}`);
          // Auth frame (shape mirrors Feishu WS client; tests may ignore).
          try {
            ws?.send(JSON.stringify({ type: "auth", app_id: appId }));
          } catch {
            /* ignore */
          }
        });
        ws.addEventListener("message", (ev) => {
          void (async () => {
            let packet: unknown;
            try {
              packet = JSON.parse(String(ev.data));
            } catch {
              return;
            }
            const p = packet as { type?: string; envelope_id?: string; data?: unknown };
            if (p.envelope_id) {
              try {
                ws?.send(JSON.stringify({ type: "ack", envelope_id: p.envelope_id }));
              } catch {
                /* ignore */
              }
            }
            await handleEvent(p.data ?? packet, ctx);
          })().catch((err) => {
            ctx.log.warn(`feishu ws: ${err instanceof Error ? err.message : String(err)}`);
          });
        });
        ws.addEventListener("close", () => {
          if (!alive) return;
          reconnectTimer = setTimeout(() => void connect(), 3000);
        });
      } catch (err) {
        ctx.log.warn(`feishu: connect failed — ${err instanceof Error ? err.message : String(err)}`);
        if (!alive) return;
        reconnectTimer = setTimeout(() => void connect(), 5000);
      }
    };

    void connect();
  }

  return {
    manifest: feishuManifest,
    async start(ctx) {
      ctxRef = ctx;
      appId = ctx.secrets.get("appId");
      appSecret = ctx.secrets.get("appSecret");
      if (typeof ctx.config.apiBase === "string" && ctx.config.apiBase) {
        apiBase = ctx.config.apiBase.replace(/\/$/, "");
      } else {
        apiBase = "https://open.feishu.cn";
      }
      if (!appId || !appSecret) {
        ctx.log.warn("feishu: appId/appSecret required — idle until setChannelConfig");
        return;
      }
      try {
        await refreshToken();
        ctx.log.info(`feishu: token ok for ${ctx.channelAccount}`);
      } catch (err) {
        ctx.log.warn(`feishu: token failed — ${err instanceof Error ? err.message : String(err)}`);
      }
      startLongConnection(ctx);
    },
    async stop() {
      stopWs?.();
      stopWs = undefined;
      appId = undefined;
      appSecret = undefined;
      tenantToken = undefined;
    },
    async health() {
      if (!appId || !appSecret) return { ok: false, detail: "appId/appSecret missing" };
      try {
        await refreshToken();
        return { ok: true, detail: "feishu token ok" };
      } catch (err) {
        return {
          ok: false,
          detail: `token failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    async send(msg: OutboundMessage) {
      if (!tenantToken && !(await refreshToken().catch(() => ""))) return;
      let receiveId: string | undefined;
      if (msg.rawRef) receiveId = msg.rawRef.split(":")[0];
      if (!receiveId) {
        ctxRef?.log.warn("feishu send: missing receive id (rawRef)");
        return;
      }
      await sendText(receiveId, msg.text);
    },
  };
}

export default createFeishuChannel();
