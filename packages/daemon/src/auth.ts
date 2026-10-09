// Session identity for reuse-host (Design §3.3.1).
// Loopback → loopback-owner. Token → device session. Unknown token → null (refused).
// B4: credentials are verified by SHA-256 hash; raw tokens are never persisted.

import { createHash } from "node:crypto";
import type { SessionIdentityResolver } from "@envoymesh/reuse-host";

/** Caller context handed back through HostRpcDispatcher. Opaque to the transport. */
export type CallerKind = "loopback-owner" | "device" | "hatch";

export interface HomeCaller {
  kind: CallerKind;
  deviceId?: string;
  /** Accounts this principal may act for. Empty ⇒ zero-binding scope (§4.1 rule 4). */
  accountIds: string[];
  ownerTrusted: boolean;
}

/**
 * Mirrors `@envoymesh/host-connect` HostSession. reuse-host does not re-export
 * the type, so we keep a local compatible shape (Design §3.1 / R11).
 */
export interface HomeSession {
  scopeKey: string;
  ownerId: string;
  isOwnerScope: boolean;
  deviceId?: string;
  caller: HomeCaller;
}

export const LOOPBACK_SCOPE = "loopback-owner";

/** SHA-256 hex of a device credential (Design §4.2 — hashes only under paired-devices/). */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function loopbackCaller(): HomeCaller {
  return { kind: "loopback-owner", accountIds: [], ownerTrusted: true };
}

export function loopbackSession(): HomeSession {
  return {
    scopeKey: LOOPBACK_SCOPE,
    ownerId: LOOPBACK_SCOPE,
    isOwnerScope: true,
    caller: loopbackCaller(),
  };
}

/** In-memory + durable device credential row. Persist `tokenHash` only — never the raw token. */
export interface DeviceRecord {
  deviceId: string;
  /** SHA-256 hex of the credential. */
  tokenHash: string;
  accountIds: string[];
  ownerTrusted: boolean;
  revoked: boolean;
  label: string;
  createdAt: string;
  lastSeenAt?: string;
  /**
   * How the credential was minted. Unused `"qr"` rows may be pruned when Pairing
   * re-opens (EnvoyCoder paired-devices pruneUnusedQrCodes). User-chosen short
   * tokens are never auto-pruned.
   */
  mintKind?: "qr" | "user";
}

export class DeviceCredentialStore {
  private readonly byHash = new Map<string, DeviceRecord>();
  private readonly byId = new Map<string, DeviceRecord>();

  put(record: DeviceRecord): void {
    // Drop any previous hash index for this deviceId so a re-mint does not leave a stale hash live.
    const prev = this.byId.get(record.deviceId);
    if (prev && prev.tokenHash !== record.tokenHash) {
      this.byHash.delete(prev.tokenHash);
    }
    this.byHash.set(record.tokenHash, record);
    this.byId.set(record.deviceId, record);
  }

  /** Present the raw token; lookup is by hash (verify-on-present). */
  getByToken(token: string): DeviceRecord | undefined {
    return this.byHash.get(hashDeviceToken(token));
  }

  getByTokenHash(tokenHash: string): DeviceRecord | undefined {
    return this.byHash.get(tokenHash);
  }

  getById(deviceId: string): DeviceRecord | undefined {
    return this.byId.get(deviceId);
  }

  remove(deviceId: string): void {
    const rec = this.byId.get(deviceId);
    if (!rec) return;
    this.byId.delete(deviceId);
    this.byHash.delete(rec.tokenHash);
  }

  /** Binding lookup for hatch / turns (V-SEC-12). */
  accountsForDevice(deviceId: string): string[] {
    const rec = this.byId.get(deviceId);
    if (!rec || rec.revoked) return [];
    return [...rec.accountIds];
  }

  /** Whether a hatch/device caller may act for accountId. */
  isBound(deviceId: string, accountId: string): boolean {
    return this.accountsForDevice(deviceId).includes(accountId);
  }

  list(): DeviceRecord[] {
    return [...this.byId.values()];
  }

  /** Replace in-memory contents from a durable load (PairingStore). */
  replaceAll(records: DeviceRecord[]): void {
    this.byHash.clear();
    this.byId.clear();
    for (const rec of records) this.put(rec);
  }
}

export function createSessionIdentity(
  devices: DeviceCredentialStore,
): SessionIdentityResolver<HomeCaller> {
  return {
    localScopeKey: LOOPBACK_SCOPE,
    async resolveSession(token: string): Promise<HomeSession | null> {
      const rec = devices.getByToken(token);
      if (!rec || rec.revoked) return null;
      return {
        scopeKey: rec.deviceId,
        ownerId: rec.deviceId,
        isOwnerScope: rec.ownerTrusted,
        deviceId: rec.deviceId,
        caller: {
          kind: "device",
          deviceId: rec.deviceId,
          accountIds: [...rec.accountIds],
          ownerTrusted: rec.ownerTrusted,
        },
      };
    },
  };
}
