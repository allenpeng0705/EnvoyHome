// Static workflow catalogue — Design §7 / Plan B9.

import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  mergeWorkflows,
  parseWorkflowFile,
  workflowToYaml,
  type WorkflowDef,
} from "@envoyhome/workflows";
import type { HomePaths } from "./home-paths.js";

export interface WorkflowSummary {
  id: string;
  source: "global" | "account";
  accountId?: string;
}

export class WorkflowStore {
  private global: WorkflowDef[] = [];
  private overlayByAccount = new Map<string, WorkflowDef[]>();
  private rawByKey = new Map<string, string>();

  constructor(private readonly paths: HomePaths) {}

  private key(source: "global" | "account", id: string, accountId?: string): string {
    return source === "global" ? `g:${id}` : `a:${accountId}:${id}`;
  }

  async reload(): Promise<number> {
    this.global = [];
    this.overlayByAccount.clear();
    this.rawByKey.clear();

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
      const text = await readFile(join(dir, name), "utf8");
      const def = parseWorkflowFile(name, text);
      defs.push(def);
      this.rawByKey.set(this.key(source, def.id, accountId), text.trimEnd());
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
      byId.set(w.id, { id: w.id, source: "global" });
    }
    if (accountId) {
      for (const w of this.overlayByAccount.get(accountId) ?? []) {
        byId.set(w.id, { id: w.id, source: "account", accountId });
      }
    } else {
      for (const [acct, rows] of this.overlayByAccount) {
        for (const w of rows) {
          if (!byId.has(w.id)) {
            byId.set(w.id, { id: w.id, source: "account", accountId: acct });
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

  /** Convenience when only merged defs are needed (matcher). */
  async ensureLoaded(): Promise<void> {
    if (this.global.length === 0 && this.overlayByAccount.size === 0) {
      await this.reload();
    }
  }
}
