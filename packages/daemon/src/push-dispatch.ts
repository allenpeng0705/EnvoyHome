// APNs (iOS) + FCM (Android) alert dispatch — EnvoyMesh node push-notification.ts pattern.
// Credentials: env vars first, then `<stateDir>/push-config.json`.
// Wake catalogue: Design §11.3 / `2026-10-22f`.

import { createSign, createPrivateKey } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { connect as http2Connect, type ClientHttp2Session } from "node:http2";
import { request as httpsRequest } from "node:https";
import { dirname, isAbsolute, join } from "node:path";
import type { DaemonLogger } from "./logger.js";
import type { LiveDevicePresence } from "./push-live.js";
import type { PushTokenRecord, PushTokenStore } from "./push-tokens.js";
import {
  normalizeProductLocale,
  type ProductLocale,
} from "./schedule/locale-relatives.js";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Lock-screen turn wake — product UI locales (never assistant preview). */
const TURN_REPLY_READY: Record<ProductLocale, string> = {
  en: "Your reply is ready",
  zh: "回复已就绪",
  de: "Deine Antwort ist fertig",
  fr: "Votre réponse est prête",
  it: "La risposta è pronta",
  ja: "返信の準備ができました",
  ko: "답변이 준비되었습니다",
};

/** Exported for tests — falls back to English. */
export function turnReplyReadyBody(locale?: string): string {
  return TURN_REPLY_READY[normalizeProductLocale(locale)];
}

/** Interactive wakes may skip a recently active device; always never skips. */
export type PushWakePolicy = "always" | "suppressIfLive";

/** Test / alternate transport hook — return HTTP status or undefined if skipped. */
export type PushSendFn = (
  row: PushTokenRecord,
  payload: PushPayload,
) => Promise<number | undefined>;

export interface PushConfigFile {
  apns?: {
    keyId?: string;
    teamId?: string;
    keyPath?: string;
    topic?: string;
    sandbox?: boolean;
  };
  fcm?: {
    projectId?: string;
    serviceAccountJsonPath?: string;
  };
}

interface ResolvedCreds {
  config: PushConfigFile;
  baseDir: string;
}

/** APNs alert body — custom fields nested under `data` (iOS AppDelegate unwraps). */
export function buildApnsBody(payload: PushPayload): Record<string, unknown> {
  return {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      badge: 1,
    },
    ...(payload.data ? { data: payload.data } : {}),
  };
}

/** FCM HTTP v1 message — `data` values must be strings; notification + android HIGH. */
export function buildFcmMessage(
  token: string,
  payload: PushPayload,
): Record<string, unknown> {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.data ?? {})) {
    data[k] = String(v);
  }
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data,
      android: { priority: "HIGH" },
    },
  };
}

function envTruthy(name: string): boolean | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  const t = v.trim().toLowerCase();
  if (t === "1" || t === "true" || t === "yes") return true;
  if (t === "0" || t === "false" || t === "no") return false;
  return Boolean(t);
}

export class PushDispatcher {
  private creds: ResolvedCreds | null = null;
  private readonly deadStatuses = new Set([400, 403, 404, 410]);

  constructor(
    private readonly store: PushTokenStore,
    private readonly stateDir: string,
    private readonly logger: DaemonLogger,
    private readonly live?: LiveDevicePresence,
    /** When set, skips real APNs/FCM (unit tests). */
    private readonly sendOverride?: PushSendFn,
  ) {}

  async init(): Promise<void> {
    this.creds = await loadPushConfig(this.stateDir);
    const apns = this.apnsConfigured();
    const fcm = this.fcmConfigured();
    const sandbox = apnsSandbox(this.creds);
    this.logger.info(
      `push dispatch ready (apns=${apns ? "configured" : "off"} fcm=${fcm ? "configured" : "off"} apnsSandbox=${sandbox})`,
    );
  }

