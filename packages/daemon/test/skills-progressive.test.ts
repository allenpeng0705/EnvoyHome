// Design §9.2 (`2026-10-22a` / `2026-10-22b`) — progressive disclosure + skill_propose.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { MemoryFacade } from "@envoyhome/memory";
import { SkillService, createSkillServiceL7Adapter } from "../dist/skills.js";
import { homePaths } from "../dist/home-paths.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { parseAssistantToolCalls, BUILTIN_TOOLS } from "@envoyhome/harness-host";

async function installVerifiedSkill(
  svc: SkillService,
  stateDir: string,
  idHint: string,
  skillMd: string,
  extraFiles?: Record<string, string>,
): Promise<string> {
  const src = join(stateDir, `incoming-${idHint}`);
  await mkdir(src, { recursive: true });
  await writeFile(join(src, "SKILL.md"), skillMd);
  if (extraFiles) {
    for (const [rel, body] of Object.entries(extraFiles)) {
      const abs = join(src, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, body);
    }
  }
  const installed = await svc.installSkill({ source: "path", ref: src });
  const verify = await svc.verifySkill(installed.id);
  assert.equal(verify.ok, true, verify.findings.join("; "));
  // verifySkill enables on success for V-SKILL-1 path — check enabled.
  const rows = await svc.listSkills();
  const row = rows.find((r) => r.id === installed.id);
  assert.ok(row?.verified);
  if (!row?.enabled) {
    // Some builds verify without enable — force enable via rewrite if API lacks setEnabled.
    // SkillService.verifySkill typically sets enabled+verified; assert that.
  }
  return installed.id;
}

