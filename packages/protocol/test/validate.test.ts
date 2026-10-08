// @envoyhome/protocol — B1 acceptance tests (Plan §3 B1, V-PROTO-1).
//
// Run against the COMPILED output (`pnpm build` then `node --test test/`), so the
// artifact the daemon will consume is what is under test.
//
// The strongest check here is `catalogue completeness`: it parses the Design doc
// itself and fails if a method or event catalogued there has no schema. That is
// the acceptance criterion "every method in Design §3.2 + §3.4 + Appendix A has a
// schema" expressed as an executable assertion rather than a promise — six ops
// methods previously sat outside Appendix A precisely because nothing checked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  ARTIFACT_TTL_DEFAULT_SEC,
  ARTIFACT_TTL_MAX_SEC,
  EVENTS,
  METHODS,
  OBJECT_CLASSES,
  PENDING_LEARN_KINDS,
  PRESENCE_REVEALING_CLASSES,
  PROTOCOL_API_VERSION,
  assertApprovalSummary,
  assertSupportedSchema,
  clampArtifactTtlSec,
  eventNames,
  isClassDowngrade,
  isError,
  isKnownMethod,
  isShareableClass,
  makeError,
  makeEvent,
  makeRequest,
  makeResult,
  methodNames,
  parseError,
  validate,
  validateEventData,
  validateEventEnvelope,
  validateMethodParams,
  validateMethodResult,
  validateRequestEnvelope,
  validateResponseEnvelope,
  validateSubscriptions,
  type JsonSchema,
  type MethodScope,
} from "../dist/index.js";

/* ------------------------------------------------------------------ doc access */

function repoRoot(): string {
  let dir = resolve(dirname(new URL(import.meta.url).pathname));
  for (let i = 0; i < 8; i++) {
    try {
      readFileSync(join(dir, "design_doc", "EnvoyHome-Design.md"));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error("could not locate design_doc/EnvoyHome-Design.md from the test");
}

const DESIGN = readFileSync(join(repoRoot(), "design_doc", "EnvoyHome-Design.md"), "utf8");

/** Text between two `## `-level headings. */
function section(startHeading: string, endHeading: string): string {
  const start = DESIGN.indexOf(startHeading);
  assert.notEqual(start, -1, `Design is missing the heading ${startHeading}`);
  const end = DESIGN.indexOf(endHeading, start);
  assert.notEqual(end, -1, `Design is missing the heading ${endHeading} after ${startHeading}`);
  return DESIGN.slice(start, end);
}

/** Tokens that look like methods but are not (each needs a reason). */
const NOT_METHODS = new Set([
  // A.6 prose: "...or `home.getChannelConfig` (should one be added)" — explicitly
  // hypothetical, not catalogued.
  "home.getChannelConfig",
]);

function methodsIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(/`(home\.[a-z][a-zA-Z]*)`/g)) {
    const name = m[1]!;
    if (!NOT_METHODS.has(name)) found.add(name);
  }
  return found;
}

/* ------------------------------------------------------------ completeness */

test("catalogue: every method in Design §3.2 + §3.4 + Appendix A has a schema", () => {
  const fromDoc = new Set<string>([
    ...methodsIn(section("### 3.2 Bootstrap", "### 3.3")),
    ...methodsIn(section("### 3.4", "### 3.6")),
    ...methodsIn(section("## Appendix A", "## Appendix B")),
  ]);
  assert.ok(fromDoc.size > 60, `doc parse found only ${fromDoc.size} methods — the parser is wrong`);

  const missing = [...fromDoc].filter((m) => !isKnownMethod(m)).sort();
  assert.deepEqual(
    missing,
    [],
    `catalogued in Design but absent from METHODS (no schema): ${missing.join(", ")}`,
  );

  const extra = methodNames().filter((m) => !fromDoc.has(m));
  assert.deepEqual(extra, [], `in METHODS but not catalogued in Design: ${extra.join(", ")}`);
});

