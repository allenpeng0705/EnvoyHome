/**
 * Pinned LibreOffice stable artifacts for managed install (Design §9.5b / P2-K8).
 * Start URLs are Document Foundation; MirrorBrain may 302 to https mirrors.
 * sha256 is mandatory and verified after download (mirrors are not host-allow-listed).
 */

export type LibreOfficePlatformId =
  | "darwin-arm64"
  | "darwin-x64"
  | "linux-x64"
  | "win32-x64";

export interface LibreOfficeCatalogEntry {
  id: LibreOfficePlatformId;
  version: string;
  /** Approx / metalink size for Owner-facing copy + download cap. */
  approxBytes: number;
  fileName: string;
  url: string;
  /** Hex sha-256 of the archive (from TDF metalink). */
  sha256: string;
  /** Relative path under runtime/ to soffice after extract. */
  sofficeRelPath: string;
  kind: "dmg" | "msi" | "tar.gz";
}

/** Stable pin — bump when refreshing managed LO (silent may re-run after catalog bump). */
export const LIBREOFFICE_CATALOG_VERSION = "26.8.2";

const BASE = `https://download.documentfoundation.org/libreoffice/stable/${LIBREOFFICE_CATALOG_VERSION}`;

export const LIBREOFFICE_WHY_TEXT =
  "EnvoyHome can make Word, Excel, PowerPoint, and PDF exports print-ready by installing LibreOffice on this home computer (~1 GB, stays local). Without it, exports still work with a simpler layout. We never send your documents to the cloud for conversion.";

/** Hard ceiling above metalink size (1.25×) — never trust Content-Length alone. */
export function libreOfficeDownloadMaxBytes(approxBytes: number): number {
  return Math.max(Math.ceil(approxBytes * 1.25), approxBytes + 64 * 1024 * 1024);
}

export const LIBREOFFICE_CATALOG: readonly LibreOfficeCatalogEntry[] = [
  {
    id: "darwin-arm64",
    version: LIBREOFFICE_CATALOG_VERSION,
    approxBytes: 299_236_406,
    fileName: `LibreOffice_${LIBREOFFICE_CATALOG_VERSION}_MacOS_aarch64.dmg`,
    url: `${BASE}/mac/aarch64/LibreOffice_${LIBREOFFICE_CATALOG_VERSION}_MacOS_aarch64.dmg`,
    sha256: "9f24fe83ab1ed5c95eb3df580119f32932f713e577feeac02bf619fb00749b55",
    sofficeRelPath: "LibreOffice.app/Contents/MacOS/soffice",
    kind: "dmg",
  },
  {
    id: "darwin-x64",
    version: LIBREOFFICE_CATALOG_VERSION,
    approxBytes: 309_690_507,
    fileName: `LibreOffice_${LIBREOFFICE_CATALOG_VERSION}_MacOS_x86-64.dmg`,
    url: `${BASE}/mac/x86_64/LibreOffice_${LIBREOFFICE_CATALOG_VERSION}_MacOS_x86-64.dmg`,
    sha256: "0af062779cc17f6f852918b2424c745f7dd2d20d51d7fb8a0925eb92ec0417a7",
    sofficeRelPath: "LibreOffice.app/Contents/MacOS/soffice",
    kind: "dmg",
  },
  {
    id: "linux-x64",
    version: LIBREOFFICE_CATALOG_VERSION,
    approxBytes: 221_006_208,
    fileName: `LibreOffice_${LIBREOFFICE_CATALOG_VERSION}_Linux_x86-64_deb.tar.gz`,
    url: `${BASE}/deb/x86_64/LibreOffice_${LIBREOFFICE_CATALOG_VERSION}_Linux_x86-64_deb.tar.gz`,
    sha256: "8290c8f46cb33d6df8f681cb796e0697461ea070f86ec55b63c94d7eb9d9a476",
    sofficeRelPath: "program/soffice",
    kind: "tar.gz",
  },
  {
    id: "win32-x64",
    version: LIBREOFFICE_CATALOG_VERSION,
    approxBytes: 375_934_976,
    fileName: `LibreOffice_${LIBREOFFICE_CATALOG_VERSION}_Win_x86-64.msi`,
    url: `${BASE}/win/x86_64/LibreOffice_${LIBREOFFICE_CATALOG_VERSION}_Win_x86-64.msi`,
    sha256: "ff4b911403b67ee9e6249f820f9782c44bb32c94fdaa45b0da53a8e419e5307a",
    sofficeRelPath: "program/soffice.exe",
    kind: "msi",
  },
];

export function resolveLibreOfficePlatformId(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): LibreOfficePlatformId | null {
  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  if (platform === "linux" && (arch === "x64" || arch === "x86_64")) {
    return "linux-x64";
  }
  if (platform === "win32" && (arch === "x64" || arch === "x86_64")) {
    return "win32-x64";
  }
  return null;
}

export function libreOfficeCatalogEntryForHost(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): LibreOfficeCatalogEntry | null {
  const id = resolveLibreOfficePlatformId(platform, arch);
  if (!id) return null;
  return LIBREOFFICE_CATALOG.find((e) => e.id === id) ?? null;
}
