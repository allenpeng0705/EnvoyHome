// Minimal L7 skills files — mutations only via acceptLearn (V-LEARN-1).
// Daemon may inject a SkillService-backed SkillL7Backend instead (Design 2026-10-22b).

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** L7 skill body backend used by proposeLearn / acceptLearn. */
export interface SkillL7Backend {
  read(accountId: string, name: string): Promise<string | null>;
  write(accountId: string, name: string, content: string): Promise<void>;
  remove(accountId: string, name: string): Promise<void>;
}

export class SkillsStore implements SkillL7Backend {
  constructor(private readonly accountRoot: (accountId: string) => string) {}

  private dir(accountId: string): string {
    return join(this.accountRoot(accountId), "skills");
  }

  pathFor(accountId: string, name: string): string {
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
    return join(this.dir(accountId), `${safe}.md`);
  }

  async read(accountId: string, name: string): Promise<string | null> {
    try {
      return await readFile(this.pathFor(accountId, name), "utf8");
    } catch {
      return null;
    }
  }

  async write(accountId: string, name: string, content: string): Promise<void> {
    await mkdir(this.dir(accountId), { recursive: true });
    await writeFile(this.pathFor(accountId, name), content, "utf8");
  }

  async remove(accountId: string, name: string): Promise<void> {
    await rm(this.pathFor(accountId, name), { force: true });
  }
}
