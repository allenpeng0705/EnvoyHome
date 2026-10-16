/**
 * DingTalk Stream Mode channel — Chat / 1:1 session only (Design §5.0).
 * clientId + clientSecret open a stream WebSocket; robot replies via sessionWebhook or API.
 */

import type { ChannelContext, ChannelPlugin, OutboundMessage } from "@envoyhome/channel-api";

export const dingtalkManifest = {
  id: "dingtalk",
  apiVersion: 1,
  kind: "chat" as const,
  label: "DingTalk",
  capabilities: ["text"] as const,
  configSchema: {
    channelAccount: { required: false },
    clientId: { secret: true, required: true, credentialScope: "read" as const },
    clientSecret: { secret: true, required: true, credentialScope: "read" as const },
    apiBase: { required: false },
    streamUrl: { required: false },
  },
};

type DingFetch = typeof fetch;
type WsCtor = typeof WebSocket;

export type CreateDingtalkChannelOpts = {
  fetch?: DingFetch;
  WebSocket?: WsCtor;
};

export function createDingtalkChannel(opts?: CreateDingtalkChannelOpts): ChannelPlugin {
  const http = opts?.fetch ?? fetch;
  const Ws = opts?.WebSocket ?? WebSocket;
  let ctxRef: ChannelContext | undefined;
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  let apiBase = "https://api.dingtalk.com";
  let streamUrl = "wss://wss-open-connection.dingtalk.com";
  let accessToken: string | undefined;
  /** sessionWebhook by sender staffId for reply without open conversation API. */
  const sessionHooks = new Map<string, string>();
  let stopStream: (() => void) | undefined;

  async function refreshToken(): Promise<string> {
    if (!clientId || !clientSecret) throw new Error("dingtalk: missing clientId/clientSecret");
    const res = await http(
      `${apiBase}/v1.0/oauth2/accessToken`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appKey: clientId, appSecret: clientSecret }),
      },
    );
    const json = (await res.json()) as { accessToken?: string; access_token?: string; message?: string };
    const token = json.accessToken || json.access_token;
    if (!token) throw new Error(`dingtalk token: ${json.message ?? res.status}`);
    accessToken = token;
    return token;
  }

  function isAllowedSessionWebhook(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") return false;
      // DingTalk session webhooks are on *.dingtalk.com only — refuse SSRF to link-local/metadata.
      return u.hostname === "dingtalk.com" || u.hostname.endsWith(".dingtalk.com");
    } catch {
      return false;
    }
  }

  async function sendText(senderId: string, text: string): Promise<void> {
    const content = text.length > 2000 ? `${text.slice(0, 1990)}…` : text;
    const hook = sessionHooks.get(senderId);
    if (hook) {
      if (!isAllowedSessionWebhook(hook)) {
        sessionHooks.delete(senderId);
        throw new Error("dingtalk: sessionWebhook host not allowed");
      }
      const res = await http(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ msgtype: "text", text: { content } }),
      });
      if (!res.ok) throw new Error(`dingtalk sessionWebhook HTTP ${res.status}`);
      return;
    }
    const token = accessToken ?? (await refreshToken());
    const res = await http(`${apiBase}/v1.0/robot/oToMessages/batchSend`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-acs-dingtalk-access-token": token,
      },
      body: JSON.stringify({
        robotCode: clientId,
        userIds: [senderId],
        msgKey: "sampleText",
        msgParam: JSON.stringify({ content }),
      }),
    });
    if (!res.ok) throw new Error(`dingtalk send HTTP ${res.status}`);
  }

  async function handleFrame(raw: unknown, ctx: ChannelContext): Promise<void> {
    const frame = raw as {
      type?: string;
      headers?: { messageId?: string; topic?: string };
      data?: string | Record<string, unknown>;
    };
    // ACK stream messages when messageId present.
    // (actual ACK is sent by caller with ws handle — see startStream)
    let data: Record<string, unknown> = {};
    if (typeof frame.data === "string") {
      try {
        data = JSON.parse(frame.data) as Record<string, unknown>;
      } catch {
        return;
      }
    } else if (frame.data && typeof frame.data === "object") {
      data = frame.data;
    }
    const text = String(
      (data.text as { content?: string } | undefined)?.content ?? data.content ?? "",
    ).trim();
    const senderId = String(
      data.senderStaffId ?? data.senderId ?? (data.sender as { staffId?: string })?.staffId ?? "",
    );
    // Chat only — require explicit 单聊; missing conversationType fails closed (not default "1").
    if (data.conversationType === undefined || data.conversationType === null) return;
    const conversationType = String(data.conversationType);
    if (conversationType !== "1" && conversationType !== "1.0") return;
    if (!text || !senderId) return;
    const hook = typeof data.sessionWebhook === "string" ? data.sessionWebhook : undefined;
    if (hook) {
      if (isAllowedSessionWebhook(hook)) sessionHooks.set(senderId, hook);
      else ctx.log.warn("dingtalk: ignored sessionWebhook with disallowed host");
    }
    const msgId = frame.headers?.messageId ?? "0";
    const rawRef = `${senderId}:${msgId}`;
    const ack = await ctx.emitInbound({ senderId, text, rawRef });
    if (ack.pairingRequired) {
      await sendText(
        senderId,
        `EnvoyHome: you are not bound yet.\n` +
          `In Settings → Connections → Channels, link DingTalk sender ID \`${senderId}\` ` +
          `to a profile, then message again.`,
      ).catch((err) => {
        ctx.log.warn(`dingtalk pairing reply: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  function startStream(ctx: ChannelContext): void {
    stopStream?.();
    let alive = true;
    let ws: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    stopStream = () => {
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
      if (!alive || !clientId || !clientSecret) return;
      try {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
        await refreshToken();
        if (!alive || !clientId) return;
        const url = `${streamUrl}?access_token=${encodeURIComponent(accessToken || "")}`;
        ws = new Ws(url);
        ws.addEventListener("open", () => {
          ctx.log.info(`dingtalk: stream open for ${ctx.channelAccount}`);
          try {
            ws?.send(
              JSON.stringify({
                type: "register",
                clientId,
                topics: ["MESSAGE"],
              }),
            );
          } catch {
            /* ignore */
          }
        });
        ws.addEventListener("message", (ev) => {
          void (async () => {
            let packet: { type?: string; headers?: { messageId?: string }; data?: unknown };
            try {
              packet = JSON.parse(String(ev.data)) as typeof packet;
            } catch {
              return;
            }
            if (packet.headers?.messageId) {
              try {
                ws?.send(
                  JSON.stringify({
                    type: "ack",
                    headers: { messageId: packet.headers.messageId },
                    data: JSON.stringify({ code: 200 }),
                  }),
                );
              } catch {
                /* ignore */
              }
            }
            await handleFrame(packet, ctx);
          })().catch((err) => {
            ctx.log.warn(`dingtalk stream: ${err instanceof Error ? err.message : String(err)}`);
          });
        });
        ws.addEventListener("close", () => {
          if (!alive) return;
          reconnectTimer = setTimeout(() => void connect(), 3000);
        });
      } catch (err) {
        ctx.log.warn(
          `dingtalk: stream connect failed — ${err instanceof Error ? err.message : String(err)}`,
        );
        if (!alive) return;
        reconnectTimer = setTimeout(() => void connect(), 5000);
      }
    };

    void connect();
  }

  return {
    manifest: dingtalkManifest,
    async start(ctx) {
      ctxRef = ctx;
      clientId = ctx.secrets.get("clientId");
      clientSecret = ctx.secrets.get("clientSecret");
      if (typeof ctx.config.apiBase === "string" && ctx.config.apiBase) {
        apiBase = ctx.config.apiBase.replace(/\/$/, "");
      } else {
        apiBase = "https://api.dingtalk.com";
      }
      if (typeof ctx.config.streamUrl === "string" && ctx.config.streamUrl) {
        streamUrl = ctx.config.streamUrl;
      } else {
        streamUrl = "wss://wss-open-connection.dingtalk.com";
      }
      if (!clientId || !clientSecret) {
        ctx.log.warn("dingtalk: clientId/clientSecret required — idle until setChannelConfig");
        return;
      }
      try {
        await refreshToken();
        ctx.log.info(`dingtalk: token ok for ${ctx.channelAccount}`);
      } catch (err) {
        ctx.log.warn(`dingtalk: token failed — ${err instanceof Error ? err.message : String(err)}`);
      }
      startStream(ctx);
    },
    async stop() {
      stopStream?.();
      stopStream = undefined;
      clientId = undefined;
      clientSecret = undefined;
      accessToken = undefined;
      sessionHooks.clear();
    },
    async health() {
      if (!clientId || !clientSecret) return { ok: false, detail: "clientId/clientSecret missing" };
      try {
        await refreshToken();
        return { ok: true, detail: "dingtalk token ok" };
      } catch (err) {
        return {
          ok: false,
          detail: `token failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    async send(msg: OutboundMessage) {
      let senderId: string | undefined;
      if (msg.rawRef) senderId = msg.rawRef.split(":")[0];
      if (!senderId) {
        ctxRef?.log.warn("dingtalk send: missing sender id (rawRef)");
        return;
      }
      await sendText(senderId, msg.text);
    },
  };
}

export default createDingtalkChannel();
