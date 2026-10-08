import { test } from "node:test";
import assert from "node:assert/strict";
import { mqttManifest } from "../dist/index.js";

test("V-CH-8: mqtt is event-source with read credential scope", () => {
  assert.equal(mqttManifest.kind, "event-source");
  assert.equal(mqttManifest.configSchema.username?.credentialScope, "read");
});
