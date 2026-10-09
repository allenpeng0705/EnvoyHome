// Daemon ScheduleService — Design §7.4.

import { randomUUID } from "node:crypto";
import { nextCronExprAfter, parseCron } from "./cron-next.js";
import { resolveScheduleFromText } from "./resolve-nl.js";
import { ScheduleStore } from "./store.js";
import {
  AUTO_DISABLE_AFTER_ERRORS,
  DEFAULT_TIME_ZONE,
  ONESHOT_GRACE_MS,
  RECURRING_GRACE_MS,
  type MissPolicy,
  type ScheduleJob,
  type SchedulePayload,
  type ScheduleProposal,
  type ScheduleRunReceipt,
  type ScheduleSpec,
} from "./types.js";
import type { HomePaths } from "../home-paths.js";

export type FireHandler = (job: ScheduleJob, scheduledFor: Date) => Promise<{
  execStatus: "ok" | "error" | "skipped";
  deliveryStatus: ScheduleRunReceipt["deliveryStatus"];
  error?: string;
}>;

export interface ScheduleServiceOptions {
  paths: HomePaths;
  /** Injectable clock for tests. */
  now?: () => Date;
  onFire?: FireHandler;
  /** Default IANA TZ when account has none. */
  defaultTimeZone?: string;
  emit?: (event: string, data: Record<string, unknown>) => void;
}

/** Next fire instant after `after` (or null when one-shot is exhausted). */
export function computeNext(
  spec: ScheduleSpec,
  after: Date,
  opts: { graceMs: number; missPolicy: MissPolicy; wasMissed: boolean },
): string | null {
  if (spec.kind === "at") {
    if (!spec.whenInstant) return null;
    const when = new Date(spec.whenInstant);
    if (when.getTime() > after.getTime()) return when.toISOString();
    // Past: within grace and catchup allowed → fire ASAP (caller); else done.
    if (
      !opts.wasMissed &&
      opts.missPolicy === "grace_catchup" &&
      after.getTime() - when.getTime() <= opts.graceMs
    ) {
      return after.toISOString(); // due now
    }
    return null;
  }
  if (spec.kind === "every") {
    const every = spec.everyMs ?? 0;
    if (every <= 0) return null;
    // Always advance from `after` (missed or not — no catch-up stampede).
    return new Date(after.getTime() + every).toISOString();
  }
  if (spec.kind === "cron" && spec.cronExpr) {
    const tz = spec.timeZone || DEFAULT_TIME_ZONE;
    parseCron(spec.cronExpr); // validate
    const n = nextCronExprAfter(spec.cronExpr, after, tz);
    return n ? n.toISOString() : null;
  }
  return null;
}

export class ScheduleService {
  readonly store: ScheduleStore;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private readonly now: () => Date;
  private onFire: FireHandler;
  private defaultTimeZone: string;
  private emit: ((event: string, data: Record<string, unknown>) => void) | undefined;
  /** Accounts whose jobs are loaded. */
  private watched = new Set<string>();

  constructor(opts: ScheduleServiceOptions) {
    this.store = new ScheduleStore(opts.paths);
    this.now = opts.now ?? (() => new Date());
    this.onFire =
      opts.onFire ??
      (async () => ({ execStatus: "ok" as const, deliveryStatus: "none" as const }));
    this.defaultTimeZone = opts.defaultTimeZone ?? DEFAULT_TIME_ZONE;
    this.emit = opts.emit;
  }

  setFireHandler(handler: FireHandler): void {
    this.onFire = handler;
  }

  setEmit(emit: (event: string, data: Record<string, unknown>) => void): void {
    this.emit = emit;
  }

  async watchAccount(accountId: string): Promise<void> {
    await this.store.loadAccount(accountId, this.now().getTime());
    this.watched.add(accountId);
    await this.ensureConsolidateJob(accountId);
    this.armTimer();
  }

