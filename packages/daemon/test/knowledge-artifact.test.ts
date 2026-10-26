// V-KB-7 — knowledge_search citation path opens via home.getArtifactContent.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ArtifactService } from "../dist/artifacts.js";
import { homePaths } from "../dist/home-paths.js";
import { KnowledgeIndex } from "@envoyhome/memory";

test("V-KB-7: knowledge citation path resolves via getArtifactContent", async () => {
  const root = await mkdtemp(join(tmpdir(), "kb-art-"));
  const paths = homePaths(root);
  const accountId = "alice";
  const knowledge = join(paths.accountFiles(accountId), "knowledge");
  await mkdir(knowledge, { recursive: true });
  const body = "# Handbook\n\nQuiet hours start at 22:00. Token: kb-chip-22\n";
  await writeFile(join(knowledge, "handbook.md"), body, "utf8");

  const idx = new KnowledgeIndex((id) => paths.accountRoot(id));
  await idx.reindex(accountId, knowledge);
  const { hits } = await idx.search(accountId, "quiet hours");
  assert.ok(hits.length >= 1);
  const citePath = hits[0]!.path;
  assert.match(citePath, /^knowledge\//);

  const artifacts = new ArtifactService(paths);
  const content = await artifacts.getContent(accountId, citePath);
  assert.equal(content.encoding, "utf8");
  assert.ok(content.text?.includes("kb-chip-22"));
  assert.ok((content.bytes ?? 0) > 0);

  await rm(root, { recursive: true, force: true });
});
