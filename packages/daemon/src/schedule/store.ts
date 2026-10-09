// Durable schedule jobs under accounts/<id>/schedules.json

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HomePaths } from "../home-paths.js";
import type { ScheduleJob, ScheduleProposal, ScheduleRunReceipt } from "./types.js";

interface AccountScheduleFile {
  jobs: ScheduleJob[];
  /** Recent receipts (capped). */
  receipts: ScheduleRunReceipt[];
  /** Unconfirmed NL proposals (survive restart until expiry / confirm). */
  proposals?: ScheduleProposal[];
}

export class ScheduleStore {
  private byAccount = new Map<string, AccountScheduleFile>();
  private proposals = new Map<string, ScheduleProposal>();

  constructor(private readonly paths: HomePaths) {}

  private filePath(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "schedules.json");
  }

  async loadAccount(accountId: string, nowMs: number = Date.now()): Promise<AccountScheduleFile> {
    const cached = this.byAccount.get(accountId);
    if (cached) return cached;
    try {
      const raw = JSON.parse(await readFile(this.filePath(accountId), "utf8")) as AccountScheduleFile;
      const file: AccountScheduleFile = {
        jobs: Array.isArray(raw.jobs) ? raw.jobs : [],
        receipts: Array.isArray(raw.receipts) ? raw.receipts : [],
        proposals: Array.isArray(raw.proposals) ? raw.proposals : [],
      };
      this.byAccount.set(accountId, file);
      this.hydrateProposals(file.proposals ?? [], nowMs);
      return file;
    } catch {
      const empty: AccountScheduleFile = { jobs: [], receipts: [], proposals: [] };
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

  async persist(accountId: string): Promise<void> {
    const file = await this.loadAccount(accountId);
    await mkdir(this.paths.accountRoot(accountId), { recursive: true });
    await writeFile(this.filePath(accountId), JSON.stringify(file, null, 2), "utf8");
  }

  async listJobs(accountId: string): Promise<ScheduleJob[]> {
    const file = await this.loadAccount(accountId);
    return file.jobs.slice();
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

  async putProposal(p: ScheduleProposal, nowMs: number = Date.now()): Promise<void> {
    this.proposals.set(p.proposalId, p);
    const file = await this.loadAccount(p.accountId, nowMs);
    if (!file.proposals) file.proposals = [];
    const i = file.proposals.findIndex((x) => x.proposalId === p.proposalId);
    if (i >= 0) file.proposals[i] = p;
    else file.proposals.push(p);
    // Drop expired while writing (use injectable clock — tests freeze `now`)
    file.proposals = file.proposals.filter((x) => new Date(x.expiresAt).getTime() >= nowMs);
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
