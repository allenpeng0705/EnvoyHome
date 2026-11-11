/**
 * Pinned Obscura release artifacts (Design §9.5f Stage D).
 * Non-stealth **render** builds — used for dig/SERP fetch and managed CDP serve.
 * sha256 from GitHub release asset digests; verified before extract.
 */

export type ObscuraPlatformId =
  | "darwin-arm64"
  | "darwin-x64"
  | "linux-x64"
  | "linux-arm64"
  | "win32-x64";

export interface ObscuraCatalogEntry {
  id: ObscuraPlatformId;
  version: string;
  approxBytes: number;
  fileName: string;
  url: string;
  /** Hex sha-256 of the archive. */
  sha256: string;
  /** Relative path under runtime/ to the CLI after extract. */
  binaryRelPath: string;
  kind: "tar.gz" | "zip";
}

/** Stable pin — bump when refreshing managed/bundled Obscura. */
export const OBSCURA_CATALOG_VERSION = "0.2.6";

const TAG = `v${OBSCURA_CATALOG_VERSION}`;
const BASE = `https://github.com/h4ckf0r0day/obscura/releases/download/${TAG}`;

export const OBSCURA_WHY_TEXT =
  "EnvoyHome can install Obscura (~70 MB), a small local headless browser for dig / search fallback / managed browser. It stays on this home computer; we never use stealth builds as the product default.";

/** Hard ceiling above catalog size (1.25×). */
export function obscuraDownloadMaxBytes(approxBytes: number): number {
  return Math.max(Math.ceil(approxBytes * 1.25), approxBytes + 16 * 1024 * 1024);
}

export const OBSCURA_CATALOG: readonly ObscuraCatalogEntry[] = [
  {
    id: "darwin-arm64",
    version: OBSCURA_CATALOG_VERSION,
    approxBytes: 67_339_424,
    fileName: "obscura-aarch64-macos.tar.gz",
    url: `${BASE}/obscura-aarch64-macos.tar.gz`,
    sha256: "19faa248ac762f466ddb822dbb03ed4f097312d10d1a4d5b2143e6040a9bebd0",
    binaryRelPath: "obscura",
    kind: "tar.gz",
  },
  {
    id: "darwin-x64",
    version: OBSCURA_CATALOG_VERSION,
    approxBytes: 69_597_387,
    fileName: "obscura-x86_64-macos.tar.gz",
    url: `${BASE}/obscura-x86_64-macos.tar.gz`,
    sha256: "897f03df4e3d704f946c5e14c6a90a34e0d4e4ef898c4b3201771712962cd7fb",
    binaryRelPath: "obscura",
    kind: "tar.gz",
  },
  {
    id: "linux-x64",
    version: OBSCURA_CATALOG_VERSION,
    approxBytes: 71_782_128,
    fileName: "obscura-x86_64-linux.tar.gz",
    url: `${BASE}/obscura-x86_64-linux.tar.gz`,
    sha256: "eed986e478c5ec5439f531f2d7fb6b0e36a356f1df7a6c44a8e8fd4f2486bd76",
    binaryRelPath: "obscura",
    kind: "tar.gz",
  },
  {
    id: "linux-arm64",
    version: OBSCURA_CATALOG_VERSION,
    approxBytes: 69_682_813,
    fileName: "obscura-aarch64-linux.tar.gz",
    url: `${BASE}/obscura-aarch64-linux.tar.gz`,
    sha256: "e12aff8bbe40326386a471060083e9cec5255b67048996b84f649efef10cac39",
    binaryRelPath: "obscura",
    kind: "tar.gz",
  },
  {
    id: "win32-x64",
    version: OBSCURA_CATALOG_VERSION,
    approxBytes: 69_076_668,
    fileName: "obscura-x86_64-windows.zip",
    url: `${BASE}/obscura-x86_64-windows.zip`,
    sha256: "0a110d0693753a252ed7ffd61e682363e8622caf79697f564c529099a31a6242",
    binaryRelPath: "obscura.exe",
    kind: "zip",
  },
];

export function resolveObscuraPlatformId(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): ObscuraPlatformId | null {
  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  if (platform === "linux") {
    if (arch === "arm64") return "linux-arm64";
    if (arch === "x64" || arch === "x86_64") return "linux-x64";
  }
  if (platform === "win32" && (arch === "x64" || arch === "x86_64")) {
    return "win32-x64";
  }
  return null;
}

export function obscuraCatalogEntryForHost(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): ObscuraCatalogEntry | null {
  const id = resolveObscuraPlatformId(platform, arch);
  if (!id) return null;
  return OBSCURA_CATALOG.find((e) => e.id === id) ?? null;
}

export function obscuraCatalogEntryById(id: ObscuraPlatformId): ObscuraCatalogEntry | null {
  return OBSCURA_CATALOG.find((e) => e.id === id) ?? null;
}

/** GitHub releases host only (no mirror redirect chain for Obscura). */
export function isAllowedObscuraOriginHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "github.com" || h === "objects.githubusercontent.com" || h.endsWith(".githubusercontent.com");
}
