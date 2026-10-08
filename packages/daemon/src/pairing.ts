// Pairing mint/revoke/forget + device→account rebind — Design §3.3 / §4.1 / A.2 / Plan B4.
// Persist token **hashes** under paired-devices/ via homePaths. Mint app=EnvoyHome.

import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pairingAppMismatch } from "@envoymesh/protocol";
import { buildPairingUri, parsePairingUri } from "@envoymesh/reuse-host";
import { PRODUCT_NAME } from "@envoyhome/protocol";
import {
  DeviceCredentialStore,
  hashDeviceToken,
  type DeviceRecord,
} from "./auth.js";
import type { BindingStore } from "./bindings.js";
import { homePaths, type HomePaths } from "./home-paths.js";

/** Minimum gap between successful mints (rate-limit, Design §4.4). */
export const MINT_MIN_INTERVAL_MS = 500;
/** Max successful mints inside a rolling window. */
export const MINT_WINDOW_MS = 60_000;
export const MINT_WINDOW_MAX = 10;

export class PairingError extends Error {
  override readonly name = "PairingError";
  constructor(
    readonly kind: "bad_params" | "auth" | "not_found" | "rate_limited" | "pairing_app_mismatch",
    message: string,
  ) {
    super(message);
  }
}

export interface PairingIdentity {
  ownerId: string;
  ownerPublicKey: string;
}

interface DevicesFile {
  version: 1;
  devices: DeviceRecord[];
}

export interface PublicPairedDevice {
  deviceId: string;
  label: string;
  createdAt: string;
  lastSeenAt?: string;
  revoked: boolean;
  accountIds: string[];
  ownerTrusted?: boolean;
}

export interface MintPairingInput {
  deviceLabel: string;
  host: string;
  lanHost: string;
  accountIds?: string[];
  token?: string;
  fresh?: boolean;
  /** Bound WS port — daemon owns this; never client-supplied. */
  wsPort: number;
  wsPath?: string;
}

export interface MintPairingResult {
  uri: string;
  /** Raw token — returned once in the URI; never persisted. */
  token: string;
  device: {
    deviceId: string;
    label: string;
    createdAt: string;
    accountIds: string[];
  };
}

export type CheckPairingCodeResult =
  | {
      ok: true;
      wsUrl: string;
      token: string;
      ownerId: string;
      app?: string;
      lanWsUrl?: string;
    }
  | { ok: false; reason: "malformed" | "pairing_app_mismatch"; message: string };

/**
 * Hostname (or bare IP) from a reach string that may include `:port`.
 * Precedent: EnvoyCoder `apps/desktop/src/daemon/pairing.ts` hostnameOfReach.
 */
export function hostnameOfReach(raw: string): string {
  const text = raw.trim();
  if (text === "") return "";
  if (text.startsWith("[")) {
    const match = /^\[([^\]]+)](?::\d+)?$/.exec(text);
    return match?.[1] ?? text;
  }
  const colon = text.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(text.slice(colon + 1))) {
    return text.slice(0, colon);
  }
  return text;
}

function bracketHost(host: string): string {
  // IPv6 literals need brackets in a URL authority.
  if (host.includes(":") && !host.startsWith("[")) return `[${host}]`;
  return host;
}

function wsUrlFor(host: string, port: number, path: string): string {
  return `ws://${bracketHost(host)}:${port}${path.startsWith("/") ? path : `/${path}`}`;
}

async function atomicWrite(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  await writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
  await rename(tmp, path);
}

/**
 * Refuse a pairing code minted by another product (V-RPC-4).
 * Uses `@envoymesh/protocol`'s `pairingAppMismatch` against PRODUCT_NAME.
 */
