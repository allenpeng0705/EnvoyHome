// Doc KB (L6) derived index — Knowledge-RAG Design §3.
// Persistence: JSON under memory-backend/knowledge-index/ (pure-JS; rebuildable).

import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { atomicWriteFile } from "./atomic-write.js";
import { recallOverCorpus, type RecallEngine } from "./recall-fts.js";
import {
  buildKnowledgeIndexMd,
  splitKnowledgeMarkdown,
  type KnowledgeSection,
} from "./knowledge-sections.js";
import { withAccountLock } from "./writer-lock.js";

/** Soft cap on indexed Doc KB sections per account (Knowledge-RAG §7 Caps). */
export const DEFAULT_KNOWLEDGE_SECTION_CAP = 2000;

export type KnowledgeEngine = RecallEngine | "vec" | "hybrid";

export interface KnowledgeHit {
  path: string;
  heading: string;
  startLine: number;
  endLine: number;
  snippet: string;
  score: number;
  engine: KnowledgeEngine;
  sectionId: string;
}

interface IndexMeta {
  version: 1;
  sectionCount: number;
  lastReindexAt: string | null;
  embedModelId: string | null;
  embedDim: number | null;
  embedStale: boolean;
}

interface IndexFile {
  meta: IndexMeta;
  sections: KnowledgeSection[];
}

function indexDir(accountRoot: string): string {
  return join(accountRoot, "memory-backend", "knowledge-index");
}

function indexJsonPath(accountRoot: string): string {
  return join(indexDir(accountRoot), "index.json");
}

