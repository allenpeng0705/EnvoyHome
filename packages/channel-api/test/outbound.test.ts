import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOutbound } from "../dist/outbound.js";
import type { OutboundMessage } from "../dist/context.js";

test("normalizeOutbound: chat coerces link → markdown (no home HTTPS)", () => {
  const out = normalizeOutbound(
    "chat",
    {
      accountId: "alice",
      text: "long reply…",
      format: "link",
      artifactUrl: "https://127.0.0.1/artifacts/x",
    } as OutboundMessage & { format: string; artifactUrl: string },
  );
  assert.equal(out.format, "markdown");
  assert.equal(out.text, "long reply…");
  assert.equal("artifactUrl" in out, false);
});

test("normalizeOutbound: plain preserved", () => {
  const out = normalizeOutbound("chat", {
    accountId: "alice",
    text: "ok",
    format: "plain",
  });
  assert.equal(out.format, "plain");
});

test("normalizeOutbound: event-source defaults kind notify", () => {
  const out = normalizeOutbound("event-source", {
    accountId: "alice",
    text: "door open",
  });
  assert.equal(out.kind, "notify");
});
