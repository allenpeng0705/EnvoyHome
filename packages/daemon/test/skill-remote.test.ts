import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertPublicHttpsUrl,
  isBlockedHostname,
  parseClawHubRef,
  fetchSkillFromUrl,
  fetchSkillFromClawHub,
  searchClawHubSkills,
  SkillRemoteError,
} from "../dist/skill-remote.js";
import { SkillService } from "../dist/skills.js";
import { homePaths } from "../dist/home-paths.js";

const execFileAsync = promisify(execFile);

test("parseClawHubRef accepts owner/slug and page URLs", () => {
  assert.deepEqual(parseClawHubRef("@kelevis/demo"), {
    ownerHandle: "kelevis",
    slug: "demo",
  });
  assert.deepEqual(parseClawHubRef("kelevis/demo@1.0.0"), {
    ownerHandle: "kelevis",
    slug: "demo",
    version: "1.0.0",
  });
  assert.deepEqual(parseClawHubRef("https://clawhub.ai/kelevis/skills/demo"), {
    ownerHandle: "kelevis",
    slug: "demo",
  });
  assert.deepEqual(parseClawHubRef("demo"), { slug: "demo" });
});

test("assertPublicHttpsUrl blocks localhost and http", () => {
  assert.equal(isBlockedHostname("127.0.0.1"), true);
  assert.equal(isBlockedHostname("192.168.1.1"), true);
  assert.equal(isBlockedHostname("2130706433"), true); // decimal 127.0.0.1
  assert.equal(isBlockedHostname("127.1"), true); // short form
  assert.equal(isBlockedHostname("clawhub.ai"), false);
  assert.throws(() => assertPublicHttpsUrl("http://example.com/a.zip"), SkillRemoteError);
  assert.throws(() => assertPublicHttpsUrl("https://127.0.0.1/a.zip"), SkillRemoteError);
});

test("fetchSkillFromUrl installs from a mocked SKILL.md", async () => {
  const body = `---
name: From URL
---
I prefer quiet mornings for URL-installed skills.
`;
  const fetchImpl: typeof fetch = async () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "text/markdown" },
    });
  const fetched = await fetchSkillFromUrl("https://example.com/skills/from-url.md", fetchImpl);
  try {
    const md = await readFile(join(fetched.stagingDir, "SKILL.md"), "utf8");
    assert.match(md, /From URL/);
    assert.equal(fetched.suggestedId, "from-url");
  } finally {
    await rm(fetched.cleanupDir, { recursive: true, force: true });
  }
});

test("fetchSkillFromClawHub downloads zip via mocked registry", async () => {
  const work = await mkdtemp(join(tmpdir(), "eh-clawhub-zip-"));
  try {
    const skillDir = join(work, "pack");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: Hub Demo
---
Prefer oat milk when summarizing docs from ClawHub.
`,
    );
    const zipPath = join(work, "skill.zip");
    await execFileAsync("zip", ["-r", zipPath, "SKILL.md"], { cwd: skillDir });
    const zipBytes = await readFile(zipPath);

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/download")) {
        return new Response(zipBytes, {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      }
      return new Response("not found", { status: 404 });
    };

    const fetched = await fetchSkillFromClawHub("kelevis/demo", fetchImpl);
    try {
      const md = await readFile(join(fetched.stagingDir, "SKILL.md"), "utf8");
      assert.match(md, /Hub Demo/);
      assert.equal(fetched.suggestedId, "demo");
    } finally {
      await rm(fetched.cleanupDir, { recursive: true, force: true });
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("searchClawHubSkills normalizes Mesh-shaped API hits", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    assert.match(url, /\/api\/v1\/search\?/);
    assert.match(url, /q=weather/);
    return new Response(
      JSON.stringify({
        results: [
          {
            slug: "weather",
            name: "Weather",
            description: "Forecast helpers",
            owner: { handle: "alice" },
          },
          {
            slug: "wx",
            name: "WX",
            ownerHandle: "bob",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const hits = await searchClawHubSkills("weather", { limit: 20, fetchImpl });
  assert.equal(hits.length, 2);
  assert.equal(hits[0]!.ref, "alice/weather");
  assert.equal(hits[0]!.ownerHandle, "alice");
  assert.equal(hits[1]!.ref, "bob/wx");
});

test("installSkill clawhub source registers unverified skill", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-skill-hub-"));
  const work = await mkdtemp(join(tmpdir(), "eh-clawhub-zip2-"));
  try {
    const skillDir = join(work, "pack");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: Installed Hub
---
I always prefer dark mode for hub installs.
`,
    );
    const zipPath = join(work, "skill.zip");
    await execFileAsync("zip", ["-r", zipPath, "SKILL.md"], { cwd: skillDir });
    const zipBytes = await readFile(zipPath);
    const fetchImpl: typeof fetch = async () =>
      new Response(zipBytes, {
        status: 200,
        headers: { "content-type": "application/zip" },
      });

    const svc = new SkillService(homePaths(stateDir));
    const installed = await svc.installSkill({
      source: "clawhub",
      ref: "kelevis/demo",
      fetchImpl,
    });
    assert.equal(installed.needsReview, true);
    const listed = await svc.listSkills();
    const row = listed.find((s) => s.id === installed.id);
    assert.ok(row);
    assert.equal(row!.verified, false);
    assert.equal(row!.enabled, false);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    await rm(work, { recursive: true, force: true });
  }
});
