/**
 * PPTX slide layouts + theme (Design §9.5k / P2-L / P2-N / P2-O).
 * Markdown pivot — closed layout enum; soft-fail unknown; visual fidelity floor.
 */

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import PptxGenJS from "pptxgenjs";

export const SLIDE_LAYOUTS = [
  "title_bullets",
  "section",
  "two_column",
  "title_only",
  "table",
  "quote",
  "comparison",
] as const;

export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

export function isSlideLayout(value: string): value is SlideLayout {
  return (SLIDE_LAYOUTS as readonly string[]).includes(value);
}

/** P2-O visual floor (Design §9.5k). */
export const VISUAL = {
  margin: 0.5,
  contentBottom: 4.85,
  footerY: 5.2,
  titlePt: 34,
  sectionTitlePt: 40,
  bodyPt: 18,
  quotePt: 28,
  captionPt: 14,
  headerPt: 18,
} as const;

export interface OfficeTheme {
  id: string;
  name?: string;
  colors?: {
    bg?: string;
    title?: string;
    body?: string;
    accent?: string;
    panel?: string;
  };
  fonts?: {
    title?: string;
    body?: string;
  };
  /** Footer bar text on the theme-derived slide master (P2-N). */
  footer?: string;
  /** Slide numbers on master; default true when theme applied. */
  slideNumber?: boolean;
}

export const DEFAULT_OFFICE_THEME: OfficeTheme = {
  id: "default",
  name: "Default",
  colors: {
    bg: "FFFFFF",
    title: "1A1A2E",
    body: "333333",
    accent: "2B6CB0",
    panel: "F4F7FB",
  },
  fonts: { title: "Calibri", body: "Calibri" },
  slideNumber: true,
};

export const DARK_OFFICE_THEME: OfficeTheme = {
  id: "dark",
  name: "Dark",
  colors: {
    bg: "1A1A2E",
    title: "F5F5F7",
    body: "D0D0D8",
    accent: "5B9BD5",
    panel: "252542",
  },
  fonts: { title: "Calibri", body: "Calibri" },
  slideNumber: true,
};

export const OFFICE_THEME_PRESETS: Record<string, OfficeTheme> = {
  default: DEFAULT_OFFICE_THEME,
  dark: DARK_OFFICE_THEME,
};

/** Merge theme with built-in preset when `id` is default|dark (P2-O). */
export function resolveOfficeTheme(theme?: OfficeTheme | null): OfficeTheme {
  if (!theme) return { ...DEFAULT_OFFICE_THEME };
  const preset = OFFICE_THEME_PRESETS[theme.id];
  if (!preset) {
    return {
      ...DEFAULT_OFFICE_THEME,
      ...theme,
      colors: { ...DEFAULT_OFFICE_THEME.colors, ...theme.colors },
      fonts: { ...DEFAULT_OFFICE_THEME.fonts, ...theme.fonts },
    };
  }
  return {
    ...preset,
    ...theme,
    id: theme.id,
    colors: { ...preset.colors, ...theme.colors },
    fonts: { ...preset.fonts, ...theme.fonts },
  };
}

const SLIDE_DIRECTIVE_RE =
  /^<!--\s*slide\s+layout\s*=\s*([a-z0-9_]+)\s*-->$/i;
const SLIDE_NOTES_RE =
  /^<!--\s*slide\s+notes\s*:\s*(.*?)\s*-->$/i;
const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

export const MAX_SPEAKER_NOTES_CHARS = 2000;
export const MAX_MASTER_PPTX_BYTES = 2 * 1024 * 1024;
export const ENVOYHOME_SLIDE_MASTER = "ENVOYHOME_MASTER";

export function parseSlideDirectiveLine(line: string): string | undefined {
  const m = SLIDE_DIRECTIVE_RE.exec(line.trim());
  return m?.[1]?.toLowerCase();
}

