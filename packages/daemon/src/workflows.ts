// Static workflow catalogue — Design §7 / Plan B9 (DAG + linear compat).

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  mergeWorkflows,
  parseWorkflowFile,
  validateWorkflowYaml,
  workflowCanActuate,
  workflowToYaml,
  type WorkflowDef,
} from "@envoyhome/workflows";
import type { HomePaths } from "./home-paths.js";
import { assertWorkflowToolsKnown } from "./workflow-tools.js";

/** Rows for ScheduleService sync — enabled class-B only. */
export function scheduleSyncRows(
  defs: readonly WorkflowDef[],
): Array<{ id: string; schedule: string; canActuate: boolean }> {
  return defs
    .filter((w) => w.enabled !== false && typeof w.match.schedule === "string")
    .map((w) => ({
      id: w.id,
      schedule: w.match.schedule as string,
      canActuate: workflowCanActuate(w),
    }));
}

export interface WorkflowSummary {
  id: string;
  source: "global" | "account";
  accountId?: string;
  enabled: boolean;
}

function safeWorkflowFileId(id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) {
    throw Object.assign(new Error("envoyhome.bad_params: invalid workflow id"), {
      code: "bad_params",
    });
  }
  return id;
}

export class WorkflowStore {
  private global: WorkflowDef[] = [];
  private overlayByAccount = new Map<string, WorkflowDef[]>();
  private rawByKey = new Map<string, string>();
  /** Absolute path of the file that owns each key. */
  private pathByKey = new Map<string, string>();

  constructor(private readonly paths: HomePaths) {}

  private key(source: "global" | "account", id: string, accountId?: string): string {
    return source === "global" ? `g:${id}` : `a:${accountId}:${id}`;
  }

  async reload(): Promise<number> {
    this.global = [];
    this.overlayByAccount.clear();
    this.rawByKey.clear();
    this.pathByKey.clear();

    await mkdir(this.paths.workflowsDir, { recursive: true });
    this.global = await this.scanDir(this.paths.workflowsDir, "global");

    let count = this.global.length;
    let accountNames: string[];
    try {
      accountNames = await readdir(this.paths.accountsDir);
    } catch {
      return count;
    }
    for (const accountId of accountNames) {
      const dir = this.paths.accountWorkflowsDir(accountId);
      const overlay = await this.scanDir(dir, "account", accountId);
      if (overlay.length > 0) {
        this.overlayByAccount.set(accountId, overlay);
        count += overlay.length;
      }
    }
    return count;
  }

