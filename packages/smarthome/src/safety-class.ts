// Data-driven safety class (Design §5.7.2). Regex withdrawn. Unknown ⇒ safety-class.

import { OBJECT_CLASSES, type ObjectClass } from "@envoyhome/protocol";

export const SAFETY_CLASSES = new Set<ObjectClass>([
  "lock",
  "garage",
  "gate",
  "valve",
  "alarm",
]);

/** Service deny list — never grant-satisfiable when paired with safety class / alone. */
export const SERVICE_DENY = new Set([
  "unlock",
  "alarm_disarm",
  "alarm_arm_night",
  "alarm_arm_away",
  "open",
  "open_cover",
  "open_valve",
  "set_cover_position",
  "set_cover_tilt_position",
  "toggle_cover_tilt",
  "stop_cover",
  "lock.open",
  "lock.unlock",
  "cover.open_cover",
  "cover.set_cover_position",
  "cover.set_cover_tilt_position",
  "cover.toggle_cover_tilt",
  "valve.open_valve",
  "alarm_control_panel.alarm_disarm",
  "alarm_control_panel.alarm_arm_night",
  "alarm_control_panel.alarm_arm_away",
  "update.install",
  "camera.turn_off",
]);

export const INDIRECTION_DOMAINS = new Set([
  "script",
  "scene",
  "button",
  "input_button",
  "automation",
]);

/** Domains with actuating services in Design §5.7.2 — outside ⇒ safety-class. */
const RECOGNISED_DOMAINS = new Set([
  "light",
  "switch",
  "cover",
  "lock",
  "valve",
  "alarm_control_panel",
  "climate",
  "fan",
  "media_player",
  "vacuum",
  "humidifier",
  "water_heater",
  "script",
  "scene",
  "button",
  "input_button",
  "automation",
  "mqtt",
]);

export interface SafetyInput {
  objectClass: string;
  domain?: string;
  service?: string;
  neverUnattended?: boolean;
  mqttTopicAllowed?: boolean;
  indirectionAllowListed?: boolean;
}

export interface SafetyDecision {
  safetyClass: boolean;
  reason: string;
}

export function isKnownObjectClass(cls: string): cls is ObjectClass {
  return (OBJECT_CLASSES as readonly string[]).includes(cls);
}

/**
 * Returns whether the call is in the safety class (must be attended every time).
 * Unknown object class ⇒ safety-class (fail closed).
 */
export function classifySafety(input: SafetyInput): SafetyDecision {
  if (!isKnownObjectClass(input.objectClass)) {
    return { safetyClass: true, reason: "unknown_object_class" };
  }
  if (SAFETY_CLASSES.has(input.objectClass)) {
    return { safetyClass: true, reason: `class:${input.objectClass}` };
  }
  if (input.neverUnattended === true) {
    return { safetyClass: true, reason: "neverUnattended" };
  }
  const service = input.service ?? "";
  if (SERVICE_DENY.has(service) || SERVICE_DENY.has(`${input.domain}.${service}`)) {
    return { safetyClass: true, reason: `service:${service}` };
  }
  if (input.domain && INDIRECTION_DOMAINS.has(input.domain) && !input.indirectionAllowListed) {
    return { safetyClass: true, reason: `indirection:${input.domain}` };
  }
  if (input.mqttTopicAllowed === false) {
    return { safetyClass: true, reason: "mqtt_topic_not_allowlisted" };
  }
  if (input.domain && !RECOGNISED_DOMAINS.has(input.domain)) {
    return { safetyClass: true, reason: `unknown_domain:${input.domain}` };
  }
  return { safetyClass: false, reason: "ok" };
}

/** Grants for safety-class actuation must be refused at creation (V-HA-5). */
export function grantRefusedForSafety(input: SafetyInput): boolean {
  return classifySafety(input).safetyClass;
}
