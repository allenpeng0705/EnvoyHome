// Assemble WS host + HTTP hatch + claim file (Plan B2) + accounts/bindings (B3) + pairing/mesh (B4).

import type { Server } from "node:http";
import { mkdir } from "node:fs/promises";
import { defaultConfig, type DaemonConfig } from "./config.js";
import { clearClaim, makeClaim, writeClaim } from "./claim.js";
import { DaemonLogger } from "./logger.js";
import { DeviceCredentialStore } from "./auth.js";
import { SubscriptionRegistry } from "./events.js";
import { startWsHost, type HostHandle } from "./host.js";
import { startHttpHatch } from "./http.js";
import { AccountStore } from "./accounts.js";
import { BindingStore } from "./bindings.js";
import { PairingStore } from "./pairing.js";
import { createMeshHost, type MeshHostHandle } from "./mesh-host.js";
import { MemoryFacade } from "@envoyhome/memory";
import telegramPlugin from "@envoyhome/channel-telegram";
import { ChannelService } from "./channels/service.js";
import { SessionStore } from "./sessions.js";
import { ProviderStore } from "./providers-store.js";
import { HarnessStore } from "./harness-store.js";
import { TurnService } from "./turn-service.js";
import { homePaths } from "./home-paths.js";
import { ActuationService } from "./actuation-service.js";
import { WorkflowStore } from "./workflows.js";
import { SkillService } from "./skills.js";
import { ArtifactService } from "./artifacts.js";

export interface RunningDaemon {
  config: DaemonConfig;
  logger: DaemonLogger;
  devices: DeviceCredentialStore;
  accounts: AccountStore;
  bindings: BindingStore;
  pairing: PairingStore;
  memory: MemoryFacade;
  channels: ChannelService;
  turns: TurnService;
  providers: ProviderStore;
  harnesses: HarnessStore;
  workflows: WorkflowStore;
  skills: SkillService;
  artifacts: ArtifactService;
  actuations: ActuationService;
  mesh: MeshHostHandle;
  subscriptions: SubscriptionRegistry;
  ws: HostHandle;
  http: Server;
  startedAt: Date;
  /** Mutate which accounts the hatch API key may act for (tests / B3 wiring). */
  setHatchBoundAccounts: (accounts: string[]) => void;
  stop: () => Promise<void>;
}

export interface StartDaemonOptions {
  config?: Partial<DaemonConfig>;
  packageVersion?: string;
  /** Accounts the hatch API key may act for (V-SEC-12). */
  hatchBoundAccounts?: string[];
  managedBy?: "app" | "service";
}

