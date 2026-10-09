// APNs (iOS) + FCM (Android) alert dispatch — EnvoyMesh node push-notification.ts pattern.
// Credentials: env vars first, then `<stateDir>/push-config.json`.

import { createSign, createPrivateKey } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { connect as http2Connect, type ClientHttp2Session } from "node:http2";
import { request as httpsRequest } from "node:https";
import { dirname, isAbsolute, join } from "node:path";
import type { DaemonLogger } from "./logger.js";
import type { PushTokenRecord, PushTokenStore } from "./push-tokens.js";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

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
  ) {}

  async init(): Promise<void> {
    this.creds = await loadPushConfig(this.stateDir);
    const apns = this.apnsConfigured();
    const fcm = this.fcmConfigured();
    this.logger.info(
      `push dispatch ready (apns=${apns ? "configured" : "off"} fcm=${fcm ? "configured" : "off"})`,
    );
  }

  /** React to product events — approval-needed is the phone wake path. */
  async onProductEvent(event: string, data: unknown): Promise<void> {
    if (event !== "home:approval-needed") return;
    const row = data as {
      accountId?: string;
      id?: string;
      tool?: string;
      summary?: string;
      risk?: string;
    };
    if (!row?.accountId) return;
    await this.notifyAccount(row.accountId, {
      title: "Approval needed",
      body: String(row.summary || row.tool || "Open EnvoyHome to respond"),
      data: {
        type: "approval",
        approvalId: String(row.id ?? ""),
        accountId: row.accountId,
        tool: String(row.tool ?? ""),
        risk: String(row.risk ?? ""),
      },
    });
  }

  async notifyAccount(accountId: string, payload: PushPayload): Promise<{ sent: number }> {
    const tokens = (await this.store.list()).filter(
      (t) => t.accountIds.length === 0 || t.accountIds.includes(accountId),
    );
    let sent = 0;
    for (const row of tokens) {
      const status = await this.sendToDevice(row, payload);
      if (status === 200) sent += 1;
      else if (status !== undefined && this.deadStatuses.has(status)) {
        await this.store.unregister(row.deviceId);
        this.logger.warn(`push: dropped dead token deviceId=${row.deviceId} status=${status}`);
      }
    }
    return { sent };
  }

  async sendTest(deviceId: string | undefined, payload: PushPayload): Promise<{ sent: number }> {
    const rows = deviceId
      ? [(await this.store.get(deviceId))].filter((r): r is PushTokenRecord => Boolean(r))
      : await this.store.list();
    let sent = 0;
    for (const row of rows) {
      const status = await this.sendToDevice(row, payload);
      if (status === 200) sent += 1;
    }
    return { sent };
  }

  private async sendToDevice(
    row: PushTokenRecord,
    payload: PushPayload,
  ): Promise<number | undefined> {
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
  const candidates = [
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

  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      badge: 1,
    },
    ...(payload.data ? { data: payload.data } : {}),
  });

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
  const body = JSON.stringify({
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: { priority: "HIGH" },
    },
  });
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
