// Skill install + verify gate — Design §9.2 / Plan B10.

import { copyFile, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { safeJoin } from "./fs-jail.js";
import type { HomePaths } from "./home-paths.js";
import {
  SkillRemoteError,
  fetchSkillFromClawHub,
  fetchSkillFromUrl,
  searchClawHubSkills,
  type ClawHubSearchHit,
} from "./skill-remote.js";

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
    readonly kind: "bad_params" | "not_found" | "download_failed" | "unsafe",
    message: string,
  ) {
    super(message);
    this.name = "SkillsError";
  }
}

function mapRemoteErr(err: unknown): never {
  if (err instanceof SkillRemoteError) {
    throw new SkillsError(err.kind, err.message);
  }
  throw err;
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

  private sanitizeId(raw: string): string {
    const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
    return cleaned || "skill";
  }

  private async destPrep(candidate: string): Promise<{ id: string; dest: string }> {
    const id = this.sanitizeId(candidate);
    const dest = this.skillRoot(id);
    await rm(dest, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(dest, { recursive: true });
    return { id, dest };
  }

  private async registerFromDir(
    srcDir: string,
    suggestedId: string,
  ): Promise<{ id: string; needsReview: boolean }> {
    const skillMd = await readFile(join(srcDir, "SKILL.md"), "utf8").catch(() => "");
    if (!skillMd.trim()) {
      throw new SkillsError(
        "bad_params",
        "skill folder must contain SKILL.md (or install a SKILL.md file)",
      );
    }
    const parsed = parseFrontmatter(skillMd);
    const installed = await this.destPrep(suggestedId || parsed.name || "skill");
    await cp(srcDir, installed.dest, { recursive: true, force: true });
    const rows = await this.readIndex();
    const entry: SkillIndexEntry = {
      id: installed.id,
      name: parsed.name,
      enabled: false,
      verified: false,
      declaredExec: parsed.declaredExec,
      declaredNetwork: parsed.declaredNetwork,
    };
    const idx = rows.findIndex((r) => r.id === entry.id);
    if (idx >= 0) rows[idx] = entry;
    else rows.push(entry);
    await this.writeIndex(rows);
    return { id: entry.id, needsReview: true };
  }

  /**
   * Search ClawHub (public registry HTTP API). Peer: EnvoyMesh skill search.
   * Results still install via `installSkill({ source: "clawhub" })` + Verify.
   */
  async searchClawHub(query: string, limit?: number, fetchImpl?: typeof fetch): Promise<ClawHubSearchHit[]> {
    try {
      return await searchClawHubSkills(query, {
        ...(limit !== undefined ? { limit } : {}),
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    } catch (err) {
      mapRemoteErr(err);
    }
  }

  /**
   * Install from:
   * - **path** — local folder with `SKILL.md`, or a `.md` file
   * - **url** — https ZIP or raw `SKILL.md`
   * - **clawhub** — registry slug (`owner/slug` or bare slug when unique)
   *
   * Never auto-enabled; operator must `verifySkill` (V-SKILL-1).
   */
  async installSkill(input: {
    source: "path" | "clawhub" | "url";
    ref: string;
    /** Injected for tests. */
    fetchImpl?: typeof fetch;
  }): Promise<{
    id: string;
    needsReview: boolean;
  }> {
    const ref = input.ref.trim();
    if (!ref) throw new SkillsError("bad_params", "skill ref is required");
    await mkdir(this.paths.skillsDir, { recursive: true });

    if (input.source === "path") {
      let st;
      try {
        st = await stat(ref);
      } catch {
        throw new SkillsError("bad_params", `skill path not found: ${ref}`);
      }

      if (st.isDirectory()) {
        return this.registerFromDir(ref, basename(ref));
      }
      if (st.isFile()) {
        const fileName = basename(ref);
        if (!/\.md$/i.test(fileName)) {
          throw new SkillsError(
            "bad_params",
            "path install expects a skill folder or a .md file (SKILL.md)",
          );
        }
        const parent = basename(dirname(ref));
        const fromParent =
          parent && parent !== "." && parent !== "/" && !/^[A-Za-z]:\\?$/.test(parent);
        const fromFile = fileName.replace(/\.md$/i, "");
        const idHint =
          /^skill$/i.test(fromFile) && fromParent ? parent : fromFile || parent || "skill";
        const staging = await mkdtemp(join(tmpdir(), "eh-skill-path-"));
        try {
          await copyFile(ref, join(staging, "SKILL.md"));
          return await this.registerFromDir(staging, idHint);
        } finally {
          await rm(staging, { recursive: true, force: true }).catch(() => undefined);
        }
      }
      throw new SkillsError("bad_params", `skill path is not a file or folder: ${ref}`);
    }

    if (input.source === "url" || input.source === "clawhub") {
      const fetchImpl = input.fetchImpl ?? globalThis.fetch;
      let fetched;
      try {
        fetched =
          input.source === "url"
            ? await fetchSkillFromUrl(ref, fetchImpl)
            : await fetchSkillFromClawHub(ref, fetchImpl);
      } catch (err) {
        mapRemoteErr(err);
      }
      try {
        return await this.registerFromDir(fetched.stagingDir, fetched.suggestedId);
      } finally {
        await rm(fetched.cleanupDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }

    throw new SkillsError("bad_params", `unknown install source`);
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
