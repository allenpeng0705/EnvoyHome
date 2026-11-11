// Built-in browser control — Design §9.5g / V-OUT-8 + §9.5g.1 / V-OUT-9/10 + §9.5g.2 / V-OUT-11…15 + §9.5g.3 / V-OUT-16…19 + §9.5i / V-OUT-20…24 + P2-J / V-OUT-25…27.

import { mkdir, open, readFile, writeFile, unlink, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { HomePaths } from "./home-paths.js";
import {
  browserInstallHint,
  probeBrowserRuntime,
  type BrowserRuntimeStatus,
  tryAcquireBrowserGate,
  releaseBrowserGate,
} from "./web-search-browser.js";
import {
  applyReadinessOverride,
  isHeadlessEngineReady,
  isManagedEngineChoice,
  probeEngineReadiness,
  resolveManagedEngine,
  type ManagedEngineChoice,
  type EffectiveManagedEngine,
} from "./engine-auto.js";
import { isBlockedHostname } from "./skill-remote.js";
import { assertHandoffOpenUrl } from "./outbound-url.js";
import {
  resolveSandboxPath,
  safeJoin,
  type WorkspaceMode,
  type WorkspaceMountRef,
} from "./fs-jail.js";
import { CHAT_MEDIA_MAX_BYTES } from "./chat-media.js";
import {
  BROWSER_FORM_FILE_MAX_COUNT,
  deriveBrowserFormFields,
  detectPaymentWall,
  isAllowedBrowserFormFileExt,
  isAllowedBrowserFormFileMime,
  isDeniedBrowserFormFileMagic,
  isPaymentFieldElement,
  matchesBrowserFormFileAccept,
  mimeFromBrowserFormFileName,
  parseBrowserFormFilePaths,
  type BrowserFormField,
} from "./browser-form.js";

/** Optional R3 workspace mounts for form file apply (§9.5g.3 / P2-J). */
export type BrowserWorkspaceMountResolver = (
  accountId: string,
) => Promise<WorkspaceMountRef[]>;

export { assertHandoffOpenUrl } from "./outbound-url.js";
export {
  deriveBrowserFormFields,
  detectPaymentWall,
  isAllowedBrowserFormFileExt,
  isAllowedBrowserFormFileMime,
  isDeniedBrowserFormFileMagic,
  isPaymentFieldElement,
  matchesBrowserFormFileAccept,
  mimeFromBrowserFormFileName,
  parseBrowserFormFilePaths,
  BROWSER_FORM_FIELD_CAP,
  BROWSER_FORM_FILE_EXT_ALLOW,
  BROWSER_FORM_FILE_EXT_MIME,
  BROWSER_FORM_FILE_MAX_COUNT,
  BROWSER_FORM_FILE_MIME_ALLOW,
  type BrowserFormField,
  type BrowserFormFieldKind,
} from "./browser-form.js";

export const BROWSER_CONTROL_ACTION_TIMEOUT_MS = 30_000;
export const BROWSER_CONTROL_MAX_CHARS = 40_000;
export const BROWSER_CONTROL_IDLE_MS = 5 * 60_000;
/** Max screenshot file size written under output/browser/ (Design §9.5g). */
export const BROWSER_CONTROL_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
/** Design §9.5g.2 — `wait` ms cap. */
export const BROWSER_CONTROL_WAIT_MS_CAP = 15_000;
export const BROWSER_CONTROL_SNAPSHOT_ELEMENT_CAP = 150;
export const BROWSER_CONTROL_WAIT_RETRIES = 3;
export const BROWSER_CONTROL_VERIFY_TEXT_CHARS = 1_200;
export const DEFAULT_PERSONAL_CDP = "http://127.0.0.1:9222";
const REMOTE_TOKEN_FILE = "browser_remote_cdp_token.secret";

export type BrowserProfile = "managed" | "personal" | "remote";

export type BrowserControlAction =
  | "doctor"
  | "status"
  | "start"
  | "stop"
  | "tabs"
  | "open"
  | "focus"
  | "close"
  | "navigate"
  | "snapshot"
  | "screenshot"
  | "act"
  | "text"
  | "wait"
  | "press"
  | "propose_form"
  | "apply_form"
  | "propose_handoff";

export type BrowserVerifyMode = "none" | "text" | "screenshot";
export type BrowserBlockedKind = "captcha" | "login_wall" | "challenge" | "payment";

const ACTIONS = new Set<BrowserControlAction>([
  "doctor",
  "status",
  "start",
  "stop",
  "tabs",
  "open",
  "focus",
  "close",
  "navigate",
  "snapshot",
  "screenshot",
  "act",
  "text",
  "wait",
  "press",
  "propose_form",
  "apply_form",
  "propose_handoff",
]);

const PRESS_KEYS = new Set([
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Space",
]);

const PROFILES = new Set<BrowserProfile>(["managed", "personal", "remote"]);

/** Effective managed engine after Stage E resolve (personal/remote ignore). */
export type ManagedBrowserEngine = "chromium" | "obscura";

export type { ManagedEngineChoice };

export type BrowserControlConfigFile = {
  enabled: boolean;
  unattendedEnabled: boolean;
  defaultProfile: BrowserProfile;
  managedEngine: ManagedEngineChoice;
  personal: { enabled: boolean; cdpEndpoint: string };
  remote: { enabled: boolean; cdpUrl: string };
  elevatedAcknowledgedAt: string | null;
  updatedAt: string;
};

export type BrowserControlPublicConfig = {
  enabled: boolean;
  unattendedEnabled: boolean;
  ready: boolean;
  browserRuntime: BrowserRuntimeStatus;
  browserInstallHint: string;
  managedEngine: ManagedEngineChoice;
  /** Resolved managed engine when available; omitted if neither ready under auto. */
  effectiveManagedEngine?: EffectiveManagedEngine;
  obscuraRuntime: "ready" | "missing";
  obscuraInstallHint: string;
  defaultProfile: BrowserProfile;
  personalEnabled: boolean;
  personalCdpEndpoint: string;
  personalReady: boolean;
  remoteEnabled: boolean;
  remoteCdpUrl: string;
  hasRemoteToken: boolean;
  remoteReady: boolean;
  elevatedAcknowledged: boolean;
  unavailableReason?: string;
  updatedAt?: string;
};

type PageLike = {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
  content(): Promise<string>;
  innerText(selector: string): Promise<string>;
  /** Optional Playwright route for SSRF on redirects/subresources. */
  route?(
    pattern: string,
    handler: (route: {
      request(): { url(): string };
      continue(): Promise<void>;
      abort(reason?: string): Promise<void>;
    }) => Promise<void> | void,
  ): Promise<void>;
  locator(selector: string): {
    count(): Promise<number>;
    nth(i: number): {
      click(opts?: { timeout?: number }): Promise<void>;
      fill(text: string, opts?: { timeout?: number }): Promise<void>;
      selectOption(value: string | string[]): Promise<unknown>;
      /** Playwright — set file input paths (§9.5g.3 / P2-J). */
      setInputFiles?(
        files: string | string[],
        opts?: { timeout?: number },
      ): Promise<void>;
      dragTo(target: { click(): Promise<void> }): Promise<void>;
      evaluate<T>(fn: (el: Element) => T): Promise<T>;
      screenshot(opts: { path: string; type?: string }): Promise<Buffer>;
    };
  };
  evaluate<T>(fn: (() => T | Promise<T>) | ((arg: unknown) => T | Promise<T>), arg?: unknown): Promise<T>;
  screenshot(opts: { path: string; fullPage?: boolean; type?: string }): Promise<Buffer>;
  waitForLoadState?(state: string, opts?: { timeout?: number }): Promise<void>;
  waitForSelector?(selector: string, opts?: { timeout?: number }): Promise<unknown>;
  waitForTimeout?(ms: number): Promise<void>;
  keyboard?: { press(key: string): Promise<void> };
  close(): Promise<void>;
};

type BrowserSession = {
  profile: BrowserProfile;
  /** When true, stop must not kill the attached Chrome process — only disconnect. */
  attachOnly: boolean;
  browser: { close(): Promise<void> };
  context: {
    newPage(): Promise<PageLike>;
    close(): Promise<void>;
  };
  tabs: Map<string, PageLike>;
  /** Per-tab monotonic snapshot id (Design §9.5g.2). */
  snapshotByTab: Map<string, string>;
  /** Last stamped elements per tab (for §9.5g.3 form derive / apply). */
  elementsByTab: Map<string, Array<Record<string, unknown>>>;
  snapshotSeq: number;
  focusedId: string | null;
  lastUsedAt: number;
  /** Stage C — which managed engine opened this session (engine switch must recreate). */
  managedEngine?: ManagedBrowserEngine;
  /** Stage C — stop daemon-owned obscura serve. */
  stopObscura?: () => Promise<void>;
};

/** Test inject — create a page without launching Chromium. */
export type BrowserPageFactory = () => Promise<PageLike>;

/** Test inject — simulate CDP connect. */
export type BrowserCdpConnect = (endpoint: string) => Promise<{
  browser: { close(): Promise<void>; contexts(): Array<{ pages(): PageLike[]; newPage(): Promise<PageLike> }> };
}>;

function defaultConfig(): BrowserControlConfigFile {
  return {
    enabled: false,
    unattendedEnabled: false,
    defaultProfile: "managed",
    managedEngine: "auto",
    personal: { enabled: false, cdpEndpoint: DEFAULT_PERSONAL_CDP },
    remote: { enabled: false, cdpUrl: "" },
    elevatedAcknowledgedAt: null,
    updatedAt: new Date(0).toISOString(),
  };
}

function isProfile(v: unknown): v is BrowserProfile {
  return typeof v === "string" && PROFILES.has(v as BrowserProfile);
}

export function isElevatedProfile(p: BrowserProfile): boolean {
  return p === "personal" || p === "remote";
}

/**
 * Design §7.4 / §9.5g — unattended (incl. schedule agentTurn) never defaults to elevated.
 * V-CRON-12: schedule fire path MUST use this so personal/remote are not the silent default.
 */
export function browserDefaultProfileForOrigin(
  origin: "attended" | "unattended",
  configuredDefault?: string | null,
): BrowserProfile {
  if (origin === "unattended") return "managed";
  if (configuredDefault === "personal" || configuredDefault === "remote" || configuredDefault === "managed") {
    return configuredDefault;
  }
  return "managed";
}

/** Personal CDP must be loopback-only. */
export function assertPersonalCdpEndpoint(raw: string): URL {
  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw Object.assign(new Error("envoyhome.bad_params: invalid personal CDP endpoint"), {
      code: "bad_params",
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw Object.assign(new Error("envoyhome.unsafe: personal CDP must be http(s)/ws(s)"), {
      code: "unsafe",
    });
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw Object.assign(
      new Error("envoyhome.unsafe: personal CDP endpoint must be loopback"),
      { code: "unsafe" },
    );
  }
  return url;
}

/** Remote CDP URL — Owner-typed; refuse metadata/link-local; no credentials-in-URL. */
export function assertRemoteCdpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw Object.assign(new Error("envoyhome.bad_params: invalid remote CDP URL"), {
      code: "bad_params",
    });
  }
  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:" &&
    url.protocol !== "ws:" &&
    url.protocol !== "wss:"
  ) {
    throw Object.assign(new Error("envoyhome.unsafe: remote CDP must be http(s)/ws(s)"), {
      code: "unsafe",
    });
  }
  // Owner may target LAN Browserless; still refuse cloud metadata + link-local.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "metadata.google.internal" || host === "169.254.169.254") {
    throw Object.assign(new Error("envoyhome.unsafe: remote CDP host refused"), {
      code: "unsafe",
    });
  }
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 169 && b === 254) {
      throw Object.assign(new Error("envoyhome.unsafe: remote CDP host refused"), {
        code: "unsafe",
      });
    }
  }
  return url;
}

