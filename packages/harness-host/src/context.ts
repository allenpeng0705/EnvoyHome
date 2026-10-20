// TurnContext is built by the daemon (Design §6.1). Harness ≠ Provider.

export type TurnOrigin = "attended" | "unattended";

export interface TurnContext {
  account_id: string;
  agent_id: string;
  session_id: string;
  turn_id: string;
  sandbox_root: string;
  /** Design §4.2.1 — absolute host workspace root, or null/omit when unset. */
  workspace_root?: string | null;
  /** Design §4.2.1 — `ro` | `rw` when workspace_root is set. */
  workspace_mode?: "ro" | "rw" | null;
  /** Design §4.2.1 multi-folder — named mounts; `workspace/<id>/…`. */
  workspace_mounts?: Array<{ id: string; host_path: string; mode: "ro" | "rw" }>;
  origin: TurnOrigin;
  standing_inject?: string;
  policy_snapshot: {
    origin: TurnOrigin;
    tool_policy: "standard" | "restricted";
    model_mode: "local" | "cloud" | "mix";
    /** Design §5.7.8 — smart-home tools + bound inject allowed this turn. */
    homeSurface?: boolean;
    /** Design §7.4 — Schedules chat: only the schedule tool. */
    schedulesSurface?: boolean;
  };
}
