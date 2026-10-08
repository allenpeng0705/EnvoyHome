// Tool bundle declarations — each takes a resolved handle; actuation is admin.

import type { ResolvedObjectHandle } from "./object-resolver.js";
import { classifySafety, grantRefusedForSafety } from "./safety-class.js";

export type ToolTier = "read" | "sensitive" | "admin";

export interface ToolDecl {
  name: string;
  baseTier: ToolTier;
  idempotent: boolean;
}

export const HA_TOOLS: ToolDecl[] = [
  { name: "ha_list_entities", baseTier: "read", idempotent: true },
  { name: "ha_get_state", baseTier: "read", idempotent: true },
  { name: "ha_list_services", baseTier: "read", idempotent: true },
  { name: "ha_call_service", baseTier: "admin", idempotent: true },
];

export const MQTT_TOOLS: ToolDecl[] = [
  { name: "mqtt_subscribe", baseTier: "read", idempotent: true },
  { name: "mqtt_read", baseTier: "read", idempotent: true },
  { name: "mqtt_publish", baseTier: "admin", idempotent: true },
];

/** tierFor may only escalate. */
export function tierForGetState(handle: ResolvedObjectHandle): ToolTier {
  if (["lock", "alarm", "camera", "presence"].includes(handle.class)) return "sensitive";
  return "read";
}

export function assertActuationAllowed(input: {
  handle: ResolvedObjectHandle;
  domain: string;
  service: string;
  origin: "attended" | "unattended";
  hasGrant: boolean;
}): void {
  const decision = classifySafety({
    objectClass: input.handle.class,
    domain: input.domain,
    service: input.service,
    neverUnattended: input.handle.neverUnattended,
    indirectionAllowListed: input.handle.indirectionAllowList.includes(
      `${input.domain}.${input.service}`,
    ),
  });
  if (decision.safetyClass && input.origin === "unattended") {
    throw Object.assign(
      new Error(`envoyhome.actuation_never_unattended: ${decision.reason}`),
      { code: "actuation_never_unattended" },
    );
  }
  if (input.origin === "unattended" && !input.hasGrant && !decision.safetyClass) {
    throw Object.assign(new Error("envoyhome.actuation_not_granted"), {
      code: "actuation_not_granted",
    });
  }
  if (input.service.endsWith("toggle") && input.origin === "unattended") {
    throw Object.assign(new Error("envoyhome.actuation_non_idempotent"), {
      code: "actuation_non_idempotent",
    });
  }
}

/** Refuse broad or safety-class grants at creation (V-HA-5, V-HA-11). */
export function assertGrantCreatable(input: {
  tool: string;
  argsDigest: string;
  handle?: ResolvedObjectHandle;
  domain?: string;
  service?: string;
  mqttTopicAllowed?: boolean;
}): void {
  if (!input.argsDigest || input.argsDigest === "null" || input.argsDigest.length < 8) {
    throw Object.assign(new Error("envoyhome.grant_too_broad"), { code: "grant_too_broad" });
  }
  if (!input.handle) {
    throw Object.assign(new Error("envoyhome.grant_too_broad"), { code: "grant_too_broad" });
  }
  if (
    grantRefusedForSafety({
      objectClass: input.handle.class,
      neverUnattended: input.handle.neverUnattended,
      indirectionAllowListed: input.handle.indirectionAllowList.includes(
        `${input.domain ?? ""}.${input.service ?? ""}`,
      ),
      ...(input.domain !== undefined ? { domain: input.domain } : {}),
      ...(input.service !== undefined ? { service: input.service } : {}),
      ...(input.mqttTopicAllowed !== undefined
        ? { mqttTopicAllowed: input.mqttTopicAllowed }
        : {}),
    })
  ) {
    throw Object.assign(new Error("envoyhome.actuation_never_unattended"), {
      code: "actuation_never_unattended",
    });
  }
}
