/** Archive integrity + zip-slip guards for llama-server downloads. */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Optional pinned digests (hex). When present, download MUST match.
 * Populate when bumping HOME_LLAMA_CPP_TAG after a verified smoke download.
 * Absent → TOFU: first download records digest beside the archive; later must match.
 */
export const HOME_LLAMA_CPP_SHA256: Readonly<Record<string, string>> = {
  // Pinned digests land here when the tag is smoke-verified, e.g.:
  // "llama-b10331-bin-macos-arm64.tar.gz": "<hex>",
};

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash.digest("hex");
}

export async function verifyArchiveSha256(
  archivePath: string,
  assetName: string,
  opts?: { expectedSha256?: string; tofuDir?: string },
): Promise<string> {
  const actual = (await sha256File(archivePath)).toLowerCase();
  const pinned = (opts?.expectedSha256 ?? HOME_LLAMA_CPP_SHA256[assetName])?.toLowerCase();
  if (pinned) {
    if (actual !== pinned) {
      throw new Error(
        `envoyhome.local_engine_download_failed: sha256 mismatch for ${assetName} (got ${actual.slice(0, 12)}…)`,
      );
    }
    return actual;
  }
  const envPin = process.env.ENVOYHOME_LLAMA_SHA256?.trim().toLowerCase();
  if (envPin) {
    if (actual !== envPin) {
      throw new Error(
        `envoyhome.local_engine_download_failed: sha256 mismatch vs ENVOYHOME_LLAMA_SHA256 for ${assetName}`,
      );
    }
    return actual;
  }
  if (opts?.tofuDir) {
    const digestPath = join(opts.tofuDir, `${assetName}.sha256`);
    let recorded = "";
    try {
      recorded = (await readFile(digestPath, "utf8")).trim().toLowerCase();
    } catch {
      recorded = "";
    }
    if (recorded) {
      if (recorded !== actual) {
        throw new Error(
          `envoyhome.local_engine_download_failed: sha256 mismatch vs recorded TOFU digest for ${assetName}`,
        );
      }
    } else {
      await writeFile(digestPath, `${actual}\n`, "utf8");
    }
  }
  return actual;
}

/** Reject archive members that escape the extract root (zip-slip). */
export function assertSafeArchiveEntry(entryName: string): void {
  const n = normalize(entryName.replace(/\\/g, "/"));
  if (
    n === ".." ||
    n.startsWith("../") ||
    n.includes("/../") ||
    n.includes(`${sep}..${sep}`) ||
    n.endsWith("/..")
  ) {
    throw new Error(`envoyhome.local_engine_download_failed: unsafe archive entry ${entryName}`);
  }
  if (n.startsWith("/") || /^[A-Za-z]:/.test(n)) {
    throw new Error(`envoyhome.local_engine_download_failed: absolute archive entry ${entryName}`);
  }
}

export async function assertTarEntriesSafe(archivePath: string): Promise<void> {
  const { stdout } = await execFileAsync("tar", ["-tzf", archivePath], {
    maxBuffer: 16 * 1024 * 1024,
  });
  for (const line of stdout.split("\n")) {
    const name = line.trim();
    if (!name) continue;
    assertSafeArchiveEntry(name);
  }
}

export async function assertZipEntriesSafe(archivePath: string): Promise<void> {
  try {
    const { stdout } = await execFileAsync("zipinfo", ["-1", archivePath], {
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const line of stdout.split("\n")) {
      const name = line.trim();
      if (!name) continue;
      assertSafeArchiveEntry(name);
    }
    return;
  } catch {
    // fall through to unzip -Z1
  }
  const { stdout } = await execFileAsync("unzip", ["-Z1", archivePath], {
    maxBuffer: 16 * 1024 * 1024,
  });
  for (const line of stdout.split("\n")) {
    const name = line.trim();
    if (!name) continue;
    assertSafeArchiveEntry(name);
  }
}
