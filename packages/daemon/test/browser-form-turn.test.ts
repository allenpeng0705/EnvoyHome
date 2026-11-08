// P2-H — park → answerChoice → apply / cancel / TTL (wired TurnService path).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import { startDaemon, type RunningDaemon } from "../dist/index.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { homePaths } from "../dist/home-paths.js";
import type { ChoiceAnswer } from "../dist/choice-store.js";

const daemons: RunningDaemon[] = [];
const dirs: string[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
});

function formMockPage() {
  let current = "https://example.com/login";
  const stamped = new Map<string, { tag: string; type?: string }>();
  const fills: Array<{ ref: string; value: string }> = [];
  return {
    fills,
    goto: async (u: string) => {
      current = u;
    },
    url: () => current,
    title: async () => "Sign in",
    content: async () => "<html></html>",
    innerText: async () => "Please sign in",
    locator: (sel: string) => {
      const m = /data-eh-ref="([^"]+)"/.exec(sel);
      const ref = m?.[1] ?? "";
      return {
        count: async () => (stamped.has(ref) ? 1 : 0),
        nth: () => ({
          click: async () => undefined,
          fill: async (text: string) => {
            fills.push({ ref, value: text });
          },
          selectOption: async () => undefined,
          dragTo: async () => undefined,
          evaluate: async <T>(fn: (el: Element) => T) =>
            fn({ checked: false, getAttribute: () => null } as unknown as Element),
          screenshot: async () => Buffer.from([]),
        }),
      };
    },
    evaluate: async <T>(
      fn: (() => T) | ((arg: unknown) => T),
      arg?: unknown,
    ) => {
      stamped.clear();
      const makeEl = (tag: string, attrs: Record<string, string | boolean>) => {
        const store: Record<string, string> = {};
        return {
          tagName: tag,
          setAttribute: (k: string, v: string) => {
            store[k] = v;
            if (k === "data-eh-ref") {
              stamped.set(v, {
                tag: tag.toLowerCase(),
                type: typeof attrs.type === "string" ? attrs.type : undefined,
              });
            }
          },
          getAttribute: (name: string) => {
            if (name === "role") return (attrs.role as string) ?? null;
            if (name === "name") return (attrs.name as string) ?? null;
            if (name === "aria-label") return (attrs["aria-label"] as string) ?? null;
            if (name === "aria-required") return attrs.required ? "true" : null;
            return store[name] ?? null;
          },
          hasAttribute: (name: string) => name === "required" && attrs.required === true,
          innerText: (attrs.label as string) || "",
          placeholder: "",
          type: (attrs.type as string) || "",
          value: "",
          options: [],
          getBoundingClientRect: () => ({ width: 10, height: 10 }),
        };
      };
      const els = [
        makeEl("INPUT", {
          type: "email",
          name: "email",
          "aria-label": "Email",
          required: true,
        }),
        makeEl("INPUT", {
          type: "password",
          name: "password",
          "aria-label": "Password",
          required: true,
        }),
        makeEl("BUTTON", { role: "button", "aria-label": "Sign in" }),
      ];
      const fakeDoc = { querySelectorAll: () => els };
      const fakeWin = {
        getComputedStyle: () => ({ display: "block", visibility: "visible" }),
      };
      const origDoc = (globalThis as { document?: unknown }).document;
      const origWin = (globalThis as { window?: unknown }).window;
      (globalThis as { document: unknown }).document = fakeDoc;
      (globalThis as { window: unknown }).window = fakeWin;
      try {
        if (arg !== undefined) return (fn as (a: unknown) => T)(arg);
        return (fn as () => T)();
      } finally {
        if (origDoc === undefined) delete (globalThis as { document?: unknown }).document;
        else (globalThis as { document: unknown }).document = origDoc;
        if (origWin === undefined) delete (globalThis as { window?: unknown }).window;
        else (globalThis as { window: unknown }).window = origWin;
      }
    },
    screenshot: async () => Buffer.from([1]),
    close: async () => undefined,
  };
}

async function bootWithBrowser() {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-form-turn-"));
  dirs.push(stateDir);
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, stateDir, hatchApiKey: "k-form" },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);
  await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
  await daemon.browserControl.setConfig({ enabled: true });
  const page = formMockPage();
  daemon.browserControl.pageFactory = async () => page as never;
  return { daemon, page, stateDir };
}

type FormField = {
  id: string;
  label: string;
  ref: string;
  kind: "text" | "password" | "otp" | "textarea" | "select" | "checkbox";
  sensitive: boolean;
  required?: boolean;
};

test("V-OUT-18: workflow-tools rejects agent apply_form", async () => {
  const { daemon, stateDir } = await bootWithBrowser();
  const paths = homePaths(stateDir);
  await assert.rejects(
    () =>
      runExtendedWorkflowTool({
        tool: "browser",
        args: {
          action: "apply_form",
          snapshotId: "s1",
          fields: [{ id: "f0", ref: "0", kind: "password", label: "Password", sensitive: true }],
          fieldValues: { f0: "secret" },
        },
        skills: daemon.skills,
        channels: daemon.channels,
        paths,
        accountId: "alice",
        origin: "attended",
        actuations: daemon.actuations,
        browserControl: daemon.browserControl,
      }),
    /daemon-internal|propose_form/i,
  );
});