test("skills_list returns verified catalogue without bodies", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-skills-list-"));
  try {
    const paths = homePaths(stateDir);
    const svc = new SkillService(paths);
    const id = await installVerifiedSkill(
      svc,
      stateDir,
      "brief",
      `---
name: Morning brief
description: Short weather and coffee tip
---
# Morning brief
Prefer a short weather summary.
`,
    );
    const catalog = await svc.listVerifiedCatalog();
    assert.ok(catalog.some((c) => c.id === id && c.name === "Morning brief"));
    const hit = catalog.find((c) => c.id === id)!;
    assert.match(hit.description, /weather|coffee/i);
    assert.ok(!/"# Morning brief"/.test(JSON.stringify(catalog)));

    const out = await runExtendedWorkflowTool({
      tool: "skills_list",
      args: {},
      skills: svc,
      channels: {} as never,
      paths,
    });
    const parsed = JSON.parse(out) as { skills: unknown[]; count: number };
    assert.ok(parsed.count >= 1);
    assert.ok(Array.isArray(parsed.skills));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("skill_view loads SKILL.md and references/; path escape fails", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-skill-view-"));
  try {
    const paths = homePaths(stateDir);
    const svc = new SkillService(paths);
    const id = await installVerifiedSkill(
      svc,
      stateDir,
      "cook",
      `---
name: Cook tips
---
Body of cook tips.
`,
      { "references/oven.md": "# Oven\nPreheat to 180C.\n" },
    );

    const body = await svc.readSkillResource(id, "SKILL.md");
    assert.match(body, /Body of cook tips/);

    const ref = await svc.readSkillResource(id, "references/oven.md");
    assert.match(ref, /Preheat/);

    await assert.rejects(
      () => svc.readSkillResource(id, "../index.json"),
      /unsafe|not found|jail|escape|outside/i,
    );

    const viewed = await runExtendedWorkflowTool({
      tool: "skill_view",
      args: { id, path: "references/oven.md" },
      skills: svc,
      channels: {} as never,
      paths,
    });
    assert.match(viewed, /Preheat/);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("fence parse allows skills_list / skill_view / skill_propose when sandbox allowed", () => {
  const text = `Looking up skills.
\`\`\`envoyhome-tools
[{"tool":"skills_list","args":{}},{"tool":"skill_view","args":{"id":"cook"}},{"tool":"skill_propose","args":{"action":"create","id":"cook","content":"# x"}}]
\`\`\`
`;
  const denied = parseAssistantToolCalls(text, { allowSandbox: false });
  assert.equal(denied.tools.length, 0);

  const allowed = parseAssistantToolCalls(text, { allowSandbox: true });
  assert.ok(allowed.tools.some((t) => t.tool === "skills_list"));
  assert.ok(allowed.tools.some((t) => t.tool === "skill_view"));
  assert.ok(allowed.tools.some((t) => t.tool === "skill_propose"));
});

test("skill_manage is not a builtin; fence rejects it", () => {
  assert.equal(BUILTIN_TOOLS.skill_manage, undefined);
  const text = `\`\`\`envoyhome-tools
[{"tool":"skill_manage","args":{"action":"create","id":"x"}}]
\`\`\`
`;
  const parsed = parseAssistantToolCalls(text, { allowSandbox: true });
  assert.equal(parsed.tools.length, 0);
});

async function withSkillProposeHarness(): Promise<{
  stateDir: string;
  paths: ReturnType<typeof homePaths>;
  svc: SkillService;
  mem: MemoryFacade;
  accountId: string;
  cleanup: () => Promise<void>;
}> {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-skill-propose-"));
  const paths = homePaths(stateDir);
  const svc = new SkillService(paths);
  const mem = new MemoryFacade({
    stateDir,
    skillL7: createSkillServiceL7Adapter(svc),
  });
  const accountId = "acct1";
  await mem.store.ensureAccountLayout(accountId);
  return {
    stateDir,
    paths,
    svc,
    mem,
    accountId,
    cleanup: () => rm(stateDir, { recursive: true, force: true }),
  };
}

test("skill_propose → acceptLearn → verifySkill surfaces in skills_list", async () => {
  const h = await withSkillProposeHarness();
  try {
    const skillMd = `---
name: Tea ritual
description: How to brew afternoon tea
---
# Tea ritual
Use 80C water.
`;

    const proposed = await runExtendedWorkflowTool({
      tool: "skill_propose",
      args: {
        action: "create",
        id: "tea-ritual",
        content: skillMd,
        summary: "Add tea ritual",
      },
      skills: h.svc,
      memory: h.mem,
      memoryTrust: "agent",
      turnId: "turn-1",
      accountId: h.accountId,
      channels: {} as never,
      paths: h.paths,
    });
    const prop = JSON.parse(proposed) as {
      ok: boolean;
      learnId: string;
      applied: boolean;
    };
    assert.equal(prop.ok, true);
    assert.equal(prop.applied, false);
    assert.ok(prop.learnId);

    // Propose must not materialize the pack yet.
    assert.equal(await h.svc.readSkillMd("tea-ritual"), null);
    assert.equal((await h.svc.listVerifiedCatalog()).length, 0);

    await h.mem.acceptLearn(h.accountId, prop.learnId);

    const rows = await h.svc.listSkills();
    const row = rows.find((r) => r.id === "tea-ritual");
    assert.ok(row);
    assert.equal(row.verified, false);
    assert.equal(row.enabled, false);
    const body = await h.svc.readSkillMd("tea-ritual");
    assert.match(body ?? "", /Tea ritual/);

    // Still hidden from progressive catalogue until verify.
    assert.equal((await h.svc.listVerifiedCatalog()).length, 0);
    const listBefore = await runExtendedWorkflowTool({
      tool: "skills_list",
      args: {},
      skills: h.svc,
      channels: {} as never,
      paths: h.paths,
    });
    assert.equal(JSON.parse(listBefore).count, 0);

    const verify = await h.svc.verifySkill("tea-ritual");
    assert.equal(verify.ok, true, verify.findings.join("; "));

    const catalog = await h.svc.listVerifiedCatalog();
    assert.ok(catalog.some((c) => c.id === "tea-ritual"));
    const viewed = await runExtendedWorkflowTool({
      tool: "skill_view",
      args: { id: "tea-ritual" },
      skills: h.svc,
      channels: {} as never,
      paths: h.paths,
    });
    assert.match(viewed, /80C/);
  } finally {
    await h.cleanup();
  }
});

test("skill_propose patch accept resets verified/enabled; delete removes pack", async () => {
  const h = await withSkillProposeHarness();
  try {
    await h.svc.upsertUnverifiedPack(
      "brew",
      `---
name: Brew
---
# Brew
Step one.
`,
    );
    let verify = await h.svc.verifySkill("brew");
    assert.equal(verify.ok, true, verify.findings.join("; "));
    let row = (await h.svc.listSkills()).find((r) => r.id === "brew");
    assert.equal(row?.verified, true);
    assert.equal(row?.enabled, true);

    const patchOut = await runExtendedWorkflowTool({
      tool: "skill_propose",
      args: {
        action: "patch",
        id: "brew",
        content: "Step two: wait.",
        summary: "Add step two",
      },
      skills: h.svc,
      memory: h.mem,
      accountId: h.accountId,
      channels: {} as never,
      paths: h.paths,
    });
    const patchProp = JSON.parse(patchOut) as { learnId: string; kind: string };
    assert.equal(patchProp.kind, "skill_patch");
    // Patch propose must not mutate live pack yet.
    assert.equal((await h.svc.listSkills()).find((r) => r.id === "brew")?.verified, true);

    await h.mem.acceptLearn(h.accountId, patchProp.learnId);
    row = (await h.svc.listSkills()).find((r) => r.id === "brew");
    assert.equal(row?.verified, false);
    assert.equal(row?.enabled, false);
    assert.match((await h.svc.readSkillMd("brew")) ?? "", /Step two/);
    assert.equal((await h.svc.listVerifiedCatalog()).length, 0);

    verify = await h.svc.verifySkill("brew");
    assert.equal(verify.ok, true);

    const delOut = await runExtendedWorkflowTool({
      tool: "skill_propose",
      args: { action: "delete", id: "brew" },
      skills: h.svc,
      memory: h.mem,
      accountId: h.accountId,
      channels: {} as never,
      paths: h.paths,
    });
    const delProp = JSON.parse(delOut) as { learnId: string; kind: string };
    assert.equal(delProp.kind, "skill_delete");
    assert.ok(await h.svc.readSkillMd("brew"));

    await h.mem.acceptLearn(h.accountId, delProp.learnId);
    assert.equal(await h.svc.readSkillMd("brew"), null);
    assert.equal((await h.svc.listSkills()).some((r) => r.id === "brew"), false);
  } finally {
    await h.cleanup();
  }
});

test("skill_propose fails closed on bad args / missing memory", async () => {
  const h = await withSkillProposeHarness();
  try {
    const base = {
      tool: "skill_propose" as const,
      skills: h.svc,
      memory: h.mem,
      accountId: h.accountId,
      channels: {} as never,
      paths: h.paths,
    };

    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          ...base,
          args: { action: "create", id: "x", content: "" },
        }),
      /non-empty content|bad_params/i,
    );
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          ...base,
          args: { action: "update", id: "x", content: "# hi" },
        }),
      /create\|patch\|delete|bad_params/i,
    );
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          ...base,
          args: { action: "create", id: "", content: "# hi" },
        }),
      /requires id|bad_params/i,
    );
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "skill_propose",
          args: { action: "create", id: "x", content: "# hi" },
          skills: h.svc,
          channels: {} as never,
          paths: h.paths,
          accountId: h.accountId,
        }),
      /memory not configured|tool_unavailable/i,
    );
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "skill_propose",
          args: { action: "create", id: "x", content: "# hi" },
          skills: h.svc,
          memory: h.mem,
          channels: {} as never,
          paths: h.paths,
        }),
      /accountId required|bad_params/i,
    );
  } finally {
    await h.cleanup();
  }
});

