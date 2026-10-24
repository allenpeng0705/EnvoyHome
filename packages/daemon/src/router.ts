// home.* method dispatch for B2–B4.
// Scope enforcement follows Design §4.3.1; device→account binding Design §4.1.

import {
  METHODS,
  PROTOCOL_API_VERSION,
  PRODUCT_NAME,
  TRANSPORT_CODE_BAD_PARAMS,
  TRANSPORT_CODE_UNAUTHORIZED,
  badParams,
  makeError,
  makeResult,
  methodNames,
  validateMethodParams,
  type HomeResponse,
  type RpcId,
} from "@envoyhome/protocol";
import type { DaemonConfig } from "./config.js";
import type { HomeCaller, HomeSession } from "./auth.js";
import type { SubscriptionRegistry } from "./events.js";
import type { DaemonLogger } from "./logger.js";
import { AccountError, type AccountStore } from "./accounts.js";
import { BindingError, type BindingStore } from "./bindings.js";
import {
  PairingError,
  ZERO_BINDING_ALLOW_LIST,
  assertDeviceAccountBound,
  type PairingStore,
} from "./pairing.js";
import {
  HouseholdError,
  assertOwnerExclusiveBind,
  isHouseholdOwner,
  mayActForSeat,
  memoryTrustForTurn,
  type HouseholdStore,
} from "./household.js";
import type { MeshStatus } from "./mesh-host.js";
import { collectDoctorIssues, applyDoctorFixes } from "./doctor/index.js";
import {
  ObjectRegistryError,
  wireSourceRecord,
} from "./object-registry.js";
import type { ActuationService } from "./actuation-service.js";
import { getHomeFsInfo, listHomeFsEntries } from "./home-fs.js";
import { MemoryError, type MemoryFacade } from "@envoyhome/memory";
import { ChannelError, type ChannelService } from "./channels/service.js";
import { HARNESS_CATALOG, DEFAULT_HARNESS_ID } from "@envoyhome/harness-host";
import type { TurnService } from "./turn-service.js";
import type { ProviderStore } from "./providers-store.js";
import type { HarnessStore } from "./harness-store.js";
import { SkillsError, type SkillService } from "./skills.js";
import type { WorkflowStore } from "./workflows.js";
import type { ArtifactService } from "./artifacts.js";
import type { PushTokenStore, PushPlatform } from "./push-tokens.js";
import type { PushDispatcher } from "./push-dispatch.js";
import type { ScheduleService } from "./schedule/service.js";
import type { SchedulePayload, ScheduleSpec } from "./schedule/types.js";
import { normalizeScheduleSpec } from "./schedule/validate-payload.js";
import { resolveAndValidateUserSchedulePayload } from "./schedule/resolve-user-payload.js";
import { listWorkflowTools, workflowToolNameSet } from "./workflow-tools.js";
import {
  draftWorkflowFromText,
  draftWorkflowNodePrompt,
} from "./workflow-draft.js";
import { isHomeAssistantReady, isMqttReady } from "./home-intent.js";

