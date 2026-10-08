// L2 MEMORY.md + L3 daily notes — section parsing and append helpers.
// Memory Design §4.2 (section-aware L2 inject), §6 layout, §7.0 remember routing.

export interface MdSection {
  /** Heading line including `## …`, or "" for the leading preamble. */
  heading: string;
  /** Body lines (no trailing blank-only trim of the whole section). */
  lines: string[];
}

export function parseSections(markdown: string): MdSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: MdSection[] = [];
  let current: MdSection = { heading: "", lines: [] };

  for (const line of lines) {
    if (/^#{1,6}\s+\S/.test(line)) {
      if (current.heading !== "" || current.lines.some((l) => l.trim() !== "")) {
        sections.push(current);
      }
      current = { heading: line, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.heading !== "" || current.lines.some((l) => l.trim() !== "")) {
    sections.push(current);
  }
  return sections;
}

export function sectionEntryCount(section: MdSection): number {
  const bullets = section.lines.filter((l) => /^\s*[-*+]\s+/.test(l));
  if (bullets.length > 0) return bullets.length;
  const nonEmpty = section.lines.filter((l) => l.trim() !== "");
  return Math.max(nonEmpty.length, section.heading ? 1 : 0);
}

export function renderSection(section: MdSection): string {
  if (!section.heading) {
    return section.lines.join("\n");
  }
  if (section.lines.length === 0) return section.heading;
  return [section.heading, ...section.lines].join("\n");
}

export function omitMarker(heading: string, n: number): string {
  const label = heading.replace(/^#+\s*/, "").trim() || "section";
  return `§ ${label} — ${n} entries omitted`;
}

/**
 * Section-aware L2 inject builder (Memory Design §4.2).
 * Prefers `injectPrioritySections` (default `["## Standing"]`); keeps whole
 * sections and whole bullets only; omitted sections become one-line markers.
 */
export function buildL2Inject(
  markdown: string,
  injectBudget: number,
  injectPrioritySections: string[] = ["## Standing"],
): { text: string; truncated: boolean; sectionsOmitted: string[]; injectChars: number } {
  const sections = parseSections(markdown);
  if (sections.length === 0) {
    return { text: "", truncated: false, sectionsOmitted: [], injectChars: 0 };
  }

  const priority = new Set(
    injectPrioritySections.map((h) => normalizeHeading(h)),
  );

  // Order: priority sections in file order, then remaining in file order.
  const prioritized: MdSection[] = [];
  const rest: MdSection[] = [];
  for (const s of sections) {
    if (s.heading && priority.has(normalizeHeading(s.heading))) prioritized.push(s);
    else rest.push(s);
  }
  const ordered = [...prioritized, ...rest];

  const keptBodies: string[] = [];
  const omitted: string[] = [];
  let used = 0;
  let truncated = false;

  for (const section of ordered) {
    const full = renderSection(section);
    const sep = keptBodies.length > 0 ? 1 : 0; // "\n" between sections
    if (used + sep + full.length <= injectBudget) {
      keptBodies.push(full);
      used += sep + full.length;
      continue;
    }

    // Try whole bullets that fit under remaining budget.
    const bulletFit = tryFitBullets(section, injectBudget - used - sep);
    if (bulletFit) {
      keptBodies.push(bulletFit.text);
      used += sep + bulletFit.text.length;
      if (bulletFit.omitted > 0) {
        truncated = true;
        omitted.push(section.heading || "(preamble)");
        const marker = omitMarker(section.heading, bulletFit.omitted);
        if (used + 1 + marker.length <= injectBudget) {
          keptBodies.push(marker);
          used += 1 + marker.length;
        }
      }
      continue;
    }

    truncated = true;
    omitted.push(section.heading || "(preamble)");
    const marker = omitMarker(section.heading, sectionEntryCount(section));
    if (used + sep + marker.length <= injectBudget) {
      keptBodies.push(marker);
      used += sep + marker.length;
    }
  }

  const text = keptBodies.join("\n");
  return {
    text,
    truncated: truncated || text.length < markdown.length && injectBudget < markdown.length,
    sectionsOmitted: omitted,
    injectChars: text.length,
  };
}

function normalizeHeading(h: string): string {
  return h.trim().replace(/\s+/g, " ").toLowerCase();
}

function tryFitBullets(
  section: MdSection,
  budget: number,
): { text: string; omitted: number } | null {
  const bullets = section.lines.filter((l) => /^\s*[-*+]\s+/.test(l));
  if (bullets.length === 0) return null;

  const nonBullets = section.lines.filter((l) => !/^\s*[-*+]\s+/.test(l) && l.trim() !== "");
  const headerParts: string[] = [];
  if (section.heading) headerParts.push(section.heading);
  for (const line of nonBullets) headerParts.push(line);

  const kept: string[] = [];
  let used = headerParts.join("\n").length;
  if (headerParts.length > 0) used += 0; // heading alone
  let omitted = 0;

  for (const b of bullets) {
    const add = (kept.length > 0 || headerParts.length > 0 ? 1 : 0) + b.length;
    // Reserve ~40 chars for a possible omit marker.
    if (used + add + 40 > budget && kept.length > 0) {
      omitted++;
      continue;
    }
    if (used + add > budget && kept.length === 0 && headerParts.length === 0) {
      return null;
    }
    if (used + add > budget) {
      omitted++;
      continue;
    }
    kept.push(b);
    used += add;
  }

  if (kept.length === 0 && omitted === bullets.length) return null;
  omitted += Math.max(0, bullets.length - kept.length - omitted);

  const parts = [...headerParts, ...kept];
  const text = parts.join("\n");
  if (text.length > budget) return null;
  const realOmitted = bullets.length - kept.length;
  return { text, omitted: realOmitted };
}

/** Append a bullet (or paragraph) to MEMORY.md under `## Standing` by default. */
export function appendToMemoryMd(
  existing: string,
  text: string,
  sectionHeading = "## Standing",
): string {
  const bullet = text.trim().startsWith("-") ? text.trim() : `- ${text.trim()}`;
  const sections = parseSections(existing);
  const targetNorm = normalizeHeading(sectionHeading);
  const idx = sections.findIndex(
    (s) => s.heading && normalizeHeading(s.heading) === targetNorm,
  );

  if (idx >= 0) {
    const s = sections[idx]!;
    const lines = [...s.lines];
    while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
    lines.push(bullet);
    lines.push("");
    sections[idx] = { heading: s.heading, lines };
  } else {
    sections.push({ heading: sectionHeading, lines: [bullet, ""] });
  }

  return sections.map(renderSection).join("\n").replace(/\n{3,}/g, "\n\n");
}

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function yesterdayIsoDate(now = new Date()): string {
  const dt = new Date(now.getTime());
  dt.setDate(dt.getDate() - 1);
  return todayIsoDate(dt);
}

export function appendDailyLine(existing: string, text: string): string {
  const line = text.trim().startsWith("-") ? text.trim() : `- ${text.trim()}`;
  const base = existing.replace(/\s*$/, "");
  if (!base) return `${line}\n`;
  return `${base}\n${line}\n`;
}

/**
 * Build L3 inject for today + yesterday under a combined budget.
 * Measured on the sum of the two rendered daily blocks (Memory Design §4.2).
 */
export function buildL3Inject(
  today: { date: string; content: string },
  yesterday: { date: string; content: string },
  injectBudget: number,
): { text: string; truncated: boolean; injectChars: number } {
  const blocks: string[] = [];
  for (const day of [today, yesterday]) {
    if (!day.content.trim()) continue;
    blocks.push(`### ${day.date}\n${day.content.trimEnd()}`);
  }
  let text = blocks.join("\n\n");
  if (text.length <= injectBudget) {
    return { text, truncated: false, injectChars: text.length };
  }

  // Prefer today; truncate yesterday first, then today by whole lines.
  const todayBlock = today.content.trim()
    ? `### ${today.date}\n${today.content.trimEnd()}`
    : "";
  let yesterdayBlock = yesterday.content.trim()
    ? `### ${yesterday.date}\n${yesterday.content.trimEnd()}`
    : "";

  if (todayBlock.length >= injectBudget) {
    text = truncateByLines(todayBlock, injectBudget);
    return { text, truncated: true, injectChars: text.length };
  }

  const remaining = injectBudget - todayBlock.length - (todayBlock && yesterdayBlock ? 2 : 0);
  if (remaining <= 0) {
    return { text: todayBlock, truncated: true, injectChars: todayBlock.length };
  }
  yesterdayBlock = truncateByLines(yesterdayBlock, remaining);
  text = [todayBlock, yesterdayBlock].filter(Boolean).join("\n\n");
  return { text, truncated: true, injectChars: text.length };
}

function truncateByLines(block: string, budget: number): string {
  if (block.length <= budget) return block;
  const lines = block.split("\n");
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const add = (kept.length > 0 ? 1 : 0) + line.length;
    if (used + add > budget) break;
    kept.push(line);
    used += add;
  }
  return kept.join("\n");
}

/** Remove lines matching `query` (case-insensitive substring) from markdown. */
export function forgetMatchingLines(
  content: string,
  query: string,
): { next: string; removed: string[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { next: content, removed: [] };
  const removed: string[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const kept = lines.filter((line) => {
    if (line.toLowerCase().includes(q)) {
      removed.push(line);
      return false;
    }
    return true;
  });
  return { next: kept.join("\n"), removed };
}
