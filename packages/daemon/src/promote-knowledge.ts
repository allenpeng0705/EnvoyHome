/**
 * Design §9.5j — promote jail Markdown into knowledge/ + reindex (V-OFFICE-6/7).
 */

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type { HomePaths } from "./home-paths.js";
import {
  resolveSandboxPath,
  safeJoin,
  type WorkspaceMode,
  type WorkspaceMountRef,
} from "./fs-jail.js";
import type { KnowledgeService } from "./knowledge-service.js";
import { canPromoteKnowledgePath } from "./promote-paths.js";

const PROMOTE_MAX_BYTES = 2 * 1024 * 1024;

export type PromoteKnowledgeResult = {
  ok: true;
  sourcePath: string;
  knowledgePath: string;
  bytes: number;
  reindexed?: { sectionCount: number; paths: number };
};

function sanitizeKnowledgeStem(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "note";
}

export async function promoteKnowledgeFile(input: {
  accountId: string;
  paths: HomePaths;
  sourcePath: string;
  overwrite?: boolean;
  destName?: string;
  knowledge?: KnowledgeService | null;
  workspaceRoot?: string | null;
  workspaceMode?: WorkspaceMode | null;
  workspaceMounts?: WorkspaceMountRef[] | null;
}): Promise<PromoteKnowledgeResult> {
  const sourcePath = input.sourcePath.replace(/\\/g, "/").replace(/^\.\/+/, "").trim();
  if (
    !sourcePath ||
    sourcePath.startsWith("/") ||
    sourcePath.includes("..") ||
    sourcePath.includes("\0") ||
    /^[a-zA-Z]:/.test(sourcePath)
  ) {
    throw Object.assign(new Error("envoyhome.bad_params: sourcePath path jail refused"), {
      code: "bad_params",
    });
  }
  const ext = extname(sourcePath).toLowerCase();
  if (ext !== ".md" && ext !== ".markdown") {
    throw Object.assign(
      new Error("envoyhome.bad_params: promote_knowledge requires a .md / .markdown source"),
      { code: "bad_params" },
    );
  }
  // Affordances + tool/RPC must agree (Design §9.5j / V-OFFICE-7).
  if (!canPromoteKnowledgePath(sourcePath)) {
    throw Object.assign(
      new Error(
        "envoyhome.bad_params: promote_knowledge sourcePath must be under uploads/, output/extracts/, documents/, or output/exports/ (or *.extract.md)",
      ),
      { code: "bad_params" },
    );
  }

  const resolved = resolveSandboxPath({
    accountFilesRoot: input.paths.accountFiles(input.accountId),
    shareRoot: input.paths.shareDir,
    path: sourcePath,
    write: false,
    ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
    ...(input.workspaceMode ? { workspaceMode: input.workspaceMode } : {}),
    ...(input.workspaceMounts ? { workspaceMounts: input.workspaceMounts } : {}),
  });
  const raw = await readFile(resolved.absolute);
  if (raw.length === 0) {
    throw Object.assign(new Error("envoyhome.bad_params: empty Markdown refused"), {
      code: "bad_params",
    });
  }
  if (raw.length > PROMOTE_MAX_BYTES) {
    throw Object.assign(
      new Error(`envoyhome.bad_params: Markdown exceeds ${PROMOTE_MAX_BYTES} bytes`),
      { code: "bad_params" },
    );
  }
  // Text-ish sniff — refuse PE/ELF magic even if renamed .md
  if (
    (raw[0] === 0x4d && raw[1] === 0x5a) ||
    (raw[0] === 0x7f && raw[1] === 0x45 && raw[2] === 0x4c && raw[3] === 0x46)
  ) {
    throw Object.assign(new Error("envoyhome.unsafe: binary content refused for knowledge"), {
      code: "unsafe",
    });
  }

  const stem = sanitizeKnowledgeStem(
    input.destName?.replace(/\.(md|markdown)$/i, "") ||
      basename(sourcePath).replace(/\.(md|markdown)$/i, ""),
  );
  const knowledgePath = `knowledge/${stem}.md`;
  const destAbs = safeJoin(input.paths.accountFiles(input.accountId), knowledgePath);
  if (!input.overwrite) {
    const exists = await access(destAbs).then(
      () => true,
      () => false,
    );
    if (exists) {
      throw Object.assign(
        new Error(
          `envoyhome.bad_params: ${knowledgePath} already exists — pass overwrite:true to replace`,
        ),
        { code: "bad_params" },
      );
    }
  }
  await mkdir(dirname(destAbs), { recursive: true });
  const text = raw.toString("utf8");
  await writeFile(destAbs, text.endsWith("\n") ? text : `${text}\n`, "utf8");

  let reindexed: { sectionCount: number; paths: number } | undefined;
  if (input.knowledge) {
    try {
      await input.knowledge.onKnowledgeFileWrite(input.accountId, knowledgePath);
      reindexed = await input.knowledge.reindexKnowledge(input.accountId);
    } catch {
      /* index optional — file still landed */
    }
  }

  return {
    ok: true,
    sourcePath,
    knowledgePath,
    bytes: Buffer.byteLength(text, "utf8"),
    ...(reindexed ? { reindexed } : {}),
  };
}

/** Test helper — knowledge dir under account files. */
export function knowledgeDir(paths: HomePaths, accountId: string): string {
  return join(paths.accountFiles(accountId), "knowledge");
}
