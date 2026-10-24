// Mesh hosting — Design §2.3 / Plan B4 / EnvoyDev createCoderMeshPeer peer.
//
// Reuse `@envoymesh/network` for the libp2p stack; do not re-derive relay handling.
// Phone dials this hosting peer (never attach-as-route — V-P2-MESH-1/2).

import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS } from "@envoymesh/api/core";
import {
  CLIENT_PROXY_PROTOCOL,
  EnvoyMesh,
  buildEnvoyUserAgent,
  meshStreamAsDuplex,
  type EnvoyMeshOptions,
} from "@envoymesh/network";
import { ENVOYMESH_VERSION } from "@envoymesh/protocol";
import {
  createMeshHostTransport,
  createProxyCloseRegistry,
  type FramedDuplex,
  type HostRpcDispatcher,
  type MeshHostTransportOptions,
  type SessionIdentityResolver,
} from "@envoymesh/reuse-host";
import type { HomePaths } from "./home-paths.js";
import {
  loadOrCreateMeshIdentity,
  meshIdentityPath,
  type HomeMeshPrivateKey,
} from "./mesh-identity.js";

export type MeshKind = "hosting" | "attached" | "no-node" | "refused";

export interface MeshStatus {
  kind: MeshKind;
  peerId?: string;
  multiaddrs?: string[];
  relayHints?: string[];
  peerCount?: number;
  scopeKey?: string;
  reason?: string;
  code?: string;
}

export interface MeshHostConfig {
  hostingEnabled: boolean;
  attachEnabled: boolean;
  listenPort?: number;
  disableDuplicateMdns?: boolean;
  peerId?: string;
  multiaddrs?: string[];
}

export const DEFAULT_MESH_HOST_CONFIG: MeshHostConfig = {
  hostingEnabled: false,
  attachEnabled: false,
  disableDuplicateMdns: true,
};

export const HOME_MESH_RELAY_HINTS: readonly string[] =
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS;

/** Phone-facing host options — QR names the peer; no DHT/mDNS swarm (EnvoyDev coderMeshOptions). */
export function homeMeshOptions(identity?: HomeMeshPrivateKey): EnvoyMeshOptions {
  return {
    listen: ["/ip4/0.0.0.0/tcp/0"],
    enableMdns: false,
    enableDht: false,
    dhtClientMode: false,
    bootstrapPeers: [],
    enableAutoNat: false,
    enableRelay: true,
    configuredRelayAddrs: [...DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS],
    enableDcutr: true,
    // Family UA enum has no "envoyhome" yet — use envoydev (same thin-daemon hosting role).
    userAgent: buildEnvoyUserAgent("envoydev", ENVOYMESH_VERSION),
    ...(identity ? { libp2pPrivateKey: identity } : {}),
  };
}

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
  createTransport: typeof createMeshHostTransport;
  dualModeNotes: () => string[];
  stop: () => void;
}

/** Lightweight status stub (tests / doctor notes). Live peer is {@link createHomeMeshPeer}. */
export function createMeshHost(options: {
  config?: Partial<MeshHostConfig>;
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
    stop: () => undefined,
  };
}

/* ── Live hosting peer (EnvoyDev createCoderMeshPeer) ─────────────────────── */

export interface HomeMeshPeerNode {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly peerId: string;
  readonly multiaddrs: string[];
  handleRawProtocol(
    protocol: string,
    handler: (stream: unknown, connection: unknown) => Promise<void>,
  ): Promise<void>;
  getRelayAdvertisedMultiaddrs?(): string[];
  getConnectedPeerIds?(): string[];
}

export type HomeMeshNodeFactory = (options: EnvoyMeshOptions) => HomeMeshPeerNode;

export interface HomeMeshPeerOptions {
  paths: HomePaths;
  sessionIdentity: SessionIdentityResolver<unknown>;
  dispatch: HostRpcDispatcher<unknown>;
  subscribe?: (send: (event: string, data: unknown) => void) => () => void;
  /** Design `2026-10-24` — mesh stream end clears live-presence (same as WS close). */
  onAuthenticatedClose?: (deviceId: string) => void;
  createNode?: HomeMeshNodeFactory;
  toDuplex?: (stream: unknown) => FramedDuplex;
}

