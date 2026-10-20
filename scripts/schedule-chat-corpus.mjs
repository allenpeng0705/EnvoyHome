#!/usr/bin/env node
/**
 * Live schedule corpus against local daemon (loopback WS).
 * 1) home.proposeSchedule — deterministic NL (no LLM)
 * 2) home.sendMessage — chat turns with configured LLM (toolLoop schedule)
 *
 * Usage: node scripts/schedule-chat-corpus.mjs [--chat] [--propose-only]
 */
import WebSocket from "ws";

const WS_URL = process.env.ENVOYHOME_WS_URL || "ws://127.0.0.1:4780/ws";
const ACCOUNT = process.env.ENVOYHOME_ACCOUNT || "allen";
const wantChat = process.argv.includes("--chat") || !process.argv.includes("--propose-only");
const proposeOnly = process.argv.includes("--propose-only");

const REF_TZ = "Asia/Shanghai";
const clientContext = {
  clientNow: new Date().toISOString(),
  timeZone: REF_TZ,
  locale: "en",
};

/** @type {{ text: string, expect: "ok"|"ask"|"ambiguous", kind?: string, note?: string }[]} */
const PROPOSE = [
  // EN one-shot
  { text: "Remind me tomorrow at 9am to stretch", expect: "ok", kind: "at" },
  { text: "Remind me in 45 minutes to stand", expect: "ok", kind: "at" },
  { text: "Remind me next Monday at 10am to ship", expect: "ok", kind: "at" },
  // EN recurring
  { text: "Remind me every day at 7am to meditate", expect: "ok", kind: "cron" },
  { text: "Remind me every Monday at 9am to stand", expect: "ok", kind: "cron" },
  { text: "Remind me every month on the 15th at 9am to pay rent", expect: "ok", kind: "cron" },
  { text: "Remind me every year on January 1 at 9am to renew", expect: "ok", kind: "cron" },
  { text: "Remind me every month at 9am to pay", expect: "ask", note: "monthly needs day" },
  { text: "Remind me every year at 9am to renew", expect: "ask", note: "yearly needs month+day" },
  { text: "Remind me this weekend to relax", expect: "ask" },
  { text: "Remind me every other Monday at 9am to sync", expect: "ambiguous" },
  // ZH
  { text: "提醒我明天早上九点伸懒腰", expect: "ok", kind: "at" },
  { text: "每周一早上九点提醒我站起来", expect: "ok", kind: "cron" },
  { text: "每月15号上午9点提醒我交房租", expect: "ok", kind: "cron" },
  { text: "提醒我后天早上八点开会", expect: "ok", kind: "at" },
  // DE / FR / IT / JA / KO
  { text: "Erinnere mich morgen um 9 Uhr anrufen", expect: "ok", kind: "at" },
  { text: "Erinnere mich jeden Montag um 9 Uhr aufstehen", expect: "ok", kind: "cron" },
  { text: "Erinnere mich jeden Monat am 15. um 9 Uhr zahlen", expect: "ok", kind: "cron" },
  { text: "Rappelle-moi demain à 9h d'appeler", expect: "ok", kind: "at" },
  { text: "Rappelle-moi chaque lundi à 9h de me lever", expect: "ok", kind: "cron" },
  { text: "Ricordami domani alle 9 di chiamare", expect: "ok", kind: "at" },
  { text: "Ricordami ogni lunedì alle 9 di alzarmi", expect: "ok", kind: "cron" },
  { text: "明日の朝9時に電話をかけてとリマインドして", expect: "ok", kind: "at" },
  { text: "毎月15日9時に支払いをリマインドして", expect: "ok", kind: "cron" },
  { text: "내일 오전 9시에 전화하라고 알려줘", expect: "ok", kind: "at" },
  { text: "매월 15일 오전 9시에 납부하라고 알려줘", expect: "ok", kind: "cron" },
];

