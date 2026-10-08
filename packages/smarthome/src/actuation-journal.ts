// Actuation journal — write intent BEFORE dispatch; reconcile, never blind-retry (§5.7.7).

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ActuationOutcome = "pending" | "confirmed" | "failed" | "unconfirmed";

export interface ActuationRecord {
  actuationId: string;
  accountId: string;
  objectId: string;
  desiredState: string;
  risk: "admin";
  origin: "attended" | "unattended";
  dispatchedAt: string;
  outcome: ActuationOutcome;
  stateChanged: boolean;
  idempotent: boolean;
  service: string;
}

export class ActuationJournal {
  constructor(private readonly dirForAccount: (accountId: string) => string) {}

  private dir(accountId: string): string {
    return this.dirForAccount(accountId);
  }

  /** Intent record before dispatch. */
  async begin(input: Omit<ActuationRecord, "actuationId" | "dispatchedAt" | "outcome" | "stateChanged">): Promise<ActuationRecord> {
    if (!input.idempotent && input.origin === "unattended") {
      throw Object.assign(
        new Error("envoyhome.actuation_non_idempotent: refused unattended"),
        { code: "actuation_non_idempotent" },
      );
    }
    const row: ActuationRecord = {
      ...input,
      actuationId: randomUUID(),
      dispatchedAt: new Date().toISOString(),
      outcome: "pending",
      stateChanged: false,
    };
    const dir = this.dir(row.accountId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${row.actuationId}.json`);
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(row, null, 2), "utf8");
    await rename(tmp, path);
    return row;
  }

  async complete(
    accountId: string,
    actuationId: string,
    outcome: Exclude<ActuationOutcome, "pending">,
    stateChanged: boolean,
  ): Promise<void> {
    const path = join(this.dir(accountId), `${actuationId}.json`);
    const row = JSON.parse(await readFile(path, "utf8")) as ActuationRecord;
    row.outcome = outcome;
    row.stateChanged = stateChanged;
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(row, null, 2), "utf8");
    await rename(tmp, path);
  }

  /** On restart: pending → unconfirmed; never re-issue. */
  async reconcile(accountId: string): Promise<ActuationRecord[]> {
    const dir = this.dir(accountId);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const touched: ActuationRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const path = join(dir, name);
      const row = JSON.parse(await readFile(path, "utf8")) as ActuationRecord;
      if (row.outcome === "pending") {
        row.outcome = "unconfirmed";
        const tmp = `${path}.tmp`;
        await writeFile(tmp, JSON.stringify(row, null, 2), "utf8");
        await rename(tmp, path);
        touched.push(row);
      }
    }
    return touched;
  }

  async list(accountId: string): Promise<ActuationRecord[]> {
    const dir = this.dir(accountId);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const out: ActuationRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      out.push(JSON.parse(await readFile(join(dir, name), "utf8")) as ActuationRecord);
    }
    return out;
  }
}
