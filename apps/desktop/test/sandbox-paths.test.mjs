// Design §9.5d — thin-client path chips (desktop).

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSandboxFilePaths } from "../public/sandbox-paths.js";

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
});