/** Speaker notes directive: `<!-- slide notes: … -->` (P2-N). */
export function parseSlideNotesLine(line: string): string | undefined {
  const m = SLIDE_NOTES_RE.exec(line.trim());
  if (!m) return undefined;
  return (m[1] ?? "").trim();
}

export function parseImageLine(
  line: string,
): { alt: string; path: string } | undefined {
  const m = IMAGE_LINE_RE.exec(line.trim());
  if (!m) return undefined;
  return { alt: m[1] ?? "", path: (m[2] ?? "").trim() };
}

/** True when pptx should force JS under engine:auto (layouts, notes, or images). */
export function markdownNeedsJsPptx(markdown: string): boolean {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (parseSlideDirectiveLine(line)) return true;
    if (parseSlideNotesLine(line) !== undefined) return true;
    if (parseImageLine(line)) return true;
  }
  return false;
}

export type PptxMdBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "code"; text: string }
  | { kind: "slide_directive"; layout: string }
  | { kind: "slide_notes"; text: string }
  | { kind: "image"; alt: string; path: string };

export interface PptxExportNotes {
  unknownLayouts: string[];
  imageCount: number;
  imageSkipped: string[];
  templateNote?: string;
  speakerNotesCount?: number;
  masterNote?: string;
}

export interface PptxBuildOpts {
  title?: string;
  theme?: OfficeTheme;
  /** Resolve jail-relative image path → bytes (png/jpg/gif/webp). */
  resolveImage?: (relPath: string) => Promise<Buffer | null>;
  maxImages?: number;
  maxImageBytes?: number;
  /** Honest note when pack has blank master.pptx (no OOXML merge). */
  masterNote?: string;
}

const MAX_IMAGES_DEFAULT = 8;
const MAX_IMAGE_BYTES_DEFAULT = 2 * 1024 * 1024;

type SlideBody = {
  title: string;
  layout: SlideLayout;
  layoutRaw?: string;
  bullets: string[];
  paras: string[];
  tables: string[][];
  images: Array<{ alt: string; path: string }>;
  speakerNotes?: string;
};

function normalizeLayout(raw: string | undefined): {
  layout: SlideLayout;
  unknown?: string;
} {
  if (!raw) return { layout: "title_bullets" };
  if (isSlideLayout(raw)) return { layout: raw };
  return { layout: "title_bullets", unknown: raw };
}

function hex(color: string | undefined, fallback: string): string {
  const c = (color ?? fallback).replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
}

function stripMdLight(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/** Attribution line: em-dash / en-dash / leading hyphen + name (P2-O). */
export function isAttributionLine(text: string): boolean {
  return /^[—–\-]\s*\S/.test(text.trim());
}

/**
 * Split quote body vs attribution (P2-O / V-OFFICE-26).
 * Handles separate paras and inline `… — Name`.
 */
export function splitQuoteContent(
  paras: string[],
  bullets: string[],
): { quote: string; attribution?: string } {
  const sources = [...paras, ...bullets].map((t) => t.trim()).filter(Boolean);
  let quote = "";
  let attribution: string | undefined;

  for (const s of sources) {
    if (isAttributionLine(s)) {
      if (!attribution) attribution = s.replace(/^[—–\-]\s*/, "— ");
      continue;
    }
    const inline = /^(.*?)\s+[—–\-]\s+(\S.*)$/.exec(s);
    if (inline && !quote && inline[1]!.trim().length >= 8) {
      quote = inline[1]!.trim();
      attribution = `— ${inline[2]!.trim()}`;
      continue;
    }
    if (!quote) quote = s;
  }

  quote = quote.replace(/^["“]+|["”]+$/g, "").trim();
  const result: { quote: string; attribution?: string } = { quote };
  if (attribution) result.attribution = attribution;
  return result;
}

/**
 * Resolve comparison column headers (P2-O / V-OFFICE-27).
 * Supports two short paras, `A | B`, `A vs B`, or two short tokens in one para.
 */
export function resolveComparisonHeaders(paras: string[]): {
  left?: string;
  right?: string;
  rest: string[];
} {
  const cleaned = paras.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length >= 2) {
    const a = cleaned[0]!;
    const b = cleaned[1]!;
    if (a.length <= 40 && b.length <= 40) {
      return { left: a, right: b, rest: cleaned.slice(2) };
    }
  }
  if (cleaned.length >= 1) {
    const p = cleaned[0]!;
    const vs = /^(.*?)\s+(?:vs\.?|versus|\/|\|)\s+(.*)$/i.exec(p);
    if (vs && vs[1]!.trim() && vs[2]!.trim()) {
      const out: { left?: string; right?: string; rest: string[] } = {
        rest: cleaned.slice(1),
      };
      out.left = vs[1]!.trim();
      out.right = vs[2]!.trim();
      return out;
    }
    const two = /^(\S{1,24})\s+(\S{1,24})$/.exec(p);
    if (two?.[1] && two[2]) {
      const out: { left?: string; right?: string; rest: string[] } = {
        rest: cleaned.slice(1),
      };
      out.left = two[1];
      out.right = two[2];
      return out;
    }
  }
  return { rest: cleaned };
}

