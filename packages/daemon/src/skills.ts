// Skill install + verify gate — Design §9.2 / Plan B10.

import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
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
  description: string;
  declaredExec: boolean;
  declaredNetwork: boolean;
  body: string;
} {
  let name = "skill";
  let description = "";
  let declaredExec = false;
  let declaredNetwork = false;
  let body = text;
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(text);
  if (match) {
    body = match[2] ?? body;
    const fm = match[1] ?? "";
    const nameLine = fm.match(/^name:\s*(.+)$/m);
    if (nameLine?.[1]) name = nameLine[1].trim().replace(/^["']|["']$/g, "");
    const descLine = fm.match(/^description:\s*(.+)$/m);
    if (descLine?.[1]) description = descLine[1].trim().replace(/^["']|["']$/g, "");
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
  // Fallback short blurb from first non-empty body line (capped).
  if (!description) {
    const first = body
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("#"));
    if (first) description = first.slice(0, 160);
  }
  return { name, description, declaredExec, declaredNetwork, body };
}

export type SkillCatalogEntry = {
  id: string;
  name: string;
  description: string;
  declaredExec: boolean;
  declaredNetwork: boolean;
};

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

  /**
   * Design §9.2 progressive disclosure — verified+enabled catalogue for `skills_list`.
   * Does not include SKILL.md bodies.
   */
  async listVerifiedCatalog(): Promise<SkillCatalogEntry[]> {
    const rows = await this.readIndex();
    const out: SkillCatalogEntry[] = [];
    for (const r of rows) {
      if (!r.enabled || !r.verified) continue;
      let description = "";
      try {
        const md = await readFile(join(this.skillRoot(r.id), "SKILL.md"), "utf8");
        description = parseFrontmatter(md).description;
      } catch {
        /* index row still listed */
      }
      out.push({
        id: r.id,
        name: r.name,
        description,
        declaredExec: r.declaredExec,
        declaredNetwork: r.declaredNetwork,
      });
    }
    return out;
  }

  /**
   * Design §9.2 `skill_view` — load SKILL.md or a relative file under the skill root.
   * Path-jailed via safeJoin; only verified+enabled skills.
   */
  async readSkillResource(id: string, relPath?: string): Promise<string> {
    const rows = await this.readIndex();
    const row = rows.find((r) => r.id === id);
    if (!row || !row.enabled || !row.verified) {
      throw new SkillsError("not_found", `skill ${id} not verified/enabled`);
    }
    const rel = (relPath ?? "SKILL.md").trim() || "SKILL.md";
    if (rel.startsWith("/") || rel.includes("\0")) {
      throw new SkillsError("unsafe", "skill path must be relative under the skill root");
    }
    const root = this.skillRoot(id);
    const abs = safeJoin(root, rel);
    try {
      return await readFile(abs, "utf8");
    } catch {
      throw new SkillsError("not_found", `skill file not found: ${rel}`);
    }
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

  /**
   * Read SKILL.md body for PendingLearn digests (Design `2026-10-22b`).
   * Returns null when the pack is missing.
   */
  async readSkillMd(id: string): Promise<string | null> {
    const safe = this.sanitizeId(id);
    try {
      return await readFile(join(this.skillRoot(safe), "SKILL.md"), "utf8");
    } catch {
      return null;
    }
  }

  /**
   * Materialize / replace a pack from an accepted skill learn.
   * Always lands `verified: false` / `enabled: false` (V-SKILL-1 — operator must verify).
   */
  async upsertUnverifiedPack(id: string, content: string): Promise<{ id: string }> {
    const safe = this.sanitizeId(id);
    if (!safe) throw new SkillsError("bad_params", "skill id is required");
    const body = content.trim().length > 0 ? content : "# skill\n";
    const parsed = parseFrontmatter(body);
    const dest = this.skillRoot(safe);
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, "SKILL.md"), body, "utf8");
    const rows = await this.readIndex();
    const entry: SkillIndexEntry = {
      id: safe,
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
    return { id: safe };
  }

  /**
   * Design `2026-10-22c` — one-shot migrate leftover flat Memory SkillsStore files
   * (`accounts/<id>/skills/*.md`) into household SkillService packs (unverified).
   * Renames sources to `*.md.migrated` (never silent delete).
   */
  async migrateFlatAccountSkillFiles(stateDir: string): Promise<{ migrated: string[] }> {
    const migrated: string[] = [];
    const accountsRoot = join(stateDir, "accounts");
    let accountIds: string[];
    try {
      accountIds = await readdir(accountsRoot);
    } catch {
      return { migrated };
    }
    for (const accountId of accountIds) {
      const skillsDir = join(accountsRoot, accountId, "skills");
      let entries: string[];
      try {
        entries = await readdir(skillsDir);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (!name.endsWith(".md") || name.endsWith(".md.migrated")) continue;
        const src = join(skillsDir, name);
        let st;
        try {
          st = await stat(src);
        } catch {
          continue;
        }
        if (!st.isFile()) continue;
        const idHint = name.replace(/\.md$/i, "");
        const safe = this.sanitizeId(idHint);
        if (!safe) continue;
        const existing = await this.readSkillMd(safe);
        if (existing === null || !existing.trim()) {
          const content = await readFile(src, "utf8");
          await this.upsertUnverifiedPack(safe, content);
        }
        const dest = `${src}.migrated`;
        await rename(src, dest).catch(async () => {
          // Collision: append timestamp.
          await rename(src, `${src}.${Date.now()}.migrated`);
        });
        migrated.push(`${accountId}/${name}`);
      }
    }
    return { migrated };
  }
}

/**
 * MemoryFacade L7 adapter — **household** SkillService packs (Design `2026-10-22b`/`c`).
 * `accountId` is intentionally ignored: acceptLearn from any seat materializes under
 * `stateDir/skills/<id>/`, and every seat shares the verified catalogue after verifySkill.
 */
export function createSkillServiceL7Adapter(skills: SkillService): {
  read(accountId: string, name: string): Promise<string | null>;
  write(accountId: string, name: string, content: string): Promise<void>;
  remove(accountId: string, name: string): Promise<void>;
} {
  return {
    async read(_accountId, name) {
      return skills.readSkillMd(name);
    },
    async write(_accountId, name, content) {
      await skills.upsertUnverifiedPack(name, content);
    },
    async remove(_accountId, name) {
      try {
        await skills.removeSkill(name);
      } catch (err) {
        if (err instanceof SkillsError && err.kind === "not_found") return;
        throw err;
      }
    },
  };
}
