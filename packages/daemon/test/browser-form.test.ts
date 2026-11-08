// V-OUT-16…19 — browser form assist (§9.5g.3 / P2-H).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BrowserControlService,
  deriveBrowserFormFields,
  detectBrowserBlocked,
} from "../dist/browser-control.js";
import { ChoiceStore } from "../dist/choice-store.js";
import { homePaths } from "../dist/home-paths.js";

const dirs: string[] = [];

after(async () => {
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("V-OUT-16: derive fields from snapshot — login (2) and booking (N>2), not fixed template", () => {
  const login = deriveBrowserFormFields([
    { ref: "0", tag: "a", role: "link", name: "Home" },
    {
      ref: "1",
      tag: "input",
      role: "textbox",
      inputType: "email",
      name: "Email",
      nameAttr: "email",
      required: true,
    },
    {
      ref: "2",
      tag: "input",
      role: "textbox",
      inputType: "password",
      name: "Password",
      nameAttr: "password",
      required: true,
    },
    { ref: "3", tag: "button", role: "button", name: "Sign in" },
  ]);
  assert.equal(login.fields.length, 2);
  assert.equal(login.fields[0]!.kind, "text");
  assert.equal(login.fields[1]!.kind, "password");
  assert.equal(login.fields[1]!.sensitive, true);
  assert.equal(login.submitRef, "3");

  const booking = deriveBrowserFormFields([
    { ref: "0", tag: "input", role: "textbox", inputType: "text", name: "Guest name" },
    { ref: "1", tag: "input", role: "textbox", inputType: "email", name: "Email" },
    { ref: "2", tag: "input", role: "textbox", inputType: "tel", name: "Phone" },
    {
      ref: "3",
      tag: "select",
      role: "combobox",
      name: "Room",
      selectOptions: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    },
    { ref: "4", tag: "input", role: "checkbox", inputType: "checkbox", name: "Newsletter" },
    { ref: "5", tag: "textarea", role: "textbox", name: "Notes" },
    { ref: "6", tag: "button", role: "button", name: "Continue" },
  ]);
  assert.ok(booking.fields.length >= 5);
  assert.ok(booking.fields.some((f) => f.kind === "select"));
  assert.ok(booking.fields.some((f) => f.kind === "checkbox"));
  assert.ok(booking.fields.some((f) => f.kind === "textarea"));
  assert.notEqual(booking.fields.length, login.fields.length);
});

test("V-OUT-19: captcha/challenge pages do not open form cards; choice store form shape", async () => {
  const blocked = detectBrowserBlocked({
    url: "https://example.com/challenge",
    title: "Just a moment...",
    textSample: "Checking your browser before accessing. Cloudflare captcha.",
    mode: "act",
  });
  assert.ok(blocked);
  assert.ok(blocked!.blocked === "captcha" || blocked!.blocked === "challenge");

  const root = await mkdtemp(join(tmpdir(), "eh-form-choice-"));
  dirs.push(root);
  const store = new ChoiceStore((id) => join(root, id));
  const row = await store.create({
    accountId: "alice",
    sessionId: "s1",
    question: "Fill the page form (2 fields)",
    options: [],
    selection: "form",
    purpose: "browser_form",
    snapshotId: "s1",
    targetId: "t1",
    profile: "managed",
    fields: [
      { id: "f0", label: "Email", ref: "1", kind: "text", sensitive: false, required: true },
      { id: "f1", label: "Password", ref: "2", kind: "password", sensitive: true, required: true },
    ],
  });
  assert.equal(row.selection, "form");
  assert.equal(row.fields!.length, 2);
  const ok = store.resolveAnswer(row, {
    fieldValues: { f0: "a@b.co", f1: "secret" },
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.fieldValues!.f1, "secret");
    assert.ok(ok.labels.some((l) => l.includes("••••")));
    assert.ok(!ok.labels.some((l) => l.includes("secret")));
  }
});

function formMockPage(opts?: { withCheckbox?: boolean }) {
  let current = "https://example.com/login";
  const stamped = new Map<string, { tag: string; type?: string }>();
  const fills: Array<{ ref: string; value: string }> = [];
  const clicks: string[] = [];
  const checkedByRef = new Map<string, boolean>();
  return {
    fills,
    clicks,
    checkedByRef,
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
          click: async () => {
            clicks.push(ref);
            const cur = checkedByRef.get(ref) ?? false;
            checkedByRef.set(ref, !cur);
          },
          fill: async (text: string) => {
            fills.push({ ref, value: text });
          },
          selectOption: async () => undefined,
          dragTo: async () => undefined,
          evaluate: async <T>(fn: (el: Element) => T) => {
            const fake = {
              checked: checkedByRef.get(ref) ?? false,
              getAttribute: (name: string) =>
                name === "aria-checked"
                  ? checkedByRef.get(ref)
                    ? "true"
                    : "false"
                  : null,
            };
            return fn(fake as unknown as Element);
          },
          screenshot: async () => Buffer.from([]),
        }),
      };
    },
    evaluate: async <T>(
      fn: (() => T) | ((arg: unknown) => T),
      arg?: unknown,
    ) => {
      stamped.clear();
      checkedByRef.clear();
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
              if (attrs.type === "checkbox") {
                checkedByRef.set(v, false);
              }
            }
          },
          getAttribute: (name: string) => {
            if (name === "role") return (attrs.role as string) ?? null;
            if (name === "name") return (attrs.name as string) ?? null;
            if (name === "aria-label") return (attrs["aria-label"] as string) ?? null;
            if (name === "autocomplete") return (attrs.autocomplete as string) ?? null;
            if (name === "aria-required") return attrs.required ? "true" : null;
            return store[name] ?? null;
          },
          hasAttribute: (name: string) => name === "required" && attrs.required === true,
          innerText: (attrs.label as string) || "",
          placeholder: (attrs.placeholder as string) || "",
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
        makeEl("INPUT", {
          type: "text",
          name: "notes",
          "aria-label": "Booking notes",
        }),
        ...(opts?.withCheckbox
          ? [
              makeEl("INPUT", {
                type: "checkbox",
                name: "newsletter",
                "aria-label": "Newsletter",
              }),
            ]
          : []),
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
    waitForLoadState: async () => undefined,
    keyboard: { press: async () => undefined },
    close: async () => undefined,
  };
}

