// @envoyhome/protocol — product error namespace.
//
// Design §3.1: `error.code` is a **string from the transport's closed
// catalogue** (`@envoymesh/host-connect/src/rpc-error-code.ts`), NOT the
// JSON-RPC numeric convention. So EnvoyHome namespaces the *message* instead:
//
//     { code: "<transport code>", message: "envoyhome.<snake>: detail" }
//
// Two consequences this module exists to enforce:
//   1. The `envoyhome.*` set is a CLOSED catalogue. A typo in an error name
//      would produce a string no client switches on, so unknown names are a
//      compile error via `EnvoyHomeErrorName`.
//   2. EnvoyCoder's error object adds `messageKey?` / `messageValues?` for i18n
//      (Design §3.1). We MUST tolerate those on inbound errors and SHOULD emit
//      them when we have a localized string — hence the parser here rather than
//      a bare `{ code, message }` interface.

import type { JsonRpcError } from "@envoymesh/protocol";

/** Every `envoyhome.*` message prefix in the design, with the rule that raises it. */
export const ENVOYHOME_ERRORS = {
  auth: "authentication/authorization failure; detail says which (missing_token, bad_token, …)",
  version_too_low:
    "client sent a method this daemon no longer has (Design §3.7 rule 4); also used for a plugin newer than the daemon",
  bad_params: "params failed the method's Appendix A schema (Design §3.7 rule 4)",
  account_not_bound: "the device/principal is not bound to the account it named (Design §4.1)",
  pairing_app_mismatch:
    "a pairing code was minted by another product; raised by `pairingAppMismatch` at pair time (Design §3.1, V-RPC-4)",
  approval_expired: "the approval's TTL passed; resolves as DENY, never allow (Design §4.4)",
  approval_mismatch:
    "`home.answerApproval` did not echo the `argsDigest` the human was shown (Design A.5, V-HA-20)",
  approval_not_yours: "the approval belongs to another account (Design A.5)",
  approval_resolved: "a second answer for an already-resolved approval — no replay (Design A.5)",
  grant_too_broad:
    "a grant for an `admin`/`sensitive` tool was requested with a `null` or short digest (Design §4.4, V-SEC-10)",
  grant_expired: "the grant expired or was revoked between check and dispatch (Design §4.4, V-HA-12)",
  actuation_not_granted: "unattended actuation with no matching, unexpired grant (Design §5.7.2)",
  actuation_never_unattended:
    "the call is in the §5.7.2 safety class; refused at creation AND at dispatch (Design §4.4)",
  actuation_non_idempotent:
    "a non-idempotent service (`*.toggle`) was requested on an unattended turn (Design §5.7.7)",
  actuation_in_flight: "another actuation for the same object is in flight (Design §5.7.7)",
  object_not_bound:
    "the object is unknown, unregistered, foreign, or bound to another account — reads included (Design §5.7.3)",
  object_unknown: "`home.setSourceBinding` named a `sourceId` the daemon has never seen (Design A.3)",
  object_not_shareable:
    "`shared: true` was requested for a presence-revealing class (lock/alarm/camera/presence) (Design §5.7.3)",
  smarthome_auth_expired: "the Home Assistant token or broker credentials expired (Design §5.7.2)",
  smarthome_device_unavailable: "the target object is offline/`unavailable` (Design §5.7.2)",
  privacy_local_unavailable:
    "a privacy-tagged turn (or a `sensitive` result) cannot be served locally and the mode is `cloud` (Design §8.3, §4.3.2)",
  policy_unknown_field: "`policy.json` was written with an unknown key (Design §8.3)",
  learn_stale: "a PendingLearn's base moved; re-validate or re-review (Memory Design §7.2)",
} as const;

export type EnvoyHomeErrorName = keyof typeof ENVOYHOME_ERRORS;

/** The namespaced message prefix for a known error. */
export function errorMessage(name: EnvoyHomeErrorName, detail: string): string {
  return detail.length > 0 ? `envoyhome.${name}: ${detail}` : `envoyhome.${name}`;
}

/** A localized error payload, mirroring EnvoyCoder's i18n allowance (Design §3.1). */
export interface EnvoyHomeErrorExtra {
  messageKey?: string;
  messageValues?: Record<string, string | number>;
}

/** Build a wire error. `code` is the TRANSPORT code, not the product name. */
export function makeError(
  transportCode: string,
  name: EnvoyHomeErrorName,
  detail = "",
  extra: EnvoyHomeErrorExtra = {},
): JsonRpcError & EnvoyHomeErrorExtra {
  const err: JsonRpcError & EnvoyHomeErrorExtra = {
    code: transportCode,
    message: errorMessage(name, detail),
  };
  if (extra.messageKey !== undefined) err.messageKey = extra.messageKey;
  if (extra.messageValues !== undefined) err.messageValues = extra.messageValues;
  return err;
}

export interface ParsedEnvoyHomeError {
  /** The `envoyhome.*` name, when the message is one we know. */
  name?: EnvoyHomeErrorName;
  /** Everything after `"envoyhome.<name>: "` (empty string when absent). */
  detail: string;
  /** The transport-level code, passed through untouched. */
  code: string;
  message: string;
  messageKey?: string;
  messageValues?: Record<string, string | number>;
}

/**
 * Parse an inbound error. Never throws: an error we do not recognise is still a
 * valid error, and a client must not crash on one (Design §3.7 rule 5).
 */
export function parseError(error: JsonRpcError & EnvoyHomeErrorExtra): ParsedEnvoyHomeError {
  const message = typeof error.message === "string" ? error.message : "";
  const parsed: ParsedEnvoyHomeError = {
    detail: "",
    code: String(error.code ?? ""),
    message,
  };
  const match = /^envoyhome\.([a-z_]+)(?::\s*([\s\S]*))?$/.exec(message);
  if (match) {
    const [, rawName, rawDetail] = match;
    if (rawName !== undefined && rawName in ENVOYHOME_ERRORS) {
      parsed.name = rawName as EnvoyHomeErrorName;
    }
    parsed.detail = rawDetail ?? "";
  }
  if (typeof error.messageKey === "string") parsed.messageKey = error.messageKey;
  if (error.messageValues !== undefined) parsed.messageValues = error.messageValues;
  return parsed;
}

/** True when the error is a specific `envoyhome.*` name. */
export function isError(
  error: JsonRpcError & EnvoyHomeErrorExtra,
  name: EnvoyHomeErrorName,
): boolean {
  return parseError(error).name === name;
}

/** The transport code used for a params failure (Design §3.7 rule 4). */
export const TRANSPORT_CODE_BAD_PARAMS = "BAD_PARAMS" as const;
/** The transport code used for an auth failure. */
export const TRANSPORT_CODE_UNAUTHORIZED = "UNAUTHORIZED" as const;
