/**
 * Optional local LibreOffice headless convert for export_document (Design §9.5b / P2-K7).
 * Never required to boot; never cloud. Concurrency 1; timeout 60s.
 */

import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import type { ExportFormat } from "./document-export.js";

export const LIBREOFFICE_CONVERT_TIMEOUT_MS = 60_000;
export const LIBREOFFICE_PROBE_TIMEOUT_MS = 5_000;

export type LibreOfficeProbe = {
  available: boolean;
  binaryPath?: string;
  versionLine?: string;
  error?: string;
};

export type LibreOfficeRuntimeStatus =
  | "ready"
  | "missing"
  | "downloading"
  | "failed";

/**
 * Owner-facing one-liner (copyable). Install on the **daemon host**
 * (home computer), not on a phone UI — Design §9.5b / V-OFFICE-11.
 */
export function libreOfficeInstallHint(
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "darwin") {
    return "brew install --cask libreoffice   # or download https://www.libreoffice.org/download/";
  }
  if (platform === "win32") {
    return "winget install TheDocumentFoundation.LibreOffice   # or download https://www.libreoffice.org/download/";
  }
  return "sudo apt install libreoffice   # or your distro’s LibreOffice package / https://www.libreoffice.org/download/";
}

/** Public status for Settings / Doctor / export hints (no host path leakage). */
export async function getDocumentExportStatus(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { force?: boolean; platform?: NodeJS.Platform },
): Promise<import("./libreoffice-install.js").DocumentExportStatus> {
  const { getLibreOfficeInstallService } = await import("./libreoffice-install.js");
  const svc = getLibreOfficeInstallService();
  if (svc) return svc.getStatus();

  const { LIBREOFFICE_WHY_TEXT } = await import("./libreoffice-catalog.js");
  const hint = libreOfficeInstallHint(opts?.platform ?? process.platform);
  const probe = await probeLibreOffice(
    env,
    opts?.force ? { force: true } : undefined,
  );
  if (probe.available) {
    const out: import("./libreoffice-install.js").DocumentExportStatus = {
      libreOfficeRuntime: "ready",
      libreOfficeInstallHint: hint,
      whyText: LIBREOFFICE_WHY_TEXT,
      installSource: "system",
      autoInstall: { attempted: false, declined: false, enabled: true },
    };
    if (probe.versionLine) out.versionLine = probe.versionLine;
    return out;
  }
  return {
    libreOfficeRuntime: "missing",
    libreOfficeInstallHint: hint,
    whyText: LIBREOFFICE_WHY_TEXT,
    autoInstall: { attempted: false, declined: false, enabled: true },
  };
}

let cachedProbe: LibreOfficeProbe | null = null;
let convertChain: Promise<unknown> = Promise.resolve();

/** Test hook — clear probe cache + drain queue. */
export function __resetLibreOfficeForTests(): void {
  cachedProbe = null;
  convertChain = Promise.resolve();
}

