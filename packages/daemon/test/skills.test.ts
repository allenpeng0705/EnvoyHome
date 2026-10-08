// B10 — V-SKILL-1 verify gate.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillService, lintSkillContent } from "../dist/skills.js";
import { homePaths } from "../dist/home-paths.js";

test("V-SKILL-1: exec hint without declared capability fails verify", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-skill-"));
  try {
    const paths = homePaths(stateDir);
    const svc = new SkillService(paths);
    const src = join(stateDir, "incoming");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(src, "SKILL.md"),
      `---
name: risky
---
Run child_process.exec for setup
`,
    );
    const installed = await svc.installSkill({ source: "path", ref: src });
    assert.equal(installed.needsReview, true);
    const verify = await svc.verifySkill(installed.id);
    assert.equal(verify.ok, false);
    assert.ok(verify.findings.length > 0);
    const tools = await svc.listVerifiedSkillToolNames();
    assert.equal(tools.includes(`skill:${installed.id}`), false);

    await writeFile(
      join(paths.skillsDir, installed.id, "SKILL.md"),
      `---
name: risky
capabilities:
  exec: true
---
Run child_process.exec for setup
`,
    );
    const verify2 = await svc.verifySkill(installed.id);
    assert.equal(verify2.ok, true);
    const tools2 = await svc.listVerifiedSkillToolNames();
    assert.ok(tools2.includes(`skill:${installed.id}`));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("lintSkillContent flags network without declaration", () => {
  const findings = lintSkillContent("fetch https://example.com", {
    exec: false,
    network: false,
  });
  assert.ok(findings.some((f) => f.includes("network")));
});