test("catalogue: every event in Design §3.5 has a schema", () => {
  const fromDoc = new Set<string>();
  for (const m of section("### 3.5 Events", "### 3.6").matchAll(/`(home:[a-z-]+)`/g)) {
    fromDoc.add(m[1]!);
  }
  assert.ok(fromDoc.size >= 8, `doc parse found only ${fromDoc.size} events`);

  const missing = [...fromDoc].filter((e) => !(e in EVENTS)).sort();
  assert.deepEqual(missing, [], `events catalogued in Design but absent from EVENTS: ${missing.join(", ")}`);
  const extra = eventNames().filter((e) => !fromDoc.has(e));
  assert.deepEqual(extra, [], `in EVENTS but not catalogued in Design: ${extra.join(", ")}`);
});

test("catalogue: every method's declared scope matches Design §4.3.1", () => {
  // §4.3.1 is the authorization table B2 implements. If the catalogue disagrees
  // with it, a router cannot know whether a member-bound device may call a method
  // — so this asserts the two are the same source of truth.
  const sec = section("#### 4.3.1", "#### 4.3.2");
  const ownerIdx = sec.indexOf("**owner-scope**");
  const acctIdx = sec.indexOf("**account-scoped**");
  assert.ok(ownerIdx > -1 && acctIdx > -1, "§4.3.1 must list all three scopes");

  const rows: Array<[MethodScope, string]> = [
    ["loopback-owner", sec.slice(0, ownerIdx)],
    ["owner-scope", sec.slice(ownerIdx, acctIdx)],
    ["account-scoped", sec.slice(acctIdx)],
  ];
  const declared = new Map<string, MethodScope>();
  for (const [scope, body] of rows) {
    for (const m of body.matchAll(/`(home\.[a-z][a-zA-Z]*)`/g)) {
      const name = m[1]!;
      if (name === "home.getChannelConfig" || name === "home.setPrivacyMode") continue;
      assert.equal(declared.has(name), false, `${name} appears in two §4.3.1 rows`);
      declared.set(name, scope);
    }
  }
  assert.ok(declared.size > 60, `§4.3.1 parse found only ${declared.size} methods`);

  const mismatched: string[] = [];
  for (const [name, spec] of Object.entries(METHODS)) {
    const doc = declared.get(name);
    if (doc === undefined) mismatched.push(`${name}: in catalogue but not in §4.3.1`);
    else if (doc !== spec.scope) mismatched.push(`${name}: §4.3.1 says ${doc}, catalogue says ${spec.scope}`);
  }
  assert.deepEqual(mismatched, []);
});

test("catalogue: class may not be downgraded by a plugin descriptor (Design §5.7.3)", () => {
  // Physical safety may not become ordinary actuation.
  assert.equal(isClassDowngrade("garage", "light"), true);
  assert.equal(isClassDowngrade("lock", "other"), true);
  assert.equal(isClassDowngrade("camera", "sensor"), true, "presence-revealing is a tier");
  // Escalation is always allowed.
  assert.equal(isClassDowngrade("light", "garage"), false);
  assert.equal(isClassDowngrade("other", "lock"), false);
  // Within-tier re-description is not a downgrade.
  assert.equal(isClassDowngrade("light", "switch"), false);
  assert.equal(isClassDowngrade("lock", "alarm"), false);
  assert.equal(isClassDowngrade("other", "other"), false);
});

test("learns: the re-review surface is required, not optional (Memory Design §7.2)", async () => {
  const base = {
    id: "l1",
    accountId: "alice",
    kind: "memory_append",
    diff: { summary: "add a fact" },
    createdAt: "2026-10-07T00:00:00Z",
    expiresAt: "2026-11-06T00:00:00Z",
    trust: "agent",
    baseDigest: "sha256:" + "a".repeat(64),
    diffKey: "sha256:" + "b".repeat(64),
    stale: false,
  };
  assert.deepEqual(validateMethodResult("home.listPendingLearns", { learns: [base] }), []);
  for (const drop of ["expiresAt", "baseDigest", "diffKey", "stale"] as const) {
    const broken: Record<string, unknown> = { ...base };
    delete broken[drop];
    assert.ok(
      validateMethodResult("home.listPendingLearns", { learns: [broken] }).some((i) =>
        i.path.endsWith(`/${drop}`),
      ),
      `${drop} must be required — without it the operator cannot re-review a stale proposal`,
    );
  }
});

