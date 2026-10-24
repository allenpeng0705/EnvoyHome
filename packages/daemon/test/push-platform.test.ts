// iOS APNs + Android FCM payload shape and dispatch routing (Design `2026-10-22f`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DaemonLogger } from "../dist/logger.js";
import { homePaths } from "../dist/home-paths.js";
import { PushTokenStore } from "../dist/push-tokens.js";
import {
  PushDispatcher,
  buildApnsBody,
  buildFcmMessage,
  type PushPayload,
} from "../dist/push-dispatch.js";
import type { PushTokenRecord } from "../dist/push-tokens.js";
import { LiveDevicePresence } from "../dist/push-live.js";

const sample: PushPayload = {
  title: "Approval needed",
  body: "Open EnvoyHome",
  data: {
    type: "approval",
    approvalId: "appr-1",
    accountId: "alice",
  },
};

test("APNs body nests custom fields under data (iOS AppDelegate unwrap)", () => {
  const body = buildApnsBody(sample);
  assert.deepEqual(body.aps, {
    alert: { title: sample.title, body: sample.body },
    sound: "default",
    badge: 1,
  });
  assert.deepEqual(body.data, sample.data);
  // Top-level must not collide with aps keys — type lives under data.
  assert.equal((body as { type?: string }).type, undefined);
});

test("FCM message flattens string data + HIGH android priority", () => {
  const msg = buildFcmMessage("fcm-reg-token", sample) as {
    message: {
      token: string;
      notification: { title: string; body: string };
      data: Record<string, string>;
      android: { priority: string };
    };
  };
  assert.equal(msg.message.token, "fcm-reg-token");
  assert.deepEqual(msg.message.notification, {
    title: sample.title,
    body: sample.body,
  });
  assert.deepEqual(msg.message.data, sample.data);
  assert.equal(msg.message.android.priority, "HIGH");
  for (const v of Object.values(msg.message.data)) {
    assert.equal(typeof v, "string");
  }
});

test("dispatch routes ios→APNs path and android→FCM path", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-plat-"));
  try {
    const store = new PushTokenStore(homePaths(stateDir));
    await store.register({
      deviceId: "iphone",
      platform: "ios",
      token: "aabbccdd",
      accountIds: ["alice"],
    });
    await store.register({
      deviceId: "pixel",
      platform: "android",
      token: "fcm-token-1",
      accountIds: ["alice"],
    });

    const seen: Array<{ platform: string; token: string }> = [];
    const push = new PushDispatcher(
      store,
      stateDir,
      new DaemonLogger(),
      undefined,
      async (row, _payload) => {
        seen.push({ platform: row.platform, token: row.token });
        return 200;
      },
    );
    await push.init();

    const result = await push.notifyAccount("alice", sample, "always");
    assert.equal(result.sent, 2);
    assert.equal(seen.length, 2);
    assert.deepEqual(
      seen.map((s) => s.platform).sort(),
      ["android", "ios"],
    );
    assert.ok(seen.some((s) => s.token === "aabbccdd"));
    assert.ok(seen.some((s) => s.token === "fcm-token-1"));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("dead APNs/FCM status drops token (410)", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-dead-"));
  try {
    const store = new PushTokenStore(homePaths(stateDir));
    await store.register({
      deviceId: "stale-ios",
      platform: "ios",
      token: "dead",
      accountIds: ["alice"],
    });
    await store.register({
      deviceId: "ok-android",
      platform: "android",
      token: "live",
      accountIds: ["alice"],
    });

    const push = new PushDispatcher(
      store,
      stateDir,
      new DaemonLogger(),
      undefined,
      async (row) => (row.deviceId === "stale-ios" ? 410 : 200),
    );
    await push.init();

    const result = await push.notifyAccount("alice", sample, "always");
    assert.equal(result.sent, 1);
    assert.equal(await store.get("stale-ios"), undefined);
    assert.ok(await store.get("ok-android"));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("multi-device fan-out + suppressIfLive is per-device", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-multi-"));
  try {
    const store = new PushTokenStore(homePaths(stateDir));
    await store.register({
      deviceId: "live-phone",
      platform: "ios",
      token: "t1",
      accountIds: ["alice"],
    });
    await store.register({
      deviceId: "away-phone",
      platform: "android",
      token: "t2",
      accountIds: ["alice"],
    });
    const live = new LiveDevicePresence();
    live.touch("live-phone");

    const sentDevices: string[] = [];
    const push = new PushDispatcher(
      store,
      stateDir,
      new DaemonLogger(),
      live,
      async (row) => {
        sentDevices.push(row.deviceId);
        return 200;
      },
    );
    await push.init();

    const interactive = await push.notifyAccount("alice", sample, "suppressIfLive");
    assert.equal(interactive.sent, 1);
    assert.equal(interactive.skippedLive, 1);
    assert.deepEqual(sentDevices, ["away-phone"]);

    sentDevices.length = 0;
    const schedule = await push.notifyAccount(
      "alice",
      { title: "t", body: "b", data: { type: "schedule", accountId: "alice" } },
      "always",
    );
    assert.equal(schedule.sent, 2);
    assert.equal(schedule.skippedLive, 0);
    assert.equal(sentDevices.sort().join(","), "away-phone,live-phone");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("sendTest targets platform of registered device", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-testsend-"));
  try {
    const store = new PushTokenStore(homePaths(stateDir));
    await store.register({
      deviceId: "only-android",
      platform: "android",
      token: "fcm-x",
      accountIds: ["alice"],
    });
    let hit: PushTokenRecord | undefined;
    const push = new PushDispatcher(
      store,
      stateDir,
      new DaemonLogger(),
      undefined,
      async (row) => {
        hit = row;
        return 200;
      },
    );
    await push.init();
    const r = await push.sendTest("only-android", {
      title: "EnvoyHome",
      body: "hello",
      data: { type: "test" },
    });
    assert.equal(r.sent, 1);
    assert.equal(hit?.platform, "android");
    assert.equal(hit?.token, "fcm-x");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
