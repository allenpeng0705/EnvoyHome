// V-HA-19 companion: C.4 deny list vs HA service registry (fixture + live optional).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createHaClient,
  diffHaServiceRegistry,
  parseHaServicesApi,
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));

test("HA fixture registry: deny-list services present; no uncovered high-risk", async () => {
  const raw = await readFile(join(here, "../fixtures/ha-services-minimal.json"), "utf8");
  const registry = parseHaServicesApi(JSON.parse(raw));
  const report = diffHaServiceRegistry(registry);
  assert.equal(report.ok, true, report.summary);
  assert.ok(report.denyListPresentInHa.includes("lock.unlock"));
  assert.ok(report.denyListPresentInHa.includes("alarm_control_panel.alarm_disarm"));
  assert.ok(report.unrecognisedHaDomains.includes("esphome"));
});

test("diff fails when HA exposes high-risk service outside SERVICE_DENY", () => {
  const bad = diffHaServiceRegistry([
    { domain: "lock", services: ["lock", "unlatch"] },
  ]);
  assert.equal(bad.ok, false);
  assert.ok(bad.haServicesMissingFromDenyList.includes("lock.unlatch"));
});

test("live HA registry diff when ENVOYHOME_HA_URL + TOKEN set", async (t) => {
  const url = process.env["ENVOYHOME_HA_URL"];
  const token = process.env["ENVOYHOME_HA_TOKEN"];
  if (!url || !token) {
    t.skip("set ENVOYHOME_HA_URL and ENVOYHOME_HA_TOKEN for live C.4 registry diff");
    return;
  }
  const client = createHaClient({ baseUrl: url, token });
  const probe = await client.probe();
  assert.equal(probe.ok, true, probe.message);
  const services = await client.listServices();
  assert.ok(services.length > 0);
  const report = diffHaServiceRegistry(services);
  // Live HA may introduce new high-risk names — surface clearly.
  if (!report.ok) {
    console.error(report.summary);
    console.error(report.haServicesMissingFromDenyList);
  }
  assert.equal(report.ok, true, report.summary);
});
