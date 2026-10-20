// Durable schedule jobs under accounts/<id>/schedules.json

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HomePaths } from "../home-paths.js";
import {
  DISMISSED_PROPOSALS_CAP,
  type ScheduleDismissedProposal,
  type ScheduleJob,
  type ScheduleProposal,
  type ScheduleRunReceipt,
} from "./types.js";

interface AccountScheduleFile {
  jobs: ScheduleJob[];
  /** Recent receipts (capped). */
  receipts: ScheduleRunReceipt[];
  /** Unconfirmed NL proposals (survive restart until expiry / confirm). */
  proposals?: ScheduleProposal[];
  /** Canceled / expired proposals for History (capped). */
  dismissed?: ScheduleDismissedProposal[];
}

function toDismissed(
  p: ScheduleProposal,
  status: "canceled" | "expired",
  closedAt: string,
): ScheduleDismissedProposal {
  return {
    proposalId: p.proposalId,
    accountId: p.accountId,
    status,
    resolvedLocal: p.resolvedLocal,
    name: p.name,
    kind: p.spec.kind,
    closedAt,
    expiresAt: p.expiresAt,
    ...(p.payload.message ? { message: p.payload.message } : {}),
    ...(p.sourceText ? { sourceText: p.sourceText } : {}),
    ...(p.spec.timeZone ? { timeZone: p.spec.timeZone } : {}),
    ...(p.spec.cronExpr ? { cronExpr: p.spec.cronExpr } : {}),
    ...(typeof p.spec.everyMs === "number" ? { everyMs: p.spec.everyMs } : {}),
    ...(p.spec.whenInstant ? { whenInstant: p.spec.whenInstant } : {}),
    ...(p.sessionId ? { sessionId: p.sessionId } : {}),
  };
}

export class ScheduleStore {
  private byAccount = new Map<string, AccountScheduleFile>();
  private proposals = new Map<string, ScheduleProposal>();

  constructor(
    private readonly paths: HomePaths,
    /** Injectable clock so expiry sweeps follow ScheduleService.now (tests). */
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  private filePath(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "schedules.json");
  }

  async loadAccount(accountId: string, nowMs?: number): Promise<AccountScheduleFile> {
    const at = nowMs ?? this.nowMs();
    const cached = this.byAccount.get(accountId);
    if (cached) {
      if (this.sweepExpiredInFile(cached, at)) await this.persist(accountId);
      return cached;
    }
    try {
      const raw = JSON.parse(await readFile(this.filePath(accountId), "utf8")) as AccountScheduleFile;
      const file: AccountScheduleFile = {
        jobs: Array.isArray(raw.jobs) ? raw.jobs : [],
        receipts: Array.isArray(raw.receipts) ? raw.receipts : [],
        proposals: Array.isArray(raw.proposals) ? raw.proposals : [],
        dismissed: Array.isArray(raw.dismissed) ? raw.dismissed : [],
      };
      this.byAccount.set(accountId, file);
      this.hydrateProposals(file.proposals ?? [], at);
      if (this.sweepExpiredInFile(file, at)) await this.persist(accountId);
      return file;
    } catch {
      const empty: AccountScheduleFile = { jobs: [], receipts: [], proposals: [], dismissed: [] };
      this.byAccount.set(accountId, empty);
      return empty;
    }
  }

  private hydrateProposals(rows: ScheduleProposal[], nowMs: number): void {
    for (const p of rows) {
      if (new Date(p.expiresAt).getTime() < nowMs) continue;
      this.proposals.set(p.proposalId, p);
    }
  }

  private pushDismissed(file: AccountScheduleFile, row: ScheduleDismissedProposal): void {
    if (!file.dismissed) file.dismissed = [];
    const i = file.dismissed.findIndex((x) => x.proposalId === row.proposalId);
    if (i >= 0) file.dismissed[i] = row;
    else file.dismissed.push(row);
    if (file.dismissed.length > DISMISSED_PROPOSALS_CAP) {
      file.dismissed = file.dismissed.slice(-DISMISSED_PROPOSALS_CAP);
    }
  }

  /** Move live proposals past expiresAt into dismissed (status expired). */
  private sweepExpiredInFile(file: AccountScheduleFile, nowMs: number): boolean {
    const live = file.proposals ?? [];
    if (!live.length) return false;
    const keep: ScheduleProposal[] = [];
    let changed = false;
    const closedAt = new Date(nowMs).toISOString();
    for (const p of live) {
      if (new Date(p.expiresAt).getTime() < nowMs) {
        this.proposals.delete(p.proposalId);
        this.pushDismissed(file, toDismissed(p, "expired", closedAt));
        changed = true;
      } else {
        keep.push(p);
      }
    }
    if (!changed) return false;
    file.proposals = keep;
    return true;
  }

