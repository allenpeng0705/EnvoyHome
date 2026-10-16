// Tool policy + risk tiers (Design §4.3.2). Harness sees resolved catalogue only.

import type { TurnOrigin } from "./context.js";
import type { RiskTier } from "./approvals.js";

export type ToolPolicyPreset = "standard" | "restricted";

export interface ToolSpec {
  readonly name: string;
  readonly risk: RiskTier;
  /** When true, unattended dispatch requires a matching grant. */
  readonly grantable: boolean;
}

export const BUILTIN_TOOLS: Readonly<Record<string, ToolSpec>> = {
  read_file: { name: "read_file", risk: "read", grantable: false },
  write_file: { name: "write_file", risk: "write", grantable: true },
  exec: { name: "exec", risk: "exec", grantable: true },
  http_fetch: { name: "http_fetch", risk: "network", grantable: true },
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
  if (spec.risk === "read" || spec.risk === "write") return false;
  return true;
}

export function unattendedRequiresGrant(spec: ToolSpec, origin: TurnOrigin): boolean {
  if (origin !== "unattended") return false;
  if (spec.risk === "read" || spec.risk === "write") return false;
  return spec.grantable || spec.risk === "exec" || spec.risk === "network" || spec.risk === "admin";
}
