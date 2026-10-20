// Built-in browser control — Design §9.5g / V-OUT-8 + §9.5g.1 / V-OUT-9/10.

import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { HomePaths } from "./home-paths.js";
import {
  probeBrowserRuntime,
  type BrowserRuntimeStatus,
  tryAcquireBrowserGate,
  releaseBrowserGate,
} from "./web-search-browser.js";
import { isBlockedHostname } from "./skill-remote.js";

export const BROWSER_CONTROL_ACTION_TIMEOUT_MS = 30_000;
export const BROWSER_CONTROL_MAX_CHARS = 40_000;
export const BROWSER_CONTROL_IDLE_MS = 5 * 60_000;
/** Max screenshot file size written under output/browser/ (Design §9.5g). */
export const BROWSER_CONTROL_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
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
  | "text";

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
]);

const PROFILES = new Set<BrowserProfile>(["managed", "personal", "remote"]);

export type BrowserControlConfigFile = {
  enabled: boolean;
  unattendedEnabled: boolean;
  defaultProfile: BrowserProfile;
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
      dragTo(target: { click(): Promise<void> }): Promise<void>;
      evaluate<T>(fn: (el: Element) => T): Promise<T>;
      screenshot(opts: { path: string; type?: string }): Promise<Buffer>;
    };
  };
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
  screenshot(opts: { path: string; fullPage?: boolean; type?: string }): Promise<Buffer>;
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
  focusedId: string | null;
  lastUsedAt: number;
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

/** Install Playwright route that aborts SSRF-unsafe requests (incl. redirects). */
export async function installBrowserSsrfGuard(page: PageLike): Promise<void> {
  if (typeof page.route !== "function") return;
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
    let ready = false;
    if (readyInfo.ok) {
      if (defaultProfile === "managed") ready = runtime.status === "ready";
      else if (defaultProfile === "personal") ready = personalReady;
      else ready = remoteReady;
    }
    const out: BrowserControlPublicConfig = {
      enabled: this.cfg.enabled,
      unattendedEnabled: this.cfg.unattendedEnabled,
      ready,
      browserRuntime: runtime.status,
      browserInstallHint: runtime.installHint,
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
      } else if (defaultProfile === "managed" && runtime.status === "missing") {
        out.unavailableReason = `Chromium not installed — ${runtime.installHint}`;
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
    },
  ): Promise<string> {
    const ready = this.readyInfo();
    if (!ready.ok) {
      throw Object.assign(
        new Error(`envoyhome.tool_unavailable: ${ready.reason ?? "browser unavailable"}`),
        { code: "tool_unavailable" },
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
        browserRuntime: pub.browserRuntime,
        browserInstallHint: pub.browserInstallHint,
        ready: pub.ready,
        personalReady: pub.personalReady,
        remoteReady: pub.remoteReady,
        session: session
          ? { tabs: session.tabs.size, focusedId: session.focusedId, profile: session.profile }
          : null,
      });
    }

    if (profile === "managed") {
      const probe = await probeBrowserRuntime();
      if (probe.status !== "ready" && !this.pageFactory) {
        return JSON.stringify({
          action,
          profile,
          error: "runtime_missing",
          browserInstallHint: probe.installHint,
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
      return await this.dispatchAction(action, args, opts.accountId, profile);
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
      const snap = await this.buildSnapshot(page, clampMaxChars(args.maxChars));
      return JSON.stringify({
        action,
        profile,
        targetId,
        url: page.url(),
        title: await page.title().catch(() => ""),
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
      if (session.focusedId === targetId) {
        session.focusedId = session.tabs.keys().next().value ?? null;
      }
      await page.close().catch(() => undefined);
      return JSON.stringify({ action: "close", profile, targetId, ok: true });
    }

    const page = this.requireFocusedPage(session, args.targetId);

    if (action === "snapshot") {
      const snap = await this.buildSnapshot(page, clampMaxChars(args.maxChars));
      return JSON.stringify({
        action: "snapshot",
        profile,
        targetId: session.focusedId,
        url: page.url(),
        snapshot: snap,
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
        targetId: session.focusedId,
        text,
        truncated,
      });
    }

    if (action === "screenshot") {
      const outDir = join(this.paths.accountFiles(accountId), "output", "browser");
      await mkdir(outDir, { recursive: true });
      const fileName = `shot-${Date.now()}.png`;
      const abs = join(outDir, fileName);
      await page.screenshot({ path: abs, fullPage: args.fullPage === true, type: "png" });
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
      return JSON.stringify({
        action: "screenshot",
        profile,
        targetId: session.focusedId,
        path: `output/browser/${fileName}`,
        bytes: st?.size ?? 0,
      });
    }

    if (action === "act") {
      return this.runAct(page, session, args, profile);
    }

    throw Object.assign(new Error(`envoyhome.bad_params: unhandled action ${action}`), {
      code: "bad_params",
    });
  }

  private async runAct(
    page: PageLike,
    session: BrowserSession,
    args: Record<string, unknown>,
    profile: BrowserProfile,
  ): Promise<string> {
    const kind = String(args.kind ?? "click");
    const ref = String(args.ref ?? args.selector ?? "").trim();
    if (!ref) {
      throw Object.assign(new Error("envoyhome.bad_params: act requires ref"), {
        code: "bad_params",
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
        targetId: session.focusedId,
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
        return JSON.stringify({ action: "act", profile, error: "stale_ref", kind: "drag" });
      }
      await el.dragTo(toLoc.nth(0) as unknown as { click(): Promise<void> });
    } else {
      throw Object.assign(new Error(`envoyhome.bad_params: unknown act kind: ${kind}`), {
        code: "bad_params",
      });
    }
    return JSON.stringify({
      action: "act",
      profile,
      kind,
      ref,
      ok: true,
      targetId: session.focusedId,
      url: page.url(),
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
  ): Promise<{ elements: Array<Record<string, unknown>>; truncated: boolean }> {
    const elements = await page.evaluate(() => {
      const nodes = document.querySelectorAll(
        'a[href], button, input, textarea, select, [role="button"], [onclick]',
      );
      return Array.from(nodes)
        .slice(0, 100)
        .map((el, i) => {
          el.setAttribute("data-eh-ref", String(i));
          const text = (
            (el as HTMLElement).innerText ||
            (el as HTMLInputElement).value ||
            (el as HTMLInputElement).placeholder ||
            el.getAttribute("aria-label") ||
            ""
          )
            .trim()
            .slice(0, 80);
          return {
            ref: String(i),
            selector: `[data-eh-ref="${i}"]`,
            tag: el.tagName.toLowerCase(),
            text: text || "(no text)",
          };
        });
    });
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

  private async ensureSession(
    accountId: string,
    profile: BrowserProfile,
  ): Promise<BrowserSession> {
    this.gcIdle();
    const key = this.sessionKey(accountId, profile);
    const existing = this.sessions.get(key);
    if (existing && existing.profile === profile) {
      existing.lastUsedAt = Date.now();
      return existing;
    }
    if (existing) await this.stopSession(accountId, existing.profile);

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
        focusedId: null,
        lastUsedAt: Date.now(),
      };
      this.sessions.set(key, session);
      return session;
    }

    if (profile === "personal" || profile === "remote") {
      return this.connectCdpSession(accountId, profile);
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
      focusedId: null,
      lastUsedAt: Date.now(),
    };
    this.sessions.set(key, session);
    return session;
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
