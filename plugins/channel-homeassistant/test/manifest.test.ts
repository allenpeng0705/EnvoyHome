import { test } from "node:test";
import assert from "node:assert/strict";
import { haManifest } from "../dist/index.js";

test("V-CH-9: homeassistant is event-source read-only creds", () => {
  assert.equal(haManifest.kind, "event-source");
  assert.equal(haManifest.configSchema.accessToken?.credentialScope, "read");
});
