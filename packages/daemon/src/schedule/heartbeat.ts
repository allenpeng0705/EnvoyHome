// Design §19.10 / V-P2-AMB — heartbeat silent OK + interval floor.

/** Product constant — model reply (trimmed) that means "nothing to report". */
export const HEARTBEAT_OK = "HEARTBEAT_OK";

/** Household minimum interval (stampede / cost) — Doctor warns below this. */
export const MIN_HEARTBEAT_INTERVAL_MS = 15 * 60_000;

/** Default when Owner enables heartbeat without an interval. */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 60 * 60_000;

export const DEFAULT_HEARTBEAT_PROMPT =
  "Follow the heartbeat monitor context. Recurring tasks use schedules or standing orders — do not invent WHEN. If nothing needs attention, reply exactly HEARTBEAT_OK.";

/**
 * Max non-token remainder (chars) when HEARTBEAT_OK is at start or end.
 * Peer: OpenClaw heartbeat display strip (fixed 300-char budget).
 */
export const HEARTBEAT_OK_REMAINDER_BUDGET = 300;

/** Strip common markdown wrappers around the silent OK token. */
function stripHeartbeatWrappers(raw: string): string {
  let t = raw.trim();
  // Unwrap a single emphasis/code span if the whole reply is wrapped.
  const wrapped =
    /^\*\*?HEARTBEAT_OK\*\*?[.!]?\s*$/i.exec(t) ||
    /^`HEARTBEAT_OK`[.!]?\s*$/i.exec(t) ||
    /^~~HEARTBEAT_OK~~[.!]?\s*$/i.exec(t) ||
    /^<\/?b>HEARTBEAT_OK<\/?b>[.!]?\s*$/i.exec(t);
  if (wrapped) return HEARTBEAT_OK;
  return t;
}

/**
 * True when the reply is a quiet heartbeat ack (Design §19.10 / V-P2-AMB-1).
 * Accepts exact token, or token at start/end with ≤ {@link HEARTBEAT_OK_REMAINDER_BUDGET}
 * remainder (OpenClaw-aligned). Mid-string token alone is not silent.
 */
export function isHeartbeatSilentOk(reply: string): boolean {
  const t = stripHeartbeatWrappers(reply);
  if (!t) return false;
  const token = HEARTBEAT_OK;
  if (t === token || t === `${token}.` || t === `${token}!`) return true;

  // Start of reply: HEARTBEAT_OK[+punct] + optional remainder ≤ budget.
  const start = new RegExp(`^${token}[.!]?\\s*([\\s\\S]*)$`, "i").exec(t);
  if (start) {
    const rest = (start[1] ?? "").trim();
    return rest.length <= HEARTBEAT_OK_REMAINDER_BUDGET;
  }
  // End of reply: remainder + HEARTBEAT_OK[+punct]
  const end = new RegExp(`^([\\s\\S]*?)\\s*${token}[.!]?\\s*$`, "i").exec(t);
  if (end) {
    const rest = (end[1] ?? "").trim();
    // Avoid matching mid-token: require the token to be a whole trailing segment.
    if (rest.length <= HEARTBEAT_OK_REMAINDER_BUDGET && !rest.includes(token)) {
      return true;
    }
  }
  return false;
}

export function clampHeartbeatIntervalMs(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_HEARTBEAT_INTERVAL_MS;
  // Soft upper bound: 7 days
  return Math.min(Math.max(Math.floor(raw), 60_000), 7 * 24 * 60 * 60_000);
}
