// Doctor loader — mesh, state, channels, migrate plan (Plan B13).

import { collectMeshDoctorIssues } from "../doctor-mesh.js";
import type { DaemonConfig } from "../config.js";
import type { AccountStore } from "../accounts.js";
import type { BindingStore } from "../bindings.js";
import type { ChannelService } from "../channels/service.js";
import type { ObjectRegistry } from "../object-registry.js";
import type { WebSearchService } from "../web-search.js";
import type { BrowserControlService } from "../browser-control.js";
import { isFilesystemRoot } from "../fs-jail.js";
import type { DoctorIssue } from "./issues.js";
import { doctorStateSchemaIssue } from "./migrations.js";
import { doctorHomeClawPlanIssue, planHomeClawMigrate } from "./homeclaw-import.js";

export type { DoctorIssue, DoctorSeverity } from "./issues.js";
export { DOCTOR_MIGRATE_HOMECLAW_PLAN_ID } from "./issues.js";
export { applyDoctorFixes, type DoctorFixDiff, type DoctorFixResult } from "./fixes.js";
export { planHomeClawMigrate, type HomeClawMigratePlan } from "./homeclaw-import.js";

export interface CollectDoctorOptions {
  env?: NodeJS.ProcessEnv;
  production?: boolean;
  dualModeNotes?: string[];
  homeClawRoot?: string;
  importChat?: boolean;
  /** Live mesh status for hosting-failed probe. */
  meshStatus?: import("../mesh-host.js").MeshStatus;
  /** Current household Owner (Design §4.1.1). */
  ownerAccountId?: string | null;
}

