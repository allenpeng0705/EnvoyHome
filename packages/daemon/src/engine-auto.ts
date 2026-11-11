/**
 * Stage E — Obscura-first auto engine select (Design §9.5f.1 / V-OUT-34).
 * Prefer Obscura when ready; else fetch (dig) or Chromium (SERP/managed).
 * personal/remote never use these helpers for engine choice.
 */

import { registerResetHook } from "@envoyhome/test-utils";
import { probeObscuraRuntime } from "./web-extract-obscura.js";
import { probeBrowserRuntime } from "./web-search-browser.js";

export type ExtractBackendChoice = "auto" | "fetch" | "obscura";
export type EffectiveExtractBackend = "fetch" | "obscura";

export type SerpBrowserEngineChoice = "auto" | "chromium" | "obscura";
export type EffectiveSerpBrowserEngine = "chromium" | "obscura";

export type ManagedEngineChoice = "auto" | "chromium" | "obscura";
export type EffectiveManagedEngine = "chromium" | "obscura";

/** Shared headless engine id for SERP + managed. */
export type HeadlessEngine = "chromium" | "obscura";

export function isExtractBackendChoice(v: unknown): v is ExtractBackendChoice {
  return v === "auto" || v === "fetch" || v === "obscura";
}

export function isSerpBrowserEngineChoice(v: unknown): v is SerpBrowserEngineChoice {
  return v === "auto" || v === "chromium" || v === "obscura";
}

export function isManagedEngineChoice(v: unknown): v is ManagedEngineChoice {
  return v === "auto" || v === "chromium" || v === "obscura";
}

export type EngineReadiness = {
  obscuraReady: boolean;
  chromiumReady: boolean;
};

/** Test inject — when set, probeEngineReadiness / applyReadinessOverride use this. */
let readinessOverrideForTests: EngineReadiness | null = null;

export function __setEngineReadinessForTests(r: EngineReadiness | null): void {
  readinessOverrideForTests = r;
}

export function __resetEngineReadinessForTests(): void {
  readinessOverrideForTests = null;
}

registerResetHook(() => {
  __resetEngineReadinessForTests();
});

/**
 * Merge live probes with optional test override (Status for getPublicConfig).
 */
export function applyReadinessOverride(
  live: EngineReadiness,
): EngineReadiness {
  return readinessOverrideForTests
    ? { ...readinessOverrideForTests }
    : live;
}

/** Test inject / shared probes. */
export async function probeEngineReadiness(
  opts?: {
    probeObscura?: () => Promise<{ status: "ready" | "missing" }>;
    probeChromium?: () => Promise<{ status: "ready" | "missing" }>;
  },
): Promise<EngineReadiness> {
  if (readinessOverrideForTests) {
    return { ...readinessOverrideForTests };
  }
  const obscura = opts?.probeObscura
    ? await opts.probeObscura()
    : await probeObscuraRuntime();
  const chromium = opts?.probeChromium
    ? await opts.probeChromium()
    : await probeBrowserRuntime();
  return {
    obscuraReady: obscura.status === "ready",
    chromiumReady: chromium.status === "ready",
  };
}

/**
 * Dig / web_extract: auto → Obscura if ready else fetch.
 * Forced obscura still returns obscura (caller soft-fails if missing).
 */
export function resolveExtractBackend(
  choice: ExtractBackendChoice,
  readiness: EngineReadiness,
): EffectiveExtractBackend {
  if (choice === "fetch") return "fetch";
  if (choice === "obscura") return "obscura";
  return readiness.obscuraReady ? "obscura" : "fetch";
}

/**
 * True when the resolved dig backend can run now.
 * Forced obscura with binary missing → false (fetch is always runnable).
 */
export function isExtractBackendReady(
  backend: EffectiveExtractBackend,
  readiness: EngineReadiness,
): boolean {
  if (backend === "fetch") return true;
  return readiness.obscuraReady;
}

/**
 * SERP HTML: auto → Obscura if ready else Chromium if ready else null.
 * Forced engine returned as-is (caller soft-fails if missing).
 */
export function resolveSerpBrowserEngine(
  choice: SerpBrowserEngineChoice,
  readiness: EngineReadiness,
): EffectiveSerpBrowserEngine | null {
  if (choice === "obscura") return "obscura";
  if (choice === "chromium") return "chromium";
  if (readiness.obscuraReady) return "obscura";
  if (readiness.chromiumReady) return "chromium";
  return null;
}

/**
 * True when the resolved SERP/managed engine binary is actually present.
 * Forced obscura/chromium with runtime missing → false (do not report ready).
 */
export function isHeadlessEngineReady(
  engine: HeadlessEngine | null,
  readiness: EngineReadiness,
): engine is HeadlessEngine {
  if (!engine) return false;
  if (engine === "obscura") return readiness.obscuraReady;
  return readiness.chromiumReady;
}

/** Managed browser: same prefer order as SERP. personal/remote ignore. */
export function resolveManagedEngine(
  choice: ManagedEngineChoice,
  readiness: EngineReadiness,
): EffectiveManagedEngine | null {
  return resolveSerpBrowserEngine(choice, readiness);
}

/**
 * Whether Chromium install hints are relevant for the configured choice.
 * Auto only needs Chromium when Obscura is not already covering the plane.
 */
export function needsChromiumInstallHint(
  choice: SerpBrowserEngineChoice | ManagedEngineChoice,
  readiness: EngineReadiness,
): boolean {
  if (choice === "obscura") return false;
  if (choice === "chromium") return !readiness.chromiumReady;
  // auto: Chromium is the fallback — hint only when Obscura is also missing
  return !readiness.obscuraReady && !readiness.chromiumReady;
}

/**
 * Whether Obscura install hints are relevant for the configured choice.
 */
export function needsObscuraInstallHint(
  choice: ExtractBackendChoice | SerpBrowserEngineChoice | ManagedEngineChoice,
  readiness: EngineReadiness,
): boolean {
  if (choice === "fetch" || choice === "chromium") return false;
  if (choice === "obscura") return !readiness.obscuraReady;
  // auto
  return !readiness.obscuraReady;
}

export async function resolveExtractBackendAsync(
  choice: ExtractBackendChoice,
  opts?: Parameters<typeof probeEngineReadiness>[0],
): Promise<EffectiveExtractBackend> {
  return resolveExtractBackend(choice, await probeEngineReadiness(opts));
}

export async function resolveSerpBrowserEngineAsync(
  choice: SerpBrowserEngineChoice,
  opts?: Parameters<typeof probeEngineReadiness>[0],
): Promise<EffectiveSerpBrowserEngine | null> {
  return resolveSerpBrowserEngine(choice, await probeEngineReadiness(opts));
}

export async function resolveManagedEngineAsync(
  choice: ManagedEngineChoice,
  opts?: Parameters<typeof probeEngineReadiness>[0],
): Promise<EffectiveManagedEngine | null> {
  return resolveManagedEngine(choice, await probeEngineReadiness(opts));
}
