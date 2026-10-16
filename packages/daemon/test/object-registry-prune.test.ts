// Unbound 50 / 7d prune — Design §5.7.3.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homePaths } from "../dist/home-paths.js";
import {
  ObjectRegistry,
  UNBOUND_MAX,
  UNBOUND_TTL_MS,
  type ObjectRecord,
} from "../dist/object-registry.js";

function baseRec(partial: Partial<ObjectRecord> & Pick<ObjectRecord, "sourceId">): ObjectRecord {
  const now = new Date().toISOString();
  return {
    channel: "homeassistant",
    channelAccount: "default",
    displayName: partial.sourceId,
    class: "sensor",
    accountId: null,
    bound: false,
    shared: false,
    neverUnattended: false,
    actuationAllowList: [],
    indirectionAllowList: [],
    firstSeen: now,
    lastSeen: now,
    ...partial,
  };
}

test("pruneUnbound: TTL drops stale unbound; bound kept; cap keeps newest 50", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-obj-prune-"));
  try {
    const now = Date.now();
    const oldIso = new Date(now - UNBOUND_TTL_MS - 60_000).toISOString();
    const freshIso = new Date(now - 60_000).toISOString();
    const objects: ObjectRecord[] = [
      baseRec({
        sourceId: "sensor.stale",
        lastSeen: oldIso,
        firstSeen: oldIso,
      }),
      baseRec({
        sourceId: "sensor.fresh",
        lastSeen: freshIso,
        firstSeen: freshIso,
      }),
      baseRec({
        sourceId: "light.kept",
        class: "light",
        accountId: "alice",
        bound: true,
        lastSeen: oldIso,
        firstSeen: oldIso,
      }),
    ];
    for (let i = 0; i < UNBOUND_MAX + 5; i++) {
      objects.push(
        baseRec({
          sourceId: `sensor.cap_${i}`,
          lastSeen: new Date(now - i * 1000).toISOString(),
          firstSeen: freshIso,
        }),
      );
    }
    const paths = homePaths(stateDir);
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(
      paths.objectsJson,
      JSON.stringify({ version: 1, objects }, null, 2) + "\n",
      "utf8",
    );

    const reg = new ObjectRegistry(stateDir);
    const result = await reg.pruneUnbound(now);
    assert.ok(result.pruned > 0);
    assert.equal(result.capped, true);

    const listed = await reg.list({});
    assert.ok(listed.some((o) => o.sourceId === "light.kept" && o.bound));
    assert.equal(
      listed.some((o) => o.sourceId === "sensor.stale"),
      false,
      "TTL must drop stale unbound",
    );
    assert.ok(listed.filter((o) => !o.bound).length <= UNBOUND_MAX);

    // File on disk matches prune.
    const onDisk = JSON.parse(await readFile(paths.objectsJson, "utf8")) as {
      objects: ObjectRecord[];
    };
    assert.equal(
      onDisk.objects.some((o) => o.sourceId === "sensor.stale"),
      false,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