export function checkPairingCode(
  input: string,
  product: string = PRODUCT_NAME,
): CheckPairingCodeResult {
  const parsed = parsePairingUri(input);
  if (!parsed) {
    return {
      ok: false,
      reason: "malformed",
      message: "That pairing code is empty or could not be read.",
    };
  }
  const mismatch = pairingAppMismatch(parsed.app, product);
  if (mismatch) {
    return { ok: false, reason: "pairing_app_mismatch", message: mismatch };
  }
  if (parsed.app !== undefined && parsed.lanWsUrl !== undefined) {
    return {
      ok: true,
      wsUrl: parsed.wsUrl,
      token: parsed.token,
      ownerId: parsed.ownerId,
      app: parsed.app,
      lanWsUrl: parsed.lanWsUrl,
    };
  }
  if (parsed.app !== undefined) {
    return {
      ok: true,
      wsUrl: parsed.wsUrl,
      token: parsed.token,
      ownerId: parsed.ownerId,
      app: parsed.app,
    };
  }
  if (parsed.lanWsUrl !== undefined) {
    return {
      ok: true,
      wsUrl: parsed.wsUrl,
      token: parsed.token,
      ownerId: parsed.ownerId,
      lanWsUrl: parsed.lanWsUrl,
    };
  }
  return {
    ok: true,
    wsUrl: parsed.wsUrl,
    token: parsed.token,
    ownerId: parsed.ownerId,
  };
}

export class PairingStore {
  readonly paths: HomePaths;
  private readonly devicesFile: string;
  private readonly identityFile: string;
  private loaded = false;
  private mintTimestamps: number[] = [];
  private lastMintAt = 0;
  /** Invoked on revoke to drop live WS (and later mesh) sessions — V-RPC-3. */
  onRevokeLive?: (deviceId: string) => void;

