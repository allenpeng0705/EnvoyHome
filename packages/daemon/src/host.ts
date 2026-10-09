// WS host on 4780 at /ws via @envoymesh/reuse-host (Design §2.4, R11).

import {
  createReuseHost,
  type HostNodeService,
  type HostRpcDispatcher,
  type ReuseHost,
  type SessionIdentityResolver,
  type EventDisposition,
} from "@envoymesh/reuse-host";
import {
  createDispatcher,
  type RouterDeps,
} from "./router.js";
import {
  createSessionIdentity,
  type DeviceCredentialStore,
  type HomeCaller,
  type HomeSession,
} from "./auth.js";
import { RPC_TIMEOUT_MS, RPC_TIMEOUT_LONG_MS } from "./timeouts.js";
import { homeEventDispositions } from "./product-events.js";

export interface HostHandle {
  host: ReuseHost;
  connectionCount: () => number;
  /** Drop live WS sessions for a revoked device (V-RPC-3). */
  disconnectClientsForDevice: (deviceId: string) => number;
  stop: () => void;
}

function asHomeSession(session: { caller: HomeCaller } | undefined): HomeSession | undefined {
  return session as HomeSession | undefined;
}

export async function startWsHost(input: {
  port: number;
  devices: DeviceCredentialStore;
  routerDeps: Omit<RouterDeps, "connections" | "activeTurns"> & {
    activeTurns?: () => number;
  };
  /** Product event surface — required for home:* delivery. */
  nodeService: HostNodeService;
  eventDispositions?: Readonly<Record<string, EventDisposition>>;
}): Promise<HostHandle> {
  let connections = 0;
  const sessionIdentity = createSessionIdentity(input.devices);
  const inner = createDispatcher({
    ...input.routerDeps,
    connections: () => connections,
    activeTurns: input.routerDeps.activeTurns ?? (() => 0),
  });

  const dispatch: HostRpcDispatcher = (method, params, session) =>
    inner(method, params, asHomeSession(session as { caller: HomeCaller } | undefined));

  const host = createReuseHost({
    port: input.port,
    path: "/ws",
    displayName: "EnvoyHome",
    sessionIdentity: sessionIdentity as SessionIdentityResolver,
    dispatch,
    eventDispositions: input.eventDispositions ?? homeEventDispositions(),
    onConnectionChange: (n) => {
      connections = n;
    },
  });

  await host.serve(input.nodeService);

  return {
    host,
    connectionCount: () => connections,
    disconnectClientsForDevice: (deviceId: string) => host.disconnectClientsForDevice(deviceId),
    stop: () => host.stop(),
  };
}

export { RPC_TIMEOUT_MS, RPC_TIMEOUT_LONG_MS };
export type { HomeCaller };