  async persist(accountId: string): Promise<void> {
    const file = this.byAccount.get(accountId);
    if (!file) return;
    await mkdir(this.paths.accountRoot(accountId), { recursive: true });
    await writeFile(this.filePath(accountId), JSON.stringify(file, null, 2), "utf8");
  }

  async listJobs(accountId: string): Promise<ScheduleJob[]> {
    const file = await this.loadAccount(accountId);
    return file.jobs.slice();
  }

  async listDismissed(accountId: string): Promise<ScheduleDismissedProposal[]> {
    const file = await this.loadAccount(accountId);
    return (file.dismissed ?? []).slice().reverse();
  }

  async getJob(accountId: string, jobId: string): Promise<ScheduleJob | undefined> {
    const file = await this.loadAccount(accountId);
    return file.jobs.find((j) => j.id === jobId);
  }

  async upsertJob(job: ScheduleJob): Promise<void> {
    const file = await this.loadAccount(job.accountId);
    const i = file.jobs.findIndex((j) => j.id === job.id);
    if (i >= 0) file.jobs[i] = job;
    else file.jobs.push(job);
    await this.persist(job.accountId);
  }

  async removeJob(accountId: string, jobId: string): Promise<boolean> {
    const file = await this.loadAccount(accountId);
    const before = file.jobs.length;
    file.jobs = file.jobs.filter((j) => j.id !== jobId);
    if (file.jobs.length === before) return false;
    await this.persist(accountId);
    return true;
  }

  async appendReceipt(receipt: ScheduleRunReceipt): Promise<void> {
    const file = await this.loadAccount(receipt.accountId);
    file.receipts.push(receipt);
    if (file.receipts.length > 200) file.receipts = file.receipts.slice(-200);
    await this.persist(receipt.accountId);
  }

  async listReceipts(accountId: string, jobId?: string): Promise<ScheduleRunReceipt[]> {
    const file = await this.loadAccount(accountId);
    if (!jobId) return file.receipts.slice();
    return file.receipts.filter((r) => r.jobId === jobId);
  }

  async putProposal(p: ScheduleProposal, nowMs?: number): Promise<void> {
    const at = nowMs ?? this.nowMs();
    this.proposals.set(p.proposalId, p);
    const file = await this.loadAccount(p.accountId, at);
    if (!file.proposals) file.proposals = [];
    const i = file.proposals.findIndex((x) => x.proposalId === p.proposalId);
    if (i >= 0) file.proposals[i] = p;
    else file.proposals.push(p);
    this.sweepExpiredInFile(file, at);
    await this.persist(p.accountId);
  }

  async takeProposal(proposalId: string): Promise<ScheduleProposal | undefined> {
    const p = this.proposals.get(proposalId);
    if (!p) return undefined;
    this.proposals.delete(proposalId);
    const file = await this.loadAccount(p.accountId);
    if (file.proposals) {
      file.proposals = file.proposals.filter((x) => x.proposalId !== proposalId);
      await this.persist(p.accountId);
    }
    return p;
  }

  /**
   * Remove a live proposal and archive it (canceled or expired).
   * Returns the dismissed row, or undefined if unknown/already gone.
   */
  async dismissProposal(
    accountId: string,
    proposalId: string,
    status: "canceled" | "expired",
    nowMs?: number,
  ): Promise<ScheduleDismissedProposal | undefined> {
    const at = nowMs ?? this.nowMs();
    const live = this.proposals.get(proposalId);
    const file = await this.loadAccount(accountId, at);
    const fromFile = (file.proposals ?? []).find((x) => x.proposalId === proposalId);
    const p = live?.accountId === accountId ? live : fromFile?.accountId === accountId ? fromFile : undefined;
    if (!p) return undefined;
    this.proposals.delete(proposalId);
    if (file.proposals) {
      file.proposals = file.proposals.filter((x) => x.proposalId !== proposalId);
    }
    const closedAt = new Date(at).toISOString();
    const row = toDismissed(p, status, closedAt);
    this.pushDismissed(file, row);
    await this.persist(accountId);
    return row;
  }

  async cancelProposal(
    accountId: string,
    proposalId: string,
    nowMs?: number,
  ): Promise<ScheduleDismissedProposal | undefined> {
    return this.dismissProposal(accountId, proposalId, "canceled", nowMs);
  }

  getProposal(proposalId: string): ScheduleProposal | undefined {
    return this.proposals.get(proposalId);
  }

  /** All loaded jobs across accounts (for timer arming). */
  allCachedJobs(): ScheduleJob[] {
    const out: ScheduleJob[] = [];
    for (const f of this.byAccount.values()) out.push(...f.jobs);
    return out;
  }
}
