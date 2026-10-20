#!/usr/bin/env node
/**
 * Live schedule corpus against local loopback daemon (ws://127.0.0.1:4780/ws).
 * Layer A: home.proposeSchedule (deterministic resolver)
 * Layer B: home.sendMessage chat turns (configured LLM + schedule tool)
 */
import WebSocket from "ws";
import { randomUUID } from "node:crypto";

const WS_URL = process.env.ENVOYHOME_WS ?? "ws://127.0.0.1:4780/ws";
const ACCOUNT = process.env.ENVOYHOME_ACCOUNT ?? "allen";
const CHAT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS ?? 90_000);

const PROPOSE_CORPUS = [
  // EN — once / repeating / ask
  { text: "Remind me tomorrow at 9am to stretch", want: "ok", kind: "at" },
  { text: "Remind me every Monday at 9am to stand", want: "ok", kind: "cron" },
  { text: "Remind me every month on the 15th at 9am to pay rent", want: "ok", kind: "cron" },
  { text: "Remind me every year on January 1 at 9am to renew", want: "ok", kind: "cron" },
  { text: "Remind me every month at 9am to pay rent", want: "ask" },
  { text: "Remind me this weekend to relax", want: "ask" },
  { text: "Remind me next Monday at 9am to ship", want: "ok", kind: "at" },
  { text: "Remind me day after tomorrow at 10am to call", want: "ok", kind: "at" },
  // ZH
  { text: "提醒我明天早上九点拉伸", want: "ok", kind: "at", locale: "zh" },
  { text: "每周一早上九点提醒我站起来", want: "ok", kind: "cron", locale: "zh" },
  { text: "每月15号上午9点提醒我交房租", want: "ok", kind: "cron", locale: "zh" },
  { text: "提醒我后天早上九点开会", want: "ok", kind: "at", locale: "zh" },
  // DE / FR / IT / JA / KO
  { text: "Erinnere mich morgen um 9 Uhr anrufen", want: "ok", kind: "at", locale: "de" },
  { text: "Erinnere mich jeden Montag um 9 Uhr aufstehen", want: "ok", kind: "cron", locale: "de" },
  { text: "Rappelle-moi demain à 9h d'appeler", want: "ok", kind: "at", locale: "fr" },
  { text: "Rappelle-moi chaque lundi à 9h de me lever", want: "ok", kind: "cron", locale: "fr" },
  { text: "Ricordami domani alle 9 di chiamare", want: "ok", kind: "at", locale: "it" },
  { text: "Ricordami ogni lunedì alle 9 di alzarmi", want: "ok", kind: "cron", locale: "it" },
  { text: "明日の朝9時に電話をかけてとリマインドして", want: "ok", kind: "at", locale: "ja" },
  { text: "毎週月曜9時に立ち上がるようリマインドして", want: "ok", kind: "cron", locale: "ja" },
  { text: "내일 오전 9시에 전화하라고 알려줘", want: "ok", kind: "at", locale: "ko" },
  { text: "매주 월요일 오전 9시에 일어나라고 알려줘", want: "ok", kind: "cron", locale: "ko" },
];

/** Chat turns — LLM should call schedule propose (not invent WHEN). */
const CHAT_CORPUS = [
  { text: "Remind me tomorrow at 8am to take out the trash", expectPropose: true },
  { text: "提醒我每天早上七点喝水", expectPropose: true },
  { text: "Remind me every Friday at 5pm to submit timesheet", expectPropose: true },
  { text: "Remind me sometime next week", expectPropose: false }, // should ask, not invent
  { text: "What repeating schedules do I have?", expectPropose: false },
];

