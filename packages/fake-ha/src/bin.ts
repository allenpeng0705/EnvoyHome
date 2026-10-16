#!/usr/bin/env node
// Standalone: pnpm fake:ha  →  REST + multi-kind demo panel on :18123

import { DEMO_DEFAULT_PORT, DEMO_TOKEN } from "./demo-entities.js";
import { startFakeHaServer } from "./server.js";

const port = Number(process.env.ENVOYHOME_FAKE_HA_PORT || DEMO_DEFAULT_PORT);
const token = process.env.ENVOYHOME_FAKE_HA_TOKEN || DEMO_TOKEN;

const handle = await startFakeHaServer({ port, token });
console.log(`[fake-ha] demo panel  ${handle.panelUrl}`);
console.log(`[fake-ha] REST base   ${handle.baseUrl}`);
console.log(`[fake-ha] token       ${handle.token}`);
console.log(`[fake-ha] Point EnvoyHome → Connections → Home Assistant`);

const shutdown = async () => {
  await handle.close().catch(() => undefined);
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
