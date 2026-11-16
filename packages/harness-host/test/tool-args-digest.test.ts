// Create-time HA grants must match runtime digests (Design §4.4 / 2026-11-13b).

import { test } from "node:test";
import assert from "node:assert/strict";
import { toolArgsDigest } from "../dist/approvals.js";

test("ha_call_service digest ignores extra args fields", () => {
  const base = toolArgsDigest("ha_call_service", {
    objectId: "homeassistant:light.living_room",
    domain: "light",
    service: "turn_on",
  });
  const withExtra = toolArgsDigest("ha_call_service", {
    objectId: "homeassistant:light.living_room",
    domain: "light",
    service: "turn_on",
    brightness: 200,
    entity_id: "light.living_room",
  });
  assert.equal(base, withExtra);
  assert.match(base, /^sha256:[a-f0-9]{64}$/);
});

test("ha_call_service on vs off digests differ", () => {
  const on = toolArgsDigest("ha_call_service", {
    objectId: "homeassistant:light.living_room",
    domain: "light",
    service: "turn_on",
  });
  const off = toolArgsDigest("ha_call_service", {
    objectId: "homeassistant:light.living_room",
    domain: "light",
    service: "turn_off",
  });
  assert.notEqual(on, off);
});
