/**
 * WeCom (企业微信) chat channel — 1:1 Chat via KF long-poll (Design §5.0).
 * Inbound: kf/sync_msg (external_userid). Outbound: kf/send_msg (same identity space).
 * Optional syncPath override for tests / alternate poll endpoints that share the KF reply path.
 *
 * Config: corpId + secret + agentId (app identity). openKfid optional if messages carry it.
 */

import type { ChannelContext, ChannelPlugin, OutboundMessage } from "@envoyhome/channel-api";

export const wecomManifest = {
  id: "wecom",
  apiVersion: 1,
  kind: "chat" as const,
  label: "WeCom",
  capabilities: ["text"] as const,
  configSchema: {
    channelAccount: { required: false },
    corpId: { secret: true, required: true, credentialScope: "read" as const },
    secret: { secret: true, required: true, credentialScope: "read" as const },
    agentId: { required: true },
    openKfid: { required: false },
    apiBase: { required: false },
    syncPath: { required: false },
  },
};

type WecomFetch = typeof fetch;

export type CreateWecomChannelOpts = {
  fetch?: WecomFetch;
  /** Override poll interval (ms) for tests. */
  pollMs?: number;
};

type KfMsg = {
  msgid?: string;
  external_userid?: string;
  open_kfid?: string;
  msgtype?: string;
  text?: { content?: string };
};

