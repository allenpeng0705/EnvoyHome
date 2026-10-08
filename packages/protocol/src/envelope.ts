// @envoyhome/protocol — envelope helpers.
//
// The SHAPES live in `@envoymesh/protocol` (Design §3.1) and are adopted, not
// re-invented. What this module adds is the EnvoyHome-specific behaviour layered
// on them:
//
//   * numeric `id` preservation — the type says `string`, the runtime keeps the
//     caller's JS type, because a reply that changes `42` into `"42"` breaks
//     every JSON-RPC client in the field (Design §3.1);
//   * `messageKey` / `messageValues` tolerance on inbound errors (Design §3.1);
//   * method/event validation against the Appendix A catalogue, with
//     `envoyhome.version_too_low` for a method this daemon does not have and
//     `envoyhome.bad_params` for params that fail the schema (Design §3.7 r4).

import type { JsonRpcError, JsonRpcEvent, JsonRpcRequest, JsonRpcResponse } from "@envoymesh/protocol";

import {
  parseError,
  TRANSPORT_CODE_BAD_PARAMS,
  TRANSPORT_CODE_UNAUTHORIZED,
  makeError,
  type EnvoyHomeErrorExtra,
  type EnvoyHomeErrorName,
} from "./errors.js";
import { EVENTS, isKnownEvent } from "./events.js";
import { isKnownMethod, METHODS } from "./methods.js";
import { validate, type JsonSchema, type ValidationIssue } from "./schema.js";

/** A JSON-RPC id as it actually appears on the wire. */
export type RpcId = string | number;

export interface HomeRequest {
  id: RpcId;
  method: string;
  params?: Record<string, unknown>;
}

export type HomeResponse =
  | { id: RpcId; result: unknown }
  | { id: RpcId; error: JsonRpcError & EnvoyHomeErrorExtra };

export interface HomeEvent {
  event: string;
  data: unknown;
}

/* ------------------------------------------------------------- construction */

export function makeRequest(
  id: RpcId,
  method: string,
  params?: Record<string, unknown>,
): HomeRequest {
  return params === undefined ? { id, method } : { id, method, params };
}

export function makeResult(id: RpcId, result: unknown): HomeResponse {
  return { id, result };
}

export function makeErrorResponse(
  id: RpcId,
  transportCode: string,
  name: EnvoyHomeErrorName,
  detail = "",
  extra: EnvoyHomeErrorExtra = {},
): HomeResponse {
  return { id, error: makeError(transportCode, name, detail, extra) };
}

export function badParams(id: RpcId, method: string, issues: ValidationIssue[]): HomeResponse {
  return makeErrorResponse(
    id,
    TRANSPORT_CODE_BAD_PARAMS,
    "bad_params",
    `${method} ${issues.map((i) => `${i.path === "" ? "/" : i.path} ${i.message}`).join("; ")}`,
  );
}

export function unauthorized(id: RpcId, detail = "missing_token"): HomeResponse {
  return makeErrorResponse(id, TRANSPORT_CODE_UNAUTHORIZED, "auth", detail);
}

export function makeEvent(event: string, data: unknown): HomeEvent {
  return { event, data };
}

/* ------------------------------------------------------------- envelope checks */

const isRpcId = (v: unknown): v is RpcId =>
  typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

/** Structural check on an inbound request. Returns issues, never throws. */
export function validateRequestEnvelope(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [{ path: "", message: "must be an object" }];
  }
  const req = value as Record<string, unknown>;
  if (!isRpcId(req["id"])) issues.push({ path: "/id", message: "must be a string or a finite number" });
  if (typeof req["method"] !== "string" || req["method"].length === 0) {
    issues.push({ path: "/method", message: "must be a non-empty string" });
  }
  if ("params" in req && req["params"] !== undefined) {
    const p = req["params"];
    if (typeof p !== "object" || p === null || Array.isArray(p)) {
      issues.push({ path: "/params", message: "must be an object when present" });
    }
  }
  return issues;
}

