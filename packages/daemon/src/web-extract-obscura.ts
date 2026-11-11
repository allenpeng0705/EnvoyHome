// Obscura runtime helpers — Stage A extract / Stage B SERP / Stage C managed serve.
// Never silent-download; never stealth as product default.

import { access, constants } from "node:fs";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { execFile, spawn, type ChildProcess } from "node:child_process";

const accessAsync = promisify(access);
const execFileAsync = promisify(execFile);

/** Local result shape — avoid circular import with web-extract.ts. */
export type ObscuraExtractResult = {
  url: string;
  title?: string;
  markdown: string;
  chars: number;
  truncated?: boolean;
  error?: string;
  backend: "obscura";
};

export type ObscuraRuntimeStatus = "ready" | "missing";

export type ObscuraExecFile = (
  file: string,
  args: string[],
  opts: { timeout: number; maxBuffer: number; encoding: "utf8" },
) => Promise<{ stdout: string; stderr: string }>;

/** Owner-facing one-liner (daemon host — not the phone). */
export function obscuraInstallHint(): string {
  return "Obscura ships in the desktop app or installs automatically on first boot (~70 MB). Override with ENVOYHOME_OBSCURA / ENVOYHOME_OBSCURA_BUNDLE, or set ENVOYHOME_OBSCURA_AUTO=0 to disable auto-install";
}

async function pathExecutable(p: string): Promise<boolean> {
  try {
    // Windows often rejects X_OK for .exe files; F_OK is enough to confirm presence.
    const mode = process.platform === "win32" ? constants.F_OK : constants.X_OK;
    await accessAsync(p, mode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve Obscura binary (Design §9.5f Stage D):
 * ENVOYHOME_OBSCURA → ENVOYHOME_OBSCURA_BUNDLE (installer) → managed stateDir → PATH.
 */
export async function resolveObscuraBinary(
  whichExec: ObscuraExecFile = execFileAsync as ObscuraExecFile,
): Promise<string | null> {
  const envPath = process.env.ENVOYHOME_OBSCURA?.trim();
  if (envPath) {
    return (await pathExecutable(envPath)) ? envPath : null;
  }

  const bundlePath = process.env.ENVOYHOME_OBSCURA_BUNDLE?.trim();
  if (bundlePath && (await pathExecutable(bundlePath))) {
    return bundlePath;
  }

  try {
    const { getObscuraInstallService } = await import("./obscura-install.js");
    const managed = getObscuraInstallService()?.managedBinaryPath() ?? null;
    if (managed && (await pathExecutable(managed))) {
      return managed;
    }
  } catch {
    /* install service not booted yet */
  }

  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await whichExec(cmd, ["obscura"], {
      timeout: 5_000,
      maxBuffer: 64_000,
      encoding: "utf8",
    });
    const first = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!first) return null;
    return (await pathExecutable(first)) ? first : null;
  } catch {
    return null;
  }
}

export async function probeObscuraRuntime(
  whichExec?: ObscuraExecFile,
): Promise<{ status: ObscuraRuntimeStatus; installHint: string; binary: string | null }> {
  const hint = obscuraInstallHint();
  const binary = await resolveObscuraBinary(whichExec);
  return {
    status: binary ? "ready" : "missing",
    installHint: hint,
    binary,
  };
}

function titleFromMarkdown(md: string): string | undefined {
  const m = md.match(/^#\s+(.+)$/m);
  if (m?.[1]) return m[1].trim().slice(0, 300);
  const line = md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("```"));
  return line ? line.replace(/^#+\s*/, "").slice(0, 300) : undefined;
}

function looksBlockedMarkdown(text: string): boolean {
  const h = text.slice(0, 8000).toLowerCase();
  return (
    /recaptcha|hcaptcha|cf-challenge|challenge-platform|g-recaptcha|安全验证|请完成验证|just a moment\.\.\.|cf-browser-verification/i.test(
      h,
    ) ||
    /\bcaptcha\b/i.test(h) ||
    /paywall|subscribe to (continue|read)|sign in to continue reading/i.test(h)
  );
}

/**
 * Run `obscura fetch <url> --dump markdown`.
 * Soft-fails into `{ error }` for page-quality / timeout; caller handles missing binary.
 */
export async function runObscuraExtract(
  url: string,
  opts: {
    maxChars: number;
    timeoutMs: number;
    binary: string;
    execFile?: ObscuraExecFile;
  },
): Promise<ObscuraExtractResult> {
  const exec = opts.execFile ?? (execFileAsync as ObscuraExecFile);
  const timeoutSec = Math.max(5, Math.ceil(opts.timeoutMs / 1000));
  try {
    const { stdout, stderr } = await exec(
      opts.binary,
      [
        "fetch",
        url,
        "--dump",
        "markdown",
        "--timeout",
        String(timeoutSec),
        "--quiet",
      ],
      {
        timeout: opts.timeoutMs + 2_000,
        maxBuffer: Math.max(opts.maxChars * 4, 512_000),
        encoding: "utf8",
      },
    );
    const raw = (stdout || "").trim();
    if (!raw) {
      const errHint = (stderr || "").trim().slice(0, 200);
      return {
        url,
        markdown: "",
        chars: 0,
        error: errHint ? `obscura_empty: ${errHint}` : "empty_content",
        backend: "obscura",
      };
    }
    if (looksBlockedMarkdown(raw)) {
      return {
        url,
        markdown: "",
        chars: 0,
        error: "captcha_or_block",
        backend: "obscura",
      };
    }
    let markdown = raw;
    let truncated = false;
    if (markdown.length > opts.maxChars) {
      markdown = markdown.slice(0, opts.maxChars);
      truncated = true;
    }
    const title = titleFromMarkdown(markdown);
    const out: ObscuraExtractResult = {
      url,
      markdown,
      chars: markdown.length,
      backend: "obscura",
    };
    if (title) out.title = title;
    if (truncated) out.truncated = true;
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = /ETIMEDOUT|timed out|TIMEOUT/i.test(msg);
    return {
      url,
      markdown: "",
      chars: 0,
      error: timedOut ? "timeout" : msg.slice(0, 200),
      backend: "obscura",
    };
  }
}

/**
 * Stage B — SERP HTML via `obscura fetch --dump html` (fixed SERP URLs only at call site).
 */
export async function runObscuraFetchHtml(
  url: string,
  timeoutMs: number,
  opts?: { binary?: string; execFile?: ObscuraExecFile },
): Promise<string> {
  const binary = opts?.binary ?? (await resolveObscuraBinary(opts?.execFile));
  if (!binary) {
    throw new Error(`obscura_missing: ${obscuraInstallHint()}`);
  }
  const exec = opts?.execFile ?? (execFileAsync as ObscuraExecFile);
  const timeoutSec = Math.max(5, Math.ceil(timeoutMs / 1000));
  const { stdout, stderr } = await exec(
    binary,
    ["fetch", url, "--dump", "html", "--timeout", String(timeoutSec), "--quiet"],
    {
      timeout: timeoutMs + 2_000,
      maxBuffer: 4_000_000,
      encoding: "utf8",
    },
  );
  const html = stdout || "";
  if (!html.trim()) {
    const errHint = (stderr || "").trim().slice(0, 200);
    throw new Error(errHint || "obscura_empty_html");
  }
  return html;
}

export type ObscuraServeHandle = {
  port: number;
  /** Playwright connectOverCDP endpoint (http://127.0.0.1:port). */
  endpoint: string;
  child: ChildProcess;
  stop(): Promise<void>;
};

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close((err) => {
        if (err) reject(err);
        else if (!port) reject(new Error("no free port"));
        else resolve(port);
      });
    });
    s.on("error", reject);
  });
}

