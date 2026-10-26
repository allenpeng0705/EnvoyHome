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
  /**
   * Design §19.9 / V-P2-EDIT — surgical replace (unique oldString or line range).
   * Unattended requires a grant (see unattendedRequiresGrant).
   */
  edit_file: { name: "edit_file", risk: "write", grantable: true },
  /**
   * Design §19.9 / V-P2-EDIT — single-file unified diff under the path jail.
   * Unattended requires a grant (see unattendedRequiresGrant).
   */
  apply_patch: { name: "apply_patch", risk: "write", grantable: true },
  /** Design §9.5e — one-level directory list through the path jail. */
  list_dir: { name: "list_dir", risk: "read", grantable: false },
  /** Design §9.5e — basename glob/substring search under sandbox/workspace. */
  search_files: { name: "search_files", risk: "read", grantable: false },
  /** Knowledge-RAG Doc KB search. */
  knowledge_search: { name: "knowledge_search", risk: "read", grantable: false },
  /** Knowledge-RAG KnowYou episodic search. */
  knowyou_search: { name: "knowyou_search", risk: "read", grantable: false },
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
  /**
   * Design V-UX-14 — EnvoyCoder ask_user peer.
   * Parks the turn on a choice card (one / many / text); not a tool approval.
   */
  ask_user: {
    name: "ask_user",
    risk: "read",
    grantable: false,
  },
  /** Design §19.11 — send to a bound chat target (same account). */
  message: {
    name: "message",
    risk: "network",
    grantable: true,
  },
  /** Design §19.11 — list sessions for the turn's account (capped). */
  sessions_list: {
    name: "sessions_list",
    risk: "read",
    grantable: false,
  },
  /** Design §19.11 — capped transcript for a same-account session. */
  sessions_history: {
    name: "sessions_history",
    risk: "read",
    grantable: false,
  },
  /** Design §19.11 — coarse session status. */
  sessions_status: {
    name: "sessions_status",
    risk: "read",
    grantable: false,
  },
  /**
   * Design §19.11 — inject text into another same-account session (no swarm).
   * Attended ask; unattended requires grant.
   */
  sessions_send: {
    name: "sessions_send",
    risk: "write",
    grantable: true,
    attendedAsk: true,
  },
  /** Design §19.12 D1 — describe / metadata (+ optional vision) for jail images. */
  view_image: {
    name: "view_image",
    risk: "read",
    grantable: false,
  },
  /**
   * Design §19.12 D2 — generate image under output/media/ (Owner enable + Privacy Mode).
   * Attended ask; unattended requires grant; Privacy Mode blocks in tool body.
   */
  image_generate: {
    name: "image_generate",
    risk: "network",
    grantable: true,
    attendedAsk: true,
  },
  /**
   * Design §9.2 (`2026-10-22a`) — progressive skill disclosure (Hermes Adapt).
   * Verified+enabled catalogue only; no bodies.
   */
  skills_list: {
    name: "skills_list",
    risk: "read",
    grantable: false,
  },
  /**
   * Design §9.2 (`2026-10-22a`) — load SKILL.md or references/ under skill root (path jail).
   */
  skill_view: {
    name: "skill_view",
    risk: "read",
    grantable: false,
  },
  /**
   * Design §9.2 (`2026-10-22b`) — enqueue skill create/patch/delete as PendingLearn only.
   * Never writes SKILL.md; accept → SkillService unverified until verifySkill.
   */
  skill_propose: {
    name: "skill_propose",
    risk: "write",
    grantable: true,
  },
  /**
   * Design §19.13 — turn-scoped helper with reduced allow-list; inherits origin.
   * Unattended requires a grant (cannot launder admin). Thin wrapper over `task`.
   */
  spawn_helper: {
    name: "spawn_helper",
    risk: "exec",
    grantable: true,
  },
  /**
   * Design §19.13 P2-E2 — harness-style parallel sub-agents (caps/batching).
   * Unattended requires a grant (cannot launder admin).
   */
  task: {
    name: "task",
    risk: "exec",
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
  // V-P2-EDIT-2 — surgical edit/patch from unattended always needs a grant.
  if ((spec.name === "edit_file" || spec.name === "apply_patch") && spec.grantable) {
    return true;
  }
  // V-P2-AGENT-1 — helpers from unattended always need a grant (no origin launder).
  if ((spec.name === "spawn_helper" || spec.name === "task") && spec.grantable) {
    return true;
  }
  // V-P2-MSG-3 / V-P2-MEDIA-2 — cross-session inject + generate always need a grant unattended.
  if ((spec.name === "sessions_send" || spec.name === "image_generate") && spec.grantable) {
    return true;
  }
  if (spec.risk === "read" || spec.risk === "write") return false;
  return spec.grantable || spec.risk === "exec" || spec.risk === "network" || spec.risk === "admin";
}
