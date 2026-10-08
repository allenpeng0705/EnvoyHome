import { test } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_INTENTS, validateIntent } from "../dist/validator.js";

test("R2: every allowed intent has regression case", () => {
  for (const intent of ALLOWED_INTENTS) {
    assert.equal(validateIntent(intent), true, intent);
  }
});