function applySpeakerNotes(
  target: SlideBody,
  raw: string,
  notes: PptxExportNotes,
): void {
  const clipped = raw.slice(0, MAX_SPEAKER_NOTES_CHARS);
  target.speakerNotes = target.speakerNotes
    ? `${target.speakerNotes}\n${clipped}`
    : clipped;
  notes.speakerNotesCount = (notes.speakerNotesCount ?? 0) + 1;
}

function defineThemeMaster(
  pptx: PptxGenJS,
  theme: OfficeTheme,
  colors: { bg: string; body: string; accent: string },
): void {
  const objects: NonNullable<
    Parameters<PptxGenJS["defineSlideMaster"]>[0]["objects"]
  > = [];
  const footer = typeof theme.footer === "string" ? theme.footer.trim() : "";
  if (footer) {
    objects.push({
      rect: {
        x: 0,
        y: VISUAL.footerY,
        w: "100%",
        h: 0.35,
        fill: { color: colors.accent },
      },
    });
    objects.push({
      text: {
        text: footer,
        options: {
          x: 0.4,
          y: VISUAL.footerY,
          w: 8.2,
          h: 0.35,
          fontSize: 10,
          color: "FFFFFF",
          fontFace: theme.fonts?.body || "Calibri",
          valign: "middle",
        },
      },
    });
  }
  const master: Parameters<PptxGenJS["defineSlideMaster"]>[0] = {
    title: ENVOYHOME_SLIDE_MASTER,
    background: { color: colors.bg },
    objects,
  };
  if (theme.slideNumber !== false) {
    master.slideNumber = {
      x: 9.1,
      y: VISUAL.footerY + 0.05,
      w: 0.6,
      h: 0.25,
      fontSize: 10,
      color: footer ? "FFFFFF" : colors.body,
      fontFace: theme.fonts?.body || "Calibri",
    };
  }
  pptx.defineSlideMaster(master);
}

/**
 * Build pptx buffer from already-parsed blocks (may include directives/images/notes).
 */