export async function startDaemon(options: StartDaemonOptions = {}): Promise<RunningDaemon> {
  const config = defaultConfig(options.config ?? {});
  const logger = new DaemonLogger();
  const devices = new DeviceCredentialStore();
  const accounts = new AccountStore(config.stateDir);
  const bindings = new BindingStore(config.stateDir, devices);
  const pairing = new PairingStore(config.stateDir, devices, bindings);
  const memory = new MemoryFacade({ stateDir: config.stateDir });
  const channels = new ChannelService({
    stateDir: config.stateDir,
    bindings,
    logger,
    bundledPlugins: [telegramPlugin],
  });
  await channels.loadPersisted();
  const paths = homePaths(config.stateDir);
  const sessions = new SessionStore(paths);
  const providers = new ProviderStore(paths);
  await providers.load();
  const harnesses = new HarnessStore(paths);
  await harnesses.load();
  const workflows = new WorkflowStore(paths);
  await workflows.reload();
  const skills = new SkillService(paths);
  const artifacts = new ArtifactService(paths, () => config.publicBaseUrl);
  const actuations = new ActuationService(paths);
  const turns = new TurnService(
    paths,
    sessions,
    providers,
    harnesses,
    accounts,
    memory,
    workflows,
  );
  const mesh = createMeshHost({
    config: {
      hostingEnabled: config.meshHostingEnabled,
      attachEnabled: config.meshAttachEnabled,
    },
  });
  const subscriptions = new SubscriptionRegistry();
  const startedAt = new Date();
  const packageVersion = options.packageVersion ?? "0.0.0";
  const hatchBinding = { accounts: options.hatchBoundAccounts ?? [] };

  await mkdir(config.stateDir, { recursive: true });
  await accounts.ensureLayout();
  // Load durable paired-devices hashes into the credential store (B4).
  await pairing.list();
  const knownAccounts = (await accounts.list()).map((a) => a.accountId);
  await actuations.reconcileAll(knownAccounts);

  let stopping = false;
  const stoppers: Array<() => void | Promise<void>> = [];

  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info("shutting down");
    for (const s of stoppers.reverse()) {
      try {
        await s();
      } catch (err) {
        logger.warn(`stop hook failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await clearClaim(config.stateDir);
    logger.info("stopped");
  };

  // Host starts first so pairing.revoke can disconnect live WS sessions.
  // Pairing handlers need the bound port; we patch config.wsPort after serve.
  let wsRef: HostHandle | undefined;
  pairing.onRevokeLive = (deviceId) => {
    wsRef?.disconnectClientsForDevice(deviceId);
  };

  const ws = await startWsHost({
    port: config.wsPort,
    devices,
    routerDeps: {
      config,
      startedAt,
      logger,
      subscriptions,
      packageVersion,
      accounts,
      bindings,
      pairing,
      memory,
      channels,
      turns,
      providers,
      harnesses,
      workflows,
      skills,
      artifacts,
      actuations,
      activeTurns: () => turns.activeTurnCount(),
      meshStatus: () => mesh.status(),
      meshDualModeNotes: () => mesh.dualModeNotes(),
      onShutdown: (_reason, graceSec) => {
        setTimeout(() => {
          void stop();
        }, Math.max(0, graceSec) * 1000);
      },
    },
  });
  wsRef = ws;
  // Reflect the OS-assigned port (port: 0 in tests) into config so mintPairing
  // appends the resolved WS port (Design A.2).
  config.wsPort = ws.host.port;
  stoppers.push(() => {
    mesh.stop();
    ws.stop();
  });

  const http = await startHttpHatch({
    port: config.httpPort,
    apiKey: config.hatchApiKey,
    devices,
    logger,
    hatchBoundAccounts: () => hatchBinding.accounts,
    handleInbound: async (input) => channels.handleHatchText(input),
    artifacts,
    artifactSecret: () => artifacts.ensureSecret(),
    production: process.env.NODE_ENV === "production",
  });
  stoppers.push(
    () =>
      new Promise<void>((resolve, reject) => {
        http.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  const httpAddr = http.address();
  const httpPort = typeof httpAddr === "object" && httpAddr ? httpAddr.port : config.httpPort;

  const claim = makeClaim({
    instanceId: config.instanceId,
    port: ws.host.port,
    stateDir: config.stateDir,
    version: packageVersion,
    ...(options.managedBy !== undefined ? { managedBy: options.managedBy } : {}),
  });
  await writeClaim(claim);
  logger.info(
    `daemon claim written (pid=${claim.pid} instanceId=${claim.instanceId} ws=${claim.port})`,
  );
  logger.info(`WS listening on ${ws.host.port} path=/ws`);
  if (config.meshHostingEnabled) {
    logger.info("mesh hosting enabled (status=hosting; phone dials this peer — V-P2-MESH-1)");
  }

  return {
    config: { ...config, wsPort: ws.host.port, httpPort },
    logger,
    devices,
    accounts,
    bindings,
    pairing,
    memory,
    channels,
    turns,
    providers,
    harnesses,
    workflows,
    skills,
    artifacts,
    actuations,
    mesh,
    subscriptions,
    ws,
    http,
    startedAt,
    setHatchBoundAccounts(next: string[]) {
      hatchBinding.accounts = next;
    },
    stop,
  };
}
