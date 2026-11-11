// Design §9.5d — thin-client path chips + markdown href open (desktop).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractSandboxFilePaths,
  parseSandboxArtifactHref,
} from "../public/sandbox-paths.js";

test("extracts backtick and bare sandbox paths", () => {
  const text =
    "Saved as `output/exports/report-1.docx` and also output/extracts/note.md";
  assert.deepEqual(extractSandboxFilePaths(text), [
    "output/exports/report-1.docx",
    "output/extracts/note.md",
  ]);
});

test("extracts workspace paths and unicode backtick names", () => {
  const text =
    "Host copy at `workspace/Desktop/季度报告.docx` and workspace/notes/a.md";
  assert.deepEqual(extractSandboxFilePaths(text), [
    "workspace/Desktop/季度报告.docx",
    "workspace/notes/a.md",
  ]);
});

test("dedupes and rejects traversal", () => {
  const text =
    "See `output/a.pdf` again output/a.pdf and `output/../secret.txt`";
  assert.deepEqual(extractSandboxFilePaths(text), ["output/a.pdf"]);
});

test("ignores non-sandbox paths", () => {
  assert.deepEqual(extractSandboxFilePaths("https://example.com/a.pdf"), []);
  assert.deepEqual(extractSandboxFilePaths("tmp/foo.docx"), []);
  assert.deepEqual(extractSandboxFilePaths("share/household/a.md"), []);
});

test("normalizes ./ and slash collapse in backticks", () => {
  assert.deepEqual(extractSandboxFilePaths("Wrote `./documents//note.md`"), [
    "documents/note.md",
  ]);
});

test("parseSandboxArtifactHref accepts sandbox markdown links", () => {
  assert.equal(
    parseSandboxArtifactHref("output/exports/report.docx"),
    "output/exports/report.docx",
  );
  assert.equal(parseSandboxArtifactHref("./documents/note.md"), "documents/note.md");
  assert.equal(
    parseSandboxArtifactHref("output%2Fexports%2Fhi.docx"),
    "output/exports/hi.docx",
  );
  assert.equal(
    parseSandboxArtifactHref("envoyhome://artifact/uploads/a.pdf"),
    "uploads/a.pdf",
  );
  assert.equal(
    parseSandboxArtifactHref("artifact://knowledge/clip.md"),
    "knowledge/clip.md",
  );
  assert.equal(
    parseSandboxArtifactHref("EnvoyHome://artifact/documents/web-clip.md"),
    "documents/web-clip.md",
  );
});

test("parseSandboxArtifactHref rejects http and traversal", () => {
  assert.equal(parseSandboxArtifactHref("https://example.com/a.pdf"), null);
  assert.equal(parseSandboxArtifactHref("http://127.0.0.1/artifacts/x"), null);
  assert.equal(parseSandboxArtifactHref("mailto:a@b.c"), null);
  assert.equal(parseSandboxArtifactHref("tel:+1"), null);
  assert.equal(parseSandboxArtifactHref("output/../secret.txt"), null);
  assert.equal(parseSandboxArtifactHref("tmp/foo.docx"), null);
  assert.equal(parseSandboxArtifactHref("share/x.md"), null);
  assert.equal(parseSandboxArtifactHref(""), null);
  assert.equal(parseSandboxArtifactHref(null), null);
  assert.equal(parseSandboxArtifactHref(undefined), null);
});

test("chat chip filter excludes spill artifactPath", () => {
  const spill = "output/replies/turn-1.md";
  const text = `Summary.\n\nExported docx: \`output/exports/memo.docx\`\nAlso see \`${spill}\``;
  const mentioned = extractSandboxFilePaths(text).filter((p) => p !== spill);
  assert.deepEqual(mentioned, ["output/exports/memo.docx"]);
});
