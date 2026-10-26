#!/usr/bin/env node
/**
 * V-AGENT-SCENARIO-2 — optional live LLM eval against a running daemon.
 *
 * Soft-checks catalogue cases with `"live": true` (Schedule + General packs):
 * expected tool name appeared in turn events **or** honesty regex matched.
 * Never asserts exact prose.
 *
 * Prefer the wrapper (uses ~/.envoyhome LLM settings, starts daemon if needed):
 *   ./scripts/agent-eval.sh
 *   pnpm agent:eval
 *
 * Or against an already-running daemon:
 *   ENVOYHOME_AGENT_EVAL=1 node scripts/agent-eval-live.mjs
 *
 * Env:
 *   ENVOYHOME_WS_URL     default ws://127.0.0.1:4780/ws
 *   ENVOYHOME_ACCOUNT    optional — else first account from home.listAccounts
 *   ENVOYHOME_AGENT_EVAL must be 1 / true / yes (wrapper sets this)
 *
 * Not part of ./scripts/ci.sh.
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evalFlag = (process.env.ENVOYHOME_AGENT_EVAL ?? "").trim().toLowerCase();
if (!["1", "true", "yes", "on"].includes(evalFlag)) {
  console.error(
    "Refusing to run: set ENVOYHOME_AGENT_EVAL=1 (optional live LLM eval; not a CI gate).",
  );
  console.error("  See tests/agent-scenarios/README.md");
  process.exit(2);
}

const WS_URL = process.env.ENVOYHOME_WS_URL || "ws://127.0.0.1:4780/ws";
const STATE_DIR =
  (process.env.ENVOYHOME_STATE_DIR ?? "").trim() || path.join(homedir(), ".envoyhome");
let ACCOUNT = (process.env.ENVOYHOME_ACCOUNT ?? "").trim();
/** Optional: comma-separated case ids, pack names, or id/prompt substrings. */
const FILTER = (process.env.ENVOYHOME_AGENT_EVAL_FILTER ?? "").trim();

const { loadCatalogue } = await import(
  pathToFileURL(path.join(root, "tests/agent-scenarios/lib/load-catalogue.mjs")).href
);
const { softLiveExpect } = await import(
  pathToFileURL(path.join(root, "tests/agent-scenarios/lib/expect.mjs")).href
);

