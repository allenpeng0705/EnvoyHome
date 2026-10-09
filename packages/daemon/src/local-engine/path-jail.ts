/** Jail model/binary paths under local-engine/{models,runtime}. */

import { basename } from "node:path";
import { PathJailError, safeJoin } from "../fs-jail.js";

export function resolveLocalModelPath(modelsDir: string, userPath: string): string {
  try {
    // Absolute paths must already sit under modelsDir; relative = basename under models.
    if (userPath.includes("/") || userPath.includes("\\")) {
      return safeJoin(modelsDir, userPath);
    }
    return safeJoin(modelsDir, basename(userPath));
  } catch (err) {
    if (err instanceof PathJailError) {
      throw Object.assign(
        new Error(`envoyhome.local_engine_path_jail: modelPath ${err.message}`),
        { code: "local_engine_path_jail" },
      );
    }
    throw err;
  }
}

export function resolveLocalBinaryPath(runtimeDir: string, userPath: string): string {
  try {
    if (userPath.includes("/") || userPath.includes("\\")) {
      return safeJoin(runtimeDir, userPath);
    }
    return safeJoin(runtimeDir, basename(userPath));
  } catch (err) {
    if (err instanceof PathJailError) {
      throw Object.assign(
        new Error(`envoyhome.local_engine_path_jail: binaryPath ${err.message}`),
        { code: "local_engine_path_jail" },
      );
    }
    throw err;
  }
}