export interface HomeMeshPeer {
  start(): Promise<MeshStatus>;
  stop(): Promise<void>;
  status(): MeshStatus;
  readonly peerId: string | undefined;
  readonly multiaddrs: string[];
  readonly relayHints: string[];
  closeStreamsForDevice(deviceId: string): number;
}

function createProxyServe(
  ports: Pick<
    HomeMeshPeerOptions,
    "sessionIdentity" | "dispatch" | "subscribe" | "onAuthenticatedClose"
  >,
  registry: ReturnType<typeof createProxyCloseRegistry>,
): (duplex: FramedDuplex) => Promise<void> {
  return createMeshHostTransport<unknown>((duplex: FramedDuplex): MeshHostTransportOptions<unknown> => {
    let unregister: () => void = () => undefined;
    let deviceId: string | undefined;
    return {
      sessionIdentity: {
        localScopeKey: ports.sessionIdentity.localScopeKey,
        resolveSession: async (token: string) => {
          const session = await ports.sessionIdentity.resolveSession(token);
          if (!session) return null;
          deviceId = session.deviceId;
          unregister = registry.register(session.deviceId, () => {
            void duplex.close();
          });
          return session;
        },
      },
      dispatch: ports.dispatch,
      subscribe: (send: (event: string, data: unknown) => void) => {
        const unsubscribe = ports.subscribe?.(send) ?? (() => undefined);
        return () => {
          unsubscribe();
          unregister();
          if (deviceId) ports.onAuthenticatedClose?.(deviceId);
        };
      },
    };
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function stopQuietly(target: HomeMeshPeerNode): Promise<void> {
  try {
    await target.stop();
  } catch {
    /* abandon cause already reported */
  }
}

/**
 * EnvoyHome's own mesh peer — phone dials this hosting peer over CLIENT_PROXY
 * (same surface as local WS `home.*`).
 */
export function createHomeMeshPeer(options: HomeMeshPeerOptions): HomeMeshPeer {
  const relayHints = [...DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS];
  const createNode =
    options.createNode ?? ((meshOptions: EnvoyMeshOptions) => new EnvoyMesh(meshOptions));
  const toDuplex = options.toDuplex ?? ((stream: unknown) => meshStreamAsDuplex(stream as never));
  const registry = createProxyCloseRegistry();
  const serve = createProxyServe(options, registry);

  let node: HomeMeshPeerNode | undefined;
  let generation = 0;
  let lastStatus: MeshStatus = {
    kind: "no-node",
    reason: "The daemon's own mesh peer has not been started.",
  };

  const readPeerId = (target: HomeMeshPeerNode): string | undefined => {
    try {
      const id = target.peerId;
      return typeof id === "string" && id.length > 0 ? id : undefined;
    } catch {
      return undefined;
    }
  };

  const advertisedAddrs = (): string[] => {
    if (!node) return [];
    try {
      const relayed = node.getRelayAdvertisedMultiaddrs?.();
      const addrs = relayed && relayed.length > 0 ? relayed : node.multiaddrs;
      return [...new Set(addrs)];
    } catch {
      return [];
    }
  };

  const hostingStatus = (): MeshStatus | undefined => {
    if (!node) return undefined;
    const peerId = readPeerId(node);
    if (!peerId) return undefined;
    let peerCount: number | undefined;
    try {
      peerCount = node.getConnectedPeerIds?.()?.length;
    } catch {
      peerCount = undefined;
    }
    const status: MeshStatus = {
      kind: "hosting",
      peerId,
      multiaddrs: advertisedAddrs(),
      relayHints: [...relayHints],
    };
    if (peerCount !== undefined) status.peerCount = peerCount;
    return status;
  };

  const refused = (code: string, reason: string): MeshStatus => ({
    kind: "refused",
    code,
    reason,
  });

  return {
    get peerId() {
      return node ? readPeerId(node) : undefined;
    },
    get multiaddrs() {
      return advertisedAddrs();
    },
    get relayHints() {
      return [...relayHints];
    },

    async start() {
      if (node) return hostingStatus() ?? lastStatus;
      const mine = ++generation;

      let created: HomeMeshPeerNode;
      try {
        const identity = await loadOrCreateMeshIdentity(meshIdentityPath(options.paths));
        if (mine !== generation) return lastStatus;
        created = createNode(homeMeshOptions(identity));
      } catch (error) {
        lastStatus = refused(
          "mesh-start-failed",
          `The mesh peer could not be created: ${messageOf(error)}.`,
        );
        return lastStatus;
      }

      try {
        await created.start();
      } catch (error) {
        await stopQuietly(created);
        lastStatus = refused(
          "mesh-start-failed",
          `The mesh peer did not start: ${messageOf(error)}.`,
        );
        return lastStatus;
      }
      if (mine !== generation) {
        await stopQuietly(created);
        return lastStatus;
      }

      if (!readPeerId(created)) {
        await stopQuietly(created);
        lastStatus = refused(
          "mesh-unusable",
          "The mesh peer started but reported no peer id.",
        );
        return lastStatus;
      }

      try {
        await created.handleRawProtocol(CLIENT_PROXY_PROTOCOL, async (stream) => {
          await serve(toDuplex(stream));
        });
      } catch (error) {
        await stopQuietly(created);
        lastStatus = refused(
          "mesh-protocol-failed",
          `CLIENT_PROXY_PROTOCOL could not be registered: ${messageOf(error)}.`,
        );
        return lastStatus;
      }
      if (mine !== generation) {
        await stopQuietly(created);
        return lastStatus;
      }

      node = created;
      const hosting = hostingStatus();
      if (!hosting) {
        node = undefined;
        await stopQuietly(created);
        lastStatus = refused("mesh-unusable", "The mesh peer reported no peer id after start.");
        return lastStatus;
      }
      lastStatus = hosting;
      return lastStatus;
    },

    async stop() {
      generation += 1;
      const current = node;
      node = undefined;
      if (!current) return;
      try {
        await current.stop();
        lastStatus = { kind: "no-node", reason: "The daemon's own mesh peer is stopped." };
      } catch (error) {
        lastStatus = refused(
          "mesh-stop-failed",
          `Stopping the mesh peer failed: ${messageOf(error)}.`,
        );
      }
    },

    status() {
      if (lastStatus.kind === "hosting") return hostingStatus() ?? lastStatus;
      return lastStatus;
    },

    closeStreamsForDevice(deviceId: string): number {
      return registry.closeForDevice(deviceId);
    },
  };
}

/**
 * Snapshot for `home.mintPairing` QR mesh fields (EnvoyDev / EnvoyCoder peer).
 *
 * `bootstrapPeers` is the whole multiaddr half of the contract: local/LAN listen
 * addrs, one `/p2p-circuit` per community relay, and the bare relay hints —
 * same shape EnvoyCoder's host-bridge regression locks.
 */
export function meshMintFields(peer: HomeMeshPeer | null | undefined): {
  homeNodePeerId?: string;
  bootstrapPeers?: string[];
} {
  if (!peer) return {};
  const st = peer.status();
  if (st.kind !== "hosting" || !st.peerId) return {};
  const peerId = st.peerId;
  const hints = [...(st.relayHints ?? peer.relayHints)];
  const seen = new Set<string>();
  const bootstrapPeers: string[] = [];
  const push = (addr: string) => {
    const t = addr.trim();
    if (!t || !seen.add(t)) return;
    bootstrapPeers.push(t);
  };
  for (const a of st.multiaddrs ?? peer.multiaddrs) push(a);
  for (const hint of hints) {
    push(hint);
    // Circuit through this home node — phone seeds peer store without DHT.
    if (hint && !hint.includes("/p2p-circuit/")) {
      push(`${hint}/p2p-circuit/p2p/${peerId}`);
    }
  }
  if (bootstrapPeers.length === 0) return {};
  return { homeNodePeerId: peerId, bootstrapPeers };
}