export function createWecomChannel(opts?: CreateWecomChannelOpts): ChannelPlugin {
  const http = opts?.fetch ?? fetch;
  const pollMs = opts?.pollMs ?? 25_000;
  let ctxRef: ChannelContext | undefined;
  let corpId: string | undefined;
  let secret: string | undefined;
  let agentId: string | undefined;
  let openKfidDefault: string | undefined;
  let apiBase = "https://qyapi.weixin.qq.com";
  let syncPath = "/cgi-bin/kf/sync_msg";
  let accessToken: string | undefined;
  let cursor = "";
  /** Last open_kfid seen per external_userid (for kf/send_msg). */
  const openKfidByUser = new Map<string, string>();
  let stopPoll: (() => void) | undefined;
  let pollAbort: AbortController | undefined;

  function usesKfApi(): boolean {
    return syncPath.includes("/kf/");
  }

  async function refreshToken(signal?: AbortSignal): Promise<string> {
    if (!corpId || !secret) throw new Error("wecom: missing corpId/secret");
    const res = await http(
      `${apiBase}/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`,
      signal ? { signal } : undefined,
    );
    const json = (await res.json()) as { errcode?: number; errmsg?: string; access_token?: string };
    if (json.errcode && json.errcode !== 0) {
      throw new Error(`wecom token: ${json.errmsg ?? json.errcode}`);
    }
    if (!json.access_token) throw new Error("wecom token: missing access_token");
    accessToken = json.access_token;
    return accessToken;
  }

  async function sendText(touser: string, text: string, openKfid?: string): Promise<void> {
    const token = accessToken ?? (await refreshToken());
    const content = text.length > 2048 ? `${text.slice(0, 2040)}…` : text;
    if (usesKfApi()) {
      const kfid = openKfid || openKfidByUser.get(touser) || openKfidDefault;
      if (!kfid) {
        throw new Error("wecom: open_kfid required for kf/send_msg (set openKfid or wait for inbound)");
      }
      const res = await http(`${apiBase}/cgi-bin/kf/send_msg?access_token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          touser,
          open_kfid: kfid,
          msgtype: "text",
          text: { content },
        }),
      });
      const json = (await res.json()) as { errcode?: number; errmsg?: string };
      if (json.errcode && json.errcode !== 0) {
        throw new Error(`wecom kf/send_msg: ${json.errmsg ?? json.errcode}`);
      }
      return;
    }
    // Non-KF syncPath (tests / rare overrides): application message/send with userid.
    const res = await http(`${apiBase}/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        touser,
        msgtype: "text",
        agentid: Number(agentId) || agentId,
        text: { content },
      }),
    });
    const json = (await res.json()) as { errcode?: number; errmsg?: string };
    if (json.errcode && json.errcode !== 0) {
      throw new Error(`wecom send: ${json.errmsg ?? json.errcode}`);
    }
  }

  async function handleMsg(msg: KfMsg, ctx: ChannelContext): Promise<void> {
    if (msg.msgtype !== "text") return;
    const text = (msg.text?.content || "").trim();
    const senderId = msg.external_userid;
    if (!text || !senderId) return;
    if (msg.open_kfid) openKfidByUser.set(senderId, msg.open_kfid);
    const rawRef = `${senderId}:${msg.msgid ?? "0"}`;
    const ack = await ctx.emitInbound({ senderId, text, rawRef });
    if (ack.pairingRequired) {
      await sendText(
        senderId,
        `EnvoyHome: you are not bound yet.\n` +
          `In Settings → Connections → Channels, link WeCom sender ID \`${senderId}\` ` +
          `to a profile, then message again.`,
        msg.open_kfid,
      ).catch((err) => {
        ctx.log.warn(`wecom pairing reply: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  function startPoll(ctx: ChannelContext): void {
    stopPoll?.();
    let alive = true;
    pollAbort = new AbortController();
    const signal = pollAbort.signal;
    stopPoll = () => {
      alive = false;
      try {
        pollAbort?.abort();
      } catch {
        /* ignore */
      }
      pollAbort = undefined;
    };

    const loop = async (): Promise<void> => {
      while (alive) {
        try {
          const token = accessToken ?? (await refreshToken(signal));
          if (!alive) break;
          const syncBody: Record<string, unknown> = {
            cursor,
            token: "",
            limit: 100,
            voice_format: 0,
          };
          // WeCom scopes KF pulls by open_kfid when set (required once multiple KF accounts exist).
          const kfid =
            openKfidDefault ||
            (openKfidByUser.size > 0 ? openKfidByUser.values().next().value : undefined);
          if (kfid) syncBody.open_kfid = kfid;
          const res = await http(`${apiBase}${syncPath}?access_token=${encodeURIComponent(token)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(syncBody),
            signal,
          });
          if (!alive) break;
          const json = (await res.json()) as {
            errcode?: number;
            errmsg?: string;
            next_cursor?: string;
            msg_list?: KfMsg[];
          };
          if (json.errcode && json.errcode !== 0) {
            ctx.log.warn(`wecom sync: ${json.errmsg ?? json.errcode}`);
          } else {
            if (json.next_cursor) cursor = json.next_cursor;
            for (const m of json.msg_list ?? []) {
              if (!alive) break;
              await handleMsg(m, ctx);
            }
          }
        } catch (err) {
          if (!alive || (err instanceof Error && err.name === "AbortError")) break;
          ctx.log.warn(`wecom poll: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!alive) break;
        await new Promise((r) => setTimeout(r, pollMs));
      }
    };
    void loop();
  }

  return {
    manifest: wecomManifest,
    async start(ctx) {
      ctxRef = ctx;
      corpId = ctx.secrets.get("corpId");
      secret = ctx.secrets.get("secret");
      agentId =
        typeof ctx.config.agentId === "string" || typeof ctx.config.agentId === "number"
          ? String(ctx.config.agentId)
          : undefined;
      openKfidDefault =
        typeof ctx.config.openKfid === "string" && ctx.config.openKfid
          ? ctx.config.openKfid
          : undefined;
      if (typeof ctx.config.apiBase === "string" && ctx.config.apiBase) {
        apiBase = ctx.config.apiBase.replace(/\/$/, "");
      } else {
        apiBase = "https://qyapi.weixin.qq.com";
      }
      if (typeof ctx.config.syncPath === "string" && ctx.config.syncPath) {
        syncPath = ctx.config.syncPath.startsWith("/")
          ? ctx.config.syncPath
          : `/${ctx.config.syncPath}`;
      } else {
        syncPath = "/cgi-bin/kf/sync_msg";
      }
      if (!corpId || !secret || !agentId) {
        ctx.log.warn("wecom: corpId/secret/agentId required — idle until setChannelConfig");
        return;
      }
      try {
        await refreshToken();
        ctx.log.info(`wecom: token ok agent=${agentId}`);
      } catch (err) {
        ctx.log.warn(`wecom: token failed — ${err instanceof Error ? err.message : String(err)}`);
      }
      startPoll(ctx);
    },
    async stop() {
      stopPoll?.();
      stopPoll = undefined;
      corpId = undefined;
      secret = undefined;
      agentId = undefined;
      openKfidDefault = undefined;
      accessToken = undefined;
      cursor = "";
      openKfidByUser.clear();
    },
    async health() {
      if (!corpId || !secret) return { ok: false, detail: "corpId/secret missing" };
      if (!agentId) return { ok: false, detail: "agentId missing" };
      try {
        await refreshToken();
        return { ok: true, detail: `wecom agent ${agentId}` };
      } catch (err) {
        return {
          ok: false,
          detail: `token failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    async send(msg: OutboundMessage) {
      let touser: string | undefined;
      if (msg.rawRef) touser = msg.rawRef.split(":")[0];
      if (!touser) {
        ctxRef?.log.warn("wecom send: missing user id (rawRef)");
        return;
      }
      await sendText(touser, msg.text);
    },
  };
}

export default createWecomChannel();