let cases = loadCatalogue({ liveOnly: true });
if (FILTER) {
  const parts = FILTER.split(",").map((s) => s.trim()).filter(Boolean);
  cases = cases.filter((c) =>
    parts.some(
      (p) =>
        c.id === p ||
        c.pack === p ||
        String(c.id).includes(p) ||
        String(c.prompt ?? "").toLowerCase().includes(p.toLowerCase()),
    ),
  );
  console.log(`agent-eval: filter=${JSON.stringify(FILTER)} → ${cases.length} case(s)`);
}
if (cases.length === 0) {
  console.error("No live-eligible catalogue cases found.");
  process.exit(1);
}

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
      // reuse-host may frame product events as { event, data } or { method, params }.
      const name = msg.event || msg.method;
      if (typeof name === "string" && name.startsWith("home:")) {
        events.push({ event: name, data: msg.params ?? msg.data ?? msg, raw: msg });
        return;
      }
      if (msg.id != null && pending.has(String(msg.id))) {
        const p = pending.get(String(msg.id));
        clearTimeout(p.t);
        pending.delete(String(msg.id));
        p.resolve(msg);
      }
    });

    function rpc(method, params = {}, timeoutMs = 60_000) {
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

    function waitEvent(name, pred, timeoutMs = 180_000) {
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

const KNOWN_TOOLS =
  "schedule|skills_list|skill_view|skill_propose|ask_user|web_search|write_file|read_file|edit_file|apply_patch|list_dir|search_files|export_document|extract_document|knowledge_search|knowyou_search|memory_recall|memory_remember|session_search|exec|http_fetch|ha_[a-z_]+|mqtt_[a-z_]+";

async function applySetupSeedExports(accountId, setup) {
  const rows = setup?.seedExports;
  if (!Array.isArray(rows) || rows.length === 0) return;
  const { exportDocument, isExportFormat } = await import(
    pathToFileURL(path.join(root, "packages/daemon/dist/document-export.js")).href
  );
  const filesRoot = path.join(STATE_DIR, "accounts", accountId, "files");
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const format = raw.format;
    if (!isExportFormat(format)) {
      throw new Error(`seedExports: bad format ${String(format)}`);
    }
    const rel = String(raw.path ?? "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    if (!rel || rel.includes("..") || path.isAbsolute(String(raw.path ?? ""))) {
      throw new Error(`seedExports: bad path ${String(raw.path)}`);
    }
    const markdown = String(raw.markdown ?? "");
    const title =
      typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : undefined;
    const buf = await exportDocument(format, markdown, title ? { title } : undefined);
    const abs = path.join(filesRoot, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, buf);
  }
}

/** Best-effort extract tool names from turn-delta / finished payloads. */
function collectToolNames(eventsSlice) {
  const names = new Set();
  const blob = JSON.stringify(eventsSlice);
  for (const m of blob.matchAll(/"tool"\s*:\s*"([^"]+)"/g)) names.add(m[1]);
  for (const m of blob.matchAll(new RegExp(`"name"\\s*:\\s*"(${KNOWN_TOOLS})"`, "g"))) {
    names.add(m[1]);
  }
  if (/schedule\s+propose|Proposed for|proposalId|resolvedLocal/i.test(blob)) {
    names.add("schedule");
  }
  if (/skills_list|"skills"\s*:\s*\[/i.test(blob)) names.add("skills_list");
  if (/skill_propose|PendingLearn|learnId/i.test(blob)) names.add("skill_propose");
  if (/write_file|documents\/[^\s"]+\.md/i.test(blob) && /wrote|written|created|ok:\s*true/i.test(blob)) {
    names.add("write_file");
  }
  if (/search_files|"hits"\s*:\s*\[/i.test(blob)) names.add("search_files");
  if (/export_document|"format"\s*:\s*"(pdf|docx)"/i.test(blob)) names.add("export_document");
  if (/extract_document|extractChars|output\/extracts/i.test(blob)) names.add("extract_document");
  if (/web_search|"provider"\s*:\s*"(duckduckgo|brave|tavily)"/i.test(blob)) {
    names.add("web_search");
  }
  if (/"action"\s*:\s*"(navigate|snapshot|text|act)"|browser_control|"targetId"/i.test(blob)) {
    names.add("browser");
  }
  if (/ask_user|choice-needed|home:choice/i.test(blob)) names.add("ask_user");
  if (/list_dir|"entries"\s*:\s*\[/i.test(blob)) names.add("list_dir");
  if (/read_file/i.test(blob)) names.add("read_file");
  if (/knowledge_search/i.test(blob)) names.add("knowledge_search");
  if (/knowyou_search/i.test(blob)) names.add("knowyou_search");
  if (/memory_recall/i.test(blob)) names.add("memory_recall");
  if (/memory_remember/i.test(blob)) names.add("memory_remember");
  if (/session_search/i.test(blob)) names.add("session_search");
  if (/edit_file/i.test(blob)) names.add("edit_file");
  if (/apply_patch/i.test(blob)) names.add("apply_patch");
  if (/"tool"\s*:\s*"exec"|execImpl|"cmd"\s*:\s*"/i.test(blob) || /\bexec\b/i.test(blob)) {
    names.add("exec");
  }
  if (/ha_get_state|ha_call_service|ha_list_entities/i.test(blob)) {
    if (/ha_get_state/i.test(blob)) names.add("ha_get_state");
    if (/ha_call_service/i.test(blob)) names.add("ha_call_service");
    if (/ha_list_entities/i.test(blob)) names.add("ha_list_entities");
  }
  return [...names];
}

/** Seed account sandbox files before a live case (ENVOYHOME_STATE_DIR). */
async function applySetupSeedFiles(accountId, setup) {
  const seed = setup?.seedFiles;
  if (!seed || typeof seed !== "object") return;
  const filesRoot = path.join(STATE_DIR, "accounts", accountId, "files");
  for (const [relRaw, body] of Object.entries(seed)) {
    const rel = String(relRaw).replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel.includes("..") || path.isAbsolute(relRaw)) {
      throw new Error(`refusing unsafe seed path: ${relRaw}`);
    }
    const abs = path.join(filesRoot, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, String(body ?? ""), "utf8");
  }
}

/** Append standing MEMORY.md facts for live inject (Design L2). */
async function applySetupSeedMemory(accountId, setup) {
  const rows = setup?.seedMemory;
  if (!Array.isArray(rows) || rows.length === 0) return;
  const memPath = path.join(STATE_DIR, "accounts", accountId, "MEMORY.md");
  let existing = "";
  try {
    existing = await readFile(memPath, "utf8");
  } catch {
    existing = "# MEMORY\n";
  }
  const lines = rows
    .map((r) => (r && typeof r.text === "string" ? `- ${r.text.trim()}` : ""))
    .filter(Boolean);
  if (lines.length === 0) return;
  const block = `\n## Standing\n${lines.join("\n")}\n`;
  await mkdir(path.dirname(memPath), { recursive: true });
  await writeFile(memPath, `${existing.trimEnd()}\n${block}`, "utf8");
}

/** Rebuild Doc KB FTS after seedFiles (home.reindexKnowledge). */
async function applySetupReindexKnowledge(client, accountId, setup) {
  if (!setup?.reindexKnowledge) return;
  const res = await client.rpc("home.reindexKnowledge", { accountId }, 60_000);
  if (res?.error) {
    throw new Error(`reindexKnowledge: ${JSON.stringify(res.error)}`);
  }
}

/**
 * Seed KnowYou rows via home.updateKnowYou supersede (key + text ADD when missing).
 * setup.seedKnowYou: [{ key?, text }]
 */
async function applySetupSeedKnowYou(client, accountId, setup) {
  const rows = setup?.seedKnowYou;
  if (!Array.isArray(rows) || rows.length === 0) return;
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text) continue;
    const key =
      typeof raw.key === "string" && raw.key.trim()
        ? raw.key.trim()
        : `eval.${text.slice(0, 24).replace(/\W+/g, "_").toLowerCase()}`;
    const res = await client.rpc(
      "home.updateKnowYou",
      { accountId, action: "supersede", key, text },
      30_000,
    );
    if (res?.error) {
      throw new Error(`seedKnowYou: ${JSON.stringify(res.error)}`);
    }
  }
}

/** Start local fake-HA demo for purpose:home live cases. */
async function applySetupDemoHa(client, accountId, setup) {
  if (!setup?.demoHa) return;
  const res = await client.rpc("home.startDemoHa", { accountId }, 60_000);
  if (res?.error) {
    throw new Error(`demoHa: ${JSON.stringify(res.error)}`);
  }
}

/** Optional live policy override (tool|auto|off) — Knowledge-RAG inject defaults. */
async function applySetupKnowledgePolicy(client, accountId, setup) {
  const pol = setup?.knowledgePolicy;
  if (!pol || typeof pol !== "object") return;
  const params = { accountId };
  if (typeof pol.knowledgeInject === "string") params.knowledgeInject = pol.knowledgeInject;
  if (typeof pol.episodicInject === "string") params.episodicInject = pol.episodicInject;
  if (typeof pol.knowledgeInjectBudget === "number") {
    params.knowledgeInjectBudget = pol.knowledgeInjectBudget;
  }
  if (typeof pol.episodicInjectBudget === "number") {
    params.episodicInjectBudget = pol.episodicInjectBudget;
  }
  const res = await client.rpc("home.setKnowledgePolicy", params, 15_000);
  if (res?.error) {
    throw new Error(`setKnowledgePolicy: ${JSON.stringify(res.error)}`);
  }
}

const client = await connect();

// Prefer the household account already configured with providers (desktop Settings).
if (!ACCOUNT) {
  const listed = await client.rpc("home.listAccounts", {}, 15_000);
  const accounts = listed.result?.accounts ?? listed.result ?? [];
  const rows = Array.isArray(accounts) ? accounts : [];
  const first =
    rows.find((a) => a && (a.accountId || a.id)) ??
    null;
  ACCOUNT = String(first?.accountId ?? first?.id ?? "").trim();
  if (!ACCOUNT) {
    console.error(
      "No ENVOYHOME_ACCOUNT and home.listAccounts returned none.\n" +
        "  Open the desktop app, create a profile, configure Model Provider, then re-run.",
    );
    client.ws.close();
    process.exit(1);
  }
  console.log(`agent-eval: using account ${ACCOUNT} (from home.listAccounts)`);
}

const providers = await client.rpc("home.listProviders", { accountId: ACCOUNT }, 15_000).catch((err) => {
  console.error("home.listProviders failed:", err instanceof Error ? err.message : err);
  return null;
});
if (providers?.error) {
  console.error("home.listProviders error:", JSON.stringify(providers.error));
  client.ws.close();
  process.exit(1);
}
const provRows = providers?.result?.providers ?? [];
const enabled = Array.isArray(provRows)
  ? provRows.filter((p) => p && p.enabled !== false)
  : [];
const mode = providers?.result?.mode ?? "?";
console.log(
  `V-AGENT-SCENARIO-2 live eval — ${cases.length} case(s) @ ${WS_URL} account=${ACCOUNT}` +
    ` mode=${mode} providers=${enabled.length}\n`,
);
if (enabled.length === 0) {
  console.error(
    "No enabled providers for this account — configure LLM under desktop Settings → LLM first.",
  );
  client.ws.close();
  process.exit(1);
}

await client.rpc("home.subscribe", {
  events: [
    "home:turn-finished",
    "home:turn-delta",
    "home:approval-needed",
    "home:choice-needed",
  ],
});
// Some hosts also accept Mesh-style `on` registrations.
for (const ev of [
  "home:turn-finished",
  "home:turn-delta",
  "home:approval-needed",
  "home:choice-needed",
]) {
  await client.rpc("on", { event: ev }, 5_000).catch(() => undefined);
}

let pass = 0;
let fail = 0;

for (const c of cases) {
  const purpose = c.purpose ?? (c.pack === "schedule" ? "schedules" : "general");
  try {
    await applySetupSeedFiles(ACCOUNT, c.setup);
    await applySetupSeedExports(ACCOUNT, c.setup);
    await applySetupSeedMemory(ACCOUNT, c.setup);
    await applySetupKnowledgePolicy(client, ACCOUNT, c.setup);
    await applySetupReindexKnowledge(client, ACCOUNT, c.setup);
    await applySetupSeedKnowYou(client, ACCOUNT, c.setup);
    await applySetupDemoHa(client, ACCOUNT, c.setup);
  } catch (err) {
    fail++;
    console.log(`FAIL ${c.id}  seed: ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }
  const opened = await client.rpc("home.openSession", {
    accountId: ACCOUNT,
    purpose,
    title: `agent-eval-${c.id}-${Date.now()}`,
  });
  if (opened.error) {
    fail++;
    console.log(`FAIL ${c.id}  openSession ${JSON.stringify(opened.error)}`);
    continue;
  }
  const sessionId = opened.result?.sessionId;
  const before = client.events.length;
  const locale =
    c.locale ??
    (/[\u4e00-\u9fff]/.test(c.prompt)
      ? "zh"
      : /[\u3040-\u30ff]/.test(c.prompt)
        ? "ja"
        : /[\uac00-\ud7af]/.test(c.prompt)
          ? "ko"
          : "en");

  let sent;
  try {
    sent = await client.rpc(
      "home.sendMessage",
      {
        accountId: ACCOUNT,
        sessionId,
        text: c.prompt,
        clientContext: {
          clientNow: new Date().toISOString(),
          timeZone: "Asia/Shanghai",
          locale,
          ...(c.clientContext && typeof c.clientContext === "object" ? c.clientContext : {}),
        },
      },
      90_000,
    );
  } catch (err) {
    fail++;
    console.log(`FAIL ${c.id}  send: ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }
  if (sent.error) {
    fail++;
    console.log(`FAIL ${c.id}  send error ${JSON.stringify(sent.error)}`);
    continue;
  }
  const turnId = sent.result?.turnId;
  const liveAnswer = c.liveAnswer && typeof c.liveAnswer === "object" ? c.liveAnswer : null;
  try {
    // Poll events: optionally auto-answer ask_user choices, then require turn-finished.
    const deadline = Date.now() + 180_000;
    const answeredIds = new Set();
    let finished = false;
    while (!finished && Date.now() < deadline) {
      const sliceNow = client.events.slice(before);
      const done = sliceNow.find(
        (e) =>
          e.event === "home:turn-finished" &&
          (!turnId || e.data?.turnId === turnId || e.data?.sessionId === sessionId),
      );
      if (done) {
        finished = true;
        break;
      }
      if (liveAnswer) {
        for (const e of sliceNow) {
          if (e.event === "home:choice-needed") {
            const choice = e.data ?? {};
            const choiceId = choice.id;
            if (!choiceId || answeredIds.has(`choice:${choiceId}`)) continue;
            if (sessionId && choice.sessionId && choice.sessionId !== sessionId) continue;
            answeredIds.add(`choice:${choiceId}`);
            const opts = Array.isArray(choice.options) ? choice.options : [];
            const preferIdx =
              typeof liveAnswer.preferOptionIndex === "number"
                ? liveAnswer.preferOptionIndex
                : 0;
            const option = opts[preferIdx] ?? opts[0];
            const params = { accountId: ACCOUNT, id: String(choiceId) };
            if (option?.id) params.optionId = String(option.id);
            else if (typeof liveAnswer.textFallback === "string") {
              params.text = liveAnswer.textFallback;
            } else if (typeof liveAnswer.text === "string") {
              params.text = liveAnswer.text;
            } else {
              params.text = "tomorrow at 9:00";
            }
            await client.rpc("home.answerChoice", params, 30_000);
            continue;
          }
          if (e.event !== "home:approval-needed") continue;
          const appr = e.data ?? {};
          const apprId = appr.id;
          if (!apprId || answeredIds.has(`appr:${apprId}`)) continue;
          if (sessionId && appr.sessionId && appr.sessionId !== sessionId) continue;
          const digest = appr.argsDigest;
          if (typeof digest !== "string" || !digest) continue;
          answeredIds.add(`appr:${apprId}`);
          const decision =
            liveAnswer.approvalDecision === "allow" || liveAnswer.decision === "allow"
              ? "allow"
              : "deny";
          await client.rpc(
            "home.answerApproval",
            {
              id: String(apprId),
              decision,
              scope: "once",
              argsDigest: digest,
            },
            30_000,
          );
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!finished) throw new Error("waitEvent timeout home:turn-finished");
  } catch (err) {
    fail++;
    console.log(`FAIL ${c.id}  ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }

  const slice = client.events.slice(before);
  const toolNames = collectToolNames(slice);
  const transcript = await client.rpc("home.getTranscript", {
    accountId: ACCOUNT,
    sessionId,
  });
  const messages = transcript.result?.messages || [];
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const assistantText = String(lastAssistant?.content || lastAssistant?.text || "");

  const verdict = softLiveExpect({
    toolNames,
    assistantText,
    expect: c.expect ?? {},
  });
  if (verdict.ok) {
    pass++;
    console.log(`PASS ${c.id}  (${verdict.reason})`);
  } else {
    fail++;
    console.log(`FAIL ${c.id}  ${verdict.reason}`);
    console.log(`      assistant: ${assistantText.slice(0, 160).replace(/\n/g, " | ")}`);
  }
}

client.ws.close();
console.log(`\nLive eval: ${pass} pass, ${fail} fail / ${cases.length}`);
process.exit(fail > 0 ? 1 : 0);
