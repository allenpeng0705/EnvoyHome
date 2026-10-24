// Per-device recent activity for interactive push suppress (Design `2026-10-22f`).
// Peer: EnvoyMesh WsServer.hasRecentlyActiveClientForOwner — recent RPC window,
// not global hasListeners (desktop loopback would starve the phone).

/** Default idle window — matches EnvoyMesh thin-client push skip (20s). */
export const PUSH_LIVE_IDLE_MS = 20_000;

/**
 * Touched on authenticated device RPCs (router skips subscribe/hello/health).
 * Interactive wakes skip APNs/FCM for a device that has been recently active;
 * schedule notify never consults this.
 */
export class LiveDevicePresence {
  private readonly lastRpcAt = new Map<string, number>();

  touch(deviceId: string, now = Date.now()): void {
    const id = deviceId.trim();
    if (!id) return;
    this.lastRpcAt.set(id, now);
  }

  clear(deviceId: string): void {
    this.lastRpcAt.delete(deviceId.trim());
  }

  /** True when this paired device sent an RPC within [maxIdleMs]. */
  isRecentlyActive(deviceId: string, maxIdleMs = PUSH_LIVE_IDLE_MS, now = Date.now()): boolean {
    const last = this.lastRpcAt.get(deviceId.trim());
    if (last == null) return false;
    return now - last <= maxIdleMs;
  }
}
