/**
 * Bundle `@envoyhome/daemon` for the Tauri shell (EnvoyCoder `build-daemon.mjs` pattern).
 *
 * Development: keep workspace imports external (checkout resolves them).
 * `--package` / `ENVOYHOME_DAEMON_PACKAGE=1`: embed `@envoyhome/*` + `@envoymesh/*`;
 * leave npm packages external and copy them into `dist-daemon/node_modules`.
 *
 * Usage (repo root or `-w @envoyhome/desktop`):
 *   pnpm --filter @envoyhome/desktop run daemon:package
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const repoRoot = resolve(appDir, "../..");
const outDir = join(appDir, "dist-daemon");
const entry = join(repoRoot, "packages", "daemon", "dist", "bin", "envoyhome-daemon.js");

function listWorkspacePackageDirs() {
  const dirs = [];
  for (const top of ["packages", "plugins", "apps"]) {
    const base = join(repoRoot, top);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const dir = join(base, name);
      if (existsSync(join(dir, "package.json"))) dirs.push(dir);
    }
  }
  return dirs;
}

if (!existsSync(entry)) {
  console.error(
    `Missing ${relative(repoRoot, entry)} — run \`pnpm --filter @envoyhome/daemon build\` first.`,
  );
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const packaged =
  process.env.ENVOYHOME_DAEMON_PACKAGE === "1" || process.argv.includes("--package");

const result = await build({
  entryPoints: [entry],
  outfile: join(outDir, "main.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: !packaged,
  ...(packaged ? { plugins: [externalNpmPlugin()] } : { packages: "external" }),
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
  logLevel: "warning",
  metafile: true,
});

if (result.warnings.length > 0) {
  for (const warning of result.warnings) console.warn("daemon bundle:", warning.text);
}

const written = await stat(join(outDir, "main.mjs"));
console.log(
  `daemon bundle: dist-daemon/main.mjs (${(written.size / 1024).toFixed(1)} kB)`,
);

/** Embed workspace packages; leave other bare imports as npm externals. */
function externalNpmPlugin() {
  return {
    name: "external-npm",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^[^./]/ }, (args) => {
        if (args.kind === "entry-point") return undefined;
        if (args.path.startsWith("node:")) return undefined;
        if (/^[A-Za-z]:[\\/]/.test(args.path) || args.path.includes("\\")) return undefined;
        if (args.path.startsWith("@envoyhome/") || args.path.startsWith("@envoymesh/")) {
          return undefined;
        }
        return { path: args.path, external: true };
      });
    },
  };
}

const resolvers = [
  join(repoRoot, "packages", "daemon"),
  ...listWorkspacePackageDirs(),
  repoRoot,
  resolve(repoRoot, "../EnvoyMesh"),
  // Harness is a sibling link — resolve its deps (e.g. smol-toml) from the package root.
  resolve(repoRoot, "../envoy-harness/packages/envoy-harness"),
  resolve(repoRoot, "../envoy-harness"),
  appDir,
]
  .filter((dir) => existsSync(join(dir, "package.json")))
  .map((dir) => createRequire(join(dir, "package.json")));

function externalPackages(metafile) {
  const names = new Set();
  for (const output of Object.values(metafile.outputs ?? {})) {
    for (const imported of output.imports ?? []) {
      if (!imported.external) continue;
      const spec = imported.path;
      if (!spec || spec.startsWith("node:") || spec.startsWith(".") || spec.startsWith("/")) continue;
      names.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
    }
  }
  return [...names];
}

