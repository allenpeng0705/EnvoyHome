// P2-I / §9.5i — payment wall + outbound_handoff choice (V-OUT-21…23).

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertHandoffOpenUrl,
  detectBrowserBlocked,
  BrowserControlService,
} from "../dist/browser-control.js";
import {
  deriveBrowserFormFields,
  detectPaymentWall,
  isPaymentFieldElement,
} from "../dist/browser-form.js";
import { ChoiceStore } from "../dist/choice-store.js";
import { homePaths } from "../dist/home-paths.js";

const dirs: string[] = [];
test.after(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

test("V-OUT-21: payment fields skipped; payment wall blocked", () => {
  assert.equal(
    isPaymentFieldElement({
      ref: "1",
      name: "Card number",
      autocomplete: "cc-number",
      tag: "input",
      inputType: "text",
    }),
    true,
  );
  assert.equal(
    detectPaymentWall({
      url: "https://shop.example/checkout",
      title: "Checkout — payment",
      textSample: "Enter card details to place order. Apple Pay also available.",
    }),
    true,
  );
  const blocked = detectBrowserBlocked({
    url: "https://shop.example/checkout/pay",
    title: "Payment",
    textSample: "Credit card number CVV Place order",
    mode: "act",
  });
  assert.ok(blocked);
  assert.equal(blocked!.blocked, "payment");

  const derived = deriveBrowserFormFields([
    {
      ref: "1",
      tag: "input",
      inputType: "text",
      name: "Card number",
      autocomplete: "cc-number",
    },
    {
      ref: "2",
      tag: "input",
      inputType: "text",
      name: "Email",
    },
  ]);
  assert.ok(derived.skippedPaymentFields && derived.skippedPaymentFields >= 1);
  assert.ok(derived.fields.every((f) => !/card/i.test(f.label)));
});

test("V-OUT-23: handoff openUrl https-only + SSRF refuse; choice parks", async () => {
  assert.equal(assertHandoffOpenUrl("https://m.uber.com/looking").href, "https://m.uber.com/looking");
  assert.throws(() => assertHandoffOpenUrl("http://example.com/"), /https/);
  assert.throws(() => assertHandoffOpenUrl("taobao://item"), /https/);
  assert.throws(() => assertHandoffOpenUrl("https://169.254.169.254/"), /refused|unsafe/);

  const root = await mkdtemp(join(tmpdir(), "eh-handoff-"));
  dirs.push(root);
  const store = new ChoiceStore((id) => join(root, id));
  const row = await store.create({
    accountId: "alice",
    sessionId: "s1",
    question: "Finish pay in Uber",
    options: [{ id: "open", label: "Open" }],
    selection: "one",
    purpose: "outbound_handoff",
    openUrl: "https://m.uber.com/looking",
    steps: ["Confirm ride", "Pay in the Uber app"],
  });
  assert.equal(row.purpose, "outbound_handoff");
  assert.equal(row.openUrl, "https://m.uber.com/looking");
  assert.equal(row.steps?.length, 2);
  const ok = store.resolveAnswer(row, { optionId: "open" });
  assert.equal(ok.ok, true);

  await assert.rejects(
    () =>
      store.create({
        accountId: "alice",
        sessionId: "s1",
        question: "bad",
        options: [{ id: "open", label: "Open" }],
        selection: "one",
        purpose: "outbound_handoff",
        openUrl: "uber://riderequest",
      }),
    /https/,
  );
  await assert.rejects(
    () =>
      store.create({
        accountId: "alice",
        sessionId: "s1",
        question: "ssrf",
        options: [{ id: "open", label: "Open" }],
        selection: "one",
        purpose: "outbound_handoff",
        openUrl: "https://127.0.0.1/pay",
      }),
    /refused|unsafe/,
  );
  await assert.rejects(
    () =>
      store.create({
        accountId: "alice",
        sessionId: "s1",
        question: "ssrf-meta",
        options: [{ id: "open", label: "Open" }],
        selection: "one",
        purpose: "outbound_handoff",
        openUrl: "https://169.254.169.254/latest/meta-data/",
      }),
    /refused|unsafe/,
  );
});

test("V-OUT-23: propose_handoff tool validates openUrl without Playwright", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-handoff-svc-"));
  dirs.push(root);
  const paths = homePaths(root);
  const svc = new BrowserControlService(paths);
  await svc.load();
  await svc.setConfig({ enabled: true });
  svc.pageFactory = async () =>
    ({
      url: () => "about:blank",
      title: async () => "",
      innerText: async () => "",
      goto: async () => undefined,
      close: async () => undefined,
    }) as never;

  const raw = await svc.runTool(
    {
      action: "propose_handoff",
      openUrl: "https://www.amazon.com/dp/B08N5WRWNW",
      steps: ["Open product", "Checkout and pay in the Amazon app"],
      question: "Finish shopping in Amazon",
    },
    { accountId: "alice", origin: "attended" },
  );
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(parsed.ok, true);
  assert.equal(parsed.action, "propose_handoff");
  assert.match(String(parsed.openUrl), /^https:\/\/www\.amazon\.com/);

  await assert.rejects(
    () =>
      svc.runTool(
        { action: "propose_handoff", openUrl: "http://example.com/pay" },
        { accountId: "alice", origin: "attended" },
      ),
    /https/,
  );
});

