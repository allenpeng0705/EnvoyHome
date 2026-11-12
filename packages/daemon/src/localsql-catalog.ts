/**
 * Pinned DuckDB CLI artifacts for managed local SQL (Design §9.5k / P2-S).
 * Origin: GitHub duckdb/duckdb releases; sha256 from release asset digests.
 */

export type LocalSqlPlatformId =
  | "darwin-arm64"
  | "darwin-x64"
  | "linux-x64"
  | "linux-arm64"
  | "win32-x64";

export interface LocalSqlCatalogEntry {
  id: LocalSqlPlatformId;
  version: string;
  approxBytes: number;
  fileName: string;
  url: string;
  /** Hex sha-256 of the archive. */
  sha256: string;
  /** Relative path under runtime/ to the CLI after extract. */
  binaryRelPath: string;
  kind: "tar.gz";
}

/** Stable pin — bump when refreshing managed DuckDB. */
export const LOCALSQL_CATALOG_VERSION = "2.0.0";

const TAG = `v${LOCALSQL_CATALOG_VERSION}`;
const BASE = `https://github.com/duckdb/duckdb/releases/download/${TAG}`;

export const LOCALSQL_WHY_TEXT =
  "EnvoyHome can install DuckDB (~20–40 MB) on this home computer for offline SQL joins on jail files. It stays local — never silent; you choose Install. sql_load/sql_query stay out of the agent catalogue until ready. Prefer table_transform → local SQL → Owner MCP for remote/SaaS. Privacy Mode: local SQL OK; remote MCP blocked.";

/** Hard ceiling above catalog size (1.25×). */
export function localSqlDownloadMaxBytes(approxBytes: number): number {
  return Math.max(Math.ceil(approxBytes * 1.25), approxBytes + 16 * 1024 * 1024);
}

export const LOCALSQL_CATALOG: readonly LocalSqlCatalogEntry[] = [
  {
    id: "darwin-arm64",
    version: LOCALSQL_CATALOG_VERSION,
    approxBytes: 19_169_633,
    fileName: "duckdb-cli-osx-arm64.tar.gz",
    url: `${BASE}/duckdb-cli-osx-arm64.tar.gz`,
    sha256: "188a36fe8883ef52e69165a0cbb6031ef679c8e6c448a1ce22951964149b7f96",
    binaryRelPath: "duckdb",
    kind: "tar.gz",
  },
  {
    id: "darwin-x64",
    version: LOCALSQL_CATALOG_VERSION,
    approxBytes: 21_471_922,
    fileName: "duckdb-cli-osx-amd64.tar.gz",
    url: `${BASE}/duckdb-cli-osx-amd64.tar.gz`,
    sha256: "fbc7013ba09d117396dabf16783281c2add47fc01cdac4855464a03526dc96ee",
    binaryRelPath: "duckdb",
    kind: "tar.gz",
  },
  {
    id: "linux-x64",
    version: LOCALSQL_CATALOG_VERSION,
    approxBytes: 24_424_037,
    fileName: "duckdb-cli-linux-amd64.tar.gz",
    url: `${BASE}/duckdb-cli-linux-amd64.tar.gz`,
    sha256: "c6507206baf7793c6013dbd82368469a45f20dc0e17a6f92f204602f652ed2bc",
    binaryRelPath: "duckdb",
    kind: "tar.gz",
  },
  {
    id: "linux-arm64",
    version: LOCALSQL_CATALOG_VERSION,
    approxBytes: 22_306_407,
    fileName: "duckdb-cli-linux-arm64.tar.gz",
    url: `${BASE}/duckdb-cli-linux-arm64.tar.gz`,
    sha256: "859e1875d2a9515fbb4bf8871061437a14af82320da68c753f094c4b776348fe",
    binaryRelPath: "duckdb",
    kind: "tar.gz",
  },
  {
    id: "win32-x64",
    version: LOCALSQL_CATALOG_VERSION,
    approxBytes: 19_663_611,
    fileName: "duckdb-cli-windows-amd64.tar.gz",
    url: `${BASE}/duckdb-cli-windows-amd64.tar.gz`,
    sha256: "91663c2f36c2a334b0e5e639006d8c29c29e013af0c477d80bb931df68870312",
    binaryRelPath: "duckdb.exe",
    kind: "tar.gz",
  },
];

export function resolveLocalSqlPlatformId(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): LocalSqlPlatformId | null {
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

export function localSqlCatalogEntryForHost(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): LocalSqlCatalogEntry | null {
  const id = resolveLocalSqlPlatformId(platform, arch);
  if (!id) return null;
  return LOCALSQL_CATALOG.find((e) => e.id === id) ?? null;
}

/** GitHub releases + objects CDN only. */
export function isAllowedLocalSqlOriginHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "github.com" ||
    h === "objects.githubusercontent.com" ||
    h.endsWith(".githubusercontent.com")
  );
}
