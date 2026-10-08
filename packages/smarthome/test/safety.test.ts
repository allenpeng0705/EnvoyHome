import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActuationJournal,
  ObjectRegistry,
  APPENDIX_C4_REQUIRED_IDS,
  REQUIRED_DENY_CORPUS,
  assertActuationAllowed,
  assertGrantCreatable,
  classifySafety,
  grantRefusedForSafety,
  resolveObject,
  tierForGetState,
} from "../dist/index.js";

test("V-HA-5/19: safety class — unknown and lock/disarm deny", () => {
  assert.equal(classifySafety({ objectClass: "weird_new_domain" }).safetyClass, true);
  assert.equal(classifySafety({ objectClass: "lock" }).safetyClass, true);
  assert.equal(
    classifySafety({ objectClass: "light", service: "alarm_disarm" }).safetyClass,
    true,
  );
  assert.equal(classifySafety({ objectClass: "light", service: "turn_on" }).safetyClass, false);
});

test("V-HA-14: resolver holds for reads — foreign object fails", () => {
  const reg = new ObjectRegistry();
  reg.upsert({
    sourceId: "lock.front",
    channel: "ha",
    channelAccount: "ha1",
    displayName: "Front",
    class: "lock",
    accountId: "alice",
    shared: false,
    neverUnattended: true,
    actuationAllowList: [],
    indirectionAllowList: [],
  });
  assert.throws(() => resolveObject(reg, "lock.front", "bob"), /object_not_bound/);
  const handle = resolveObject(reg, "lock.front", "alice");
  assert.equal(tierForGetState(handle), "sensitive");
});

test("V-HA-16: non-idempotent refused unattended; journal reconciles pending", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-act-"));
  try {
    const journal = new ActuationJournal((id) => join(root, id, "actuations"));
    await assert.rejects(
      () =>
        journal.begin({
          accountId: "alice",
          objectId: "o1",
          desiredState: "toggle",
          risk: "admin",
          origin: "unattended",
          idempotent: false,
          service: "toggle",
        }),
      /actuation_non_idempotent/,
    );
    const row = await journal.begin({
      accountId: "alice",
      objectId: "o1",
      desiredState: "on",
      risk: "admin",
      origin: "attended",
      idempotent: true,
      service: "turn_on",
    });
    assert.equal(row.outcome, "pending");
    const touched = await journal.reconcile("alice");
    assert.equal(touched[0]?.outcome, "unconfirmed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-HA-19: Appendix C.4 required-deny corpus", () => {
  const ids = new Set(REQUIRED_DENY_CORPUS.map((c) => c.id));
  for (const required of APPENDIX_C4_REQUIRED_IDS) {
    assert.ok(ids.has(required), `missing corpus row ${required}`);
  }
  for (const row of REQUIRED_DENY_CORPUS) {
    assert.equal(
      grantRefusedForSafety(row.input),
      true,
      `${row.id} must be safety-class / grant-refused`,
    );
    assert.equal(
      classifySafety(row.input).safetyClass,
      true,
      `${row.id} must classify safety`,
    );
  }
});

test("V-HA-11: broad grant refused at creation", () => {
  const reg = new ObjectRegistry();
  reg.upsert({
    sourceId: "light.lamp",
    channel: "ha",
    channelAccount: "ha1",
    displayName: "Lamp",
    class: "light",
    accountId: "alice",
    shared: false,
    neverUnattended: false,
    actuationAllowList: [],
    indirectionAllowList: [],
  });
  const handle = resolveObject(reg, "light.lamp", "alice");
  assert.throws(
    () =>
      assertGrantCreatable({
        tool: "ha_call_service",
        argsDigest: "null",
        handle,
        domain: "light",
        service: "turn_on",
      }),
    /grant_too_broad/,
  );
});

test("V-HA-4: unattended without grant denied for ordinary admin", () => {
  const reg = new ObjectRegistry();
  reg.upsert({
    sourceId: "light.lamp",
    channel: "ha",
    channelAccount: "ha1",
    displayName: "Lamp",
    class: "light",
    accountId: "alice",
    shared: false,
    neverUnattended: false,
    actuationAllowList: [],
    indirectionAllowList: [],
  });
  const handle = resolveObject(reg, "light.lamp", "alice");
  assert.throws(
    () =>
      assertActuationAllowed({
        handle,
        domain: "light",
        service: "turn_on",
        origin: "unattended",
        hasGrant: false,
      }),
    /actuation_not_granted/,
  );
});
