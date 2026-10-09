#!/usr/bin/env bash
# Diff Home Assistant /api/services against SERVICE_DENY (Design §5.7.2 / Appendix C.4).
#
# Offline (CI default): uses packages/smarthome/fixtures/ha-services-minimal.json
# Live: ENVOYHOME_HA_URL=https://homeassistant.local:8123 ENVOYHOME_HA_TOKEN=... ./scripts/ha-c4-diff.sh
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

pnpm --filter @envoyhome/smarthome build >/dev/null

node --input-type=module <<'EOF'
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createHaClient,
  diffHaServiceRegistry,
  parseHaServicesApi,
} from "./packages/smarthome/dist/index.js";

const url = process.env.ENVOYHOME_HA_URL;
const token = process.env.ENVOYHOME_HA_TOKEN;

let registry;
if (url && token) {
  const client = createHaClient({ baseUrl: url, token });
  const probe = await client.probe();
  if (!probe.ok) {
    console.error("HA probe failed:", probe.message);
    process.exit(2);
  }
  registry = await client.listServices();
  console.log(`live HA: ${registry.length} domains from ${url}`);
} else {
  const raw = await readFile(
    join("packages/smarthome/fixtures/ha-services-minimal.json"),
    "utf8",
  );
  registry = parseHaServicesApi(JSON.parse(raw));
  console.log("fixture HA registry (set ENVOYHOME_HA_URL + ENVOYHOME_HA_TOKEN for live)");
}

const report = diffHaServiceRegistry(registry);
console.log(report.summary);
if (report.denyListMissingFromHa.length) {
  console.log("deny-list absent from HA (version drift):", report.denyListMissingFromHa.join(", "));
}
if (report.unrecognisedHaDomains.length) {
  console.log("unrecognised domains (fail-closed):", report.unrecognisedHaDomains.join(", "));
}
if (!report.ok) {
  console.error("MISSING FROM DENY LIST:", report.haServicesMissingFromDenyList.join(", "));
  process.exit(1);
}
console.log("ha-c4-diff: OK");
EOF
