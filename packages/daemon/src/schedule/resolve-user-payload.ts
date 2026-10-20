// Shared user schedule payload resolve + catalogue existence checks (Design §7.4).

import type { SchedulePayload } from "./types.js";
import { normalizeUserSchedulePayload } from "./validate-payload.js";

export async function resolveAndValidateUserSchedulePayload(opts: {
  raw: unknown;
  accountId: string;
  hasWorkflow: (workflowId: string, accountId: string) => boolean | Promise<boolean>;
  knownToolNames: Set<string> | Promise<Set<string>>;
}): Promise<SchedulePayload> {
  const parsed = normalizeUserSchedulePayload(opts.raw);
  if (!parsed.ok) {
    throw Object.assign(new Error(`envoyhome.bad_params: ${parsed.reason}`), {
      code: "bad_params",
    });
  }
  const payload = parsed.payload;
  if (payload.kind === "workflow") {
    const ok = await opts.hasWorkflow(payload.workflowId!, opts.accountId);
    if (!ok) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown workflow"), {
        code: "bad_params",
      });
    }
  }
  if (payload.kind === "tool") {
    const known = await opts.knownToolNames;
    if (!known.has(payload.toolName!)) {
      throw Object.assign(new Error("envoyhome.bad_params: unknown tool"), {
        code: "bad_params",
      });
    }
  }
  return payload;
}