  /** Re-read `<stateDir>/push-config.json` so sandbox flips apply without restart. */
  private async refreshCreds(): Promise<void> {
    this.creds = await loadPushConfig(this.stateDir);
  }

  /**
   * Interactive product events — approval + choice + turn-finished ok
   * (Design `2026-10-22f` / `2026-10-24`). Policy: suppressIfLive.
   */
  async onProductEvent(event: string, data: unknown): Promise<void> {
    if (event === "home:approval-needed") {
      const row = data as {
        accountId?: string;
        id?: string;
        tool?: string;
        summary?: string;
        risk?: string;
      };
      if (!row?.accountId) return;
      await this.notifyAccount(
        row.accountId,
        {
          title: "Approval needed",
          body: String(row.summary || row.tool || "Open EnvoyHome to respond"),
          data: {
            type: "approval",
            approvalId: String(row.id ?? ""),
            accountId: row.accountId,
            tool: String(row.tool ?? ""),
            risk: String(row.risk ?? ""),
          },
        },
        "suppressIfLive",
      );
      return;
    }
    if (event === "home:choice-needed") {
      const row = data as {
        accountId?: string;
        id?: string;
        question?: string;
        selection?: string;
      };
      if (!row?.accountId) return;
      await this.notifyAccount(
        row.accountId,
        {
          title: "Choice needed",
          body: String(row.question || "Open EnvoyHome to respond").slice(0, 200),
          data: {
            type: "choice",
            choiceId: String(row.id ?? ""),
            accountId: row.accountId,
            selection: String(row.selection ?? ""),
          },
        },
        "suppressIfLive",
      );
      return;
    }
    if (event === "home:turn-finished") {
      const row = data as {
        accountId?: string;
        sessionId?: string;
        turnId?: string;
        status?: string;
        /** Originating paired device (thin-client sendMessage). Prefer fan-out. */
        deviceId?: string;
        /** Account / client locale for the generic lock-screen body. */
        locale?: string;
        /** Optional transcript snippet — never put on the lock-screen body. */
        preview?: string;
      };
      if (!row?.accountId) return;
      // Cancelled / error: no banner (user left or saw the failure path live).
      if (row.status !== "ok") return;
      // Lock-screen privacy: generic body only (Design `2026-10-24b`). Preview stays
      // on the event for in-app clients; APNs/FCM must not leak assistant text.
      const preferDeviceId =
        typeof row.deviceId === "string" && row.deviceId.trim()
          ? row.deviceId.trim()
          : undefined;
      const result = await this.notifyAccount(
        row.accountId,
        {
          title: "EnvoyHome",
          body: turnReplyReadyBody(row.locale),
          data: {
            type: "turn",
            accountId: row.accountId,
            sessionId: String(row.sessionId ?? ""),
            turnId: String(row.turnId ?? ""),
          },
        },
        "suppressIfLive",
        preferDeviceId ? { preferDeviceId } : undefined,
      );
      this.logger.info(
        `push turn-finished account=${row.accountId} sent=${result.sent} skippedLive=${result.skippedLive}${preferDeviceId ? ` prefer=${preferDeviceId}` : ""}`,
      );
    }
  }