  private async scanDir(
    dir: string,
    source: "global" | "account",
    accountId?: string,
  ): Promise<WorkflowDef[]> {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const defs: WorkflowDef[] = [];
    for (const name of names) {
      if (!name.endsWith(".json") && !name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
      const filePath = join(dir, name);
      const text = await readFile(filePath, "utf8");
      const def = parseWorkflowFile(name, text);
      defs.push(def);
      const k = this.key(source, def.id, accountId);
      this.rawByKey.set(k, text.trimEnd());
      this.pathByKey.set(k, filePath);
    }
    return defs;
  }

  mergedForAccount(accountId: string): WorkflowDef[] {
    const overlay = this.overlayByAccount.get(accountId) ?? [];
    return mergeWorkflows(this.global, overlay);
  }

  list(accountId?: string): WorkflowSummary[] {
    const out: WorkflowSummary[] = [];
    const byId = new Map<string, WorkflowSummary>();
    for (const w of this.global) {
      byId.set(w.id, { id: w.id, source: "global", enabled: w.enabled !== false });
    }
    if (accountId) {
      for (const w of this.overlayByAccount.get(accountId) ?? []) {
        byId.set(w.id, {
          id: w.id,
          source: "account",
          accountId,
          enabled: w.enabled !== false,
        });
      }
    } else {
      for (const [acct, rows] of this.overlayByAccount) {
        for (const w of rows) {
          if (!byId.has(w.id)) {
            byId.set(w.id, {
              id: w.id,
              source: "account",
              accountId: acct,
              enabled: w.enabled !== false,
            });
          }
        }
      }
    }
    for (const v of byId.values()) out.push(v);
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  getWorkflow(id: string, accountId?: string): { id: string; yaml: string } | null {
    if (accountId) {
      const overlay = this.overlayByAccount.get(accountId)?.find((w) => w.id === id);
      if (overlay) {
        const raw = this.rawByKey.get(this.key("account", id, accountId));
        return { id, yaml: raw ?? workflowToYaml(overlay) };
      }
    }
    const global = this.global.find((w) => w.id === id);
    if (global) {
      const raw = this.rawByKey.get(this.key("global", id));
      return { id, yaml: raw ?? workflowToYaml(global) };
    }
    return null;
  }

  getDef(id: string, accountId?: string): WorkflowDef | null {
    if (accountId) {
      const overlay = this.overlayByAccount.get(accountId)?.find((w) => w.id === id);
      if (overlay) return overlay;
    }
    return this.global.find((w) => w.id === id) ?? null;
  }

  validate(
    yaml: string,
    knownTools?: Set<string>,
  ): { ok: true; id: string } | { ok: false; error: string } {
    const result = validateWorkflowYaml(yaml);
    if (!result.ok || !result.id || !result.def) {
      return { ok: false, error: result.error ?? "workflow.invalid" };
    }
    if (knownTools) {
      try {
        assertWorkflowToolsKnown(result.def, knownTools);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    return { ok: true, id: result.id };
  }

  async put(
    yaml: string,
    accountId?: string,
    knownTools?: Set<string>,
  ): Promise<{ id: string }> {
    const checked = validateWorkflowYaml(yaml);
    if (!checked.ok || !checked.def || !checked.id) {
      throw Object.assign(new Error(checked.error ?? "workflow.invalid"), {
        code: "bad_params",
      });
    }
    if (knownTools) {
      assertWorkflowToolsKnown(checked.def, knownTools);
    }
    const id = safeWorkflowFileId(checked.id);
    const dir = accountId
      ? this.paths.accountWorkflowsDir(accountId)
      : this.paths.workflowsDir;
    await mkdir(dir, { recursive: true });
    const source: "global" | "account" = accountId ? "account" : "global";
    const k = this.key(source, id, accountId);
    const existingPath = this.pathByKey.get(k);
    const filePath = existingPath ?? join(dir, `${id}.yml`);
    const body = yaml.trimEnd() + "\n";
    await writeFile(filePath, body, "utf8");
    await this.reload();
    return { id };
  }

  async remove(id: string, accountId?: string): Promise<void> {
    safeWorkflowFileId(id);
    const source: "global" | "account" = accountId ? "account" : "global";
    const k = this.key(source, id, accountId);
    const filePath = this.pathByKey.get(k);
    if (!filePath) {
      // Fall back: try conventional names if not yet indexed.
      const dir = accountId
        ? this.paths.accountWorkflowsDir(accountId)
        : this.paths.workflowsDir;
      for (const ext of [".yml", ".yaml", ".json"]) {
        try {
          await unlink(join(dir, `${id}${ext}`));
          await this.reload();
          return;
        } catch {
          // try next
        }
      }
      throw Object.assign(new Error("envoyhome.bad_params: unknown workflow"), {
        code: "bad_params",
      });
    }
    await unlink(filePath);
    await this.reload();
  }

  async setEnabled(id: string, enabled: boolean, accountId?: string): Promise<WorkflowDef> {
    safeWorkflowFileId(id);
    const existing = this.getWorkflow(id, accountId);
    if (!existing) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown workflow"), {
        code: "bad_params",
      });
    }
    const checked = validateWorkflowYaml(existing.yaml);
    if (!checked.ok || !checked.def) {
      throw Object.assign(new Error(checked.error ?? "workflow.invalid"), {
        code: "bad_params",
      });
    }
    const next = { ...checked.def, enabled };
    const yaml = workflowToYaml(next);
    await this.put(yaml, accountId);
    return next;
  }

  /** Enabled schedule workflows only — disabled must drop out of the clock. */
  scheduleSyncRows(defs: readonly WorkflowDef[]) {
    return scheduleSyncRows(defs);
  }

  /** Convenience when only merged defs are needed (matcher). */
  async ensureLoaded(): Promise<void> {
    if (this.global.length === 0 && this.overlayByAccount.size === 0) {
      await this.reload();
    }
  }
}
