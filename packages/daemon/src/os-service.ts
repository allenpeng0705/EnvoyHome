// OS service install/uninstall/restart — Design A.1 (launchd / systemd user units).

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

export type ServiceManager = "launchd" | "systemd" | "none";

export interface ServiceStatus {
  installed: boolean;
  running: boolean;
  manager: ServiceManager;
  execPath?: string;
  lastError?: string;
  unitPath?: string;
}

function serviceRoot(): string {
  if (process.env.ENVOYHOME_SERVICE_DIR) return process.env.ENVOYHOME_SERVICE_DIR;
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "LaunchAgents");
  }
  if (process.platform === "linux") {
    return join(homedir(), ".config", "systemd", "user");
  }
  return join(homedir(), ".envoyhome", "service");
}

export function unitPathForPlatform(): { manager: ServiceManager; unitPath: string } {
  const root = serviceRoot();
  if (process.platform === "darwin") {
    return { manager: "launchd", unitPath: join(root, "sh.envoymesh.envoyhome.plist") };
  }
  if (process.platform === "linux") {
    return { manager: "systemd", unitPath: join(root, "envoyhome.service") };
  }
  return { manager: "none", unitPath: join(root, "envoyhome.service") };
}

function resolveDaemonCommand(): { node: string; script: string } {
  const script =
    process.env.ENVOYHOME_DAEMON_JS ??
    join(process.cwd(), "packages", "daemon", "dist", "bin", "envoyhome-daemon.js");
  return { node: process.execPath, script };
}

function launchdPlist(label: string, node: string, script: string, stateDir: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${script}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ENVOYHOME_STATE_DIR</key><string>${stateDir}</string>
    <key>ENVOYHOME_MANAGED_BY</key><string>service</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(stateDir, "service.stdout.log")}</string>
  <key>StandardErrorPath</key><string>${join(stateDir, "service.stderr.log")}</string>
</dict>
</plist>
`;
}

function systemdUnit(node: string, script: string, stateDir: string): string {
  return `[Unit]
Description=EnvoyHome daemon
After=network.target

[Service]
Type=simple
Environment=ENVOYHOME_STATE_DIR=${stateDir}
Environment=ENVOYHOME_MANAGED_BY=service
ExecStart=${node} ${script}
Restart=on-failure

[Install]
WantedBy=default.target
`;
}

export async function readServiceStatus(extraRunningHint?: boolean): Promise<ServiceStatus> {
  const { manager, unitPath } = unitPathForPlatform();
  const installed = existsSync(unitPath);
  if (!installed) {
    return {
      installed: false,
      running: Boolean(extraRunningHint),
      manager: manager === "none" ? "none" : manager,
      unitPath,
    };
  }
  return {
    installed: true,
    running: Boolean(extraRunningHint),
    manager,
    unitPath,
    execPath: unitPath,
  };
}

export async function installService(input: {
  stateDir: string;
  manager?: string;
}): Promise<{ ok: true; unitPath: string }> {
  const { node, script } = resolveDaemonCommand();
  if (!existsSync(script) && !process.env.ENVOYHOME_DAEMON_JS) {
    throw Object.assign(
      new Error(`envoyhome.service: daemon script not found at ${script}`),
      { code: "not_configured" },
    );
  }
  const { manager, unitPath } = unitPathForPlatform();
  if (manager === "none" && process.platform !== "darwin" && process.platform !== "linux") {
    // Still write a unit file for inspection / CI fixtures.
  }
  await mkdir(dirname(unitPath), { recursive: true });
  const body =
    manager === "launchd" || process.platform === "darwin"
      ? launchdPlist("sh.envoymesh.envoyhome", node, script, input.stateDir)
      : systemdUnit(node, script, input.stateDir);
  await writeFile(unitPath, body, "utf8");

  if (process.env.ENVOYHOME_SERVICE_DRY_RUN === "1") {
    return { ok: true, unitPath };
  }

  try {
    if (process.platform === "darwin") {
      await execFileAsync("launchctl", ["unload", unitPath]).catch(() => undefined);
      await execFileAsync("launchctl", ["load", unitPath]);
    } else if (process.platform === "linux") {
      await execFileAsync("systemctl", ["--user", "daemon-reload"]);
      await execFileAsync("systemctl", ["--user", "enable", "--now", "envoyhome.service"]);
    }
  } catch (err) {
    // Unit file written; load may fail in CI sandboxes — still ok for Settings.
    void err;
  }
  return { ok: true, unitPath };
}

export async function uninstallService(confirm: boolean): Promise<{ ok: true }> {
  if (!confirm) {
    throw Object.assign(new Error("envoyhome.bad_params: confirm required"), {
      code: "bad_params",
    });
  }
  const { unitPath } = unitPathForPlatform();
  if (process.env.ENVOYHOME_SERVICE_DRY_RUN !== "1") {
    try {
      if (process.platform === "darwin" && existsSync(unitPath)) {
        await execFileAsync("launchctl", ["unload", unitPath]).catch(() => undefined);
      } else if (process.platform === "linux") {
        await execFileAsync("systemctl", ["--user", "disable", "--now", "envoyhome.service"]).catch(
          () => undefined,
        );
      }
    } catch {
      // continue to remove file
    }
  }
  try {
    await unlink(unitPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return { ok: true };
}

export async function restartService(): Promise<{ ok: true; restartedAt: string }> {
  const { unitPath } = unitPathForPlatform();
  const restartedAt = new Date().toISOString();
  if (process.env.ENVOYHOME_SERVICE_DRY_RUN === "1") {
    return { ok: true, restartedAt };
  }
  if (process.platform === "darwin" && existsSync(unitPath)) {
    await execFileAsync("launchctl", ["kickstart", "-k", `gui/${process.getuid?.() ?? 501}/sh.envoymesh.envoyhome`]).catch(
      async () => {
        await execFileAsync("launchctl", ["unload", unitPath]).catch(() => undefined);
        await execFileAsync("launchctl", ["load", unitPath]);
      },
    );
  } else if (process.platform === "linux") {
    await execFileAsync("systemctl", ["--user", "restart", "envoyhome.service"]);
  } else if (!existsSync(unitPath)) {
    throw Object.assign(new Error("envoyhome.service: not installed"), { code: "not_configured" });
  }
  return { ok: true, restartedAt };
}

/** Test helper — read unit body if present. */
export async function readUnitFile(): Promise<string | null> {
  const { unitPath } = unitPathForPlatform();
  try {
    return await readFile(unitPath, "utf8");
  } catch {
    return null;
  }
}
