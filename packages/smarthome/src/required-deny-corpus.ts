// Appendix C.4 required-deny corpus (V-HA-19). Post-resolution classifier inputs.

import type { SafetyInput } from "./safety-class.js";

export interface RequiredDenyCase {
  readonly id: string;
  readonly input: SafetyInput;
  readonly note?: string;
}

/** Rows that MUST deny unattended actuation and refuse grants at creation. */
export const REQUIRED_DENY_CORPUS: readonly RequiredDenyCase[] = [
  {
    id: "c4-1-lock-unlock",
    input: { objectClass: "light", domain: "lock", service: "unlock" },
    note: "control — lock.unlock on ordinary class still hits deny list",
  },
  {
    id: "c4-2-lock-open",
    input: { objectClass: "light", domain: "lock", service: "open" },
  },
  {
    id: "c4-3-cover-open-garage",
    input: { objectClass: "garage", domain: "cover", service: "open_cover" },
  },
  {
    id: "c4-4-cover-set-position",
    input: { objectClass: "garage", domain: "cover", service: "set_cover_position" },
  },
  {
    id: "c4-4a-cover-tilt-position",
    input: { objectClass: "gate", domain: "cover", service: "set_cover_tilt_position" },
  },
  {
    id: "c4-4b-toggle-cover-tilt",
    input: { objectClass: "garage", domain: "cover", service: "toggle_cover_tilt" },
  },
  {
    id: "c4-5-valve-open",
    input: { objectClass: "valve", domain: "valve", service: "open_valve" },
  },
  {
    id: "c4-6-alarm-disarm",
    input: { objectClass: "alarm", domain: "alarm_control_panel", service: "alarm_disarm" },
  },
  {
    id: "c4-6a-alarm-arm-night",
    input: { objectClass: "alarm", domain: "alarm_control_panel", service: "alarm_arm_night" },
  },
  {
    id: "c4-6b-alarm-arm-away",
    input: { objectClass: "alarm", domain: "alarm_control_panel", service: "alarm_arm_away" },
  },
  {
    id: "c4-7-script-indirection",
    input: {
      objectClass: "light",
      domain: "script",
      service: "turn_on",
      indirectionAllowListed: false,
    },
  },
  {
    id: "c4-7a-automation-trigger",
    input: {
      objectClass: "light",
      domain: "automation",
      service: "trigger",
      indirectionAllowListed: false,
    },
  },
  {
    id: "c4-7b-input-button-press",
    input: {
      objectClass: "light",
      domain: "input_button",
      service: "press",
      indirectionAllowListed: false,
    },
  },
  {
    id: "c4-8-scene-turn-on",
    input: {
      objectClass: "light",
      domain: "scene",
      service: "turn_on",
      indirectionAllowListed: false,
    },
  },
  {
    id: "c4-9-button-press",
    input: {
      objectClass: "light",
      domain: "button",
      service: "press",
      indirectionAllowListed: false,
    },
  },
  {
    id: "c4-10-toggle-on-lock-class",
    input: { objectClass: "lock", domain: "light", service: "toggle" },
  },
  {
    id: "c4-11-mqtt-unlisted",
    input: { objectClass: "light", mqttTopicAllowed: false },
  },
  {
    id: "c4-12-unknown-class",
    input: { objectClass: "weird_vendor_thing" },
  },
  {
    id: "c4-14-never-unattended",
    input: { objectClass: "light", domain: "light", service: "turn_on", neverUnattended: true },
  },
  {
    id: "c4-15-lock-class-any-service",
    input: { objectClass: "lock", domain: "light", service: "turn_on" },
  },
  {
    id: "c4-15-alarm-class",
    input: { objectClass: "alarm", domain: "light", service: "turn_on" },
  },
  {
    id: "c4-13-unknown-domain",
    input: { objectClass: "light", domain: "esphome", service: "turn_on" },
  },
];

export const APPENDIX_C4_REQUIRED_IDS = REQUIRED_DENY_CORPUS.map((c) => c.id);