function clientContext(locale = "en") {
  return {
    clientNow: new Date().toISOString(),
    timeZone: "Asia/Shanghai",
    locale,
  };
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let id = 0;
    const pending = new Map();
    const eventHandlers = new Map();

    ws.on("open", () => resolve({ ws, pending, eventHandlers, nextId: () => String(++id) }));
    ws.on("error", reject);
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.event) {
        const set = eventHandlers.get(msg.event);
        if (set) for (const h of set) h(msg.data ?? msg.params ?? msg);
        return;
      }
      if (msg.id != null && pending.has(String(msg.id))) {
        const p = pending.get(String(msg.id));
        clearTimeout(p.t);
        pending.delete(String(msg.id));
        p.resolve(msg);
      }
    });
  });
}

function rpc(ctx, method, params = {}, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const i = ctx.nextId();
    const t = setTimeout(() => reject(new Error(`timeout ${method}`)), timeoutMs);
    ctx.pending.set(i, { resolve, reject, t });
    ctx.ws.send(JSON.stringify({ id: i, method, params }));
  });
}

function onEvent(ctx, event, handler) {
  if (!ctx.eventHandlers.has(event)) ctx.eventHandlers.set(event, new Set());
  ctx.eventHandlers.get(event).add(handler);
  return () => ctx.eventHandlers.get(event)?.delete(handler);
}

async function runProposeLayer(ctx) {
  const rows = [];
  for (const c of PROPOSE_CORPUS) {
    const res = await rpc(ctx, "home.proposeSchedule", {
      accountId: ACCOUNT,
      text: c.text,
      clientContext: clientContext(c.locale ?? "en"),
    });
    const err = res.error;
    const r = res.result;
    let status = "FAIL";
    let detail = "";
    if (err) {
      const msg = String(err.message || err.data || JSON.stringify(err));
      if (c.want === "ask" && /missing_time|ambiguous|bad_params/i.test(msg)) {
        status = "PASS";
        detail = msg.slice(0, 120);
      } else {
        detail = msg.slice(0, 160);
      }
    } else if (c.want === "ok" && r?.proposalId) {
      if (c.kind && r.kind && r.kind !== c.kind) {
        detail = `kind=${r.kind} expected ${c.kind}; ${r.resolvedLocal || ""}`;
      } else {
        status = "PASS";
        detail = `${r.kind} · ${r.resolvedLocal || r.relativeHint || ""}`;
      }
    } else if (c.want === "ask") {
      detail = `got proposal ${r?.resolvedLocal} (expected ask)`;
    } else {
      detail = JSON.stringify(r || err).slice(0, 160);
    }
    rows.push({ layer: "propose", text: c.text, status, detail });
    process.stdout.write(status === "PASS" ? "." : "x");
  }
  process.stdout.write("\n");
  return rows;
}

