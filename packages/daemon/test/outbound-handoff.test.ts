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
    /https openUrl/,
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