export async function buildPptxFromBlocks(
  blocks: PptxMdBlock[],
  opts?: PptxBuildOpts,
): Promise<{ buffer: Buffer; notes: PptxExportNotes }> {
  const theme = resolveOfficeTheme(opts?.theme);
  const maxImages = opts?.maxImages ?? MAX_IMAGES_DEFAULT;
  const maxImageBytes = opts?.maxImageBytes ?? MAX_IMAGE_BYTES_DEFAULT;
  const notes: PptxExportNotes = {
    unknownLayouts: [],
    imageCount: 0,
    imageSkipped: [],
  };
  if (opts?.masterNote) notes.masterNote = opts.masterNote;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "EnvoyHome";
  if (opts?.title) pptx.title = opts.title;
  pptx.theme = {
    headFontFace: theme.fonts?.title || "Calibri",
    bodyFontFace: theme.fonts?.body || "Calibri",
  };

  const slides: SlideBody[] = [];
  // Box so nested ensure/pushSlide mutations stay typed (TS CFA ignores closure assigns).
  // Do NOT pre-seed from opts.title — that discarded body when markdown had no H1/H2.
  const state: { cur: SlideBody | null } = { cur: null };
  let pendingLayout: string | undefined;
  let pendingNotes: string | undefined;

  const ensure = (t: string) => {
    if (!state.cur) {
      const n = normalizeLayout(pendingLayout);
      if (n.unknown) notes.unknownLayouts.push(n.unknown);
      state.cur = {
        title: t || "Slide",
        layout: n.layout,
        ...(pendingLayout ? { layoutRaw: pendingLayout } : {}),
        bullets: [],
        paras: [],
        tables: [],
        images: [],
      };
      if (pendingNotes) {
        applySpeakerNotes(state.cur, pendingNotes, notes);
        pendingNotes = undefined;
      }
      slides.push(state.cur);
      pendingLayout = undefined;
    }
  };
  const pushSlide = (t: string) => {
    const n = normalizeLayout(pendingLayout);
    if (n.unknown) notes.unknownLayouts.push(n.unknown);
    state.cur = {
      title: t || "Slide",
      layout: n.layout,
      ...(pendingLayout ? { layoutRaw: pendingLayout } : {}),
      bullets: [],
      paras: [],
      tables: [],
      images: [],
    };
    if (pendingNotes) {
      applySpeakerNotes(state.cur, pendingNotes, notes);
      pendingNotes = undefined;
    }
    slides.push(state.cur);
    pendingLayout = undefined;
  };

  for (const b of blocks) {
    if (b.kind === "slide_directive") {
      pendingLayout = b.layout;
      const existing = state.cur;
      if (
        existing &&
        existing.bullets.length === 0 &&
        existing.paras.length === 0 &&
        existing.tables.length === 0 &&
        existing.images.length === 0
      ) {
        const n = normalizeLayout(b.layout);
        if (n.unknown) notes.unknownLayouts.push(n.unknown);
        existing.layout = n.layout;
        existing.layoutRaw = b.layout;
        pendingLayout = undefined;
      }
      continue;
    }
    if (b.kind === "slide_notes") {
      const existing = state.cur;
      if (existing) {
        applySpeakerNotes(existing, b.text, notes);
      } else {
        pendingNotes = pendingNotes ? `${pendingNotes}\n${b.text}` : b.text;
      }
      continue;
    }
    if (b.kind === "heading" && b.level <= 2) {
      pushSlide(b.text);
    } else if (b.kind === "heading") {
      ensure(opts?.title || "Slide");
      state.cur!.paras.push(b.text);
    } else if (b.kind === "list") {
      ensure(opts?.title || "Slide");
      state.cur!.bullets.push(...b.items.map((t) => stripMdLight(t)));
    } else if (b.kind === "table") {
      ensure(opts?.title || "Slide");
      state.cur!.tables.push(...b.rows);
    } else if (b.kind === "image") {
      ensure(opts?.title || "Slide");
      state.cur!.images.push({ alt: b.alt, path: b.path });
    } else if (b.kind === "paragraph" || b.kind === "code") {
      ensure(opts?.title || "Slide");
      state.cur!.paras.push(b.kind === "code" ? b.text : b.text);
    }
  }
  if (state.cur && !slides.includes(state.cur)) {
    slides.push(state.cur);
  }
  if (slides.length === 0) {
    slides.push({
      title: opts?.title || "Slide",
      layout: "title_bullets",
      bullets: [],
      paras: [""],
      tables: [],
      images: [],
    });
  }

  const bg = hex(theme.colors?.bg, "FFFFFF");
  const titleColor = hex(theme.colors?.title, "1A1A2E");
  const bodyColor = hex(theme.colors?.body, "333333");
  const accent = hex(theme.colors?.accent, "2B6CB0");
  const panel = hex(theme.colors?.panel, "F4F7FB");
  const titleFont = theme.fonts?.title || "Calibri";
  const bodyFont = theme.fonts?.body || "Calibri";
  const hasFooter = Boolean(theme.footer?.trim());
  const contentBottom = hasFooter ? VISUAL.contentBottom : 5.2;
  const m = VISUAL.margin;

  defineThemeMaster(pptx, theme, { bg, body: bodyColor, accent });

  let imagesUsed = 0;

  const embedImages = async (
    slide: ReturnType<PptxGenJS["addSlide"]>,
    s: SlideBody,
    optsEmbed: {
      x: number;
      y: number;
      w: number;
      h: number;
    },
  ) => {
    for (const img of s.images) {
      if (imagesUsed >= maxImages) {
        notes.imageSkipped.push(`${img.path}: max images`);
        continue;
      }
      if (!opts?.resolveImage) {
        notes.imageSkipped.push(`${img.path}: no resolver`);
        continue;
      }
      try {
        const buf = await opts.resolveImage(img.path);
        if (!buf) {
          notes.imageSkipped.push(`${img.path}: not found`);
          continue;
        }
        if (buf.length > maxImageBytes) {
          notes.imageSkipped.push(`${img.path}: too large`);
          continue;
        }
        const ext = img.path.toLowerCase().split(".").pop() ?? "png";
        const mime =
          ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "gif"
              ? "image/gif"
              : ext === "webp"
                ? "image/webp"
                : "image/png";
        slide.addImage({
          data: `data:${mime};base64,${buf.toString("base64")}`,
          x: optsEmbed.x,
          y: optsEmbed.y,
          w: optsEmbed.w,
          h: optsEmbed.h,
        });
        imagesUsed += 1;
        notes.imageCount += 1;
      } catch {
        notes.imageSkipped.push(`${img.path}: resolve failed`);
      }
    }
  };

  for (const s of slides) {
    const slide = pptx.addSlide({ masterName: ENVOYHOME_SLIDE_MASTER });

    if (s.speakerNotes) {
      slide.addNotes(s.speakerNotes.slice(0, MAX_SPEAKER_NOTES_CHARS));
    }

    // —— Quote ——
    if (s.layout === "quote") {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: hasFooter ? VISUAL.footerY : "100%",
        fill: { color: bg },
        line: { color: bg },
      });
      slide.addText(s.title, {
        x: m,
        y: 0.45,
        w: 9,
        h: 0.4,
        fontSize: VISUAL.captionPt,
        color: accent,
        fontFace: titleFont,
        align: "center",
        margin: 0,
      });
      const { quote, attribution } = splitQuoteContent(s.paras, s.bullets);
      slide.addText(quote ? `“${quote}”` : s.title, {
        x: 0.9,
        y: 1.4,
        w: 8.2,
        h: 2.4,
        fontSize: VISUAL.quotePt,
        italic: true,
        color: titleColor,
        fontFace: titleFont,
        align: "center",
        valign: "middle",
        margin: 0,
      });
      if (attribution) {
        slide.addText(attribution, {
          x: m,
          y: 4.0,
          w: 9,
          h: 0.4,
          fontSize: VISUAL.bodyPt,
          color: bodyColor,
          fontFace: bodyFont,
          align: "center",
          margin: 0,
        });
      }
      continue;
    }

    // —— Section (full-bleed accent panel) ——
    if (s.layout === "section") {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: hasFooter ? VISUAL.footerY : "100%",
        fill: { color: accent },
        line: { color: accent },
      });
      slide.addText(s.title, {
        x: m,
        y: 1.8,
        w: 9,
        h: 1.1,
        fontSize: VISUAL.sectionTitlePt,
        bold: true,
        color: "FFFFFF",
        fontFace: titleFont,
        align: "center",
        valign: "middle",
        margin: 0,
      });
      const subtitle = s.paras.find((p) => p.trim());
      if (subtitle) {
        slide.addText(subtitle, {
          x: 1.2,
          y: 3.1,
          w: 7.6,
          h: 0.7,
          fontSize: VISUAL.bodyPt,
          color: "FFFFFF",
          fontFace: bodyFont,
          align: "center",
          margin: 0,
        });
      }
      continue;
    }

    // —— Title-only / chart (image-dominant) ——
    if (s.layout === "title_only") {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: hasFooter ? VISUAL.footerY : "100%",
        fill: { color: bg },
        line: { color: bg },
      });
      // Caption bar
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: 0.7,
        fill: { color: panel },
        line: { color: panel },
      });
      slide.addText(s.title, {
        x: m,
        y: 0.15,
        w: 9,
        h: 0.45,
        fontSize: 22,
        bold: true,
        color: titleColor,
        fontFace: titleFont,
        margin: 0,
      });
      if (s.images.length) {
        await embedImages(slide, s, {
          x: 0.8,
          y: 0.95,
          w: 8.4,
          h: Math.min(3.7, contentBottom - 1.0),
        });
      } else {
        const body =
          s.paras.find((p) => p.trim()) ??
          s.bullets.slice(0, 3).join(" · ");
        if (body) {
          slide.addText(body, {
            x: m,
            y: 2.0,
            w: 9,
            h: 1.5,
            fontSize: VISUAL.bodyPt,
            color: bodyColor,
            fontFace: bodyFont,
            align: "center",
            margin: 0,
          });
        }
      }
      continue;
    }

    // Content slides: bg + left accent rail (no underline cliché)
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: "100%",
      h: hasFooter ? VISUAL.footerY : "100%",
      fill: { color: bg },
      line: { color: bg },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.12,
      h: hasFooter ? VISUAL.footerY : "100%",
      fill: { color: accent },
      line: { color: accent },
    });

    slide.addText(s.title, {
      x: m,
      y: 0.35,
      w: 9,
      h: 0.65,
      fontSize: VISUAL.titlePt,
      bold: true,
      color: titleColor,
      fontFace: titleFont,
      margin: 0,
    });

    if (s.layout === "comparison" || s.layout === "two_column") {
      const headers =
        s.layout === "comparison"
          ? resolveComparisonHeaders(s.paras)
          : { rest: s.paras };
      const leftHeader = headers.left;
      const rightHeader = headers.right;
      const bodyParas = headers.rest;

      const mid = Math.ceil(s.bullets.length / 2) || 0;
      const left = s.bullets.slice(0, mid);
      const right = s.bullets.slice(mid);

      if (s.layout === "comparison") {
        // Card panels
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 0.4,
          y: 1.15,
          w: 4.4,
          h: 3.4,
          fill: { color: panel },
          line: { color: panel },
          rectRadius: 0.08,
        });
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 5.2,
          y: 1.15,
          w: 4.4,
          h: 3.4,
          fill: { color: panel },
          line: { color: panel },
          rectRadius: 0.08,
        });
      }

      const colY = leftHeader || rightHeader ? 1.75 : 1.35;
      if (leftHeader) {
        slide.addText(leftHeader, {
          x: 0.55,
          y: 1.3,
          w: 4.1,
          h: 0.4,
          fontSize: VISUAL.headerPt,
          bold: true,
          color: accent,
          fontFace: titleFont,
          align: "center",
          margin: 0,
        });
      }
      if (rightHeader) {
        slide.addText(rightHeader, {
          x: 5.35,
          y: 1.3,
          w: 4.1,
          h: 0.4,
          fontSize: VISUAL.headerPt,
          bold: true,
          color: accent,
          fontFace: titleFont,
          align: "center",
          margin: 0,
        });
      }
      if (left.length) {
        slide.addText(
          left.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
          {
            x: 0.65,
            y: colY,
            w: 3.9,
            h: 2.6,
            fontSize: VISUAL.bodyPt,
            color: bodyColor,
            fontFace: bodyFont,
            align: "left",
            valign: "top",
            paraSpaceAfter: 6,
          },
        );
      }
      if (right.length) {
        slide.addText(
          right.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
          {
            x: 5.45,
            y: colY,
            w: 3.9,
            h: 2.6,
            fontSize: VISUAL.bodyPt,
            color: bodyColor,
            fontFace: bodyFont,
            align: "left",
            valign: "top",
            paraSpaceAfter: 6,
          },
        );
      }
      let y = 4.55;
      for (const p of bodyParas.slice(0, 2)) {
        if (y > contentBottom) break;
        slide.addText(p, {
          x: m,
          y,
          w: 9,
          h: 0.3,
          fontSize: 14,
          color: bodyColor,
          fontFace: bodyFont,
          margin: 0,
        });
        y += 0.3;
      }
    } else {
      let y = 1.2;
      if (s.bullets.length && s.layout !== "table") {
        const bulletH = Math.min(
          contentBottom - y,
          0.42 * s.bullets.length + 0.2,
        );
        slide.addText(
          s.bullets.map((t) => ({
            text: t,
            options: { bullet: true, breakLine: true },
          })),
          {
            x: m,
            y,
            w: 9,
            h: bulletH,
            fontSize: VISUAL.bodyPt,
            color: bodyColor,
            fontFace: bodyFont,
            align: "left",
            valign: "top",
            paraSpaceAfter: 8,
          },
        );
        y += bulletH + 0.15;
      }
      for (const p of s.paras.slice(0, 6)) {
        if (y > contentBottom - 0.3) break;
        slide.addText(p, {
          x: m,
          y,
          w: 9,
          h: 0.4,
          fontSize: VISUAL.bodyPt,
          color: bodyColor,
          fontFace: bodyFont,
          margin: 0,
        });
        y += 0.42;
      }
      if (s.tables.length && y < contentBottom - 0.5) {
        const cols = Math.max(...s.tables.map((r) => r.length), 1);
        slide.addTable(
          s.tables.map((row) =>
            Array.from({ length: cols }, (_, i) => ({ text: row[i] ?? "" })),
          ),
          {
            x: m,
            y: s.layout === "table" ? 1.2 : y,
            w: 9,
            colW: Array.from({ length: cols }, () => 9 / cols),
            fontSize: 14,
            color: bodyColor,
            fontFace: bodyFont,
          },
        );
      }
    }

    if (s.images.length) {
      await embedImages(slide, s, {
        x: 6.8,
        y: Math.max(3.6, contentBottom - 1.4),
        w: 2.7,
        h: 1.2,
      });
    }
  }

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return {
    buffer: Buffer.isBuffer(out) ? out : Buffer.from(out),
    notes,
  };
}

