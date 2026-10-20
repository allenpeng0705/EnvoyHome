// Normalize + validate user-authored schedule payloads (Design §7.4).
// System payloads are daemon-only — never accepted from home.putSchedule / confirm overrides.

import { parseCron } from "./cron-next.js";
import type { SchedulePayload, ScheduleSpec } from "./types.js";

function assertIanaOrUtc(timeZone: string): string | undefined {
  const tz = timeZone.trim();
  if (!tz) return "timeZone required";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
  } catch {
    return `unknown IANA timeZone: ${tz}`;
  }
  return undefined;
}

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

const AGENT_TURN_PROMPT_MAX = 4000;
const AGENT_TURN_ROUNDS_MAX = 5;

/**
 * Parse a client payload object. Refuses `system`. Requires workflowId / toolName
 * when kind is workflow / tool; prompt when agentTurn. Caller still validates
 * workflow/tool existence.
 */
export function normalizeUserSchedulePayload(raw: unknown): SchedulePayloadValidation {
  const o = asRecord(raw);
  if (!o) return { ok: false, reason: "payload required" };
  const kind = o.kind;
  if (kind === "system") {
    return { ok: false, reason: "system schedules are daemon-owned" };
  }
  if (
    kind !== "notify" &&
    kind !== "workflow" &&
    kind !== "tool" &&
    kind !== "agentTurn"
  ) {
    return {
      ok: false,
      reason: "payload.kind must be notify, workflow, tool, or agentTurn",
    };
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
  if (kind === "agentTurn") {
    const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
    if (!prompt) return { ok: false, reason: "prompt required for agentTurn" };
    if (prompt.length > AGENT_TURN_PROMPT_MAX) {
      return { ok: false, reason: `prompt exceeds ${AGENT_TURN_PROMPT_MAX} chars` };
    }
    const preset =
      o.toolPolicyPreset === "standard" || o.toolPolicyPreset === "restricted"
        ? o.toolPolicyPreset
        : "restricted";
    let maxToolRounds = AGENT_TURN_ROUNDS_MAX;
    if (typeof o.maxToolRounds === "number" && Number.isFinite(o.maxToolRounds)) {
      maxToolRounds = Math.max(1, Math.min(AGENT_TURN_ROUNDS_MAX, Math.floor(o.maxToolRounds)));
    }
    return {
      ok: true,
      payload: {
        kind: "agentTurn",
        prompt: prompt.slice(0, AGENT_TURN_PROMPT_MAX),
        toolPolicyPreset: preset,
        maxToolRounds,
        ...(typeof o.message === "string" && o.message.trim()
          ? { message: o.message.trim().slice(0, 200) }
          : { message: prompt.slice(0, 80) }),
      },
    };
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
  const tzErr = assertIanaOrUtc(timeZone);
  if (tzErr) return { ok: false, reason: tzErr };
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
    // Validate at write — fail before arm (Design accuracy backlog).
    try {
      parseCron(cronExpr);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "invalid cronExpr",
      };
    }
    return { ok: true, spec: { kind: "cron", cronExpr, timeZone } };
  }
  return { ok: false, reason: "spec.kind must be at, every, or cron" };
}
