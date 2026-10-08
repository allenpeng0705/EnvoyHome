// Doctor loader — mesh, state, channels, migrate plan (Plan B13).

import { collectMeshDoctorIssues } from "../doctor-mesh.js";
import type { DaemonConfig } from "../config.js";
import type { AccountStore } from "../accounts.js";
import type { BindingStore } from "../bindings.js";
import type { ChannelService } from "../channels/service.js";
import type { ObjectRegistry } from "../object-registry.js";
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
}

export async function collectDoctorIssues(
  deps: {
    config: DaemonConfig;
    accounts: AccountStore;
    bindings: BindingStore;
    channels: ChannelService;
  },
  options: CollectDoctorOptions = {},
): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [];

  issues.push(
    ...collectMeshDoctorIssues({
      dualModeNotes: options.dualModeNotes ?? [],
      ...(options.env !== undefined ? { env: options.env } : {}),
      ...(options.production !== undefined ? { production: options.production } : {}),
    }),
  );

  const schema = doctorStateSchemaIssue(deps.config);
  if (schema) issues.push(schema);

  const accountIds = new Set((await deps.accounts.list()).map((a) => a.accountId));
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

  return issues;
}
