// Design §9.5k / P2-S0 — statement allow/deny freeze.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafeLocalSql } from "../dist/localsql-policy.js";

test("P2-S0: allow SELECT / WITH / CREATE TEMP", () => {
  assert.equal(assertSafeLocalSql("SELECT 1"), "SELECT 1");
  assert.equal(assertSafeLocalSql("SELECT * FROM t;"), "SELECT * FROM t");
  assert.match(assertSafeLocalSql("WITH x AS (SELECT 1) SELECT * FROM x"), /WITH/);
  assert.match(
    assertSafeLocalSql("CREATE TEMP TABLE t AS SELECT 1 AS a"),
    /CREATE TEMP/,
  );
});

test("P2-S0: refuse ATTACH / COPY / http / multi-statement", () => {
  assert.throws(() => assertSafeLocalSql("ATTACH 'x.db'"), /ATTACH/);
  assert.throws(() => assertSafeLocalSql("COPY t TO 'out.csv'"), /COPY/);
  assert.throws(
    () => assertSafeLocalSql("SELECT * FROM read_csv('x.csv')"),
    /read_/,
  );
  assert.throws(
    () => assertSafeLocalSql("SELECT * FROM 'https://example.com/a.csv'"),
    /http/,
  );
  assert.throws(
    () => assertSafeLocalSql("SELECT 1; SELECT 2"),
    /multi-statement/,
  );
  assert.throws(() => assertSafeLocalSql("DELETE FROM t"), /must start with/);
  assert.throws(() => assertSafeLocalSql("INSTALL httpfs"), /INSTALL/);
});
