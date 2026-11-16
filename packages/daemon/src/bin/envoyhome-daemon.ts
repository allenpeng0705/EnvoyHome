#!/usr/bin/env node
// Bin entry for the EnvoyHome daemon (Plan B2).

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { startDaemon } from "../daemon.js";
import { defaultStateDir } from "../config.js";
import { PRODUCT_VERSION } from "../product-version.js";

const wsPort = Number(process.env.ENVOYHOME_WS_PORT ?? 4780);
const httpPort = Number(process.env.ENVOYHOME_HTTP_PORT ?? 4781);
// Prefer env; otherwise ~/.envoyhome (same as Tauri). Repo cwd/.envoyhome was a common
// split-brain when CLI and app disagreed — do not default to process.cwd().
const stateDir = process.env.ENVOYHOME_STATE_DIR ?? defaultStateDir();
const hatchApiKey = process.env.ENVOYHOME_HATCH_API_KEY ?? "";

// Hosting peer on by default so phones dial libp2p → relay (Design §2.3).
// Set ENVOYHOME_MESH_HOSTING=0 to disable (LAN/WS-only).
const meshHostingEnabled = process.env.ENVOYHOME_MESH_HOSTING !== "0";

/** Best-effort crash breadcrumb when the GUI swallows the console (Windows). */
function crashLog(line: string): void {
  try {
    const dir = join(stateDir, "logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "daemon.log"), `${line}\n`, "utf8");
  } catch {
    /* ignore */
  }
  try {
    process.stderr.write(`${line}\n`);
  } catch {
    /* ignore */
  }
}

process.on("uncaughtException", (err) => {
  crashLog(
    `[envoyhome-daemon] uncaughtException: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  crashLog(
    `[envoyhome-daemon] unhandledRejection: ${
      reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
    }`,
  );
  process.exit(1);
});

crashLog(`[envoyhome-daemon] starting (node=${process.version} platform=${process.platform})`);

let daemon;
try {
  daemon = await startDaemon({
    config: {
      wsPort,
      httpPort,
      stateDir,
      hatchApiKey,
      meshHostingEnabled,
      ...(process.env.ENVOYHOME_INSTANCE_ID
        ? { instanceId: process.env.ENVOYHOME_INSTANCE_ID }
        : {}),
    },
    packageVersion: PRODUCT_VERSION,
    managedBy: "app",
  });
} catch (err) {
  crashLog(
    `[envoyhome-daemon] startDaemon failed: ${
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    }`,
  );
  process.exit(1);
}

const shutdown = async (signal: string) => {
  daemon.logger.info(`received ${signal}`);
  await daemon.stop();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

daemon.logger.info(
  `envoyhome-daemon ready (ws=${daemon.config.wsPort} http=${daemon.config.httpPort})`,
);
crashLog(
  `[envoyhome-daemon] ready ws=${daemon.config.wsPort} http=${daemon.config.httpPort}`,
);