export function libreOfficeCandidatePaths(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const out: string[] = [];
  const fromEnv = env.ENVOYHOME_LIBREOFFICE?.trim();
  if (fromEnv) out.push(fromEnv);
  // PATH names — resolved by trying common absolute locations + bare names via which-like.
  out.push(
    "soffice",
    "libreoffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
    "/usr/lib/libreoffice/program/soffice",
    "/opt/homebrew/bin/soffice",
    "/opt/homebrew/bin/libreoffice",
  );
  return out;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function runProcess(
  binary: string,
  args: string[],
  opts: { timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`envoyhome.libreoffice_timeout: exceeded ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** Clear cached probe (after managed install). */
export function clearLibreOfficeProbeCache(): void {
  cachedProbe = null;
}

/** Probe soffice once (cached). Bare names rely on PATH. */
export async function probeLibreOffice(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { force?: boolean },
): Promise<LibreOfficeProbe> {
  if (cachedProbe && !opts?.force) return cachedProbe;

  // Explicit ENVOYHOME_LIBREOFFICE is fail-closed to that path only (no silent fallback).
  const fromEnv = env.ENVOYHOME_LIBREOFFICE?.trim();
  let candidates: string[];
  if (fromEnv) {
    candidates = [fromEnv];
  } else {
    candidates = [...libreOfficeCandidatePaths(env)];
    // Prefer managed runtime when install service has one (P2-K8).
    try {
      const { getLibreOfficeInstallService } = await import("./libreoffice-install.js");
      const managed = getLibreOfficeInstallService()?.managedSofficePath();
      if (managed) candidates = [managed, ...candidates];
    } catch {
      /* ignore */
    }
  }

  for (const candidate of candidates) {
    const absoluteLike = candidate.includes("/") || candidate.includes("\\");
    if (absoluteLike) {
      if (!(await isExecutable(candidate))) continue;
    }
    try {
      const result = await runProcess(candidate, ["--version"], {
        timeoutMs: LIBREOFFICE_PROBE_TIMEOUT_MS,
        env,
      });
      const line = (result.stdout || result.stderr).trim().split("\n")[0] ?? "";
      if (result.code === 0 || /libreoffice|openoffice|soffice/i.test(line)) {
        const ok: LibreOfficeProbe = {
          available: true,
          binaryPath: candidate,
        };
        if (line) ok.versionLine = line;
        cachedProbe = ok;
        return ok;
      }
    } catch {
      /* try next */
    }
  }

  cachedProbe = {
    available: false,
    error: fromEnv
      ? `LibreOffice not runnable at ENVOYHOME_LIBREOFFICE=${fromEnv}`
      : "LibreOffice (soffice) not found on PATH or ENVOYHOME_LIBREOFFICE",
  };
  return cachedProbe;
}

/** Formats that use an ODS intermediate for LO convert. */
function usesOdsIntermediate(format: ExportFormat): boolean {
  return format === "xlsx" || format === "ods" || format === "csv";
}

/** LibreOffice --convert-to filter token. */
export function libreOfficeConvertTo(format: ExportFormat): string {
  switch (format) {
    case "docx":
      return "docx";
    case "xlsx":
      return "xlsx";
    case "csv":
      return "csv";
    case "pdf":
      return "pdf";
    case "pptx":
      return "pptx";
    case "html":
      return "html:HTML";
    case "rtf":
      return "rtf";
    case "odt":
      return "odt";
    case "ods":
      return "ods";
    case "epub":
      return "epub";
    case "md":
      throw new Error("envoyhome.bad_params: md export never uses LibreOffice");
  }
}

/**
 * Convert an intermediate buffer (HTML or ODS) to the target format via soffice.
 * Serialized (concurrency 1). Caller supplies intermediate bytes + extension.
 */
export async function convertWithLibreOffice(input: {
  format: ExportFormat;
  intermediate: Buffer;
  intermediateExt: ".html" | ".ods";
  binaryPath: string;
  env?: NodeJS.ProcessEnv;
}): Promise<Buffer> {
  const run = async (): Promise<Buffer> => {
    const work = await mkdtemp(join(tmpdir(), "eh-lo-"));
    const profile = await mkdtemp(join(tmpdir(), "eh-lo-profile-"));
    try {
      const stem = "source";
      const inPath = join(work, `${stem}${input.intermediateExt}`);
      await writeFile(inPath, input.intermediate);
      const convertTo = libreOfficeConvertTo(input.format);
      // Unique UserInstallation avoids profile lock when daemon shares a host with GUI LO.
      // pathToFileURL is correct on Windows (file:///C:/…), unlike file://${path}.
      const userInstall = pathToFileURL(profile).href;
      const result = await runProcess(
        input.binaryPath,
        [
          "--headless",
          "--norestore",
          "--nolockcheck",
          "--nodefault",
          "--nofirststartwizard",
          `-env:UserInstallation=${userInstall}`,
          "--convert-to",
          convertTo,
          "--outdir",
          work,
          inPath,
        ],
        {
          timeoutMs: LIBREOFFICE_CONVERT_TIMEOUT_MS,
          env: input.env ?? process.env,
        },
      );
      if (result.code !== 0) {
        throw new Error(
          `envoyhome.libreoffice_failed: exit ${result.code}: ${(result.stderr || result.stdout).slice(0, 400)}`,
        );
      }
      const outName = `${stem}.${input.format === "html" ? "html" : input.format}`;
      // LO may emit Writer-ish names; try primary then scan.
      let outPath = join(work, outName);
      try {
        await access(outPath, fsConstants.R_OK);
      } catch {
        const { readdir } = await import("node:fs/promises");
        const files = await readdir(work);
        const hit = files.find(
          (f) =>
            f !== basename(inPath) &&
            f.toLowerCase().endsWith(`.${input.format}`),
        );
        if (!hit) {
          throw new Error(
            `envoyhome.libreoffice_failed: no output .${input.format} (files: ${files.join(",")})`,
          );
        }
        outPath = join(work, hit);
      }
      return await readFile(outPath);
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
      await rm(profile, { recursive: true, force: true }).catch(() => undefined);
    }
  };

  const gated = convertChain.then(run, run);
  convertChain = gated.then(
    () => undefined,
    () => undefined,
  );
  return gated;
}

export function intermediateKindForFormat(
  format: ExportFormat,
): "html" | "ods" | "none" {
  if (format === "md") return "none";
  if (usesOdsIntermediate(format)) return "ods";
  return "html";
}
