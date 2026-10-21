import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChoiceStore } from "../dist/choice-store.js";

async function withStore(fn: (store: ChoiceStore, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "eh-choice-"));
  const store = new ChoiceStore((accountId) => join(root, accountId));
  try {
    await fn(store, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("V-UX-14: create + list + answer one option", async () => {
  await withStore(async (store) => {
    const row = await store.create({
      accountId: "alice",
      sessionId: "s1",
      question: "Which lamp?",
      options: [
        { id: "a", label: "Hall" },
        { id: "b", label: "Kitchen" },
      ],
      selection: "one",
      purpose: "home_disambiguation",
    });
    assert.ok(row.id);
    assert.equal(row.selection, "one");
    const listed = await store.list("alice", "s1");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.id, row.id);

    const ok = store.resolveAnswer(row, { optionId: "a" });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.deepEqual(ok.optionIds, ["a"]);
      assert.deepEqual(ok.labels, ["Hall"]);
    }
    const bad = store.resolveAnswer(row, { optionIds: ["a", "b"] });
    assert.equal(bad.ok, false);

    await store.remove("alice", row.id);
    assert.equal((await store.list("alice")).length, 0);
  });
});

test("V-UX-14: many + text selection validate", async () => {
  await withStore(async (store) => {
    const many = await store.create({
      accountId: "alice",
      sessionId: "s1",
      question: "Pick rooms",
      options: [
        { id: "1", label: "A" },
        { id: "2", label: "B" },
      ],
      selection: "many",
      purpose: "general",
    });
    const m = store.resolveAnswer(many, { optionIds: ["1", "2"] });
    assert.equal(m.ok, true);
    if (m.ok) assert.deepEqual(m.labels, ["A", "B"]);

    const text = await store.create({
      accountId: "alice",
      sessionId: "s1",
      question: "What time?",
      options: [],
      selection: "text",
      purpose: "ask_user",
    });
    assert.equal(store.resolveAnswer(text, { text: "  9am " }).ok, true);
    assert.equal(store.resolveAnswer(text, { text: "  " }).ok, false);
  });
});

test("V-UX-14: expired choice disappears from get/list", async () => {
  const expired: string[] = [];
  const root = await mkdtemp(join(tmpdir(), "eh-choice-exp-"));
  const store = new ChoiceStore(
    (accountId) => join(root, accountId),
    (row) => expired.push(row.id),
  );
  try {
    const row = await store.create({
      accountId: "alice",
      sessionId: "s1",
      question: "Soon gone",
      options: [{ id: "x", label: "X" }],
      selection: "one",
      purpose: "general",
      ttlSec: 0,
    });
    await new Promise((r) => setTimeout(r, 5));
    const got = await store.get("alice", row.id);
    assert.equal(got, undefined);
    assert.equal((await store.list("alice")).length, 0);
    assert.ok(expired.includes(row.id));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-UX-14: list filters by sessionId", async () => {
  await withStore(async (store) => {
    await store.create({
      accountId: "alice",
      sessionId: "s1",
      question: "A",
      options: [{ id: "1", label: "one" }],
      selection: "one",
      purpose: "general",
    });
    await store.create({
      accountId: "alice",
      sessionId: "s2",
      question: "B",
      options: [{ id: "2", label: "two" }],
      selection: "one",
      purpose: "ask_user",
    });
    assert.equal((await store.list("alice")).length, 2);
    assert.equal((await store.list("alice", "s1")).length, 1);
    assert.equal((await store.list("alice", "s1"))[0]!.sessionId, "s1");
    assert.equal((await store.list("alice", "s2"))[0]!.question, "B");
  });
});

test("V-UX-14: resolveAnswer rejects unknown option and empty one", async () => {
  await withStore(async (store) => {
    const row = await store.create({
      accountId: "alice",
      sessionId: "s1",
      question: "Pick",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      selection: "one",
      purpose: "home_disambiguation",
    });
    assert.equal(store.resolveAnswer(row, { optionId: "z" }).ok, false);
    assert.equal(store.resolveAnswer(row, {}).ok, false);
    assert.equal(store.resolveAnswer(row, { optionIds: ["a", "b"] }).ok, false);
  });
});

test("V-UX-14: create requires options unless selection=text", async () => {
  await withStore(async (store) => {
    await assert.rejects(
      () =>
        store.create({
          accountId: "alice",
          sessionId: "s1",
          question: "?",
          options: [],
          selection: "one",
          purpose: "general",
        }),
      /bad_params|options/i,
    );
    const text = await store.create({
      accountId: "alice",
      sessionId: "s1",
      question: "Free text?",
      options: [],
      selection: "text",
      purpose: "ask_user",
    });
    assert.equal(text.selection, "text");
  });
});