/** SSRF for browser navigate/open — http(s) only; same host blocks as skill-remote. */
export function assertBrowserNavigateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw Object.assign(new Error("envoyhome.bad_params: invalid URL"), { code: "bad_params" });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw Object.assign(new Error("envoyhome.unsafe: browser URL must be http(s)"), {
      code: "unsafe",
    });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error("envoyhome.unsafe: browser URL must not include credentials"), {
      code: "unsafe",
    });
  }
  if (isBlockedHostname(url.hostname)) {
    throw Object.assign(new Error(`envoyhome.unsafe: browser URL host refused: ${url.hostname}`), {
      code: "unsafe",
    });
  }
  return url;
}

/** Allow data/blob/about; otherwise same as navigate SSRF (redirects + subresources). */
export function assertBrowserNetworkUrl(raw: string): void {
  const s = String(raw);
  if (
    s.startsWith("data:") ||
    s.startsWith("blob:") ||
    s.startsWith("about:") ||
    s.startsWith("chrome:") ||
    s.startsWith("chrome-extension:")
  ) {
    return;
  }
  assertBrowserNavigateUrl(s);
}

const SSRF_GUARDED_PAGES = new WeakSet<object>();

/** Install Playwright route that aborts SSRF-unsafe requests (incl. redirects). Idempotent per page. */
export async function installBrowserSsrfGuard(page: PageLike): Promise<void> {
  if (typeof page.route !== "function") return;
  if (SSRF_GUARDED_PAGES.has(page as object)) return;
  SSRF_GUARDED_PAGES.add(page as object);
  await page.route("**/*", async (route) => {
    try {
      assertBrowserNetworkUrl(route.request().url());
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}

function clampMaxChars(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return BROWSER_CONTROL_MAX_CHARS;
  return Math.min(BROWSER_CONTROL_MAX_CHARS, Math.floor(n));
}

function isAction(v: unknown): v is BrowserControlAction {
  return typeof v === "string" && ACTIONS.has(v as BrowserControlAction);
}

function parseVerifyMode(
  raw: unknown,
  origin: "attended" | "unattended",
): BrowserVerifyMode {
  if (raw === "none" || raw === "text" || raw === "screenshot") return raw;
  return origin === "unattended" ? "none" : "text";
}

/**
 * Design §9.5g.2 — honest wall/challenge refuse (never solve).
 *
 * `mode: "act"` — fail-closed only on strong captcha/challenge signals (URL/title/body
 * captcha markers, Cloudflare interstitial). Generic “Sign in” footer copy MUST NOT
 * block act on normal sites.
 * `mode: "advisory"` (navigate/snapshot) — also flag login-path URLs and strong
 * login-required title/body phrases as `login_wall` (warn; snapshot still returned).
 */
export function detectBrowserBlocked(input: {
  url: string;
  title?: string;
  textSample?: string;
  mode?: "act" | "advisory";
}): { blocked: BrowserBlockedKind; message: string } | null {
  const mode = input.mode ?? "advisory";
  const url = (input.url || "").toLowerCase();
  const title = (input.title || "").toLowerCase();
  const text = (input.textSample || "").toLowerCase();
  const head = `${url}\n${title}`;
  const blob = `${head}\n${text}`;

  if (
    /recaptcha|hcaptcha|cf-turnstile|captcha|challenge-platform|geo\.captcha|arkose/i.test(
      blob,
    )
  ) {
    return {
      blocked: "captcha",
      message:
        "CAPTCHA / bot challenge detected — hand off to Owner; Home will not solve it.",
    };
  }
  if (
    /cloudflare|attention required|just a moment|access denied|bot detection/i.test(blob)
  ) {
    return {
      blocked: "challenge",
      message:
        "Interstitial challenge page detected — hand off to Owner; Home will not bypass it.",
    };
  }

  // §9.5i / V-OUT-21 — page-level payment / wallet wall (URL/title/body only).
  // Per-ref payment fields are refused in runAct / runApplyForm via isPaymentFieldElement
  // so a settings page with one card widget does not block typing into other fields.
  if (
    detectPaymentWall({
      url: input.url,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.textSample !== undefined ? { textSample: input.textSample } : {}),
    })
  ) {
    return {
      blocked: "payment",
      message:
        "Payment / wallet wall detected — hand off via propose_handoff (https Open); Home will not fill card data.",
    };
  }

  // Act: stop here — do not treat nav chrome "Sign in" as a hard wall.
  if (mode === "act") return null;

  const loginPath =
    /\/login\b|\/signin\b|\/sign-in\b|\/sso\b|accounts\.google\.com\/v3\/signin|login\.microsoftonline|auth0\.com/i.test(
      url,
    );
  const strongLoginCopy =
    /\b(login required|please sign in|sign in to continue|log in to continue|verify you are human)\b/i.test(
      `${title}\n${text.slice(0, 400)}`,
    );
  if (loginPath || strongLoginCopy) {
    return {
      blocked: "login_wall",
      message:
        "Login wall detected — use an elevated personal/remote profile (Owner ack) or sign in yourself.",
    };
  }
  return null;
}

async function probeCdpEndpoint(endpoint: string): Promise<boolean> {
  try {
    const base = endpoint.replace(/^ws/, "http").replace(/\/$/, "");
    const ctrl = AbortSignal.timeout(1500);
    const res = await fetch(`${base}/json/version`, { signal: ctrl });
    return res.ok;
  } catch {
    return false;
  }
}

export class BrowserControlService {
  private cfg: BrowserControlConfigFile = defaultConfig();
  private remoteToken = "";
  private sessions = new Map<string, BrowserSession>();
  /** Injectable for tests. */
  pageFactory: BrowserPageFactory | null = null;
  /** Injectable CDP connect for tests. */
  cdpConnect: BrowserCdpConnect | null = null;
  /** Soft CDP probe override for tests. */
  cdpProbe: ((endpoint: string) => Promise<boolean>) | null = null;
  /**
   * Optional R3 workspace mounts (Design §4.2.1) for `workspace/…` form file paths.
   * Wired by the daemon from AccountStore; tests may inject.
   */
  workspaceMountsFor: BrowserWorkspaceMountResolver | null = null;

  constructor(private readonly paths: HomePaths) {}

  private secretPath(): string {
    return join(this.paths.secretsDir, REMOTE_TOKEN_FILE);
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(
        await readFile(this.paths.browserControlJson, "utf8"),
      ) as Record<string, unknown>;
      const personalRaw =
        raw.personal && typeof raw.personal === "object"
          ? (raw.personal as Record<string, unknown>)
          : {};
      const remoteRaw =
        raw.remote && typeof raw.remote === "object"
          ? (raw.remote as Record<string, unknown>)
          : {};
      const defaultProfile = isProfile(raw.defaultProfile) ? raw.defaultProfile : "managed";
      this.cfg = {
        enabled: raw.enabled === true,
        unattendedEnabled: raw.unattendedEnabled === true,
        defaultProfile,
        managedEngine: isManagedEngineChoice(raw.managedEngine)
          ? raw.managedEngine
          : "auto",
        personal: {
          enabled: personalRaw.enabled === true,
          cdpEndpoint:
            typeof personalRaw.cdpEndpoint === "string" && personalRaw.cdpEndpoint.trim()
              ? personalRaw.cdpEndpoint.trim()
              : DEFAULT_PERSONAL_CDP,
        },
        remote: {
          enabled: remoteRaw.enabled === true,
          cdpUrl: typeof remoteRaw.cdpUrl === "string" ? remoteRaw.cdpUrl.trim() : "",
        },
        elevatedAcknowledgedAt:
          typeof raw.elevatedAcknowledgedAt === "string" && raw.elevatedAcknowledgedAt
            ? raw.elevatedAcknowledgedAt
            : null,
        updatedAt:
          typeof raw.updatedAt === "string" && raw.updatedAt
            ? raw.updatedAt
            : new Date(0).toISOString(),
      };
    } catch {
      this.cfg = defaultConfig();
    }
    try {
      this.remoteToken = (await readFile(this.secretPath(), "utf8")).trim();
    } catch {
      this.remoteToken = "";
    }
  }

  readyInfo(): { ok: boolean; reason?: string } {
    if (!this.cfg.enabled) {
      return {
        ok: false,
        reason: "Browser control is disabled under Connections → Browser",
      };
    }
    return { ok: true };
  }

  private managedUnavailableReason(
    choice: ManagedEngineChoice,
    obscuraHint: string,
    chromeHint: string,
  ): string {
    if (choice === "obscura") {
      return `Managed browser needs Obscura on the daemon host — ${obscuraHint}`;
    }
    if (choice === "chromium") {
      return `Managed browser needs Chromium on the daemon host — ${chromeHint}`;
    }
    return `Managed browser needs Obscura or Chromium — Obscura: ${obscuraHint}; Chromium: ${chromeHint}`;
  }

  unattendedAllowed(): boolean {
    return this.cfg.unattendedEnabled === true;
  }

  resolveProfile(args: Record<string, unknown>): BrowserProfile {
    if (isProfile(args.profile)) return args.profile;
    return this.cfg.defaultProfile;
  }

  private async persistConfig(): Promise<void> {
    await mkdir(this.paths.stateDir, { recursive: true });
    await writeFile(
      this.paths.browserControlJson,
      `${JSON.stringify(
        {
          enabled: this.cfg.enabled,
          unattendedEnabled: this.cfg.unattendedEnabled,
          defaultProfile: this.cfg.defaultProfile,
          managedEngine: this.cfg.managedEngine,
          personal: this.cfg.personal,
          remote: {
            enabled: this.cfg.remote.enabled,
            cdpUrl: this.cfg.remote.cdpUrl,
          },
          elevatedAcknowledgedAt: this.cfg.elevatedAcknowledgedAt,
          updatedAt: this.cfg.updatedAt,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  async getPublicConfig(): Promise<BrowserControlPublicConfig> {
    const runtime = await probeBrowserRuntime();
    const { probeObscuraRuntime } = await import("./web-extract-obscura.js");
    const obscura = await probeObscuraRuntime();
    const readyInfo = this.readyInfo();
    const elevatedAck = !!this.cfg.elevatedAcknowledgedAt;
    const personalEndpoint = this.cfg.personal.cdpEndpoint || DEFAULT_PERSONAL_CDP;
    let personalReady = false;
    if (
      readyInfo.ok &&
      this.cfg.personal.enabled &&
      elevatedAck
    ) {
      const probe = this.cdpProbe ?? probeCdpEndpoint;
      personalReady = await probe(personalEndpoint);
    }
    let remoteReady = false;
    if (readyInfo.ok && this.cfg.remote.enabled && elevatedAck && this.cfg.remote.cdpUrl) {
      const probe = this.cdpProbe ?? probeCdpEndpoint;
      remoteReady = await probe(this.buildRemoteEndpoint());
    }
    const defaultProfile = this.cfg.defaultProfile;
    const readiness = applyReadinessOverride({
      obscuraReady: obscura.status === "ready",
      chromiumReady: runtime.status === "ready",
    });
    const effectiveManaged = resolveManagedEngine(this.cfg.managedEngine, readiness);
    // Forced engine with binary missing must not report ready (V-OUT-34).
    const managedReady = isHeadlessEngineReady(effectiveManaged, readiness);
    let ready = false;
    if (readyInfo.ok) {
      if (defaultProfile === "managed") ready = managedReady;
      else if (defaultProfile === "personal") ready = personalReady;
      else ready = remoteReady;
    }
    const out: BrowserControlPublicConfig = {
      enabled: this.cfg.enabled,
      unattendedEnabled: this.cfg.unattendedEnabled,
      ready,
      browserRuntime: readiness.chromiumReady ? "ready" : "missing",
      browserInstallHint: runtime.installHint,
      managedEngine: this.cfg.managedEngine,
      ...(effectiveManaged ? { effectiveManagedEngine: effectiveManaged } : {}),
      obscuraRuntime: readiness.obscuraReady ? "ready" : "missing",
      obscuraInstallHint: obscura.installHint,
      defaultProfile,
      personalEnabled: this.cfg.personal.enabled,
      personalCdpEndpoint: personalEndpoint,
      personalReady,
      remoteEnabled: this.cfg.remote.enabled,
      remoteCdpUrl: this.cfg.remote.cdpUrl,
      hasRemoteToken: this.remoteToken.length > 0,
      remoteReady,
      elevatedAcknowledged: elevatedAck,
    };
    if (this.cfg.updatedAt && this.cfg.updatedAt !== new Date(0).toISOString()) {
      out.updatedAt = this.cfg.updatedAt;
    }
    if (!ready) {
      const reason = readyInfo.reason;
      if (!this.cfg.enabled && typeof reason === "string" && reason.length > 0) {
        out.unavailableReason = reason;
      } else if (defaultProfile === "managed" && !managedReady) {
        out.unavailableReason = this.managedUnavailableReason(
          this.cfg.managedEngine,
          obscura.installHint,
          runtime.installHint,
        );
      } else if (defaultProfile === "personal" && !elevatedAck) {
        out.unavailableReason = "Acknowledge elevated browser risk in Settings";
      } else if (defaultProfile === "personal" && !this.cfg.personal.enabled) {
        out.unavailableReason = "Personal profile is disabled";
      } else if (defaultProfile === "personal") {
        out.unavailableReason = `Personal Chrome CDP not reachable at ${personalEndpoint}`;
      } else if (defaultProfile === "remote" && !elevatedAck) {
        out.unavailableReason = "Acknowledge elevated browser risk in Settings";
      } else if (defaultProfile === "remote" && !this.cfg.remote.enabled) {
        out.unavailableReason = "Remote profile is disabled";
      } else if (defaultProfile === "remote" && !this.cfg.remote.cdpUrl) {
        out.unavailableReason = "Remote CDP URL not configured";
      } else if (defaultProfile === "remote") {
        out.unavailableReason = "Remote CDP not reachable";
      }
    }
    return out;
  }

  private buildRemoteEndpoint(): string {
    let url = this.cfg.remote.cdpUrl.trim();
    if (this.remoteToken && !url.includes("token=") && !url.includes("@")) {
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}token=${encodeURIComponent(this.remoteToken)}`;
    }
    return url;
  }

  async setConfig(input: {
    enabled?: boolean;
    unattendedEnabled?: boolean;
    defaultProfile?: string;
    managedEngine?: string;
    personalEnabled?: boolean;
    personalCdpEndpoint?: string;
    remoteEnabled?: boolean;
    remoteCdpUrl?: string;
    remoteToken?: string | null;
    acknowledgeElevated?: boolean;
  }): Promise<BrowserControlPublicConfig> {
    if (input.acknowledgeElevated === true) {
      this.cfg.elevatedAcknowledgedAt = new Date().toISOString();
    }
    if (typeof input.enabled === "boolean") this.cfg.enabled = input.enabled;
    if (typeof input.unattendedEnabled === "boolean") {
      this.cfg.unattendedEnabled = input.unattendedEnabled;
    }
    if (typeof input.managedEngine === "string") {
      const e = input.managedEngine.trim().toLowerCase();
      if (!isManagedEngineChoice(e)) {
        throw Object.assign(
          new Error(`envoyhome.bad_params: unknown managedEngine: ${input.managedEngine}`),
          { code: "bad_params" },
        );
      }
      const prev = this.cfg.managedEngine;
      this.cfg.managedEngine = e;
      // Engine switch must not reuse a Chromium/Obscura session from the other runtime.
      if (prev !== e) {
        await this.stopAllManagedSessions();
      }
    }
    if (typeof input.personalEnabled === "boolean") {
      if (input.personalEnabled && !this.cfg.elevatedAcknowledgedAt) {
        throw Object.assign(
          new Error("envoyhome.bad_params: acknowledge elevated browser risk first"),
          { code: "bad_params" },
        );
      }
      this.cfg.personal.enabled = input.personalEnabled;
    }
    if (typeof input.personalCdpEndpoint === "string") {
      const u = assertPersonalCdpEndpoint(input.personalCdpEndpoint);
      this.cfg.personal.cdpEndpoint = u.href.replace(/\/$/, "");
    }
    if (typeof input.remoteEnabled === "boolean") {
      if (input.remoteEnabled && !this.cfg.elevatedAcknowledgedAt) {
        throw Object.assign(
          new Error("envoyhome.bad_params: acknowledge elevated browser risk first"),
          { code: "bad_params" },
        );
      }
      this.cfg.remote.enabled = input.remoteEnabled;
    }
    if (typeof input.remoteCdpUrl === "string") {
      if (input.remoteCdpUrl.trim()) {
        const u = assertRemoteCdpUrl(input.remoteCdpUrl);
        if (u.username || u.password) {
          throw Object.assign(
            new Error("envoyhome.unsafe: put CDP token in remoteToken, not the URL"),
            { code: "unsafe" },
          );
        }
        this.cfg.remote.cdpUrl = u.href.replace(/\/$/, "");
      } else {
        this.cfg.remote.cdpUrl = "";
      }
    }
    if (input.remoteToken !== undefined) {
      await mkdir(this.paths.secretsDir, { recursive: true, mode: 0o700 });
      if (input.remoteToken === null || input.remoteToken === "") {
        this.remoteToken = "";
        await unlink(this.secretPath()).catch(() => undefined);
      } else {
        this.remoteToken = String(input.remoteToken);
        await writeFile(this.secretPath(), this.remoteToken, { encoding: "utf8", mode: 0o600 });
      }
    }
    if (typeof input.defaultProfile === "string") {
      if (!isProfile(input.defaultProfile)) {
        throw Object.assign(new Error("envoyhome.bad_params: invalid defaultProfile"), {
          code: "bad_params",
        });
      }
      if (isElevatedProfile(input.defaultProfile)) {
        if (!this.cfg.elevatedAcknowledgedAt) {
          throw Object.assign(
            new Error("envoyhome.bad_params: acknowledge elevated browser risk first"),
            { code: "bad_params" },
          );
        }
        if (input.defaultProfile === "personal" && !this.cfg.personal.enabled) {
          throw Object.assign(
            new Error("envoyhome.bad_params: enable personal profile first"),
            { code: "bad_params" },
          );
        }
        if (input.defaultProfile === "remote" && !this.cfg.remote.enabled) {
          throw Object.assign(
            new Error("envoyhome.bad_params: enable remote profile first"),
            { code: "bad_params" },
          );
        }
      }
      this.cfg.defaultProfile = input.defaultProfile;
    }
    this.cfg.updatedAt = new Date().toISOString();
    await this.persistConfig();
    return this.getPublicConfig();
  }

  async runTool(
    args: Record<string, unknown>,
    opts: {
      accountId: string;
      origin?: "attended" | "unattended";
      ownerAccountId?: string | null;
      /**
       * Daemon-only: `apply_form` carries secrets and MUST NOT be agent-callable
       * (Design §9.5g.3 / V-OUT-18). Set only from ChoiceStore answer path.
       */
      internal?: boolean;
    },
  ): Promise<string> {
    const ready = this.readyInfo();
    if (!ready.ok) {
      throw Object.assign(
        new Error(`envoyhome.tool_unavailable: ${ready.reason ?? "browser unavailable"}`),
        { code: "tool_unavailable" },
      );
    }

    // Fail closed before profile gates — never let model tool args carry fieldValues.
    if (args.action === "apply_form" && opts.internal !== true) {
      throw Object.assign(
        new Error(
          "envoyhome.bad_params: apply_form is daemon-internal — use propose_form + form card",
        ),
        { code: "bad_params" },
      );
    }

    const profile = this.resolveProfile(args);
    const origin = opts.origin ?? "attended";

    if (isElevatedProfile(profile)) {
      if (origin === "unattended") {
        throw Object.assign(
          new Error("envoyhome.tool_unavailable: elevated browser profiles refuse unattended"),
          { code: "tool_unavailable" },
        );
      }
      if (!this.cfg.elevatedAcknowledgedAt) {
        throw Object.assign(
          new Error("envoyhome.tool_unavailable: elevated browser risk not acknowledged"),
          { code: "tool_unavailable" },
        );
      }
      if (profile === "personal" && !this.cfg.personal.enabled) {
        throw Object.assign(
          new Error("envoyhome.tool_unavailable: personal profile is disabled"),
          { code: "tool_unavailable" },
        );
      }
      if (profile === "remote" && !this.cfg.remote.enabled) {
        throw Object.assign(
          new Error("envoyhome.tool_unavailable: remote profile is disabled"),
          { code: "tool_unavailable" },
        );
      }
      const ownerId = opts.ownerAccountId ?? null;
      if (!ownerId || opts.accountId !== ownerId) {
        throw Object.assign(
          new Error("envoyhome.tool_unavailable: elevated browser is Owner-account only"),
          { code: "tool_unavailable" },
        );
      }
    } else if (origin === "unattended") {
      if (!this.cfg.unattendedEnabled) {
        throw Object.assign(
          new Error("envoyhome.tool_unavailable: unattended browser control is off"),
          { code: "tool_unavailable" },
        );
      }
      if (profile !== "managed") {
        throw Object.assign(
          new Error("envoyhome.tool_unavailable: unattended browser requires managed profile"),
          { code: "tool_unavailable" },
        );
      }
    }

    const action = args.action;
    if (!isAction(action)) {
      throw Object.assign(
        new Error(`envoyhome.bad_params: unknown browser action: ${String(action)}`),
        { code: "bad_params" },
      );
    }

    if (action === "doctor" || action === "status") {
      const pub = await this.getPublicConfig();
      const session = this.sessions.get(this.sessionKey(opts.accountId, profile));
      return JSON.stringify({
        action,
        profile,
        enabled: pub.enabled,
        managedEngine: pub.managedEngine,
        ...(pub.effectiveManagedEngine
          ? { effectiveManagedEngine: pub.effectiveManagedEngine }
          : {}),
        browserRuntime: pub.browserRuntime,
        browserInstallHint: pub.browserInstallHint,
        obscuraRuntime: pub.obscuraRuntime,
        obscuraInstallHint: pub.obscuraInstallHint,
        ready: pub.ready,
        personalReady: pub.personalReady,
        remoteReady: pub.remoteReady,
        session: session
          ? {
              tabs: session.tabs.size,
              focusedId: session.focusedId,
              profile: session.profile,
              ...(session.managedEngine ? { managedEngine: session.managedEngine } : {}),
            }
          : null,
      });
    }

    // §9.5i — handoff card needs no Playwright session (https openUrl only).
    if (action === "propose_handoff") {
      return this.runProposeHandoff(args);
    }

    if (profile === "managed" && !this.pageFactory) {
      const readiness = await probeEngineReadiness();
      const effective = resolveManagedEngine(this.cfg.managedEngine, readiness);
      if (!isHeadlessEngineReady(effective, readiness)) {
        const { obscuraInstallHint } = await import("./web-extract-obscura.js");
        return JSON.stringify({
          action,
          profile,
          managedEngine: this.cfg.managedEngine,
          ...(effective ? { effectiveManagedEngine: effective } : {}),
          error: "runtime_missing",
          browserInstallHint: this.managedUnavailableReason(
            this.cfg.managedEngine,
            obscuraInstallHint(),
            browserInstallHint(),
          ),
        });
      }
    }

    if (action === "stop") {
      await this.stopSession(opts.accountId, profile);
      return JSON.stringify({ action: "stop", profile, ok: true });
    }

    // Concurrency 1 with SERP; no SERP 10s rate limit on interactive browser (§9.5g).
    const acquired = tryAcquireBrowserGate({ rateLimit: false });
    if (!acquired.ok) {
      return JSON.stringify({
        action,
        profile,
        error: acquired.code,
        message: acquired.error,
      });
    }
    try {
      return await this.dispatchAction(action, args, opts.accountId, profile, origin);
    } finally {
      releaseBrowserGate();
    }
  }

  private sessionKey(accountId: string, profile: BrowserProfile): string {
    return `${accountId}:${profile}`;
  }

  private async dispatchAction(
    action: BrowserControlAction,
    args: Record<string, unknown>,
    accountId: string,
    profile: BrowserProfile,
    origin: "attended" | "unattended",
  ): Promise<string> {
    if (action === "start") {
      await this.ensureSession(accountId, profile);
      return JSON.stringify({ action: "start", profile, ok: true });
    }

    const session = await this.ensureSession(accountId, profile);
    session.lastUsedAt = Date.now();

    if (action === "tabs") {
      const tabs = [];
      for (const [id, page] of session.tabs) {
        tabs.push({
          targetId: id,
          url: page.url(),
          title: await page.title().catch(() => ""),
          focused: id === session.focusedId,
          snapshotId: session.snapshotByTab.get(id) ?? null,
        });
      }
      return JSON.stringify({ action: "tabs", profile, tabs });
    }

    if (action === "open" || action === "navigate") {
      const url = assertBrowserNavigateUrl(String(args.url ?? "")).href;
      let page: PageLike;
      let targetId: string;
      if (action === "open" || !session.focusedId || !session.tabs.has(session.focusedId)) {
        page = await this.newPage(session);
        await installBrowserSsrfGuard(page);
        targetId = randomUUID().slice(0, 8);
        session.tabs.set(targetId, page);
        session.focusedId = targetId;
      } else {
        targetId = session.focusedId;
        page = session.tabs.get(targetId)!;
        // Defense in depth — reuse path must keep the SSRF route guard.
        await installBrowserSsrfGuard(page);
      }
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: BROWSER_CONTROL_ACTION_TIMEOUT_MS,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/blockedbyclient|net::ERR_BLOCKED|SSRF|unsafe|refused/i.test(msg)) {
          throw Object.assign(
            new Error("envoyhome.unsafe: browser navigation blocked (SSRF)"),
            { code: "unsafe" },
          );
        }
        throw err;
      }
      // Re-check final URL after redirects (defense in depth).
      try {
        assertBrowserNavigateUrl(page.url());
      } catch {
        throw Object.assign(
          new Error("envoyhome.unsafe: browser landed on refused URL after redirect"),
          { code: "unsafe" },
        );
      }
      const title = await page.title().catch(() => "");
      const textSample = await page.innerText("body").catch(() => "");
      const blocked = detectBrowserBlocked({
        url: page.url(),
        title,
        textSample: textSample.slice(0, 2_000),
        mode: "advisory",
      });
      const snap = await this.stampSnapshot(
        session,
        targetId,
        page,
        clampMaxChars(args.maxChars),
        args.includeHidden === true,
      );
      if (blocked) {
        return JSON.stringify({
          action,
          profile,
          targetId,
          url: page.url(),
          title,
          snapshotId: snap.snapshotId,
          snapshot: snap,
          blocked: blocked.blocked,
          message: blocked.message,
        });
      }
      return JSON.stringify({
        action,
        profile,
        targetId,
        url: page.url(),
        title,
        snapshotId: snap.snapshotId,
        snapshot: snap,
      });
    }

    if (action === "focus" || action === "close") {
      const targetId = String(args.targetId ?? "");
      if (!targetId || !session.tabs.has(targetId)) {
        throw Object.assign(new Error("envoyhome.bad_params: unknown targetId"), {
          code: "bad_params",
        });
      }
      if (action === "focus") {
        session.focusedId = targetId;
        return JSON.stringify({ action: "focus", profile, targetId });
      }
      const page = session.tabs.get(targetId)!;
      session.tabs.delete(targetId);
      session.snapshotByTab.delete(targetId);
      session.elementsByTab.delete(targetId);
      if (session.focusedId === targetId) {
        session.focusedId = session.tabs.keys().next().value ?? null;
      }
      await page.close().catch(() => undefined);
      return JSON.stringify({ action: "close", profile, targetId, ok: true });
    }

    const page = this.requireFocusedPage(session, args.targetId);
    const targetId = session.focusedId!;

    if (action === "snapshot") {
      const title = await page.title().catch(() => "");
      const textSample = await page.innerText("body").catch(() => "");
      const blocked = detectBrowserBlocked({
        url: page.url(),
        title,
        textSample: textSample.slice(0, 2_000),
        mode: "advisory",
      });
      const snap = await this.stampSnapshot(
        session,
        targetId,
        page,
        clampMaxChars(args.maxChars),
        args.includeHidden === true,
      );
      return JSON.stringify({
        action: "snapshot",
        profile,
        targetId,
        url: page.url(),
        title,
        snapshotId: snap.snapshotId,
        snapshot: snap,
        ...(blocked
          ? { blocked: blocked.blocked, message: blocked.message }
          : {}),
      });
    }

    if (action === "text") {
      const maxChars = clampMaxChars(args.maxChars);
      const selector =
        typeof args.selector === "string" && args.selector.trim()
          ? args.selector.trim()
          : "body";
      let text = "";
      try {
        text = await page.innerText(selector);
      } catch {
        text = await page.evaluate(() => document.body?.innerText ?? "");
      }
      text = (text || "").trim();
      const truncated = text.length > maxChars;
      if (truncated) text = text.slice(0, maxChars);
      return JSON.stringify({
        action: "text",
        profile,
        targetId,
        text,
        truncated,
      });
    }

    if (action === "screenshot") {
      const shot = await this.writeScreenshot(page, accountId, args.fullPage === true);
      return JSON.stringify({
        action: "screenshot",
        profile,
        targetId,
        path: shot.path,
        bytes: shot.bytes,
      });
    }

    if (action === "wait") {
      return this.runWait(page, session, args, profile, targetId);
    }

    if (action === "press") {
      return this.runPress(page, session, args, profile, targetId);
    }

    if (action === "propose_form") {
      return this.runProposeForm(page, session, args, profile, origin, targetId);
    }

    if (action === "apply_form") {
      return this.runApplyForm(page, session, args, profile, origin, accountId, targetId);
    }

    if (action === "act") {
      return this.runAct(page, session, args, profile, origin, accountId, targetId);
    }

    throw Object.assign(new Error(`envoyhome.bad_params: unhandled action ${action}`), {
      code: "bad_params",
    });
  }

  private async stampSnapshot(
    session: BrowserSession,
    targetId: string,
    page: PageLike,
    maxChars: number,
    includeHidden: boolean,
  ): Promise<{
    snapshotId: string;
    elements: Array<Record<string, unknown>>;
    truncated: boolean;
  }> {
    session.snapshotSeq += 1;
    const snapshotId = `s${session.snapshotSeq}`;
    session.snapshotByTab.set(targetId, snapshotId);
    const built = await this.buildSnapshot(page, maxChars, includeHidden);
    session.elementsByTab.set(targetId, built.elements);
    return { snapshotId, ...built };
  }

  private clearTabSnapshot(session: BrowserSession, targetId: string): void {
    session.snapshotByTab.delete(targetId);
    session.elementsByTab.delete(targetId);
  }

  /** §9.5i — validate handoff payload; turn-service parks the choice card. */
  private runProposeHandoff(args: Record<string, unknown>): string {
    const openUrl = assertHandoffOpenUrl(String(args.openUrl ?? "")).href;
    const question =
      typeof args.question === "string" && args.question.trim()
        ? args.question.trim().slice(0, 500)
        : "Finish in your app (Open), then pay there — Home will not enter card details.";
    const title =
      typeof args.title === "string" && args.title.trim()
        ? args.title.trim().slice(0, 200)
        : undefined;
    const steps = Array.isArray(args.steps)
      ? args.steps
          .map((s) => String(s ?? "").trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    return JSON.stringify({
      action: "propose_handoff",
      ok: true,
      openUrl,
      question,
      ...(title ? { title } : {}),
      ...(steps.length ? { steps } : {}),
      message:
        "Handoff ready — Owner Open launches https (app may catch Universal Link). Do not claim daemon cart is already in the phone app.",
    });
  }

  private async runProposeForm(
    page: PageLike,
    session: BrowserSession,
    args: Record<string, unknown>,
    profile: BrowserProfile,
    origin: "attended" | "unattended",
    targetId: string,
  ): Promise<string> {
    const title = await page.title().catch(() => "");
    const url = page.url();
    const textSample = await page.innerText("body").catch(() => "");
    const blocked = detectBrowserBlocked({
      url,
      title,
      textSample: textSample.slice(0, 2_000),
      mode: "act",
    });
    // V-OUT-19 / V-OUT-21 — CAPTCHA / challenge / payment must not open a form card.
    if (
      blocked &&
      (blocked.blocked === "captcha" ||
        blocked.blocked === "challenge" ||
        blocked.blocked === "payment")
    ) {
      return JSON.stringify({
        action: "propose_form",
        profile,
        ok: false,
        targetId,
        blocked: blocked.blocked,
        message: blocked.message,
        url,
        title,
      });
    }

    let snapshotId = session.snapshotByTab.get(targetId);
    let elements = session.elementsByTab.get(targetId);
    const givenSnap =
      typeof args.snapshotId === "string" ? args.snapshotId.trim() : "";
    if (givenSnap) {
      if (!snapshotId || givenSnap !== snapshotId || !elements) {
        return JSON.stringify({
          action: "propose_form",
          profile,
          ok: false,
          error: "stale_snapshot",
          message: "snapshotId missing or stale — take a new snapshot",
          targetId,
          expectedSnapshotId: snapshotId ?? null,
          gotSnapshotId: givenSnap,
        });
      }
    } else if (!snapshotId || !elements) {
      const snap = await this.stampSnapshot(
        session,
        targetId,
        page,
        clampMaxChars(args.maxChars),
        args.includeHidden === true,
      );
      snapshotId = snap.snapshotId;
      elements = snap.elements;
    }

    const fieldRefs = Array.isArray(args.fieldRefs)
      ? args.fieldRefs.map((r) => String(r)).filter(Boolean)
      : undefined;
    const submitArg =
      typeof args.submitRef === "string" && args.submitRef.trim()
        ? args.submitRef.trim()
        : undefined;
    const derived = deriveBrowserFormFields(elements ?? [], {
      ...(fieldRefs?.length ? { fieldRefs } : {}),
      ...(submitArg ? { submitRef: submitArg } : {}),
    });
    if (
      derived.paymentBlocked ||
      detectPaymentWall({ url, title, textSample: textSample.slice(0, 2_000), elements })
    ) {
      return JSON.stringify({
        action: "propose_form",
        profile,
        ok: false,
        targetId,
        snapshotId,
        blocked: "payment",
        message:
          "Payment / card fields detected — use propose_handoff with an https openUrl; Home will not fill card data.",
        url,
        title,
        ...(derived.skippedPaymentFields
          ? { skippedPaymentFields: derived.skippedPaymentFields }
          : {}),
      });
    }
    if (derived.fields.length === 0) {
      return JSON.stringify({
        action: "propose_form",
        profile,
        ok: false,
        error: "no_fields",
        message: "no fillable form controls in snapshot",
        targetId,
        snapshotId,
        url,
        title,
      });
    }
    const hasSensitive = derived.fields.some((f) => f.sensitive);
    const hasFile = derived.fields.some((f) => f.kind === "file");
    if (origin === "unattended" && hasSensitive) {
      return JSON.stringify({
        action: "propose_form",
        profile,
        ok: false,
        error: "sensitive_unattended",
        message: "unattended refuses password/otp form fields",
        targetId,
        snapshotId,
        url,
        title,
      });
    }
    // V-OUT-27 — unattended refuses any file field (no grant bypass in v1).
    if (origin === "unattended" && hasFile) {
      return JSON.stringify({
        action: "propose_form",
        profile,
        ok: false,
        error: "file_unattended",
        message: "unattended refuses file form fields",
        targetId,
        snapshotId,
        url,
        title,
      });
    }

    return JSON.stringify({
      action: "propose_form",
      profile,
      ok: true,
      targetId,
      snapshotId,
      url,
      title,
      fields: derived.fields,
      ...(derived.submitRef ? { submitRef: derived.submitRef } : {}),
      ...(blocked ? { blocked: blocked.blocked, message: blocked.message } : {}),
    });
  }

  private async runApplyForm(
    page: PageLike,
    session: BrowserSession,
    args: Record<string, unknown>,
    profile: BrowserProfile,
    origin: "attended" | "unattended",
    accountId: string,
    targetId: string,
  ): Promise<string> {
    const currentSnap = session.snapshotByTab.get(targetId);
    const givenSnap = typeof args.snapshotId === "string" ? args.snapshotId.trim() : "";
    if (!givenSnap || !currentSnap || givenSnap !== currentSnap) {
      return JSON.stringify({
        action: "apply_form",
        profile,
        ok: false,
        error: "stale_snapshot",
        message: "snapshotId missing or stale — no fill",
        targetId,
        expectedSnapshotId: currentSnap ?? null,
        gotSnapshotId: givenSnap || null,
      });
    }

    const rawFields = Array.isArray(args.fields) ? args.fields : [];
    const fields: BrowserFormField[] = [];
    for (const f of rawFields) {
      if (!f || typeof f !== "object" || Array.isArray(f)) continue;
      const rec = f as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id.trim() : "";
      const ref = typeof rec.ref === "string" ? rec.ref.trim() : "";
      const kind = rec.kind;
      if (!id || !ref) continue;
      if (
        kind !== "text" &&
        kind !== "password" &&
        kind !== "otp" &&
        kind !== "textarea" &&
        kind !== "select" &&
        kind !== "checkbox" &&
        kind !== "file"
      ) {
        continue;
      }
      const accept =
        kind === "file" && typeof rec.accept === "string" && rec.accept.trim()
          ? rec.accept.trim().slice(0, 200)
          : undefined;
      fields.push({
        id,
        label: typeof rec.label === "string" ? rec.label : id,
        ref,
        kind,
        sensitive: rec.sensitive === true || kind === "password" || kind === "otp",
        ...(rec.required === true ? { required: true } : {}),
        ...(accept ? { accept } : {}),
        ...(kind === "file" && rec.multiple === true ? { multiple: true } : {}),
      });
    }
    if (fields.length === 0) {
      throw Object.assign(new Error("envoyhome.bad_params: apply_form requires fields"), {
        code: "bad_params",
      });
    }

    const valuesRaw = args.fieldValues;
    if (!valuesRaw || typeof valuesRaw !== "object" || Array.isArray(valuesRaw)) {
      throw Object.assign(new Error("envoyhome.bad_params: apply_form requires fieldValues"), {
        code: "bad_params",
      });
    }
    const fieldValues = valuesRaw as Record<string, unknown>;

    if (origin === "unattended" && fields.some((f) => f.sensitive)) {
      return JSON.stringify({
        action: "apply_form",
        profile,
        ok: false,
        error: "sensitive_unattended",
        message: "unattended refuses password/otp form fields",
        targetId,
        snapshotId: currentSnap,
      });
    }
    // V-OUT-27
    if (origin === "unattended" && fields.some((f) => f.kind === "file")) {
      return JSON.stringify({
        action: "apply_form",
        profile,
        ok: false,
        error: "file_unattended",
        message: "unattended refuses file form fields",
        targetId,
        snapshotId: currentSnap,
      });
    }

    const beforeUrl = page.url();
    const title = await page.title().catch(() => "");
    const textSample = await page.innerText("body").catch(() => "");
    const stampedEls = session.elementsByTab.get(targetId) ?? [];
    const blocked = detectBrowserBlocked({
      url: beforeUrl,
      title,
      textSample: textSample.slice(0, 2_000),
      mode: "act",
    });
    // V-OUT-21 — refuse captcha/challenge/payment; never fill card fields.
    if (
      blocked &&
      (blocked.blocked === "captcha" ||
        blocked.blocked === "challenge" ||
        blocked.blocked === "payment")
    ) {
      return JSON.stringify({
        action: "apply_form",
        profile,
        ok: false,
        targetId,
        snapshotId: currentSnap,
        blocked: blocked.blocked,
        message: blocked.message,
        url: beforeUrl,
      });
    }
    for (const f of fields) {
      const el = stampedEls.find((e) => String(e.ref ?? "") === String(f.ref ?? ""));
      if (el && isPaymentFieldElement(el)) {
        return JSON.stringify({
          action: "apply_form",
          profile,
          ok: false,
          targetId,
          snapshotId: currentSnap,
          blocked: "payment",
          message:
            "Payment / card field ref refused — use propose_handoff; Home will not fill card data.",
          url: beforeUrl,
          ref: f.ref,
        });
      }
    }

    // Enforce required before any mutation (ChoiceStore also checks; defense in depth).
    for (const f of fields) {
      if (!f.required) continue;
      const v = fieldValues[f.id];
      if (v === undefined || v === null) {
        return JSON.stringify({
          action: "apply_form",
          profile,
          ok: false,
          error: "field_required",
          message: `required field missing: ${f.id}`,
          targetId,
          snapshotId: currentSnap,
        });
      }
      if (f.kind !== "checkbox" && String(v).trim() === "") {
        return JSON.stringify({
          action: "apply_form",
          profile,
          ok: false,
          error: "field_required",
          message: `required field missing: ${f.id}`,
          targetId,
          snapshotId: currentSnap,
        });
      }
    }

    const filled: string[] = [];
    for (const f of fields) {
      const v = fieldValues[f.id];
      if (v === undefined || v === null) continue;
      const selector = f.ref.startsWith("[data-eh-ref=")
        ? f.ref
        : `[data-eh-ref="${f.ref}"]`;
      const loc = page.locator(selector);
      if ((await loc.count()) < 1) {
        return JSON.stringify({
          action: "apply_form",
          profile,
          ok: false,
          error: "stale_ref",
          message: `ref not found: ${f.ref}`,
          targetId,
          snapshotId: currentSnap,
          filled,
        });
      }
      const el = loc.nth(0);
      if (f.kind === "checkbox") {
        const want = v === true || v === "true" || v === "1";
        let checked = false;
        try {
          checked = await el.evaluate((node) => {
            const input = node as HTMLInputElement;
            if (typeof input.checked === "boolean") return input.checked;
            return input.getAttribute?.("aria-checked") === "true";
          });
        } catch {
          checked = false;
        }
        if (checked !== want) {
          await el.click({ timeout: 10_000 });
        }
      } else if (f.kind === "select") {
        await el.selectOption(String(v));
      } else if (f.kind === "file") {
        const relPaths = parseBrowserFormFilePaths(v);
        if (relPaths.length === 0) continue;
        if (relPaths.length > BROWSER_FORM_FILE_MAX_COUNT) {
          return JSON.stringify({
            action: "apply_form",
            profile,
            ok: false,
            error: "file_too_many",
            message: `at most ${BROWSER_FORM_FILE_MAX_COUNT} files per field`,
            targetId,
            snapshotId: currentSnap,
            filled,
            fieldId: f.id,
          });
        }
        if (!f.multiple && relPaths.length > 1) {
          return JSON.stringify({
            action: "apply_form",
            profile,
            ok: false,
            error: "file_multiple",
            message: "field does not allow multiple files",
            targetId,
            snapshotId: currentSnap,
            filled,
            fieldId: f.id,
          });
        }
        const absolutes: string[] = [];
        for (const rel of relPaths) {
          const fileResult = await this.resolveFormFileAbsolute(
            accountId,
            rel,
            f.accept ? { accept: f.accept } : undefined,
          );
          if (!fileResult.ok) {
            return JSON.stringify({
              action: "apply_form",
              profile,
              ok: false,
              error: fileResult.error,
              message: fileResult.message,
              targetId,
              snapshotId: currentSnap,
              filled,
              fieldId: f.id,
            });
          }
          absolutes.push(fileResult.absolute);
        }
        if (typeof el.setInputFiles !== "function") {
          return JSON.stringify({
            action: "apply_form",
            profile,
            ok: false,
            error: "file_unsupported",
            message: "page driver does not support setInputFiles",
            targetId,
            snapshotId: currentSnap,
            filled,
            fieldId: f.id,
          });
        }
        await el.setInputFiles(
          absolutes.length === 1 ? absolutes[0]! : absolutes,
          { timeout: 10_000 },
        );
      } else {
        await el.fill(String(v), { timeout: 10_000 });
      }
      filled.push(f.id);
    }

    const submitRef =
      typeof args.submitRef === "string" && args.submitRef.trim()
        ? args.submitRef.trim()
        : "";
    let submitted = false;
    if (submitRef) {
      const sel = submitRef.startsWith("[data-eh-ref=")
        ? submitRef
        : `[data-eh-ref="${submitRef}"]`;
      const loc = page.locator(sel);
      if ((await loc.count()) >= 1) {
        await loc.nth(0).click({ timeout: 10_000 });
        submitted = true;
      }
    }

    this.clearTabSnapshot(session, targetId);

    const verifyMode = parseVerifyMode(args.verify, origin);
    let verify: Record<string, unknown> | undefined;
    if (verifyMode === "text") {
      let text = await page.innerText("body").catch(() => "");
      text = (text || "").trim();
      const truncated = text.length > BROWSER_CONTROL_VERIFY_TEXT_CHARS;
      if (truncated) text = text.slice(0, BROWSER_CONTROL_VERIFY_TEXT_CHARS);
      verify = { mode: "text", url: page.url(), text, truncated };
    } else if (verifyMode === "screenshot") {
      const shot = await this.writeScreenshot(page, accountId, false);
      verify = {
        mode: "screenshot",
        url: page.url(),
        path: shot.path,
        bytes: shot.bytes,
      };
    }

    return JSON.stringify({
      action: "apply_form",
      profile,
      ok: true,
      targetId,
      snapshotId: currentSnap,
      snapshotConsumed: true,
      filledCount: filled.length,
      // Never echo secret values — ids only.
      filledIds: filled,
      submitted,
      url: page.url(),
      ...(verify ? { verify } : {}),
    });
  }

  /**
   * §9.5g.3 / V-OUT-25…26 — jail-resolve a sandbox-relative path for setInputFiles.
   * Never accepts host absolute paths on the wire.
   * Enforces ext allow-list, inferred MIME, optional HTML `accept`, size, and magic.
   */
  private async resolveFormFileAbsolute(
    accountId: string,
    relRaw: string,
    opts?: { accept?: string; mimeType?: string },
  ): Promise<
    | { ok: true; absolute: string; basename: string }
    | { ok: false; error: string; message: string }
  > {
    const rel = String(relRaw ?? "")
      .replace(/\\/g, "/")
      .replace(/^\.\/+/, "")
      .trim();
    if (!rel) {
      return {
        ok: false,
        error: "file_path",
        message: "file field requires a sandbox-relative path",
      };
    }
    if (
      rel.startsWith("/") ||
      /^[a-zA-Z]:/.test(rel) ||
      rel.includes("\0") ||
      rel.includes("://")
    ) {
      return {
        ok: false,
        error: "file_path",
        message: "host absolute / URL paths refused — use uploads/… jail path",
      };
    }
    const base = basename(rel);
    if (!base || base === "." || base === ".." || !isAllowedBrowserFormFileExt(base)) {
      return {
        ok: false,
        error: "file_mime",
        message: `disallowed file type for form upload: ${base || "(empty)"}`,
      };
    }
    const mime =
      (opts?.mimeType && String(opts.mimeType).trim()) ||
      mimeFromBrowserFormFileName(base) ||
      undefined;
    if (!isAllowedBrowserFormFileMime(mime)) {
      return {
        ok: false,
        error: "file_mime",
        message: `disallowed MIME for form upload: ${base}`,
      };
    }
    if (!matchesBrowserFormFileAccept(base, opts?.accept, mime)) {
      return {
        ok: false,
        error: "file_accept",
        message: `file does not match field accept (${opts?.accept ?? ""}): ${base}`,
      };
    }
    let absolute: string;
    try {
      const shareOrWs =
        rel === "share" ||
        rel.startsWith("share/") ||
        rel === "workspace" ||
        rel.startsWith("workspace/");
      if (shareOrWs) {
        const mounts = this.workspaceMountsFor
          ? await this.workspaceMountsFor(accountId)
          : [];
        const primary = mounts[0] as
          | { id: string; hostPath: string; mode: WorkspaceMode }
          | undefined;
        absolute = resolveSandboxPath({
          accountFilesRoot: this.paths.accountFiles(accountId),
          shareRoot: this.paths.shareDir,
          path: rel,
          write: false,
          workspaceMounts: mounts,
          workspaceRoot: primary?.hostPath ?? null,
          workspaceMode: primary?.mode ?? null,
        }).absolute;
      } else {
        absolute = safeJoin(this.paths.accountFiles(accountId), rel);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: "file_path",
        message: `path jail refused: ${msg}`,
      };
    }
    const st = await stat(absolute).catch(() => null);
    if (!st || !st.isFile()) {
      return {
        ok: false,
        error: "file_missing",
        message: `file not found under jail: ${base}`,
      };
    }
    if (st.size <= 0) {
      return {
        ok: false,
        error: "file_empty",
        message: `empty file refused: ${base}`,
      };
    }
    if (st.size > CHAT_MEDIA_MAX_BYTES) {
      return {
        ok: false,
        error: "file_too_large",
        message: `file exceeds ${CHAT_MEDIA_MAX_BYTES} bytes: ${base}`,
      };
    }
    // V-OUT-26 — magic-byte refuse for PE/ELF/Mach-O even if renamed .pdf.
    try {
      const fh = await open(absolute, "r");
      try {
        const buf = Buffer.alloc(16);
        const { bytesRead } = await fh.read(buf, 0, 16, 0);
        if (isDeniedBrowserFormFileMagic(buf.subarray(0, bytesRead))) {
          return {
            ok: false,
            error: "file_mime",
            message: `executable / binary magic refused: ${base}`,
          };
        }
      } finally {
        await fh.close();
      }
    } catch {
      return {
        ok: false,
        error: "file_missing",
        message: `file not readable under jail: ${base}`,
      };
    }
    return { ok: true, absolute, basename: base };
  }

  private async writeScreenshot(
    page: PageLike,
    accountId: string,
    fullPage: boolean,
  ): Promise<{ path: string; bytes: number }> {
    const outDir = join(this.paths.accountFiles(accountId), "output", "browser");
    await mkdir(outDir, { recursive: true });
    const fileName = `shot-${Date.now()}.png`;
    const abs = join(outDir, fileName);
    await page.screenshot({ path: abs, fullPage, type: "png" });
    const st = await stat(abs).catch(() => null);
    if (st && st.size > BROWSER_CONTROL_SCREENSHOT_MAX_BYTES) {
      await unlink(abs).catch(() => undefined);
      throw Object.assign(
        new Error(
          `envoyhome.bad_params: screenshot exceeds ${BROWSER_CONTROL_SCREENSHOT_MAX_BYTES} bytes`,
        ),
        { code: "bad_params" },
      );
    }
    return { path: `output/browser/${fileName}`, bytes: st?.size ?? 0 };
  }

  private async runWait(
    page: PageLike,
    session: BrowserSession,
    args: Record<string, unknown>,
    profile: BrowserProfile,
    targetId: string,
  ): Promise<string> {
    const until = String(args.until ?? "load");
    const rawMs =
      typeof args.ms === "number"
        ? args.ms
        : typeof args.ms === "string"
          ? Number(args.ms)
          : NaN;
    if (Number.isFinite(rawMs) && rawMs > BROWSER_CONTROL_WAIT_MS_CAP) {
      throw Object.assign(
        new Error(
          `envoyhome.bad_params: wait ms exceeds ${BROWSER_CONTROL_WAIT_MS_CAP}`,
        ),
        { code: "bad_params" },
      );
    }
    const ms = Number.isFinite(rawMs) && rawMs > 0
      ? Math.min(BROWSER_CONTROL_WAIT_MS_CAP, Math.floor(rawMs))
      : until === "timeout"
        ? 1_000
        : BROWSER_CONTROL_WAIT_MS_CAP;
    const t0 = Date.now();
    let lastErr: string | undefined;
    for (let attempt = 1; attempt <= BROWSER_CONTROL_WAIT_RETRIES; attempt++) {
      try {
        if (until === "timeout") {
          if (typeof page.waitForTimeout === "function") {
            await page.waitForTimeout(ms);
          } else {
            await new Promise((r) => setTimeout(r, ms));
          }
        } else if (until === "selector") {
          const selector = String(args.selector ?? "").trim();
          if (!selector) {
            throw Object.assign(
              new Error("envoyhome.bad_params: wait until=selector requires selector"),
              { code: "bad_params" },
            );
          }
          if (typeof page.waitForSelector === "function") {
            await page.waitForSelector(selector, { timeout: ms });
          } else {
            // Mock / minimal page: poll locator.
            const deadline = Date.now() + ms;
            for (;;) {
              if ((await page.locator(selector).count()) > 0) break;
              if (Date.now() >= deadline) throw new Error("wait_timeout");
              await new Promise((r) => setTimeout(r, 50));
            }
          }
        } else if (until === "networkidle" || until === "load" || until === "domcontentloaded") {
          const state = until === "networkidle" ? "networkidle" : until === "load" ? "load" : "domcontentloaded";
          if (typeof page.waitForLoadState === "function") {
            await page.waitForLoadState(state, { timeout: ms });
          } else if (typeof page.waitForTimeout === "function") {
            await page.waitForTimeout(Math.min(ms, 100));
          }
        } else {
          throw Object.assign(
            new Error(`envoyhome.bad_params: unknown wait until: ${until}`),
            { code: "bad_params" },
          );
        }
        return JSON.stringify({
          action: "wait",
          profile,
          ok: true,
          until,
          waitedMs: Date.now() - t0,
          targetId,
          url: page.url(),
          snapshotId: session.snapshotByTab.get(targetId) ?? null,
        });
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        if (err && typeof err === "object" && (err as { code?: string }).code === "bad_params") {
          throw err;
        }
        if (attempt >= BROWSER_CONTROL_WAIT_RETRIES) break;
      }
    }
    return JSON.stringify({
      action: "wait",
      profile,
      ok: false,
      until,
      waitedMs: Date.now() - t0,
      targetId,
      error: "wait_failed",
      message: lastErr ?? "wait failed",
    });
  }

  private async runPress(
    page: PageLike,
    _session: BrowserSession,
    args: Record<string, unknown>,
    profile: BrowserProfile,
    targetId: string,
  ): Promise<string> {
    const keyRaw = String(args.key ?? args.text ?? "").trim();
    const key = keyRaw === " " ? "Space" : keyRaw;
    if (!key || !PRESS_KEYS.has(key)) {
      throw Object.assign(
        new Error(
          `envoyhome.bad_params: press key must be one of ${[...PRESS_KEYS].join("|")}`,
        ),
        { code: "bad_params" },
      );
    }
    if (!page.keyboard?.press) {
      throw Object.assign(
        new Error("envoyhome.tool_unavailable: page keyboard not available"),
        { code: "tool_unavailable" },
      );
    }
    await page.keyboard.press(key === "Space" ? " " : key);
    // Press can submit forms / change focus — require a fresh snapshot before next act.
    this.clearTabSnapshot(_session, targetId);
    return JSON.stringify({
      action: "press",
      profile,
      ok: true,
      key,
      targetId,
      url: page.url(),
      snapshotConsumed: true,
    });
  }

  private async runAct(
    page: PageLike,
    session: BrowserSession,
    args: Record<string, unknown>,
    profile: BrowserProfile,
    origin: "attended" | "unattended",
    accountId: string,
    targetId: string,
  ): Promise<string> {
    const currentSnap = session.snapshotByTab.get(targetId);
    const givenSnap = typeof args.snapshotId === "string" ? args.snapshotId.trim() : "";
    if (!givenSnap || !currentSnap || givenSnap !== currentSnap) {
      return JSON.stringify({
        action: "act",
        profile,
        error: "stale_snapshot",
        message: "snapshotId missing or stale — take a new snapshot",
        targetId,
        expectedSnapshotId: currentSnap ?? null,
        gotSnapshotId: givenSnap || null,
      });
    }

    const beforeUrl = page.url();
    const title = await page.title().catch(() => "");
    const textSample = await page.innerText("body").catch(() => "");
    const stampedEls = session.elementsByTab.get(targetId) ?? [];
    const blocked = detectBrowserBlocked({
      url: beforeUrl,
      title,
      textSample: textSample.slice(0, 2_000),
      mode: "act",
    });
    if (blocked) {
      return JSON.stringify({
        action: "act",
        profile,
        ok: false,
        targetId,
        snapshotId: currentSnap,
        blocked: blocked.blocked,
        message: blocked.message,
        url: beforeUrl,
      });
    }

    const kind = String(args.kind ?? "click");
    const ref = String(args.ref ?? args.selector ?? "").trim();
    if (!ref) {
      throw Object.assign(new Error("envoyhome.bad_params: act requires ref"), {
        code: "bad_params",
      });
    }
    // §9.5i / V-OUT-21 — refuse mutating acts on payment field refs even when page chrome is quiet.
    const targetMeta = stampedEls.find((e) => String(e.ref ?? "") === ref);
    if (
      targetMeta &&
      isPaymentFieldElement(targetMeta) &&
      (kind === "type" || kind === "click" || kind === "select" || kind === "drag")
    ) {
      return JSON.stringify({
        action: "act",
        profile,
        ok: false,
        kind,
        ref,
        targetId,
        snapshotId: currentSnap,
        blocked: "payment",
        message:
          "Payment / card field refused — use propose_handoff (https Open); Home will not fill card data.",
        url: beforeUrl,
      });
    }
    const selector = ref.startsWith("[data-eh-ref=") ? ref : `[data-eh-ref="${ref}"]`;
    const loc = page.locator(selector);
    const count = await loc.count();
    if (count < 1) {
      return JSON.stringify({
        action: "act",
        profile,
        error: "stale_ref",
        message: "ref not found — take a new snapshot",
        targetId,
        snapshotId: currentSnap,
      });
    }
    const el = loc.nth(0);
    if (kind === "click") {
      await el.click({ timeout: 10_000 });
    } else if (kind === "type") {
      await el.fill(String(args.text ?? ""), { timeout: 10_000 });
    } else if (kind === "select") {
      await el.selectOption(String(args.value ?? args.text ?? ""));
    } else if (kind === "drag") {
      const toRef = String(args.toRef ?? "").trim();
      if (!toRef) {
        throw Object.assign(new Error("envoyhome.bad_params: drag requires toRef"), {
          code: "bad_params",
        });
      }
      const toSel = toRef.startsWith("[data-eh-ref=") ? toRef : `[data-eh-ref="${toRef}"]`;
      const toLoc = page.locator(toSel);
      if ((await toLoc.count()) < 1) {
        return JSON.stringify({
          action: "act",
          profile,
          error: "stale_ref",
          kind: "drag",
          snapshotId: currentSnap,
        });
      }
      await el.dragTo(toLoc.nth(0) as unknown as { click(): Promise<void> });
    } else {
      throw Object.assign(new Error(`envoyhome.bad_params: unknown act kind: ${kind}`), {
        code: "bad_params",
      });
    }

    const verifyMode = parseVerifyMode(args.verify, origin);
    let verify: Record<string, unknown> | undefined;
    if (verifyMode === "text") {
      let text = await page.innerText("body").catch(() => "");
      text = (text || "").trim();
      const truncated = text.length > BROWSER_CONTROL_VERIFY_TEXT_CHARS;
      if (truncated) text = text.slice(0, BROWSER_CONTROL_VERIFY_TEXT_CHARS);
      verify = {
        mode: "text",
        url: page.url(),
        text,
        truncated,
      };
    } else if (verifyMode === "screenshot") {
      const shot = await this.writeScreenshot(page, accountId, false);
      verify = {
        mode: "screenshot",
        url: page.url(),
        path: shot.path,
        bytes: shot.bytes,
      };
    }

    // Consume snapshot after a mutating act — force a fresh snapshot before next act.
    this.clearTabSnapshot(session, targetId);

    return JSON.stringify({
      action: "act",
      profile,
      kind,
      ref,
      ok: true,
      targetId,
      snapshotId: currentSnap,
      snapshotConsumed: true,
      beforeUrl,
      url: page.url(),
      ...(verify ? { verify } : { verify: { mode: "none" } }),
    });
  }

  private requireFocusedPage(
    session: BrowserSession,
    targetIdRaw: unknown,
  ): PageLike {
    const targetId =
      typeof targetIdRaw === "string" && targetIdRaw.trim()
        ? targetIdRaw.trim()
        : session.focusedId;
    if (!targetId || !session.tabs.has(targetId)) {
      throw Object.assign(
        new Error("envoyhome.bad_params: no focused tab — open or navigate first"),
        { code: "bad_params" },
      );
    }
    session.focusedId = targetId;
    return session.tabs.get(targetId)!;
  }

  private async buildSnapshot(
    page: PageLike,
    maxChars: number,
    includeHidden: boolean,
  ): Promise<{ elements: Array<Record<string, unknown>>; truncated: boolean }> {
    const cap = BROWSER_CONTROL_SNAPSHOT_ELEMENT_CAP;
    const elements = await page.evaluate(
      ((opts: { cap: number; includeHidden: boolean }) => {
        const roleSel =
          '[role="link"],[role="button"],[role="textbox"],[role="checkbox"],[role="combobox"],[role="tab"],[role="menuitem"]';
        const nodes = document.querySelectorAll(
          `a[href], button, input, textarea, select, [role="button"], [onclick], ${roleSel}`,
        );
        const isVisible = (el: Element) => {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const r = (el as HTMLElement).getBoundingClientRect?.();
          if (r && (r.width === 0 || r.height === 0)) return false;
          return true;
        };
        const out: Array<Record<string, unknown>> = [];
        let i = 0;
        for (const el of Array.from(nodes)) {
          if (out.length >= opts.cap) break;
          const input = el as HTMLInputElement;
          const inputType =
            el.tagName === "INPUT" ? String(input.type || "text").toLowerCase() : "";
          const isFileInput = el.tagName === "INPUT" && inputType === "file";
          const visible = isVisible(el);
          // File inputs are often visually hidden — still stamp them (P2-J).
          if (!opts.includeHidden && !visible && !isFileInput) continue;
          const ref = String(i++);
          el.setAttribute("data-eh-ref", ref);
          const role =
            el.getAttribute("role") ||
            (el.tagName === "A"
              ? "link"
              : el.tagName === "BUTTON"
                ? "button"
                : el.tagName === "INPUT"
                  ? inputType === "checkbox"
                    ? "checkbox"
                    : "textbox"
                  : el.tagName === "TEXTAREA"
                    ? "textbox"
                    : el.tagName === "SELECT"
                      ? "combobox"
                      : el.tagName.toLowerCase());
          const name = (
            el.getAttribute("aria-label") ||
            (el as HTMLElement).innerText ||
            input.placeholder ||
            el.getAttribute("name") ||
            ""
          )
            .trim()
            .slice(0, 80);
          const row: Record<string, unknown> = {
            ref,
            selector: `[data-eh-ref="${ref}"]`,
            tag: el.tagName.toLowerCase(),
            role,
            name: name || "(no name)",
            visible,
            text: name || "(no text)",
          };
          if (inputType) row.inputType = inputType;
          const nameAttr = el.getAttribute("name");
          if (nameAttr) row.nameAttr = nameAttr.slice(0, 80);
          const placeholder = input.placeholder;
          if (placeholder) row.placeholder = String(placeholder).slice(0, 80);
          const autocomplete = el.getAttribute("autocomplete");
          if (autocomplete) row.autocomplete = autocomplete.slice(0, 80);
          if (isFileInput) {
            const accept = el.getAttribute("accept");
            if (accept) row.accept = accept.slice(0, 200);
            if ((el as HTMLInputElement).multiple === true) row.multiple = true;
          }
          const hasRequired =
            (typeof (el as HTMLElement).hasAttribute === "function" &&
              (el as HTMLElement).hasAttribute("required")) ||
            el.getAttribute("aria-required") === "true";
          if (hasRequired) row.required = true;
          if (el.tagName === "SELECT") {
            const selectEl = el as HTMLSelectElement;
            const opts = Array.from(selectEl.options || []).map((o) => ({
              value: String(o.value ?? "").slice(0, 200),
              label: String(o.label || o.text || o.value || "").slice(0, 200),
            }));
            if (opts.length) row.selectOptions = opts.slice(0, 48);
          }
          out.push(row);
        }
        return out;
      }) as (arg: unknown) => Array<Record<string, unknown>>,
      { cap, includeHidden },
    );
    let truncated = false;
    let list = elements;
    const packed = JSON.stringify(list);
    if (packed.length > maxChars) {
      truncated = true;
      list = [];
      for (const el of elements) {
        const next = [...list, el];
        if (JSON.stringify(next).length > maxChars) break;
        list = next;
      }
    }
    return { elements: list, truncated };
  }

  private async stopAllManagedSessions(): Promise<void> {
    const keys = [...this.sessions.keys()].filter((k) => k.endsWith(":managed"));
    for (const key of keys) {
      const accountId = key.slice(0, -":managed".length);
      await this.stopSession(accountId, "managed");
    }
  }

  private async ensureSession(
    accountId: string,
    profile: BrowserProfile,
  ): Promise<BrowserSession> {
    this.gcIdle();
    const key = this.sessionKey(accountId, profile);
    const existing = this.sessions.get(key);
    const readiness =
      profile === "managed" ? await probeEngineReadiness() : null;
    const effectiveManaged =
      profile === "managed" && readiness
        ? resolveManagedEngine(this.cfg.managedEngine, readiness)
        : null;
    const managedRunnable =
      profile === "managed" && readiness
        ? isHeadlessEngineReady(effectiveManaged, readiness)
        : false;

    if (existing && existing.profile === profile) {
      // V-OUT-32 / V-OUT-34: switching effective managed engine must recreate session.
      // Untagged sessions (pre-field) are treated as chromium.
      if (profile === "managed") {
        const sessionEngine = existing.managedEngine ?? "chromium";
        const want = effectiveManaged ?? "chromium";
        if (sessionEngine !== want || !managedRunnable) {
          await this.stopSession(accountId, profile);
        } else {
          existing.lastUsedAt = Date.now();
          return existing;
        }
      } else {
        existing.lastUsedAt = Date.now();
        return existing;
      }
    } else if (existing) {
      await this.stopSession(accountId, existing.profile);
    }

    if (this.pageFactory && profile === "managed") {
      const session: BrowserSession = {
        profile,
        attachOnly: false,
        browser: { close: async () => undefined },
        context: {
          newPage: () => this.pageFactory!(),
          close: async () => undefined,
        },
        tabs: new Map(),
        snapshotByTab: new Map(),
        elementsByTab: new Map(),
        snapshotSeq: 0,
        focusedId: null,
        lastUsedAt: Date.now(),
        managedEngine: effectiveManaged ?? "chromium",
      };
      this.sessions.set(key, session);
      return session;
    }

    if (profile === "personal" || profile === "remote") {
      return this.connectCdpSession(accountId, profile);
    }

    // Stage C/E — managed Obscura when effective (personal/remote never use this path).
    if (!managedRunnable || !effectiveManaged) {
      const { obscuraInstallHint } = await import("./web-extract-obscura.js");
      throw Object.assign(
        new Error(
          `envoyhome.tool_unavailable: ${this.managedUnavailableReason(
            this.cfg.managedEngine,
            obscuraInstallHint(),
            browserInstallHint(),
          )}`,
        ),
        { code: "tool_unavailable" },
      );
    }
    if (effectiveManaged === "obscura") {
      return this.startManagedObscuraSession(accountId, key);
    }

    const pw = await import("playwright");
    const profileDir = join(this.paths.stateDir, "browser-profiles", accountId, "managed");
    await mkdir(profileDir, { recursive: true });
    // Persistent context under stateDir — isolated from Owner daily Chrome (§9.5g).
    const context = await pw.chromium.launchPersistentContext(profileDir, {
      headless: true,
      args: ["--disable-dev-shm-usage"],
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    const session: BrowserSession = {
      profile: "managed",
      attachOnly: false,
      browser: {
        close: async () => {
          await context.close().catch(() => undefined);
        },
      },
      context: context as unknown as BrowserSession["context"],
      tabs: new Map(),
      snapshotByTab: new Map(),
      elementsByTab: new Map(),
      snapshotSeq: 0,
      focusedId: null,
      lastUsedAt: Date.now(),
      managedEngine: "chromium",
    };
    this.sessions.set(key, session);
    return session;
  }

  private async startManagedObscuraSession(
    accountId: string,
    key: string,
  ): Promise<BrowserSession> {
    const { startObscuraServe } = await import("./web-extract-obscura.js");
    const storageDir = join(
      this.paths.stateDir,
      "browser-profiles",
      accountId,
      "managed-obscura",
    );
    await mkdir(storageDir, { recursive: true });
    const handle = await startObscuraServe({ storageDir });
    try {
      const pw = await import("playwright");
      const cdpBrowser = await pw.chromium.connectOverCDP(handle.endpoint);
      const ctxs = cdpBrowser.contexts();
      const defaultCtx = ctxs[0] ?? (await cdpBrowser.newContext());
      const session: BrowserSession = {
        profile: "managed",
        attachOnly: false,
        browser: {
          close: async () => {
            await cdpBrowser.close().catch(() => undefined);
          },
        },
        context: defaultCtx as unknown as BrowserSession["context"],
        tabs: new Map(),
        snapshotByTab: new Map(),
        elementsByTab: new Map(),
        snapshotSeq: 0,
        focusedId: null,
        lastUsedAt: Date.now(),
        managedEngine: "obscura",
        stopObscura: () => handle.stop(),
      };
      this.sessions.set(key, session);
      return session;
    } catch (err) {
      // Don't leave a dangling obscura serve if CDP connect fails.
      await handle.stop().catch(() => undefined);
      throw err;
    }
  }

  private async connectCdpSession(
    accountId: string,
    profile: "personal" | "remote",
  ): Promise<BrowserSession> {
    const endpoint =
      profile === "personal"
        ? assertPersonalCdpEndpoint(this.cfg.personal.cdpEndpoint || DEFAULT_PERSONAL_CDP).href
        : this.buildRemoteEndpoint();
    if (profile === "remote" && !endpoint) {
      throw Object.assign(new Error("envoyhome.tool_unavailable: remote CDP URL not set"), {
        code: "tool_unavailable",
      });
    }

    let browser: { close(): Promise<void> };
    let context: BrowserSession["context"];

    if (this.cdpConnect) {
      const connected = await this.cdpConnect(endpoint);
      browser = connected.browser;
      const ctxs = connected.browser.contexts();
      const first = ctxs[0];
      context = {
        newPage: () => (first ? first.newPage() : this.pageFactory!()),
        close: async () => undefined,
      };
      if (first) {
        for (const p of first.pages()) {
          // leave existing pages; map on demand
          void p;
        }
      }
    } else if (this.pageFactory) {
      browser = { close: async () => undefined };
      context = {
        newPage: () => this.pageFactory!(),
        close: async () => undefined,
      };
    } else {
      const pw = await import("playwright");
      const cdpBrowser = await pw.chromium.connectOverCDP(endpoint);
      browser = cdpBrowser;
      const ctxs = cdpBrowser.contexts();
      const defaultCtx = ctxs[0] ?? (await cdpBrowser.newContext());
      context = defaultCtx as unknown as BrowserSession["context"];
    }

    const session: BrowserSession = {
      profile,
      attachOnly: true,
      browser,
      context,
      tabs: new Map(),
      snapshotByTab: new Map(),
      elementsByTab: new Map(),
      snapshotSeq: 0,
      focusedId: null,
      lastUsedAt: Date.now(),
    };
    this.sessions.set(this.sessionKey(accountId, profile), session);
    return session;
  }

  private async newPage(session: BrowserSession): Promise<PageLike> {
    return session.context.newPage();
  }

  private async stopSession(accountId: string, profile: BrowserProfile): Promise<void> {
    const key = this.sessionKey(accountId, profile);
    const session = this.sessions.get(key);
    if (!session) return;
    this.sessions.delete(key);
    for (const page of session.tabs.values()) {
      // Don't close attached personal/remote tabs the user may still need —
      // only disconnect. Managed tabs we opened can close.
      if (!session.attachOnly) {
        await page.close().catch(() => undefined);
      }
    }
    if (!session.attachOnly) {
      await session.context.close().catch(() => undefined);
    }
    // connectOverCDP browser.close() disconnects; for attachOnly that is OK.
    await session.browser.close().catch(() => undefined);
    if (session.stopObscura) {
      await session.stopObscura().catch(() => undefined);
    }
  }

  private gcIdle(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (now - session.lastUsedAt > BROWSER_CONTROL_IDLE_MS) {
        const [accountId, profile] = key.split(":") as [string, BrowserProfile];
        void this.stopSession(accountId, profile);
      }
    }
  }

  async shutdown(): Promise<void> {
    const keys = [...this.sessions.keys()];
    for (const key of keys) {
      const [accountId, profile] = key.split(":") as [string, BrowserProfile];
      await this.stopSession(accountId, profile);
    }
  }
}
