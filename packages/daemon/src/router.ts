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
import type { MeshStatus } from "./mesh-host.js";
import { collectDoctorIssues, applyDoctorFixes } from "./doctor/index.js";
import {
  ObjectRegistryError,
  wireSourceRecord,
} from "./object-registry.js";
import type { ActuationService } from "./actuation-service.js";
import { MemoryError, type MemoryFacade } from "@envoyhome/memory";
import { ChannelError, type ChannelService } from "./channels/service.js";
import { HARNESS_CATALOG, DEFAULT_HARNESS_ID } from "@envoyhome/harness-host";
import type { TurnService } from "./turn-service.js";
import type { ProviderStore } from "./providers-store.js";
import type { HarnessStore } from "./harness-store.js";
import { SkillsError, type SkillService } from "./skills.js";
import type { WorkflowStore } from "./workflows.js";
import type { ArtifactService } from "./artifacts.js";

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
  skills: SkillService;
  artifacts: ArtifactService;
  /** B14 actuation journal (owner-scope reads). */
  actuations: ActuationService;
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
): { error: ReturnType<typeof makeError> } | null {
  const scope = scopeOf(method);
  if (!scope) return null;
  const caller = session?.caller;
  // Missing session ⇒ loopback (reuse-host localScopeKey path).
  if (!caller) return null;

  if (scope === "loopback-owner" && caller.kind !== "loopback-owner") {
    return scopeDenied(method, `${method} requires loopback-owner`);
  }
  if (scope === "owner-scope" && caller.kind !== "loopback-owner" && !caller.ownerTrusted) {
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

function mapStoreError(err: unknown): never {
  if (err instanceof MemoryError) {
    if (err.code === "cross_account") {
      throwRpc(TRANSPORT_CODE_UNAUTHORIZED, "auth", err.message);
    }
    throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
  }
  if (err instanceof AccountError || err instanceof BindingError || err instanceof PairingError) {
    if (err.kind === "auth" || err.kind === "pairing_app_mismatch") {
      const detail = err.message.replace(/^envoyhome\.[a-z_]+:\s*/, "");
      throwRpc(
        TRANSPORT_CODE_UNAUTHORIZED,
        err.kind === "pairing_app_mismatch"
          ? "pairing_app_mismatch"
          : err.message.includes("account_not_bound")
            ? "account_not_bound"
            : "auth",
        detail,
      );
    }
    if (err.kind === "rate_limited") {
      throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
    }
    throwRpc(TRANSPORT_CODE_BAD_PARAMS, "bad_params", err.message);
  }
  throw err;
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
}): { accountId: string; displayName: string; createdAt: string } {
  return {
    accountId: rec.accountId,
    displayName: rec.displayName,
    createdAt: rec.createdAt,
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

    const scopeErr = assertScope(method, session);
    if (scopeErr) {
      throw Object.assign(new Error(scopeErr.error.message), { rpcError: scopeErr.error });
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
        return {
          product: PRODUCT_NAME,
          version: deps.packageVersion,
          protocolApiVersion: PROTOCOL_API_VERSION,
          instanceId: deps.config.instanceId,
          home: { label: deps.config.label, stateDir: deps.config.stateDir },
          startedAt: deps.startedAt.toISOString(),
          methods: methodNames(),
          mesh,
          notes: [] as string[],
        };
      }
      case "home.health": {
        const uptimeSec = Math.floor((Date.now() - deps.startedAt.getTime()) / 1000);
        return {
          ok: true,
          uptimeSec,
          connections: deps.connections(),
          activeTurns: deps.activeTurns(),
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
      case "home.getServiceStatus":
        return { installed: false, running: false, manager: "none" as const };

      /* ---- B3 accounts & bindings (Design A.3) ---- */
      case "home.listAccounts": {
        const accounts = await deps.accounts.list();
        return { accounts: accounts.map(wireAccount) };
      }
      case "home.createAccount": {
        try {
          const input: { displayName: string; accountId?: string; locale?: string } = {
            displayName: params.displayName as string,
          };
          if (typeof params.accountId === "string") input.accountId = params.accountId;
          if (typeof params.locale === "string") input.locale = params.locale;
          const account = await deps.accounts.create(input);
          return { account: wireAccount(account) };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.updateAccount": {
        try {
          const input: {
            accountId: string;
            displayName?: string;
            locale?: string;
            toolPolicy?: "standard" | "restricted";
          } = { accountId: params.accountId as string };
          if (typeof params.displayName === "string") input.displayName = params.displayName;
          if (typeof params.locale === "string") input.locale = params.locale;
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
      case "home.listBindings": {
        try {
          const filter: { accountId?: string; deviceId?: string } = {};
          if (typeof params.accountId === "string") filter.accountId = params.accountId;
          if (typeof params.deviceId === "string") filter.deviceId = params.deviceId;
          const bindings = await deps.bindings.list(filter);
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
          const input: {
            deviceLabel: string;
            host: string;
            lanHost: string;
            wsPort: number;
            accountIds?: string[];
            token?: string;
            fresh?: boolean;
          } = {
            deviceLabel: params.deviceLabel as string,
            host: params.host as string,
            lanHost: params.lanHost as string,
            wsPort: deps.config.wsPort,
          };
          if (Array.isArray(params.accountIds)) {
            input.accountIds = (params.accountIds as unknown[]).filter(
              (x): x is string => typeof x === "string",
            );
            for (const accountId of input.accountIds) {
              if (!(await deps.accounts.get(accountId))) {
                throw new PairingError("bad_params", `unknown account: ${accountId}`);
              }
            }
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
          const device = await deps.pairing.setDeviceAccounts(
            params.deviceId as string,
            accountIds,
          );
          return { ok: true, device };
        } catch (err) {
          mapStoreError(err);
        }
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
            trust: caller.kind === "loopback-owner" || caller.ownerTrusted ? "owner" : "agent",
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.listMemory": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          const listed = await deps.memory.listMemory(accountId, {
            includeContent: params.includeContent === true,
          });
          // Wire schema (A.9) — strip non-schema extras.
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
            caller.kind === "loopback-owner" || caller.ownerTrusted ? "owner" : "agent";
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
        return deps.channels.getChannelStatus(id, callerAccount, params.all === true);
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

      /* ---- B6 chat / turns ---- */
      case "home.openSession": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.turns.openSession({
            accountId,
            ...(typeof params.agentId === "string" ? { agentId: params.agentId } : {}),
            ...(typeof params.title === "string" ? { title: params.title } : {}),
            ...(typeof params.channel === "string" ? { channel: params.channel } : {}),
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.sendMessage": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.turns.sendMessage({
            accountId,
            sessionId: params.sessionId as string,
            text: params.text as string,
            callerKind: caller.kind,
            ...(typeof params.clientTurnId === "string"
              ? { clientTurnId: params.clientTurnId }
              : {}),
          });
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.listSessions": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          return await deps.turns.listSessions(accountId);
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
      case "home.listGrants": {
        try {
          if (caller.kind !== "loopback-owner" && !caller.ownerTrusted) {
            throw Object.assign(new Error("home.listGrants requires owner-scope"), {
              rpcError: makeError(
                TRANSPORT_CODE_UNAUTHORIZED,
                "auth",
                "home.listGrants requires owner-scope",
              ),
            });
          }
          const accountId =
            typeof params.accountId === "string" && params.accountId.length > 0
              ? params.accountId
              : undefined;
          return await deps.turns.listGrants(accountId);
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.revokeGrant": {
        try {
          if (caller.kind !== "loopback-owner" && !caller.ownerTrusted) {
            throw Object.assign(new Error("home.revokeGrant requires owner-scope"), {
              rpcError: makeError(
                TRANSPORT_CODE_UNAUTHORIZED,
                "auth",
                "home.revokeGrant requires owner-scope",
              ),
            });
          }
          await deps.turns.revokeGrant(params.id as string);
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
          if (caller.kind !== "loopback-owner" && !caller.ownerTrusted) {
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
            kind: params.kind as "local_llama_cpp" | "local_openai_compat" | "cloud_openai_compat",
            ...(typeof params.baseUrl === "string" ? { baseUrl: params.baseUrl } : {}),
            ...(typeof params.model === "string" ? { model: params.model } : {}),
            ...(typeof params.enabled === "boolean" ? { enabled: params.enabled } : {}),
          });
          return { provider: { id: rec.id, kind: rec.kind, healthy: rec.enabled } };
        } catch (err) {
          mapStoreError(err);
        }
      }
      case "home.removeProvider": {
        try {
          if (caller.kind !== "loopback-owner" && !caller.ownerTrusted) {
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
          if (caller.kind !== "loopback-owner" && !caller.ownerTrusted) {
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
      case "home.setModelMode": {
        try {
          const accountId = requireBoundAccount(method, caller, params);
          await deps.providers.setMode(accountId, params.mode as "local" | "cloud" | "mix");
          return { ok: true };
        } catch (err) {
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
          if (caller.kind !== "loopback-owner" && !caller.ownerTrusted) {
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
          },
          {
            dualModeNotes: deps.meshDualModeNotes?.() ?? [],
            ...(typeof params.homeClawRoot === "string"
              ? { homeClawRoot: params.homeClawRoot }
              : {}),
            ...(params.importChat === true ? { importChat: true } : {}),
          },
        );
        return { ok: issues.every((i) => i.severity !== "error"), issues };
      }
      case "home.doctorFix": {
        if (caller.kind !== "loopback-owner" && !caller.ownerTrusted) {
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
        const issues = await collectDoctorIssues({
          config: deps.config,
          accounts: deps.accounts,
          bindings: deps.bindings,
          channels: deps.channels,
        });
        const result = await applyDoctorFixes({
          issueIds,
          issues,
          stateDir: deps.config.stateDir,
          config: deps.config,
        });
        return { fixed: result.fixed, failed: result.failed, diffs: result.diffs };
      }

      case "home.listSources": {
        const filterAccount =
          caller.kind === "loopback-owner" || caller.ownerTrusted
            ? typeof params.accountId === "string"
              ? params.accountId
              : undefined
            : requireBoundAccount(method, caller, params);
        const all = await deps.channels.objects.list({
          ...(typeof params.channel === "string" ? { channel: params.channel } : {}),
          ...(params.bound === true ? { bound: true } : {}),
          ...(params.bound === false ? { bound: false } : {}),
        });
        let sources = all;
        if (filterAccount) {
          sources = all.filter(
            (o) =>
              o.accountId === filterAccount ||
              (o.shared && o.accountId !== null && o.accountId !== filterAccount),
          );
        } else if (caller.kind === "device") {
          sources = all.filter(
            (o) =>
              (o.accountId !== null && caller.accountIds.includes(o.accountId)) ||
              (o.shared && o.accountId !== null),
          );
        }
        const unboundCapped = sources.filter((o) => !o.bound).length > 50;
        return {
          sources: sources.map(wireSourceRecord),
          unboundCapped,
        };
      }
      case "home.setSourceBinding": {
        if (caller.kind !== "loopback-owner" && !caller.ownerTrusted) {
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
        if (caller.kind !== "loopback-owner" && !caller.ownerTrusted) {
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
        if (caller.kind !== "loopback-owner" && !caller.ownerTrusted) {
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
        return { ok: true, count };
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