test("objects: the registry record carries the indirection allow-list", async () => {
  const { METHODS: M } = await import("../dist/index.js");
  const rec = {
    channel: "homeassistant",
    channelAccount: "ha",
    sourceId: "script.close_blinds",
    displayName: "Close blinds",
    class: "other",
    accountId: "alice",
    bound: true,
    shared: false,
    neverUnattended: false,
    actuationAllowList: [],
    indirectionAllowList: ["script.close_blinds"],
    firstSeen: "2026-10-07T00:00:00Z",
    lastSeen: "2026-10-07T00:00:00Z",
  };
  assert.deepEqual(validateMethodResult("home.listSources", { sources: [rec] }), []);
  const params = M["home.setSourceBinding"]!.params;
  assert.ok(JSON.stringify(params).includes("indirectionAllowList"));
});

test("catalogue: every schema uses only keywords the validator enforces", () => {
  for (const [name, spec] of Object.entries(METHODS)) {
    assertSupportedSchema(spec.params, `${name}/params`);
    assertSupportedSchema(spec.result, `${name}/result`);
  }
  for (const [name, spec] of Object.entries(EVENTS)) {
    assertSupportedSchema(spec.data, `${name}/data`);
  }
});

test("catalogue: the validator rejects an unsupported keyword instead of ignoring it", () => {
  assert.throws(
    () => assertSupportedSchema({ type: "string", patternProperties: {} } as unknown as JsonSchema),
    /unsupported keyword "patternProperties"/,
  );
});

/* ------------------------------------------------------- acceptance criteria */

test("home.hello: result round-trips including protocolApiVersion", () => {
  const hello = {
    id: "1",
    method: "home.hello",
    params: { client: { name: "envoyhome-desktop", version: "0.1.0", platform: "darwin", id: "d1" } },
  };
  assert.deepEqual(validateRequestEnvelope(hello), []);
  assert.deepEqual(validateMethodParams("home.hello", hello.params).issues, []);

  const result = {
    product: "EnvoyHome",
    version: "0.1.0",
    protocolApiVersion: PROTOCOL_API_VERSION,
    instanceId: "uuid",
    home: { label: "Living room Mac", stateDir: "/state" },
    startedAt: "2026-10-07T00:00:00Z",
    methods: methodNames(),
    mesh: { kind: "hosting", peerId: "peer", multiaddrs: [] },
    notes: [],
  };
  assert.deepEqual(validateMethodResult("home.hello", result), []);

  // The wire number and the exported constant must agree, or a client comparing
  // them (§3.7 rule 5) would refuse to call methods it can rely on.
  const parsed = JSON.parse(JSON.stringify(result)) as { protocolApiVersion: number };
  assert.equal(parsed.protocolApiVersion, PROTOCOL_API_VERSION);

  // A result missing the version axis is a sad path.
  const { protocolApiVersion: _dropped, ...withoutVersion } = result;
  const issues = validateMethodResult("home.hello", withoutVersion);
  assert.ok(issues.some((i) => i.path === "/result/protocolApiVersion" && i.message === "is required"));
});

test("home.updateProfile: supersede-by-key accepts a flat map and rejects append shapes", () => {
  const ok = {
    accountId: "alice",
    set: { display_name: "Alice", allergies: ["peanuts"] },
    removeKeys: ["old_key"],
  };
  assert.deepEqual(validateMethodParams("home.updateProfile", ok).issues, []);

  // An array of {key,value} pairs is a different (append-shaped) contract.
  const appendShape = { accountId: "alice", set: [{ key: "display_name", value: "Alice" }] };
  assert.ok(validateMethodParams("home.updateProfile", appendShape).issues.length > 0);

  // A nested object is not a fact value: values are string|number|boolean|string[].
  const nested = { accountId: "alice", set: { prefs: { a: 1 } } };
  assert.ok(validateMethodParams("home.updateProfile", nested).issues.length > 0);

  // accountId is required.
  assert.ok(validateMethodParams("home.updateProfile", { set: { a: "b" } }).issues.length > 0);
});

test("home.sendMessage: accountId, sessionId and text are all required", () => {
  const ok = { accountId: "alice", sessionId: "s1", text: "hi" };
  assert.deepEqual(validateMethodParams("home.sendMessage", ok).issues, []);
  for (const drop of ["accountId", "sessionId", "text"] as const) {
    const broken: Record<string, unknown> = { ...ok };
    delete broken[drop];
    const { issues } = validateMethodParams("home.sendMessage", broken);
    assert.ok(
      issues.some((i) => i.path === `/params/${drop}`),
      `dropping ${drop} must be reported at /params/${drop}`,
    );
  }
});

