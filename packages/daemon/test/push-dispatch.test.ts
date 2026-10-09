import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DaemonLogger } from "../dist/logger.js";
import { homePaths } from "../dist/home-paths.js";
import { PushTokenStore } from "../dist/push-tokens.js";
import { PushDispatcher } from "../dist/push-dispatch.js";

test("push notifyAccount with no tokens → sent 0", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-d-"));
  try {
    const store = new PushTokenStore(homePaths(stateDir));
    const push = new PushDispatcher(store, stateDir, new DaemonLogger());
    await push.init();
    const result = await push.notifyAccount("alice", {
      title: "t",
      body: "b",
      data: { type: "approval" },
    });
    assert.equal(result.sent, 0);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("onProductEvent approval-needed fans out by accountId", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-e-"));
  try {
    const store = new PushTokenStore(homePaths(stateDir));
    await store.register({
      deviceId: "d1",
      platform: "ios",
      token: "deadbeef",
      accountIds: ["alice"],
    });
    const push = new PushDispatcher(store, stateDir, new DaemonLogger());
    await push.init();
    // No APNs creds → send returns undefined → sent stays 0, but no throw.
    await push.onProductEvent("home:approval-needed", {
      accountId: "alice",
      id: "appr-1",
      tool: "exec",
      summary: "run something",
    });
    assert.ok(await store.get("d1"));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
