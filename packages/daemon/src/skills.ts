// Skill install + verify gate — Design §9.2 / Plan B10.

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { safeJoin } from "./fs-jail.js";
import type { HomePaths } from "./home-paths.js";

export interface SkillRecord {
  id: string;
  name: string;
  enabled: boolean;
  verified: boolean;
  declaredExec: boolean;
  declaredNetwork: boolean;
}

interface SkillIndexEntry {
  id: string;
  name: string;
  enabled: boolean;
  verified: boolean;
  declaredExec: boolean;
  declaredNetwork: boolean;
}

const INDEX_FILE = "index.json";

export class SkillsError extends Error {
  constructor(
    readonly kind: "bad_params" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "SkillsError";
  }
}

function parseFrontmatter(text: string): {
  name: string;
  declaredExec: boolean;
  declaredNetwork: boolean;
  body: string;
} {
  let name = "skill";
  let declaredExec = false;
  let declaredNetwork = false;
  let body = text;
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(text);
  if (match) {
    body = match[2] ?? body;
    const fm = match[1] ?? "";
    const nameLine = fm.match(/^name:\s*(.+)$/m);
    if (nameLine?.[1]) name = nameLine[1].trim().replace(/^["']|["']$/g, "");
    if (/capabilities:\s*\n[\s\S]*?\bexec:\s*true/m.test(fm) || /\bexec:\s*true\b/.test(fm)) {
      declaredExec = true;
    }
    if (
      /capabilities:\s*\n[\s\S]*?\bnetwork:\s*true/m.test(fm) ||
      /\bnetwork:\s*true\b/.test(fm)
    ) {
      declaredNetwork = true;
    }
  }
  return { name, declaredExec, declaredNetwork, body };
}

const EXEC_HINTS =
  /\b(child_process|exec\(|spawn\(|subprocess|shell\s*script|eval\s*\()/i;
const NETWORK_HINTS =
  /\b(http:\/\/|https:\/\/|fetch\s*\(|curl\s+|wget\s+|XMLHttpRequest|socket\.connect)/i;

export function lintSkillContent(body: string, declared: { exec: boolean; network: boolean }): string[] {
  const findings: string[] = [];
  if (EXEC_HINTS.test(body) && !declared.exec) {
    findings.push("body references exec/shell but capabilities.exec is not declared+true");
  }
  if (NETWORK_HINTS.test(body) && !declared.network) {
    findings.push("body references network I/O but capabilities.network is not declared+true");
  }
  return findings;
}

export class SkillService {
  constructor(private readonly paths: HomePaths) {}

  private indexPath(): string {
    return join(this.paths.skillsDir, INDEX_FILE);
  }

  private skillRoot(id: string): string {
    return safeJoin(this.paths.skillsDir, id);
  }

  private async readIndex(): Promise<SkillIndexEntry[]> {
    await mkdir(this.paths.skillsDir, { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.indexPath(), "utf8")) as {
        skills?: SkillIndexEntry[];
      };
      return Array.isArray(raw.skills) ? raw.skills : [];
    } catch {
      return [];
    }
  }

  private async writeIndex(rows: SkillIndexEntry[]): Promise<void> {
    await writeFile(this.indexPath(), JSON.stringify({ skills: rows }, null, 2), "utf8");
  }

  async listSkills(): Promise<SkillRecord[]> {
    const rows = await this.readIndex();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      verified: r.verified,
      declaredExec: r.declaredExec,
      declaredNetwork: r.declaredNetwork,
    }));
  }

  /** V-SKILL-1: only verified skills contribute tools. */
  async listVerifiedSkillToolNames(): Promise<string[]> {
    const rows = await this.readIndex();
    return rows.filter((r) => r.enabled && r.verified).map((r) => `skill:${r.id}`);
  }

  async installSkill(input: { source: "path" | "clawhub" | "url"; ref: string }): Promise<{
    id: string;
    needsReview: boolean;
  }> {
    if (input.source !== "path") {
      throw new SkillsError("bad_params", `install source ${input.source} not implemented in B10`);
    }
    const src = input.ref;
    let id = src.split(/[/\\]/).filter(Boolean).pop() ?? "skill";
    id = id.replace(/[^a-zA-Z0-9._-]/g, "_");
    const dest = this.skillRoot(id);
    await mkdir(this.paths.skillsDir, { recursive: true });
    await cp(src, dest, { recursive: true, force: true });

    const skillMd = await readFile(join(dest, "SKILL.md"), "utf8").catch(() => "");
    const parsed = parseFrontmatter(skillMd);
    const rows = await this.readIndex();
    const entry: SkillIndexEntry = {
      id,
      name: parsed.name,
      enabled: false,
      verified: false,
      declaredExec: parsed.declaredExec,
      declaredNetwork: parsed.declaredNetwork,
    };
    const idx = rows.findIndex((r) => r.id === id);
    if (idx >= 0) rows[idx] = entry;
    else rows.push(entry);
    await this.writeIndex(rows);
    return { id, needsReview: true };
  }

  async verifySkill(id: string): Promise<{ ok: boolean; findings: string[] }> {
    const rows = await this.readIndex();
    const row = rows.find((r) => r.id === id);
    if (!row) throw new SkillsError("not_found", `unknown skill: ${id}`);
    const skillMd = await readFile(join(this.skillRoot(id), "SKILL.md"), "utf8").catch(
      () => "",
    );
    const parsed = parseFrontmatter(skillMd);
    const findings = lintSkillContent(parsed.body, {
      exec: parsed.declaredExec,
      network: parsed.declaredNetwork,
    });
    if (findings.length === 0) {
      row.verified = true;
      row.enabled = true;
      row.declaredExec = parsed.declaredExec;
      row.declaredNetwork = parsed.declaredNetwork;
      row.name = parsed.name;
      await this.writeIndex(rows);
      return { ok: true, findings: [] };
    }
    row.verified = false;
    row.enabled = false;
    await this.writeIndex(rows);
    return { ok: false, findings };
  }

  async removeSkill(id: string): Promise<void> {
    const rows = await this.readIndex();
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) throw new SkillsError("not_found", `unknown skill: ${id}`);
    await this.writeIndex(next);
    await rm(this.skillRoot(id), { recursive: true, force: true });
  }
}
