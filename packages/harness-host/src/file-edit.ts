// Design §19.9 / V-P2-EDIT — surgical edit + unified-diff apply (path jail via SandboxFs).

/** Soft caps so a model cannot hang the host on huge patches/files. */
export const MAX_EDIT_FILE_CHARS = 2_000_000;
export const MAX_PATCH_CHARS = 256_000;

export type EditFileArgs = {
  path: string;
  /** Exact substring to replace — must occur exactly once when set. */
  oldString?: string;
  newString?: string;
  /** 1-based inclusive line range (alternative to oldString). */
  startLine?: number;
  endLine?: number;
};

export type EditFileResult =
  | { ok: true; content: string; detail: string }
  | { ok: false; reason: string };

/**
 * Apply a surgical edit in memory. Caller writes via SandboxFs (jail).
 */
export function applyEditFile(existing: string, args: EditFileArgs): EditFileResult {
  if (existing.length > MAX_EDIT_FILE_CHARS) {
    return { ok: false, reason: "envoyhome.bad_params: file too large to edit" };
  }
  const newString = typeof args.newString === "string" ? args.newString : "";
  if (typeof args.oldString === "string") {
    const old = args.oldString;
    if (!old) return { ok: false, reason: "envoyhome.bad_params: oldString must be non-empty" };
    const first = existing.indexOf(old);
    if (first < 0) {
      return { ok: false, reason: "envoyhome.bad_params: oldString not found" };
    }
    const second = existing.indexOf(old, first + old.length);
    if (second >= 0) {
      return {
        ok: false,
        reason: "envoyhome.bad_params: oldString matches more than once — refuse",
      };
    }
    const content = existing.slice(0, first) + newString + existing.slice(first + old.length);
    return { ok: true, content, detail: "replaced unique oldString" };
  }
  const start = args.startLine;
  const end = args.endLine ?? start;
  if (typeof start === "number" && Number.isInteger(start) && start >= 1) {
    if (typeof end !== "number" || !Number.isInteger(end) || end < start) {
      return { ok: false, reason: "envoyhome.bad_params: invalid line range" };
    }
    const lines = existing.split("\n");
    // Preserve trailing newline semantics: split keeps final empty if file ends with \n
    if (end > lines.length) {
      return {
        ok: false,
        reason: `envoyhome.bad_params: endLine ${end} past file (${lines.length} lines)`,
      };
    }
    const before = lines.slice(0, start - 1);
    const after = lines.slice(end);
    const insert = newString === "" ? [] : newString.split("\n");
    const content = [...before, ...insert, ...after].join("\n");
    return {
      ok: true,
      content,
      detail: `replaced lines ${start}-${end}`,
    };
  }
  return {
    ok: false,
    reason: "envoyhome.bad_params: edit_file needs oldString or startLine",
  };
}

export type ApplyPatchArgs = {
  /** Preferred path when the patch omits ---/+++ headers. */
  path?: string;
  patch: string;
};

export type ApplyPatchResult =
  | { ok: true; path: string; content: string; detail: string }
  | { ok: false; reason: string };

type Hunk = {
  oldStart: number;
  oldCount: number;
  lines: Array<{ tag: " " | "-" | "+"; text: string }>;
};

/**
 * Apply a single-file unified diff. Paths in ---/+++ must not escape (no .. / abs).
 * Multi-file patches are refused.
 */
