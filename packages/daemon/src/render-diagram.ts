/**
 * Mermaid (closed subset) → PNG (Design §9.5k / P2-P).
 * Local SVG→PNG via @speajus/mermaid-to-svg + @resvg/resvg-js — no Chromium.
 */

import { randomBytes } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import { cleanup, renderMermaid } from "@speajus/mermaid-to-svg";

export const DIAGRAM_DIR = "output/diagrams";
export const DIAGRAM_TIMEOUT_MS = 30_000;
export const DIAGRAM_MAX_SOURCE_BYTES = 8 * 1024;
export const DIAGRAM_MAX_PNG_BYTES = 2 * 1024 * 1024;
export const DIAGRAM_MAX_WIDTH_PX = 1600;
export const DIAGRAM_MIN_WIDTH_PX = 640;

/** Closed Mermaid diagram kinds (Design §9.5k). */
export const DIAGRAM_KINDS = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "pie",
  "mindmap",
] as const;

export type DiagramKind = (typeof DIAGRAM_KINDS)[number];

const KIND_START_RE =
  /^(flowchart|graph|sequenceDiagram|pie|mindmap)\b/i;

const REFUSE_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /%%\s*\{\s*init/i, why: "init directive refused" },
  // Mermaid interactions are statement-leading (`click A …`, `call cb()`).
  // Do NOT use free `\bclick`/`\bcall` — that refused labels like `A[call API]`
  // and sequence messages like `Alice->>Bob: call home`.
  { re: /^\s*click\s+\S+/im, why: "click interactions refused" },
  { re: /^\s*click\s+\S+\s+call\b/im, why: "call interactions refused" },
  { re: /^\s*call\s+\w+\s*\(/im, why: "call interactions refused" },
  { re: /javascript\s*:/i, why: "javascript: URLs refused" },
  { re: /<script\b/i, why: "script tags refused" },
  { re: /\bon\w+\s*=/i, why: "inline event handlers refused" },
];

export function defaultDiagramUri(stem?: string): string {
  const s =
    (stem ?? "diagram")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "diagram";
  return `${DIAGRAM_DIR}/${s}-${randomBytes(3).toString("hex")}.png`;
}

export function assertDiagramOutputPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (
    !normalized.startsWith(`${DIAGRAM_DIR}/`) ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    throw new Error(
      `envoyhome.bad_params: path must be under ${DIAGRAM_DIR}/`,
    );
  }
  if (!normalized.toLowerCase().endsWith(".png")) {
    throw new Error("envoyhome.bad_params: diagram path must end with .png");
  }
  return normalized;
}