/** Chat sentences — LLM must call schedule propose (not invent WHEN). Confirm NOT auto-armed. */
const CHAT = [
  { text: "Remind me tomorrow at 8am to take out the trash", wantPropose: true },
  { text: "提醒我明天早上八点倒垃圾", wantPropose: true },
  { text: "Remind me every Monday at 9am to stretch — just propose, don't confirm yet", wantPropose: true },
  { text: "Remind me every month at 9am to pay rent", wantPropose: true, note: "should ask for day of month" },
  { text: "What repeating schedules do I have?", wantPropose: false },
];

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const pending = new Map();
    let nextId = 0;
    const events = [];

    ws.on("open", () => resolve({ ws, pending, events, rpc, waitEvent }));
    ws.on("error", reject);
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.event) {
        events.push(msg);
        return;
      }
      if (msg.id != null && pending.has(String(msg.id))) {
        const p = pending.get(String(msg.id));
        clearTimeout(p.t);
        pending.delete(String(msg.id));
        p.resolve(msg);
      }
    });

    function rpc(method, params = {}, timeoutMs = 20_000) {
      return new Promise((res, rej) => {
        const id = String(++nextId);
        const t = setTimeout(() => {
          pending.delete(id);
          rej(new Error(`timeout ${method}`));
        }, timeoutMs);
        pending.set(id, { resolve: res, reject: rej, t });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    function waitEvent(name, pred, timeoutMs = 120_000) {
      return new Promise((res, rej) => {
        const start = Date.now();
        const tick = () => {
          const hit = events.find(
            (e) => e.event === name && (!pred || pred(e.data ?? e.params ?? e)),
          );
          if (hit) return res(hit);
          if (Date.now() - start > timeoutMs) return rej(new Error(`waitEvent timeout ${name}`));
          setTimeout(tick, 200);
        };
        tick();
      });
    }
  });
}

function classifyPropose(msg) {
  if (msg.error) {
    const m = String(msg.error.message || msg.error);
    if (/missing_time|ambiguous|not_schedule|bad_params/i.test(m)) {
      if (/ambiguous/i.test(m)) return "ambiguous";
      return "ask";
    }
    return "error";
  }
  const r = msg.result || {};
  if (r.proposalId && r.kind) return "ok";
  if (r.error || r.reason) {
    if (r.reason === "ambiguous") return "ambiguous";
    return "ask";
  }
  return "error";
}

async function runPropose(client) {
  console.log("\n=== proposeSchedule corpus (no LLM) ===\n");
  let pass = 0;
  let fail = 0;
  for (const row of PROPOSE) {
    const locale =
      /[\u4e00-\u9fff]/.test(row.text) && !/[\u3040-\u30ff]/.test(row.text)
        ? "zh"
        : /[\u3040-\u30ff]/.test(row.text)
          ? "ja"
          : /[\uac00-\ud7af]/.test(row.text)
            ? "ko"
            : /Erinnere|jeden|um \d/.test(row.text)
              ? "de"
              : /Rappelle|chaque|à \d/.test(row.text)
                ? "fr"
                : /Ricordami|ogni|alle/.test(row.text)
                  ? "it"
                  : "en";
    const msg = await client.rpc(
      "home.proposeSchedule",
      {
        accountId: ACCOUNT,
        text: row.text,
        clientContext: { ...clientContext, locale },
      },
      30_000,
    );
    const got = classifyPropose(msg);
    const kind = msg.result?.kind;
    const ok =
      got === row.expect && (row.kind ? kind === row.kind || got !== "ok" : true);
    if (ok) pass++;
    else fail++;
    const mark = ok ? "PASS" : "FAIL";
    const detail =
      got === "ok"
        ? `${kind} · ${msg.result?.resolvedLocal || ""}`
        : JSON.stringify(msg.result || msg.error).slice(0, 160);
    console.log(`${mark} [${row.expect}/${got}] ${row.text}`);
    console.log(`      ${detail}${row.note ? ` (${row.note})` : ""}`);
  }
  console.log(`\npropose: ${pass} pass, ${fail} fail / ${PROPOSE.length}`);
  return { pass, fail };
}