  async notifyAccount(
    accountId: string,
    payload: PushPayload,
    policy: PushWakePolicy = "always",
    opts?: { preferDeviceId?: string },
  ): Promise<{ sent: number; skippedLive: number }> {
    await this.refreshCreds();
    // Fail closed: empty accountIds never means "all seats" (zero-binding / race
    // before accountId would otherwise wake every household account).
    let tokens = (await this.store.list()).filter((t) =>
      t.accountIds.includes(accountId),
    );
    // Turn wake: prefer the phone that sent the message (less noisy than waking
    // every seat-bound device). Fall back to full fan-out if that token is gone.
    const prefer = opts?.preferDeviceId?.trim();
    if (prefer) {
      const only = tokens.filter((t) => t.deviceId === prefer);
      if (only.length > 0) tokens = only;
      else {
        this.logger.warn(
          `push: prefer deviceId=${prefer} has no registered token — fan-out to ${tokens.length} account token(s) (open the phone app so home.registerPushToken can run)`,
        );
      }
    }
    let sent = 0;
    let skippedLive = 0;
    for (const row of tokens) {
      if (policy === "suppressIfLive" && this.live?.isRecentlyActive(row.deviceId)) {
        skippedLive += 1;
        continue;
      }
      const status = await this.sendToDevice(row, payload);
      if (status === 200) sent += 1;
      else if (status !== undefined && this.deadStatuses.has(status)) {
        await this.store.unregister(row.deviceId);
        this.logger.warn(`push: dropped dead token deviceId=${row.deviceId} status=${status}`);
      } else if (status !== undefined) {
        this.logger.warn(
          `push: send failed deviceId=${row.deviceId} platform=${row.platform} status=${status}`,
        );
      } else {
        this.logger.warn(
          `push: send skipped deviceId=${row.deviceId} platform=${row.platform} (credentials/transport)`,
        );
      }
    }
    return { sent, skippedLive };
  }

  async sendTest(deviceId: string | undefined, payload: PushPayload): Promise<{ sent: number }> {
    await this.refreshCreds();
    const rows = deviceId
      ? [(await this.store.get(deviceId))].filter((r): r is PushTokenRecord => Boolean(r))
      : await this.store.list();
    let sent = 0;
    for (const row of rows) {
      const status = await this.sendToDevice(row, payload);
      if (status === 200) sent += 1;
      else if (status !== undefined && this.deadStatuses.has(status)) {
        // Same prune as notifyAccount — BadDeviceToken / gone must not linger.
        await this.store.unregister(row.deviceId);
        this.logger.warn(`push: dropped dead token deviceId=${row.deviceId} status=${status}`);
      } else if (status !== undefined) {
        this.logger.warn(
          `push: sendTest failed deviceId=${row.deviceId} platform=${row.platform} status=${status}`,
        );
      }
    }
    return { sent };
  }

  private async sendToDevice(
    row: PushTokenRecord,
    payload: PushPayload,
  ): Promise<number | undefined> {
    if (this.sendOverride) return await this.sendOverride(row, payload);
    if (row.platform === "ios") return await sendApns(row.token, payload, this.creds);
    return await sendFcm(row.token, payload, this.creds);
  }

  private apnsConfigured(): boolean {
    return Boolean(
      cred("APNS_KEY_ID", this.creds, "apns", "keyId") &&
        cred("APNS_TEAM_ID", this.creds, "apns", "teamId") &&
        cred("APNS_KEY_PATH", this.creds, "apns", "keyPath") &&
        cred("APNS_TOPIC", this.creds, "apns", "topic"),
    );
  }

  private fcmConfigured(): boolean {
    return Boolean(
      cred("FCM_PROJECT_ID", this.creds, "fcm", "projectId") &&
        cred("FCM_SERVICE_ACCOUNT_JSON", this.creds, "fcm", "serviceAccountJsonPath"),
    );
  }
}

async function loadPushConfig(stateDir: string): Promise<ResolvedCreds> {
  const fromEnv = process.env.ENVOYHOME_PUSH_CONFIG?.trim();
  const candidates = [
    ...(fromEnv ? [fromEnv] : []),
    join(stateDir, "push-config.json"),
    join(process.cwd(), "push-config.json"),
  ];
  for (const path of candidates) {
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as PushConfigFile;
      return { config: raw, baseDir: dirname(path) };
    } catch {
      // try next
    }
  }
  return { config: {}, baseDir: stateDir };
}

