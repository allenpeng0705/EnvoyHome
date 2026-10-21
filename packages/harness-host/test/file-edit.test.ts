import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApprovalSink,
  ApprovalStore,
  applyEditFile,
  applyUnifiedPatch,
  dispatchTool,
  parseAssistantToolCalls,
  toolSpec,
  unattendedRequiresGrant,
  type TurnContext,
} from "../dist/index.js";

test("V-P2-EDIT: edit_file unique oldString; refuse multi-match", () => {
  const once = applyEditFile("aaa\nbbb\naaa\n", {
    path: "x",
    oldString: "bbb",
    newString: "BBB",
  });
  assert.equal(once.ok, true);
  if (once.ok) assert.equal(once.content, "aaa\nBBB\naaa\n");

  const multi = applyEditFile("aaa\nbbb\naaa\n", {
    path: "x",
    oldString: "aaa",
    newString: "A",
  });
  assert.equal(multi.ok, false);

  const missing = applyEditFile("hello", { path: "x", oldString: "nope", newString: "x" });
  assert.equal(missing.ok, false);
});

test("V-P2-EDIT: edit_file line range", () => {
  const r = applyEditFile("one\ntwo\nthree\n", {
    path: "x",
    startLine: 2,
    endLine: 2,
    newString: "TWO",
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.content, "one\nTWO\nthree\n");
});

test("V-P2-EDIT: apply_patch single-file unified diff", () => {
  const existing = "line1\nline2\nline3\n";
  const patch = `--- a/documents/note.txt
+++ b/documents/note.txt
@@ -1,3 +1,3 @@
 line1
-line2
+LINE2
 line3
`;
  const r = applyUnifiedPatch((p) => (p === "documents/note.txt" ? existing : undefined), {
    patch,
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.path, "documents/note.txt");
    assert.equal(r.content, "line1\nLINE2\nline3\n");
  }
});

test("V-P2-EDIT-1: apply_patch refuses path escape and multi-file", () => {
  const bad = applyUnifiedPatch(() => "x", {
    patch: `--- a/../etc/passwd\n+++ b/../etc/passwd\n@@ -1 +1 @@\n-x\n+y\n`,
  });
  assert.equal(bad.ok, false);

  const multi = applyUnifiedPatch(() => "x", {
    patch: `--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-x
+y
--- a/b.txt
+++ b/b.txt
@@ -1 +1 @@
-x
+y
`,
  });
  assert.equal(multi.ok, false);
});

test("V-P2-EDIT: toolSpec + fence parse + unattended grant", () => {
  assert.equal(toolSpec("edit_file")?.risk, "write");
  assert.equal(toolSpec("apply_patch")?.grantable, true);
  assert.equal(
    unattendedRequiresGrant(toolSpec("edit_file")!, "unattended"),
    true,
  );
  assert.equal(
    unattendedRequiresGrant(toolSpec("write_file")!, "unattended"),
    false,
  );

  const { tools } = parseAssistantToolCalls(
    `\`\`\`envoyhome-tools
{"tool":"edit_file","args":{"path":"documents/a.md","oldString":"a","newString":"b"}}
\`\`\``,
    { allowSandbox: true },
  );
  assert.equal(tools.length, 1);
  assert.equal(tools[0]!.tool, "edit_file");
});

test("V-P2-EDIT: dispatchTool edit_file + apply_patch via SandboxFs", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-edit-"));
  try {
    const files = join(root, "files");
    await mkdir(join(files, "documents"), { recursive: true });
    const note = join(files, "documents", "note.txt");
    await writeFile(note, "alpha\nbeta\n", "utf8");
    const store = new ApprovalStore((id) => join(root, id));
    const ctx: TurnContext = {
      account_id: "alice",
      agent_id: "default",
      session_id: "s1",
      turn_id: "t-edit",
      sandbox_root: files,
      origin: "attended",
      policy_snapshot: { origin: "attended", tool_policy: "standard", model_mode: "local" },
    };
    const fs = {
      writeFile: async (rel: string, content: string) => {
        await writeFile(join(files, rel), content, "utf8");
      },
      readFile: async (rel: string) => readFile(join(files, rel), "utf8"),
    };
    const deps = {
      ctx,
      provider: null as never,
      approval: new ApprovalSink({
        store,
        policy: ctx.policy_snapshot,
        toolPolicy: "standard",
      }),
      fs,
    };

    const edited = await dispatchTool(deps as never, {
      tool: "edit_file",
      args: { path: "documents/note.txt", oldString: "beta", newString: "BETA" },
    });
    assert.equal(edited.ok, true);
    assert.match((edited as { output: string }).output, /Edited/);
    assert.equal(await readFile(note, "utf8"), "alpha\nBETA\n");

    const patched = await dispatchTool(deps as never, {
      tool: "apply_patch",
      args: {
        path: "documents/note.txt",
        patch: `--- a/documents/note.txt
+++ b/documents/note.txt
@@ -1,2 +1,2 @@
-alpha
+ALPHA
 BETA
`,
      },
    });
    assert.equal(patched.ok, true);
    assert.equal(await readFile(note, "utf8"), "ALPHA\nBETA\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
