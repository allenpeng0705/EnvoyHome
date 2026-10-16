// V-UX-9 / V-UX-10 / V-UX-11: Diagram|YAML + draft + reusable LLM step templates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = join(root, "ui-dist", "app.js");

test("V-UX-9/10: ui-dist includes diagram mode, draft RPCs, and canvas host", async () => {
  const src = await readFile(appJs, "utf8");
  assert.match(src, /wf-mode-diagram/);
  assert.match(src, /wf-mode-yaml/);
  assert.match(src, /wf-canvas-host/);
  assert.match(src, /home\.draftWorkflow/);
  assert.match(src, /home\.draftWorkflowPrompt/);
  assert.match(src, /mountWorkflowCanvas/);
  assert.match(src, /demo_household_intake/);
  assert.match(src, /demo_morning_brief/);
  assert.match(src, /wf-try-complex/);
  assert.match(src, /wf-test-linear/);
  assert.match(src, /wf-demo-complex/);
  assert.match(src, /readOnly:\s*!0|readOnly:\s*true/);
  assert.match(src, /currentYaml/);
  assert.match(src, /preferFreshAiDraft/);
  assert.match(src, /draftAiInFlight/);
  assert.match(src, /mountOrRefreshCanvas/);
  assert.match(src, /reviseAction|Revise with AI/);
  assert.doesNotMatch(src, /wf-new-ai/);
});
test("V-UX-11: ui-dist wires step templates list/put + Save as step / Refine", async () => {
  const src = await readFile(appJs, "utf8");
  assert.match(src, /home\.listWorkflowStepTemplates/);
  assert.match(src, /home\.putWorkflowStepTemplate/);
  assert.match(src, /onSaveStepTemplate/);
  assert.match(src, /onCreateStepTemplate/);
  assert.match(src, /data-wf-create-template/);
  assert.match(src, /promptForm/);
  assert.match(src, /wf-prompt-backdrop/);
  assert.match(src, /refinePrompt/);
  assert.match(src, /data-wf-prompt-refine/);
  assert.match(src, /home\.draftWorkflowPrompt/);
  assert.match(src, /onDraftPrompt/);
  assert.match(src, /setStepTemplates/);
  assert.match(src, /saveAsStep/);
});
