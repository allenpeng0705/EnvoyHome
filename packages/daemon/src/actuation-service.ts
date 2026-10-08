// Actuation journal RPC wrapper — Design §5.7.7.

import { join } from "node:path";
import { ActuationJournal, type ActuationRecord } from "@envoyhome/smarthome";
import type { HomePaths } from "./home-paths.js";

export class ActuationService {
  readonly journal: ActuationJournal;

  constructor(paths: HomePaths) {
    this.journal = new ActuationJournal((accountId) =>
      join(paths.accountRoot(accountId), "actuations"),
    );
  }

  async list(
    accountId: string,
    filter: { objectId?: string; since?: string; limit?: number } = {},
  ): Promise<ActuationRecord[]> {
    let rows = await this.journal.list(accountId);
    if (filter.objectId) {
      rows = rows.filter((r: ActuationRecord) => r.objectId === filter.objectId);
    }
    if (filter.since) {
      const sinceMs = Date.parse(filter.since);
      rows = rows.filter((r: ActuationRecord) => Date.parse(r.dispatchedAt) >= sinceMs);
    }
    rows.sort(
      (a: ActuationRecord, b: ActuationRecord) =>
        Date.parse(b.dispatchedAt) - Date.parse(a.dispatchedAt),
    );
    const limit = filter.limit ?? 100;
    return rows.slice(0, limit);
  }

  async reconcileAll(accountIds: string[]): Promise<void> {
    for (const accountId of accountIds) {
      await this.journal.reconcile(accountId);
    }
  }
}