async function waitForCdp(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "not ready";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(800),
      });
      if (res.ok) return;
      lastErr = `http_${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`obscura_serve_timeout: ${lastErr}`);
}

/**
 * Stage C — daemon-owned `obscura serve` for managed browser (no stealth).
 * `--allow-file-access` so Playwright setInputFiles works; paths still jail-resolved by Home.
 */
export async function startObscuraServe(opts: {
  storageDir: string;
  binary?: string;
  readyTimeoutMs?: number;
  /** Test inject — skip real spawn. */
  spawnImpl?: (
    binary: string,
    args: string[],
  ) => ChildProcess;
}): Promise<ObscuraServeHandle> {
  const binary = opts.binary ?? (await resolveObscuraBinary());
  if (!binary) {
    throw Object.assign(
      new Error(`envoyhome.tool_unavailable: managed Obscura needs binary — ${obscuraInstallHint()}`),
      { code: "tool_unavailable" },
    );
  }
  const port = await findFreePort();
  const args = [
    "serve",
    "--port",
    String(port),
    "--storage-dir",
    opts.storageDir,
    // P2-J file inputs; jail still enforced in apply_form.
    "--allow-file-access",
  ];
  const child =
    opts.spawnImpl?.(binary, args) ??
    spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
  let stderrBuf = "";
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderrBuf = (stderrBuf + String(chunk)).slice(-2000);
  });
  let exited = false;
  let exitCode: number | null = null;
  child.once("exit", (code) => {
    exited = true;
    exitCode = code;
  });
  const stop = async () => {
    if (exited || child.killed) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        if (!exited) child.kill("SIGKILL");
        resolve();
      }, 2000);
      child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  };
  try {
    const readyMs = opts.readyTimeoutMs ?? 15_000;
    await new Promise<void>((resolve, reject) => {
      const failExit = () => {
        reject(
          new Error(
            `obscura_serve_exited: code=${exitCode ?? "?"}${
              stderrBuf.trim() ? `; ${stderrBuf.trim().slice(0, 200)}` : ""
            }`,
          ),
        );
      };
      if (exited) {
        failExit();
        return;
      }
      const onExit = () => {
        cleanup();
        failExit();
      };
      const cleanup = () => {
        child.off("exit", onExit);
      };
      child.on("exit", onExit);
      waitForCdp(port, readyMs).then(
        () => {
          cleanup();
          resolve();
        },
        (err) => {
          cleanup();
          reject(err);
        },
      );
    });
  } catch (err) {
    await stop().catch(() => undefined);
    const extra = stderrBuf.trim().slice(0, 200);
    const msg = err instanceof Error ? err.message : String(err);
    throw Object.assign(
      new Error(
        `envoyhome.tool_unavailable: obscura serve failed — ${msg}${
          extra && !msg.includes(extra) ? `; ${extra}` : ""
        }`,
      ),
      { code: "tool_unavailable" },
    );
  }
  return {
    port,
    endpoint: `http://127.0.0.1:${port}`,
    child,
    stop,
  };
}