async function resolveUserSchedulePayload(
  deps: RouterDeps,
  accountId: string,
  raw: unknown,
): Promise<SchedulePayload> {
  try {
    await deps.workflows.ensureLoaded();
    return await resolveAndValidateUserSchedulePayload({
      raw,
      accountId,
      hasWorkflow: (workflowId, aid) => !!deps.workflows.getWorkflow(workflowId, aid),
      knownToolNames: workflowToolNameSet({
        skills: deps.skills,
        channels: deps.channels,
        webSearch: deps.webSearch,
        browserControl: deps.browserControl,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason = msg.replace(/^envoyhome\.bad_params:\s*/, "");
    throw Object.assign(err instanceof Error ? err : new Error(msg), {
      rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", reason),
    });
  }
}

export interface RouterDeps {
  config: DaemonConfig;
  startedAt: Date;
  logger: DaemonLogger;
  subscriptions: SubscriptionRegistry;
  connections: () => number;
  activeTurns: () => number;
  onShutdown: (reason: string, graceSec: number) => void;
  packageVersion: string;
  accounts: AccountStore;
  household: HouseholdStore;
  bindings: BindingStore;
  pairing: PairingStore;
  meshStatus: () => MeshStatus;
  meshDualModeNotes?: () => string[];
  /** B5 StandingStore facade — L1–L3 only. */
  memory: MemoryFacade;
  /** B7 channel plugins. */
  channels: ChannelService;
  /** B6 turn pipeline. */
  turns: TurnService;
  providers: ProviderStore;
  harnesses: HarnessStore;
  workflows: WorkflowStore;
  workflowStepTemplates: import("./workflow-step-templates.js").WorkflowStepTemplateStore;
  schedules: ScheduleService;
  /** Design §19.10 standing orders. */
  standingOrders: import("./standing-orders.js").StandingOrderStore;
  skills: SkillService;
  artifacts: ArtifactService;
  /** Design §9.5f household web search. */
  webSearch: import("./web-search.js").WebSearchService;
  /** Design §9.5g browser control. */
  browserControl: import("./browser-control.js").BrowserControlService;
  /** B14 actuation journal (owner-scope reads). */
  actuations: ActuationService;
  /** Mobile APNs/FCM token registry. */
  pushTokens: PushTokenStore;
  /** APNs/FCM sender (approval / choice / schedule wake-ups). */
  push: PushDispatcher;
  /** Per-device recent RPC for interactive push suppress (`2026-10-22f`). */
  liveDevices?: import("./push-live.js").LiveDevicePresence;
  /** EnvoyHome Local / Ollama engine (Design §8.5). */
  localEngine: import("./local-engine/service.js").LocalEngineService;
  /** Local fake-ha demo (optional — tests may omit). */
  demoHa?: import("./demo-ha.js").DemoHaService;
  /** Local fake-mqtt demo (optional — tests may omit; can run alongside demoHa). */
  demoMqtt?: import("./demo-mqtt.js").DemoMqttService;
  /**
   * Settle before `home.mintPairing` reads mesh fields (EnvoyCoder `awaitMeshReady`).
   * Prevents LAN-only QRs minted while the hosting peer is still starting.
   */
  awaitMeshReady?: () => Promise<void>;
}

function scopeOf(method: string): "loopback-owner" | "owner-scope" | "account-scoped" | undefined {
  return METHODS[method]?.scope;
}

function scopeDenied(
  method: string,
  detail: string,
): { error: ReturnType<typeof makeError> } {
  return {
    error: makeError(TRANSPORT_CODE_UNAUTHORIZED, "auth", detail),
  };
}

function assertScope(
  method: string,
  session: HomeSession | undefined,
  ownerAccountId: string | null,
): { error: ReturnType<typeof makeError> } | null {
  const scope = scopeOf(method);
  if (!scope) return null;
  const caller = session?.caller;
  // Missing session ⇒ loopback (reuse-host localScopeKey path).
  if (!caller) return null;

  if (scope === "loopback-owner" && caller.kind !== "loopback-owner") {
    return scopeDenied(method, `${method} requires loopback-owner`);
  }
  if (scope === "owner-scope" && !isHouseholdOwner(caller, ownerAccountId)) {
    return scopeDenied(method, `${method} requires owner-scope`);
  }
  return null;
}

/**
 * Design §4.1 rule 4 — a zero-binding device may only reach the allow-list.
 * Loopback owner is never zero-binding-scoped.
 */
function assertZeroBindingAllow(
  method: string,
  session: HomeSession | undefined,
): { error: ReturnType<typeof makeError> } | null {
  const caller = session?.caller;
  if (!caller || caller.kind !== "device") return null;
  if (caller.accountIds.length > 0) return null;
  if (ZERO_BINDING_ALLOW_LIST.has(method)) return null;
  return {
    error: makeError(
      TRANSPORT_CODE_UNAUTHORIZED,
      "account_not_bound",
      `device has no account bindings; ${method} is outside the §4.1 rule-4 allow-list`,
    ),
  };
}

function throwRpc(
  transportCode: typeof TRANSPORT_CODE_BAD_PARAMS | typeof TRANSPORT_CODE_UNAUTHORIZED,
  name:
    | "bad_params"
    | "auth"
    | "account_not_bound"
    | "owner_required"
    | "workspace_root_owner_only"
    | "version_too_low"
    | "pairing_app_mismatch",
  detail: string,
): never {
  const err = makeError(transportCode, name, detail);
  throw Object.assign(new Error(err.message), { rpcError: err });
}

function mapChannelError(err: unknown): never {
  if (err instanceof ChannelError) {
    throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
  }
  throw err;
}

/** Merge Settings inject caps into policy.json caps (Memory Design §4.2.1). */
function mergeInjectCaps(
  prev: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...prev };
  for (const asset of ["l1", "l2", "l3"] as const) {
    const row = patch[asset];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const src = row as Record<string, unknown>;
    const prior =
      out[asset] && typeof out[asset] === "object" && !Array.isArray(out[asset])
        ? { ...(out[asset] as Record<string, unknown>) }
        : {};
    if (typeof src.injectBudget === "number" && Number.isFinite(src.injectBudget)) {
      prior.injectBudget = Math.max(0, Math.floor(src.injectBudget));
    }
    if (typeof src.rawSoftCap === "number" && Number.isFinite(src.rawSoftCap)) {
      prior.rawSoftCap = Math.max(0, Math.floor(src.rawSoftCap));
    }
    if (Object.keys(prior).length) out[asset] = prior;
  }
  return out;
}

/** Strip unknown keys so listMemory/setMemorySettings caps stay schema-clean. */
function wireInjectCaps(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const asset of ["l1", "l2", "l3"] as const) {
    const row = raw[asset];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const src = row as Record<string, unknown>;
    const clean: Record<string, number> = {};
    if (typeof src.injectBudget === "number" && Number.isFinite(src.injectBudget)) {
      clean.injectBudget = Math.max(0, Math.floor(src.injectBudget));
    }
    if (typeof src.rawSoftCap === "number" && Number.isFinite(src.rawSoftCap)) {
      clean.rawSoftCap = Math.max(0, Math.floor(src.rawSoftCap));
    }
    if (Object.keys(clean).length) out[asset] = clean;
  }
  return out;
}

function mapStoreError(err: unknown): never {
  if (err instanceof MemoryError) {
    if (err.code === "cross_account") {
      throwRpc(TRANSPORT_CODE_UNAUTHORIZED, "auth", err.message);
    }
    throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
  }
  if (err instanceof HouseholdError) {
    if (err.kind === "forbidden" || err.kind === "auth") {
      throwRpc(TRANSPORT_CODE_UNAUTHORIZED, "auth", err.message);
    }
    throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
  }
  if (err instanceof AccountError || err instanceof BindingError || err instanceof PairingError) {
    if (err.kind === "auth" || err.kind === "pairing_app_mismatch") {
      const detail = err.message.replace(/^envoyhome\.[a-z_]+:\s*/, "");
      const name =
        err.kind === "pairing_app_mismatch"
          ? "pairing_app_mismatch"
          : err.message.includes("account_not_bound")
            ? "account_not_bound"
            : err.message.includes("workspace_root_owner_only")
              ? "workspace_root_owner_only"
              : err.message.includes("owner_required")
                ? "owner_required"
                : "auth";
      throwRpc(TRANSPORT_CODE_UNAUTHORIZED, name, detail);
    }
    if (err.kind === "rate_limited") {
      throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
    }
    throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
  }
  if (err instanceof Error && /envoyhome\.tool_unavailable/.test(err.message)) {
    throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
  }
  throw err;
}

/** Design §8.5 — local engine / Ollama enable failures are bad_params, not 500s. */
function mapLocalEngineError(err: unknown): void {
  if (
    err instanceof Error &&
    /envoyhome\.(local_engine_|ollama_)/.test(err.message)
  ) {
    throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
  }
}

function optionalBoundAccountId(
  method: string,
  caller: HomeCaller,
  params: Record<string, unknown>,
): string | undefined {
  if (typeof params.accountId !== "string" || params.accountId.length === 0) {
    return undefined;
  }
  return requireBoundAccount(method, caller, params);
}

/**
 * Enforce device→account binding for methods that take `accountId` (V-SEC-7).
 * Loopback owner is unbounded. Call before any account-scoped side effect.
 */
function requireBoundAccount(
  method: string,
  caller: HomeCaller,
  params: Record<string, unknown>,
): string {
  const raw = typeof params.accountId === "string" ? params.accountId : undefined;
  const resolved = assertDeviceAccountBound(caller, raw, method);
  if ("error" in resolved) {
    throwRpc(TRANSPORT_CODE_UNAUTHORIZED, "account_not_bound", resolved.detail);
  }
  return resolved.accountId;
}

function wireAccount(rec: {
  accountId: string;
  displayName: string;
  createdAt: string;
  locale?: string;
  timeZone?: string;
  toolPolicy?: string;
}): {
  accountId: string;
  displayName: string;
  createdAt: string;
  locale?: string;
  timeZone?: string;
  toolPolicy?: string;
} {
  return {
    accountId: rec.accountId,
    displayName: rec.displayName,
    createdAt: rec.createdAt,
    ...(rec.locale ? { locale: rec.locale } : {}),
    ...(rec.timeZone ? { timeZone: rec.timeZone } : {}),
    ...(rec.toolPolicy ? { toolPolicy: rec.toolPolicy } : {}),
  };
}

/** Resolve accountId for accept/rejectLearn (wire params are id-only). */
async function resolveLearnAccount(
  deps: RouterDeps,
  caller: HomeCaller,
  learnId: string,
  params: Record<string, unknown>,
): Promise<string> {
  if (typeof params.accountId === "string") {
    return requireBoundAccount("home.acceptLearn", caller, params);
  }
  const candidates =
    caller.kind === "loopback-owner"
      ? (await deps.accounts.list()).map((a) => a.accountId)
      : caller.accountIds;
  for (const accountId of candidates) {
    const learn = await deps.memory.learnQueue.get(accountId, learnId);
    if (learn) return accountId;
  }
  throw new MemoryError("not_found", `learn ${learnId}`);
}

export function createDispatcher(deps: RouterDeps) {
  return async (
    method: string,
    params: Record<string, unknown>,
    session: HomeSession | undefined,
  ): Promise<unknown> => {
    const id: RpcId = "dispatch";
    if (!(method in METHODS)) {
      const err = makeError(TRANSPORT_CODE_BAD_PARAMS, "version_too_low", method);
      throw Object.assign(new Error(err.message), { rpcError: err });
    }

    const ownerAccountId = deps.household.getOwnerAccountId();
    const scopeErr = assertScope(method, session, ownerAccountId);
    if (scopeErr) {
      throw Object.assign(new Error(scopeErr.error.message), { rpcError: scopeErr.error });
    }

    // Interactive push suppress — touch before work so a mid-turn approval still sees live.
    // Skip subscription / handshake RPCs (not user activity) so suppressIfLive is
    // not held warm by reconnect noise while the UI is backgrounded. Peer WS skips
    // transport on/off the same way.
    if (
      session?.caller.kind === "device" &&
      session.deviceId &&
      method !== "home.subscribe" &&
      method !== "home.hello" &&
      method !== "home.health"
    ) {
      deps.liveDevices?.touch(session.deviceId);
    }

    const zeroErr = assertZeroBindingAllow(method, session);
    if (zeroErr) {
      throw Object.assign(new Error(zeroErr.error.message), { rpcError: zeroErr.error });
    }

    const validation = validateMethodParams(method, params);
    if (!validation.ok) {
      const resp = badParams(id, method, validation.issues);
      if ("error" in resp) {
        throw Object.assign(new Error(resp.error.message), { rpcError: resp.error });
      }
    }

    const caller = session?.caller ?? {
      kind: "loopback-owner" as const,
      accountIds: [] as string[],
      ownerTrusted: true,
    };
    const scopeKey = session?.scopeKey ?? "loopback-owner";
    const mesh = deps.meshStatus();

    switch (method) {
      case "home.hello": {
        const hello: Record<string, unknown> = {
          product: PRODUCT_NAME,
          version: deps.packageVersion,
          protocolApiVersion: PROTOCOL_API_VERSION,
          instanceId: deps.config.instanceId,
          home: { label: deps.config.label, stateDir: deps.config.stateDir },
          startedAt: deps.startedAt.toISOString(),
          methods: methodNames(),
          mesh,
          notes: [] as string[],
          accountIds: [...caller.accountIds],
        };
        if (caller.deviceId) hello.deviceId = caller.deviceId;
        return hello;
      }
      case "home.health": {
        const uptimeSec = Math.floor((Date.now() - deps.startedAt.getTime()) / 1000);
        return {
          ok: true,
          uptimeSec,
          connections: deps.connections(),
          activeTurns: deps.activeTurns(),
          wsPort: deps.config.wsPort,
          httpPort: deps.config.httpPort,
          publicBaseUrl: deps.config.publicBaseUrl,
        };
      }
      case "home.subscribe": {
        const events = (params.events as string[]) ?? [];
        const result = deps.subscriptions.subscribe(scopeKey, events);
        if ("error" in result) {
          throw Object.assign(new Error(result.error), {
            rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", result.error),
          });
        }
        return { ok: true };
      }
      case "home.meshStatus":
        return { mesh };
      case "home.shutdown": {
        if (caller.kind !== "loopback-owner") {
          throw Object.assign(new Error("shutdown requires loopback-owner"), {
            rpcError: makeError(TRANSPORT_CODE_UNAUTHORIZED, "auth", "home.shutdown requires loopback-owner"),
          });
        }
        const reason = typeof params.reason === "string" ? params.reason : "rpc";
        const graceSec = typeof params.graceSec === "number" ? params.graceSec : 5;
        queueMicrotask(() => deps.onShutdown(reason, graceSec));
        return { ok: true };
      }
      case "home.getDaemonLog": {
        if (caller.kind !== "loopback-owner") {
          throw Object.assign(new Error("getDaemonLog requires loopback-owner"), {
            rpcError: makeError(
              TRANSPORT_CODE_UNAUTHORIZED,
              "auth",
              "home.getDaemonLog requires loopback-owner",
            ),
          });
        }
        const tailLines = typeof params.tailLines === "number" ? params.tailLines : 200;
        const level =
          params.level === "warn" || params.level === "error" || params.level === "info"
            ? params.level
            : "info";
        return { lines: deps.logger.tail(tailLines, level) };
      }
      case "home.getServiceStatus": {
        const { readClaim, isProcessAlive } = await import("./claim.js");
        const { readServiceStatus } = await import("./os-service.js");
        const claim = await readClaim(deps.config.stateDir);
        const running = claim ? isProcessAlive(claim.pid) : false;
        const svc = await readServiceStatus(running);
        return {
          installed: svc.installed,
          running: svc.running,
          manager: svc.manager,
          ...(svc.unitPath !== undefined || claim
            ? {
                execPath: [
                  svc.unitPath ? `unit=${svc.unitPath}` : null,
                  claim
                    ? `pid=${claim.pid} ws=${claim.port} managedBy=${claim.managedBy ?? "unknown"}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" "),
              }
            : {}),
          ...(!running && claim ? { lastError: "claim file present but process not alive" } : {}),
        };
      }
      case "home.installService": {
        const { installService } = await import("./os-service.js");
        return await installService({
          stateDir: deps.config.stateDir,
          ...(typeof params.manager === "string" ? { manager: params.manager } : {}),
        });
      }
      case "home.uninstallService": {
        const { uninstallService } = await import("./os-service.js");
        return await uninstallService(params.confirm === true);
      }
      case "home.restartService": {
        const { restartService } = await import("./os-service.js");
        return await restartService();
      }

      /* ---- B3 accounts & bindings (Design A.3) ---- */
      case "home.listAccounts": {
        const accounts = await deps.accounts.list();
        return { accounts: accounts.map(wireAccount) };
      }
      case "home.createAccount": {
        try {
          const input: {
            displayName: string;
            accountId?: string;
            locale?: string;
            timeZone?: string;
          } = {
            displayName: params.displayName as string,
          };
          if (typeof params.accountId === "string") input.accountId = params.accountId;
          if (typeof params.locale === "string") input.locale = params.locale;
          if (typeof params.timeZone === "string") input.timeZone = params.timeZone;
          const account = await deps.accounts.create(input);
          await deps.household.onAccountCreated(account.accountId);
          return { account: wireAccount(account) };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.updateAccount": {
        try {
          const accountId = params.accountId as string;
          if (!mayActForSeat(caller, accountId, ownerAccountId)) {
            throwRpc(
              TRANSPORT_CODE_UNAUTHORIZED,
              "account_not_bound",
              `envoyhome.account_not_bound: cannot update account ${accountId}`,
            );
          }
          if (params.toolPolicy !== undefined) {
            if (!isHouseholdOwner(caller, ownerAccountId)) {
              throwRpc(
                TRANSPORT_CODE_UNAUTHORIZED,
                "owner_required",
                "toolPolicy requires household Owner",
              );
            }
          }
          const input: {
            accountId: string;
            displayName?: string;
            locale?: string;
            timeZone?: string;
            toolPolicy?: "standard" | "restricted";
          } = { accountId };
          if (typeof params.displayName === "string") input.displayName = params.displayName;
          if (typeof params.locale === "string") input.locale = params.locale;
          if (typeof params.timeZone === "string") input.timeZone = params.timeZone;
          if (params.toolPolicy === "standard" || params.toolPolicy === "restricted") {
            input.toolPolicy = params.toolPolicy;
          }
          const account = await deps.accounts.update(input);
          return { account: wireAccount(account) };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.deleteAccount": {
        try {
          const accountId = params.accountId as string;
          await deps.household.assertDeletable(accountId);
          await deps.accounts.delete({
            accountId,
            confirm: params.confirm === true,
            ...(params.force === true ? { force: true } : {}),
          });
          await deps.bindings.removeForAccount(accountId);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.getHouseholdOwner": {
        try {
          const id = deps.household.getOwnerAccountId();
          if (!id) {
            throw new HouseholdError(
              "not_found",
              "no household Owner set — run Doctor Fix or create the first profile",
            );
          }
          const rec = await deps.accounts.get(id);
          return {
            ownerAccountId: id,
            ...(rec?.displayName ? { displayName: rec.displayName } : {}),
          };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.transferHouseholdOwner": {
        try {
          if (params.confirm !== true) {
            throw new HouseholdError("bad_params", "confirm must be true");
          }
          const toAccountId = params.toAccountId as string;
          if (!(await deps.accounts.get(toAccountId))) {
            throw new HouseholdError("not_found", `unknown account: ${toAccountId}`);
          }
          const next = await deps.household.transfer(toAccountId);
          // R3: former Owner (and any other seat) must not keep filesystem-root workspace.
          await deps.accounts.clearNonOwnerFilesystemRoots(next);
          // R2: new Owner must not remain dual-bound with other seats on one device.
          await deps.bindings.enforceOwnerExclusiveBinds(next);
          return { ownerAccountId: next };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.getWorkspace": {
        try {
          const accountId =
            typeof params.accountId === "string" ? params.accountId : "";
          if (!accountId) {
            throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", "accountId is required");
          }
          if (!mayActForSeat(caller, accountId, ownerAccountId)) {
            throwRpc(
              TRANSPORT_CODE_UNAUTHORIZED,
              "account_not_bound",
              `envoyhome.account_not_bound: cannot get workspace for ${accountId}`,
            );
          }
          return await deps.accounts.getWorkspacePublic(accountId, ownerAccountId);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setWorkspace": {
        try {
          const accountId = params.accountId as string;
          const mode = params.mode === "rw" ? "rw" : "ro";
          await deps.accounts.setWorkspace({
            accountId,
            hostPath: params.hostPath as string,
            mode,
            ...(typeof params.id === "string" ? { id: params.id } : {}),
            ownerAccountId,
          });
          return await deps.accounts.getWorkspacePublic(accountId, ownerAccountId);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.upsertWorkspaceMount": {
        try {
          const accountId = params.accountId as string;
          const mode = params.mode === "rw" ? "rw" : "ro";
          await deps.accounts.upsertWorkspaceMount({
            accountId,
            hostPath: params.hostPath as string,
            mode,
            ...(typeof params.id === "string" ? { id: params.id } : {}),
            ownerAccountId,
          });
          return await deps.accounts.getWorkspacePublic(accountId, ownerAccountId);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.removeWorkspaceMount": {
        try {
          const accountId = params.accountId as string;
          const id = typeof params.id === "string" ? params.id : "";
          if (!id) {
            throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", "id is required");
          }
          await deps.accounts.removeWorkspaceMount({ accountId, id });
          return await deps.accounts.getWorkspacePublic(accountId, ownerAccountId);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.clearWorkspace": {
        try {
          const accountId = params.accountId as string;
          await deps.accounts.clearWorkspace(accountId);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.getHomeFsInfo": {
        // Owner-scope via assertScope / METHODS.scope
        return getHomeFsInfo();
      }
      case "home.listHomeFsEntries": {
        try {
          return listHomeFsEntries({
            ...(typeof params.path === "string" ? { path: params.path } : {}),
            dirsOnly: params.dirsOnly !== false,
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.listBindings": {
        try {
          const filter: { accountId?: string; deviceId?: string } = {};
          if (typeof params.accountId === "string") filter.accountId = params.accountId;
          if (typeof params.deviceId === "string") filter.deviceId = params.deviceId;
          if (filter.accountId && !mayActForSeat(caller, filter.accountId, ownerAccountId)) {
            throwRpc(
              TRANSPORT_CODE_UNAUTHORIZED,
              "account_not_bound",
              `envoyhome.account_not_bound: cannot list bindings for ${filter.accountId}`,
            );
          }
          let bindings = await deps.bindings.list(filter);
          if (!isHouseholdOwner(caller, ownerAccountId)) {
            const allowed = new Set(caller.accountIds);
            bindings = bindings.filter((b) => allowed.has(String((b as { accountId?: string }).accountId)));
          }
          return { bindings };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setBinding": {
        try {
          const accountId = params.accountId as string;
          if (!(await deps.accounts.get(accountId))) {
            throw new BindingError("not_found", `unknown account: ${accountId}`);
          }
          if (typeof params.deviceId === "string") {
            const deviceId = params.deviceId;
            const existing = (await deps.bindings.list({ deviceId })).filter(
              (b) => (b as { kind?: string }).kind === "device",
            );
            const nextIds = [
              ...new Set([
                ...existing.map((b) => String((b as { accountId: string }).accountId)),
                accountId,
              ]),
            ];
            assertOwnerExclusiveBind(nextIds, ownerAccountId);
          }
          const result = await deps.bindings.set(params, caller);
          return result;
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.removeBinding": {
        try {
          await deps.bindings.remove(params.bindingId as string);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }

      /* ---- B4 pairing (Design A.2) ---- */
      case "home.mintPairing": {
        try {
          // EnvoyCoder: settle mesh before reading multiaddrs / relay hints for the QR.
          await deps.awaitMeshReady?.();
          const input: {
            deviceLabel: string;
            host?: string;
            lanHost?: string;
            wsPort: number;
            accountIds?: string[];
            token?: string;
            fresh?: boolean;
          } = {
            deviceLabel: (params.deviceLabel as string) || "Phone",
            wsPort: deps.config.wsPort,
          };
          if (typeof params.host === "string" && params.host.trim()) input.host = params.host;
          if (typeof params.lanHost === "string" && params.lanHost.trim()) {
            input.lanHost = params.lanHost;
          }
          if (Array.isArray(params.accountIds)) {
            input.accountIds = (params.accountIds as unknown[]).filter(
              (x): x is string => typeof x === "string",
            );
            for (const accountId of input.accountIds) {
              if (!(await deps.accounts.get(accountId))) {
                throw new PairingError("bad_params", `unknown account: ${accountId}`);
              }
            }
            assertOwnerExclusiveBind(input.accountIds, ownerAccountId);
          }
          if (typeof params.token === "string") input.token = params.token;
          if (typeof params.fresh === "boolean") input.fresh = params.fresh;
          const minted = await deps.pairing.mint(input);
          return {
            uri: minted.uri,
            device: minted.device,
          };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.listPairedDevices": {
        try {
          const devices = await deps.pairing.list();
          return { devices };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.revokePairedDevice": {
        try {
          await deps.pairing.revoke(params.deviceId as string);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.forgetPairedDevice": {
        try {
          await deps.pairing.forget(params.deviceId as string);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setDeviceAccounts": {
        try {
          const accountIds = (params.accountIds as unknown[]).filter(
            (x): x is string => typeof x === "string",
          );
          // Validate named accounts exist (empty list is the zero-binding path).
          for (const accountId of accountIds) {
            if (!(await deps.accounts.get(accountId))) {
              throw new PairingError("bad_params", `unknown account: ${accountId}`);
            }
          }
          assertOwnerExclusiveBind(accountIds, ownerAccountId);
          const device = await deps.pairing.setDeviceAccounts(
            params.deviceId as string,
            accountIds,
          );
          return { ok: true, device };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.registerPushToken": {
        const deviceId =
          caller.kind === "device"
            ? caller.deviceId
            : typeof params.deviceId === "string"
              ? params.deviceId
              : undefined;
        if (!deviceId) {
          throwRpc(
            TRANSPORT_CODE_UNAUTHORIZED,
            "auth",
            "home.registerPushToken requires a paired device session",
          );
        }
        const platform = params.platform as PushPlatform;
        if (platform !== "ios" && platform !== "android") {
          throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", "platform must be ios|android");
        }
        const token = String(params.token ?? "");
        if (!token) {
          throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", "token required");
        }
        let accountIds = caller.accountIds;
        if (typeof params.accountId === "string" && params.accountId) {
          const bound = assertDeviceAccountBound(caller, params.accountId, method);
          if ("error" in bound) {
            throwRpc(TRANSPORT_CODE_UNAUTHORIZED, "account_not_bound", bound.detail);
          }
          accountIds = [bound.accountId];
        }
        const row = await deps.pushTokens.register({
          deviceId,
          platform,
          token,
          tokenType: "alert",
          accountIds,
        });
        return { ok: true, deviceId: row.deviceId, platform: row.platform };
      }
      case "home.unregisterPushToken": {
        const deviceId = caller.kind === "device" ? caller.deviceId : undefined;
        if (!deviceId) {
          throwRpc(
            TRANSPORT_CODE_UNAUTHORIZED,
            "auth",
            "home.unregisterPushToken requires a paired device session",
          );
        }
        await deps.pushTokens.unregister(deviceId);
        return { ok: true };
      }
      case "home.sendTestPush": {
        // Owner-scope via assertScope / METHODS — exclusive-Owner device or loopback.
        const title =
          typeof params.title === "string" && params.title ? params.title : "EnvoyHome";
        const body =
          typeof params.body === "string" && params.body
            ? params.body
            : "Test push from Settings";
        const deviceId = typeof params.deviceId === "string" ? params.deviceId : undefined;
        const result = await deps.push.sendTest(deviceId, {
          title,
          body,
          data: { type: "test" },
        });
        return { ok: true, sent: result.sent };
      }

      /* ---- B5 memory (L1–L3 StandingStore) ---- */
      case "home.getProfile": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const keys = Array.isArray(params.keys)
            ? (params.keys as unknown[]).filter((k): k is string => typeof k === "string")
            : undefined;
          return await deps.memory.getProfile(accountId, keys);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.updateProfile": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const setRaw =
            params.set && typeof params.set === "object" && !Array.isArray(params.set)
              ? (params.set as Record<string, unknown>)
              : undefined;
          const set: Record<string, string | number | boolean | string[]> = {};
          if (setRaw) {
            for (const [k, v] of Object.entries(setRaw)) {
              if (
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean" ||
                (Array.isArray(v) && v.every((x) => typeof x === "string"))
              ) {
                set[k] = v as string | number | boolean | string[];
              }
            }
          }
          const removeKeys = Array.isArray(params.removeKeys)
            ? (params.removeKeys as unknown[]).filter((k): k is string => typeof k === "string")
            : undefined;
          return await deps.memory.updateProfile(accountId, {
            ...(Object.keys(set).length > 0 ? { set } : {}),
            ...(removeKeys !== undefined ? { removeKeys } : {}),
            source: "user_tool",
            trust: memoryTrustForTurn(caller, accountId, ownerAccountId),
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.getIdentity": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.memory.getIdentity(accountId);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setIdentity": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const markdown = typeof params.markdown === "string" ? params.markdown : "";
          return await deps.memory.setIdentity(accountId, markdown);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.listMemory": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const policy = await deps.turns.policy.get(accountId);
          deps.memory.setAccountMemorySettings(accountId, {
            flushEnabled: policy.flushEnabled,
            reviewEnabled: policy.reviewEnabled,
            sessionRetentionDays: policy.sessionRetentionDays,
          });
          const active = deps.turns.injectPreviewActive(accountId);
          const resolved = await deps.turns.resolveInjectForAccount(accountId, active);
          const listed = await deps.memory.listMemory(accountId, {
            includeContent: params.includeContent === true,
            caps: resolved.caps,
          });
          // Wire schema (A.9) — strip non-schema extras; injectProfiles/caps additive §4.2.1.
          return {
            accountId: listed.accountId,
            profileSummary: listed.profileSummary,
            notes: listed.notes.map((n) => ({
              path: n.path,
              rawChars: n.rawChars,
              injectChars: n.injectChars,
              truncated: n.truncated,
              injectBudget: n.injectBudget,
              rawSoftCap: n.rawSoftCap,
              sectionsOmitted: n.sectionsOmitted,
            })),
            injectBudgetMode: resolved.injectBudgetMode,
            injectProfiles: resolved.injectProfiles,
            caps: wireInjectCaps(policy.caps),
            reviewEnabled: listed.reviewEnabled,
            flushEnabled: listed.flushEnabled,
            sessionRetentionDays: listed.sessionRetentionDays,
            pendingLearnCount: listed.pendingLearnCount,
            pendingLearnCap: listed.pendingLearnCap,
            backendId: listed.backendId,
          };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setMemorySettings": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const patch: {
            flushEnabled?: boolean;
            reviewEnabled?: boolean;
            sessionRetentionDays?: number;
            injectBudgetMode?: "auto" | "baseline" | "custom";
            caps?: Record<string, unknown>;
          } = {};
          if (typeof params.flushEnabled === "boolean") patch.flushEnabled = params.flushEnabled;
          if (typeof params.reviewEnabled === "boolean") patch.reviewEnabled = params.reviewEnabled;
          if (typeof params.sessionRetentionDays === "number") {
            patch.sessionRetentionDays = params.sessionRetentionDays;
          }
          if (
            params.injectBudgetMode === "auto" ||
            params.injectBudgetMode === "baseline" ||
            params.injectBudgetMode === "custom"
          ) {
            patch.injectBudgetMode = params.injectBudgetMode;
          }
          if (params.caps && typeof params.caps === "object" && !Array.isArray(params.caps)) {
            const prev = await deps.turns.policy.get(accountId);
            patch.caps = mergeInjectCaps(prev.caps, params.caps as Record<string, unknown>);
          }
          const next = await deps.turns.policy.write(accountId, patch);
          deps.memory.setAccountMemorySettings(accountId, {
            flushEnabled: next.flushEnabled,
            reviewEnabled: next.reviewEnabled,
            sessionRetentionDays: next.sessionRetentionDays,
          });
          await deps.schedules.watchAccount(accountId, {
            reviewEnabled: next.reviewEnabled,
          });
          return {
            ok: true,
            flushEnabled: next.flushEnabled,
            reviewEnabled: next.reviewEnabled,
            sessionRetentionDays: next.sessionRetentionDays,
            injectBudgetMode: next.injectBudgetMode,
            caps: wireInjectCaps(
              next.caps && typeof next.caps === "object" && !Array.isArray(next.caps)
                ? (next.caps as Record<string, unknown>)
                : {},
            ),
          };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.recall": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const paths = Array.isArray(params.paths)
            ? (params.paths as unknown[]).filter((p): p is string => typeof p === "string")
            : undefined;
          return await deps.memory.recall(accountId, {
            query: params.query as string,
            ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
            ...(paths !== undefined ? { paths } : {}),
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.forget": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const target = params.target as "profile_key" | "note";
          return await deps.memory.forget(accountId, {
            target,
            ...(typeof params.key === "string" ? { key: params.key } : {}),
            ...(typeof params.path === "string" ? { path: params.path } : {}),
            ...(typeof params.query === "string" ? { query: params.query } : {}),
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.compactMemory": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const trust =
            memoryTrustForTurn(caller, accountId, ownerAccountId);
          const result = await deps.memory.compactMemory(accountId, { trust });
          return {
            ok: result.ok,
            pendingLearnIds: result.pendingLearnIds,
            compactSummaryPath: result.compactSummaryPath,
          };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.listPendingLearns": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const status = params.status as
            | "pending"
            | "accepted"
            | "rejected"
            | "stale"
            | undefined;
          return await deps.memory.listPendingLearns(accountId, {
            ...(status !== undefined ? { status } : {}),
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.acceptLearn": {
        try {
          const learnId = params.id as string;
          const accountId = await resolveLearnAccount(deps, caller, learnId, params);
          return await deps.memory.acceptLearn(accountId, learnId);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.rejectLearn": {
        try {
          const learnId = params.id as string;
          const accountId = await resolveLearnAccount(deps, caller, learnId, params);
          return await deps.memory.rejectLearn(accountId, learnId);
        } catch (err) {
          mapStoreError(err);
        }
      }

      /* ---- B7 channels (Design A.6) ---- */
      case "home.listChannels":
        return { channels: deps.channels.listChannels() };
      case "home.enableChannel": {
        try {
          await deps.channels.enableChannel(params.id as string);
          return { ok: true };
        } catch (err) {
          mapChannelError(err);
        }
      }
      case "home.disableChannel": {
        try {
          await deps.channels.disableChannel(params.id as string);
          return { ok: true };
        } catch (err) {
          mapChannelError(err);
        }
      }
      case "home.getChannelStatus": {
        const id = params.id as string;
        const callerAccount =
          caller.kind === "device" && caller.accountIds.length === 1
            ? caller.accountIds[0]
            : undefined;
        const status = deps.channels.getChannelStatus(id, callerAccount, params.all === true);
        // Additive ready flag for Home chat visibility (Design §5.7.8 / V-UX-8).
        if (id === "homeassistant") {
          return { ...status, ready: await isHomeAssistantReady(deps.channels) };
        }
        if (id === "mqtt") {
          return { ...status, ready: await isMqttReady(deps.channels) };
        }
        return status;
      }
      case "home.startDemoHa": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          if (!deps.demoHa) {
            throw Object.assign(new Error("envoyhome.tool_unavailable: demo HA not available"), {
              code: "bad_params",
            });
          }
          return await deps.demoHa.useDemoHa({ channels: deps.channels, accountId });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.getDemoHaStatus": {
        return deps.demoHa?.status() ?? { running: false };
      }
      case "home.stopDemoHa": {
        try {
          await deps.demoHa?.stop(deps.channels);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.startDemoMqtt": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          if (!deps.demoMqtt) {
            throw Object.assign(new Error("envoyhome.tool_unavailable: demo MQTT not available"), {
              code: "bad_params",
            });
          }
          return await deps.demoMqtt.useDemoMqtt({ channels: deps.channels, accountId });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.getDemoMqttStatus": {
        return deps.demoMqtt?.status() ?? { running: false };
      }
      case "home.stopDemoMqtt": {
        try {
          await deps.demoMqtt?.stop(deps.channels);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setChannelConfig": {
        try {
          const config =
            params.config && typeof params.config === "object" && !Array.isArray(params.config)
              ? (params.config as Record<string, unknown>)
              : {};
          const secrets =
            params.secrets && typeof params.secrets === "object" && !Array.isArray(params.secrets)
              ? (params.secrets as Record<string, string>)
              : {};
          const channel = await deps.channels.setChannelConfig(
            params.id as string,
            config,
            secrets,
          );
          return { channel };
        } catch (err) {
          mapChannelError(err);
        }
      }
      case "home.getWebSearchConfig": {
        return await deps.webSearch.getPublicConfig();
      }
      case "home.setWebSearchConfig": {
        try {
          const patch: {
            enabled?: boolean;
            provider?: string;
            apiKey?: string | null;
            fallback?: string;
            browserEngines?: string[];
            unattendedBrowser?: boolean;
          } = {};
          if (typeof params.enabled === "boolean") patch.enabled = params.enabled;
          if (typeof params.provider === "string") patch.provider = params.provider;
          if (typeof params.apiKey === "string") patch.apiKey = params.apiKey;
          if (typeof params.fallback === "string") patch.fallback = params.fallback;
          if (Array.isArray(params.browserEngines)) {
            patch.browserEngines = params.browserEngines.filter(
              (x): x is string => typeof x === "string",
            );
          }
          if (typeof params.unattendedBrowser === "boolean") {
            patch.unattendedBrowser = params.unattendedBrowser;
          }
          return await deps.webSearch.setConfig(patch);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.getBrowserControlConfig": {
        return await deps.browserControl.getPublicConfig();
      }
      case "home.setBrowserControlConfig": {
        try {
          const patch: {
            enabled?: boolean;
            unattendedEnabled?: boolean;
            defaultProfile?: string;
            personalEnabled?: boolean;
            personalCdpEndpoint?: string;
            remoteEnabled?: boolean;
            remoteCdpUrl?: string;
            remoteToken?: string | null;
            acknowledgeElevated?: boolean;
          } = {};
          if (typeof params.enabled === "boolean") patch.enabled = params.enabled;
          if (typeof params.unattendedEnabled === "boolean") {
            patch.unattendedEnabled = params.unattendedEnabled;
          }
          if (typeof params.defaultProfile === "string") {
            patch.defaultProfile = params.defaultProfile;
          }
          if (typeof params.personalEnabled === "boolean") {
            patch.personalEnabled = params.personalEnabled;
          }
          if (typeof params.personalCdpEndpoint === "string") {
            patch.personalCdpEndpoint = params.personalCdpEndpoint;
          }
          if (typeof params.remoteEnabled === "boolean") {
            patch.remoteEnabled = params.remoteEnabled;
          }
          if (typeof params.remoteCdpUrl === "string") {
            patch.remoteCdpUrl = params.remoteCdpUrl;
          }
          if (typeof params.remoteToken === "string") {
            patch.remoteToken = params.remoteToken;
          }
          if (params.acknowledgeElevated === true) {
            patch.acknowledgeElevated = true;
          }
          return await deps.browserControl.setConfig(patch);
        } catch (err) {
          mapStoreError(err);
        }
      }

      /* ---- B6 chat / turns ---- */
      case "home.openSession": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.turns.openSession({
            accountId,
            ...(typeof params.agentId === "string" ? { agentId: params.agentId } : {}),
            ...(typeof params.title === "string" ? { title: params.title } : {}),
            ...(typeof params.channel === "string" ? { channel: params.channel } : {}),
            ...(params.purpose === "home" ||
            params.purpose === "general" ||
            params.purpose === "schedules"
              ? { purpose: params.purpose }
              : {}),
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.uploadChatMedia": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const { homePaths } = await import("./home-paths.js");
          const { storeChatMedia, ChatMediaError } = await import("./chat-media.js");
          try {
            const stored = await storeChatMedia({
              paths: homePaths(deps.config.stateDir),
              accountId,
              fileName: params.fileName as string,
              contentBase64: params.contentBase64 as string,
              ...(typeof params.mimeType === "string" ? { mimeType: params.mimeType } : {}),
            });
            // Wire result omits in-process extractText (full GFM stays on disk / turn inject).
            const { extractText: _drop, ...wire } = stored;
            void _drop;
            return wire;
          } catch (err) {
            if (err instanceof ChatMediaError) {
              throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
            }
            throw err;
          }
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.sendMessage": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const { normalizeMediaList, ChatMediaError } = await import("./chat-media.js");
          let media;
          try {
            media = normalizeMediaList(params.media);
          } catch (err) {
            if (err instanceof ChatMediaError) {
              throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
            }
            throw err;
          }
          const { normalizeClientContext } = await import("./client-context.js");
          const clientContext = normalizeClientContext(params.clientContext);
          return await deps.turns.sendMessage({
            accountId,
            sessionId: params.sessionId as string,
            text: params.text as string,
            callerKind: caller.kind,
            memoryTrust: memoryTrustForTurn(caller, accountId, ownerAccountId),
            ...(media.length ? { media } : {}),
            ...(typeof params.clientTurnId === "string"
              ? { clientTurnId: params.clientTurnId }
              : {}),
            ...(clientContext ? { clientContext } : {}),
            ...(caller.kind === "device" && caller.deviceId
              ? { deviceId: caller.deviceId }
              : {}),
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.listSessions": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.turns.listSessions(accountId, {
            includeArchived: params.includeArchived === true,
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.cancelTurn": {
        try {
          const ok = deps.turns.cancelTurn(params.turnId as string);
          return { ok };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.getTranscript": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const messages = await deps.turns.getTranscript(accountId, params.sessionId as string);
          return { messages };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.clearTranscript": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.turns.clearTranscript(accountId, params.sessionId as string);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.deleteTranscriptMessages": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const rawIds = params.messageIds;
          const messageIds = Array.isArray(rawIds)
            ? rawIds.filter((x): x is string => typeof x === "string" && x.length > 0)
            : [];
          return await deps.turns.deleteTranscriptMessages(
            accountId,
            params.sessionId as string,
            messageIds,
          );
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.archiveSession": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.turns.archiveSession(accountId, params.sessionId as string);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.unarchiveSession": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.turns.unarchiveSession(accountId, params.sessionId as string);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.removeSession": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.turns.removeSession(accountId, params.sessionId as string);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.renameSession": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.turns.renameSession(
            accountId,
            params.sessionId as string,
            params.title as string,
          );
        } catch (err) {
          mapStoreError(err);
        }
      }

      /* ---- B6 approvals & grants ---- */
      case "home.listApprovals": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.turns.listApprovals(accountId);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.answerApproval": {
        try {
          const pending = await deps.turns.approvals.findApprovalById(params.id as string);
          if (pending) {
            requireBoundAccount(method, caller, { accountId: pending.accountId });
          }
          const scope =
            params.scope === "once" || params.scope === "session" || params.scope === "always"
              ? params.scope
              : undefined;
          return await deps.turns.answerApproval({
            id: params.id as string,
            decision: params.decision as "allow" | "deny",
            argsDigest: params.argsDigest as string,
            grantedBy: caller.kind === "loopback-owner" ? "loopback-owner" : "device",
            ...(scope !== undefined ? { scope } : {}),
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.listChoices": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const sessionId =
            typeof params.sessionId === "string" && params.sessionId.trim()
              ? params.sessionId.trim()
              : undefined;
          return await deps.turns.listChoices(accountId, sessionId);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.answerChoice": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const optionIds = Array.isArray(params.optionIds)
            ? params.optionIds.map(String).filter((s) => s.trim())
            : undefined;
          return await deps.turns.answerChoice({
            accountId,
            id: String(params.id),
            ...(typeof params.optionId === "string" && params.optionId.trim()
              ? { optionId: params.optionId.trim() }
              : {}),
            ...(optionIds?.length ? { optionIds } : {}),
            ...(typeof params.text === "string" && params.text.trim()
              ? { text: params.text.trim() }
              : {}),
            ...(params.cancel === true ? { cancel: true } : {}),
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.listGrants": {
        try {
          const accountId =
            typeof params.accountId === "string" && params.accountId.length > 0
              ? params.accountId
              : undefined;
          if (accountId) {
            if (!mayActForSeat(caller, accountId, ownerAccountId)) {
              throwRpc(
                TRANSPORT_CODE_UNAUTHORIZED,
                "account_not_bound",
                `envoyhome.account_not_bound: cannot list grants for ${accountId}`,
              );
            }
            return await deps.turns.listGrants(accountId);
          }
          if (isHouseholdOwner(caller, ownerAccountId)) {
            return await deps.turns.listGrants();
          }
          const grants: unknown[] = [];
          for (const id of caller.accountIds) {
            const row = await deps.turns.listGrants(id);
            const list = (row as { grants?: unknown[] }).grants ?? [];
            grants.push(...list);
          }
          return { grants };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.revokeGrant": {
        try {
          const grantId = params.id as string;
          let grantAccountId: string | undefined;
          const seats = isHouseholdOwner(caller, ownerAccountId)
            ? (await deps.accounts.list()).map((a) => a.accountId)
            : [...caller.accountIds];
          for (const seat of seats) {
            const { grants } = (await deps.turns.listGrants(seat)) as {
              grants: Array<{ id?: string; accountId?: string }>;
            };
            const hit = grants.find((g) => g.id === grantId);
            if (hit) {
              grantAccountId = hit.accountId ?? seat;
              break;
            }
          }
          if (!grantAccountId || !mayActForSeat(caller, grantAccountId, ownerAccountId)) {
            throwRpc(
              TRANSPORT_CODE_UNAUTHORIZED,
              "auth",
              "envoyhome.account_not_bound: cannot revoke grant for another seat",
            );
          }
          await deps.turns.revokeGrant(grantId);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }

      /* ---- B6 providers & harness ---- */
      case "home.listProviders": {
        try {
          const accountId =
            typeof params.accountId === "string" && params.accountId.length > 0
              ? requireBoundAccount(method, caller, params)
              : caller.accountIds[0] ?? "default";
          return deps.providers.listProviders(accountId);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setProvider": {
        try {
          if (!isHouseholdOwner(caller, ownerAccountId)) {
            throw Object.assign(new Error("home.setProvider requires owner-scope"), {
              rpcError: makeError(
                TRANSPORT_CODE_UNAUTHORIZED,
                "auth",
                "home.setProvider requires owner-scope",
              ),
            });
          }
          const rec = await deps.providers.setProvider({
            id: params.id as string,
            kind: params.kind as
              | "local_llama_cpp"
              | "local_openai_compat"
              | "cloud_openai_compat"
              | "cloud_anthropic_compat",
            ...(typeof params.baseUrl === "string" ? { baseUrl: params.baseUrl } : {}),
            ...(typeof params.model === "string" ? { model: params.model } : {}),
            ...(typeof params.enabled === "boolean" ? { enabled: params.enabled } : {}),
            ...(typeof params.label === "string" ? { label: params.label } : {}),
            ...(params.placement === "local" || params.placement === "cloud"
              ? { placement: params.placement }
              : {}),
            ...(params.cost && typeof params.cost === "object"
              ? { cost: params.cost as { inputPerMTok?: number; outputPerMTok?: number; currency?: string } }
              : {}),
            ...(params.costRank === null || typeof params.costRank === "number"
              ? { costRank: params.costRank as number | null }
              : {}),
            ...(params.paramCountB === null || typeof params.paramCountB === "number"
              ? { paramCountB: params.paramCountB as number | null }
              : {}),
            ...(typeof params.capabilityRank === "number"
              ? { capabilityRank: params.capabilityRank }
              : {}),
            ...(params.contextTokens === null || typeof params.contextTokens === "number"
              ? { contextTokens: params.contextTokens as number | null }
              : {}),
            ...(typeof params.supportsTools === "boolean"
              ? { supportsTools: params.supportsTools }
              : {}),
            ...(typeof params.supportsVision === "boolean"
              ? { supportsVision: params.supportsVision }
              : {}),
            ...(typeof params.supportsLogprobs === "boolean"
              ? { supportsLogprobs: params.supportsLogprobs }
              : {}),
            ...(params.latencyClass === null ||
            params.latencyClass === "fast" ||
            params.latencyClass === "standard" ||
            params.latencyClass === "slow"
              ? { latencyClass: params.latencyClass as "fast" | "standard" | "slow" | null }
              : {}),
          });
          return { provider: { id: rec.id, kind: rec.kind, healthy: rec.enabled } };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.removeProvider": {
        try {
          if (!isHouseholdOwner(caller, ownerAccountId)) {
            throw Object.assign(new Error("home.removeProvider requires owner-scope"), {
              rpcError: makeError(
                TRANSPORT_CODE_UNAUTHORIZED,
                "auth",
                "home.removeProvider requires owner-scope",
              ),
            });
          }
          await deps.providers.removeProvider(params.id as string);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setProviderSecret": {
        try {
          if (!isHouseholdOwner(caller, ownerAccountId)) {
            throw Object.assign(new Error("home.setProviderSecret requires owner-scope"), {
              rpcError: makeError(
                TRANSPORT_CODE_UNAUTHORIZED,
                "auth",
                "home.setProviderSecret requires owner-scope",
              ),
            });
          }
          await deps.providers.setProviderSecret(params.id as string, params.value as string);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.testProvider": {
        try {
          if (!isHouseholdOwner(caller, ownerAccountId)) {
            throw Object.assign(new Error("home.testProvider requires owner-scope"), {
              rpcError: makeError(
                TRANSPORT_CODE_UNAUTHORIZED,
                "auth",
                "home.testProvider requires owner-scope",
              ),
            });
          }
          return await deps.providers.testProvider(params.id as string);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setModelMode": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          await deps.providers.setMode(accountId, params.mode as "local" | "cloud" | "mix");
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setDefaultProvider": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          await deps.providers.setDefaultProvider(accountId, params.providerId as string);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setPlacementFilter": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const filter = params.filter as "any" | "local" | "cloud";
          // shared:true = enter/leave Local only for every profile (daemon-wide).
          // Callers MUST NOT pass shared on ordinary per-profile Cloud / Smart saves.
          if (params.shared === true) {
            const ids = (await deps.accounts.list()).map((a) => a.accountId);
            if (!ids.includes(accountId)) ids.push(accountId);
            await deps.providers.setSharedLocalOnly(filter === "local", ids);
            return { ok: true };
          }
          await deps.providers.setPlacementFilter(accountId, filter);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.setAutoModelSwitch": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          await deps.providers.setAutoModelSwitch(accountId, params.enabled === true);
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.getLocalEngineStatus": {
        // owner-scope enforced by assertScope / METHODS.scope
        return await deps.localEngine.status();
      }
      case "home.downloadLocalModel": {
        try {
          const modelId = typeof params.modelId === "string" ? params.modelId : "";
          return deps.localEngine.downloadModel({ modelId });
        } catch (err) {
          mapLocalEngineError(err);
          mapStoreError(err);
        }
      }
      case "home.searchHuggingFaceModels": {
        try {
          const query = typeof params.query === "string" ? params.query : "";
          const limit =
            typeof params.limit === "number" && Number.isFinite(params.limit)
              ? Math.trunc(params.limit)
              : undefined;
          return await deps.localEngine.searchHuggingFaceModels({
            query,
            ...(limit !== undefined ? { limit } : {}),
          });
        } catch (err) {
          mapLocalEngineError(err);
          mapStoreError(err);
        }
      }
      case "home.listHuggingFaceGgufFiles": {
        try {
          const repoId = typeof params.repoId === "string" ? params.repoId : "";
          return await deps.localEngine.listHuggingFaceGgufFiles({ repoId });
        } catch (err) {
          mapLocalEngineError(err);
          mapStoreError(err);
        }
      }
      case "home.downloadLocalModelUrl": {
        try {
          const url = typeof params.url === "string" ? params.url : "";
          return deps.localEngine.downloadModelUrl({ url });
        } catch (err) {
          mapLocalEngineError(err);
          mapStoreError(err);
        }
      }
      case "home.cancelLocalModelDownload": {
        try {
          const fileName = typeof params.fileName === "string" ? params.fileName : "";
          return await deps.localEngine.cancelModelDownload({ fileName });
        } catch (err) {
          mapLocalEngineError(err);
          mapStoreError(err);
        }
      }
      case "home.resumeLocalModelDownload": {
        try {
          const fileName = typeof params.fileName === "string" ? params.fileName : "";
          return deps.localEngine.resumeModelDownload({ fileName });
        } catch (err) {
          mapLocalEngineError(err);
          mapStoreError(err);
        }
      }
      case "home.enableLocalEngine": {
        try {
          const prefer =
            params.prefer === "attach" || params.prefer === "spawn" || params.prefer === "auto"
              ? params.prefer
              : "auto";
          // prefer=attach is refused in LocalEngineService (Home never reuses Mesh :18790).
          const accountId = optionalBoundAccountId(method, caller, params);
          return await deps.localEngine.enableLocal({
            prefer,
            ...(accountId ? { accountId } : {}),
            ...(typeof params.modelPath === "string" ? { modelPath: params.modelPath } : {}),
            ...(typeof params.binaryPath === "string" ? { binaryPath: params.binaryPath } : {}),
            ...(typeof params.modelAlias === "string" ? { modelAlias: params.modelAlias } : {}),
            ...(typeof params.downloadRuntime === "boolean"
              ? { downloadRuntime: params.downloadRuntime }
              : {}),
          });
        } catch (err) {
          mapLocalEngineError(err);
          mapStoreError(err);
        }
      }
      case "home.enableOllama": {
        try {
          const accountId = optionalBoundAccountId(method, caller, params);
          return await deps.localEngine.enableOllama({
            ...(accountId ? { accountId } : {}),
            ...(typeof params.baseUrl === "string" ? { baseUrl: params.baseUrl } : {}),
            ...(typeof params.model === "string" ? { model: params.model } : {}),
          });
        } catch (err) {
          mapLocalEngineError(err);
          mapStoreError(err);
        }
      }
      case "home.disableLocalEngine": {
        try {
          return await deps.localEngine.disable();
        } catch (err) {
          mapLocalEngineError(err);
          mapStoreError(err);
        }
      }
      case "home.listHarnesses": {
        return {
          harnesses: HARNESS_CATALOG.map((h) => ({
            id: h.id,
            name: h.name,
            version: h.version,
          })),
          defaultId: DEFAULT_HARNESS_ID,
        };
      }
      case "home.setHarness": {
        try {
          if (!isHouseholdOwner(caller, ownerAccountId)) {
            throw Object.assign(new Error("home.setHarness requires owner-scope"), {
              rpcError: makeError(
                TRANSPORT_CODE_UNAUTHORIZED,
                "auth",
                "home.setHarness requires owner-scope",
              ),
            });
          }
          await deps.harnesses.setHarness({
            harnessId: params.harnessId as string,
            ...(typeof params.accountId === "string" ? { accountId: params.accountId } : {}),
            ...(typeof params.agentId === "string" ? { agentId: params.agentId } : {}),
            ...(params.confirm === true ? { confirm: true } : {}),
          });
          return { ok: true };
        } catch (err) {
          mapStoreError(err);
        }
      }

      case "home.doctor": {
        const issues = await collectDoctorIssues(
          {
            config: deps.config,
            accounts: deps.accounts,
            bindings: deps.bindings,
            channels: deps.channels,
            webSearch: deps.webSearch,
            browserControl: deps.browserControl,
            schedules: deps.schedules,
            policy: deps.turns.policy,
            mediaGenerate: deps.turns.mediaGenerate,
            hasImageGenerateProvider: () => deps.providers.hasImageGenerateProvider(),
          },
          {
            dualModeNotes: deps.meshDualModeNotes?.() ?? [],
            meshStatus: deps.meshStatus(),
            ownerAccountId,
            ...(typeof params.homeClawRoot === "string"
              ? { homeClawRoot: params.homeClawRoot }
              : {}),
            ...(params.importChat === true ? { importChat: true } : {}),
          },
        );
        return { ok: issues.every((i) => i.severity !== "error"), issues };
      }
      case "home.doctorFix": {
        if (!isHouseholdOwner(caller, ownerAccountId)) {
          throw Object.assign(new Error("home.doctorFix requires owner-scope"), {
            rpcError: makeError(
              TRANSPORT_CODE_UNAUTHORIZED,
              "auth",
              "home.doctorFix requires owner-scope",
            ),
          });
        }
        const issueIds = (params.issueIds as unknown[]).filter(
          (x): x is string => typeof x === "string",
        );
        const issues = await collectDoctorIssues(
          {
            config: deps.config,
            accounts: deps.accounts,
            bindings: deps.bindings,
            channels: deps.channels,
            webSearch: deps.webSearch,
            browserControl: deps.browserControl,
            schedules: deps.schedules,
            policy: deps.turns.policy,
            mediaGenerate: deps.turns.mediaGenerate,
            hasImageGenerateProvider: () => deps.providers.hasImageGenerateProvider(),
          },
          { meshStatus: deps.meshStatus(), ownerAccountId },
        );
        const result = await applyDoctorFixes({
          issueIds,
          issues,
          stateDir: deps.config.stateDir,
          config: deps.config,
          accounts: deps.accounts,
          bindings: deps.bindings,
          household: deps.household,
        });
        return { fixed: result.fixed, failed: result.failed, diffs: result.diffs };
      }

      case "home.listSources": {
        // Still require a bound account for device callers (auth), but do not filter by binder —
        // household registry is shared (Design 2026-10-16l).
        if (!isHouseholdOwner(caller, ownerAccountId)) {
          requireBoundAccount(method, caller, params);
        }
        // pruneUnbound runs inside list(); re-run for an accurate capped flag.
        const prune = await deps.channels.objects.pruneUnbound();
        const sources = await deps.channels.objects.list({
          ...(typeof params.channel === "string" ? { channel: params.channel } : {}),
          ...(params.bound === true ? { bound: true } : {}),
          ...(params.bound === false ? { bound: false } : {}),
        });
        return {
          sources: sources.map(wireSourceRecord),
          unboundCapped: prune.capped || prune.pruned > 0,
        };
      }
      case "home.setSourceBinding": {
        if (!isHouseholdOwner(caller, ownerAccountId)) {
          throw Object.assign(new Error("home.setSourceBinding requires owner-scope"), {
            rpcError: makeError(
              TRANSPORT_CODE_UNAUTHORIZED,
              "auth",
              "home.setSourceBinding requires owner-scope",
            ),
          });
        }
        try {
          const input = {
            channel: params.channel as string,
            channelAccount: params.channelAccount as string,
            sourceId: params.sourceId as string,
            accountId: (params.accountId as string | null) ?? null,
            ...(typeof params.class === "string" ? { class: params.class } : {}),
            ...(typeof params.shared === "boolean" ? { shared: params.shared } : {}),
            ...(typeof params.neverUnattended === "boolean"
              ? { neverUnattended: params.neverUnattended }
              : {}),
            ...(Array.isArray(params.actuationAllowList)
              ? {
                  actuationAllowList: (params.actuationAllowList as unknown[]).filter(
                    (x): x is string => typeof x === "string",
                  ),
                }
              : {}),
            ...(Array.isArray(params.indirectionAllowList)
              ? {
                  indirectionAllowList: (params.indirectionAllowList as unknown[]).filter(
                    (x): x is string => typeof x === "string",
                  ),
                }
              : {}),
            ...(typeof params.displayName === "string"
              ? { displayName: params.displayName }
              : {}),
          };
          const source = await deps.channels.objects.setSourceBinding(input);
          return { source: wireSourceRecord(source) };
        } catch (err) {
          if (err instanceof ObjectRegistryError) {
            throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
          }
          throw err;
        }
      }
      case "home.removeSourceBinding": {
        if (!isHouseholdOwner(caller, ownerAccountId)) {
          throw Object.assign(new Error("home.removeSourceBinding requires owner-scope"), {
            rpcError: makeError(
              TRANSPORT_CODE_UNAUTHORIZED,
              "auth",
              "home.removeSourceBinding requires owner-scope",
            ),
          });
        }
        try {
          await deps.channels.objects.removeSourceBinding(
            params.channel as string,
            params.channelAccount as string,
            params.sourceId as string,
          );
          return { ok: true };
        } catch (err) {
          if (err instanceof ObjectRegistryError) {
            throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
          }
          throw err;
        }
      }
      case "home.listActuations": {
        if (!isHouseholdOwner(caller, ownerAccountId)) {
          throw Object.assign(new Error("home.listActuations requires owner-scope"), {
            rpcError: makeError(
              TRANSPORT_CODE_UNAUTHORIZED,
              "auth",
              "home.listActuations requires owner-scope",
            ),
          });
        }
        const accountId = params.accountId as string;
        if (!(await deps.accounts.get(accountId))) {
          throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", `unknown account: ${accountId}`);
        }
        const rows = await deps.actuations.list(accountId, {
          ...(typeof params.objectId === "string" ? { objectId: params.objectId } : {}),
          ...(typeof params.since === "string" ? { since: params.since } : {}),
          ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
        });
        return {
          actuations: rows.map((r) => ({
            actuationId: r.actuationId,
            accountId: r.accountId,
            objectId: r.objectId,
            desiredState: r.desiredState,
            risk: r.risk,
            origin: r.origin,
            dispatchedAt: r.dispatchedAt,
            outcome: r.outcome,
            stateChanged: r.stateChanged,
          })),
        };
      }

      /* ---- B9 workflows ---- */
      case "home.listWorkflows": {
        await deps.workflows.ensureLoaded();
        const accountId =
          typeof params.accountId === "string" && params.accountId.length > 0
            ? requireBoundAccount(method, caller, params)
            : undefined;
        const workflows = deps.workflows.list(accountId);
        return {
          workflows: workflows.map((w) => ({
            id: w.id,
            source: w.source,
            enabled: w.enabled,
            ...(w.accountId !== undefined ? { accountId: w.accountId } : {}),
          })),
        };
      }
      case "home.getWorkflow": {
        await deps.workflows.ensureLoaded();
        const accountId =
          typeof params.accountId === "string" && params.accountId.length > 0
            ? params.accountId
            : caller.accountIds[0];
        const wf = deps.workflows.getWorkflow(params.id as string, accountId);
        if (!wf) {
          throw Object.assign(new Error("envoyhome.bad_params: unknown workflow"), {
            rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", "unknown workflow"),
          });
        }
        return wf;
      }
      case "home.reloadWorkflows": {
        const count = await deps.workflows.reload();
        await syncWorkflowSchedules(deps);
        return { ok: true, count };
      }
      case "home.listWorkflowTools": {
        const forAccountId: string | null =
          caller?.kind === "device" && caller.accountIds.length > 0
            ? (caller.accountIds[0] ?? null)
            : caller?.kind === "loopback-owner"
              ? ownerAccountId
              : typeof params.accountId === "string"
                ? params.accountId
                : null;
        const tools = await listWorkflowTools({
          skills: deps.skills,
          channels: deps.channels,
          webSearch: deps.webSearch,
          browserControl: deps.browserControl,
          forAccountId,
          ownerAccountId: ownerAccountId ?? null,
        });
        return {
          tools: tools.map((row) => ({
            name: row.name,
            risk: row.risk,
            source: row.source,
            summary: row.summary,
            available: row.available,
            ...(row.sampleArgs !== undefined ? { sampleArgs: row.sampleArgs } : {}),
            ...(row.argChoices !== undefined ? { argChoices: row.argChoices } : {}),
            ...(row.argChoiceGroups !== undefined
              ? { argChoiceGroups: row.argChoiceGroups }
              : {}),
            ...(row.argChoiceDependsOn !== undefined
              ? { argChoiceDependsOn: row.argChoiceDependsOn }
              : {}),
            ...(row.unavailableReason !== undefined
              ? { unavailableReason: row.unavailableReason }
              : {}),
          })),
        };
      }
      case "home.draftWorkflow": {
        const accountId = String(params.accountId ?? "");
        if (!accountId) {
          throw Object.assign(new Error("envoyhome.bad_params: accountId required"), {
            rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", "accountId required"),
          });
        }
        try {
          const tools = await listWorkflowTools({
            skills: deps.skills,
            channels: deps.channels,
            webSearch: deps.webSearch,
            browserControl: deps.browserControl,
          });
          const hintRaw = Array.isArray(params.hintTools) ? params.hintTools : [];
          const hintTools = hintRaw.filter((x): x is string => typeof x === "string" && x.length > 0);
          const readyNames = tools.filter((t) => t.available !== false).map((t) => t.name);
          const toolNames = hintTools.length > 0 ? hintTools : readyNames;
          const known = await workflowToolNameSet({
            skills: deps.skills,
            channels: deps.channels,
            webSearch: deps.webSearch,
            browserControl: deps.browserControl,
          });
          const drafted = await draftWorkflowFromText({
            text: String(params.text ?? ""),
            toolNames,
            knownTools: known,
            complete: (messages) => deps.turns.completeForAccount(accountId, messages),
            ...(typeof params.currentYaml === "string" && params.currentYaml.trim()
              ? { currentYaml: params.currentYaml }
              : {}),
          });
          return { yaml: drafted.yaml };
        } catch (err) {
          throw Object.assign(
            new Error(err instanceof Error ? err.message : String(err)),
            {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                err instanceof Error ? err.message : String(err),
              ),
            },
          );
        }
      }
      case "home.draftWorkflowPrompt": {
        const accountId = String(params.accountId ?? "");
        if (!accountId) {
          throw Object.assign(new Error("envoyhome.bad_params: accountId required"), {
            rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", "accountId required"),
          });
        }
        const nodeType = params.nodeType === "llm_summarize" ? "llm_summarize" : "llm_fill";
        try {
          const drafted = await draftWorkflowNodePrompt({
            nodeType,
            ...(typeof params.goal === "string" ? { goal: params.goal } : {}),
            ...(typeof params.currentPrompt === "string"
              ? { currentPrompt: params.currentPrompt }
              : {}),
            complete: (messages) => deps.turns.completeForAccount(accountId, messages),
          });
          return { prompt: drafted.prompt };
        } catch (err) {
          throw Object.assign(
            new Error(err instanceof Error ? err.message : String(err)),
            {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                err instanceof Error ? err.message : String(err),
              ),
            },
          );
        }
      }
      case "home.listWorkflowStepTemplates": {
        const accountId =
          typeof params.accountId === "string" && params.accountId.length > 0
            ? (params.accountId as string)
            : undefined;
        const templates = await deps.workflowStepTemplates.list(accountId);
        return {
          templates: templates.map((t) => ({
            id: t.id,
            label: t.label,
            nodeType: t.nodeType,
            prompt: t.prompt,
            source: t.source,
            ...(t.out !== undefined ? { out: t.out } : {}),
            ...(t.accountId !== undefined ? { accountId: t.accountId } : {}),
          })),
        };
      }
      case "home.putWorkflowStepTemplate": {
        const accountId =
          typeof params.accountId === "string" && params.accountId.length > 0
            ? (params.accountId as string)
            : undefined;
        try {
          const saved = await deps.workflowStepTemplates.put({
            label: String(params.label ?? ""),
            nodeType: params.nodeType === "llm_summarize" ? "llm_summarize" : "llm_fill",
            prompt: String(params.prompt ?? ""),
            ...(typeof params.id === "string" ? { id: params.id } : {}),
            ...(typeof params.out === "string" ? { out: params.out } : {}),
            ...(accountId ? { accountId } : {}),
          });
          return {
            ok: true,
            id: saved.id,
            label: saved.label,
            nodeType: saved.nodeType,
            source: saved.source,
          };
        } catch (err) {
          throw Object.assign(
            new Error(err instanceof Error ? err.message : String(err)),
            {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                err instanceof Error ? err.message : String(err),
              ),
            },
          );
        }
      }
      case "home.removeWorkflowStepTemplate": {
        const accountId =
          typeof params.accountId === "string" && params.accountId.length > 0
            ? (params.accountId as string)
            : undefined;
        const ok = await deps.workflowStepTemplates.remove(
          String(params.id ?? ""),
          accountId,
        );
        return { ok };
      }
      case "home.validateWorkflow": {
        const known = await workflowToolNameSet({
          skills: deps.skills,
          channels: deps.channels,
            webSearch: deps.webSearch,
            browserControl: deps.browserControl,
        });
        const result = deps.workflows.validate(String(params.yaml ?? ""), known);
        if (result.ok) return { ok: true, id: result.id };
        return { ok: false, error: result.error };
      }
      case "home.putWorkflow": {
        const accountId =
          typeof params.accountId === "string" && params.accountId.length > 0
            ? (params.accountId as string)
            : undefined;
        try {
          const known = await workflowToolNameSet({
            skills: deps.skills,
            channels: deps.channels,
            webSearch: deps.webSearch,
            browserControl: deps.browserControl,
          });
          const { id } = await deps.workflows.put(
            String(params.yaml ?? ""),
            accountId,
            known,
          );
          await syncWorkflowSchedules(deps);
          return { ok: true, id };
        } catch (err) {
          throw Object.assign(
            new Error(err instanceof Error ? err.message : String(err)),
            {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                err instanceof Error ? err.message : String(err),
              ),
            },
          );
        }
      }
      case "home.removeWorkflow": {
        const accountId =
          typeof params.accountId === "string" && params.accountId.length > 0
            ? (params.accountId as string)
            : undefined;
        try {
          await deps.workflows.remove(params.id as string, accountId);
          await syncWorkflowSchedules(deps);
          return { ok: true };
        } catch (err) {
          throw Object.assign(
            new Error(err instanceof Error ? err.message : String(err)),
            {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                err instanceof Error ? err.message : String(err),
              ),
            },
          );
        }
      }
      case "home.setWorkflowEnabled": {
        const accountId =
          typeof params.accountId === "string" && params.accountId.length > 0
            ? (params.accountId as string)
            : undefined;
        try {
          const next = await deps.workflows.setEnabled(
            params.id as string,
            Boolean(params.enabled),
            accountId,
          );
          await syncWorkflowSchedules(deps);
          return { ok: true, id: next.id, enabled: next.enabled !== false };
        } catch (err) {
          throw Object.assign(
            new Error(err instanceof Error ? err.message : String(err)),
            {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                err instanceof Error ? err.message : String(err),
              ),
            },
          );
        }
      }
      case "home.runWorkflow": {
        const accountId = requireBoundAccount(method, caller, params);
        await deps.workflows.ensureLoaded();
        try {
          const { runId, results } = await deps.turns.runWorkflowTest({
            accountId,
            workflowId: params.id as string,
            ...(typeof params.text === "string" ? { text: params.text } : {}),
          });
          return {
            ok: results.every((r) => r.ok),
            runId,
            results: results.map((r) => ({
              nodeId: r.nodeId,
              type: r.type,
              ok: r.ok,
              ...(r.detail !== undefined ? { detail: r.detail } : {}),
              ...(r.output !== undefined ? { output: r.output } : {}),
            })),
          };
        } catch (err) {
          throw Object.assign(
            new Error(err instanceof Error ? err.message : String(err)),
            {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                err instanceof Error ? err.message : String(err),
              ),
            },
          );
        }
      }

      /* ---- B9.1 schedules ---- */
      case "home.listSchedules": {
        const accountId = requireBoundAccount(method, caller, params);
        await deps.schedules.watchAccount(accountId);
        const jobs = (await deps.schedules.store.listJobs(accountId)).filter(
          (j) => j.payload.kind !== "system" && !j.id.startsWith("standing:"),
        );
        const dismissed = await deps.schedules.listDismissed(accountId);
        return {
          jobs: jobs.map((j) => ({
            id: j.id,
            name: j.name,
            enabled: j.enabled,
            kind: j.spec.kind,
            source: j.source,
            payloadKind: j.payload.kind,
            timeZone: j.spec.timeZone,
            ...(j.nextRunAt ? { nextRunAt: j.nextRunAt } : {}),
            ...(j.lastStatus ? { lastStatus: j.lastStatus } : {}),
            ...(j.payload.message ? { message: j.payload.message } : {}),
            ...(j.payload.workflowId ? { workflowId: j.payload.workflowId } : {}),
            ...(j.payload.toolName ? { toolName: j.payload.toolName } : {}),
            ...(j.payload.prompt ? { prompt: j.payload.prompt } : {}),
            ...(j.spec.cronExpr ? { cronExpr: j.spec.cronExpr } : {}),
            ...(typeof j.spec.everyMs === "number" ? { everyMs: j.spec.everyMs } : {}),
            ...(j.spec.whenInstant ? { whenInstant: j.spec.whenInstant } : {}),
          })),
          dismissed: dismissed.map((d) => ({
            proposalId: d.proposalId,
            status: d.status,
            resolvedLocal: d.resolvedLocal,
            name: d.name,
            kind: d.kind,
            closedAt: d.closedAt,
            ...(d.expiresAt ? { expiresAt: d.expiresAt } : {}),
            ...(d.message ? { message: d.message } : {}),
            ...(d.timeZone ? { timeZone: d.timeZone } : {}),
          })),
        };
      }
      case "home.cancelScheduleProposal": {
        const accountId = requireBoundAccount(method, caller, params);
        try {
          const dismissed = await deps.schedules.cancelProposal(
            accountId,
            String(params.proposalId),
          );
          if (dismissed.sessionId) {
            await deps.turns.clearPendingScheduleConfirm(accountId, dismissed.sessionId);
          }
          return {
            dismissed: {
              proposalId: dismissed.proposalId,
              status: dismissed.status,
              resolvedLocal: dismissed.resolvedLocal,
              name: dismissed.name,
              kind: dismissed.kind,
              closedAt: dismissed.closedAt,
              ...(dismissed.expiresAt ? { expiresAt: dismissed.expiresAt } : {}),
              ...(dismissed.message ? { message: dismissed.message } : {}),
              ...(dismissed.timeZone ? { timeZone: dismissed.timeZone } : {}),
            },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("bad_params")) {
            throw Object.assign(err instanceof Error ? err : new Error(msg), {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                msg.replace(/^envoyhome\.bad_params:\s*/, ""),
              ),
            });
          }
          throw err;
        }
      }
      case "home.proposeSchedule": {
        const accountId = requireBoundAccount(method, caller, params);
        const text = String(params.text ?? "");
        const timeZone =
          typeof params.timeZone === "string" && params.timeZone.length > 0
            ? params.timeZone
            : undefined;
        const { normalizeClientContext } = await import("./client-context.js");
        const clientContext = normalizeClientContext(params.clientContext);
        const proposal = await deps.schedules.proposeFromText(accountId, text, timeZone, {
          ...(clientContext ? { clientContext } : {}),
        });
        if ("error" in proposal) {
          const { formatProposeFailure } = await import("./schedule/service.js");
          const detail = formatProposeFailure(proposal);
          throw Object.assign(new Error(`envoyhome.bad_params: ${detail}`), {
            rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", detail),
          });
        }
        return {
          proposalId: proposal.proposalId,
          resolvedLocal: proposal.resolvedLocal,
          kind: proposal.spec.kind,
          timeZone: proposal.spec.timeZone,
          ...(proposal.relativeHint ? { relativeHint: proposal.relativeHint } : {}),
          ...(proposal.nextRunAt ? { nextRunAt: proposal.nextRunAt } : {}),
          ...(proposal.spec.whenInstant ? { whenInstant: proposal.spec.whenInstant } : {}),
          ...(proposal.spec.cronExpr ? { cronExpr: proposal.spec.cronExpr } : {}),
          ...(proposal.spec.everyMs !== undefined ? { everyMs: proposal.spec.everyMs } : {}),
          ...(proposal.payload.message ? { message: proposal.payload.message } : {}),
        };
      }
      case "home.confirmSchedule": {
        const accountId = requireBoundAccount(method, caller, params);
        const overrides: {
          name?: string;
          payload?: SchedulePayload;
        } = {};
        if (typeof params.name === "string" && params.name.trim().length > 0) {
          overrides.name = params.name.trim();
        }
        if (params.payload !== undefined) {
          overrides.payload = await resolveUserSchedulePayload(deps, accountId, params.payload);
        }
        try {
          const peek = deps.schedules.store.getProposal(String(params.proposalId));
          const job = await deps.schedules.confirmProposal(
            accountId,
            String(params.proposalId),
            overrides,
          );
          if (peek?.sessionId) {
            await deps.turns.clearPendingScheduleConfirm(accountId, peek.sessionId);
          }
          return {
            job: {
              id: job.id,
              enabled: job.enabled,
              ...(job.nextRunAt ? { nextRunAt: job.nextRunAt } : {}),
            },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("bad_params")) {
            throw Object.assign(err instanceof Error ? err : new Error(msg), {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                msg.replace(/^envoyhome\.bad_params:\s*/, ""),
              ),
            });
          }
          throw err;
        }
      }
      case "home.putSchedule": {
        const accountId = requireBoundAccount(method, caller, params);
        const name = String(params.name ?? "").trim();
        if (!name) {
          throw Object.assign(new Error("envoyhome.bad_params: name required"), {
            rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", "name required"),
          });
        }
        const specParsed = normalizeScheduleSpec(params.spec);
        if (!specParsed.ok) {
          throw Object.assign(new Error(`envoyhome.bad_params: ${specParsed.reason}`), {
            rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", specParsed.reason),
          });
        }
        const payload = await resolveUserSchedulePayload(deps, accountId, params.payload);
        await deps.schedules.watchAccount(accountId);
        const job = await deps.schedules.createJob({
          accountId,
          name,
          spec: specParsed.spec,
          payload,
          source: "user",
        });
        return {
          job: {
            id: job.id,
            enabled: job.enabled,
            ...(job.nextRunAt ? { nextRunAt: job.nextRunAt } : {}),
          },
        };
      }
      case "home.updateSchedule": {
        const accountId = requireBoundAccount(method, caller, params);
        const patch: {
          enabled?: boolean;
          name?: string;
          spec?: ScheduleSpec;
          payload?: SchedulePayload;
        } = {};
        if (typeof params.enabled === "boolean") patch.enabled = params.enabled;
        if (typeof params.name === "string" && params.name.trim().length > 0) {
          patch.name = params.name.trim();
        }
        if (params.spec !== undefined) {
          const specParsed = normalizeScheduleSpec(params.spec);
          if (!specParsed.ok) {
            throw Object.assign(new Error(`envoyhome.bad_params: ${specParsed.reason}`), {
              rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", specParsed.reason),
            });
          }
          patch.spec = specParsed.spec;
        }
        if (params.payload !== undefined) {
          patch.payload = await resolveUserSchedulePayload(deps, accountId, params.payload);
        }
        try {
          const job = await deps.schedules.updateJob(accountId, String(params.jobId), patch);
          return {
            job: {
              id: job.id,
              enabled: job.enabled,
              ...(job.nextRunAt ? { nextRunAt: job.nextRunAt } : {}),
            },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("bad_params")) {
            throw Object.assign(err instanceof Error ? err : new Error(msg), {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                msg.replace(/^envoyhome\.bad_params:\s*/, ""),
              ),
            });
          }
          throw err;
        }
      }
      case "home.listScheduleReceipts": {
        const accountId = requireBoundAccount(method, caller, params);
        await deps.schedules.watchAccount(accountId);
        const jobId =
          typeof params.jobId === "string" && params.jobId.trim().length > 0
            ? params.jobId.trim()
            : undefined;
        const limitRaw = typeof params.limit === "number" ? params.limit : 50;
        const limit = Math.max(1, Math.min(200, Math.floor(limitRaw)));
        let receipts = await deps.schedules.listUserReceipts(accountId, jobId);
        receipts = receipts.slice(-limit).reverse();
        return {
          receipts: receipts.map((r) => ({
            jobId: r.jobId,
            accountId: r.accountId,
            scheduledFor: r.scheduledFor,
            startedAt: r.startedAt,
            finishedAt: r.finishedAt,
            execStatus: r.execStatus,
            deliveryStatus: r.deliveryStatus,
            ...(r.error !== undefined ? { error: r.error } : {}),
          })),
        };
      }
      case "home.removeSchedule": {
        const accountId = requireBoundAccount(method, caller, params);
        try {
          await deps.schedules.removeJob(accountId, String(params.jobId));
          return { ok: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("bad_params")) {
            throw Object.assign(err instanceof Error ? err : new Error(msg), {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                msg.replace(/^envoyhome\.bad_params:\s*/, ""),
              ),
            });
          }
          throw err;
        }
      }
      case "home.runSchedule": {
        const accountId = requireBoundAccount(method, caller, params);
        const receipt = await deps.schedules.runNow(accountId, String(params.jobId));
        return {
          receipt: {
            execStatus: receipt.execStatus,
            deliveryStatus: receipt.deliveryStatus,
            ...(receipt.error !== undefined ? { error: receipt.error } : {}),
          },
        };
      }

      /* ---- P2-B ambient: heartbeat + standing orders (Design §19.10) ---- */
      case "home.getHeartbeatConfig": {
        const accountId = requireBoundAccount(method, caller, params);
        const { MIN_HEARTBEAT_INTERVAL_MS } = await import("./schedule/heartbeat.js");
        const pol = await deps.turns.policy.get(accountId);
        return {
          enabled: pol.heartbeatEnabled,
          everyMs: pol.heartbeatEveryMs,
          prompt: pol.heartbeatPrompt,
          minEveryMs: MIN_HEARTBEAT_INTERVAL_MS,
        };
      }
      case "home.setHeartbeatConfig": {
        const accountId = requireBoundAccount(method, caller, params);
        const {
          clampHeartbeatIntervalMs,
          DEFAULT_HEARTBEAT_PROMPT,
          MIN_HEARTBEAT_INTERVAL_MS,
        } = await import("./schedule/heartbeat.js");
        const patch: {
          heartbeatEnabled?: boolean;
          heartbeatEveryMs?: number;
          heartbeatPrompt?: string;
        } = {};
        if (typeof params.enabled === "boolean") patch.heartbeatEnabled = params.enabled;
        if (typeof params.everyMs === "number") {
          patch.heartbeatEveryMs = clampHeartbeatIntervalMs(params.everyMs);
        }
        if (typeof params.prompt === "string" && params.prompt.trim()) {
          patch.heartbeatPrompt = params.prompt.trim().slice(0, 4000);
        }
        const next = await deps.turns.policy.write(accountId, patch);
        await deps.schedules.watchAccount(accountId, {
          heartbeatEnabled: next.heartbeatEnabled,
          heartbeatEveryMs: next.heartbeatEveryMs,
          heartbeatPrompt: next.heartbeatPrompt || DEFAULT_HEARTBEAT_PROMPT,
        });
        return {
          ok: true,
          enabled: next.heartbeatEnabled,
          everyMs: next.heartbeatEveryMs,
          prompt: next.heartbeatPrompt,
          minEveryMs: MIN_HEARTBEAT_INTERVAL_MS,
        };
      }
      case "home.listStandingOrders": {
        const accountId = requireBoundAccount(method, caller, params);
        const orders = await deps.standingOrders.list(accountId);
        return {
          orders: orders.map((o) => ({
            id: o.id,
            name: o.name,
            enabled: o.enabled,
            when: o.when,
            action: o.action,
            createdAt: o.createdAt,
            updatedAt: o.updatedAt,
          })),
        };
      }
      case "home.putStandingOrder": {
        const accountId = requireBoundAccount(method, caller, params);
        const when = params.when as import("./standing-orders.js").StandingWhen;
        const action = params.action as import("./standing-orders.js").StandingAction;
        if (when && typeof when === "object" && when.kind === "smarthome_event") {
          const sourceId = typeof when.sourceId === "string" ? when.sourceId.trim() : "";
          if (!sourceId) {
            throw Object.assign(new Error("envoyhome.bad_params: sourceId required"), {
              rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", "sourceId required"),
            });
          }
          const objs = await deps.channels.objects.list({
            accountId,
            bound: true,
          });
          const hit = objs.find((o) => o.sourceId === sourceId && o.bound && o.accountId === accountId);
          if (!hit) {
            throw Object.assign(
              new Error("envoyhome.object_unknown: standing order sourceId unbound or unregistered"),
              {
                rpcError: makeError(
                  TRANSPORT_CODE_BAD_PARAMS,
                  "bad_params",
                  "standing order sourceId unbound or unregistered",
                ),
              },
            );
          }
        }
        try {
          const order = await deps.standingOrders.put({
            accountId,
            name: String(params.name ?? ""),
            when,
            action,
            ...(typeof params.id === "string" && params.id.trim()
              ? { id: params.id.trim() }
              : {}),
            ...(typeof params.enabled === "boolean" ? { enabled: params.enabled } : {}),
          });
          await deps.schedules.syncStandingCronJobs(
            accountId,
            await deps.standingOrders.list(accountId),
          );
          return {
            order: {
              id: order.id,
              name: order.name,
              enabled: order.enabled,
              when: order.when,
              action: order.action,
              createdAt: order.createdAt,
              updatedAt: order.updatedAt,
            },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("bad_params")) {
            throw Object.assign(err instanceof Error ? err : new Error(msg), {
              rpcError: makeError(
                TRANSPORT_CODE_BAD_PARAMS,
                "bad_params",
                msg.replace(/^envoyhome\.bad_params:\s*/, ""),
              ),
            });
          }
          throw err;
        }
      }
      case "home.removeStandingOrder": {
        const accountId = requireBoundAccount(method, caller, params);
        const id = String(params.id);
        const ok = await deps.standingOrders.remove(accountId, id);
        if (!ok) {
          throw Object.assign(new Error("envoyhome.bad_params: unknown standing order"), {
            rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", "unknown standing order"),
          });
        }
        await deps.schedules.syncStandingCronJobs(
          accountId,
          await deps.standingOrders.list(accountId),
        );
        return { ok: true };
      }
      case "home.setStandingOrderEnabled": {
        const accountId = requireBoundAccount(method, caller, params);
        const order = await deps.standingOrders.setEnabled(
          accountId,
          String(params.id),
          params.enabled === true,
        );
        if (!order) {
          throw Object.assign(new Error("envoyhome.bad_params: unknown standing order"), {
            rpcError: makeError(TRANSPORT_CODE_BAD_PARAMS, "bad_params", "unknown standing order"),
          });
        }
        await deps.schedules.syncStandingCronJobs(
          accountId,
          await deps.standingOrders.list(accountId),
        );
        return {
          order: {
            id: order.id,
            name: order.name,
            enabled: order.enabled,
            when: order.when,
            action: order.action,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          },
        };
      }

      /* ---- P2-D2 media generate (Design §19.12) ---- */
      case "home.getMediaGenerateConfig": {
        const accountId = requireBoundAccount(method, caller, params);
        const state = await deps.turns.mediaGenerate.get(accountId);
        const today = new Date().toISOString().slice(0, 10);
        const dayCount = state.dayKey === today ? (state.dayCount ?? 0) : 0;
        return {
          enabled: state.enabled,
          maxPerDay: state.maxPerDay,
          dayCount,
          hasProvider: deps.providers.hasImageGenerateProvider(),
        };
      }
      case "home.setMediaGenerateConfig": {
        const accountId = requireBoundAccount(method, caller, params);
        const patch: { enabled?: boolean; maxPerDay?: number } = {};
        if (typeof params.enabled === "boolean") patch.enabled = params.enabled;
        if (typeof params.maxPerDay === "number") patch.maxPerDay = params.maxPerDay;
        const next = await deps.turns.mediaGenerate.set(accountId, patch);
        return { ok: true, enabled: next.enabled, maxPerDay: next.maxPerDay };
      }

      /* ---- B10 skills ---- */
      case "home.listSkills": {
        const rows = await deps.skills.listSkills();
        return {
          skills: rows.map((s) => ({
            id: s.id,
            name: s.name,
            enabled: s.enabled,
            verified: s.verified,
          })),
        };
      }
      case "home.searchClawHubSkills": {
        try {
          const skills = await deps.skills.searchClawHub(
            params.query as string,
            typeof params.limit === "number" ? params.limit : undefined,
          );
          return { skills };
        } catch (err) {
          if (err instanceof SkillsError) {
            throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
          }
          throw err;
        }
      }
      case "home.installSkill": {
        try {
          return await deps.skills.installSkill({
            source: params.source as "path" | "clawhub" | "url",
            ref: params.ref as string,
          });
        } catch (err) {
          if (err instanceof SkillsError) {
            throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
          }
          throw err;
        }
      }
      case "home.verifySkill": {
        try {
          return await deps.skills.verifySkill(params.id as string);
        } catch (err) {
          if (err instanceof SkillsError) {
            throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
          }
          throw err;
        }
      }
      case "home.removeSkill": {
        try {
          await deps.skills.removeSkill(params.id as string);
          return { ok: true };
        } catch (err) {
          if (err instanceof SkillsError) {
            throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
          }
          throw err;
        }
      }

      /* ---- B11 artifacts ---- */
      case "home.listArtifacts": {
        const accountId = requireBoundAccount(method, caller, params);
        const sessionId =
          typeof params.sessionId === "string" && params.sessionId.length > 0
            ? params.sessionId
            : undefined;
        const artifacts = await deps.artifacts.listArtifacts(accountId, sessionId);
        return { artifacts };
      }
      case "home.listSandboxEntries": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const path =
            typeof params.path === "string" ? params.path : undefined;
          return await deps.artifacts.listSandboxEntries(accountId, path);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.getArtifactContent": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.artifacts.getContent(accountId, params.path as string);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.getArtifactUrl": {
        const accountId = requireBoundAccount(method, caller, params);
        return await deps.artifacts.mintUrl({
          accountId,
          path: params.path as string,
          ...(typeof params.ttlSec === "number" ? { ttlSec: params.ttlSec } : {}),
        });
      }

      default:
        // Methods owned by later stages — refuse cleanly rather than pretend.
        // Account-scoped methods that take accountId still need the binding gate.
        if (
          typeof params.accountId === "string" &&
          METHODS[method]?.scope === "account-scoped" &&
          caller.kind === "device"
        ) {
          requireBoundAccount(method, caller, params);
        }
        throw Object.assign(new Error(`method not implemented yet: ${method}`), {
          rpcError: makeError(
            TRANSPORT_CODE_BAD_PARAMS,
            "version_too_low",
            `${method} not implemented in this build stage`,
          ),
        });
    }
  };
}

async function syncWorkflowSchedules(deps: RouterDeps): Promise<void> {
  for (const a of await deps.accounts.list()) {
    const pol = await deps.turns.policy.get(a.accountId);
    await deps.schedules.watchAccount(a.accountId, {
      reviewEnabled: pol.reviewEnabled,
    });
    const defs = deps.workflows.mergedForAccount(a.accountId);
    await deps.schedules.syncWorkflowSchedules(
      a.accountId,
      deps.workflows.scheduleSyncRows(defs),
    );
  }
}

/** Test helper: run a method as if over RPC and return a HomeResponse-shaped object. */
export async function dispatchForTest(
  deps: RouterDeps,
  method: string,
  params: Record<string, unknown> = {},
  session?: HomeSession,
): Promise<HomeResponse> {
  const id: RpcId = 1;
  try {
    const result = await createDispatcher(deps)(method, params, session);
    return makeResult(id, result);
  } catch (err) {
    const rpcError = (err as { rpcError?: Extract<HomeResponse, { error: unknown }>["error"] })
      .rpcError;
    if (rpcError) return { id, error: rpcError };
    throw err;
  }
}
