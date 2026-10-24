/**
 * The Envoy Harness commit a shipped desktop bundle embeds — and the clone that
 * puts exactly that commit on disk (EnvoyCoder `scripts/lib/harness-pin.mjs`).
 *
 * EnvoyHome esbuild-inlines `@envoymesh/envoy-harness` into the daemon package.
 * Without a pin, two builds of the same tag can ship two different harness
 * revisions (packages are version 0.0.0). `scripts/envoy-harness.pin` is that
 * handle. `ENVOY_HARNESS_COMMIT` overrides it deliberately.
 *
 * Packagers need not clone harness first: `stage-desktop-bundle.mjs` checks out
 * the pin into `../envoy-harness` (or `ENVOY_HARNESS_DIR`) when missing.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** EnvoyHome repo root (`scripts/lib/` → up two). */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Tracked pin — one line, full 40-char commit. */
export const HARNESS_PIN_FILE = path.join(repoRoot, "scripts", "envoy-harness.pin");

/** Default public clone URL (override with ENVOY_HARNESS_REPO_URL). */
export const DEFAULT_HARNESS_REPO_URL = "https://github.com/allenpeng0705/envoy-harness.git";

const FULL_COMMIT = /^[0-9a-f]{40}$/;

function firstLine(text) {
  return (
    (text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "(no output)"
  );
}

function git(dest, args) {
  const result = spawnSync("git", ["-C", dest, ...args], { encoding: "utf8" });
  if (result.error) throw new Error(`git ${args.join(" ")} failed to start: ${result.error.message}`);
  return result;
}

function must(dest, args) {
  const result = git(dest, args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${dest}: ${firstLine(result.stderr)}`);
  }
  return result;
}

/**
 * @returns {{ commit: string; from: string; source: "pin" | "override" }}
 */
export function readHarnessCommit(env = process.env) {
  const override = (env.ENVOY_HARNESS_COMMIT ?? "").trim();
  if (override.length > 0) {
    if (!FULL_COMMIT.test(override)) {
      throw new Error(
        `ENVOY_HARNESS_COMMIT is not a full 40-character commit: ${JSON.stringify(override)}.\n` +
          "  The harness packages are version 0.0.0 — only a commit identifies a revision.",
      );
    }
    return { commit: override, from: "ENVOY_HARNESS_COMMIT", source: "override" };
  }
  let pinned;
  try {
    pinned = readFileSync(HARNESS_PIN_FILE, "utf8").trim();
  } catch {
    throw new Error(
      `the Envoy Harness pin is missing: ${path.relative(repoRoot, HARNESS_PIN_FILE)}\n` +
        "  Recreate it with the commit to ship, or set ENVOY_HARNESS_COMMIT.",
    );
  }
  if (!FULL_COMMIT.test(pinned)) {
    throw new Error(
      `${path.relative(repoRoot, HARNESS_PIN_FILE)} does not name a full 40-character commit: ` +
        `${JSON.stringify(pinned)}.`,
    );
  }
  return { commit: pinned, from: path.relative(repoRoot, HARNESS_PIN_FILE), source: "pin" };
}

/**
 * Clone `url` at exactly `commit` into `dest` (wiped first). Never falls back to a branch tip.
 *
 * Checks out a named local branch (default `ENVOYHOME_PEER_BRANCH` / `main`) at that
 * commit — not a detached HEAD — so `scripts/peers-check.sh` accepts the tree.
 */
export function checkoutHarnessCommit({
  dest,
  url,
  commit,
  branch = (process.env.ENVOYHOME_PEER_BRANCH ?? "main").trim() || "main",
}) {
  if (!FULL_COMMIT.test(commit)) {
    throw new Error(`refusing to check out a non-commit: ${JSON.stringify(commit)}`);
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  must(dest, ["init", "--quiet"]);
  must(dest, ["remote", "add", "origin", url]);

  const shallow = git(dest, ["fetch", "--depth", "1", "origin", commit]);
  if (shallow.status !== 0) {
    const full = git(dest, ["fetch", "origin"]);
    if (full.status !== 0) {
      throw new Error(
        `could not fetch Envoy Harness from ${url} to reach ${commit}.\n` +
          `  shallow fetch: ${firstLine(shallow.stderr)}\n` +
          `  full fetch:    ${firstLine(full.stderr)}`,
      );
    }
  }

  // -B creates/resets the local branch at `commit` (peers-check expects this name).
  const checkout = git(dest, ["checkout", "-B", branch, "--force", commit]);
  if (checkout.status !== 0) {
    throw new Error(
      `Envoy Harness ${commit} is not a commit in ${url}.\n` +
        `  git: ${firstLine(checkout.stderr)}\n` +
        "  Fix scripts/envoy-harness.pin or set ENVOY_HARNESS_COMMIT — this build will not fall back to a branch tip.",
    );
  }

  const head = (must(dest, ["rev-parse", "HEAD"]).stdout ?? "").trim();
  if (head !== commit) {
    throw new Error(
      `Envoy Harness checkout landed on ${head || "(nothing)"}, not the pinned ${commit}.`,
    );
  }
  const onBranch = (must(dest, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout ?? "").trim();
  if (onBranch !== branch) {
    throw new Error(
      `Envoy Harness checkout is on '${onBranch || "(detached)"}', expected branch '${branch}' for peers:check.`,
    );
  }
  return { commit: head, branch };
}