async function runChatLayer(ctx) {
  await rpc(ctx, "home.subscribe", {
    events: ["home:turn-finished", "home:turn-delta", "home:approval-needed"],
  });

  const opened = await rpc(ctx, "home.openSession", {
    accountId: ACCOUNT,
    purpose: "general",
    title: `schedule-corpus-${new Date().toISOString().slice(0, 16)}`,
  });
  const sessionId = opened.result?.sessionId;
  if (!sessionId) throw new Error(`openSession failed: ${JSON.stringify(opened)}`);

  const rows = [];
  for (const c of CHAT_CORPUS) {
    const deltas = [];
    let finished = null;
    const offDelta = onEvent(ctx, "home:turn-delta", (d) => {
      if (d?.sessionId === sessionId && typeof d.text === "string") deltas.push(d.text);
      if (d?.sessionId === sessionId && typeof d.delta === "string") deltas.push(d.delta);
    });
    const finishedP = new Promise((resolve) => {
      const off = onEvent(ctx, "home:turn-finished", (d) => {
        if (d?.sessionId === sessionId) {
          finished = d;
          off();
          resolve(d);
        }
      });
      setTimeout(() => {
        off();
        resolve(null);
      }, CHAT_TIMEOUT_MS);
    });

    const sent = await rpc(
      ctx,
      "home.sendMessage",
      {
        accountId: ACCOUNT,
        sessionId,
        text: c.text,
        clientContext: clientContext("en"),
      },
      CHAT_TIMEOUT_MS,
    );
    if (sent.error) {
      rows.push({
        layer: "chat",
        text: c.text,
        status: "FAIL",
        detail: String(sent.error.message || JSON.stringify(sent.error)).slice(0, 200),
      });
      offDelta();
      process.stdout.write("x");
      continue;
    }

    await finishedP;
    offDelta();

    // Pull transcript for authoritative assistant text + tool traces
    const tr = await rpc(ctx, "home.getTranscript", { accountId: ACCOUNT, sessionId });
    const messages = tr.result?.messages || [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const blob = JSON.stringify(messages).slice(-8000);
    const assistantText = String(lastAssistant?.content || lastAssistant?.text || deltas.join("") || "");
    const hadPropose =
      /schedule[\s\S]{0,80}propose|action["']?\s*:\s*["']?propose/i.test(blob) ||
      /Proposed for|resolvedLocal|proposalId/i.test(assistantText + blob);
    const honesty = /No schedule propose ran|尚未调用 schedule propose/i.test(assistantText);
    const asked =
      /what time|when should|missing|could you|几点|什么时候|ambiguous|need.*(time|day)/i.test(
        assistantText,
      );

    let status = "PASS";
    let detail = "";
    if (c.expectPropose) {
      if (hadPropose) detail = `propose ok · ${assistantText.slice(0, 100).replace(/\s+/g, " ")}`;
      else if (asked) detail = `asked instead · ${assistantText.slice(0, 100).replace(/\s+/g, " ")}`;
      else {
        status = honesty ? "WARN" : "FAIL";
        detail = `${honesty ? "honesty" : "no propose"} · ${assistantText.slice(0, 140).replace(/\s+/g, " ")}`;
      }
    } else {
      if (hadPropose && /sometime next week/i.test(c.text)) {
        status = "FAIL";
        detail = `invented WHEN · ${assistantText.slice(0, 120).replace(/\s+/g, " ")}`;
      } else {
        detail = `${hadPropose ? "listed/propose" : asked ? "asked" : "replied"} · ${assistantText.slice(0, 100).replace(/\s+/g, " ")}`;
      }
    }
    if (!finished && status === "PASS") {
      status = "WARN";
      detail = `no turn-finished · ${detail}`;
    }
    rows.push({ layer: "chat", text: c.text, status, detail });
    process.stdout.write(status === "PASS" ? "." : status === "WARN" ? "?" : "x");
  }
  process.stdout.write("\n");
  return { rows, sessionId };
}

async function main() {
  console.log(`Connecting ${WS_URL} account=${ACCOUNT}`);
  const ctx = await connect();
  try {
    const hello = await rpc(ctx, "home.hello");
    if (hello.error) throw new Error(JSON.stringify(hello.error));
    console.log(`hello ok product=${hello.result?.product} methods≈${hello.result?.methods?.length}`);

    console.log("\n=== Layer A: proposeSchedule corpus ===");
    const proposeRows = await runProposeLayer(ctx);

    console.log("\n=== Layer B: chat turns (LLM) ===");
    const { rows: chatRows, sessionId } = await runChatLayer(ctx);
    console.log(`sessionId=${sessionId}`);

    const all = [...proposeRows, ...chatRows];
    const pass = all.filter((r) => r.status === "PASS").length;
    const warn = all.filter((r) => r.status === "WARN").length;
    const fail = all.filter((r) => r.status === "FAIL").length;

    console.log("\n=== Results ===");
    for (const r of all) {
      console.log(`[${r.status}] (${r.layer}) ${r.text}`);
      console.log(`         ${r.detail}`);
    }
    console.log(`\nSUMMARY pass=${pass} warn=${warn} fail=${fail} total=${all.length}`);
    process.exit(fail > 0 ? 1 : 0);
  } finally {
    ctx.ws.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