export function applyUnifiedPatch(
  existingByPath: (relPath: string) => string | undefined,
  args: ApplyPatchArgs,
): ApplyPatchResult {
  const raw = args.patch;
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, reason: "envoyhome.bad_params: patch required" };
  }
  if (raw.length > MAX_PATCH_CHARS) {
    return { ok: false, reason: "envoyhome.bad_params: patch too large" };
  }

  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let patchPath: string | undefined =
    typeof args.path === "string" && args.path.trim() ? args.path.trim() : undefined;
  const hunks: Hunk[] = [];
  let i = 0;
  let sawFileHeader = false;

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("--- ")) {
      const p = stripDiffPath(line.slice(4));
      if (!p.ok) return { ok: false, reason: p.reason };
      if (sawFileHeader && p.path !== patchPath) {
        return { ok: false, reason: "envoyhome.bad_params: multi-file patch refused" };
      }
      patchPath = p.path;
      sawFileHeader = true;
      i += 1;
      if (i < lines.length && lines[i]!.startsWith("+++ ")) {
        const p2 = stripDiffPath(lines[i]!.slice(4));
        if (!p2.ok) return { ok: false, reason: p2.reason };
        if (p2.path !== "/dev/null" && p2.path !== patchPath) {
          // Prefer +++ path when --- was /dev/null (create) or a/ vs b/
          patchPath = p2.path === "/dev/null" ? patchPath : p2.path;
        }
        i += 1;
      }
      continue;
    }
    if (line.startsWith("+++ ")) {
      const p = stripDiffPath(line.slice(4));
      if (!p.ok) return { ok: false, reason: p.reason };
      if (!patchPath) patchPath = p.path;
      else if (p.path !== "/dev/null" && p.path !== patchPath) {
        return { ok: false, reason: "envoyhome.bad_params: multi-file patch refused" };
      }
      sawFileHeader = true;
      i += 1;
      continue;
    }
    const hunkMatch = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s@@/.exec(line);
    if (hunkMatch) {
      const oldStart = parseInt(hunkMatch[1]!, 10);
      const oldCount = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      const hunkLines: Hunk["lines"] = [];
      i += 1;
      while (i < lines.length) {
        const hl = lines[i]!;
        if (hl.startsWith("@@ ") || hl.startsWith("--- ") || hl.startsWith("diff ")) break;
        if (hl.startsWith("\\")) {
          i += 1;
          continue; // "\ No newline at end of file"
        }
        const tag = hl[0];
        if (tag === " " || tag === "-" || tag === "+") {
          hunkLines.push({ tag, text: hl.slice(1) });
          i += 1;
          continue;
        }
        if (hl === "" && i === lines.length - 1) {
          i += 1;
          break;
        }
        // Unknown line — stop hunk
        break;
      }
      hunks.push({ oldStart, oldCount, lines: hunkLines });
      continue;
    }
    i += 1;
  }

  if (!patchPath) {
    return { ok: false, reason: "envoyhome.bad_params: patch needs path or ---/+++ header" };
  }
  if (hunks.length === 0) {
    return { ok: false, reason: "envoyhome.bad_params: patch has no hunks" };
  }

  const existing = existingByPath(patchPath);
  if (existing === undefined) {
    // Allow create only when first hunk starts at 1 with only additions? Fail closed for v1.
    return {
      ok: false,
      reason: `envoyhome.bad_params: file not found for patch: ${patchPath}`,
    };
  }
  if (existing.length > MAX_EDIT_FILE_CHARS) {
    return { ok: false, reason: "envoyhome.bad_params: file too large to patch" };
  }

  const fileLines = existing.split("\n");
  // Apply hunks from bottom to top so line numbers stay valid.
  const ordered = [...hunks].sort((a, b) => b.oldStart - a.oldStart);
  let working = fileLines;
  for (const hunk of ordered) {
    const applied = applyOneHunk(working, hunk);
    if (!applied.ok) return { ok: false, reason: applied.reason };
    working = applied.lines;
  }
  return {
    ok: true,
    path: patchPath,
    content: working.join("\n"),
    detail: `applied ${hunks.length} hunk(s)`,
  };
}

function stripDiffPath(
  raw: string,
): { ok: true; path: string } | { ok: false; reason: string } {
  let s = raw.trim();
  // Drop trailing tab + timestamp from `diff -u`
  const tab = s.indexOf("\t");
  if (tab >= 0) s = s.slice(0, tab).trim();
  if (s === "/dev/null") return { ok: true, path: "/dev/null" };
  if (s.startsWith("a/") || s.startsWith("b/")) s = s.slice(2);
  if (!s || s.startsWith("/") || s.includes("..") || s.includes("\0")) {
    return { ok: false, reason: "envoyhome.bad_params: unsafe path in patch" };
  }
  return { ok: true, path: s };
}

function applyOneHunk(
  fileLines: string[],
  hunk: Hunk,
): { ok: true; lines: string[] } | { ok: false; reason: string } {
  const start = hunk.oldStart - 1; // 0-based
  if (start < 0 || start > fileLines.length) {
    return { ok: false, reason: "envoyhome.bad_params: hunk out of range" };
  }
  let oldIdx = start;
  const outBefore = fileLines.slice(0, start);
  const outMid: string[] = [];
  let oldConsumed = 0;
  for (const row of hunk.lines) {
    if (row.tag === " " || row.tag === "-") {
      if (oldIdx >= fileLines.length || fileLines[oldIdx] !== row.text) {
        return {
          ok: false,
          reason: `envoyhome.bad_params: hunk context mismatch at line ${oldIdx + 1}`,
        };
      }
      if (row.tag === " ") outMid.push(fileLines[oldIdx]!);
      oldIdx += 1;
      oldConsumed += 1;
    } else if (row.tag === "+") {
      outMid.push(row.text);
    }
  }
  if (hunk.oldCount > 0 && oldConsumed !== hunk.oldCount) {
    // Tolerant: some diffs omit exact count; only enforce when count was explicit and we under-consumed badly
    if (oldConsumed < hunk.oldCount && oldIdx < start + hunk.oldCount) {
      // Try to require exact — fail if we didn't consume expected old lines
      return {
        ok: false,
        reason: `envoyhome.bad_params: hunk old count mismatch (got ${oldConsumed}, want ${hunk.oldCount})`,
      };
    }
  }
  const outAfter = fileLines.slice(oldIdx);
  return { ok: true, lines: [...outBefore, ...outMid, ...outAfter] };
}