/** A response carries `result` XOR `error` — never both, never neither. */
export function validateResponseEnvelope(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [{ path: "", message: "must be an object" }];
  }
  const res = value as Record<string, unknown>;
  if (!isRpcId(res["id"])) issues.push({ path: "/id", message: "must be a string or a finite number" });
  const hasResult = "result" in res && res["result"] !== undefined;
  const hasError = "error" in res && res["error"] !== undefined;
  if (hasResult && hasError) issues.push({ path: "", message: "must not carry both result and error" });
  if (!hasResult && !hasError) issues.push({ path: "", message: "must carry either result or error" });
  if (hasError) {
    const err = res["error"];
    if (typeof err !== "object" || err === null) {
      issues.push({ path: "/error", message: "must be an object" });
    } else {
      const e = err as Record<string, unknown>;
      if (typeof e["code"] !== "string" || e["code"].length === 0) {
        issues.push({ path: "/error/code", message: "must be a non-empty transport code string" });
      }
      if (typeof e["message"] !== "string") {
        issues.push({ path: "/error/message", message: "must be a string" });
      }
      // messageKey / messageValues are OPTIONAL and tolerated (Design §3.1).
      if ("messageValues" in e && e["messageValues"] !== undefined) {
        const mv = e["messageValues"];
        if (typeof mv !== "object" || mv === null || Array.isArray(mv)) {
          issues.push({ path: "/error/messageValues", message: "must be an object when present" });
        }
      }
    }
  }
  return issues;
}

export function validateEventEnvelope(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [{ path: "", message: "must be an object" }];
  }
  const ev = value as Record<string, unknown>;
  if (typeof ev["event"] !== "string" || ev["event"].length === 0) {
    issues.push({ path: "/event", message: "must be a non-empty string" });
  } else if (!isKnownEvent(ev["event"])) {
    issues.push({ path: "/event", message: `unknown event "${String(ev["event"])}"` });
  }
  if (!("data" in ev)) issues.push({ path: "/data", message: "is required" });
  return issues;
}

/* -------------------------------------------------------- catalogue validation */

export interface MethodValidation {
  ok: boolean;
  /** Set when the method itself is unknown — the §3.7 rule 4 case. */
  unknownMethod: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate `params` for a method.
 *
 * An unknown method is reported separately from bad params, because the daemon
 * must answer `envoyhome.version_too_low` (old client / new daemon) rather than
 * a generic "unknown method" (Design §3.7 rule 4).
 */
export function validateMethodParams(method: string, params: unknown): MethodValidation {
  if (!isKnownMethod(method)) {
    return { ok: false, unknownMethod: true, issues: [{ path: "", message: `unknown method` }] };
  }
  const spec = METHODS[method]!;
  if (params === undefined) {
    return spec.paramsOptional
      ? { ok: true, unknownMethod: false, issues: [] }
      : {
          ok: false,
          unknownMethod: false,
          issues: [{ path: "", message: "params is required for this method" }],
        };
  }
  const issues = validate(spec.params, params, "/params");
  return { ok: issues.length === 0, unknownMethod: false, issues };
}

export function validateMethodResult(method: string, result: unknown): ValidationIssue[] {
  const spec = METHODS[method];
  if (spec === undefined) return [{ path: "", message: `unknown method "${method}"` }];
  return validate(spec.result, result, "/result");
}

export function validateEventData(event: string, data: unknown): ValidationIssue[] {
  const spec = EVENTS[event];
  if (spec === undefined) return [{ path: "", message: `unknown event "${event}"` }];
  return validate(spec.data, data, "/data");
}

/** The full inbound check a router performs: envelope, then catalogue. */
export function validateInbound(value: unknown): {
  envelopeIssues: ValidationIssue[];
  method?: string;
  params?: unknown;
  id?: RpcId;
} {
  const envelopeIssues = validateRequestEnvelope(value);
  if (envelopeIssues.length > 0) return { envelopeIssues };
  const req = value as JsonRpcRequest & { id: RpcId };
  return { envelopeIssues, method: req.method, params: req.params, id: req.id };
}

/* ------------------------------------------------------------------- aliases */

/**
 * Adopt the family envelope types verbatim, so a caller that already depends on
 * `@envoymesh/protocol` needs no adaptor. `id` is widened to `RpcId` because the
 * runtime preserves a numeric id (Design §3.1).
 */
export type FamilyRequest = Omit<JsonRpcRequest, "id"> & { id: RpcId };
export type FamilyResponse = Omit<JsonRpcResponse, "id"> & { id: RpcId };
export type FamilyEvent = JsonRpcEvent;
export type FamilyError = JsonRpcError & EnvoyHomeErrorExtra;

export { parseError };