/** Load theme.json from a template pack directory. */
export async function loadOfficeThemeFromDir(
  dir: string,
): Promise<OfficeTheme | null> {
  try {
    const raw = await readFile(join(dir, "theme.json"), "utf8");
    const parsed = JSON.parse(raw) as OfficeTheme;
    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") {
      return null;
    }
    return resolveOfficeTheme(parsed);
  } catch {
    return null;
  }
}

/**
 * Detect optional blank master.pptx in a template pack (P2-N).
 * Presence only — JS still applies theme-derived chrome (no OOXML merge).
 */
export async function detectMasterPptxNote(
  packDir: string,
): Promise<string | undefined> {
  const path = join(packDir, "master.pptx");
  try {
    await access(path);
    const buf = await readFile(path);
    if (buf.length === 0) {
      return "master.pptx empty; theme-derived slide master applied";
    }
    if (buf.length > MAX_MASTER_PPTX_BYTES) {
      return `master.pptx too large (>${MAX_MASTER_PPTX_BYTES} bytes); theme-derived slide master applied (no OOXML merge)`;
    }
    // PK zip magic
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
      return "master.pptx not a pptx zip; theme-derived slide master applied";
    }
    return "master.pptx present; theme-derived slide master applied (no OOXML merge)";
  } catch {
    return undefined;
  }
}