/** Quiet account page with a hidden-looking card field — page chrome must NOT trip payment wall. */
function quietCardFieldPage() {
  let current = "https://example.com/account";
  const stamped = new Map<string, string>();
  const fills: Array<{ ref: string; value: string }> = [];
  return {
    fills,
    goto: async (u: string) => {
      current = u;
    },
    url: () => current,
    title: async () => "Account settings",
    content: async () => "<html></html>",
    innerText: async () => "Manage your profile and preferences.",
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
            if (k === "data-eh-ref") stamped.set(v, tag);
          },
          getAttribute: (name: string) => {
            if (name === "role") return (attrs.role as string) ?? null;
            if (name === "name") return (attrs.name as string) ?? null;
            if (name === "aria-label") return (attrs["aria-label"] as string) ?? null;
            if (name === "autocomplete") return (attrs.autocomplete as string) ?? null;
            return store[name] ?? null;
          },
          hasAttribute: () => false,
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
          type: "text",
          name: "display",
          "aria-label": "Display name",
        }),
        makeEl("INPUT", {
          type: "text",
          name: "cc",
          "aria-label": "Card number",
          autocomplete: "cc-number",
        }),
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

test("V-OUT-21: act type on payment field ref refused even when page chrome is quiet", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-act-pay-"));
  dirs.push(root);
  const paths = homePaths(root);
  const svc = new BrowserControlService(paths);
  await svc.load();
  await svc.setConfig({ enabled: true });
  const page = quietCardFieldPage();
  svc.pageFactory = async () => page as never;

  const navRaw = await svc.runTool(
    { action: "navigate", url: "https://example.com/account" },
    { accountId: "alice" },
  );
  const nav = JSON.parse(navRaw) as {
    snapshotId: string;
    snapshot?: { elements?: Array<{ ref: string; autocomplete?: string; name?: string }> };
  };
  const elements = nav.snapshot?.elements ?? [];
  const card = elements.find(
    (e) => e.autocomplete === "cc-number" || /card/i.test(String(e.name ?? "")),
  );
  assert.ok(card, `expected card field in snapshot; got ${JSON.stringify(elements)}`);
  const actRaw = await svc.runTool(
    {
      action: "act",
      kind: "type",
      ref: card!.ref,
      text: "4111111111111111",
      snapshotId: nav.snapshotId,
    },
    { accountId: "alice" },
  );
  const act = JSON.parse(actRaw) as Record<string, unknown>;
  assert.equal(act.ok, false);
  assert.equal(act.blocked, "payment");
  assert.equal(page.fills.length, 0);
});

test("V-OUT-23: outbound_handoff park → answerChoice wakes waiter", async () => {
  const { startDaemon } = await import("../dist/index.js");
  const { flushLoop, __resetActiveXForTests } = await import("@envoyhome/test-utils");
  const stateDir = await mkdtemp(join(tmpdir(), "eh-handoff-turn-"));
  dirs.push(stateDir);
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, stateDir, hatchApiKey: "k" },
    packageVersion: "0.0.0-test",
  });
  try {
    try {
      await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    } catch {
      /* exists */
    }
    const opened = await daemon.turns.openSession({ accountId: "alice" });
    const sessionId = String(opened.sessionId);
    const turnId = "turn-handoff-1";
    const { choiceWaiters } = daemon.turns.__registerActiveTurnForTests({
      turnId,
      accountId: "alice",
      sessionId,
    });
    const row = await daemon.turns.createChoiceAndEmit({
      accountId: "alice",
      sessionId,
      turnId,
      question: "Finish pay in Uber",
      options: [{ id: "open", label: "Open" }],
      selection: "one",
      purpose: "outbound_handoff",
      openUrl: "https://m.uber.com/looking",
      steps: ["Confirm", "Pay in app"],
    });
    assert.equal(row.openUrl, "https://m.uber.com/looking");
    const parked = new Promise<import("../dist/choice-store.js").ChoiceAnswer | null | "expired">(
      (resolve) => {
        choiceWaiters.set(row.id, (a) => resolve(a));
      },
    );
    const ans = await daemon.turns.answerChoice({
      accountId: "alice",
      id: row.id,
      optionId: "open",
    });
    assert.equal(ans.ok, true);
    assert.equal(ans.followUp, false);
    const woke = await parked;
    assert.ok(woke && typeof woke === "object");
    assert.equal((woke as { optionId?: string }).optionId, "open");
    await flushLoop();
  } finally {
    __resetActiveXForTests();
    await daemon.stop().catch(() => undefined);
  }
});
