// Doctor probe: missing DEBUG=libp2p:circuit-relay* (Plan B4 / Design §21 bar).
// Platform-appropriate — no /proc-only check (macOS-first).

export type DoctorSeverity = "info" | "warn" | "error";

export interface DoctorIssue {
  id: string;
  severity: DoctorSeverity;
  message: string;
  fixable: boolean;
}

/** Issue id for a missing circuit-relay DEBUG namespace. */
export const DOCTOR_MESH_RELAY_DEBUG_ID = "mesh.relay_debug_missing";

/**
 * True when `DEBUG` already enables `libp2p:circuit-relay` (exact or `*` / prefix).
 *
 * Matches the common debug package patterns:
 * - `libp2p:circuit-relay`
 * - `libp2p:circuit-relay*`
 * - `libp2p:*` / `*`
 */
export function hasCircuitRelayDebug(debugEnv: string | undefined): boolean {
  if (debugEnv === undefined) return false;
  const parts = debugEnv
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  for (const part of parts) {
    if (part === "*" || part === "libp2p:*") return true;
    if (part === "libp2p:circuit-relay" || part === "libp2p:circuit-relay*") return true;
    // Prefix with trailing *: e.g. libp2p:circuit-*
    if (part.endsWith("*")) {
      const prefix = part.slice(0, -1);
      if ("libp2p:circuit-relay".startsWith(prefix)) return true;
    }
  }
  return false;
}

/**
 * Platform-appropriate probe of the process environment. Avoids `/proc` so the
 * same check works on macOS (Darwin) and Linux CI.
 */
export function probeCircuitRelayDebug(
  env: NodeJS.ProcessEnv = process.env,
): { present: boolean; value: string | undefined } {
  const value = env["DEBUG"];
  return { present: hasCircuitRelayDebug(value), value };
}

/**
 * Doctor issue when production-ish environments lack relay DEBUG.
 * `production` defaults to `NODE_ENV === "production"` or an explicit flag.
 */
export function doctorMeshRelayDebugIssue(options: {
  env?: NodeJS.ProcessEnv;
  /** When false, skip the issue (dev/test). Default: NODE_ENV===production. */
  production?: boolean;
} = {}): DoctorIssue | null {
  const env = options.env ?? process.env;
  const production =
    options.production ??
    (env["NODE_ENV"] === "production" || env["ENVOYHOME_PRODUCTION"] === "1");
  if (!production) return null;

  const probe = probeCircuitRelayDebug(env);
  if (probe.present) return null;

  return {
    id: DOCTOR_MESH_RELAY_DEBUG_ID,
    severity: "warn",
    message:
      "DEBUG does not include libp2p:circuit-relay* — relay reservation failures will be silent in production logs. Set DEBUG=libp2p:circuit-relay* (or libp2p:*) on the daemon process.",
    fixable: false,
  };
}

/** Collect mesh-related doctor issues for `home.doctor`. */
export function collectMeshDoctorIssues(options: {
  env?: NodeJS.ProcessEnv;
  production?: boolean;
  dualModeNotes?: string[];
} = {}): DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  const relay = doctorMeshRelayDebugIssue(options);
  if (relay) issues.push(relay);
  for (const note of options.dualModeNotes ?? []) {
    issues.push({
      id: "mesh.dual_mode_note",
      severity: "info",
      message: note,
      fixable: false,
    });
  }
  return issues;
}
