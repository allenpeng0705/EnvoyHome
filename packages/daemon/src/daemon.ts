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
import {
  createHomeMeshPeer,
  createMeshHost,
  meshMintFields,
  type HomeMeshNodeFactory,
  type HomeMeshPeer,
  type MeshHostHandle,
} from "./mesh-host.js";
import { MemoryFacade } from "@envoyhome/memory";
import telegramPlugin from "@envoyhome/channel-telegram";
import discordPlugin from "@envoyhome/channel-discord";
import slackPlugin from "@envoyhome/channel-slack";
import feishuPlugin from "@envoyhome/channel-feishu";
import dingtalkPlugin from "@envoyhome/channel-dingtalk";
import wecomPlugin from "@envoyhome/channel-wecom";
import mqttPlugin from "@envoyhome/channel-mqtt";
import haPlugin from "@envoyhome/channel-homeassistant";
import { ChannelService } from "./channels/service.js";
import { SessionStore } from "./sessions.js";
import { ProviderStore } from "./providers-store.js";
import { HarnessStore } from "./harness-store.js";
import { TurnService } from "./turn-service.js";
import { homePaths } from "./home-paths.js";
import { ActuationService } from "./actuation-service.js";
import { PushTokenStore } from "./push-tokens.js";
import { PushDispatcher } from "./push-dispatch.js";
import { WorkflowStore } from "./workflows.js";
import { WorkflowStepTemplateStore } from "./workflow-step-templates.js";
import { SkillService } from "./skills.js";
import { ArtifactService } from "./artifacts.js";
import { ProductEventBus, homeEventDispositions } from "./product-events.js";
import { ScheduleService } from "./schedule/service.js";
import { LocalEngineService } from "./local-engine/service.js";
import { ensureSmarthomeToolSpecsRegistered } from "./workflow-tools.js";
import { DemoHaService } from "./demo-ha.js";
import { DemoMqttService } from "./demo-mqtt.js";

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
  workflowStepTemplates: WorkflowStepTemplateStore;
  schedules: ScheduleService;
  skills: SkillService;
  artifacts: ArtifactService;
  actuations: ActuationService;
  pushTokens: PushTokenStore;
  push: PushDispatcher;
  localEngine: LocalEngineService;
  mesh: MeshHostHandle;
  /** Live hosting peer when meshHostingEnabled (null when stub-only). */
  meshPeer: HomeMeshPeer | null;
  subscriptions: SubscriptionRegistry;
  events: ProductEventBus;
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
  /**
   * Inject a fake libp2p node factory (unit tests). Production omits this and
   * uses real `@envoymesh/network` EnvoyMesh.
   */
  createMeshNode?: HomeMeshNodeFactory;
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
    bundledPlugins: [
      telegramPlugin,
      discordPlugin,
      slackPlugin,
      feishuPlugin,
      dingtalkPlugin,
      wecomPlugin,
      mqttPlugin,
      haPlugin,
    ],
  });
  await channels.loadPersisted();
  const paths = homePaths(config.stateDir);
  const sessions = new SessionStore(paths);
  const providers = new ProviderStore(paths);
  await providers.load();
  const localEngine = new LocalEngineService(paths, providers, logger);
  await localEngine.load();
  const harnesses = new HarnessStore(paths);
  await harnesses.load();
  const workflows = new WorkflowStore(paths);
  await workflows.reload();
  const workflowStepTemplates = new WorkflowStepTemplateStore(paths);
  const skills = new SkillService(paths);
  const artifacts = new ArtifactService(paths, () => config.publicBaseUrl);
  const actuations = new ActuationService(paths);
  const pushTokens = new PushTokenStore(paths);
  ensureSmarthomeToolSpecsRegistered();
  const demoHa = new DemoHaService();
  const demoMqtt = new DemoMqttService();
  const turns = new TurnService(
    paths,
    sessions,
    providers,
    harnesses,
    accounts,
    memory,
    workflows,
    skills,
    channels,
    actuations,
  );
  const events = new ProductEventBus();
  localEngine.setEmit((event, data) => events.emit(event, data));
  const schedules = new ScheduleService({
    paths,
    defaultTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    emit: (event, data) => events.emit(event, data),
  });
  const push = new PushDispatcher(pushTokens, config.stateDir, logger);
  await push.init();
  // Notify → EnvoyMesh super channel: live WS (`home:schedule-fired`) + APNs/FCM wake.
  schedules.setFireHandler(async (job) => {
    if (job.payload.kind === "notify") {
      const body = String(job.payload.message ?? job.name ?? "Reminder");
      const { sent } = await push.notifyAccount(job.accountId, {
        title: "EnvoyHome",
        body,
        data: {
          type: "schedule",
          jobId: job.id,
          accountId: job.accountId,
        },
      });
      const live = events.hasListeners("home:schedule-fired");
      return {
        execStatus: "ok",
        deliveryStatus: sent > 0 || live ? "delivered" : "not-delivered",
      };
    }
    if (job.payload.kind === "workflow" && job.payload.workflowId) {
      await turns.runScheduledWorkflow(job.accountId, job.payload.workflowId);
      return { execStatus: "ok", deliveryStatus: "none" };
    }
    if (job.payload.kind === "system") {
      const sys = job.payload.systemJob ?? "consolidate";
      if (sys === "consolidate") {
        await memory.compactMemory(job.accountId, { trust: "agent" });
      }
      // flush/review stay turn-bound until a dedicated clock path is Normative.
      return { execStatus: "ok", deliveryStatus: "none" };
    }
    if (job.payload.kind === "tool" && job.payload.toolName) {
      await turns.runScheduledTool(
        job.accountId,
        job.payload.toolName,
        job.payload.toolArgs ?? {},
      );
      return { execStatus: "ok", deliveryStatus: "none" };
    }
    if (job.payload.kind === "tool") {
      return {
        execStatus: "error",
        deliveryStatus: "none",
        error: "tool payload missing toolName",
      };
    }
    return {
      execStatus: "error",
      deliveryStatus: "none",
      error: `unsupported payload kind ${job.payload.kind}`,
    };
  });
  events.addSideEffect((event, data) => {
    void push.onProductEvent(event, data);
  });
  turns.setEmit(events.emit);
  channels.attachTurns(turns, turns.privacyMode);
  // Sync workflow schedules for known accounts
  for (const a of await accounts.list()) {
    await schedules.watchAccount(a.accountId);
    const defs = workflows.mergedForAccount(a.accountId);
    await schedules.syncWorkflowSchedules(
      a.accountId,
      workflows.scheduleSyncRows(defs),
    );
  }
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
  let meshPeer: HomeMeshPeer | null = null;
  const meshStub = createMeshHost({
    config: {
      hostingEnabled: config.meshHostingEnabled,
      attachEnabled: config.meshAttachEnabled,
    },
  });

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
    meshPeer?.closeStreamsForDevice(deviceId);
  };

  const meshStatus = () => (meshPeer ? meshPeer.status() : meshStub.status());
  const meshDualModeNotes = () => meshStub.dualModeNotes();

  const ws = await startWsHost({
    port: config.wsPort,
    devices,
    nodeService: events.asNodeService(),
    eventDispositions: homeEventDispositions(),
    onDeviceSeen: (deviceId) => pairing.noteSeen(deviceId),
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
      workflowStepTemplates,
      schedules,
      skills,
      artifacts,
      actuations,
      pushTokens,
      push,
      localEngine,
      demoHa,
      demoMqtt,
      activeTurns: () => turns.activeTurnCount(),
      meshStatus,
      meshDualModeNotes,
      onShutdown: (_reason, graceSec) => {
        setTimeout(() => {
          void stop();
        }, Math.max(0, graceSec) * 1000);
      },
    },
  });
  wsRef = ws;

  if (config.meshHostingEnabled) {
    meshPeer = createHomeMeshPeer({
      paths,
      sessionIdentity: ws.sessionIdentity,
      dispatch: ws.dispatch,
      subscribe: (send) => {
        const offs = (["home:turn-delta", "home:approval", "home:schedule-fired"] as const).map(
          (ev) => events.on(ev, (data) => send(ev, data)),
        );
        return () => {
          for (const off of offs) off();
        };
      },
      ...(options.createMeshNode ? { createNode: options.createMeshNode } : {}),
    });
    const meshStart = await meshPeer.start();
    if (meshStart.kind === "hosting") {
      logger.info(
        `mesh hosting as ${meshStart.peerId} — ${(meshStart.multiaddrs ?? []).length} addr(s), ${(meshStart.relayHints ?? []).length} relay hint(s)`,
      );
    } else {
      logger.warn(
        `mesh peer start: ${meshStart.kind}${meshStart.code ? ` (${meshStart.code})` : ""} — ${meshStart.reason ?? "unknown"}`,
      );
    }
    pairing.meshForMint = () => meshMintFields(meshPeer);
    stoppers.push(() => meshPeer?.stop() ?? Promise.resolve());
  }

  await localEngine.restoreOnBoot();
  stoppers.push(() => localEngine.stop());
  stoppers.push(() => demoHa.stop(channels).catch(() => undefined));
  stoppers.push(() => demoMqtt.stop(channels).catch(() => undefined));
  // Reflect the OS-assigned port (port: 0 in tests) into config so mintPairing
  // appends the resolved WS port (Design A.2).
  config.wsPort = ws.host.port;
  stoppers.push(() => {
    meshStub.stop();
    ws.stop();
  });
  stoppers.push(() => schedules.stop());

  const mesh: MeshHostHandle = {
    status: meshStatus,
    createTransport: meshStub.createTransport,
    dualModeNotes: meshDualModeNotes,
    stop: () => {
      meshStub.stop();
      void meshPeer?.stop();
    },
  };

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
    workflowStepTemplates,
    schedules,
    skills,
    artifacts,
    actuations,
    pushTokens,
    push,
    localEngine,
    mesh,
    meshPeer,
    subscriptions,
    events,
    ws,
    http,
    startedAt,
    setHatchBoundAccounts(next: string[]) {
      hatchBinding.accounts = next;
    },
    stop,
  };
}
