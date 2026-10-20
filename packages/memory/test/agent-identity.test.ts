import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeIdentityInject,
  DEFAULT_IDENTITY_MD,
  PRODUCT_IDENTITY_FLOOR,
  proposeAfterTurnEnrichment,
} from "../dist/agent-identity.js";

test("composeIdentityInject leads with EnvoyHome floor + persona body", () => {
  const { text } = composeIdentityInject(DEFAULT_IDENTITY_MD);
  assert.ok(text.startsWith("## Identity"));
  assert.ok(text.includes("You are **EnvoyHome**"));
  assert.ok(text.includes("## Persona (editable)"));
  assert.ok(text.includes("household AI assistant"));
  assert.equal(text.indexOf(PRODUCT_IDENTITY_FLOOR.slice(0, 20)), 0);
});

test("proposeAfterTurnEnrichment: user name + assistant style", () => {
  const { proposals } = proposeAfterTurnEnrichment({
    userText: "My name is Alicia. Please be more concise.",
    identityMd: DEFAULT_IDENTITY_MD,
  });
  assert.ok(proposals.some((p) => p.kind === "profile_patch" && p.payload === "Alicia"));
  assert.ok(proposals.some((p) => p.kind === "identity_append" && /concise/i.test(p.payload)));
});

test("proposeAfterTurnEnrichment: call yourself", () => {
  const { proposals } = proposeAfterTurnEnrichment({
    userText: 'Please call yourself "Home Buddy" from now on.',
    identityMd: DEFAULT_IDENTITY_MD,
  });
  const hit = proposals.find((p) => p.kind === "identity_append");
  assert.ok(hit);
  assert.match(hit!.payload, /Home Buddy/);
  assert.equal(hit!.targetPath, "IDENTITY.md");
});

test("displayName injects as name fact when profile has no name", async () => {
  const { buildStandingInject } = await import("../dist/bootstrap-inject.js");
  const inject = buildStandingInject({
    profile: {
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      facts: {},
      displayName: "Allen",
    },
    memoryMd: "# MEMORY\n",
    todayContent: "",
    yesterdayContent: "",
    identityMd: DEFAULT_IDENTITY_MD,
  });
  assert.ok(inject.text.includes('"name"'));
  assert.ok(inject.text.includes("Allen"));
  assert.ok(inject.identity.injectChars > inject.identity.rawChars);
  assert.equal(inject.identity.injectBudget, 3000);
});
