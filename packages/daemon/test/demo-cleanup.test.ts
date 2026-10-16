// Demo URL predicate — sticky demo:true alone must not count as "points at demo".

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configPointsAtDemoHa,
  configPointsAtDemoMqtt,
  isDemoHaUrl,
  isDemoMqttBrokerUrl,
} from "../dist/demo-cleanup.js";

test("isDemoHaUrl / configPointsAtDemoHa: URL not sticky flag", () => {
  assert.equal(isDemoHaUrl("http://127.0.0.1:18123"), true);
  assert.equal(isDemoHaUrl("http://localhost:18123/"), true);
  assert.equal(isDemoHaUrl("http://192.0.2.10:8123"), false);
  assert.equal(configPointsAtDemoHa({ demo: true, baseUrl: "http://192.0.2.10:8123" }), false);
  assert.equal(configPointsAtDemoHa({ demo: false, baseUrl: "http://127.0.0.1:18123" }), true);
  assert.equal(configPointsAtDemoHa({ demo: true }), false);
});

test("isDemoMqttBrokerUrl / configPointsAtDemoMqtt: URL not sticky flag", () => {
  assert.equal(isDemoMqttBrokerUrl("mqtt://127.0.0.1:18883"), true);
  assert.equal(isDemoMqttBrokerUrl("mqtt://localhost:18883"), true);
  assert.equal(isDemoMqttBrokerUrl("mqtt://192.0.2.10:1883"), false);
  assert.equal(
    configPointsAtDemoMqtt({ demo: true, brokerUrl: "mqtt://192.0.2.10:1883" }),
    false,
  );
  assert.equal(configPointsAtDemoMqtt({ demo: true }), false);
});