function cred(
  envName: string,
  resolved: ResolvedCreds | null,
  section: "apns" | "fcm",
  key: string,
): string | undefined {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const block = resolved?.config[section] as Record<string, unknown> | undefined;
  const v = block?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function resolvePath(raw: string | undefined, baseDir: string): string | undefined {
  if (!raw) return undefined;
  return isAbsolute(raw) ? raw : join(baseDir, raw);
}

function apnsSandbox(resolved: ResolvedCreds | null): boolean {
  const e = envTruthy("APNS_SANDBOX");
  if (e !== undefined) return e;
  return Boolean(resolved?.config.apns?.sandbox);
}

function signApnsJwt(resolved: ResolvedCreds | null): string | null {
  const keyId = cred("APNS_KEY_ID", resolved, "apns", "keyId");
  const teamId = cred("APNS_TEAM_ID", resolved, "apns", "teamId");
  const keyPath = resolvePath(cred("APNS_KEY_PATH", resolved, "apns", "keyPath"), resolved?.baseDir ?? ".");
  if (!keyId || !teamId || !keyPath || !existsSync(keyPath)) return null;
  let keyPem: string;
  try {
    keyPem = readFileSync(keyPath, "utf8");
  } catch {
    return null;
  }
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString("base64url");
  const sign = createSign("SHA256");
  sign.update(`${header}.${claims}`);
  sign.end();
  // Node accepts PKCS8 .p8 from Apple as PEM for ES256.
  const keyObject = createPrivateKey(keyPem);
  const signature = sign.sign(keyObject).toString("base64url");
  return `${header}.${claims}.${signature}`;
}

async function sendApns(
  token: string,
  payload: PushPayload,
  resolved: ResolvedCreds | null,
): Promise<number | undefined> {
  const jwt = signApnsJwt(resolved);
  const topic = cred("APNS_TOPIC", resolved, "apns", "topic");
  if (!jwt || !topic) return undefined;

  const body = JSON.stringify(buildApnsBody(payload));

  const host = apnsSandbox(resolved) ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  return await new Promise((resolve) => {
    const client: ClientHttp2Session = http2Connect(`https://${host}`);
    client.on("error", () => resolve(undefined));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-expiration": "0",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    req.on("response", (headers) => {
      const status = headers[":status"];
      const code = typeof status === "number" ? status : Number(status);
      resolve(Number.isFinite(code) ? code : undefined);
      setTimeout(() => client.close(), 100);
    });
    req.on("error", () => {
      resolve(undefined);
      client.close();
    });
    req.end(body);
  });
}

async function signFcmAccessToken(resolved: ResolvedCreds | null): Promise<string | null> {
  const keyPath = resolvePath(
    cred("FCM_SERVICE_ACCOUNT_JSON", resolved, "fcm", "serviceAccountJsonPath"),
    resolved?.baseDir ?? ".",
  );
  if (!keyPath || !existsSync(keyPath)) return null;
  let key: { client_email: string; private_key: string };
  try {
    key = JSON.parse(readFileSync(keyPath, "utf8")) as {
      client_email: string;
      private_key: string;
    };
  } catch {
    return null;
  }
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const sign = createSign("SHA256");
  sign.update(`${header}.${claims}`);
  sign.end();
  const signature = sign.sign(key.private_key).toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }).toString();
  return await new Promise((resolve) => {
    const req = httpsRequest(
      {
        hostname: "oauth2.googleapis.com",
        path: "/token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve((JSON.parse(data) as { access_token?: string }).access_token ?? null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.end(body);
  });
}

async function sendFcm(
  token: string,
  payload: PushPayload,
  resolved: ResolvedCreds | null,
): Promise<number | undefined> {
  const projectId = cred("FCM_PROJECT_ID", resolved, "fcm", "projectId");
  const accessToken = await signFcmAccessToken(resolved);
  if (!projectId || !accessToken) return undefined;
  const body = JSON.stringify(buildFcmMessage(token, payload));
  return await new Promise((resolve) => {
    const req = httpsRequest(
      {
        hostname: "fcm.googleapis.com",
        path: `/v1/projects/${projectId}/messages:send`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", () => resolve(undefined));
    req.end(body);
  });
}