test("home.getArtifactUrl: ttlSec is clamped, not rejected", () => {
  assert.equal(clampArtifactTtlSec(undefined), ARTIFACT_TTL_DEFAULT_SEC);
  assert.equal(clampArtifactTtlSec(60), 60);
  assert.equal(clampArtifactTtlSec(ARTIFACT_TTL_MAX_SEC + 1), ARTIFACT_TTL_MAX_SEC);
  assert.equal(clampArtifactTtlSec(0), ARTIFACT_TTL_DEFAULT_SEC);
  assert.equal(clampArtifactTtlSec(-5), ARTIFACT_TTL_DEFAULT_SEC);
  assert.equal(clampArtifactTtlSec(Number.NaN), ARTIFACT_TTL_DEFAULT_SEC);
  assert.equal(clampArtifactTtlSec(12.7), 12);
  // A clamping implementation accepts the over-max value at the schema level:
  // rejecting it here would make the documented clamp unreachable.
  assert.deepEqual(
    validateMethodParams("home.getArtifactUrl", { accountId: "a", path: "p", ttlSec: 999999 }).issues,
    [],
  );
});

test("home.listPendingLearns: the kind enum matches Design A.9 exactly", () => {
  const a9 = section("### A.9", "---\n\n## Appendix B");
  const kindLine = a9.split("\n").find((l) => l.includes('"kind"') && l.includes("profile_patch"));
  assert.ok(kindLine, "could not find the PendingLearn kind enum in Design A.9");
  const fromDoc = [...kindLine!.matchAll(/"([a-z_]+)"/g)]
    .map((m) => m[1]!)
    .filter((v) => v !== "kind");
  assert.deepEqual(
    [...fromDoc].sort(),
    [...PENDING_LEARN_KINDS].sort(),
    "PENDING_LEARN_KINDS drifted from Design A.9",
  );
});

test("envelope: request/response/event round-trip, and a numeric id keeps its type", () => {
  const req = makeRequest(42, "home.sendMessage", { accountId: "a", sessionId: "s", text: "t" });
  const wire = JSON.parse(JSON.stringify(req)) as typeof req;
  assert.equal(typeof wire.id, "number");
  assert.deepEqual(validateRequestEnvelope(wire), []);

  const res = makeResult(wire.id, { turnId: "t1", sessionId: "s", status: "started", route: "harness" });
  const resWire = JSON.parse(JSON.stringify(res)) as { id: unknown; result: unknown };
  assert.equal(typeof resWire.id, "number", "a reply must echo the caller's id type");
  assert.deepEqual(validateResponseEnvelope(resWire), []);
  assert.deepEqual(validateMethodResult("home.sendMessage", resWire.result), []);

  const ev = makeEvent("home:turn-finished", {
    turnId: "t1",
    sessionId: "s",
    accountId: "a",
    status: "ok",
    at: "2026-10-07T00:00:00Z",
  });
  assert.deepEqual(validateEventData(ev.event, ev.data), []);

  // A string id is equally valid and equally preserved.
  const sreq = makeRequest("abc", "home.health", undefined);
  assert.equal(typeof sreq.id, "string");
  assert.ok(!("params" in sreq), "params must be omitted, not sent as undefined");
});

test("envelope: sad paths are rejected at the right path", () => {
  assert.ok(validateRequestEnvelope({ id: {}, method: "home.health" }).length > 0);
  assert.ok(validateRequestEnvelope({ id: 1 }).some((i) => i.path === "/method"));
  assert.ok(validateRequestEnvelope({ id: 1, method: "m", params: [] }).some((i) => i.path === "/params"));

  assert.ok(
    validateResponseEnvelope({ id: 1, result: {}, error: { code: "X", message: "y" } }).some((i) =>
      i.message.includes("both"),
    ),
  );
  assert.ok(
    validateResponseEnvelope({ id: 1 }).some((i) => i.message.includes("either")),
    "a response with neither result nor error must fail",
  );
  assert.ok(
    validateResponseEnvelope({ id: 1, error: { code: "", message: "x" } }).some(
      (i) => i.path === "/error/code",
    ),
  );

  assert.ok(validateEventEnvelope({ event: "home:not-a-real-event", data: {} }).length > 0);
  assert.ok(validateEventEnvelope({ event: "home:health" }).some((i) => i.path === "/data"));
});