export async function collectDoctorIssues(
  deps: {
    config: DaemonConfig;
    accounts: AccountStore;
    bindings: BindingStore;
    channels: ChannelService;
    /** Design §9.5f.1 — warn when browser fallback on but Chromium missing. */
    webSearch?: WebSearchService | null;
    /** Design §9.5g — warn when browser control on but Chromium missing. */
    browserControl?: BrowserControlService | null;
    /** Design §7.4 accuracy — late-fire + TZ signals. */
    schedules?: {
      store: {
        listReceipts: (accountId: string) => Promise<Array<{ latenessMs?: number }>>;
      };
    } | null;
    /** Design §19.10 / V-P2-AMB-3 — heartbeat interval floor. */
    policy?: {
      get: (accountId: string) => Promise<{
        heartbeatEnabled: boolean;
        heartbeatEveryMs: number;
      }>;
    } | null;
    /** Design §19.12 D2 — Owner media-generate gate. */
    mediaGenerate?: {
      get: (accountId: string) => Promise<{ enabled: boolean }>;
    } | null;
    /** True when an OpenAI-compat provider with secret exists. */
    hasImageGenerateProvider?: () => boolean;
  },
  options: CollectDoctorOptions = {},
): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [];

  issues.push(
    ...collectMeshDoctorIssues({
      dualModeNotes: options.dualModeNotes ?? [],
      meshHostingEnabled: deps.config.meshHostingEnabled,
      ...(options.meshStatus !== undefined ? { meshStatus: options.meshStatus } : {}),
      ...(options.env !== undefined ? { env: options.env } : {}),
      ...(options.production !== undefined ? { production: options.production } : {}),
    }),
  );

  const schema = doctorStateSchemaIssue(deps.config);
  if (schema) issues.push(schema);

  const accountRows = await deps.accounts.list();
  const accountIds = new Set(accountRows.map((a) => a.accountId));
  const ownerAccountId =
    options.ownerAccountId !== undefined ? options.ownerAccountId : null;

  if (accountRows.length > 0 && !ownerAccountId) {
    issues.push({
      id: "household.owner_missing",
      severity: "error",
      message: "accounts exist but household Owner is unset",
      fixable: true,
    });
  } else if (
    ownerAccountId &&
    accountRows.length > 0 &&
    !accountIds.has(ownerAccountId)
  ) {
    issues.push({
      id: "household.owner_missing",
      severity: "error",
      message: `household Owner ${ownerAccountId} is not a known account`,
      fixable: true,
    });
  }

  if (ownerAccountId) {
    const violations = await deps.bindings.listOwnerExclusiveViolations(ownerAccountId);
    if (violations.length > 0) {
      issues.push({
        id: "household.owner_bind_exclusive",
        severity: "error",
        message: `${violations.length} device(s) bind Owner with other seats (Design §4.1.1 R2)`,
        fixable: true,
      });
    }
    const staleRootIds: string[] = [];
    for (const a of accountRows) {
      if (a.accountId === ownerAccountId) continue;
      const mounts = await deps.accounts.getWorkspaceMounts(a.accountId);
      if (mounts.some((m) => isFilesystemRoot(m.hostPath))) {
        staleRootIds.push(a.accountId);
      }
    }
    if (staleRootIds.length > 0) {
      issues.push({
        id: "household.workspace_root_non_owner",
        severity: "error",
        message: `filesystem-root workspace on non-Owner seat(s): ${staleRootIds.join(", ")}`,
        fixable: true,
      });
    }
  }

  for (const binding of await deps.bindings.list({})) {
    if (binding.accountId && !accountIds.has(binding.accountId)) {
      issues.push({
        id: "accounts.binding_orphan",
        severity: "warn",
        message: `binding ${binding.bindingId} references missing account ${binding.accountId}`,
        fixable: false,
      });
    }
  }

  const objects: ObjectRegistry = deps.channels.objects;
  const stale = await objects.list({ bound: false });
  if (stale.length > 50) {
    issues.push({
      id: "smarthome.unbound_cap",
      severity: "warn",
      message: `${stale.length} unbound objects exceed the 50-entry cap`,
      fixable: false,
    });
  }

  const plan = await planHomeClawMigrate({
    targetStateDir: deps.config.stateDir,
    ...(options.homeClawRoot !== undefined ? { homeClawRoot: options.homeClawRoot } : {}),
    ...(options.importChat !== undefined ? { importChat: options.importChat } : {}),
  });
  if (plan) {
    issues.push(doctorHomeClawPlanIssue(plan));
  }

  if (deps.webSearch) {
    const ws = await deps.webSearch.getPublicConfig();
    if (ws.fallback === "browser" && ws.browserRuntime === "missing") {
      issues.push({
        id: "websearch.browser_runtime_missing",
        severity: "warn",
        message: `web_search browser fallback is on but Chromium is missing on the daemon host — run: ${ws.browserInstallHint}`,
        fixable: false,
      });
    }
  }

  if (deps.browserControl) {
    const bc = await deps.browserControl.getPublicConfig();
    // Warn only when managed Chromium is needed (default managed, or personal/remote
    // not the sole ready path).
    const needsManaged =
      bc.enabled &&
      (bc.defaultProfile === "managed" ||
        (!bc.personalReady && !bc.remoteReady));
    if (needsManaged && bc.browserRuntime === "missing") {
      issues.push({
        id: "browser.runtime_missing",
        severity: "warn",
        message: `browser control needs managed Chromium on the daemon host — run: ${bc.browserInstallHint}`,
        fixable: false,
      });
    }
  }

  const missingTz = accountRows.filter((a) => !a.timeZone).map((a) => a.accountId);
  if (missingTz.length > 0) {
    issues.push({
      id: "accounts.timezone_unset",
      severity: "warn",
      message: `${missingTz.length} profile(s) lack IANA timeZone — schedule wall times use host default until set (System → Profiles)`,
      fixable: false,
    });
  }

  if (deps.schedules) {
    const LATE_MS = 5 * 60_000;
    let lateCount = 0;
    for (const a of accountRows) {
      const receipts = await deps.schedules.store.listReceipts(a.accountId);
      const recent = receipts.slice(-20);
      lateCount += recent.filter((r) => (r.latenessMs ?? 0) >= LATE_MS).length;
    }
    if (lateCount > 0) {
      issues.push({
        id: "schedule.late_fire",
        severity: "warn",
        message: `${lateCount} recent schedule fire(s) ran ≥5 minutes late — check daemon uptime / host clock`,
        fixable: false,
      });
    }
  }

  // Design §19.10 / V-P2-AMB-3 — warn when enabled heartbeat is below household floor.
  if (deps.policy) {
    const { MIN_HEARTBEAT_INTERVAL_MS } = await import("../schedule/heartbeat.js");
    const under: string[] = [];
    for (const a of accountRows) {
      const pol = await deps.policy.get(a.accountId);
      if (pol.heartbeatEnabled && pol.heartbeatEveryMs < MIN_HEARTBEAT_INTERVAL_MS) {
        under.push(a.accountId);
      }
    }
    if (under.length > 0) {
      issues.push({
        id: "schedule.heartbeat_interval_low",
        severity: "warn",
        message: `heartbeat interval below household minimum (${MIN_HEARTBEAT_INTERVAL_MS}ms) for: ${under.join(", ")}`,
        fixable: false,
      });
    }
  }

  // Design §19.12 D2 / V-P2-MEDIA-2 — enabled generate without a provider is a dead switch.
  if (deps.mediaGenerate && deps.hasImageGenerateProvider) {
    const enabledWithoutProvider: string[] = [];
    if (!deps.hasImageGenerateProvider()) {
      for (const a of accountRows) {
        const mg = await deps.mediaGenerate.get(a.accountId);
        if (mg.enabled) enabledWithoutProvider.push(a.accountId);
      }
    }
    if (enabledWithoutProvider.length > 0) {
      issues.push({
        id: "media.generate_no_provider",
        severity: "warn",
        message: `image_generate enabled but no OpenAI-compat provider with secret for: ${enabledWithoutProvider.join(", ")}`,
        fixable: false,
      });
    }
  }

  return issues;
}
