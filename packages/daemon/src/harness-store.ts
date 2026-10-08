// Per-machine harness selection + confirm flags (Design §6.3).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  canEnableHarness,
  catalogEntry,
  harnessKey,
  resolveHarnessId,
  type HarnessSelectionState,
} from "@envoyhome/harness-host";
import type { HomePaths } from "./home-paths.js";

export class HarnessStore {
  private state: HarnessSelectionState = { selections: {}, confirmed: [] };
  private readonly statePath: string;

  constructor(paths: HomePaths) {
    this.statePath = join(paths.stateDir, "harness-selection.json");
  }

  async load(): Promise<void> {
    try {
      this.state = JSON.parse(await readFile(this.statePath, "utf8")) as HarnessSelectionState;
    } catch {
      this.state = { selections: {}, confirmed: [] };
    }
  }

  resolve(accountId: string, agentId: string): string {
    return resolveHarnessId(this.state, accountId, agentId);
  }

  async setHarness(input: {
    accountId?: string;
    agentId?: string;
    harnessId: string;
    confirm?: boolean;
  }): Promise<void> {
    const manifest = catalogEntry(input.harnessId);
    if (!manifest) {
      throw Object.assign(new Error(`envoyhome.bad_params: unknown harness ${input.harnessId}`), {
        code: "bad_params",
      });
    }
    const gate = canEnableHarness(manifest, this.state, input.confirm);
    if (!gate.ok) {
      throw Object.assign(new Error(gate.reason), { code: "harness_confirm_required" });
    }
    if (input.confirm === true && !manifest.builtin && !this.state.confirmed.includes(manifest.id)) {
      this.state.confirmed.push(manifest.id);
    }
    const accountId = input.accountId ?? "default";
    const agentId = input.agentId ?? "default";
    this.state.selections[harnessKey(accountId, agentId)] = input.harnessId;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}
