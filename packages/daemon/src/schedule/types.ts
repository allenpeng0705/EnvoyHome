// Schedule job model (Design §7.4).

export type ScheduleKind = "at" | "every" | "cron";

export type SchedulePayloadKind = "notify" | "workflow" | "tool" | "system";

export interface SchedulePayload {
  kind: SchedulePayloadKind;
  /** User-visible label / notify text. */
  message?: string;
  /** workflow id when kind=workflow */
  workflowId?: string;
  /** tool name when kind=tool */
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  /** system job: consolidate | flush | review */
  systemJob?: "consolidate" | "flush" | "review";
}

export interface ScheduleSpec {
  kind: ScheduleKind;
  /** ISO instant for kind=at */
  whenInstant?: string;
  /** Interval ms for kind=every */
  everyMs?: number;
  /** 5-field cron for kind=cron */
  cronExpr?: string;
  /** IANA TZ (required for cron wall times; used for display). */
  timeZone: string;
}

export type MissPolicy = "grace_catchup" | "skip";

export interface ScheduleJob {
  id: string;
  accountId: string;
  enabled: boolean;
  name: string;
  spec: ScheduleSpec;
  payload: SchedulePayload;
  /** If true (or payload can actuate), missed ticks skip rather than catch up. */
  missPolicy: MissPolicy;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "ok" | "error" | "skipped" | null;
  lastError: string | null;
  consecutiveErrors: number;
  createdAt: string;
  updatedAt: string;
  /** Source: user job vs synced from workflow YAML. */
  source: "user" | "workflow";
  /** Original NL (audit only; never used at fire). */
  sourceText?: string;
}

export interface ScheduleProposal {
  proposalId: string;
  accountId: string;
  /** Resolved local display e.g. 2026-10-10 08:00 Asia/Shanghai */
  resolvedLocal: string;
  spec: ScheduleSpec;
  payload: SchedulePayload;
  name: string;
  sourceText: string;
  /** ISO when proposal expires (unconfirmed). */
  expiresAt: string;
}

export interface ScheduleRunReceipt {
  jobId: string;
  accountId: string;
  scheduledFor: string;
  startedAt: string;
  finishedAt: string;
  execStatus: "ok" | "error" | "skipped";
  deliveryStatus: "delivered" | "not-delivered" | "none" | "unknown";
  error?: string;
}

/** Defaults */
export const ONESHOT_GRACE_MS = 120_000;
export const RECURRING_GRACE_MS = 300_000;
export const AUTO_DISABLE_AFTER_ERRORS = 5;
export const DEFAULT_TIME_ZONE = "UTC";
