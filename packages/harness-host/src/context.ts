// TurnContext is built by the daemon (Design §6.1). Harness ≠ Provider.

export type TurnOrigin = "attended" | "unattended";

export interface TurnContext {
  account_id: string;
  agent_id: string;
  session_id: string;
  turn_id: string;
  sandbox_root: string;
  origin: TurnOrigin;
  standing_inject?: string;
  policy_snapshot: {
    origin: TurnOrigin;
    tool_policy: "standard" | "restricted";
    model_mode: "local" | "cloud" | "mix";
    /** Design §5.7.8 — smart-home tools + bound inject allowed this turn. */
    homeSurface?: boolean;
  };
}
