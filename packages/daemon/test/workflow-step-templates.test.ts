// Reusable LLM step templates — Design §7 / V-UX-11.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homePaths } from "../dist/home-paths.js";
import { WorkflowStepTemplateStore } from "../dist/workflow-step-templates.js";

async function tmpState(): Promise<string> {
  return mkdtemp(join(tmpdir(), "eh-step-tmpl-"));
}

test("put/list/remove global templates", async () => {
  const stateDir = await tmpState();
  const store = new WorkflowStepTemplateStore(homePaths(stateDir));

  const saved = await store.put({
    label: "Urgency bucket",
    nodeType: "llm_fill",
    prompt: "Reply with exactly normal or urgent.",
    out: "urgency",
  });
  assert.equal(saved.id, "urgency_bucket");
  assert.equal(saved.source, "global");
  assert.equal(saved.nodeType, "llm_fill");

  const listed = await store.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.prompt, "Reply with exactly normal or urgent.");
  assert.equal(listed[0]?.out, "urgency");

  const raw = await readFile(homePaths(stateDir).workflowStepTemplatesJson, "utf8");
  assert.match(raw, /urgency_bucket/);

  assert.equal(await store.remove("urgency_bucket"), true);
  assert.equal((await store.list()).length, 0);
  assert.equal(await store.remove("urgency_bucket"), false);
});

test("account overlay wins over global for same id", async () => {
  const stateDir = await tmpState();
  const store = new WorkflowStepTemplateStore(homePaths(stateDir));

  await store.put({
    id: "brief",
    label: "Global brief",
    nodeType: "llm_summarize",
    prompt: "global prompt",
  });
  await store.put({
    id: "brief",
    label: "Alice brief",
    nodeType: "llm_summarize",
    prompt: "account prompt",
    accountId: "alice",
  });

  const forAlice = await store.list("alice");
  assert.equal(forAlice.length, 1);
  assert.equal(forAlice[0]?.label, "Alice brief");
  assert.equal(forAlice[0]?.source, "account");
  assert.equal(forAlice[0]?.prompt, "account prompt");

  const globalOnly = await store.list();
  assert.equal(globalOnly.length, 1);
  assert.equal(globalOnly[0]?.label, "Global brief");
  assert.equal(globalOnly[0]?.source, "global");

  assert.equal(await store.remove("brief", "alice"), true);
  const after = await store.list("alice");
  assert.equal(after.length, 1);
  assert.equal(after[0]?.source, "global");
});

test("non-Latin labels get a stable ascii id and remain listable", async () => {
  const stateDir = await tmpState();
  const store = new WorkflowStepTemplateStore(homePaths(stateDir));
  const mixed = await store.put({
    label: "提取 JSON",
    nodeType: "llm_fill",
    prompt: "Return only a JSON object.",
  });
  assert.equal(mixed.id, "json");
  assert.equal(mixed.label, "提取 JSON");

  const cjk = await store.put({
    label: "提取结构化结果",
    nodeType: "llm_fill",
    prompt: "Return only a JSON object.",
  });
  assert.match(cjk.id, /^step_[a-z0-9]+$/);
  assert.equal(cjk.label, "提取结构化结果");

  const listed = await store.list();
  assert.equal(listed.length, 2);
  assert.ok(listed.some((t) => t.id === mixed.id && t.label === mixed.label));
  assert.ok(listed.some((t) => t.id === cjk.id && t.label === cjk.label));
});

test("rejects empty label/prompt and invalid nodeType", async () => {
  const stateDir = await tmpState();
  const store = new WorkflowStepTemplateStore(homePaths(stateDir));

  await assert.rejects(
    () =>
      store.put({
        label: "  ",
        nodeType: "llm_fill",
        prompt: "x",
      }),
    /label required/,
  );
  await assert.rejects(
    () =>
      store.put({
        label: "x",
        nodeType: "llm_fill",
        prompt: "  ",
      }),
    /prompt required/,
  );
  await assert.rejects(
    () =>
      store.put({
        label: "x",
        // @ts-expect-error intentional
        nodeType: "tool",
        prompt: "y",
      }),
    /nodeType/,
  );
});
