// V-UX-14 — turn a schedule_candidates choice into proposeFromText attempts.
// Prefer the picked WHEN alone; never let ambiguous tokens in the original
// utterance (e.g. "this weekend") shadow Saturday vs Sunday.

import { extractScheduleMessage } from "./resolve-nl.js";

/**
 * Ordered propose texts for a schedule candidate answer.
 * First success wins; callers should pass extractScheduleMessage(detail) as
 * proposeFromText `message` when the attempt has no notify body of its own.
 */
export function scheduleCandidateProposeAttempts(
  detail: string,
  whenLabel: string,
): string[] {
  const when = whenLabel.trim();
  const base = detail.trim();
  const out: string[] = [];
  if (when) out.push(when);
  if (base && when) {
    const msg = extractScheduleMessage(base);
    if (msg && msg !== "Reminder") {
      out.push(`Remind me ${when} to ${msg}`);
      out.push(`提醒我${when}${msg}`);
    } else {
      out.push(`Remind me ${when}`);
      out.push(`提醒我${when}`);
    }
  } else if (base) {
    out.push(base);
  }
  return [...new Set(out.filter((s) => s.length > 0))];
}

export { extractScheduleMessage };
