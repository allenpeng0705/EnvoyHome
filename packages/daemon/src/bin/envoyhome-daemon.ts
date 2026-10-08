#!/usr/bin/env node
// Bin entry for the EnvoyHome daemon (Plan B2).

import { startDaemon } from "../daemon.js";

const wsPort = Number(process.env.ENVOYHOME_WS_PORT ?? 4780);
const httpPort = Number(process.env.ENVOYHOME_HTTP_PORT ?? 4781);
const stateDir = process.env.ENVOYHOME_STATE_DIR ?? `${process.cwd()}/.envoyhome`;
const hatchApiKey = process.env.ENVOYHOME_HATCH_API_KEY ?? "";

const daemon = await startDaemon({
  config: {
    wsPort,
    httpPort,
    stateDir,
    hatchApiKey,
    ...(process.env.ENVOYHOME_INSTANCE_ID
      ? { instanceId: process.env.ENVOYHOME_INSTANCE_ID }
      : {}),
  },
  packageVersion: "0.0.0",
  managedBy: "app",
});

const shutdown = async (signal: string) => {
  daemon.logger.info(`received ${signal}`);
  await daemon.stop();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

daemon.logger.info(`envoyhome-daemon ready (ws=${daemon.config.wsPort} http=${daemon.config.httpPort})`);