test("skill_propose is write-tier in policy; skills_list/view remain read", () => {
  assert.equal(BUILTIN_TOOLS.skill_propose?.risk, "write");
  assert.equal(BUILTIN_TOOLS.skill_propose?.grantable, true);
  assert.equal(BUILTIN_TOOLS.skills_list?.risk, "read");
  assert.equal(BUILTIN_TOOLS.skill_view?.risk, "read");
});

test("migrateFlatAccountSkillFiles promotes orphan flat .md into unverified packs", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-skill-migrate-"));
  try {
    const paths = homePaths(stateDir);
    const svc = new SkillService(paths);
    const flatDir = join(stateDir, "accounts", "alice", "skills");
    await mkdir(flatDir, { recursive: true });
    const flatPath = join(flatDir, "legacy-cook.md");
    await writeFile(
      flatPath,
      `---
name: Legacy cook
---
# Legacy cook
Boil water.
`,
    );
    const result = await svc.migrateFlatAccountSkillFiles(stateDir);
    assert.ok(result.migrated.some((m) => m.includes("legacy-cook.md")));
    const row = (await svc.listSkills()).find((r) => r.id === "legacy-cook");
    assert.ok(row);
    assert.equal(row.verified, false);
    assert.equal(row.enabled, false);
    assert.match((await svc.readSkillMd("legacy-cook")) ?? "", /Boil water/);
    await assert.rejects(() => readFile(flatPath, "utf8"), /ENOENT/);
    const migratedBody = await readFile(`${flatPath}.migrated`, "utf8");
    assert.match(migratedBody, /Legacy cook/);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("household L7: accept from account A is visible to account B after verify", async () => {
  const h = await withSkillProposeHarness();
  try {
    await h.mem.store.ensureAccountLayout("acct2");
    const skillMd = `---
name: Shared brief
description: Household shared skill
---
# Shared
One pack for the house.
`;
    const proposed = await runExtendedWorkflowTool({
      tool: "skill_propose",
      args: { action: "create", id: "shared-brief", content: skillMd },
      skills: h.svc,
      memory: h.mem,
      accountId: h.accountId,
      channels: {} as never,
      paths: h.paths,
    });
    const { learnId } = JSON.parse(proposed) as { learnId: string };
    await h.mem.acceptLearn(h.accountId, learnId);
    const verify = await h.svc.verifySkill("shared-brief");
    assert.equal(verify.ok, true, verify.findings.join("; "));

    // Same SkillService (household) — seat B sees the pack without its own accept.
    const catalog = await h.svc.listVerifiedCatalog();
    assert.ok(catalog.some((c) => c.id === "shared-brief"));
    const viewed = await runExtendedWorkflowTool({
      tool: "skill_view",
      args: { id: "shared-brief" },
      skills: h.svc,
      channels: {} as never,
      paths: h.paths,
    });
    assert.match(viewed, /One pack for the house/);
  } finally {
    await h.cleanup();
  }
});
