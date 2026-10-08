// Daemon-owned bindings — Design §4.1 / Appendix A.3 / Plan B3.
// Client never supplies its own binding; owner-scope to change.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homePaths, type HomePaths } from "./home-paths.js";
import type { DeviceCredentialStore, HomeCaller } from "./auth.js";

export type SenderBinding = {
  kind: "sender";
  bindingId: string;
  channel: string;
  channelAccount: string;
  senderId: string;
  accountId: string;
  agentId: string;
  machine: boolean;
  trustedChannel: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DeviceBinding = {
  kind: "device";
  bindingId: string;
  deviceId: string;
  accountId: string;
  agentId: string;
  ownerTrusted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BindingRecord = SenderBinding | DeviceBinding;

export class BindingError extends Error {
  override readonly name = "BindingError";
  constructor(
    readonly kind: "bad_params" | "auth" | "not_found" | "conflict",
    message: string,
  ) {
    super(message);
  }
}

interface BindingsFile {
  version: 1;
  bindings: BindingRecord[];
}

function stableId(parts: string[]): string {
  const h = createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);
  return `bind_${h}`;
}

function senderKey(channel: string, channelAccount: string, senderId: string): string {
  return `sender:${channel}:${channelAccount}:${senderId}`;
}

function deviceKey(deviceId: string, accountId: string): string {
  // One row per (deviceId, accountId). A device may bind to multiple accounts
  // (Design §4.1); setDeviceAccounts (B4) is the bulk form.
  return `device:${deviceId}:${accountId}`;
}

export class BindingStore {
  readonly paths: HomePaths;
  private cache: BindingRecord[] | null = null;

  constructor(
    stateDir: string,
    private readonly devices: DeviceCredentialStore,
  ) {
    this.paths = homePaths(stateDir);
  }

  private async load(): Promise<BindingRecord[]> {
    if (this.cache) return this.cache;
    await mkdir(this.paths.pairedDevicesDir, { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.paths.bindingsJson, "utf8")) as BindingsFile;
      this.cache = Array.isArray(raw.bindings) ? raw.bindings : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async save(bindings: BindingRecord[]): Promise<void> {
    await mkdir(this.paths.pairedDevicesDir, { recursive: true });
    const body: BindingsFile = { version: 1, bindings };
    await writeFile(this.paths.bindingsJson, JSON.stringify(body, null, 2) + "\n", "utf8");
    this.cache = bindings;
  }

  async list(filter: { accountId?: string; deviceId?: string } = {}): Promise<BindingRecord[]> {
    const all = await this.load();
    return all.filter((b) => {
      if (filter.accountId !== undefined && b.accountId !== filter.accountId) return false;
      if (filter.deviceId !== undefined) {
        if (b.kind !== "device" || b.deviceId !== filter.deviceId) return false;
      }
      return true;
    });
  }

  async get(bindingId: string): Promise<BindingRecord | undefined> {
    const all = await this.load();
    return all.find((b) => b.bindingId === bindingId);
  }

  /**
   * Resolve a channel sender → account. Unknown ⇒ null (V-SEC-3: pairing or
   * deny — never invent an agent/account).
   */
  async resolveSender(
    channel: string,
    channelAccount: string,
    senderId: string,
  ): Promise<SenderBinding | null> {
    const all = await this.load();
    const hit = all.find(
      (b): b is SenderBinding =>
        b.kind === "sender" &&
        b.channel === channel &&
        b.channelAccount === channelAccount &&
        b.senderId === senderId,
    );
    return hit ?? null;
  }

  /**
   * Accounts a device is bound to (daemon-owned). Empty ⇒ zero-binding scope.
   */
  async accountsForDevice(deviceId: string): Promise<string[]> {
    const all = await this.load();
    const ids = all
      .filter((b): b is DeviceBinding => b.kind === "device" && b.deviceId === deviceId)
      .map((b) => b.accountId);
    return [...new Set(ids)];
  }

  /**
   * Set a sender or device binding. Owner-scope only (enforced by router).
   *
   * - Daemon-owned: the client cannot invent a bindingId; we derive it.
   * - Cannot silently redirect: an existing row for the same identity that
   *   already points at a *different* accountId is refused unless the caller
   *   passes the same accountId (idempotent) — use removeBinding then set, or
   *   an explicit rebind via `allowRebind`.
   */
  async set(
    params: Record<string, unknown>,
    caller: HomeCaller,
    options: { allowRebind?: boolean } = {},
  ): Promise<{ bindingId: string; binding: BindingRecord }> {
    const hasSender =
      typeof params.senderId === "string" &&
      typeof params.channel === "string" &&
      typeof params.channelAccount === "string";
    const hasDevice = typeof params.deviceId === "string";

    if (hasSender === hasDevice) {
      throw new BindingError(
        "bad_params",
        "exactly one of (senderId+channel+channelAccount) or deviceId is required",
      );
    }
    if (typeof params.accountId !== "string" || params.accountId.length === 0) {
      throw new BindingError("bad_params", "accountId is required");
    }
    const accountId = params.accountId;
    const agentId = typeof params.agentId === "string" && params.agentId.length > 0
      ? params.agentId
      : "default";
    const now = new Date().toISOString();
    const all = await this.load();

    if (hasSender) {
      const channel = params.channel as string;
      const channelAccount = params.channelAccount as string;
      const senderId = params.senderId as string;
      const bindingId = stableId([senderKey(channel, channelAccount, senderId)]);
      const machine = params.machine === true;
      const trustedChannel = params.trustedChannel === true;

      const existingIdx = all.findIndex((b) => b.bindingId === bindingId);
      if (existingIdx >= 0) {
        const prev = all[existingIdx]!;
        if (prev.kind !== "sender") {
          throw new BindingError("conflict", "bindingId collision");
        }
        if (prev.accountId !== accountId && options.allowRebind !== true) {
          // Fail closed: do not silently redirect a sender to another account.
          throw new BindingError(
            "conflict",
            `binding already maps to account ${prev.accountId}; remove it before rebinding`,
          );
        }
        const updated: SenderBinding = {
          ...prev,
          accountId,
          agentId,
          machine,
          trustedChannel,
          updatedAt: now,
        };
        all[existingIdx] = updated;
        await this.save(all);
        return { bindingId, binding: updated };
      }

      const created: SenderBinding = {
        kind: "sender",
        bindingId,
        channel,
        channelAccount,
        senderId,
        accountId,
        agentId,
        machine,
        trustedChannel,
        createdAt: now,
        updatedAt: now,
      };
      all.push(created);
      await this.save(all);
      return { bindingId, binding: created };
    }

    // deviceId form
    const deviceId = params.deviceId as string;
    const ownerTrusted = params.ownerTrusted === true;
    // Design A.3: setting ownerTrusted requires the loopback owner window.
    if (ownerTrusted && caller.kind !== "loopback-owner") {
      throw new BindingError(
        "auth",
        "ownerTrusted may only be set from the loopback owner window",
      );
    }

    const bindingId = stableId([deviceKey(deviceId, accountId)]);
    const existingIdx = all.findIndex((b) => b.bindingId === bindingId);
    if (existingIdx >= 0) {
      const prev = all[existingIdx]!;
      if (prev.kind !== "device") {
        throw new BindingError("conflict", "bindingId collision");
      }
      if (prev.accountId !== accountId && options.allowRebind !== true) {
        throw new BindingError(
          "conflict",
          `binding already maps to account ${prev.accountId}; remove it before rebinding`,
        );
      }
      const updated: DeviceBinding = {
        ...prev,
        accountId,
        agentId,
        ownerTrusted: ownerTrusted || prev.ownerTrusted,
        updatedAt: now,
      };
      // Clear ownerTrusted only when explicitly set false from loopback.
      if (params.ownerTrusted === false && caller.kind === "loopback-owner") {
        updated.ownerTrusted = false;
      }
      all[existingIdx] = updated;
      await this.save(all);
      this.syncDeviceStore(deviceId);
      return { bindingId, binding: updated };
    }

    const created: DeviceBinding = {
      kind: "device",
      bindingId,
      deviceId,
      accountId,
      agentId,
      ownerTrusted,
      createdAt: now,
      updatedAt: now,
    };
    all.push(created);
    await this.save(all);
    this.syncDeviceStore(deviceId);
    return { bindingId, binding: created };
  }

  async remove(bindingId: string): Promise<void> {
    const all = await this.load();
    const idx = all.findIndex((b) => b.bindingId === bindingId);
    if (idx < 0) {
      throw new BindingError("not_found", `unknown binding: ${bindingId}`);
    }
    const [removed] = all.splice(idx, 1);
    await this.save(all);
    if (removed && removed.kind === "device") {
      this.syncDeviceStore(removed.deviceId);
    }
  }

  /** Drop every binding that targets `accountId` (home.deleteAccount). */
  async removeForAccount(accountId: string): Promise<number> {
    const all = await this.load();
    const kept: BindingRecord[] = [];
    const touchedDevices = new Set<string>();
    let removed = 0;
    for (const b of all) {
      if (b.accountId === accountId) {
        removed++;
        if (b.kind === "device") touchedDevices.add(b.deviceId);
        continue;
      }
      kept.push(b);
    }
    if (removed > 0) {
      await this.save(kept);
      for (const deviceId of touchedDevices) this.syncDeviceStore(deviceId);
    }
    return removed;
  }

  /**
   * Keep DeviceCredentialStore.accountIds / ownerTrusted aligned with durable
   * bindings (in-memory until B4 persists paired-devices hashes).
   */
  private syncDeviceStore(deviceId: string): void {
    const rec = this.devices.getById(deviceId);
    if (!rec) return;
    const deviceBindings = (this.cache ?? []).filter(
      (b): b is DeviceBinding => b.kind === "device" && b.deviceId === deviceId,
    );
    rec.accountIds = [...new Set(deviceBindings.map((b) => b.accountId))];
    rec.ownerTrusted = deviceBindings.some((b) => b.ownerTrusted);
    this.devices.put(rec);
  }
}

/** Test helper — mint a unique sender id fragment. */
export function freshSenderId(): string {
  return `sender_${randomUUID().slice(0, 8)}`;
}