async function runChat(client) {
  console.log("\n=== chat sendMessage corpus (LLM) ===\n");
  await client.rpc("home.subscribe", {
    events: ["home:turn-finished", "home:turn-delta", "home:approval-needed"],
  });

  const opened = await client.rpc("home.openSession", {
    accountId: ACCOUNT,
    purpose: "general",
    title: `schedule-corpus-${Date.now()}`,
  });
  if (opened.error) throw new Error(JSON.stringify(opened.error));
  const sessionId = opened.result?.sessionId;
  if (!sessionId) throw new Error("no sessionId");
  console.log(`session ${sessionId}`);

  let pass = 0;
  let fail = 0;
  for (const row of CHAT) {
    const before = client.events.length;
    const sent = await client.rpc(
      "home.sendMessage",
      {
        accountId: ACCOUNT,
        sessionId,
        text: row.text,
        clientContext: {
          ...clientContext,
          locale: /[\u4e00-\u9fff]/.test(row.text) ? "zh" : "en",
        },
      },
      60_000,
    );
    if (sent.error) {
      fail++;
      console.log(`FAIL send ${row.text}`);
      console.log(`      ${JSON.stringify(sent.error)}`);
      continue;
    }
    const turnId = sent.result?.turnId;
    try {
      await client.waitEvent(
        "home:turn-finished",
        (d) => !turnId || d?.turnId === turnId || d?.sessionId === sessionId,
        180_000,
      );
    } catch (e) {
      fail++;
      console.log(`FAIL timeout ${row.text}`);
      console.log(`      ${e.message}`);
      continue;
    }
    const transcript = await client.rpc("home.getTranscript", {
      accountId: ACCOUNT,
      sessionId,
    });
    const messages = transcript.result?.messages || [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const text = String(lastAssistant?.content || lastAssistant?.text || "");
    const newEvents = client.events.slice(before);
    const deltas = newEvents.filter((e) => e.event === "home:turn-delta");
    const deltaBlob = JSON.stringify(deltas).slice(0, 2000);
    const proposed =
      /schedule|propose|resolvedLocal|Proposed for|已提出|cron|reminder/i.test(text) ||
      /schedule|propose|resolvedLocal/i.test(deltaBlob);
    const askedDay =
      /day of month|哪一天|几号|am \d|le \d|on the \d/i.test(text) ||
      /missing_time|needs a day/i.test(text);
    let ok = true;
    let reason = "";
    if (row.wantPropose) {
      if (row.note?.includes("ask for day")) {
        ok = proposed || askedDay || /which day|几号|day of month/i.test(text);
        reason = ok ? "asked or proposed" : "expected ask-for-day or propose";
      } else {
        ok = proposed;
        reason = ok ? "saw propose/resolved" : "no schedule propose signal in assistant text";
      }
    } else {
      ok = true;
      reason = "list/query turn";
    }
    // Honesty: claiming set without propose is bad
    if (
      /\bI('ve| have) (set|scheduled)\b/i.test(text) &&
      !/propose|Proposed for|No schedule propose/i.test(text)
    ) {
      ok = false;
      reason = "claimed set without propose visibility";
    }
    if (ok) pass++;
    else fail++;
    console.log(`${ok ? "PASS" : "FAIL"} ${row.text}`);
    console.log(`      ${reason}`);
    console.log(`      assistant: ${text.slice(0, 280).replace(/\n/g, " / ")}`);
  }
  console.log(`\nchat: ${pass} pass, ${fail} fail / ${CHAT.length}`);
  return { pass, fail, sessionId };
}

async function main() {
  console.log(`WS ${WS_URL} account=${ACCOUNT}`);
  const client = await connect();
  try {
    const hello = await client.rpc("home.hello");
    if (hello.error) throw new Error(JSON.stringify(hello.error));
    console.log(`daemon ${hello.result?.version} state=${hello.result?.home?.stateDir}`);

    const p = await runPropose(client);
    let c = { pass: 0, fail: 0 };
    if (wantChat && !proposeOnly) {
      c = await runChat(client);
    }
    const fail = p.fail + c.fail;
    console.log(`\nTOTAL failures: ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
  } finally {
    client.ws.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
