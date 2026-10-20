// Owner-scope home FS browse for workspace picker (Design §4.2.1 / 2026-10-18ag).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import {
  getHomeFsInfo,
  defaultComputerRoot,
  listHomeFsEntries,
  resolveHomeFsDirectory,
} from "../dist/home-fs.js";

test("getHomeFsInfo returns platform, homeDir, roots", () => {
  const info = getHomeFsInfo();
  assert.ok(["darwin", "linux", "win32", "other"].includes(info.platform));
  assert.equal(info.homeDir, join(homedir()));
  assert.ok(info.roots.length >= 1);
  assert.ok(info.pathSep === "/" || info.pathSep === "\\");
  const root = defaultComputerRoot(info);
  assert.ok(root.length > 0);
  if (info.platform === "win32") {
    assert.match(root, /^[A-Za-z]:\\/);
  } else {
    assert.equal(root, "/");
  }
});

test("listHomeFsEntries lists dirs under a temp folder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "envoyhome-homefs-"));
  try {
    await mkdir(join(dir, "photos"));
    await writeFile(join(dir, "skip-me.txt"), "x");
    const listed = listHomeFsEntries({ path: dir, dirsOnly: true });
    assert.equal(listed.path, dir);
    assert.ok(listed.entries.some((e) => e.name === "photos" && e.kind === "dir"));
    assert.ok(!listed.entries.some((e) => e.name === "skip-me.txt"));
    assert.ok(resolveHomeFsDirectory(dir));
    assert.equal(resolveHomeFsDirectory("relative/nope"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