async function freshFormSvc() {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-form-browser-"));
  dirs.push(stateDir);
  const paths = homePaths(stateDir);
  const svc = new BrowserControlService(paths);
  await svc.load();
  await svc.setConfig({ enabled: true });
  const page = formMockPage();
  svc.pageFactory = async () => page as never;
  return { svc, page };
}

test("V-OUT-16/19: propose_form derives N fields; captcha refuse; apply under one snapshot", async () => {
  const { svc, page } = await freshFormSvc();
  await svc.runTool(
    { action: "navigate", url: "https://example.com/login" },
    { accountId: "alice" },
  );
  const proposed = JSON.parse(
    await svc.runTool({ action: "propose_form" }, { accountId: "alice" }),
  ) as Record<string, unknown>;
  assert.equal(proposed.ok, true);
  assert.ok(Array.isArray(proposed.fields));
  const fields = proposed.fields as Array<Record<string, unknown>>;
  assert.ok(fields.length >= 2);
  assert.ok(fields.some((f) => f.kind === "password"));
  assert.ok(fields.some((f) => f.kind === "text"));
  // Not a fixed login-only template — booking notes field present.
  assert.ok(fields.some((f) => String(f.label).toLowerCase().includes("notes")));
  const snap = String(proposed.snapshotId);

  // Agent-facing apply_form must be refused (no internal flag).
  await assert.rejects(
    () =>
      svc.runTool(
        {
          action: "apply_form",
          snapshotId: snap,
          targetId: proposed.targetId,
          fields,
          fieldValues: { f0: "a@b.co", f1: "secret" },
        },
        { accountId: "alice" },
      ),
    /daemon-internal|propose_form/i,
  );

  // V-OUT-17: stale snapshotId → no fill (daemon-internal path)
  const stale = JSON.parse(
    await svc.runTool(
      {
        action: "apply_form",
        snapshotId: "s999",
        targetId: proposed.targetId,
        fields,
        fieldValues: { f0: "a@b.co", f1: "secret" },
      },
      { accountId: "alice", internal: true },
    ),
  ) as Record<string, unknown>;
  assert.equal(stale.ok, false);
  assert.equal(stale.error, "stale_snapshot");
  assert.equal(page.fills.length, 0);

  // V-OUT-19: one apply fills all
  const values: Record<string, string> = {};
  for (const f of fields) {
    const id = String(f.id);
    values[id] = f.kind === "password" ? "secret-pw" : `val-${id}`;
  }
  const applied = JSON.parse(
    await svc.runTool(
      {
        action: "apply_form",
        snapshotId: snap,
        targetId: proposed.targetId,
        fields,
        fieldValues: values,
        ...(proposed.submitRef ? { submitRef: proposed.submitRef } : {}),
      },
      { accountId: "alice", internal: true },
    ),
  ) as Record<string, unknown>;
  assert.equal(applied.ok, true);
  assert.equal(applied.snapshotConsumed, true);
  assert.ok(Number(applied.filledCount) >= 2);
  assert.ok(page.fills.length >= 2);
  // V-OUT-18: response must not echo password plaintext
  const raw = JSON.stringify(applied);
  assert.ok(!raw.includes("secret-pw"));
});

test("V-OUT-17: mismatched snapshotId on propose_form fails closed", async () => {
  const { svc } = await freshFormSvc();
  await svc.runTool(
    { action: "navigate", url: "https://example.com/login" },
    { accountId: "alice" },
  );
  await svc.runTool({ action: "snapshot" }, { accountId: "alice" });
  const bad = JSON.parse(
    await svc.runTool(
      { action: "propose_form", snapshotId: "nope" },
      { accountId: "alice" },
    ),
  ) as Record<string, unknown>;
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "stale_snapshot");
});

