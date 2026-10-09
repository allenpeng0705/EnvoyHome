/**
 * Telegram Bot API channel — chat kind, no actuate capability (Design §5.3.1).
 * Long-poll getUpdates when botToken is configured; replies via sendMessage.
 */

import type { ChannelContext, ChannelPlugin, OutboundMessage } from "@envoyhome/channel-api";

export const telegramManifest = {
  id: "telegram",
  apiVersion: 1,
  kind: "chat" as const,
  label: "Telegram",
  capabilities: ["text", "media", "edit", "react", "threads"] as const,
  configSchema: {
    channelAccount: { required: false },
    botToken: { secret: true, required: true, credentialScope: "read" as const },
    apiBase: { required: false },
  },
};

interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: { id: number; username?: string };
  };
}

interface TgUser {
  id: number;
  is_bot: boolean;
  username?: string;
  first_name?: string;
}

/** Optional fetch inject for tests. */
export type TelegramFetch = typeof fetch;

export function createTelegramChannel(opts?: { fetch?: TelegramFetch }): ChannelPlugin {
  const http = opts?.fetch ?? fetch;
  let stopPoll: (() => void) | undefined;
  let abort: AbortController | undefined;
  let ctxRef: ChannelContext | undefined;
  let tokenRef: string | undefined;
  let apiBase = "https://api.telegram.org";
  let botUsername: string | undefined;

  async function api<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const token = tokenRef;
    if (!token) throw new Error("telegram: no botToken");
    const url = `${apiBase}/bot${token}/${method}`;
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    };
    if (abort) init.signal = abort.signal;
    const res = await http(url, init);
    const json = (await res.json()) as { ok: boolean; result: T; description?: string };
    if (!json.ok) throw new Error(`telegram API ${method}: ${json.description ?? res.status}`);
    return json.result;
  }

  async function sendText(chatId: string, text: string): Promise<void> {
    await api("sendMessage", { chat_id: chatId, text });
  }

  function startPolling(ctx: ChannelContext): void {
    stopPoll?.();
    abort?.abort();
    abort = new AbortController();
    let offset = 0;
    let alive = true;
    const signal = abort.signal;
    stopPoll = () => {
      alive = false;
      abort?.abort();
    };

    const loop = async (): Promise<void> => {
      while (alive) {
        try {
          const updates = await api<TgUpdate[]>("getUpdates", {
            offset,
            timeout: 25,
            allowed_updates: ["message"],
          });
          for (const u of updates) {
            offset = u.update_id + 1;
            const msg = u.message;
            if (!msg?.text || !msg.from) continue;
            const senderId = String(msg.from.id);
            const chatId = String(msg.chat.id);
            const rawRef = `${chatId}:${msg.message_id}`;
            const ack = await ctx.emitInbound({
              senderId,
              text: msg.text,
              rawRef,
            });
            if (ack.pairingRequired) {
              const who = msg.from.username ? `@${msg.from.username}` : senderId;
              await sendText(
                chatId,
                `EnvoyHome: ${who} is not bound yet.\n` +
                  `In Settings → Channels, bind Telegram senderId \`${senderId}\` ` +
                  `to an account (channelAccount=default), then message again.`,
              ).catch((err) => {
                ctx.log.warn(
                  `telegram pairing reply: ${err instanceof Error ? err.message : String(err)}`,
                );
              });
            }
          }
        } catch (err) {
          if (!alive || signal.aborted) break;
          const name = err instanceof Error ? err.name : "";
          if (name === "AbortError") break;
          ctx.log.warn(`telegram poll: ${err instanceof Error ? err.message : String(err)}`);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    };
    void loop();
  }

  return {
    manifest: telegramManifest,
    async start(ctx) {
      ctxRef = ctx;
      const token = ctx.secrets.get("botToken");
      tokenRef = token;
      botUsername = undefined;
      if (typeof ctx.config.apiBase === "string" && ctx.config.apiBase) {
        apiBase = ctx.config.apiBase.replace(/\/$/, "");
      } else {
        apiBase = "https://api.telegram.org";
      }
      if (!token) {
        ctx.log.warn("telegram: botToken not configured — channel idle until setChannelConfig");
        return;
      }
      try {
        const me = await api<TgUser>("getMe");
        botUsername = me.username;
        ctx.log.info(
          `telegram: bot @${me.username ?? me.id} long-poll for ${ctx.channelAccount}`,
        );
      } catch (err) {
        ctx.log.warn(
          `telegram: getMe failed — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      startPolling(ctx);
    },
    async stop() {
      stopPoll?.();
      stopPoll = undefined;
      abort?.abort();
      abort = undefined;
      tokenRef = undefined;
      botUsername = undefined;
    },
    async health() {
      if (!tokenRef) return { ok: false, detail: "botToken missing" };
      try {
        const me = await api<TgUser>("getMe");
        botUsername = me.username;
        return {
          ok: true,
          detail: me.username ? `telegram @${me.username}` : `telegram bot ${me.id}`,
        };
      } catch (err) {
        return {
          ok: false,
          detail: `getMe failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    async send(msg: OutboundMessage) {
      if (!tokenRef) return;
      let chatId: string | undefined;
      if (msg.rawRef) {
        chatId = msg.rawRef.split(":")[0];
      }
      if (!chatId) {
        ctxRef?.log.warn("telegram send: missing chat id (rawRef)");
        return;
      }
      await sendText(chatId, msg.text);
    },
  };
}

export default createTelegramChannel();