test("V-OUT-16…19: park → answer applies before formApplied; cancel; TTL", async () => {
  const { daemon, page } = await bootWithBrowser();
  await daemon.browserControl.runTool(
    { action: "navigate", url: "https://example.com/login" },
    { accountId: "alice" },
  );
  const proposed = JSON.parse(
    await daemon.browserControl.runTool(
      { action: "propose_form" },
      { accountId: "alice" },
    ),
  ) as Record<string, unknown>;
  assert.equal(proposed.ok, true);
  const fields = proposed.fields as FormField[];

  const opened = await daemon.turns.openSession({ accountId: "alice" });
  const sessionId = String(opened.sessionId);
  const turnId = "turn-form-park-1";
  const { choiceWaiters } = daemon.turns.__registerActiveTurnForTests({
    turnId,
    accountId: "alice",
    sessionId,
  });

  const row = await daemon.turns.createChoiceAndEmit({
    accountId: "alice",
    sessionId,
    turnId,
    question: "Fill the page form (2 fields)",
    options: [],
    selection: "form",
    purpose: "browser_form",
    fields,
    snapshotId: String(proposed.snapshotId),
    targetId: String(proposed.targetId),
    profile: "managed",
    formOrigin: "attended",
    ...(typeof proposed.submitRef === "string"
      ? { submitRef: proposed.submitRef }
      : {}),
  });

  const parked = new Promise<ChoiceAnswer | null | "expired">((resolve) => {
    choiceWaiters.set(row.id, (a) => resolve(a));
  });

  const values: Record<string, string> = {};
  for (const f of fields) {
    values[f.id] = f.kind === "password" ? "secret-pw" : "user@ex.com";
  }

  const ans = await daemon.turns.answerChoice({
    accountId: "alice",
    id: row.id,
    fieldValues: values,
  });
  // formApplied only after real apply
  assert.equal(ans.formApplied, true);
  assert.ok(page.fills.length >= 2);
  assert.ok(!JSON.stringify(ans).includes("secret-pw"));

  const woke = await parked;
  assert.ok(woke && typeof woke === "object");
  assert.equal(woke.formApplyResult?.ok, true);
  assert.ok(!JSON.stringify(woke.formApplyResult).includes("secret-pw"));

  // Stale snapshot → formApplied false (no false success)
  await daemon.browserControl.runTool({ action: "snapshot" }, { accountId: "alice" });
  const snap2 = JSON.parse(
    await daemon.browserControl.runTool(
      { action: "propose_form" },
      { accountId: "alice" },
    ),
  ) as Record<string, unknown>;
  const rowStale = await daemon.turns.createChoiceAndEmit({
    accountId: "alice",
    sessionId,
    question: "Stale form",
    options: [],
    selection: "form",
    purpose: "browser_form",
    fields: snap2.fields as FormField[],
    snapshotId: "s-not-current",
    targetId: String(snap2.targetId),
    profile: "managed",
    formOrigin: "attended",
  });
  const staleAns = await daemon.turns.answerChoice({
    accountId: "alice",
    id: rowStale.id,
    fieldValues: values,
  });
  assert.equal(staleAns.formApplied, false);
  assert.equal(staleAns.formError, "stale_snapshot");

  // Cancel parked card — wake null, no fill
  const turnId2 = "turn-form-cancel";
  const { choiceWaiters: waiters2 } = daemon.turns.__registerActiveTurnForTests({
    turnId: turnId2,
    accountId: "alice",
    sessionId,
  });
  await daemon.browserControl.runTool({ action: "snapshot" }, { accountId: "alice" });
  const snap3 = JSON.parse(
    await daemon.browserControl.runTool(
      { action: "propose_form" },
      { accountId: "alice" },
    ),
  ) as Record<string, unknown>;
  const fillsBefore = page.fills.length;
  const rowCancel = await daemon.turns.createChoiceAndEmit({
    accountId: "alice",
    sessionId,
    turnId: turnId2,
    question: "Cancel me",
    options: [],
    selection: "form",
    purpose: "browser_form",
    fields: snap3.fields as FormField[],
    snapshotId: String(snap3.snapshotId),
    targetId: String(snap3.targetId),
    profile: "managed",
    formOrigin: "attended",
  });
  const canceledPark = new Promise<ChoiceAnswer | null | "expired">((resolve) => {
    waiters2.set(rowCancel.id, (a) => resolve(a));
  });
  const canceled = await daemon.turns.answerChoice({
    accountId: "alice",
    id: rowCancel.id,
    cancel: true,
  });
  assert.equal(canceled.canceled, true);
  assert.equal(await canceledPark, null);
  assert.equal(page.fills.length, fillsBefore);

  // TTL expiry
  const rowTtl = await daemon.turns.createChoiceAndEmit({
    accountId: "alice",
    sessionId,
    question: "Expire me",
    options: [],
    selection: "form",
    purpose: "browser_form",
    fields: snap3.fields as FormField[],
    snapshotId: String(snap3.snapshotId),
    targetId: String(snap3.targetId),
    profile: "managed",
    formOrigin: "attended",
    ttlSec: 0,
  });
  await flushLoop(5);
  assert.equal(await daemon.turns.choices.get("alice", rowTtl.id), undefined);
});
