// V-OUT-5 — list_dir / search_files through the path jail (Design §9.5e).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compileBasenameMatcher,
  listSandboxDir,
  searchSandboxFiles,
  SEARCH_FILES_MAX_DEPTH,
} from "../dist/sandbox-fs-browse.js";
import { PathJailError } from "../dist/fs-jail.js";

const dirs: string[] = [];

after(async () => {
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "eh-browse-"));
  dirs.push(root);
  const accountFilesRoot = join(root, "files");
  const shareRoot = join(root, "share");
  const workspaceHost = join(root, "host-proj");
  await mkdir(join(accountFilesRoot, "documents", "nested"), { recursive: true });
  await mkdir(join(accountFilesRoot, "output"), { recursive: true });
  await mkdir(shareRoot, { recursive: true });
  await mkdir(join(workspaceHost, "src"), { recursive: true });
  await writeFile(join(accountFilesRoot, "documents", "note.md"), "hello", "utf8");
  await writeFile(join(accountFilesRoot, "documents", "nested", "deep.md"), "deep", "utf8");
  await writeFile(join(accountFilesRoot, "documents", "skip.bin"), "x", "utf8");
  await writeFile(join(workspaceHost, "src", "app.ts"), "export {}", "utf8");
  await writeFile(join(workspaceHost, "README.md"), "# proj", "utf8");
  return {
    accountFilesRoot,
    shareRoot,
    workspaceMounts: [{ id: "proj", hostPath: workspaceHost, mode: "rw" as const }],
  };
}

test("compileBasenameMatcher: glob and substring", () => {
  assert.equal(compileBasenameMatcher("*.md")("note.md"), true);
  assert.equal(compileBasenameMatcher("*.md")("note.txt"), false);
  assert.equal(compileBasenameMatcher("Note")("my-note.md"), true);
  assert.equal(compileBasenameMatcher("xyz")("my-note.md"), false);
});

test("V-OUT-5: list_dir empty path returns synthetic tops + workspace", async () => {
  const ws = await fixture();
  const listed = await listSandboxDir(ws, "");
  assert.equal(listed.path, "");
  assert.ok(listed.roots.includes("documents"));
  assert.ok(listed.roots.includes("workspace"));
  assert.ok(listed.entries.some((e) => e.path === "documents" && e.kind === "dir"));
  assert.ok(listed.entries.some((e) => e.path === "workspace" && e.kind === "dir"));
});

test("V-OUT-5: list_dir one level under documents", async () => {
  const ws = await fixture();
  const listed = await listSandboxDir(ws, "documents");
  assert.equal(listed.path, "documents");
  assert.ok(listed.entries.some((e) => e.name === "note.md" && e.kind === "file"));
  assert.ok(listed.entries.some((e) => e.name === "nested" && e.kind === "dir"));
  assert.ok(!listed.entries.some((e) => e.name === "deep.md"));
});

test("V-OUT-5: list_dir / search refuse share/", async () => {
  const ws = await fixture();
  await assert.rejects(() => listSandboxDir(ws, "share"), PathJailError);
  await assert.rejects(
    () => searchSandboxFiles(ws, { pattern: "*", path: "share" }),
    PathJailError,
  );
});

test("V-OUT-5: search_files glob under documents", async () => {
  const ws = await fixture();
  const found = await searchSandboxFiles(ws, {
    pattern: "*.md",
    path: "documents",
    maxDepth: 4,
  });
  assert.equal(found.pattern, "*.md");
  const paths = found.hits.map((h) => h.path).sort();
  assert.deepEqual(paths, ["documents/nested/deep.md", "documents/note.md"]);
});

test("V-OUT-5: search_files under workspace mount", async () => {
  const ws = await fixture();
  const found = await searchSandboxFiles(ws, {
    pattern: "*.ts",
    path: "workspace",
    maxDepth: 4,
  });
  // Single-mount flat legacy: workspace/src/… (not workspace/<id>/…).
  assert.ok(
    found.hits.some((h) => h.path === "workspace/src/app.ts"),
    `hits=${JSON.stringify(found.hits)}`,
  );
});

test("V-OUT-5: search maxDepth clamped", async () => {
  const ws = await fixture();
  const found = await searchSandboxFiles(ws, {
    pattern: "*.md",
    path: "documents",
    maxDepth: 99,
  });
  // Still finds nested at depth 1; clamp only limits walk, does not error.
  assert.ok(found.hits.length >= 1);
  assert.ok(SEARCH_FILES_MAX_DEPTH >= 4);
});

test("V-OUT-5: unset workspace refuses workspace/ list", async () => {
  const ws = await fixture();
  const noWs = {
    accountFilesRoot: ws.accountFilesRoot,
    shareRoot: ws.shareRoot,
  };
  await assert.rejects(() => listSandboxDir(noWs, "workspace"), /workspace/);
});

test("V-OUT-5: profile A cannot list/search profile B files root", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-browse-iso-"));
  dirs.push(root);
  const aliceFiles = join(root, "alice", "files");
  const bobFiles = join(root, "bob", "files");
  const shareRoot = join(root, "share");
  await mkdir(join(aliceFiles, "documents"), { recursive: true });
  await mkdir(join(bobFiles, "documents"), { recursive: true });
  await mkdir(shareRoot, { recursive: true });
  await writeFile(join(aliceFiles, "documents", "alice-only.md"), "a", "utf8");
  await writeFile(join(bobFiles, "documents", "bob-secret.md"), "b", "utf8");

  const aliceWs = { accountFilesRoot: aliceFiles, shareRoot };
  const aliceList = await listSandboxDir(aliceWs, "documents");
  assert.ok(aliceList.entries.some((e) => e.name === "alice-only.md"));
  assert.ok(!aliceList.entries.some((e) => e.name === "bob-secret.md"));

  const aliceSearch = await searchSandboxFiles(aliceWs, {
    pattern: "bob-secret",
    path: "documents",
  });
  assert.equal(aliceSearch.hits.length, 0);

  // Jail refuses escaping into a sibling account tree via .. traversal.
  await assert.rejects(
    () => listSandboxDir(aliceWs, "../bob/files/documents"),
    /path_jail|escapes|refused|bad_params|not_found/i,
  );
});