  constructor(
    stateDir: string,
    private readonly devices: DeviceCredentialStore,
    private readonly bindings: BindingStore,
  ) {
    this.paths = homePaths(stateDir);
    this.devicesFile = join(this.paths.pairedDevicesDir, "devices.json");
    this.identityFile = join(this.paths.secretsDir, "pairing-identity.json");
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await mkdir(this.paths.pairedDevicesDir, { recursive: true, mode: 0o700 });
    await mkdir(this.paths.secretsDir, { recursive: true, mode: 0o700 });
    try {
      const raw = JSON.parse(await readFile(this.devicesFile, "utf8")) as DevicesFile;
      const rows = Array.isArray(raw.devices) ? raw.devices : [];
      this.devices.replaceAll(rows.map(normalizeRecord));
    } catch {
      // Fresh install — empty roster.
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await mkdir(this.paths.pairedDevicesDir, { recursive: true, mode: 0o700 });
    const body: DevicesFile = { version: 1, devices: this.devices.list() };
    await atomicWrite(this.devicesFile, `${JSON.stringify(body, null, 2)}\n`);
  }

  async loadOrCreateIdentity(): Promise<PairingIdentity> {
    await mkdir(this.paths.secretsDir, { recursive: true, mode: 0o700 });
    try {
      const raw = JSON.parse(await readFile(this.identityFile, "utf8")) as Partial<PairingIdentity>;
      if (
        typeof raw.ownerId === "string" &&
        raw.ownerId.length > 0 &&
        typeof raw.ownerPublicKey === "string" &&
        raw.ownerPublicKey.length > 0
      ) {
        return { ownerId: raw.ownerId, ownerPublicKey: raw.ownerPublicKey };
      }
    } catch {
      // mint below
    }
    const identity: PairingIdentity = {
      ownerId: `envoy:owner:local-${randomBytes(8).toString("hex")}`,
      ownerPublicKey: `-----BEGIN PUBLIC KEY-----\n${randomBytes(32).toString("base64")}\n-----END PUBLIC KEY-----`,
    };
    await atomicWrite(this.identityFile, `${JSON.stringify(identity, null, 2)}\n`);
    return identity;
  }

  private assertMintRate(): void {
    const now = Date.now();
    if (now - this.lastMintAt < MINT_MIN_INTERVAL_MS) {
      throw new PairingError(
        "rate_limited",
        `mintPairing rate-limited; wait ${MINT_MIN_INTERVAL_MS}ms between mints`,
      );
    }
    this.mintTimestamps = this.mintTimestamps.filter((t) => now - t < MINT_WINDOW_MS);
    if (this.mintTimestamps.length >= MINT_WINDOW_MAX) {
      throw new PairingError(
        "rate_limited",
        `mintPairing rate-limited; at most ${MINT_WINDOW_MAX} mints per ${MINT_WINDOW_MS}ms`,
      );
    }
  }

  private noteMint(): void {
    const now = Date.now();
    this.lastMintAt = now;
    this.mintTimestamps.push(now);
  }

  /** @internal — clear mint rate-limit state between tests. */
  __resetMintRateForTests(): void {
    this.mintTimestamps = [];
    this.lastMintAt = 0;
  }

  async mint(input: MintPairingInput): Promise<MintPairingResult> {
    await this.ensureLoaded();
    this.assertMintRate();

    const label = input.deviceLabel.trim().slice(0, 80);
    if (label.length === 0) {
      throw new PairingError("bad_params", "deviceLabel is required");
    }

    const accountIds = [...new Set((input.accountIds ?? []).filter((id) => id.length > 0))];
    const reach = hostnameOfReach(input.host) || "127.0.0.1";
    const lanHint = hostnameOfReach(input.lanHost);
    const path = input.wsPath ?? "/ws";
    const identity = await this.loadOrCreateIdentity();

    let token: string;
    if (typeof input.token === "string" && input.token.length > 0) {
      token = input.token;
      if (this.devices.getByToken(token) && !input.fresh) {
        throw new PairingError("bad_params", "that token is already in use by another pairing");
      }
    } else {
      token = randomBytes(24).toString("base64url");
    }

    const tokenHash = hashDeviceToken(token);
    const now = new Date().toISOString();
    const deviceId = `dev_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const record: DeviceRecord = {
      deviceId,
      tokenHash,
      accountIds: [...accountIds],
      ownerTrusted: false,
      revoked: false,
      label,
      createdAt: now,
    };
    this.devices.put(record);
    await this.persist();

    // Bind accounts at mint time (Design A.2) — durable BindingStore is authoritative.
    for (const accountId of accountIds) {
      await this.bindings.set(
        { deviceId, accountId },
        { kind: "loopback-owner", accountIds: [], ownerTrusted: true },
      );
    }
    // Re-read accountIds after binding sync (ownerTrusted etc.).
    const live = this.devices.getById(deviceId) ?? record;

    const wsUrl = wsUrlFor(reach, input.wsPort, path);
    const lanHost =
      lanHint && lanHint !== reach && lanHint !== "127.0.0.1" ? lanHint : undefined;
    const uriParams: Parameters<typeof buildPairingUri>[0] = {
      wsUrl,
      token,
      ownerPublicKey: identity.ownerPublicKey,
      ownerId: identity.ownerId,
      app: PRODUCT_NAME,
    };
    if (lanHost !== undefined) {
      uriParams.lanWsUrl = wsUrlFor(lanHost, input.wsPort, path);
    }
    const uri = buildPairingUri(uriParams);

    this.noteMint();
    return {
      uri,
      token,
      device: {
        deviceId: live.deviceId,
        label: live.label,
        createdAt: live.createdAt,
        accountIds: [...live.accountIds],
      },
    };
  }

  async list(): Promise<PublicPairedDevice[]> {
    await this.ensureLoaded();
    return this.devices.list().map((d) => {
      const row: PublicPairedDevice = {
        deviceId: d.deviceId,
        label: d.label,
        createdAt: d.createdAt,
        revoked: d.revoked,
        accountIds: [...d.accountIds],
        ownerTrusted: d.ownerTrusted,
      };
      if (d.lastSeenAt !== undefined) row.lastSeenAt = d.lastSeenAt;
      return row;
    });
  }

  async revoke(deviceId: string): Promise<void> {
    await this.ensureLoaded();
    const rec = this.devices.getById(deviceId);
    if (!rec) throw new PairingError("not_found", `unknown device: ${deviceId}`);
    if (!rec.revoked) {
      rec.revoked = true;
      this.devices.put(rec);
      await this.persist();
    }
    // Drop live sessions even if already revoked (idempotent) — V-RPC-3.
    this.onRevokeLive?.(deviceId);
  }

  async forget(deviceId: string): Promise<void> {
    await this.ensureLoaded();
    const rec = this.devices.getById(deviceId);
    if (!rec) throw new PairingError("not_found", `unknown device: ${deviceId}`);
    if (!rec.revoked) {
      throw new PairingError(
        "bad_params",
        "device must be revoked before forget; call home.revokePairedDevice first",
      );
    }
    // Drop device bindings for this device.
    const bindings = await this.bindings.list({ deviceId });
    for (const b of bindings) {
      await this.bindings.remove(b.bindingId);
    }
    this.devices.remove(deviceId);
    await this.persist();
    this.onRevokeLive?.(deviceId);
  }

  /**
   * Rebind a paired device without re-pairing (Design A.2).
   * `accountIds: []` drops to zero-binding scope — does **not** revoke the credential.
   */
  async setDeviceAccounts(
    deviceId: string,
    accountIds: string[],
  ): Promise<{ deviceId: string; accountIds: string[]; ownerTrusted: boolean }> {
    await this.ensureLoaded();
    const rec = this.devices.getById(deviceId);
    if (!rec || rec.revoked) {
      throw new PairingError("not_found", `unknown or revoked device: ${deviceId}`);
    }
    const next = [...new Set(accountIds.filter((id) => id.length > 0))];
    const existing = await this.bindings.list({ deviceId });
    const existingIds = new Set(
      existing.filter((b) => b.kind === "device").map((b) => b.accountId),
    );
    const nextSet = new Set(next);

    for (const b of existing) {
      if (b.kind === "device" && !nextSet.has(b.accountId)) {
        await this.bindings.remove(b.bindingId);
      }
    }
    for (const accountId of next) {
      if (!existingIds.has(accountId)) {
        await this.bindings.set(
          { deviceId, accountId },
          { kind: "loopback-owner", accountIds: [], ownerTrusted: true },
        );
      }
    }

    // BindingStore.syncDeviceStore updates accountIds; reinforce + persist.
    const live = this.devices.getById(deviceId);
    if (!live) throw new PairingError("not_found", `unknown device: ${deviceId}`);
    live.accountIds = next;
    this.devices.put(live);
    await this.persist();
    return {
      deviceId: live.deviceId,
      accountIds: [...live.accountIds],
      ownerTrusted: live.ownerTrusted,
    };
  }
}

function normalizeRecord(raw: Partial<DeviceRecord>): DeviceRecord {
  if (
    typeof raw.deviceId !== "string" ||
    typeof raw.tokenHash !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.createdAt !== "string"
  ) {
    throw new Error("invalid paired-devices row");
  }
  const rec: DeviceRecord = {
    deviceId: raw.deviceId,
    tokenHash: raw.tokenHash,
    accountIds: Array.isArray(raw.accountIds)
      ? raw.accountIds.filter((x): x is string => typeof x === "string")
      : [],
    ownerTrusted: raw.ownerTrusted === true,
    revoked: raw.revoked === true,
    label: raw.label,
    createdAt: raw.createdAt,
  };
  if (typeof raw.lastSeenAt === "string") rec.lastSeenAt = raw.lastSeenAt;
  return rec;
}

/**
 * Design §4.1 rule 4 — zero-binding devices may only reach this allow-list
 * (plus loopback-owner pairing methods, which a zero-binding remote never gets).
 */
export const ZERO_BINDING_ALLOW_LIST = new Set([
  "home.hello",
  "home.health",
  "home.meshStatus",
  "home.subscribe",
]);

/**
 * Resolve whether a device caller may act for `accountId` (Design §4.1).
 * Loopback owner is unbounded. Returns an error detail string on refusal.
 */
export function assertDeviceAccountBound(
  caller: { kind: string; deviceId?: string; accountIds: string[] },
  accountId: string | undefined,
  method: string,
): { accountId: string } | { error: "account_not_bound" | "zero_binding"; detail: string } {
  if (caller.kind === "loopback-owner") {
    if (typeof accountId === "string" && accountId.length > 0) return { accountId };
    return { error: "account_not_bound", detail: `${method} requires accountId` };
  }

  const bound = caller.accountIds;
  if (bound.length === 0) {
    if (ZERO_BINDING_ALLOW_LIST.has(method)) {
      // Should not be called for allow-list methods; treat as no account needed.
      return { error: "zero_binding", detail: `${method} is on the zero-binding allow-list` };
    }
    return {
      error: "zero_binding",
      detail: `device has no account bindings; ${method} is outside the §4.1 rule-4 allow-list`,
    };
  }

  if (typeof accountId !== "string" || accountId.length === 0) {
    if (bound.length === 1) return { accountId: bound[0]! };
    return {
      error: "account_not_bound",
      detail: `${method} requires accountId when the device is bound to more than one account`,
    };
  }

  if (!bound.includes(accountId)) {
    return {
      error: "account_not_bound",
      detail: `device is not bound to account ${accountId}`,
    };
  }
  return { accountId };
}