test("unknown method is reported as unknownMethod (→ envoyhome.version_too_low)", () => {
  const v = validateMethodParams("home.doesNotExist", {});
  assert.equal(v.ok, false);
  assert.equal(v.unknownMethod, true);

  // params required but omitted
  const missing = validateMethodParams("home.sendMessage", undefined);
  assert.equal(missing.ok, false);
  assert.equal(missing.unknownMethod, false);
  assert.ok(missing.issues.some((i) => i.message.includes("required")));

  // params optional and omitted is fine
  assert.equal(validateMethodParams("home.health", undefined).ok, true);
  assert.equal(validateMethodParams("home.listAccounts", undefined).ok, true);
});

/* --------------------------------------------------------------- validator */

test("validator: each supported keyword fails when it should", () => {
  const cases: Array<[string, JsonSchema, unknown]> = [
    ["type", { type: "string" }, 3],
    ["type array", { type: ["string", "null"] }, true],
    ["enum", { enum: ["a", "b"] }, "c"],
    ["const", { const: "a" }, "b"],
    ["minLength", { type: "string", minLength: 3 }, "ab"],
    ["maxLength", { type: "string", maxLength: 2 }, "abc"],
    ["pattern", { type: "string", pattern: "^a" }, "b"],
    ["minimum", { type: "number", minimum: 1 }, 0],
    ["maximum", { type: "number", maximum: 1 }, 2],
    ["required", { type: "object", required: ["a"] }, {}],
    ["properties", { type: "object", properties: { a: { type: "string" } } }, { a: 1 }],
    ["additionalProperties false", { type: "object", properties: {}, additionalProperties: false }, { a: 1 }],
    ["items", { type: "array", items: { type: "string" } }, ["a", 1]],
    ["minItems", { type: "array", minItems: 2 }, ["a"]],
    ["maxItems", { type: "array", maxItems: 1 }, ["a", "b"]],
    ["oneOf (none)", { oneOf: [{ type: "string" }, { type: "number" }] }, true],
    ["oneOf (both)", { oneOf: [{ type: "number" }, { type: "integer" }] }, 3],
    ["anyOf", { anyOf: [{ type: "string" }, { type: "number" }] }, true],
    ["allOf", { allOf: [{ type: "number" }, { minimum: 5 }] }, 1],
  ];
  for (const [label, schema, value] of cases) {
    assert.ok(validate(schema, value).length > 0, `${label} must reject ${JSON.stringify(value)}`);
  }

  const okCases: Array<[JsonSchema, unknown]> = [
    [{ type: "integer" }, 3],
    [{ type: "number" }, 3],
    [{ type: "number" }, 3.5],
    [{ type: ["string", "null"] }, null],
    [{ type: "object", properties: { a: { type: "string" } }, required: ["a"] }, { a: "x" }],
    [{ type: "object", additionalProperties: { type: "number" } }, { a: 1, b: 2 }],
  ];
  for (const [schema, value] of okCases) {
    assert.deepEqual(validate(schema, value), [], `${JSON.stringify(value)} should be valid`);
  }

  // An integer satisfies `number`, but a number does NOT satisfy `integer`.
  assert.deepEqual(validate({ type: "integer" }, 3), []);
  assert.ok(validate({ type: "integer" }, 3.5).length > 0);
});

test("validator: reports every failure, not just the first", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: { a: { type: "string" }, b: { type: "string" } },
    required: ["a", "b", "c"],
  };
  const issues = validate(schema, { a: 1 });
  assert.ok(issues.length >= 3, `expected several issues, got ${issues.length}`);
});

/* ------------------------------------------------------------------ errors */

test("errors: the product namespace is closed and the transport code is untouched", () => {
  const err = makeError("UNAUTHORIZED", "auth", "missing_token");
  assert.equal(err.code, "UNAUTHORIZED");
  assert.equal(err.message, "envoyhome.auth: missing_token");

  const parsed = parseError(err);
  assert.equal(parsed.name, "auth");
  assert.equal(parsed.detail, "missing_token");
  assert.equal(isError(err, "auth"), true);
  assert.equal(isError(err, "grant_expired"), false);
});

