// Design §9.5d — Chat markdown sandbox href → mesh open (desktop UX wiring).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicApp = join(root, "public", "app.js");
const uiDistApp = join(root, "ui-dist", "app.js");

test("public app.js: sandbox href open uses parseSandboxArtifactHref + openArtifactViewer", async () => {
  const src = await readFile(publicApp, "utf8");
  assert.match(src, /parseSandboxArtifactHref/);
  assert.match(src, /extractSandboxFilePaths/);
  // Markdown link inside chat-md → mesh viewer (not external launch for jail paths).
  assert.match(src, /a\[href\]/);
  assert.match(src, /\.chat-md/);
  assert.match(src, /parseSandboxArtifactHref\(href\)/);
  assert.match(src, /openArtifactViewer/);
  assert.match(src, /data-artifact-path/);
  assert.match(src, /home\.getArtifactContent/);
});

test("ui-dist app.js: sandbox href open wiring survived bundle", async () => {
  let src;
  try {
    src = await readFile(uiDistApp, "utf8");
  } catch {
    // Bundle not built in this checkout — public check above still covers source.
    return;
  }
  // Bundlers may rename imports; keep stable user-facing / RPC markers.
  assert.match(src, /openArtifactViewer|getArtifactContent/);
  assert.match(src, /data-artifact-path/);
  assert.match(src, /a\[href\]/);
  assert.match(src, /\.chat-md/);
});
