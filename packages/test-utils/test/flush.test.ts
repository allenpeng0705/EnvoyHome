import { test } from "node:test";
import assert from "node:assert/strict";
import { __resetActiveXForTests, flushLoop, registerResetHook } from "../dist/index.js";

test("flushLoop drains a queued macrotask", async () => {
  let hit = false;
  setTimeout(() => {
    hit = true;
  }, 0);
  await flushLoop();
  assert.equal(hit, true);
});

test("__resetActiveXForTests runs registered hooks", () => {
  let n = 0;
  registerResetHook(() => {
    n += 1;
  });
  __resetActiveXForTests();
  assert.equal(n, 1);
});