test("errors: messageKey/messageValues are tolerated inbound and emitted when known", () => {
  const withI18n = {
    code: "UNAUTHORIZED",
    message: "envoyhome.auth: missing_token",
    messageKey: "errors.auth.missingToken",
    messageValues: { field: "token" },
  };
  assert.deepEqual(validateResponseEnvelope({ id: 1, error: withI18n }), []);
  const parsed = parseError(withI18n);
  assert.equal(parsed.name, "auth");
  assert.equal(parsed.messageKey, "errors.auth.missingToken");
  assert.deepEqual(parsed.messageValues, { field: "token" });

  const emitted = makeError("UNAUTHORIZED", "auth", "bad_token", {
    messageKey: "errors.auth.badToken",
    messageValues: { attempt: 2 },
  });
  assert.equal(emitted.messageKey, "errors.auth.badToken");

  // A message we do not recognise is still a valid error — never a throw.
  const foreign = parseError({ code: "X", message: "envoyc0der.some_other: nope" });
  assert.equal(foreign.name, undefined);
  assert.equal(foreign.detail, "");
});

/* -------------------------------------------------------- smart-home guards */

test("objects: presence-revealing classes cannot be shared (Design §5.7.3)", () => {
  for (const cls of PRESENCE_REVEALING_CLASSES) {
    assert.equal(isShareableClass(cls), false, `${cls} must not be shareable`);
  }
  for (const cls of OBJECT_CLASSES) {
    if (!(PRESENCE_REVEALING_CLASSES as readonly string[]).includes(cls)) {
      assert.equal(isShareableClass(cls), true, `${cls} should be shareable`);
    }
  }
});

test("approvals: admin/sensitive risk requires a rendered summary (Design A.5)", () => {
  assert.throws(
    () => assertApprovalSummary({ risk: "admin", argsDigest: "sha256:" + "a".repeat(64) }),
    /requires a rendered `summary`/,
  );
  assert.throws(
    () => assertApprovalSummary({ risk: "sensitive", summary: "   ", argsDigest: "sha256:" + "a".repeat(64) }),
    /requires a rendered `summary`/,
  );
  assert.doesNotThrow(() =>
    assertApprovalSummary({ risk: "exec", argsDigest: "sha256:" + "a".repeat(64) }),
  );
  assert.doesNotThrow(() =>
    assertApprovalSummary({
      risk: "admin",
      summary: "Unlock Front door (object: Front door lock) → locked: false",
      argsDigest: "sha256:" + "a".repeat(64),
    }),
  );
});

test("approvals: a digest must be the canonical sha256 form", () => {
  const bad = {
    id: "a1",
    accountId: "alice",
    agentId: "default",
    turnId: "t1",
    tool: "ha_call_service",
    argsDigest: "not-a-digest",
    risk: "admin",
    origin: "attended",
    createdAt: "2026-10-07T00:00:00Z",
    expiresAt: "2026-10-07T00:10:00Z",
  };
  assert.ok(
    validateMethodResult("home.listApprovals", { approvals: [bad] }).some((i) =>
      i.path.endsWith("/argsDigest"),
    ),
  );
  assert.deepEqual(
    validateMethodResult("home.listApprovals", {
      approvals: [{ ...bad, argsDigest: "sha256:" + "f".repeat(64) }],
    }),
    [],
  );
});

test("subscribe: unknown event names are reported before the daemon accepts them", () => {
  assert.deepEqual(validateSubscriptions(["home:turn-delta", "home:approval-needed"]), []);
  assert.deepEqual(validateSubscriptions(["home:turn-delta", "home:nope"]), ["home:nope"]);
});

test("version axes: a plugin newer than the daemon is refused", async () => {
  const { checkPluginApiVersion, PLUGIN_API_VERSION } = await import("../dist/index.js");
  assert.equal(checkPluginApiVersion(PLUGIN_API_VERSION).ok, true);
  assert.equal(checkPluginApiVersion(PLUGIN_API_VERSION + 1).ok, false);
  assert.equal(checkPluginApiVersion("1").ok, false);
  assert.equal(checkPluginApiVersion(undefined).ok, false);
});
