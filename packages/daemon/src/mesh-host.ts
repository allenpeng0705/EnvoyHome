// Mesh hosting status — Design §2.3 / Plan B4.
//
// Prefer `createMeshHostTransport` from `@envoymesh/reuse-host` when a real duplex
// is available (V-P2-MESH-1/2). B4 does **not** re-derive EnvoyMesh relay handling
// (`addRelay` / `ReservationStore` / reservation verification live upstream in
// `@envoymesh/network`). This module owns EnvoyHome concerns only: status surface,
// dual-mode port/mDNS notes, and a faithful stub for tests with fakes.

import { createMeshHostTransport } from "@envoymesh/reuse-host";
import type { createSessionIdentity } from "./auth.js";

export type MeshKind = "hosting" | "attached" | "no-node";

export interface MeshStatus {
  kind: MeshKind;
  peerId?: string;
  multiaddrs?: string[];
  scopeKey?: string;
}

export interface MeshHostConfig {
  /**
   * When true, the daemon reports `{ kind: "hosting" }` (phone dials this peer —
   * V-P2-MESH-1). Default false ⇒ `no-node` so B2/B3 tests stay green without a
   * libp2p stack.
   */
  hostingEnabled: boolean;
  /**
   * Optional dual-mode: product may attach to a local EnvoyMesh node *beside*
   * hosting (Design §2.3). Attach never becomes the phone dial target
   * (V-P2-MESH-2). When both are set, status remains `hosting` — the dial target
   * stays the hosting peer.
   */
  attachEnabled: boolean;
  /** Pinned listen port for dual-mode (avoid colliding with EnvoyMesh 3030/3031). */
  listenPort?: number;
  /** Disable duplicate mDNS advertisement when attach + hosting coexist. */
  disableDuplicateMdns?: boolean;
  peerId?: string;
  multiaddrs?: string[];
}

export const DEFAULT_MESH_HOST_CONFIG: MeshHostConfig = {
  hostingEnabled: false,
  attachEnabled: false,
  disableDuplicateMdns: true,
};

/**
 * Resolve `home.meshStatus` / `home.hello.mesh` (Design A.1).
 *
 * - hostingEnabled → `hosting` (even if attachEnabled — phone dial stays hosting)
 * - attach only → `attached`
 * - neither → `no-node`
 */
export function resolveMeshStatus(config: MeshHostConfig): MeshStatus {
  if (config.hostingEnabled) {
    const status: MeshStatus = { kind: "hosting" };
    if (config.peerId !== undefined) status.peerId = config.peerId;
    if (config.multiaddrs !== undefined) status.multiaddrs = [...config.multiaddrs];
    return status;
  }
  if (config.attachEnabled) {
    const status: MeshStatus = { kind: "attached" };
    if (config.peerId !== undefined) status.peerId = config.peerId;
    if (config.multiaddrs !== undefined) status.multiaddrs = [...config.multiaddrs];
    return status;
  }
  return { kind: "no-node" };
}

export interface MeshHostHandle {
  status: () => MeshStatus;
  /**
   * Build a mesh-host transport over a product-supplied duplex (reuse-host).
   * Tests inject fakes; production wires a libp2p stream from `@envoymesh/network`
   * without re-implementing relay reservation here (Plan B4 risk row).
   */
  createTransport: typeof createMeshHostTransport;
  /** Dual-mode contention notes for doctor / operators (V-P2-MESH-2). */
  dualModeNotes: () => string[];
  stop: () => void;
}

type SessionIdentity = ReturnType<typeof createSessionIdentity>;

/**
 * Thin wrap / stub. Does not start a libp2p stack — that belongs to
 * `@envoymesh/network`. When `hostingEnabled`, status reports `hosting` so
 * phone-path tests (V-P2-MESH-1) can assert without a real peer.
 */
export function createMeshHost(options: {
  config?: Partial<MeshHostConfig>;
  /** Reserved for a future live peer; unused by the stub. */
  sessionIdentity?: SessionIdentity;
}): MeshHostHandle {
  const config: MeshHostConfig = {
    ...DEFAULT_MESH_HOST_CONFIG,
    ...options.config,
  };

  return {
    status: () => resolveMeshStatus(config),
    createTransport: createMeshHostTransport,
    dualModeNotes: () => {
      const notes: string[] = [];
      if (config.hostingEnabled && config.attachEnabled) {
        notes.push(
          "dual-mode: hosting + attach — pin listen ports and disable duplicate mDNS (V-P2-MESH-2); dial target remains the hosting peer",
        );
        if (config.listenPort !== undefined) {
          notes.push(`hosting listenPort pinned to ${config.listenPort}`);
        }
        if (config.disableDuplicateMdns) {
          notes.push("duplicate mDNS advertisement disabled");
        }
      }
      return notes;
    },
    stop: () => {
      // Stub: no live peer to tear down. Real transport close is per-duplex.
    },
  };
}