test("V-OUT-18: unattended refuses sensitive form propose/apply", async () => {
  const { svc } = await freshFormSvc();
  await svc.setConfig({ enabled: true, unattendedEnabled: true });
  await svc.runTool(
    { action: "navigate", url: "https://example.com/login" },
    { accountId: "alice", origin: "attended" },
  );
  const proposed = JSON.parse(
    await svc.runTool(
      { action: "propose_form" },
      { accountId: "alice", origin: "unattended" },
    ),
  ) as Record<string, unknown>;
  assert.equal(proposed.ok, false);
  assert.equal(proposed.error, "sensitive_unattended");
});

test("V-OUT-19: propose_form returns blocked on captcha page", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-form-captcha-"));
  dirs.push(stateDir);
  const svc = new BrowserControlService(homePaths(stateDir));
  await svc.load();
  await svc.setConfig({ enabled: true });
  svc.pageFactory = async () =>
    ({
      goto: async () => undefined,
      url: () => "https://example.com/cdn-cgi/challenge",
      title: async () => "Just a moment...",
      content: async () => "<html></html>",
      innerText: async () => "Checking your browser. Please complete the captcha.",
      locator: () => ({
        count: async () => 0,
        nth: () => ({
          click: async () => undefined,
          fill: async () => undefined,
          selectOption: async () => undefined,
          dragTo: async () => undefined,
          evaluate: async <T>(fn: (el: Element) => T) => fn({} as Element),
          screenshot: async () => Buffer.from([]),
        }),
      }),
      evaluate: async () => [],
      screenshot: async () => Buffer.from([1]),
      close: async () => undefined,
    }) as never;
  await svc.runTool(
    { action: "navigate", url: "https://example.com/cdn-cgi/challenge" },
    { accountId: "alice" },
  );
  const proposed = JSON.parse(
    await svc.runTool({ action: "propose_form" }, { accountId: "alice" }),
  ) as Record<string, unknown>;
  assert.equal(proposed.ok, false);
  assert.ok(proposed.blocked === "captcha" || proposed.blocked === "challenge");
});

test("V-OUT-19: checkbox apply respects fieldValues (no blind toggle)", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-form-cb-"));
  dirs.push(stateDir);
  const paths = homePaths(stateDir);
  const svc = new BrowserControlService(paths);
  await svc.load();
  await svc.setConfig({ enabled: true });
  const page = formMockPage({ withCheckbox: true });
  svc.pageFactory = async () => page as never;

  await svc.runTool(
    { action: "navigate", url: "https://example.com/login" },
    { accountId: "alice" },
  );
  const proposed = JSON.parse(
    await svc.runTool({ action: "propose_form" }, { accountId: "alice" }),
  ) as Record<string, unknown>;
  const fields = proposed.fields as Array<Record<string, unknown>>;
  const cb = fields.find((f) => f.kind === "checkbox");
  assert.ok(cb);
  const values: Record<string, string | boolean> = {};
  for (const f of fields) {
    if (f.kind === "checkbox") values[String(f.id)] = false; // already unchecked — no click
    else if (f.kind === "password") values[String(f.id)] = "x";
    else values[String(f.id)] = "y";
  }
  const beforeClicks = page.clicks.length;
  await svc.runTool(
    {
      action: "apply_form",
      snapshotId: proposed.snapshotId,
      targetId: proposed.targetId,
      fields,
      fieldValues: values,
    },
    { accountId: "alice", internal: true },
  );
  // Checkbox was unchecked + want false → must not click the checkbox ref.
  assert.ok(!page.clicks.includes(String(cb!.ref)));
  // Submit button may still be clicked — that's fine; checkbox ref alone matters.
  assert.equal(page.clicks.filter((r) => r === String(cb!.ref)).length, 0);
  void beforeClicks;
});

test("V-OUT-17/19: apply_form refuses missing required fields", async () => {
  const { svc } = await freshFormSvc();
  await svc.runTool(
    { action: "navigate", url: "https://example.com/login" },
    { accountId: "alice" },
  );
  const proposed = JSON.parse(
    await svc.runTool({ action: "propose_form" }, { accountId: "alice" }),
  ) as Record<string, unknown>;
  const fields = (proposed.fields as Array<Record<string, unknown>>).map((f) => ({
    ...f,
    required: true,
  }));
  const denied = JSON.parse(
    await svc.runTool(
      {
        action: "apply_form",
        snapshotId: proposed.snapshotId,
        targetId: proposed.targetId,
        fields,
        fieldValues: {}, // missing required
      },
      { accountId: "alice", internal: true },
    ),
  ) as Record<string, unknown>;
  assert.equal(denied.ok, false);
  assert.equal(denied.error, "field_required");
});
