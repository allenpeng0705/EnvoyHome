// V-UX-15 / Design §19.8 — household scene templates → standing orders.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCENE_TEMPLATES,
  assertPresenceSceneAllowed,
  buildStandingOrderFromScene,
  isSceneStandingOrderId,
  normalizeSceneSourceId,
} from "../public/scenes-model.js";

test("V-UX-15: scene templates include cron and presence-aware leave/arrive", () => {
  assert.ok(SCENE_TEMPLATES.length >= 4);
  assert.ok(SCENE_TEMPLATES.some((t) => t.id === "good_morning" && !t.presenceAware));
  assert.ok(SCENE_TEMPLATES.some((t) => t.id === "leave_home" && t.presenceAware));
});

test("V-UX-15: presence scenes refuse without Privacy Mode egress block", () => {
  assert.equal(assertPresenceSceneAllowed(null).ok, false);
  assert.equal(assertPresenceSceneAllowed({ enabled: false }).ok, false);
  assert.equal(
    assertPresenceSceneAllowed({ enabled: true, blockSmartHomeEgress: false }).ok,
    false,
  );
  assert.equal(
    assertPresenceSceneAllowed({ enabled: true, blockSmartHomeEgress: true }).ok,
    true,
  );
});

test("V-UX-15: buildStandingOrderFromScene produces cron + agentTurn payload", () => {
  const tpl = SCENE_TEMPLATES.find((t) => t.id === "good_morning");
  assert.ok(tpl);
  const order = buildStandingOrderFromScene(tpl, { name: "Morning lights" });
  assert.equal(order.name, "Morning lights");
  assert.equal(order.when.kind, "cron");
  assert.equal(order.action.kind, "agentTurn");
  assert.ok(isSceneStandingOrderId(order.id));
});

test("V-UX-15: presence scene requires sourceId", () => {
  const tpl = SCENE_TEMPLATES.find((t) => t.id === "leave_home");
  assert.ok(tpl);
  assert.throws(() => buildStandingOrderFromScene(tpl, {}), /sourceId/);
  const order = buildStandingOrderFromScene(tpl, {
    sourceId: "binary_sensor.anyone_home",
  });
  assert.equal(order.when.kind, "smarthome_event");
  assert.equal(order.when.sourceId, "binary_sensor.anyone_home");
  assert.equal(order.presenceAware, true);
});

test("V-UX-15: normalizeSceneSourceId strips channel: object handles", () => {
  assert.equal(normalizeSceneSourceId("ha:binary_sensor.x"), "binary_sensor.x");
  assert.equal(normalizeSceneSourceId("mqtt:home/lamp"), "home/lamp");
  assert.equal(normalizeSceneSourceId("binary_sensor.x"), "binary_sensor.x");
  const tpl = SCENE_TEMPLATES.find((t) => t.id === "arrive_home");
  assert.ok(tpl);
  const order = buildStandingOrderFromScene(tpl, {
    sourceId: "homeassistant:binary_sensor.front",
  });
  assert.equal(order.when.sourceId, "binary_sensor.front");
});