function emptyMeta(): IndexMeta {
  return {
    version: 1,
    sectionCount: 0,
    lastReindexAt: null,
    embedModelId: null,
    embedDim: null,
    embedStale: false,
  };
}

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export class KnowledgeIndex {
  constructor(private readonly accountRoot: (accountId: string) => string) {}

  async ensure(accountId: string): Promise<void> {
    await mkdir(indexDir(this.accountRoot(accountId)), { recursive: true });
  }

  async status(accountId: string): Promise<{
    sectionCount: number;
    lastReindexAt: string | null;
    embedModelId: string | null;
    embedDim: number | null;
    embedStale: boolean;
    indexPath: string;
  }> {
    const data = await this.load(accountId);
    return {
      sectionCount: data.meta.sectionCount,
      lastReindexAt: data.meta.lastReindexAt,
      embedModelId: data.meta.embedModelId,
      embedDim: data.meta.embedDim,
      embedStale: data.meta.embedStale,
      indexPath: `memory-backend/knowledge-index/index.json`,
    };
  }

  /**
   * Walk accounts/<id>/files/knowledge/ recursively for .md (skip raw/).
   * knowledgeFilesRoot = absolute path to files/knowledge.
   */
  async reindex(
    accountId: string,
    knowledgeFilesRoot: string,
    opts?: { embed?: EmbedFn; embedModelId?: string; sectionCap?: number },
  ): Promise<{ sectionCount: number; paths: number }> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      await this.ensure(accountId);
      const mdFiles = await listMarkdownFiles(knowledgeFilesRoot);
      let sections: KnowledgeSection[] = [];
      for (const abs of mdFiles) {
        const relFromKnowledge = relative(knowledgeFilesRoot, abs).split(sep).join("/");
        if (relFromKnowledge.split("/").includes("raw")) continue;
        const virtualPath = `knowledge/${relFromKnowledge}`;
        let text: string;
        try {
          text = await readFile(abs, "utf8");
        } catch {
          continue;
        }
        sections.push(...splitKnowledgeMarkdown(virtualPath, text));
      }

      // Soft section cap — prefer non-archive paths, then stable path order.
      const sectionCap = opts?.sectionCap ?? DEFAULT_KNOWLEDGE_SECTION_CAP;
      if (sections.length > sectionCap) {
        sections = [
          ...sections.filter((s) => !s.path.includes("/archive/")),
          ...sections.filter((s) => s.path.includes("/archive/")),
        ].slice(0, sectionCap);
      }

      let embedModelId: string | null = null;
      let embedDim: number | null = null;
      if (opts?.embed && sections.length > 0) {
        try {
          const vectors = await opts.embed(sections.map((s) => s.text.slice(0, 4000)));
          for (let i = 0; i < sections.length; i++) {
            const v = vectors[i];
            if (v && v.length > 0) {
              sections[i]!.embedding = v;
              embedDim = v.length;
            }
          }
          embedModelId = opts.embedModelId ?? "local";
        } catch {
          // Soft-fail: keep FTS-only
        }
      }

      const meta: IndexMeta = {
        version: 1,
        sectionCount: sections.length,
        lastReindexAt: new Date().toISOString(),
        embedModelId,
        embedDim,
        embedStale: false,
      };
      await this.save(accountId, { meta, sections });

      // Wiki map (§3.4): generate only when missing — never clobber user-edited _index.md
      try {
        const indexPath = join(knowledgeFilesRoot, "_index.md");
        let exists = false;
        try {
          await access(indexPath);
          exists = true;
        } catch {
          exists = false;
        }
        if (!exists) {
          const indexMd = buildKnowledgeIndexMd(sections);
          await mkdir(knowledgeFilesRoot, { recursive: true });
          await writeFile(indexPath, indexMd, "utf8");
        }
      } catch {
        // non-fatal
      }

      return { sectionCount: sections.length, paths: mdFiles.length };
    });
  }

  /** Invalidate/reindex a single virtual path after write (knowledge/…). */
  async upsertPath(
    accountId: string,
    knowledgeFilesRoot: string,
    virtualPath: string,
    opts?: { embed?: EmbedFn; embedModelId?: string; sectionCap?: number },
  ): Promise<void> {
    if (!virtualPath.startsWith("knowledge/") || !virtualPath.endsWith(".md")) return;
    if (virtualPath.includes("/raw/")) return;
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const rel = virtualPath.slice("knowledge/".length);
      const abs = join(knowledgeFilesRoot, rel);
      const data = await this.load(accountId);
      data.sections = data.sections.filter((s) => s.path !== virtualPath);
      try {
        const text = await readFile(abs, "utf8");
        const fresh = splitKnowledgeMarkdown(virtualPath, text);
        if (opts?.embed && fresh.length > 0) {
          try {
            const vectors = await opts.embed(fresh.map((s) => s.text.slice(0, 4000)));
            for (let i = 0; i < fresh.length; i++) {
              const v = vectors[i];
              if (v && v.length > 0) fresh[i]!.embedding = v;
            }
            if (vectors[0]?.length) {
              data.meta.embedDim = vectors[0].length;
              data.meta.embedModelId = opts.embedModelId ?? data.meta.embedModelId;
            }
          } catch {
            /* FTS only */
          }
        }
        data.sections.push(...fresh);
        const sectionCap = opts?.sectionCap ?? DEFAULT_KNOWLEDGE_SECTION_CAP;
        if (data.sections.length > sectionCap) {
          data.sections = [
            ...data.sections.filter((s) => !s.path.includes("/archive/")),
            ...data.sections.filter((s) => s.path.includes("/archive/")),
          ].slice(0, sectionCap);
        }
      } catch {
        // deleted
      }
      data.meta.sectionCount = data.sections.length;
      data.meta.lastReindexAt = new Date().toISOString();
      await this.save(accountId, data);
    });
  }

  markEmbedStale(accountId: string): Promise<void> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const data = await this.load(accountId);
      data.meta.embedStale = true;
      await this.save(accountId, data);
    });
  }

  async search(
    accountId: string,
    query: string,
    opts?: { limit?: number },
  ): Promise<{ hits: KnowledgeHit[] }> {
    const limit = opts?.limit ?? 8;
    const data = await this.load(accountId);
    const ftsHits = recallOverCorpus(
      data.sections.map((s) => ({
        path: `${s.path}\t${s.sectionId}\t${s.heading}\t${s.startLine}\t${s.endLine}`,
        content: `${s.heading}\n${s.text}`,
      })),
      query,
      { limit },
    );

    const mappedFts: KnowledgeHit[] = ftsHits.map((h) => {
      const [path, sectionId, heading, start, end] = h.path.split("\t");
      return {
        path: path ?? h.path,
        heading: heading ?? "",
        startLine: Number(start) || h.startLine,
        endLine: Number(end) || h.endLine,
        snippet: h.snippet,
        score: h.score,
        engine: h.engine,
        sectionId: sectionId ?? "",
      };
    });

    return { hits: mappedFts.slice(0, limit) };
  }

  /**
   * Hybrid FTS ∪ vector (P3). queryEmbedding optional — without it, FTS only.
   */
  async searchHybrid(
    accountId: string,
    query: string,
    opts?: { limit?: number; queryEmbedding?: number[] },
  ): Promise<{ hits: KnowledgeHit[] }> {
    const limit = opts?.limit ?? 8;
    const { hits: ftsHits } = await this.search(accountId, query, { limit: limit * 2 });
    const data = await this.load(accountId);
    // V-EMB-6: stale vectors must not fuse with a new query embedding space.
    const qv = data.meta.embedStale ? undefined : opts?.queryEmbedding;
    if (!qv || qv.length === 0) {
      return { hits: ftsHits.slice(0, limit) };
    }

    const vecScored: KnowledgeHit[] = [];
    for (const s of data.sections) {
      if (!s.embedding || s.embedding.length !== qv.length) continue;
      const score = cosine(qv, s.embedding);
      if (score < 0.15) continue;
      vecScored.push({
        path: s.path,
        heading: s.heading,
        startLine: s.startLine,
        endLine: s.endLine,
        snippet: s.text.slice(0, 400),
        score,
        engine: "vec",
        sectionId: s.sectionId,
      });
    }
    vecScored.sort((a, b) => b.score - a.score);

    return { hits: rrfMerge(ftsHits, vecScored.slice(0, limit * 2), limit) };
  }

  /** Drop derived index only — never deletes knowledge/ files (V-KB-1). */
  async deleteIndex(accountId: string): Promise<void> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      await rm(indexDir(this.accountRoot(accountId)), { recursive: true, force: true });
    });
  }

  private async load(accountId: string): Promise<IndexFile> {
    try {
      const raw = await readFile(indexJsonPath(this.accountRoot(accountId)), "utf8");
      const parsed = JSON.parse(raw) as IndexFile;
      return {
        meta: { ...emptyMeta(), ...parsed.meta },
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      };
    } catch {
      return { meta: emptyMeta(), sections: [] };
    }
  }

  private async save(accountId: string, data: IndexFile): Promise<void> {
    await this.ensure(accountId);
    data.meta.sectionCount = data.sections.length;
    await atomicWriteFile(
      indexJsonPath(this.accountRoot(accountId)),
      JSON.stringify(data) + "\n",
    );
  }
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "raw") continue;
        await walk(abs);
      } else if (e.isFile() && e.name.endsWith(".md")) {
        out.push(abs);
      }
    }
  }
  try {
    const st = await stat(root);
    if (!st.isDirectory()) return out;
  } catch {
    return out;
  }
  await walk(root);
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Reciprocal rank fusion. */
function rrfMerge(fts: KnowledgeHit[], vec: KnowledgeHit[], limit: number): KnowledgeHit[] {
  const k = 60;
  const scores = new Map<string, { hit: KnowledgeHit; score: number }>();
  fts.forEach((h, i) => {
    const key = h.sectionId || `${h.path}:${h.startLine}`;
    const prev = scores.get(key);
    const add = 1 / (k + i + 1);
    if (prev) {
      prev.score += add;
      prev.hit = { ...prev.hit, engine: "hybrid", score: prev.score };
    } else {
      scores.set(key, { hit: { ...h, engine: "hybrid", score: add }, score: add });
    }
  });
  vec.forEach((h, i) => {
    const key = h.sectionId || `${h.path}:${h.startLine}`;
    const prev = scores.get(key);
    const add = 1 / (k + i + 1);
    if (prev) {
      prev.score += add;
      prev.hit = { ...h, ...prev.hit, engine: "hybrid", score: prev.score, snippet: prev.hit.snippet || h.snippet };
    } else {
      scores.set(key, { hit: { ...h, engine: "hybrid", score: add }, score: add });
    }
  });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ ...x.hit, score: x.score }));
}

export function knowledgeContentHash(path: string, text: string): string {
  return createHash("sha256").update(`${path}\0${text}`, "utf8").digest("hex").slice(0, 32);
}
