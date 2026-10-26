// Split knowledge Markdown into headed sections with line ranges (Knowledge-RAG §3.3).

import { createHash } from "node:crypto";
import { parseSections, type MdSection } from "./notes.js";

export interface KnowledgeSection {
  sectionId: string;
  path: string;
  heading: string;
  level: number;
  startLine: number;
  endLine: number;
  text: string;
  contentHash: string;
  /** Optional embedding (P3); dim recorded on index meta. */
  embedding?: number[];
  isSummary?: boolean;
  covers?: string[];
}

function headingLevel(heading: string): number {
  const m = /^(#{1,6})\s/.exec(heading);
  return m ? m[1]!.length : 0;
}

function hashText(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 32);
}

/**
 * Parse markdown into KnowledgeSection rows with 1-based line ranges.
 * Oversized bodies (>8000 chars) split on blank lines.
 */
export function splitKnowledgeMarkdown(
  path: string,
  markdown: string,
): KnowledgeSection[] {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const allLines = normalized.split("\n");
  const sections = parseSections(normalized);
  if (sections.length === 0 && normalized.trim() === "") return [];

  const out: KnowledgeSection[] = [];
  let lineCursor = 1;

  for (const sec of sections) {
    const { startLine, endLine, consumed } = locateSection(allLines, sec, lineCursor);
    lineCursor = consumed;
    const body = renderSectionText(sec);
    const chunks =
      body.length > 8000 ? splitOversized(body, startLine, endLine) : [{ text: body, startLine, endLine }];

    for (const chunk of chunks) {
      const contentHash = hashText(`${path}\0${sec.heading}\0${chunk.text}`);
      const sectionId = `${path}#${contentHash.slice(0, 12)}`;
      out.push({
        sectionId,
        path,
        heading: sec.heading.replace(/^#+\s*/, "").trim(),
        level: headingLevel(sec.heading),
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        text: chunk.text,
        contentHash,
      });
    }
  }
  return out;
}

function renderSectionText(sec: MdSection): string {
  if (!sec.heading) return sec.lines.join("\n").trimEnd();
  if (sec.lines.length === 0) return sec.heading;
  return [sec.heading, ...sec.lines].join("\n").trimEnd();
}

function locateSection(
  allLines: string[],
  sec: MdSection,
  fromLine: number,
): { startLine: number; endLine: number; consumed: number } {
  if (sec.heading) {
    for (let i = fromLine - 1; i < allLines.length; i++) {
      if (allLines[i] === sec.heading) {
        const startLine = i + 1;
        const endLine = startLine + sec.lines.length;
        return { startLine, endLine: Math.max(startLine, endLine), consumed: endLine + 1 };
      }
    }
  }
  // Preamble: lines before first heading
  const startLine = fromLine;
  const endLine = startLine + Math.max(sec.lines.length - 1, 0);
  return {
    startLine,
    endLine: Math.max(startLine, endLine),
    consumed: endLine + 1,
  };
}

function splitOversized(
  text: string,
  startLine: number,
  endLine: number,
): Array<{ text: string; startLine: number; endLine: number }> {
  const parts = text.split(/\n\n+/);
  const chunks: Array<{ text: string; startLine: number; endLine: number }> = [];
  let buf = "";
  let chunkStart = startLine;
  let linesUsed = 0;
  for (const part of parts) {
    const next = buf ? `${buf}\n\n${part}` : part;
    if (next.length > 8000 && buf) {
      const lineCount = buf.split("\n").length;
      chunks.push({
        text: buf,
        startLine: chunkStart,
        endLine: Math.min(endLine, chunkStart + lineCount - 1),
      });
      linesUsed += lineCount;
      chunkStart = startLine + linesUsed;
      buf = part;
    } else {
      buf = next;
    }
  }
  if (buf) {
    chunks.push({
      text: buf,
      startLine: chunkStart,
      endLine,
    });
  }
  return chunks.length > 0 ? chunks : [{ text, startLine, endLine }];
}

/** Build a short _index.md blurb map from sections (one line per path). */
export function buildKnowledgeIndexMd(sections: KnowledgeSection[]): string {
  const byPath = new Map<string, KnowledgeSection>();
  for (const s of sections) {
    if (!byPath.has(s.path)) byPath.set(s.path, s);
  }
  const lines = ["# Knowledge index", ""];
  for (const [path, s] of [...byPath.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (path.endsWith("/_index.md") || path === "knowledge/_index.md") continue;
    const title = s.heading || path.replace(/^knowledge\//, "");
    const blurb = s.text
      .replace(/^#+\s+.+\n?/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    lines.push(`- \`${path}\` — **${title}**: ${blurb || "(empty)"}`);
  }
  lines.push("");
  return lines.join("\n");
}
