// Daemon ScheduleService — Design §7.4.

import { randomUUID } from "node:crypto";
import { humanCronLabel } from "./chat-card.js";
import { nextCronExprAfter, parseCron } from "./cron-next.js";
import { resolveScheduleFromText } from "./resolve-nl.js";
import { ScheduleStore } from "./store.js";
import {
  AUTO_DISABLE_AFTER_ERRORS,
  DEFAULT_TIME_ZONE,
  ONESHOT_GRACE_MS,
  RECURRING_GRACE_MS,
  type MissPolicy,
  type ScheduleDismissedProposal,
  type ScheduleJob,
  type SchedulePayload,
  type ScheduleProposal,
  type ScheduleRunReceipt,
  type ScheduleSpec,
} from "./types.js";
import type { HomePaths } from "../home-paths.js";
import {
  resolveReferenceNow,
  type ClientTurnContext,
} from "../client-context.js";

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
  /** Design §7.4 — prefer persisted account IANA TZ over host default. */
  accountTimeZone?: (accountId: string) => Promise<string | undefined>;
  /** Used when the client omits locale (channels, older clients). */
  accountLocale?: (accountId: string) => Promise<string | undefined>;
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
  private accountTimeZone:
    | ((accountId: string) => Promise<string | undefined>)
    | undefined;
  private accountLocale:
    | ((accountId: string) => Promise<string | undefined>)
    | undefined;
  private emit: ((event: string, data: Record<string, unknown>) => void) | undefined;
  /** Accounts whose jobs are loaded. */
  private watched = new Set<string>();

  constructor(opts: ScheduleServiceOptions) {
    this.now = opts.now ?? (() => new Date());
    this.store = new ScheduleStore(opts.paths, () => this.now().getTime());
    this.onFire =
      opts.onFire ??
      (async () => ({ execStatus: "ok" as const, deliveryStatus: "none" as const }));
    this.defaultTimeZone = opts.defaultTimeZone ?? DEFAULT_TIME_ZONE;
    this.accountTimeZone = opts.accountTimeZone;
    this.accountLocale = opts.accountLocale;
    this.emit = opts.emit;
  }

  /** Client locale, else the account locale. Empty when neither is set. */
  async resolveLocale(accountId: string, clientLocale?: string): Promise<string | undefined> {
    if (clientLocale && clientLocale.trim()) return clientLocale.trim();
    const fromAccount = await this.accountLocale?.(accountId);
    if (fromAccount && fromAccount.trim()) return fromAccount.trim();
    return undefined;
  }

  /** Resolve TZ: explicit arg → account → host default. */
  async resolveTimeZone(accountId: string, override?: string): Promise<string> {
    if (override && override.trim()) return override.trim();
    const fromAccount = await this.accountTimeZone?.(accountId);
    if (fromAccount && fromAccount.trim()) return fromAccount.trim();
    return this.defaultTimeZone;
  }

  setFireHandler(handler: FireHandler): void {
    this.onFire = handler;
  }

  setEmit(emit: (event: string, data: Record<string, unknown>) => void): void {
    this.emit = emit;
  }

  async watchAccount(
    accountId: string,
    opts?: { reviewEnabled?: boolean; consolidateAt?: string; timeZone?: string },
  ): Promise<void> {
    await this.store.loadAccount(accountId, this.now().getTime());
    this.watched.add(accountId);
    await this.ensureConsolidateJob(accountId, {
      ...(opts?.consolidateAt !== undefined ? { consolidateAt: opts.consolidateAt } : {}),
      ...(opts?.timeZone !== undefined ? { timeZone: opts.timeZone } : {}),
    });
    if (opts?.reviewEnabled === true) {
      await this.ensureReviewJob(accountId, {
        ...(opts.timeZone !== undefined ? { timeZone: opts.timeZone } : {}),
      });
    } else if (opts?.reviewEnabled === false) {
      await this.disableSystemJob(accountId, `system:review:${accountId}`);
    }
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

  /**
   * Nightly background review (Memory Design §4.7 / §7.4 V-CRON-10).
   * Default 04:00 local — after consolidate.
   */
  async ensureReviewJob(
    accountId: string,
    opts?: { reviewAt?: string; timeZone?: string },
  ): Promise<ScheduleJob> {
    const id = `system:review:${accountId}`;
    const existing = await this.store.getJob(accountId, id);
    const tz = opts?.timeZone ?? this.defaultTimeZone;
    const { hour, minute } = parseConsolidateAt(opts?.reviewAt ?? "04:00");
    const cronExpr = `${minute} ${hour} * * *`;
    if (existing) {
      const same =
        existing.spec.kind === "cron" &&
        existing.spec.cronExpr === cronExpr &&
        existing.spec.timeZone === tz &&
        existing.payload.kind === "system" &&
        existing.payload.systemJob === "review" &&
        existing.enabled;
      if (same) return existing;
      existing.enabled = true;
      existing.spec = { kind: "cron", cronExpr, timeZone: tz };
      existing.payload = { kind: "system", systemJob: "review" };
      existing.updatedAt = this.now().toISOString();
      existing.nextRunAt = computeNext(existing.spec, this.now(), {
        graceMs: RECURRING_GRACE_MS,
        missPolicy: "skip",
        wasMissed: false,
      });
      await this.store.upsertJob(existing);
      this.armTimer();
      return existing;
    }
    return this.createJob({
      id,
      accountId,
      name: "Nightly memory review",
      spec: { kind: "cron", cronExpr, timeZone: tz },
      payload: { kind: "system", systemJob: "review" },
      missPolicy: "skip",
      source: "user",
      enabled: true,
    });
  }

  async disableSystemJob(accountId: string, jobId: string): Promise<void> {
    const job = await this.store.getJob(accountId, jobId);
    if (!job || job.payload.kind !== "system") return;
    if (!job.enabled) return;
    job.enabled = false;
    job.nextRunAt = null;
    job.updatedAt = this.now().toISOString();
    await this.store.upsertJob(job);
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
    opts?: {
      message?: string;
      clientContext?: ClientTurnContext;
      replacesJobId?: string;
      sessionId?: string;
    },
  ): Promise<
    | ScheduleProposal
    | { error: string; reason: string; candidates?: string[] }
  > {
    const hostNow = this.now();
    const client = opts?.clientContext;
    const tz = await this.resolveTimeZone(accountId, timeZone ?? client?.timeZone);
    const locale = await this.resolveLocale(accountId, client?.locale);
    const resolved = resolveScheduleFromText({
      text,
      referenceNow: resolveReferenceNow(hostNow, client),
      timeZone: tz,
      ...(locale ? { locale } : {}),
    });
    if (!resolved.ok) {
      return {
        error: resolved.detail ?? resolved.reason,
        reason: resolved.reason,
        ...(resolved.candidates?.length ? { candidates: resolved.candidates } : {}),
      };
    }
    let payload = resolved.payload;
    const msgOverride =
      typeof opts?.message === "string" ? opts.message.trim().slice(0, 200) : "";
    if (msgOverride && payload.kind === "notify") {
      payload = { kind: "notify", message: msgOverride };
    }
    const now = this.now();
    const missPolicy = inferMissPolicy(payload);
    const nextRunAt = computeNext(resolved.spec, now, {
      graceMs: resolved.spec.kind === "at" ? ONESHOT_GRACE_MS : RECURRING_GRACE_MS,
      missPolicy,
      wasMissed: false,
    });
    const replacesJobId = opts?.replacesJobId?.trim();
    if (replacesJobId) {
      const existing = await this.store.getJob(accountId, replacesJobId);
      if (!existing) {
        return { error: "unknown schedule", reason: "not_schedule" };
      }
      if (existing.payload.kind === "system" || existing.source === "workflow") {
        return {
          error: "that schedule cannot change WHEN from chat",
          reason: "not_schedule",
        };
      }
    }
    const proposal: ScheduleProposal = {
      proposalId: randomUUID(),
      accountId,
      resolvedLocal: resolved.resolvedLocal,
      ...(relativeHintFrom(now, nextRunAt, resolved.spec)
        ? { relativeHint: relativeHintFrom(now, nextRunAt, resolved.spec)! }
        : {}),
      ...(nextRunAt ? { nextRunAt } : {}),
      spec: resolved.spec,
      payload,
      name: msgOverride || resolved.name,
      sourceText: text,
      expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
      ...(replacesJobId ? { replacesJobId } : {}),
      ...(opts?.sessionId?.trim() ? { sessionId: opts.sessionId.trim() } : {}),
    };
    await this.store.putProposal(proposal, this.now().getTime());
    return proposal;
  }

  /** Cancel a live proposal → History "Not set" (canceled). */
  async cancelProposal(
    accountId: string,
    proposalId: string,
  ): Promise<ScheduleDismissedProposal> {
    const row = await this.store.cancelProposal(accountId, proposalId, this.now().getTime());
    if (!row) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown or expired proposal"), {
        code: "bad_params",
      });
    }
    this.emit?.("home:schedule-proposal-closed", {
      proposalId: row.proposalId,
      accountId,
      status: "canceled",
      ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    });
    return row;
  }

  /** Notify thin clients that a proposal is waiting for Confirm/Cancel. */
  emitProposed(p: ScheduleProposal): void {
    this.emit?.("home:schedule-proposed", {
      proposalId: p.proposalId,
      accountId: p.accountId,
      resolvedLocal: p.resolvedLocal,
      expiresAt: p.expiresAt,
      kind: p.spec.kind,
      name: p.name,
      ...(p.sessionId ? { sessionId: p.sessionId } : {}),
      ...(p.payload.message ? { message: p.payload.message } : {}),
    });
  }

  emitClosed(input: {
    proposalId: string;
    accountId: string;
    status: "confirmed" | "canceled" | "expired";
    sessionId?: string;
    jobId?: string;
  }): void {
    this.emit?.("home:schedule-proposal-closed", {
      proposalId: input.proposalId,
      accountId: input.accountId,
      status: input.status,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.jobId ? { jobId: input.jobId } : {}),
    });
  }

  async listDismissed(accountId: string): Promise<ScheduleDismissedProposal[]> {
    return this.store.listDismissed(accountId);
  }

  /** User-facing run history — hide daemon system jobs (flush/review/consolidate). */
  async listUserReceipts(
    accountId: string,
    jobId?: string,
  ): Promise<ScheduleRunReceipt[]> {
    return (await this.store.listReceipts(accountId, jobId)).filter(
      (r) => !String(r.jobId || "").startsWith("system:"),
    );
  }

  /**
   * Confirm a proposal → durable job + arm.
   * `accountId` is checked **before** consume/create (fail-closed on mismatch).
   */
  async confirmProposal(
    accountId: string,
    proposalId: string,
    overrides?: {
      missPolicy?: MissPolicy;
      /** When `kind` is set, replaces the proposal payload entirely (no stale notify message). */
      payload?: SchedulePayload;
      name?: string;
    },
  ): Promise<ScheduleJob> {
    const peek = this.store.getProposal(proposalId);
    if (!peek) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown or expired proposal"), {
        code: "bad_params",
      });
    }
    if (peek.accountId !== accountId) {
      throw Object.assign(new Error("envoyhome.bad_params: proposal account mismatch"), {
        code: "bad_params",
      });
    }
    if (new Date(peek.expiresAt).getTime() < this.now().getTime()) {
      await this.store.dismissProposal(accountId, proposalId, "expired", this.now().getTime());
      this.emitClosed({
        proposalId,
        accountId,
        status: "expired",
        ...(peek.sessionId ? { sessionId: peek.sessionId } : {}),
      });
      throw Object.assign(new Error("envoyhome.bad_params: proposal expired"), {
        code: "bad_params",
      });
    }
    const p = await this.store.takeProposal(proposalId);
    if (!p) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown or expired proposal"), {
        code: "bad_params",
      });
    }
    const payload =
      overrides?.payload?.kind !== undefined
        ? overrides.payload
        : overrides?.payload
          ? { ...p.payload, ...overrides.payload }
          : p.payload;
    const missPolicy = overrides?.missPolicy ?? inferMissPolicy(payload);
    const name =
      typeof overrides?.name === "string" && overrides.name.trim().length > 0
        ? overrides.name.trim().slice(0, 120)
        : p.name;
    const job = p.replacesJobId
      ? await this.updateJob(p.accountId, p.replacesJobId, {
          spec: p.spec,
          ...(typeof overrides?.name === "string" && overrides.name.trim().length > 0
            ? { name }
            : {}),
          ...(overrides?.payload ? { payload } : {}),
        })
      : await this.createJob({
          accountId: p.accountId,
          name,
          spec: p.spec,
          payload,
          missPolicy,
          source: "user",
          sourceText: p.sourceText,
        });
    this.emitClosed({
      proposalId,
      accountId,
      status: "confirmed",
      jobId: job.id,
      ...(p.sessionId ? { sessionId: p.sessionId } : {}),
    });
    return job;
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
    patch: {
      enabled?: boolean;
      name?: string;
      spec?: ScheduleSpec;
      payload?: SchedulePayload;
    },
  ): Promise<ScheduleJob> {
    const job = await this.store.getJob(accountId, jobId);
    if (!job) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown schedule"), {
        code: "bad_params",
      });
    }
    const isSystem = job.payload.kind === "system";
    const isWorkflowSynced = job.source === "workflow";

    // Daemon-owned system jobs: enable-only via watchAccount / disableSystemJob — not client patches.
    if (isSystem) {
      const touching =
        patch.name !== undefined ||
        patch.spec !== undefined ||
        patch.payload !== undefined ||
        patch.enabled !== undefined;
      if (touching) {
        throw Object.assign(
          new Error("envoyhome.bad_params: system schedule is daemon-owned"),
          { code: "bad_params" },
        );
      }
      return job;
    }

    // Workflow-synced: enable-only (V-CRON-7).
    if (isWorkflowSynced) {
      if (patch.name !== undefined || patch.spec !== undefined || patch.payload !== undefined) {
        throw Object.assign(
          new Error("envoyhome.bad_params: cannot edit workflow-synced job (enable-only)"),
          { code: "bad_params" },
        );
      }
    }

    if (patch.payload !== undefined) {
      if (patch.payload.kind === "system") {
        throw Object.assign(
          new Error("envoyhome.bad_params: system payload is daemon-owned"),
          { code: "bad_params" },
        );
      }
      job.payload = patch.payload;
      job.missPolicy = inferMissPolicy(job.payload);
    }
    if (patch.spec !== undefined) {
      job.spec = patch.spec;
    }
    if (patch.enabled !== undefined) job.enabled = patch.enabled;
    if (patch.name !== undefined) job.name = patch.name.slice(0, 120);
    job.updatedAt = this.now().toISOString();
    const specChanged = patch.spec !== undefined;
    if (job.enabled && (specChanged || !job.nextRunAt)) {
      job.nextRunAt = computeNext(job.spec, this.now(), {
        graceMs: job.spec.kind === "at" ? ONESHOT_GRACE_MS : RECURRING_GRACE_MS,
        missPolicy: job.missPolicy,
        wasMissed: false,
      });
    }
    if (!job.enabled) job.nextRunAt = null;
    await this.store.upsertJob(job);
    this.armTimer();
    return job;
  }

  async removeJob(accountId: string, jobId: string): Promise<void> {
    const job = await this.store.getJob(accountId, jobId);
    if (!job) return;
    if (job.payload.kind === "system") {
      throw Object.assign(
        new Error("envoyhome.bad_params: cannot remove system schedule"),
        { code: "bad_params" },
      );
    }
    if (job.source === "workflow") {
      throw Object.assign(
        new Error("envoyhome.bad_params: cannot remove workflow-synced job"),
        { code: "bad_params" },
      );
    }
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
      const latenessMs = Math.max(0, now.getTime() - scheduledFor.getTime());
      const receipt: ScheduleRunReceipt = {
        jobId: job.id,
        accountId: job.accountId,
        scheduledFor: scheduledFor.toISOString(),
        startedAt,
        finishedAt: now.toISOString(),
        execStatus: "skipped",
        deliveryStatus: "none",
        error: skipReason,
        ...(latenessMs > 0 ? { latenessMs } : {}),
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

    const finishedAt = this.now();
    const latenessMs = Math.max(0, finishedAt.getTime() - scheduledFor.getTime());
    const receipt: ScheduleRunReceipt = {
      jobId: job.id,
      accountId: job.accountId,
      scheduledFor: scheduledFor.toISOString(),
      startedAt,
      finishedAt: finishedAt.toISOString(),
      execStatus,
      deliveryStatus,
      ...(error !== undefined ? { error } : {}),
      ...(latenessMs > 0 ? { latenessMs } : {}),
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

/** Settings and chat share one explanation, including ask-candidates. */
export function formatProposeFailure(proposal: {
  reason: string;
  error: string;
  candidates?: string[];
}): string {
  const why =
    proposal.error && proposal.error !== proposal.reason ? `: ${proposal.error}` : "";
  const cands =
    proposal.candidates && proposal.candidates.length > 0
      ? ` Candidates: ${proposal.candidates.join(" | ")}`
      : "";
  return `${proposal.reason}${why}${cands}`;
}

function inferMissPolicy(payload: SchedulePayload): MissPolicy {
  if (
    payload.kind === "workflow" ||
    payload.kind === "tool" ||
    payload.kind === "system" ||
    payload.kind === "agentTurn"
  ) {
    return "skip";
  }
  return "grace_catchup";
}

/** Human relative cadence for propose confirm preview (Design accuracy). */
export function relativeHintFrom(
  now: Date,
  nextRunAt: string | null,
  spec: ScheduleSpec,
): string | undefined {
  if (spec.kind === "cron" && spec.cronExpr) {
    const label = humanCronLabel(spec.cronExpr, "en");
    return nextRunAt
      ? `next ${relativeFromMs(new Date(nextRunAt).getTime() - now.getTime())} · ${label}`
      : label;
  }
  if (spec.kind === "every" && spec.everyMs) {
    const mins = Math.max(1, Math.round(spec.everyMs / 60_000));
    return `every ${mins} min`;
  }
  if (!nextRunAt) return undefined;
  return relativeFromMs(new Date(nextRunAt).getTime() - now.getTime());
}

function relativeFromMs(ms: number): string {
  if (ms < 0) return "past";
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "in under a minute";
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `in ${hrs} hour${hrs === 1 ? "" : "s"}`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
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
