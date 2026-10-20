// Tool policy + risk tiers (Design §4.3.2). Harness sees resolved catalogue only.

import type { TurnOrigin } from "./context.js";
import type { RiskTier } from "./approvals.js";

export type ToolPolicyPreset = "standard" | "restricted";

export interface ToolSpec {
  readonly name: string;
  readonly risk: RiskTier;
  /** When true, unattended dispatch requires a matching grant. */
  readonly grantable: boolean;
  /**
   * When true, attended turns skip the approval prompt (Design §9.5f web_search).
   * Unattended + restricted still apply grant / deny rules.
   */
  readonly attendedAllow?: boolean;
  /**
   * When true, attended turns always prompt (overrides write/read auto-allow).
   * Used by `schedule` confirm arming (Design §7.4 V-CRON-9).
   */
  readonly attendedAsk?: boolean;
}

export const BUILTIN_TOOLS: Readonly<Record<string, ToolSpec>> = {
  read_file: { name: "read_file", risk: "read", grantable: false },
  write_file: { name: "write_file", risk: "write", grantable: true },
  /** Design §9.5e — one-level directory list through the path jail. */
  list_dir: { name: "list_dir", risk: "read", grantable: false },
  /** Design §9.5e — basename glob/substring search under sandbox/workspace. */
  search_files: { name: "search_files", risk: "read", grantable: false },
  /** Design §9.5b — Markdown → docx/xlsx/csv/pdf under output/exports/. */
  export_document: { name: "export_document", risk: "write", grantable: true },
  /** Design §9.5c — sandbox Office/PDF → GFM under output/extracts/. */
  extract_document: { name: "extract_document", risk: "write", grantable: true },
  exec: { name: "exec", risk: "exec", grantable: true },
  http_fetch: { name: "http_fetch", risk: "network", grantable: true },
  /** Design §9.5f — household web search (attendedAllow when enabled). */
  web_search: {
    name: "web_search",
    risk: "network",
    grantable: true,
    attendedAllow: true,
  },
  /** Design §9.5g — OpenClaw-adapted browser control (always ask when attended). */
  browser: {
    name: "browser",
    risk: "network",
    grantable: true,
  },
  /** Design §7.4 V-CRON-9 — chat-native propose → confirm (ask on confirm; no silent arm). */
  schedule: {
    name: "schedule",
    risk: "write",
    grantable: true,
  },
};

/** Extra specs registered by the daemon (HA/MQTT, etc.). */
const EXTRA_TOOLS = new Map<string, ToolSpec>();

export function registerToolSpec(spec: ToolSpec): void {
  EXTRA_TOOLS.set(spec.name, spec);
}

export function clearExtraToolSpecsForTests(): void {
  EXTRA_TOOLS.clear();
}

export function toolSpec(name: string): ToolSpec | undefined {
  if (BUILTIN_TOOLS[name]) return BUILTIN_TOOLS[name];
  const extra = EXTRA_TOOLS.get(name);
  if (extra) return extra;
  // Verified skills appear as skill:<id> — read-tier prompt packs.
  if (name.startsWith("skill:") && name.length > "skill:".length) {
    return { name, risk: "read", grantable: false };
  }
  return undefined;
}

export interface PolicySnapshot {
  origin: TurnOrigin;
  tool_policy: ToolPolicyPreset;
  model_mode: "local" | "cloud" | "mix";
  /** Design §5.7.8 — smart-home tools + bound inject allowed this turn. */
  homeSurface?: boolean;
  /** Design §7.4 — Schedules chat: only the schedule tool. */
  schedulesSurface?: boolean;
}

/** Restricted policy blocks exec/network tools entirely (V-HAR-4 uses standard + approval). */
export function execPolicyAllows(_origin: TurnOrigin, preset: ToolPolicyPreset): boolean {
  return preset !== "restricted";
}

/** Attended turns prompt before side-effecting tiers (policy=ask for exec/network). */
export function requiresAttendedApproval(
  spec: ToolSpec,
  origin: TurnOrigin,
  _preset: ToolPolicyPreset,
): boolean {
  if (origin === "unattended") return false;
  if (spec.attendedAsk === true) return true;
  if (spec.risk === "read" || spec.risk === "write") return false;
  // Design §9.5f — web_search attendedAllow (http_fetch still asks).
  if (spec.attendedAllow === true) return false;
  return true;
}

export function unattendedRequiresGrant(spec: ToolSpec, origin: TurnOrigin): boolean {
  if (origin !== "unattended") return false;
  // V-CRON-9 — arming a schedule from unattended always needs a grant.
  if (spec.name === "schedule" && spec.grantable) return true;
  if (spec.risk === "read" || spec.risk === "write") return false;
  return spec.grantable || spec.risk === "exec" || spec.risk === "network" || spec.risk === "admin";
}
