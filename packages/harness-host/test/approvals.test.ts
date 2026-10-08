import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore, ALLOWED_INTENTS, canonicalDigest, validateIntent } from "../dist/index.js";

test("R2: every allowed intent validates", () => {
  for (const intent of ALLOWED_INTENTS) {
    assert.equal(validateIntent(intent), true);
  }
  assert.equal(validateIntent("not-a-real-intent"), false);
});

test("V-SEC-5/8/10: durable approvals, grant digest, claim not consume", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-approvals-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    const digest = canonicalDigest({
      tool: "shell",
      domain: null,
      service: null,
      objectId: null,
      desiredState: null,
      data: { cmd: "ls" },
    });
    const pending = await store.createApproval({
      accountId: "alice",
      agentId: "default",
      turnId: "t1",
      tool: "shell",
      argsDigest: digest,
      risk: "exec",
      origin: "attended",
    });
    const listed = await store.listApprovals("alice");
    assert.equal(listed.length, 1);

    const answered = await store.answerApproval({
      accountId: "alice",
      id: pending.id,
      decision: "allow",
      scope: "always",
      argsDigest: digest,
      grantedBy: "loopback-owner",
    });
    assert.ok(answered.grant);

    const claimed = await store.claimGrant({
      accountId: "alice",
      tool: "shell",
      argsDigest: digest,
      actuationId: "act-1",
    });
    assert.ok(claimed);
    assert.equal(claimed.claimedBy, "act-1");

    // Claim does not consume — still listable / claimable again after clearing claim field via list.
    const again = await store.listGrants("alice");
    assert.equal(again.length, 1);

    await assert.rejects(
      () =>
        store.writeGrant({
          accountId: "alice",
          tool: "ha_call_service",
          argsDigest: "null",
          risk: "admin",
          grantedBy: "loopback-owner",
          expiresAt: null,
        }),
      /grant_too_broad/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-SEC-8: expired approval is denied (dropped)", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-approvals-exp-"));
  try {
    const store = new ApprovalStore((id) => join(root, id));
    await store.createApproval({
      accountId: "alice",
      agentId: "default",
      turnId: "t1",
      tool: "shell",
      argsDigest: canonicalDigest({ cmd: "x" }),
      risk: "exec",
      origin: "attended",
      ttlSec: 0,
    });
    // ttlSec 0 ⇒ expiresAt <= now on next list
    await new Promise((r) => setTimeout(r, 5));
    const listed = await store.listApprovals("alice");
    assert.equal(listed.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