  /**
   * Nightly consolidate (Memory Design §9) — one system job per account.
   * Default 03:30 local; override via [consolidateAt] as `HH:MM` (24h).
   */
  async ensureConsolidateJob(
    accountId: string,
    opts?: { consolidateAt?: string; timeZone?: string },
  ): Promise<ScheduleJob> {
    const id = `system:consolidate:${accountId}`;
    const existing = await this.store.getJob(accountId, id);
    const tz = opts?.timeZone ?? this.defaultTimeZone;
    const { hour, minute } = parseConsolidateAt(opts?.consolidateAt ?? "03:30");
    const cronExpr = `${minute} ${hour} * * *`;
    if (existing) {
      const same =
        existing.spec.kind === "cron" &&
        existing.spec.cronExpr === cronExpr &&
        existing.spec.timeZone === tz &&
        existing.payload.kind === "system" &&
        existing.payload.systemJob === "consolidate";
      if (same) return existing;
    }
    return this.createJob({
      id,
      accountId,
      name: "Nightly consolidate",
      spec: { kind: "cron", cronExpr, timeZone: tz },
      payload: { kind: "system", systemJob: "consolidate" },
      missPolicy: "skip",
      source: "user",
      enabled: true,
    });
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /**
   * Propose a schedule from NL. Does NOT arm the timer.
   * Proposal is durable under the account schedules file until expiry/confirm.
   */
  async proposeFromText(
    accountId: string,
    text: string,
    timeZone?: string,
  ): Promise<ScheduleProposal | { error: string; reason: string }> {
    const tz = timeZone ?? this.defaultTimeZone;
    const resolved = resolveScheduleFromText({
      text,
      referenceNow: this.now(),
      timeZone: tz,
    });
    if (!resolved.ok) {
      return {
        error: resolved.detail ?? resolved.reason,
        reason: resolved.reason,
      };
    }
    const proposal: ScheduleProposal = {
      proposalId: randomUUID(),
      accountId,
      resolvedLocal: resolved.resolvedLocal,
      spec: resolved.spec,
      payload: resolved.payload,
      name: resolved.name,
      sourceText: text,
      expiresAt: new Date(this.now().getTime() + 15 * 60_000).toISOString(),
    };
    await this.store.putProposal(proposal, this.now().getTime());
    return proposal;
  }

  /** Confirm a proposal → durable job + arm. */
  async confirmProposal(
    proposalId: string,
    overrides?: { missPolicy?: MissPolicy; payload?: Partial<SchedulePayload> },
  ): Promise<ScheduleJob> {
    const p = await this.store.takeProposal(proposalId);
    if (!p) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown or expired proposal"), {
        code: "bad_params",
      });
    }
    if (new Date(p.expiresAt).getTime() < this.now().getTime()) {
      throw Object.assign(new Error("envoyhome.bad_params: proposal expired"), {
        code: "bad_params",
      });
    }
    return this.createJob({
      accountId: p.accountId,
      name: p.name,
      spec: p.spec,
      payload: { ...p.payload, ...overrides?.payload },
      missPolicy: overrides?.missPolicy ?? "grace_catchup",
      source: "user",
      sourceText: p.sourceText,
    });
  }

  async createJob(input: {
    accountId: string;
    name: string;
    spec: ScheduleSpec;
    payload: SchedulePayload;
    missPolicy?: MissPolicy;
    source?: "user" | "workflow";
    sourceText?: string;
    id?: string;
    enabled?: boolean;
  }): Promise<ScheduleJob> {
    const now = this.now();
    const missPolicy = input.missPolicy ?? inferMissPolicy(input.payload);
    const next = computeNext(input.spec, now, {
      graceMs: input.spec.kind === "at" ? ONESHOT_GRACE_MS : RECURRING_GRACE_MS,
      missPolicy,
      wasMissed: false,
    });
    const job: ScheduleJob = {
      id: input.id ?? randomUUID(),
      accountId: input.accountId,
      enabled: input.enabled !== false,
      name: input.name,
      spec: input.spec,
      payload: input.payload,
      missPolicy,
      nextRunAt: next,
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      consecutiveErrors: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      source: input.source ?? "user",
      ...(input.sourceText !== undefined ? { sourceText: input.sourceText } : {}),
    };
    await this.store.upsertJob(job);
    this.watched.add(input.accountId);
    this.armTimer();
    return job;
  }

  async updateJob(
    accountId: string,
    jobId: string,
    patch: { enabled?: boolean; name?: string },
  ): Promise<ScheduleJob> {
    const job = await this.store.getJob(accountId, jobId);
    if (!job) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown schedule"), {
        code: "bad_params",
      });
    }
    if (patch.enabled !== undefined) job.enabled = patch.enabled;
    if (patch.name !== undefined) job.name = patch.name;
    job.updatedAt = this.now().toISOString();
    if (job.enabled && !job.nextRunAt) {
      job.nextRunAt = computeNext(job.spec, this.now(), {
        graceMs: job.spec.kind === "at" ? ONESHOT_GRACE_MS : RECURRING_GRACE_MS,
        missPolicy: job.missPolicy,
        wasMissed: false,
      });
    }
    await this.store.upsertJob(job);
    this.armTimer();
    return job;
  }

  async removeJob(accountId: string, jobId: string): Promise<void> {
    await this.store.removeJob(accountId, jobId);
    this.armTimer();
  }

  /** Force run now (does not require due). */
  async runNow(accountId: string, jobId: string): Promise<ScheduleRunReceipt> {
    const job = await this.store.getJob(accountId, jobId);
    if (!job) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown schedule"), {
        code: "bad_params",
      });
    }
    return this.executeJob(job, this.now(), { advance: true });
  }

  /**
   * Sync workflow class-B schedules into jobs for an account (and globals as account="*").
   * Call after workflow reload.
   */
  async syncWorkflowSchedules(
    accountId: string,
    workflows: Array<{
      id: string;
      schedule?: string | { cron: string; timeZone?: string };
      /** True if any step may actuate (admin) — forces missPolicy=skip. */
      canActuate?: boolean;
    }>,
    timeZone?: string,
  ): Promise<void> {
    const tz = timeZone ?? this.defaultTimeZone;
    const existing = await this.store.listJobs(accountId);
    const workflowJobs = existing.filter((j) => j.source === "workflow");
    const wanted = new Set<string>();
    const now = this.now();
    for (const w of workflows) {
      if (!w.schedule) continue;
      const cronExpr = typeof w.schedule === "string" ? w.schedule : w.schedule.cron;
      const jobTz =
        typeof w.schedule === "string" ? tz : (w.schedule.timeZone ?? tz);
      const id = `wf:${accountId}:${w.id}`;
      wanted.add(id);
      const prev = existing.find((j) => j.id === id);
      const missPolicy: MissPolicy = w.canActuate ? "skip" : "grace_catchup";
      const spec: ScheduleSpec = { kind: "cron", cronExpr, timeZone: jobTz };
      const payload: SchedulePayload = {
        kind: "workflow",
        workflowId: w.id,
        message: w.id,
      };
      if (prev) {
        const sameSpec =
          prev.spec.kind === "cron" &&
          prev.spec.cronExpr === cronExpr &&
          prev.spec.timeZone === jobTz;
        const samePayload =
          prev.payload.kind === "workflow" && prev.payload.workflowId === w.id;
        const sameMiss = prev.missPolicy === missPolicy;
        if (sameSpec && samePayload && sameMiss) {
          // Preserve lastRunAt / consecutiveErrors / nextRunAt / createdAt.
          continue;
        }
        prev.name = `workflow:${w.id}`;
        prev.spec = spec;
        prev.payload = payload;
        prev.missPolicy = missPolicy;
        prev.source = "workflow";
        if (!sameSpec || !prev.nextRunAt) {
          prev.nextRunAt = computeNext(spec, now, {
            graceMs: RECURRING_GRACE_MS,
            missPolicy,
            wasMissed: false,
          });
        }
        prev.updatedAt = now.toISOString();
        await this.store.upsertJob(prev);
        continue;
      }
      await this.createJob({
        id,
        accountId,
        name: `workflow:${w.id}`,
        spec,
        payload,
        missPolicy,
        source: "workflow",
        enabled: true,
      });
    }
    for (const j of workflowJobs) {
      if (!wanted.has(j.id)) await this.store.removeJob(accountId, j.id);
    }
    this.armTimer();
  }

  /** Test / tick helper: process all due jobs at `now`. */
  async tick(now: Date = this.now()): Promise<ScheduleRunReceipt[]> {
    const receipts: ScheduleRunReceipt[] = [];
    for (const accountId of this.watched) {
      await this.store.loadAccount(accountId);
    }
    const jobs = this.store
      .allCachedJobs()
      .filter((j) => j.enabled && j.nextRunAt && new Date(j.nextRunAt).getTime() <= now.getTime());
    // Stagger order by id for determinism
    jobs.sort((a, b) => a.id.localeCompare(b.id));
    for (const job of jobs) {
      receipts.push(await this.executeJob(job, now, { advance: true }));
    }
    this.armTimer();
    return receipts;
  }

  private async executeJob(
    job: ScheduleJob,
    now: Date,
    opts: { advance: boolean },
  ): Promise<ScheduleRunReceipt> {
    const scheduledFor = job.nextRunAt ? new Date(job.nextRunAt) : now;
    const startedAt = now.toISOString();

    // Past grace: never catch-up-fire (Design §7.4 #5 — grace then next future;
    // skip for admin; expire stale one-shots). Within grace → fall through and fire.
    const overdue = now.getTime() - scheduledFor.getTime();
    const grace = job.spec.kind === "at" ? ONESHOT_GRACE_MS : RECURRING_GRACE_MS;
    if (overdue > grace) {
      const skipReason =
        job.spec.kind === "at"
          ? "missed_expired"
          : job.missPolicy === "skip"
            ? "missed_skip"
            : "missed_grace_expired";
      if (job.spec.kind === "at") {
        job.nextRunAt = null;
        job.enabled = false;
      } else {
        job.nextRunAt = computeNext(job.spec, now, {
          graceMs: grace,
          missPolicy: job.missPolicy,
          wasMissed: true,
        });
      }
      job.lastStatus = "skipped";
      job.lastError = skipReason;
      job.updatedAt = now.toISOString();
      await this.store.upsertJob(job);
      const receipt: ScheduleRunReceipt = {
        jobId: job.id,
        accountId: job.accountId,
        scheduledFor: scheduledFor.toISOString(),
        startedAt,
        finishedAt: now.toISOString(),
        execStatus: "skipped",
        deliveryStatus: "none",
        error: skipReason,
      };
      await this.store.appendReceipt(receipt);
      this.emit?.("home:schedule-fired", {
        jobId: job.id,
        accountId: job.accountId,
        status: "skipped",
        reason: skipReason,
      });
      return receipt;
    }

    // Advance nextRun BEFORE fire (no double-fire)
    if (opts.advance) {
      if (job.spec.kind === "at") {
        job.nextRunAt = null;
        job.enabled = false; // one-shot complete
      } else {
        job.nextRunAt = computeNext(job.spec, now, {
          graceMs: grace,
          missPolicy: job.missPolicy,
          wasMissed: false,
        });
      }
      job.updatedAt = now.toISOString();
      await this.store.upsertJob(job);
    }

    let execStatus: ScheduleRunReceipt["execStatus"] = "ok";
    let deliveryStatus: ScheduleRunReceipt["deliveryStatus"] = "none";
    let error: string | undefined;
    try {
      const result = await this.onFire(job, scheduledFor);
      execStatus = result.execStatus;
      deliveryStatus = result.deliveryStatus;
      error = result.error;
    } catch (err) {
      execStatus = "error";
      error = err instanceof Error ? err.message : String(err);
    }

    job.lastRunAt = now.toISOString();
    job.lastStatus = execStatus === "skipped" ? "skipped" : execStatus === "ok" ? "ok" : "error";
    job.lastError = error ?? null;
    if (execStatus === "error") {
      job.consecutiveErrors += 1;
      if (job.consecutiveErrors >= AUTO_DISABLE_AFTER_ERRORS) {
        job.enabled = false;
        job.lastError = `auto_disabled_after_${AUTO_DISABLE_AFTER_ERRORS}_errors`;
      }
    } else if (execStatus === "ok") {
      job.consecutiveErrors = 0;
    }
    job.updatedAt = now.toISOString();
    await this.store.upsertJob(job);

    const receipt: ScheduleRunReceipt = {
      jobId: job.id,
      accountId: job.accountId,
      scheduledFor: scheduledFor.toISOString(),
      startedAt,
      finishedAt: this.now().toISOString(),
      execStatus,
      deliveryStatus,
      ...(error !== undefined ? { error } : {}),
    };
    await this.store.appendReceipt(receipt);
    this.emit?.("home:schedule-fired", {
      jobId: job.id,
      accountId: job.accountId,
      status: execStatus,
      deliveryStatus,
      ...(error !== undefined ? { error } : {}),
    });
    return receipt;
  }

  private armTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    let soonest: number | undefined;
    const now = this.now().getTime();
    for (const job of this.store.allCachedJobs()) {
      if (!job.enabled || !job.nextRunAt) continue;
      const t = new Date(job.nextRunAt).getTime();
      if (soonest === undefined || t < soonest) soonest = t;
    }
    if (soonest === undefined) return;
    const delay = Math.max(0, Math.min(soonest - now, 60_000));
    this.timer = setTimeout(() => {
      void this.onTimer();
    }, delay);
    if (typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref?.();
    }
  }

  private async onTimer(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick(this.now());
    } finally {
      this.running = false;
      this.armTimer();
    }
  }
}

function inferMissPolicy(payload: SchedulePayload): MissPolicy {
  if (payload.kind === "workflow" || payload.kind === "tool" || payload.kind === "system") {
    return "skip";
  }
  return "grace_catchup";
}

/** Parse `HH:MM` (24h) → cron hour/minute. Invalid → 03:30. */
export function parseConsolidateAt(raw: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return { hour: 3, minute: 30 };
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return { hour: 3, minute: 30 };
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { hour: 3, minute: 30 };
  return { hour, minute };
}
