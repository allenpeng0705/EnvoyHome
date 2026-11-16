// Schedule/Scenes use MixRouter; forceLocalForEventSource is event-source only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldForceLocal } from "../dist/policy-store.js";

const base = {
  privacyEnabled: false,
  forceLocalForMedia: true,
  hasMedia: false,
  forceLocalForEventSource: true,
  privacyTagged: false,
};

test("schedule unattended does not force local via forceLocalForEventSource", () => {
  assert.equal(
    shouldForceLocal({ ...base, callerKind: "schedule" }),
    false,
  );
  assert.equal(
    shouldForceLocal({ ...base, callerKind: "desktop" }),
    false,
  );
});

test("event-source still forces local when forceLocalForEventSource is true", () => {
  assert.equal(
    shouldForceLocal({ ...base, callerKind: "event-source" }),
    true,
  );
  assert.equal(
    shouldForceLocal({
      ...base,
      forceLocalForEventSource: false,
      callerKind: "event-source",
    }),
    false,
  );
});

test("Privacy Mode and privacy tags still force local for schedule", () => {
  assert.equal(
    shouldForceLocal({
      ...base,
      privacyEnabled: true,
      callerKind: "schedule",
    }),
    true,
  );
  assert.equal(
    shouldForceLocal({
      ...base,
      privacyTagged: true,
      callerKind: "schedule",
    }),
    true,
  );
});

test("forceLocalForMedia still forces local when turn has media", () => {
  assert.equal(
    shouldForceLocal({
      ...base,
      hasMedia: true,
      callerKind: "schedule",
    }),
    true,
  );
  assert.equal(
    shouldForceLocal({
      ...base,
      hasMedia: false,
      forceLocalForMedia: true,
      callerKind: "schedule",
    }),
    false,
  );
});
