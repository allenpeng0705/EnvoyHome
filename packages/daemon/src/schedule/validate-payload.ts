// Normalize + validate user-authored schedule payloads (Design §7.4).
// System payloads are daemon-only — never accepted from home.putSchedule / confirm overrides.

import type { SchedulePayload, ScheduleSpec } from "./types.js";

export type SchedulePayloadValidation =
  | { ok: true; payload: SchedulePayload }
  | { ok: false; reason: string };

export type ScheduleSpecValidation =
  | { ok: true; spec: ScheduleSpec }
  | { ok: false; reason: string };

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return undefined;
}

/**
 * Parse a client payload object. Refuses `system`. Requires workflowId / toolName
 * when kind is workflow / tool. Caller still validates workflow/tool existence.
 */
export function normalizeUserSchedulePayload(raw: unknown): SchedulePayloadValidation {
  const o = asRecord(raw);
  if (!o) return { ok: false, reason: "payload required" };
  const kind = o.kind;
  if (kind === "system") {
    return { ok: false, reason: "system schedules are daemon-owned" };
  }
  if (kind !== "notify" && kind !== "workflow" && kind !== "tool") {
    return { ok: false, reason: "payload.kind must be notify, workflow, or tool" };
  }
  if (kind === "notify") {
    const message =
      typeof o.message === "string" && o.message.trim().length > 0
        ? o.message.trim().slice(0, 200)
        : "Reminder";
    return { ok: true, payload: { kind: "notify", message } };
  }
  if (kind === "workflow") {
    const workflowId = typeof o.workflowId === "string" ? o.workflowId.trim() : "";
    if (!workflowId) return { ok: false, reason: "workflowId required" };
    const message =
      typeof o.message === "string" && o.message.trim().length > 0
        ? o.message.trim().slice(0, 200)
        : workflowId;
    return { ok: true, payload: { kind: "workflow", workflowId, message } };
  }
  const toolName = typeof o.toolName === "string" ? o.toolName.trim() : "";
  if (!toolName) return { ok: false, reason: "toolName required" };
  const toolArgs = asRecord(o.toolArgs);
  return {
    ok: true,
    payload: {
      kind: "tool",
      toolName,
      ...(toolArgs ? { toolArgs } : {}),
      ...(typeof o.message === "string" && o.message.trim()
        ? { message: o.message.trim().slice(0, 200) }
        : {}),
    },
  };
}

export function normalizeScheduleSpec(raw: unknown): ScheduleSpecValidation {
  const o = asRecord(raw);
  if (!o) return { ok: false, reason: "spec required" };
  const timeZone =
    typeof o.timeZone === "string" && o.timeZone.trim().length > 0
      ? o.timeZone.trim()
      : "UTC";
  const kind = o.kind;
  if (kind === "at") {
    const whenInstant = typeof o.whenInstant === "string" ? o.whenInstant : "";
    if (!whenInstant || Number.isNaN(Date.parse(whenInstant))) {
      return { ok: false, reason: "whenInstant required for kind=at" };
    }
    return { ok: true, spec: { kind: "at", whenInstant, timeZone } };
  }
  if (kind === "every") {
    const everyMs = typeof o.everyMs === "number" ? o.everyMs : Number(o.everyMs);
    if (!Number.isFinite(everyMs) || everyMs < 1) {
      return { ok: false, reason: "everyMs required for kind=every" };
    }
    return { ok: true, spec: { kind: "every", everyMs: Math.floor(everyMs), timeZone } };
  }
  if (kind === "cron") {
    const cronExpr = typeof o.cronExpr === "string" ? o.cronExpr.trim() : "";
    if (!cronExpr) return { ok: false, reason: "cronExpr required for kind=cron" };
    return { ok: true, spec: { kind: "cron", cronExpr, timeZone } };
  }
  return { ok: false, reason: "spec.kind must be at, every, or cron" };
}