/** Strip fences / leading blanks; detect kind. */
export function normalizeMermaidSource(raw: string): {
  source: string;
  kind: DiagramKind;
} {
  let text = raw.replace(/\r\n/g, "\n").trim();
  const fence = /^```(?:mermaid)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fence) text = (fence[1] ?? "").trim();
  // Drop pure comment / blank lead-in lines
  const lines = text.split("\n");
  while (lines.length && (/^\s*$/.test(lines[0]!) || /^\s*%%/.test(lines[0]!))) {
    // Keep %% comments that aren't init — but init already refused later.
    if (/^\s*%%/.test(lines[0]!) && !/%%\s*\{\s*init/i.test(lines[0]!)) {
      lines.shift();
      continue;
    }
    if (/^\s*$/.test(lines[0]!)) {
      lines.shift();
      continue;
    }
    break;
  }
  text = lines.join("\n").trim();
  if (!text) {
    throw new Error("envoyhome.bad_params: empty mermaid source");
  }
  const m = KIND_START_RE.exec(text);
  if (!m) {
    throw new Error(
      `envoyhome.bad_params: mermaid must start with one of ${DIAGRAM_KINDS.join(", ")}`,
    );
  }
  const kindRaw = m[1]!.toLowerCase();
  const kind = (
    kindRaw === "sequencediagram"
      ? "sequenceDiagram"
      : kindRaw === "flowchart"
        ? "flowchart"
        : kindRaw === "graph"
          ? "graph"
          : kindRaw === "pie"
            ? "pie"
            : "mindmap"
  ) as DiagramKind;
  return { source: text, kind };
}

/** Fail-closed validation before render (V-OFFICE-30). */
export function assertSafeMermaidSource(raw: string): {
  source: string;
  kind: DiagramKind;
} {
  if (Buffer.byteLength(raw, "utf8") > DIAGRAM_MAX_SOURCE_BYTES) {
    throw new Error(
      `envoyhome.bad_params: mermaid source exceeds ${DIAGRAM_MAX_SOURCE_BYTES} bytes`,
    );
  }
  for (const p of REFUSE_PATTERNS) {
    if (p.re.test(raw)) {
      throw new Error(`envoyhome.bad_params: ${p.why}`);
    }
  }
  const normalized = normalizeMermaidSource(raw);
  // Rough complexity: refuse absurd arrow/node spam
  const arrows = (normalized.source.match(/-->|---|==>|->>|-->>/g) ?? []).length;
  if (arrows > 80) {
    throw new Error("envoyhome.bad_params: diagram too complex (edge cap)");
  }
  const lines = normalized.source.split("\n").filter((l) => l.trim()).length;
  if (lines > 120) {
    throw new Error("envoyhome.bad_params: diagram too complex (line cap)");
  }
  return normalized;
}

export interface RenderDiagramResult {
  png: Buffer;
  kind: DiagramKind;
  width: number;
  height: number;
}

/**
 * Render closed Mermaid → PNG. Throws fail-closed on parse/render errors.
 */
export async function renderDiagramPng(
  mermaidSource: string,
  opts?: { theme?: "default" | "dark"; width?: number },
): Promise<RenderDiagramResult> {
  const { source, kind } = assertSafeMermaidSource(mermaidSource);
  let svg: string;
  let bounds: { width: number; height: number } | undefined;
  try {
    try {
      const rendered = await renderMermaid(source, {
        theme: opts?.theme === "dark" ? "dark" : "default",
      });
      svg = rendered.svg;
      bounds = rendered.bounds;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`envoyhome.diagram_render_failed: ${msg.slice(0, 200)}`);
    }
    if (!svg || !svg.includes("<svg")) {
      throw new Error("envoyhome.diagram_render_failed: empty SVG");
    }
    const targetW = Math.min(
      DIAGRAM_MAX_WIDTH_PX,
      Math.max(
        DIAGRAM_MIN_WIDTH_PX,
        opts?.width ?? Math.ceil((bounds?.width ?? 400) * 2),
      ),
    );
    let png: Buffer;
    try {
      const resvg = new Resvg(svg, {
        fitTo: { mode: "width", value: targetW },
        font: { loadSystemFonts: true },
        background:
          opts?.theme === "dark" ? "rgb(26,26,46)" : "rgb(255,255,255)",
      });
      png = Buffer.from(resvg.render().asPng());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`envoyhome.diagram_raster_failed: ${msg.slice(0, 200)}`);
    }
    if (png.length < 32 || png[0] !== 0x89 || png[1] !== 0x50) {
      throw new Error("envoyhome.diagram_raster_failed: invalid PNG");
    }
    if (png.length > DIAGRAM_MAX_PNG_BYTES) {
      throw new Error(
        `envoyhome.diagram_raster_failed: PNG exceeds ${DIAGRAM_MAX_PNG_BYTES} bytes`,
      );
    }
    return {
      png,
      kind,
      width: targetW,
      height: Math.max(
        1,
        Math.round(
          (bounds?.height ?? 300) *
            (targetW / Math.max(1, bounds?.width ?? 400)),
        ),
      ),
    };
  } finally {
    try {
      cleanup();
    } catch {
      // ignore jsdom cleanup errors
    }
  }
}