/** Walk up from a resolved file until we find that package's package.json. */
function packageRootFromFile(file, name) {
  let dir = dirname(file);
  const needle = join(...name.split("/"));
  for (let i = 0; i < 12; i++) {
    const pkgFile = join(dir, "package.json");
    if (existsSync(pkgFile)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
        if (pkg.name === name || dir.endsWith(needle)) return dir;
      } catch {
        // continue
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function packageDirOnDisk(name, req) {
  try {
    const pkgFile = req.resolve(`${name}/package.json`);
    return dirname(pkgFile);
  } catch {
    // Some packages block exports for package.json — resolve the entry instead.
  }
  try {
    const main = req.resolve(name);
    const root = packageRootFromFile(main, name);
    if (root) return root;
  } catch {
    // fall through
  }
  const paths = req.resolve.paths(name) ?? [];
  for (const dir of paths) {
    const pkgFile = join(dir, ...name.split("/"), "package.json");
    if (existsSync(pkgFile)) return dirname(pkgFile);
  }
  return null;
}

function locatePackage(name, prefer) {
  const tries = prefer ? [prefer, ...resolvers] : resolvers;
  for (const req of tries) {
    const onDisk = packageDirOnDisk(name, req);
    if (onDisk) {
      const pkg = JSON.parse(readFileSync(join(onDisk, "package.json"), "utf8"));
      return { dir: onDisk, pkg };
    }
  }
  return null;
}

function isWorkspaceSpec(spec) {
  return typeof spec === "string" && (spec.startsWith("workspace:") || spec.startsWith("file:") || spec.startsWith("link:"));
}

function isVirtualStorePath(dir) {
  // pnpm: …/node_modules/.pnpm/…/node_modules/pkg — still a real install tree.
  return dir.includes(`${sep}node_modules${sep}`);
}

/**
 * Copy an npm package into the staged node_modules tree.
 *
 * Flatten when safe; if the same package name is already at the intended place
 * with a **different version**, nest under the parent (Node resolution). This
 * fixes lazystream → readable-stream@2 (`passthrough`) when another dep already
 * pulled readable-stream@3 into the flat tree (Windows/Mac DMG crash loop).
 *
 * `seen` keys are `name@version` so multiple majors can coexist.
 */
function copyPackage(name, dest, seen, missing, required, prefer, parentDir = null) {
  const found = locatePackage(name, prefer);
  if (!found) {
    if (required) missing.push(name);
    return;
  }
  if (!isVirtualStorePath(found.dir)) {
    // Workspace / link roots are embedded by esbuild — skip re-copy.
    if (required) {
      // Optional native addons may live outside node_modules; warn via missing only when required.
      missing.push(name);
    }
    return;
  }
  const version = String(found.pkg.version ?? "0.0.0");
  const key = `${name}@${version}`;
  const topLevel = join(dest, ...name.split("/"));

  // Already materialized this exact version somewhere. If the parent cannot see
  // it (sibling nest), copy once under the parent — but do NOT walkDeps again
  // (that caused infinite nest A→B→A while packaging).
  if (seen.has(key)) {
    if (parentDir && !resolvesInsideTree(parentDir, name, version, dest)) {
      materializeAt(found.dir, join(parentDir, "node_modules", ...name.split("/")));
    }
    return;
  }

  let target = topLevel;
  if (parentDir) {
    const topVer = readPkgVersion(topLevel);
    if (topVer && topVer !== version) {
      target = join(parentDir, "node_modules", ...name.split("/"));
    } else if (topVer === version || resolvesInsideTree(parentDir, name, version, dest)) {
      // Dep already staged where Node would find it *inside the package tree*.
      // Do not treat ~/node_modules (or other ambient installs) as satisfied —
      // that made DMGs "work" in the checkout and crash under /Applications.
      seen.add(key);
      walkDeps(found.pkg, dest, seen, missing, createRequire(join(found.dir, "package.json")), parentDir);
      return;
    }
  }

  if (existsSync(join(target, "package.json")) && readPkgVersion(target) === version) {
    seen.add(key);
    walkDeps(found.pkg, dest, seen, missing, createRequire(join(found.dir, "package.json")), target);
    return;
  }

  seen.add(key);
  materializeAt(found.dir, target);
  walkDeps(found.pkg, dest, seen, missing, createRequire(join(found.dir, "package.json")), target);
}

/** Copy package files without nested node_modules (pnpm store is flattened via walkDeps). */
function materializeAt(sourceDir, target) {
  if (existsSync(join(target, "package.json")) && readPkgVersion(target)) return;
  mkdirSync(dirname(target), { recursive: true });
  const root = resolve(sourceDir);
  cpSync(sourceDir, target, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      try {
        const rel = relative(root, resolve(src));
        if (!rel || rel.startsWith(`..${sep}`) || rel === "..") return true;
        return !rel.split(sep).includes("node_modules");
      } catch {
        return true;
      }
    },
  });
}

function readPkgVersion(pkgDir) {
  const pkgFile = join(pkgDir, "package.json");
  if (!existsSync(pkgFile)) return "";
  try {
    return String(JSON.parse(readFileSync(pkgFile, "utf8")).version ?? "");
  } catch {
    return "";
  }
}

/**
 * True if `name` resolves from parentDir to the expected version **and** the
 * resolved directory lives under the staged `dest` tree. Ambient installs
 * (e.g. ~/node_modules) must not count — packaged apps under /Applications
 * cannot see them.
 */
function resolvesInsideTree(parentDir, name, version, dest) {
  try {
    const req = createRequire(join(parentDir, "package.json"));
    const pkgFile = req.resolve(`${name}/package.json`);
    const resolvedDir = resolve(dirname(pkgFile));
    const root = resolve(dest);
    if (resolvedDir !== root && !resolvedDir.startsWith(root + sep)) return false;
    return readPkgVersion(resolvedDir) === version;
  } catch {
    return false;
  }
}

function walkDeps(pkg, dest, seen, missing, prefer, parentDir) {
  const dependencies = pkg.dependencies ?? {};
  const optional = { ...pkg.optionalDependencies, ...pkg.peerDependencies };
  for (const dep of Object.keys(dependencies)) {
    if (isWorkspaceSpec(dependencies[dep])) continue;
    copyPackage(dep, dest, seen, missing, true, prefer, parentDir);
  }
  for (const dep of Object.keys(optional)) {
    if (isWorkspaceSpec(optional[dep])) continue;
    copyPackage(dep, dest, seen, missing, false, prefer, parentDir);
  }
}

function materializeNodeModules(metafile, out) {
  const names = new Set(externalPackages(metafile));
  // Dynamic `import("playwright")` must always ship beside the packaged daemon
  // (Chromium browsers stay Owner opt-in; the npm driver is required).
  names.add("playwright");
  const dest = join(out, "node_modules");
  mkdirSync(dest, { recursive: true });
  const seen = new Set();
  const missing = [];
  for (const name of names) copyPackage(name, dest, seen, missing, true, null);
  if (missing.length > 0) {
    const unique = [...new Set(missing)];
    // Optional / rarely-installed sidecars — daemon already degrades without them.
    // smol-toml is required by @envoymesh/envoy-harness (TOML config) — never optional.
    const optionalMissing = new Set(["@deepseek-ai/node-addon-landlock-run"]);
    const hard = unique.filter(
      (n) => !optionalMissing.has(n) && !n.startsWith("@deepseek-ai/"),
    );
    if (hard.length > 0) {
      console.error("The packaged daemon imports packages that are not installed:");
      for (const name of hard) console.error(`  ${name}`);
      process.exit(1);
    }
    console.warn("daemon package: skipping optional missing packages:");
    for (const name of unique) console.warn(`  ${name}`);
  }
  console.log(`daemon node_modules: ${seen.size} packages beside the bundle`);
}

if (packaged) materializeNodeModules(result.metafile, outDir);
