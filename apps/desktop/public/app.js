// Thin Settings shell — Design §10. Persistent WS, live events, Chat / Models / Pairing.

import QRCode from "qrcode";
import {
  COST_TIERS,
  costRankSelectValue,
  costTierForRank,
  listPresetModels,
  listProviderPresets,
  presetById,
  resolveModelProfile,
} from "./provider-presets.js";
import {
  LOCALE_OPTIONS,
  applyDomI18n,
  getLocale,
  initLocale,
  onLocaleChange,
  setLocale,
  t,
} from "./i18n/index.js";
import {
  THEME_OPTIONS,
  getThemePreference,
  initTheme,
  onThemeChange,
  resolvedTheme,
  setThemePreference,
} from "./theme.js";
import { graphToYaml, yamlToGraph } from "./workflow-model.js";
import { mountWorkflowCanvas } from "./workflow-canvas.js";

const DEFAULT_WS = "ws://127.0.0.1:4780/ws";

/** @type {Map<string, ReturnType<typeof mountWorkflowCanvas>>} */
const wfDemoCanvases = new Map();
/** Live demo test-run correlation (Settings Workflows). */
/** @type {{ sampleKey: string, workflowId: string, runId?: string } | null} */
let wfDemoLive = null;

/** Illustrative SKILL.md — teach the format; not auto-installed. */
const SKILL_MD_HOWTO_EXAMPLE = `---
name: household-tone
description: Warm, practical home-assistant voice. Use for everyday household help.
---

# Household tone

When helping with this home:

- Prefer short, practical answers over essays.
- Speak like a calm household helper — clear and warm, not corporate.
- Do not invent family members or device state.
- Before any home change (lights, locks, climate), confirm intent in plain language.
- Never claim a device action succeeded unless a tool result says so.
`;

/** Blank starter for New workflow (one document). */
const WORKFLOW_NEW_TEMPLATE = `id: my_workflow
match:
  keywords: ["example phrase"]
steps:
  - id: reply
    type: llm_summarize
    prompt: "One short helpful reply."
`;

/**
 * Demo workflows use demo_* ids and enabled: false so they do not steal live keyword
 * matches until the user enables them. Try sample still works via home.runWorkflow.
 * Saved demo_* copies stay under the sample cards, not in the main workflow list.
 */
const isDemoWorkflowId = (id) => String(id || "").startsWith("demo_");
const yamlWorkflowId = (yaml) => {
  const m = /^id:\s*([^\s#]+)/m.exec(String(yaml || ""));
  return m ? m[1] : "";
};

/** Linear multi-step demo: draft → title → save file. */
const WORKFLOW_HOWTO_LINEAR = `id: demo_morning_brief
enabled: false
match:
  keywords: ["morning brief"]
steps:
  - id: draft
    type: llm_summarize
    prompt: "Write one warm, practical morning brief line for the household (weather/mood optional). One sentence only."
    out: brief
    x: 40
    y: 100
  - id: title
    type: llm_fill
    prompt: "Turn the brief into a short title of at most 6 words. Reply with the title only."
    out: headline
    x: 280
    y: 100
  - id: save
    type: tool
    name: write_file
    args:
      path: notes/morning-brief.txt
    args_from:
      content: brief
    x: 520
    y: 100
`;

/** Branched demo — tool names from home.listWorkflowTools. */
const WORKFLOW_HOWTO_BRANCH = `id: demo_intake_triage
enabled: false
match:
  keywords: ["intake", "ticket"]
entry: classify
nodes:
  - id: classify
    type: llm_fill
    prompt: "Classify the message. Reply with exactly one word and nothing else: normal or urgent."
    out: bucket
    x: 40
    y: 140
  - id: note_normal
    type: tool
    name: write_file
    args:
      path: notes/intake-normal.txt
      content: "normal"
    x: 300
    y: 40
  - id: note_urgent
    type: tool
    name: write_file
    args:
      path: notes/intake-urgent.txt
      content: "urgent"
    x: 300
    y: 240
edges:
  - from: classify
    to: note_normal
    when: "bucket == 'normal'"
  - from: classify
    to: note_urgent
    when: "bucket == 'urgent'"
`;

/**
 * Complex demo: parallel LLM fan-out, join:all barrier, then conditional tool edges.
 * Opens cleanly in Diagram (x/y) and YAML. Not auto-installed.
 */
const WORKFLOW_HOWTO_COMPLEX = `id: demo_household_intake
enabled: false
match:
  keywords: ["household intake", "log note"]
entry: classify
nodes:
  - id: classify
    type: llm_fill
    prompt: "Classify the message as chores, guest, or urgent. Reply with exactly one word and nothing else: chores, guest, or urgent."
    out: kind
    x: 40
    y: 180
  - id: summary
    type: llm_summarize
    prompt: "Write one short household summary of the user's message."
    out: note
    x: 300
    y: 40
  - id: actions
    type: llm_fill
    prompt: "List at most three short action items as a comma-separated line."
    out: todos
    x: 300
    y: 320
  - id: merge
    type: llm_summarize
    prompt: "Combine the summary and action items into one short paragraph for the household log. Prefer plain language."
    out: body
    join: all
    x: 560
    y: 180
  - id: save_log
    type: tool
    name: write_file
    args:
      path: notes/household-intake.txt
    args_from:
      content: body
    x: 820
    y: 40
  - id: save_chores
    type: tool
    name: write_file
    args:
      path: notes/chores.txt
    args_from:
      content: body
    x: 820
    y: 180
  - id: flag_urgent
    type: tool
    name: write_file
    args:
      path: notes/urgent-flag.txt
      content: "urgent intake"
    x: 820
    y: 320
edges:
  - from: classify
    to: summary
  - from: classify
    to: actions
  - from: summary
    to: merge
  - from: actions
    to: merge
  - from: merge
    to: save_log
  - from: merge
    to: save_chores
    when: "kind == 'chores'"
  - from: merge
    to: flag_urgent
    when: "kind == 'urgent'"
`;

const NAV_ICON = {
  chat: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
  homeChat: `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`,
  llm: `<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16z"/><path d="M19 13l.6 1.8L21.4 15.4 19.6 16 19 17.8l-.6-1.8L16.6 15.4l1.8-.6L19 13z"/>`,
  connections: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
  automation: `<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>`,
  system: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
};

const VIEWS = [
  { id: "chat", labelKey: "nav.chat" },
  // Hidden until HA configured+enabled (Design §5.7.8 / V-UX-8).
  { id: "homeChat", labelKey: "nav.homeChat" },
  { id: "llm", labelKey: "nav.llm" },
  { id: "connections", labelKey: "nav.connections" },
  // Product label is Skills (agent-familiar); view id stays automation for deep links.
  { id: "automation", labelKey: "nav.skills" },
  { id: "system", labelKey: "nav.system" },
];

function navItemIcon(id) {
  const paths = NAV_ICON[id] || NAV_ICON.system;
  return `<svg class="nav-item-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/** @type {"models" | "local" | "routing" | "memory"} */
let llmTab = "models";

/** @type {"recommended" | "huggingface"} */
let localModelSubTab = "recommended";

/** @type {Map<string, { fileName: string, modelId?: string, status: string, bytesReceived: number, bytesTotal?: number, error?: string }>} */
const liveDownloads = new Map();

function rememberDownloadJob(job) {
  if (!job?.fileName) return;
  liveDownloads.set(job.fileName, {
    fileName: job.fileName,
    status: job.status || "downloading",
    bytesReceived: Number(job.bytesReceived) || 0,
    ...(typeof job.bytesTotal === "number" ? { bytesTotal: job.bytesTotal } : {}),
    ...(job.modelId ? { modelId: job.modelId } : {}),
    ...(job.error ? { error: job.error } : {}),
  });
  if (job.modelId) liveDownloads.set(`id:${job.modelId}`, liveDownloads.get(job.fileName));
}

function downloadJobFor(fileName, modelId) {
  if (fileName && liveDownloads.has(fileName)) return liveDownloads.get(fileName);
  if (modelId && liveDownloads.has(`id:${modelId}`)) return liveDownloads.get(`id:${modelId}`);
  return undefined;
}

function formatDlBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "";
  if (v >= 1024 ** 3) return `${Math.round((v / 1024 ** 3) * 10) / 10} GB`;
  if (v >= 1024 ** 2) return `${Math.round((v / 1024 ** 2) * 10) / 10} MB`;
  if (v >= 1024) return `${Math.round(v / 1024)} KB`;
  return `${Math.round(v)} B`;
}

function listLiveDownloadJobs() {
  /** @type {Map<string, { fileName: string, modelId?: string, status: string, bytesReceived: number, bytesTotal?: number, error?: string }>} */
  const byFile = new Map();
  for (const [key, job] of liveDownloads) {
    if (key.startsWith("id:") || !job?.fileName) continue;
    if (job.status !== "downloading" && job.status !== "paused" && job.status !== "failed") continue;
    byFile.set(job.fileName, job);
  }
  return [...byFile.values()];
}

function downloadProgressHtml(job) {
  if (!job || (job.status !== "downloading" && job.status !== "paused" && job.status !== "failed")) {
    return "";
  }
  const total = job.bytesTotal;
  const pct =
    total && total > 0
      ? Math.min(100, Math.round((job.bytesReceived / total) * 100))
      : null;
  const label =
    job.status === "paused"
      ? t("models.dlPaused")
      : job.status === "failed"
        ? t("models.dlFailed")
        : t("models.dlDownloading");
  const sizeLine = total
    ? `${formatDlBytes(job.bytesReceived)} / ${formatDlBytes(total)}`
    : formatDlBytes(job.bytesReceived) || "…";
  const action =
    job.status === "downloading"
      ? `<button type="button" class="secondary" data-dl-stop="${escapeHtml(job.fileName)}">${escapeHtml(t("models.dlStop"))}</button>`
      : `<button type="button" class="secondary" data-dl-resume="${escapeHtml(job.fileName)}">${escapeHtml(t("models.dlContinue"))}</button>`;
  const fillClass = pct == null ? "le-dl-bar-fill indeterminate" : "le-dl-bar-fill";
  return `<div class="le-dl" data-dl-file="${escapeHtml(job.fileName)}">
    <div class="le-dl-meta muted">${escapeHtml(label)} · ${escapeHtml(sizeLine)}${pct != null ? ` · ${pct}%` : ""}</div>
    <div class="le-dl-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"${pct != null ? ` aria-valuenow="${pct}"` : ""}>
      <div class="${fillClass}" style="width:${pct != null ? pct : 30}%"></div>
    </div>
    <div class="le-dl-actions">${action}</div>
    ${job.status === "failed" && job.error ? `<p class="le-error">${escapeHtml(job.error)}</p>` : ""}
  </div>`;
}

function hasInlineDownloadProgress(fileName) {
  const nodes = document.querySelectorAll(`[data-dl-file="${CSS.escape(fileName)}"]`);
  for (const n of nodes) {
    // Bars inside the active-downloads strip don't count as in-row UI.
    if (!n.closest("#le-hf-active-dls")) return true;
  }
  return false;
}

/** Keep HuggingFace-tab progress visible even when search results are collapsed/cleared. */
function syncHfActiveDownloads() {
  const host = document.getElementById("le-hf-active-dls");
  if (!host) return;
  const jobs = listLiveDownloadJobs();
  // Prefer in-row / URL-slot bars; only list jobs that have no other mounted progress.
  const orphans = jobs.filter((j) => !hasInlineDownloadProgress(j.fileName));
  if (!orphans.length) {
    host.innerHTML = "";
    host.hidden = true;
    return;
  }
  host.hidden = false;
  host.innerHTML = `<h4>${escapeHtml(t("models.hfActiveDownloads"))}</h4>
    <ul class="le-hf-active-list">${orphans
      .map(
        (j) => `<li class="le-hf-active-item">
      <code class="le-hf-active-name">${escapeHtml(j.fileName)}</code>
      ${downloadProgressHtml(j)}
    </li>`,
      )
      .join("")}</ul>`;
  wireDownloadControls(host);
}

function patchDownloadProgressDom(job) {
  rememberDownloadJob(job);
  if (job.status === "completed") {
    liveDownloads.delete(job.fileName);
    if (job.modelId) liveDownloads.delete(`id:${job.modelId}`);
    document.querySelectorAll(`[data-dl-file="${CSS.escape(job.fileName)}"]`).forEach((el) => {
      el.remove();
    });
    syncHfActiveDownloads();
    const leMsg = document.getElementById("le-msg-spawn");
    if (leMsg) {
      leMsg.innerHTML = `<p class="muted">${escapeHtml(
        t("models.downloaded", { file: job.fileName }),
      )}</p>`;
    }
    // Full refresh shows installed GGUF; skip when on HuggingFace so search/URL UI stays put.
    if (llmTab === "local" && localModelSubTab !== "huggingface") {
      void showView("local");
    }
    return;
  }
  const nodes = document.querySelectorAll(`[data-dl-file="${CSS.escape(job.fileName)}"]`);
  if (nodes.length === 0) {
    syncHfActiveDownloads();
    wireDownloadControls(document.getElementById("local-engine-card"));
    return;
  }
  nodes.forEach((el) => {
    el.outerHTML = downloadProgressHtml(job);
  });
  wireDownloadControls(document.getElementById("local-engine-card"));
  syncHfActiveDownloads();
}

function wireDownloadControls(root) {
  if (!root) return;
  root.querySelectorAll("[data-dl-stop]").forEach((btn) => {
    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", async () => {
      const fileName = btn.getAttribute("data-dl-stop");
      if (!fileName) return;
      const ans = await rpc("home.cancelLocalModelDownload", { fileName });
      if (!ans.error && ans.result) patchDownloadProgressDom(ans.result);
      else if (ans.error && document.getElementById("le-msg")) {
        document.getElementById("le-msg").innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`;
      }
    });
  });
  root.querySelectorAll("[data-dl-resume]").forEach((btn) => {
    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", async () => {
      const fileName = btn.getAttribute("data-dl-resume");
      if (!fileName) return;
      const ans = await rpc("home.resumeLocalModelDownload", { fileName });
      if (!ans.error && ans.result) patchDownloadProgressDom(ans.result);
      else if (ans.error && document.getElementById("le-msg")) {
        document.getElementById("le-msg").innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`;
      }
    });
  });
}

/** @type {"pairing" | "channels" | "homeassistant" | "mqtt"} */
let connectionsTab = "pairing";

/** Draft for HA form so re-renders do not wipe what the user typed. */
let haConfigDraft = { baseUrl: "", accessToken: "" };

/** Draft for MQTT form (same auto-save pattern as HA). */
let mqttConfigDraft = { brokerUrl: "", username: "", password: "" };

/** Drafts for Chat IM bots (Connections → Channels). Keys are secret/config field names. */
const chatBotDrafts = {
  telegram: { channelAccount: "default", botToken: "", apiBase: "" },
  discord: { channelAccount: "default", botToken: "", apiBase: "" },
  slack: { channelAccount: "default", botToken: "", appToken: "", apiBase: "" },
  feishu: { channelAccount: "default", appId: "", appSecret: "", apiBase: "" },
  dingtalk: { channelAccount: "default", clientId: "", clientSecret: "", apiBase: "", streamUrl: "" },
  wecom: {
    channelAccount: "default",
    corpId: "",
    secret: "",
    agentId: "",
    openKfid: "",
    apiBase: "",
    syncPath: "",
  },
};

/** First-party Chat bots (Design §5.0) — UI catalog. */
const CHAT_BOTS = [
  {
    id: "telegram",
    titleKey: "channels.connectTitle",
    bodyKey: "channels.connectBody",
    hintKey: "channels.telegramHint",
    doc: "docs/telegram-demo-setup.md",
    secrets: [{ name: "botToken", labelKey: "channels.botToken" }],
    advanced: [
      { name: "channelAccount", labelKey: "channels.channelAccount" },
      { name: "apiBase", labelKey: "channels.apiBase", placeholder: "https://api.telegram.org" },
    ],
  },
  {
    id: "discord",
    titleKey: "channels.discordConnectTitle",
    bodyKey: "channels.discordConnectBody",
    hintKey: "channels.discordHint",
    doc: "docs/discord-setup.md",
    secrets: [{ name: "botToken", labelKey: "channels.botToken" }],
    advanced: [
      { name: "channelAccount", labelKey: "channels.channelAccount" },
      { name: "apiBase", labelKey: "channels.apiBase", placeholder: "https://discord.com/api/v10" },
    ],
  },
  {
    id: "slack",
    titleKey: "channels.slackConnectTitle",
    bodyKey: "channels.slackConnectBody",
    hintKey: "channels.slackHint",
    doc: "docs/slack-setup.md",
    secrets: [
      { name: "botToken", labelKey: "channels.botToken" },
      { name: "appToken", labelKey: "channels.appToken" },
    ],
    advanced: [
      { name: "channelAccount", labelKey: "channels.channelAccount" },
      { name: "apiBase", labelKey: "channels.apiBase", placeholder: "https://slack.com/api" },
    ],
  },
  {
    id: "feishu",
    titleKey: "channels.feishuConnectTitle",
    bodyKey: "channels.feishuConnectBody",
    hintKey: "channels.feishuHint",
    doc: "docs/feishu-setup.md",
    secrets: [
      { name: "appId", labelKey: "channels.appId" },
      { name: "appSecret", labelKey: "channels.appSecret" },
    ],
    advanced: [
      { name: "channelAccount", labelKey: "channels.channelAccount" },
      { name: "apiBase", labelKey: "channels.apiBase", placeholder: "https://open.feishu.cn" },
    ],
  },
  {
    id: "dingtalk",
    titleKey: "channels.dingtalkConnectTitle",
    bodyKey: "channels.dingtalkConnectBody",
    hintKey: "channels.dingtalkHint",
    doc: "docs/dingtalk-setup.md",
    secrets: [
      { name: "clientId", labelKey: "channels.clientId" },
      { name: "clientSecret", labelKey: "channels.clientSecret" },
    ],
    advanced: [
      { name: "channelAccount", labelKey: "channels.channelAccount" },
      { name: "apiBase", labelKey: "channels.apiBase", placeholder: "https://api.dingtalk.com" },
      { name: "streamUrl", labelKey: "channels.streamUrl", placeholder: "wss://…" },
    ],
  },
  {
    id: "wecom",
    titleKey: "channels.wecomConnectTitle",
    bodyKey: "channels.wecomConnectBody",
    hintKey: "channels.wecomHint",
    doc: "docs/wecom-setup.md",
    secrets: [
      { name: "corpId", labelKey: "channels.corpId" },
      { name: "secret", labelKey: "channels.wecomSecret" },
    ],
    configFields: [
      { name: "agentId", labelKey: "channels.agentId", required: true },
      { name: "openKfid", labelKey: "channels.openKfid" },
    ],
    advanced: [
      { name: "channelAccount", labelKey: "channels.channelAccount" },
      { name: "apiBase", labelKey: "channels.apiBase", placeholder: "https://qyapi.weixin.qq.com" },
      { name: "syncPath", labelKey: "channels.syncPath", placeholder: "/cgi-bin/kf/sync_msg" },
    ],
  },
];

/** @deprecated kept for any leftover refs — prefer chatBotDrafts.telegram */
let tgConfigDraft = chatBotDrafts.telegram;
let discordConfigDraft = chatBotDrafts.discord;

/** @type {"skills" | "workflows" | "jobs"} */
let automationTab = "skills";

/** @type {"files" | "health" | "machine"} */
let systemTab = "files";

const PRESENCE_CLASSES = new Set(["lock", "alarm", "camera", "presence"]);
const OBJECT_CLASSES = [
  "light",
  "switch",
  "sensor",
  "climate",
  "lock",
  "garage",
  "gate",
  "valve",
  "alarm",
  "camera",
  "presence",
  "other",
];

/** Friendly device-type label (falls back to raw class id). */
function objectClassLabel(cls) {
  const key = `smarthome.class.${cls}`;
  const label = t(key);
  return label === key ? cls : label;
}

/**
 * Channel-scoped device bind / flags (Connections → HA | MQTT).
 * Actuation journal stays daemon-side (`home.listActuations`); not shown on this family UI.
 * @param {{ channel: "homeassistant" | "mqtt", aid: string | null }} opts
 * @returns {Promise<{ html: string, wire: (root: Element) => void }>}
 */
async function sourceBindingPanel(opts) {
  const channel = opts.channel;
  const aid = opts.aid;
  const sourcesBody = await rpc("home.listSources", {});
  const sources = (sourcesBody.result?.sources || []).filter((s) => s.channel === channel);
  const unbound = sources.filter((s) => !s.bound || s.accountId == null);
  const bound = sources.filter((s) => s.bound && s.accountId);
  const classOpts = OBJECT_CLASSES.map(
    (c) => `<option value="${c}">${escapeHtml(objectClassLabel(c))}</option>`,
  ).join("");
  const unboundCards = unbound.length
    ? `<ul class="bind-home-list">${unbound
        .map(
          (s) => `<li class="bind-home-row" data-ch="${escapeHtml(s.channel)}" data-ca="${escapeHtml(s.channelAccount)}" data-sid="${escapeHtml(s.sourceId)}" data-cls="${escapeHtml(s.class || "other")}" data-name="${escapeHtml(s.displayName || s.sourceId)}">
            <div class="bind-home-main">
              <span class="bind-home-name">${escapeHtml(s.displayName || s.sourceId)}</span>
              <span class="bind-home-type">${escapeHtml(objectClassLabel(s.class || "other"))}</span>
            </div>
            <button type="button" class="secondary bind-home-action" data-fill-bind>${escapeHtml(t("smarthome.fillBind"))}</button>
          </li>`,
        )
        .join("")}</ul>`
    : "";
  const boundCards = bound.length
    ? `<ul class="bind-home-list">${bound
        .map((s) => {
          const lockedAsk = PRESENCE_CLASSES.has(s.class);
          const askOn = lockedAsk || s.neverUnattended;
          return `<li class="bind-home-row">
            <div class="bind-home-main">
              <span class="bind-home-name">${escapeHtml(s.displayName || s.sourceId)}</span>
              <span class="bind-home-type">${escapeHtml(objectClassLabel(s.class))}</span>
            </div>
            <label class="check-row bind-home-ask${lockedAsk ? " is-locked" : ""}">
              <input type="checkbox" data-nu-check="${escapeHtml(s.channel)}" data-ca="${escapeHtml(s.channelAccount)}" data-sid="${escapeHtml(s.sourceId)}" data-cls="${escapeHtml(s.class)}" ${askOn ? "checked" : ""} ${lockedAsk ? "disabled" : ""} />
              <span>${escapeHtml(t("smarthome.alwaysAskShort"))}</span>
            </label>
            <button type="button" class="secondary bind-home-action" data-unbind-src="${escapeHtml(s.channel)}" data-ca="${escapeHtml(s.channelAccount)}" data-sid="${escapeHtml(s.sourceId)}">${escapeHtml(t("smarthome.unbind"))}</button>
          </li>`;
        })
        .join("")}</ul>`
    : "";
  const mqttAllow =
    channel === "mqtt"
      ? `<details class="bind-advanced">
          <summary class="muted">${escapeHtml(t("smarthome.mqttAllowSummary"))}</summary>
          <label>${escapeHtml(t("smarthome.mqttAllow"))}
            <input name="allow" placeholder="${escapeHtml(t("smarthome.mqttAllowPlaceholder"))}" />
          </label>
          <p class="muted">${escapeHtml(t("smarthome.mqttAllowHint"))}</p>
        </details>`
      : "";
  const html = `
    <section class="source-binding-panel" data-bind-channel="${escapeHtml(channel)}" aria-labelledby="bind-objects-title">
      <h3 id="bind-objects-title">${escapeHtml(t("smarthome.objectsTitle"))}</h3>
      <p class="muted">${escapeHtml(t("smarthome.hint"))}</p>
      <h4>${escapeHtml(t("smarthome.unbound"))}</h4>
      ${unboundCards || `<p class="muted bind-home-empty">${escapeHtml(t("smarthome.noneUnbound"))}</p>`}
      <form id="bind-form" class="card">
        <h4>${escapeHtml(t("smarthome.bindObject"))}</h4>
        <p id="sh-picked" class="bind-picked muted">${escapeHtml(t("smarthome.pickHint"))}</p>
        <input type="hidden" name="channel" id="sh-channel" value="${escapeHtml(channel)}" />
        <input type="hidden" name="channelAccount" id="sh-ca" value="default" />
        <input type="hidden" name="sourceId" id="sh-sid" value="" />
        <label>${escapeHtml(t("smarthome.class"))}
          <select name="class" id="sh-class">${classOpts}</select>
        </label>
        <label class="check-row">
          <input type="checkbox" name="neverUnattended" id="sh-nu" />
          <span>${escapeHtml(t("smarthome.neverUnattended"))}</span>
        </label>
        <p class="muted">${escapeHtml(t("smarthome.neverUnattendedHint"))}</p>
        ${mqttAllow}
        <button type="submit">${escapeHtml(t("smarthome.bindAction"))}</button>
        <details class="bind-advanced">
          <summary class="muted">${escapeHtml(t("smarthome.advancedManual"))}</summary>
          <p class="muted">${escapeHtml(t("smarthome.advancedManualHint"))}</p>
          <label>${escapeHtml(t("smarthome.sourceIdManual"))}
            <input type="text" id="sh-sid-manual" autocomplete="off" placeholder="${escapeHtml(
              channel === "mqtt" ? "home/lamp/set" : "light.living_room",
            )}" />
          </label>
        </details>
      </form>
      <h4>${escapeHtml(t("smarthome.bound"))}</h4>
      ${boundCards || `<p class="muted bind-home-empty">${escapeHtml(t("smarthome.noneBound"))}</p>`}
    </section>`;
  const refreshView = () => showView(channel);
  const wire = (root) => {
    const pickedEl = document.getElementById("sh-picked");
    const setPicked = (name, sourceId) => {
      if (!pickedEl) return;
      if (!sourceId) {
        pickedEl.textContent = t("smarthome.pickHint");
        pickedEl.classList.add("muted");
        return;
      }
      pickedEl.classList.remove("muted");
      pickedEl.innerHTML = `<strong>${escapeHtml(t("smarthome.picked", { name: name || sourceId }))}</strong><br/><code class="muted">${escapeHtml(sourceId)}</code>`;
    };
    const syncNuForClass = () => {
      const cls = document.getElementById("sh-class")?.value || "";
      const nu = document.getElementById("sh-nu");
      if (!nu) return;
      if (PRESENCE_CLASSES.has(cls)) {
        nu.checked = true;
        nu.disabled = true;
      } else {
        nu.disabled = false;
      }
    };
    document.getElementById("sh-class")?.addEventListener("change", syncNuForClass);
    document.getElementById("sh-sid-manual")?.addEventListener("input", (ev) => {
      const v = String(/** @type {HTMLInputElement} */ (ev.target).value || "").trim();
      const sid = document.getElementById("sh-sid");
      if (sid) sid.value = v;
      if (v) setPicked(v, v);
    });
    root.querySelectorAll("[data-fill-bind]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".bind-home-row");
        const ch = document.getElementById("sh-channel");
        if (ch) ch.value = row?.dataset.ch || channel;
        const ca = document.getElementById("sh-ca");
        if (ca) ca.value = row?.dataset.ca || "default";
        const sid = document.getElementById("sh-sid");
        const sourceId = row?.dataset.sid || "";
        if (sid) sid.value = sourceId;
        const manual = document.getElementById("sh-sid-manual");
        if (manual) /** @type {HTMLInputElement} */ (manual).value = sourceId;
        const clsSel = document.getElementById("sh-class");
        if (clsSel && row?.dataset.cls) clsSel.value = row.dataset.cls;
        setPicked(row?.dataset.name || sourceId, sourceId);
        syncNuForClass();
        document.getElementById("bind-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
    document.getElementById("bind-form")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!aid) return;
      const fd = new FormData(ev.target);
      const cls = String(fd.get("class") || "other");
      const sourceId = String(fd.get("sourceId") || "").trim();
      if (!sourceId) {
        showToast(t("smarthome.needPick"), "err");
        return;
      }
      const allow = String(fd.get("allow") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const ans = await rpc("home.setSourceBinding", {
        accountId: aid,
        channel: fd.get("channel") || channel,
        channelAccount: fd.get("channelAccount") || "default",
        sourceId,
        class: cls,
        neverUnattended: fd.get("neverUnattended") === "on" || PRESENCE_CLASSES.has(cls),
        ...(allow.length ? { actuationAllowList: allow } : {}),
      });
      if (ans.error) {
        showToast(errMsg(ans) || t("smarthome.bindFailed"), "err");
        root.insertAdjacentHTML("beforeend", pre(ans));
        return;
      }
      showToast(t("smarthome.bindOk"), "ok");
      await refreshView();
    });
    root.querySelectorAll("[data-nu-check]").forEach((box) => {
      box.addEventListener("change", async () => {
        if (!aid) return;
        const input = /** @type {HTMLInputElement} */ (box);
        const cls = input.getAttribute("data-cls") || "";
        // Locks / alarms / cameras / presence stay always-ask (Design §5.7.2).
        if (PRESENCE_CLASSES.has(cls)) {
          input.checked = true;
          return;
        }
        const want = input.checked;
        const ans = await rpc("home.setSourceBinding", {
          accountId: aid,
          channel: input.getAttribute("data-nu-check"),
          channelAccount: input.getAttribute("data-ca"),
          sourceId: input.getAttribute("data-sid"),
          class: cls,
          neverUnattended: want,
        });
        if (ans.error) {
          input.checked = !want;
          showToast(errMsg(ans), "err");
          return;
        }
        showToast(
          want ? t("smarthome.toggleNuOn") : t("smarthome.toggleNuOff"),
          "ok",
        );
      });
    });
    root.querySelectorAll("[data-unbind-src]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ans = await rpc("home.removeSourceBinding", {
          channel: btn.getAttribute("data-unbind-src"),
          channelAccount: btn.getAttribute("data-ca"),
          sourceId: btn.getAttribute("data-sid"),
        });
        if (ans.error) {
          showToast(errMsg(ans), "err");
          return;
        }
        await refreshView();
      });
    });
  };
  return { html, wire };
}

function isActuationApproval(a) {
  const tool = String(a?.tool || "");
  return (
    tool === "ha_call_service" ||
    tool === "mqtt_publish" ||
    Boolean(a?.objectId) ||
    a?.safetyClass === true
  );
}

function approvalCardHtml(a) {
  const actuation = isActuationApproval(a);
  const label = actuation
    ? `<span class="badge">${escapeHtml(t("approvals.actuation"))}</span> `
    : "";
  const target = a.objectId
    ? `<div class="muted">${escapeHtml(t("approvals.object"))} <code>${escapeHtml(a.objectId)}</code>${
        a.desiredState ? ` → ${escapeHtml(a.desiredState)}` : ""
      }</div>`
    : "";
  return `<div class="chat-approval" data-id="${escapeHtml(a.id)}">
    <div class="chat-approval-head">
      ${label}<strong>${escapeHtml(a.tool || t("approvals.title"))}</strong>
      <span class="muted">${escapeHtml(a.risk || "")}${a.origin ? ` · ${escapeHtml(a.origin)}` : ""}</span>
    </div>
    <p class="chat-approval-summary">${escapeHtml(a.summary || a.argsDigest || "")}</p>
    ${target}
    <div class="row">
      <button type="button" data-act="allow">${escapeHtml(t("app.allow"))}</button>
      <button type="button" class="secondary" data-act="deny">${escapeHtml(t("app.deny"))}</button>
    </div>
  </div>`;
}

/** Pending approvals for the open chat — kept so in-place log refreshes stay inline. */
/** @type {unknown[]} */
let chatPendingApprovals = [];

/**
 * Place each pending approval after the last bubble of its turn (Design V-UX-7 inline).
 * Unmatched approvals append at the end of the thread (not a sticky top strip).
 * @param {Array<{ role: string, text: string, turnId?: string }>} log
 * @param {unknown[]} pending
 * @returns {Array<{ kind: "msg", m: { role: string, text: string, turnId?: string } } | { kind: "approval", a: any }>}
 */
function mergeChatLogWithApprovals(log, pending) {
  const rows = Array.isArray(pending) ? pending : [];
  if (rows.length === 0) {
    return log.map((m) => ({ kind: "msg", m }));
  }
  /** @type {Map<string, number>} */
  const lastIdxByTurn = new Map();
  log.forEach((m, i) => {
    if (m.turnId) lastIdxByTurn.set(String(m.turnId), i);
  });
  /** @type {Map<number, unknown[]>} */
  const insertAfter = new Map();
  const used = new Set();
  for (const a of rows) {
    const tid = a && typeof a === "object" && "turnId" in a ? String(a.turnId || "") : "";
    if (tid && lastIdxByTurn.has(tid)) {
      const idx = lastIdxByTurn.get(tid);
      if (idx === undefined) continue;
      if (!insertAfter.has(idx)) insertAfter.set(idx, []);
      insertAfter.get(idx).push(a);
      if (a && typeof a === "object" && "id" in a) used.add(String(a.id));
    }
  }
  /** @type {Array<{ kind: "msg", m: any } | { kind: "approval", a: any }>} */
  const out = [];
  log.forEach((m, i) => {
    out.push({ kind: "msg", m });
    for (const a of insertAfter.get(i) || []) out.push({ kind: "approval", a });
  });
  for (const a of rows) {
    const id = a && typeof a === "object" && "id" in a ? String(a.id) : "";
    if (id && used.has(id)) continue;
    out.push({ kind: "approval", a });
  }
  return out;
}

function chatThreadHtml(log, pending, emptyKey) {
  const merged = mergeChatLogWithApprovals(log, pending);
  const parts = [];
  for (const row of merged) {
    if (row.kind === "approval") parts.push(approvalCardHtml(row.a));
    else {
      const html = chatBubbleHtml(row.m);
      if (html) parts.push(html);
    }
  }
  if (parts.length === 0) {
    return `<div class="chat-empty">${escapeHtml(t(emptyKey || "chat.empty"))}</div>`;
  }
  return parts.join("");
}

function bindApprovalActions(root, rows, onDone) {
  root.querySelectorAll(".chat-approval [data-act], .card [data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest("[data-id]");
      const approval = rows.find((r) => r.id === card?.dataset.id);
      if (!approval) return;
      btn.disabled = true;
      const ans = await rpc("home.answerApproval", {
        id: approval.id,
        decision: btn.dataset.act === "allow" ? "allow" : "deny",
        argsDigest: approval.argsDigest,
        scope: "once",
      });
      if (ans.error) {
        showToast(errMsg(ans) || t("approvals.answerFailed"), "err");
        btn.disabled = false;
        return;
      }
      showToast(
        btn.dataset.act === "allow" ? t("approvals.allowedToast") : t("approvals.deniedToast"),
        "ok",
      );
      await onDone();
    });
  });
}

/** @type {WebSocket | null} */
let sock = null;
let rpcSeq = 1;
/** @type {Map<number, { resolve: (v: unknown) => void, reject: (e: Error) => void }>} */
const pending = new Map();
/** @type {unknown[]} */
const liveEvents = [];
/** @type {Array<{ role: string, text: string, media?: Array<{ kind: string, uri: string, fileName?: string }> }>} */
const chatLog = [];
let chatSessionId = "";
/** @type {Array<{ role: string, text: string, media?: Array<{ kind: string, uri: string, fileName?: string }> }>} */
const homeChatLog = [];
let homeChatSessionId = "";
/**
 * Pending local files for the next send (Chat / Home chat).
 * @type {Array<{ id: string, file: File, name: string, mimeType: string, size: number }>}
 */
let chatPendingFiles = [];
/** @type {Array<{ id: string, file: File, name: string, mimeType: string, size: number }>} */
let homeChatPendingFiles = [];
/** Home Assistant ready for Home chat nav (V-UX-8). */
let haHomeChatReady = false;
let activeView = "chat";

const CHAT_ATTACH_MAX_FILES = 8;
const CHAT_ATTACH_MAX_BYTES = 8 * 1024 * 1024;

function pendingFilesForView(isHome) {
  return isHome ? homeChatPendingFiles : chatPendingFiles;
}

function setPendingFilesForView(isHome, next) {
  if (isHome) homeChatPendingFiles = next;
  else chatPendingFiles = next;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function formatAttachSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function chatAttachChipsHtml(files) {
  if (!files.length) return "";
  return `<ul class="chat-attach-list" id="chat-attach-list">${files
    .map(
      (f) => `<li class="chat-attach-chip" data-attach-id="${escapeHtml(f.id)}">
        <span class="chat-attach-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
        <span class="chat-attach-size muted">${escapeHtml(formatAttachSize(f.size))}</span>
        <button type="button" class="chat-attach-remove" data-attach-remove="${escapeHtml(f.id)}" aria-label="${escapeHtml(t("chat.attachRemove"))}">×</button>
      </li>`,
    )
    .join("")}</ul>`;
}

/** Web Speech API (macOS WKWebView → Apple Speech; WebView2 often cloud). */
function speechRecognitionCtor() {
  const w = typeof window !== "undefined" ? window : undefined;
  if (!w) return null;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function chatVoiceSupported() {
  return Boolean(speechRecognitionCtor());
}

function chatOsDictationHint() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (/Windows/i.test(ua)) return t("chat.voiceHintWin");
  if (/Mac OS X|Macintosh/i.test(ua)) return t("chat.voiceHintMac");
  return t("chat.voiceHintGeneric");
}

/** Mic icon for the Chat voice control (matches nav stroke icons). */
function chatMicIconSvg() {
  return `<svg class="chat-voice-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>`;
}

function setChatVoiceBtnState(listening) {
  const btn = document.getElementById("chat-voice");
  if (!btn) return;
  const label = listening ? t("chat.voiceStop") : t("chat.voice");
  btn.classList.toggle("is-listening", Boolean(listening));
  btn.setAttribute("aria-pressed", listening ? "true" : "false");
  btn.setAttribute("aria-label", label);
  // Idle hover: OS-specific dictation tip when Web Speech is missing, else OS STT note.
  btn.title = listening
    ? label
    : chatVoiceSupported()
      ? t("chat.voiceHintOs")
      : chatOsDictationHint();
  btn.innerHTML = chatMicIconSvg();
}

/** @type {InstanceType<NonNullable<ReturnType<typeof speechRecognitionCtor>>> | null} */
let chatSpeechRec = null;
/** Prefix in the input before the current recognition session started. */
let chatSpeechBase = "";

function stopChatSpeech() {
  const rec = chatSpeechRec;
  chatSpeechRec = null;
  chatSpeechBase = "";
  if (rec) {
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch {
      /* ignore */
    }
  }
  setChatVoiceBtnState(false);
}

/**
 * Toggle push-to-talk dictation into #chat-input (OS / WebView speech service).
 * @param {HTMLInputElement | null} input
 */
function toggleChatSpeech(input) {
  if (!input) return;
  if (chatSpeechRec) {
    stopChatSpeech();
    return;
  }
  const Ctor = speechRecognitionCtor();
  if (!Ctor) {
    // No Web Speech (common WebView gaps) — point at OS dictation (Win+H / macOS).
    showToast(chatOsDictationHint(), "ok");
    return;
  }
  /** @type {any} */
  const rec = new Ctor();
  rec.continuous = false;
  rec.interimResults = true;
  try {
    const lang =
      (typeof document !== "undefined" && document.documentElement.lang) ||
      (typeof navigator !== "undefined" && navigator.language) ||
      "en-US";
    rec.lang = lang;
  } catch {
    /* ignore */
  }
  chatSpeechBase = String(input.value || "");
  if (chatSpeechBase && !/\s$/.test(chatSpeechBase)) chatSpeechBase += " ";
  chatSpeechRec = rec;
  setChatVoiceBtnState(true);
  rec.onresult = (event) => {
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const row = event.results[i];
      const piece = row?.[0]?.transcript || "";
      if (row.isFinal) finalText += piece;
      else interim += piece;
    }
    input.value = chatSpeechBase + finalText + interim;
    if (finalText) chatSpeechBase = chatSpeechBase + finalText;
  };
  rec.onerror = (ev) => {
    const err = ev && typeof ev === "object" && "error" in ev ? String(ev.error) : "";
    stopChatSpeech();
    if (err === "aborted" || err === "no-speech") return;
    if (err === "not-allowed" || err === "service-not-allowed") {
      showToast(t("chat.voiceDenied"), "err");
      return;
    }
    showToast(t("chat.voiceFailed"), "err");
  };
  rec.onend = () => {
    if (chatSpeechRec === rec) stopChatSpeech();
  };
  try {
    rec.start();
  } catch {
    stopChatSpeech();
    showToast(t("chat.voiceFailed"), "err");
  }
}
/** @type {Array<{ accountId: string, displayName?: string, createdAt?: string }>} */
let cachedAccounts = [];
/**
 * Last QR mint in this Settings session — reopen Pair devices without stacking
 * another unused code (daemon also prunes unused QR rows).
 * @type {{ uri: string, deviceId?: string, accountId?: string } | null}
 */
let cachedPairingMint = null;
/** Profile the next Mesh invite binds to (Pair devices). */
let inviteAccountId = "";

/** Strip model reasoning blocks so bubbles stay readable. */
function displayChatText(text) {
  const raw = String(text || "");
  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Some models emit only a think block — still show a short fallback so the UI isn't blank.
  if (stripped) return stripped;
  if (/<think>/i.test(raw)) return t("chat.replyHiddenReasoning");
  return raw.trim();
}

function chatLogForSession(sessionId) {
  if (sessionId && homeChatSessionId && sessionId === homeChatSessionId) return homeChatLog;
  if (sessionId && chatSessionId && sessionId === chatSessionId) return chatLog;
  return activeView === "homeChat" ? homeChatLog : chatLog;
}

function clearThinkingPlaceholders(log) {
  const marker = t("chat.thinking");
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].role === "system" && log[i].text === marker) log.splice(i, 1);
  }
}

function chatBubbleHtml(m) {
  const role = escapeHtml(m.role);
  const text =
    m.role === "assistant" ? displayChatText(m.text) : String(m.text || "");
  const media = Array.isArray(m.media) ? m.media : [];
  const mediaHtml =
    media.length && m.role === "user"
      ? `<ul class="chat-bubble-attach">${media
          .map((a) => {
            const label = a.fileName || a.uri || a.kind || "file";
            return `<li><span class="chat-bubble-attach-kind">${escapeHtml(a.kind || "file")}</span> ${escapeHtml(label)}</li>`;
          })
          .join("")}</ul>`
      : "";
  if (!text && !mediaHtml) return "";
  if (m.role === "system") {
    return `<div class="bubble system">${escapeHtml(text)}</div>`;
  }
  return `<div class="bubble ${role}">${text ? escapeHtml(text) : ""}${mediaHtml}</div>`;
}

/** Update #chat-log in place — avoid full showView (nested rebuild races wipe the thread). */
function renderChatLogDom(log, emptyKey) {
  const logEl = document.getElementById("chat-log");
  if (!logEl) return false;
  logEl.innerHTML = chatThreadHtml(log, chatPendingApprovals, emptyKey);
  logEl.scrollTop = logEl.scrollHeight;
  if (chatPendingApprovals.length) {
    bindApprovalActions(logEl, chatPendingApprovals, () => showView(activeView));
  }
  return true;
}

function refreshOpenChatView() {
  if (activeView !== "chat" && activeView !== "homeChat") return;
  const log = activeView === "homeChat" ? homeChatLog : chatLog;
  const emptyKey = activeView === "homeChat" ? "homeChat.empty" : "chat.empty";
  if (!renderChatLogDom(log, emptyKey)) {
    void showView(activeView);
  }
}

/** Marker appended by daemon appendMediaToUserText — keep in sync with chat-media.ts. */
const CHAT_ATTACH_TRANSCRIPT_MARKER =
  "[Attached files — paths are under the account sandbox `files/`; use read_file to inspect contents]";

/**
 * Split transcript user text into display body + media chips.
 * Prefers structured `media[]` on the line; falls back to parsing the attach block.
 * @param {string} text
 * @param {unknown} rawMedia
 */
function displayUserTranscript(text, rawMedia) {
  /** @type {Array<{ kind: string, uri: string, fileName?: string, mimeType?: string, bytes?: number }>} */
  let media = [];
  if (Array.isArray(rawMedia)) {
    for (const item of rawMedia) {
      if (!item || typeof item !== "object") continue;
      const uri = typeof item.uri === "string" ? item.uri : "";
      const kind = typeof item.kind === "string" ? item.kind : "file";
      if (!uri) continue;
      media.push({
        kind,
        uri,
        ...(typeof item.fileName === "string" ? { fileName: item.fileName } : {}),
        ...(typeof item.mimeType === "string" ? { mimeType: item.mimeType } : {}),
        ...(typeof item.bytes === "number" ? { bytes: item.bytes } : {}),
      });
    }
  }
  let body = text;
  const markerIdx = text.indexOf(CHAT_ATTACH_TRANSCRIPT_MARKER);
  if (markerIdx >= 0) {
    body = text.slice(0, markerIdx).trim();
    if (media.length === 0) {
      const block = text.slice(markerIdx + CHAT_ATTACH_TRANSCRIPT_MARKER.length);
      for (const line of block.split("\n")) {
        const m = line.match(/^- (.+?) \((\w+)(?:, [^)]*)?\) · path `([^`]+)`/);
        if (!m) continue;
        media.push({ fileName: m[1], kind: m[2], uri: m[3] });
      }
    }
  }
  if (!body && media.length) body = t("chat.attachedOnly");
  return { text: body, media };
}

/** Merge daemon transcript into the in-memory log (source of truth after a turn). */
async function hydrateChatLogFromTranscript(accountIdVal, sessionId, log) {
  if (!accountIdVal || !sessionId) return false;
  try {
    const ans = await rpc("home.getTranscript", {
      accountId: accountIdVal,
      sessionId,
    });
    if (ans.error) {
      console.warn("getTranscript failed", ans.error);
      return false;
    }
    const messages = ans.result?.messages;
    if (!Array.isArray(messages) || messages.length === 0) return false;
    const next = [];
    for (const m of messages) {
      const role =
        m.role === "assistant" || m.role === "system" || m.role === "user" ? m.role : null;
      const text =
        typeof m.text === "string" ? m.text : typeof m.content === "string" ? m.content : "";
      if (!role || !text) continue;
      /** @type {{ role: string, text: string, turnId?: string, media?: Array<{ kind: string, uri: string, fileName?: string }> }} */
      let row;
      if (role === "user") {
        const parsed = displayUserTranscript(text, m.media);
        if (!parsed.text && !(parsed.media && parsed.media.length)) continue;
        row = { role, text: parsed.text };
        if (parsed.media.length) row.media = parsed.media;
      } else {
        const shown = role === "assistant" ? displayChatText(text) : text;
        if (!shown) continue;
        row = { role, text: shown };
      }
      if (typeof m.turnId === "string" && m.turnId) row.turnId = m.turnId;
      next.push(row);
    }
    if (next.length === 0) return false;
    log.length = 0;
    log.push(...next);
    return true;
  } catch (err) {
    console.warn("hydrateChatLogFromTranscript", err);
    return false;
  }
}

/** Wait until transcript gains a *new* assistant line for this turn (or timeout). */
async function waitForAssistantReply(accountIdVal, sessionId, log, timeoutMs = 90_000) {
  const started = Date.now();
  let delay = 400;
  // Prior turns already have assistants — must wait for one more, not the first ever.
  const assistantsAtStart = log.filter((m) => m.role === "assistant").length;
  const thinking = t("chat.thinking");
  while (Date.now() - started < timeoutMs) {
    await hydrateChatLogFromTranscript(accountIdVal, sessionId, log);
    clearThinkingPlaceholders(log);
    const assistantsNow = log.filter((m) => m.role === "assistant").length;
    if (assistantsNow > assistantsAtStart) {
      refreshOpenChatView();
      return true;
    }
    // Hydrate drops the optimistic "thinking" row — put it back while we wait.
    if (!log.some((m) => m.role === "system" && m.text === thinking)) {
      log.push({ role: "system", text: thinking });
    }
    refreshOpenChatView();
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay + 200, 2000);
  }
  clearThinkingPlaceholders(log);
  const assistantsNow = log.filter((m) => m.role === "assistant").length;
  if (assistantsNow <= assistantsAtStart) {
    log.push({ role: "system", text: t("chat.turnTimedOut") });
  }
  refreshOpenChatView();
  return assistantsNow > assistantsAtStart;
}

function wsUrl() {
  return localStorage.getItem("envoyhome.wsUrl") || DEFAULT_WS;
}

function accountId() {
  return localStorage.getItem("envoyhome.accountId") || "";
}

function chatSessionStorageKey(aid, purpose) {
  return `envoyhome.${purpose === "home" ? "homeChat" : "chat"}SessionId.${aid}`;
}

function loadStoredChatSessionId(aid, purpose) {
  if (!aid) return "";
  try {
    return localStorage.getItem(chatSessionStorageKey(aid, purpose)) || "";
  } catch {
    return "";
  }
}

function storeChatSessionId(aid, purpose, sessionId) {
  if (!aid || !sessionId) return;
  try {
    localStorage.setItem(chatSessionStorageKey(aid, purpose), sessionId);
  } catch {
    /* ignore quota */
  }
}

function clearStoredChatSessionIds(aid) {
  if (!aid) return;
  try {
    localStorage.removeItem(chatSessionStorageKey(aid, "general"));
    localStorage.removeItem(chatSessionStorageKey(aid, "home"));
  } catch {
    /* ignore */
  }
}

function setAccountId(id) {
  const prev = localStorage.getItem("envoyhome.accountId") || "";
  if (prev && prev !== id) clearStoredChatSessionIds(prev);
  localStorage.setItem("envoyhome.accountId", id);
  chatSessionId = "";
  homeChatSessionId = "";
  chatLog.length = 0;
  homeChatLog.length = 0;
}

async function refreshHaHomeChatReady() {
  try {
    const [haSt, mqttSt] = await Promise.all([
      rpc("home.getChannelStatus", { id: "homeassistant" }).catch(() => null),
      rpc("home.getChannelStatus", { id: "mqtt" }).catch(() => null),
    ]);
    haHomeChatReady =
      haSt?.result?.ready === true || mqttSt?.result?.ready === true;
  } catch {
    haHomeChatReady = false;
  }
  if (!haHomeChatReady && activeView === "homeChat") {
    activeView = "chat";
  }
}

function setConnChrome(state, title, sub, detailText) {
  const dot = document.querySelector(".conn-dot");
  const titleEl = document.getElementById("conn-title");
  const subEl = document.getElementById("conn-sub");
  const out = document.getElementById("status-out");
  if (dot) dot.dataset.state = state;
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
  if (out && detailText != null) out.textContent = detailText;
}

/** @deprecated use setConnChrome — kept for call sites */
function setStatus(text) {
  const out = document.getElementById("status-out");
  if (out) out.textContent = text;
}

let toastTimer = 0;
function showToast(message, kind = "ok") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.hidden = false;
  el.className = `toast ${kind === "err" ? "err" : "ok"}`;
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 4200);
}

/** User-chosen host:port tokens — same band as daemon `normalizeUserPairingToken`. */
const USER_PAIRING_TOKEN_MIN_LEN = 8;
const USER_PAIRING_TOKEN_MAX_LEN = 10;
const USER_PAIRING_TOKEN_RE = /^[A-Za-z0-9]+$/;

function normalizeUserPairingToken(raw) {
  const token = String(raw || "").trim();
  if (token.length < USER_PAIRING_TOKEN_MIN_LEN || token.length > USER_PAIRING_TOKEN_MAX_LEN) {
    return { ok: false, reason: "length" };
  }
  if (!USER_PAIRING_TOKEN_RE.test(token)) return { ok: false, reason: "charset" };
  return { ok: true, token };
}

/** `host:port` from a ws:// URL authority (EnvoyCoder PairingSection.hostPortOf). */
function hostPortOf(url) {
  const text = String(url || "").trim();
  if (!text) return undefined;
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(text)?.[1];
  return authority || undefined;
}

function readPairingLink(uri) {
  let params;
  try {
    params = new URL(uri).searchParams;
  } catch {
    params = new URLSearchParams();
  }
  const token = params.get("token")?.trim();
  return {
    address: hostPortOf(params.get("wsUrl")),
    lanAddress: hostPortOf(params.get("lanWsUrl")),
    token: token || undefined,
  };
}

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

async function renderPairingQrHtml(uri) {
  try {
    const dataUrl = await QRCode.toDataURL(uri, { width: 512, margin: 2, errorCorrectionLevel: "M" });
    return `<img id="pairing-qr" class="pairing-qr" alt="${escapeHtml(t("pairing.qrAlt"))}" src="${dataUrl}" width="512" height="512" />`;
  } catch (err) {
    return `<p class="muted" role="alert">${escapeHtml(
      t("pairing.qrUnavailable", { error: err instanceof Error ? err.message : String(err) }),
    )}</p>`;
  }
}

function pairingInviteAccountId() {
  return inviteAccountId || accountId() || "";
}

async function mintPairingCode(input = {}) {
  const params = {
    deviceLabel: input.deviceLabel || "Phone",
  };
  if (input.host) params.host = input.host;
  if (input.token) params.token = input.token;
  if (input.fresh === true) params.fresh = true;
  const bindId =
    typeof input.accountId === "string" && input.accountId
      ? input.accountId
      : pairingInviteAccountId();
  if (bindId) params.accountIds = [bindId];
  try {
    const ans = await rpc("home.mintPairing", params);
    if (ans.error || !ans.result?.uri) {
      return { ok: false, message: errMsg(ans) || t("pairing.mintFailed") };
    }
    return {
      ok: true,
      uri: String(ans.result.uri),
      deviceId: ans.result.device?.deviceId ? String(ans.result.device.deviceId) : undefined,
      accountId: bindId || undefined,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function profileOptionsHtml(selectedId, accounts) {
  return accounts
    .map(
      (a) =>
        `<option value="${escapeHtml(a.accountId)}"${
          a.accountId === selectedId ? " selected" : ""
        }>${escapeHtml(a.displayName || a.accountId)}</option>`,
    )
    .join("");
}

function connect() {
  if (sock && (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const url = wsUrl();
  setConnChrome("connecting", t("conn.connecting"), url, `${t("conn.connecting")} ${url}`);
  sock = new WebSocket(url);
  sock.onopen = async () => {
    setConnChrome("ok", t("conn.connected"), url, `${t("conn.connected")} ${url}`);
    try {
      await rpc("home.subscribe", {
        events: [
          "home:turn-started",
          "home:turn-delta",
          "home:turn-finished",
          "home:approval-needed",
          "home:approval-resolved",
          "home:learn-proposed",
          "home:local-model-download",
          "home:workflow-step",
          "home:workflow-finished",
        ],
      });
      for (const event of [
        "home:turn-finished",
        "home:turn-delta",
        "home:approval-needed",
        "home:approval-resolved",
        "home:learn-proposed",
        "home:local-model-download",
        "home:workflow-step",
        "home:workflow-finished",
      ]) {
        await rpc("on", { event }).catch(() => undefined);
      }
      const hello = await rpc("home.hello");
      const health = await rpc("home.health");
      const svc = await rpc("home.getServiceStatus");
      await refreshHaHomeChatReady();
      renderNav(activeView);
      const h = hello.result ?? hello;
      const healthOk = (health.result ?? health)?.ok === true;
      const product = h?.product || t("app.name");
      const ver = h?.version || "";
      setConnChrome(
        healthOk ? "ok" : "bad",
        healthOk ? t("conn.ready", { product }) : t("conn.degraded", { product }),
        ver ? `v${ver} · ${url}` : url,
        JSON.stringify(
          { wsUrl: url, hello: h, health: health.result ?? health, service: svc.result ?? svc },
          null,
          2,
        ),
      );
    } catch (err) {
      setConnChrome(
        "bad",
        t("conn.rpcFailed"),
        url,
        t("conn.rpcFailedDetail", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    await showView(activeView);
  };
  sock.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
      return;
    }
    const name = msg.event || msg.method;
    if (typeof name === "string" && name.startsWith("home:")) {
      const data = msg.params ?? msg.data;
      liveEvents.unshift({ at: new Date().toISOString(), event: name, data });
      if (liveEvents.length > 40) liveEvents.length = 40;
      if (name === "home:turn-delta" && data?.kind === "text" && data?.text) {
        const shown = displayChatText(data.text);
        if (shown) {
          const log = chatLogForSession(data.sessionId);
          clearThinkingPlaceholders(log);
          // Avoid duplicate bubbles if hydrate already loaded this text.
          const last = log[log.length - 1];
          if (!(last && last.role === "assistant" && last.text === shown)) {
            /** @type {{ role: string, text: string, turnId?: string }} */
            const row = { role: "assistant", text: shown };
            if (typeof data.turnId === "string" && data.turnId) row.turnId = data.turnId;
            log.push(row);
          }
          refreshOpenChatView();
        }
      }
          if (name === "home:workflow-step" && data?.nodeId && wfDemoLive) {
        if (wfDemoLive.runId && data.runId && data.runId !== wfDemoLive.runId) {
          /* other run */
        } else if (!wfDemoLive.workflowId || data.workflowId === wfDemoLive.workflowId) {
          if (typeof data.runId === "string") wfDemoLive.runId = data.runId;
          const canvas = wfDemoCanvases.get(wfDemoLive.sampleKey);
          if (canvas) {
            if (data.phase === "started") canvas.setNodeRunState(data.nodeId, "running");
            else if (data.phase === "finished") {
              canvas.setNodeRunState(data.nodeId, data.ok === false ? "fail" : "ok");
            }
          }
          const panel = document.getElementById(`wf-run-${wfDemoLive.sampleKey}`);
          if (panel && !panel.hidden) {
            let status =
              data.phase === "started"
                ? t("workflows.howtoRunStepStarted", { id: data.nodeId })
                : data.ok === false
                  ? t("workflows.howtoRunStepFail", { id: data.nodeId })
                  : t("workflows.howtoRunStepOk", { id: data.nodeId });
            if (data.phase === "finished" && data.ok === false && data.detail) {
              status = `${status} — ${String(data.detail).slice(0, 160)}`;
            }
            const logEl = panel.querySelector(".wf-demo-run-log");
            if (logEl) {
              const li = document.createElement("li");
              li.className = data.phase === "started" ? "is-running" : data.ok === false ? "is-fail" : "is-ok";
              li.textContent = status;
              logEl.appendChild(li);
              li.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
          }
        }
      }
      if (name === "home:workflow-finished" && wfDemoLive) {
        if (!wfDemoLive.runId || data?.runId === wfDemoLive.runId) {
          const panel = document.getElementById(`wf-run-${wfDemoLive.sampleKey}`);
          const headline = panel?.querySelector(".wf-demo-run-status");
          if (headline) {
            headline.textContent =
              data?.ok === false
                ? t("workflows.howtoRunFinishedFail")
                : t("workflows.howtoRunFinishedOk");
            headline.className =
              data?.ok === false ? "wf-demo-run-status is-fail" : "wf-demo-run-status is-ok";
          }
        }
      }
      if (name === "home:turn-finished") {
        const log = chatLogForSession(data?.sessionId);
        clearThinkingPlaceholders(log);
        const aid = accountId();
        const sid =
          data?.sessionId ||
          (activeView === "homeChat" ? homeChatSessionId : chatSessionId);
        void (async () => {
          await hydrateChatLogFromTranscript(aid, sid, log);
          if (data?.status === "error") {
            log.push({ role: "system", text: t("chat.turnFailed") });
            showToast(t("chat.turnFailed"), "err");
          }
          refreshOpenChatView();
          // Approvals strip may have changed — full refresh once.
          if (data?.status === "ok" && (activeView === "chat" || activeView === "homeChat")) {
            /* log already painted; approvals refresh on next open is enough */
          }
        })();
      }
      if (name === "home:approval-needed" || name === "home:approval-resolved") {
        if (name === "home:approval-needed") {
          showToast(t("approvals.neededToast"), "ok");
          if (activeView !== "chat" && activeView !== "homeChat") {
            void showView("chat");
          }
        }
        void (async () => {
          const aid = accountId();
          if (!aid) return;
          const ap = await rpc("home.listApprovals", { accountId: aid }).catch(() => null);
          chatPendingApprovals = ap?.result?.approvals || [];
          if (activeView === "chat" || activeView === "homeChat") refreshOpenChatView();
        })();
      }
      if (name === "home:local-model-download" && data?.fileName) {
        patchDownloadProgressDom(data);
      }
    }
  };
  sock.onerror = () => {
    setConnChrome(
      "bad",
      t("conn.unreachable"),
      url,
      t("conn.wsError"),
    );
  };
  sock.onclose = () => {
    setConnChrome(
      "connecting",
      t("conn.disconnected"),
      t("conn.retrying"),
      t("conn.disconnectedDetail"),
    );
    sock = null;
    setTimeout(connect, 2000);
  };
}

function rpc(method, params = {}, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      reject(new Error("not connected"));
      return;
    }
    const id = rpcSeq++;
    const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 20_000;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`RPC timeout: ${method}`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (msg) => {
        clearTimeout(timer);
        resolve(msg);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    sock.send(JSON.stringify({ id, method, params }));
  });
}

function currentProfileLabel() {
  const aid = accountId();
  if (!aid) return t("profile.noneSelected");
  const row = cachedAccounts.find((a) => a.accountId === aid);
  return row?.displayName || aid;
}

const LANGUAGE_ICON_SVG = `<svg class="locale-switcher__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

/** Lucide-style qr-code — shortcut into Connections → Pair devices. */
const PAIRING_QR_ICON_SVG = `<svg class="topbar-icon-btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>`;

const THEME_SUN_SVG = `<svg class="topbar-icon-btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
const THEME_MOON_SVG = `<svg class="topbar-icon-btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;

function currentLocaleLabel() {
  return LOCALE_OPTIONS.find((o) => o.id === getLocale())?.label || getLocale();
}

function closeTopbarMenus() {
  const profileBtn = document.getElementById("nav-profile-btn");
  const profileMenu = document.getElementById("nav-profile-menu");
  if (profileBtn && profileMenu) {
    profileMenu.hidden = true;
    profileBtn.setAttribute("aria-expanded", "false");
  }
  const localeBtn = document.getElementById("locale-switcher-btn");
  const localeMenu = document.getElementById("locale-switcher-menu");
  if (localeBtn && localeMenu) {
    localeMenu.hidden = true;
    localeBtn.setAttribute("aria-expanded", "false");
  }
  const themeBtn = document.getElementById("theme-switcher-btn");
  const themeMenu = document.getElementById("theme-switcher-menu");
  if (themeBtn && themeMenu) {
    themeMenu.hidden = true;
    themeBtn.setAttribute("aria-expanded", "false");
  }
}

function navProfileHtml() {
  const aid = accountId();
  const name = currentProfileLabel();
  const items = cachedAccounts
    .map(
      (a) =>
        `<button type="button" role="option" class="nav-profile-option${
          a.accountId === aid ? " selected" : ""
        }" data-account-id="${escapeHtml(a.accountId)}" aria-selected="${
          a.accountId === aid ? "true" : "false"
        }">${escapeHtml(a.displayName || a.accountId)}</button>`,
    )
    .join("");
  return `<div class="nav-profile topbar-chip">
    <button type="button" id="nav-profile-btn" class="nav-profile-btn" aria-haspopup="listbox" aria-expanded="false" title="${escapeHtml(
      t("profile.switchHint"),
    )}">
      <span class="nav-profile-meta">${escapeHtml(t("profile.bar"))}</span>
      <span class="nav-profile-name">${escapeHtml(name)}</span>
      <span class="nav-profile-chevron" aria-hidden="true"></span>
    </button>
    <div class="nav-profile-menu" id="nav-profile-menu" role="listbox" hidden>
      ${
        items ||
        `<p class="nav-profile-empty">${escapeHtml(t("profile.empty"))}</p>`
      }
      <button type="button" class="nav-profile-manage" data-view="accounts">${escapeHtml(
        t("profile.manage"),
      )}</button>
    </div>
  </div>`;
}

function pairingQrShortcutHtml() {
  const tip = t("app.pairingQrTip");
  return `<button type="button" id="topbar-pairing-qr" class="topbar-icon-btn" title="${escapeHtml(
    tip,
  )}" aria-label="${escapeHtml(tip)}">${PAIRING_QR_ICON_SVG}</button>`;
}

function localeSwitcherHtml() {
  const label = currentLocaleLabel();
  const tip = t("app.languageTip", { language: label });
  const menuLabel = t("app.languageMenu", { language: label });
  const options = LOCALE_OPTIONS.map(
    (o) =>
      `<li role="presentation"><button type="button" role="option" class="locale-switcher__option${
        o.id === getLocale() ? " active" : ""
      }" data-locale="${escapeHtml(o.id)}" aria-selected="${o.id === getLocale() ? "true" : "false"}">${escapeHtml(
        o.label,
      )}</button></li>`,
  ).join("");
  return `<div class="locale-switcher">
    <button type="button" id="locale-switcher-btn" class="locale-switcher__trigger topbar-icon-btn" aria-haspopup="listbox" aria-expanded="false" title="${escapeHtml(
      tip,
    )}" aria-label="${escapeHtml(menuLabel)}">
      ${LANGUAGE_ICON_SVG}
    </button>
    <ul class="locale-switcher__menu" id="locale-switcher-menu" role="listbox" aria-label="${escapeHtml(
      t("app.languagePicker"),
    )}" hidden>${options}</ul>
  </div>`;
}

function themeSwitcherHtml() {
  const pref = getThemePreference();
  const tip = t("app.themeTip", { theme: t(`app.theme${pref[0].toUpperCase()}${pref.slice(1)}`) });
  const icon = resolvedTheme() === "light" ? THEME_SUN_SVG : THEME_MOON_SVG;
  const options = THEME_OPTIONS.map(
    (o) =>
      `<li role="presentation"><button type="button" role="option" class="locale-switcher__option${
        o.id === pref ? " active" : ""
      }" data-theme="${escapeHtml(o.id)}" aria-selected="${o.id === pref ? "true" : "false"}">${escapeHtml(
        t(o.labelKey),
      )}</button></li>`,
  ).join("");
  return `<div class="locale-switcher theme-switcher">
    <button type="button" id="theme-switcher-btn" class="locale-switcher__trigger topbar-icon-btn" aria-haspopup="listbox" aria-expanded="false" title="${escapeHtml(
      tip,
    )}" aria-label="${escapeHtml(t("app.themePicker"))}">
      ${icon}
    </button>
    <ul class="locale-switcher__menu" id="theme-switcher-menu" role="listbox" aria-label="${escapeHtml(
      t("app.themePicker"),
    )}" hidden>${options}</ul>
  </div>`;
}

function bindPairingQrShortcut() {
  const btn = document.getElementById("topbar-pairing-qr");
  if (!btn) return;
  btn.addEventListener("click", () => {
    closeTopbarMenus();
    void showView("pairing");
  });
}

function bindNavProfile() {
  const btn = document.getElementById("nav-profile-btn");
  const menu = document.getElementById("nav-profile-menu");
  if (!btn || !menu) return;

  const close = () => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocClick);
  };
  const onDocClick = (ev) => {
    if (!menu.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) {
      close();
    }
  };
  const open = () => {
    closeTopbarMenus();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    setTimeout(() => document.addEventListener("click", onDocClick), 0);
  };

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (menu.hidden) open();
    else close();
  });
  menu.querySelectorAll("[data-account-id]").forEach((opt) => {
    opt.addEventListener("click", () => {
      const next = opt.getAttribute("data-account-id") || "";
      if (next && next !== accountId()) {
        setAccountId(next);
        showToast(t("profile.using", { name: currentProfileLabel() }), "ok");
        void showView(activeView);
        return;
      }
      close();
    });
  });
  menu.querySelector("[data-view='accounts']")?.addEventListener("click", () => {
    close();
    void showView("accounts");
  });
}

function bindMenuSwitcher(rootSelector, btnId, menuId, optionAttr, onPick) {
  const root = document.querySelector(rootSelector);
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  if (!root || !btn || !menu) return;

  const close = () => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", onPointerDown);
    document.removeEventListener("keydown", onKeyDown);
  };
  const onPointerDown = (ev) => {
    if (!root.contains(ev.target)) close();
  };
  const onKeyDown = (ev) => {
    if (ev.key === "Escape") close();
  };
  const open = () => {
    closeTopbarMenus();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
    }, 0);
  };

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (menu.hidden) open();
    else close();
  });
  menu.querySelectorAll(`[${optionAttr}]`).forEach((opt) => {
    opt.addEventListener("click", () => {
      onPick(opt.getAttribute(optionAttr) || "");
      close();
    });
  });
}

function bindLocaleSwitcher() {
  bindMenuSwitcher(".locale-switcher:not(.theme-switcher)", "locale-switcher-btn", "locale-switcher-menu", "data-locale", (next) => {
    if (next && next !== getLocale()) setLocale(next);
  });
}

function bindThemeSwitcher() {
  bindMenuSwitcher(".theme-switcher", "theme-switcher-btn", "theme-switcher-menu", "data-theme", (next) => {
    if (next && next !== getThemePreference()) setThemePreference(next);
  });
}

function renderTopbarTools() {
  const tools = document.getElementById("topbar-tools");
  if (!tools) return;
  // Profile · pairing QR · theme · language.
  tools.innerHTML = `${navProfileHtml()}${pairingQrShortcutHtml()}${themeSwitcherHtml()}${localeSwitcherHtml()}`;
  bindNavProfile();
  bindPairingQrShortcut();
  bindThemeSwitcher();
  bindLocaleSwitcher();
}

function renderNav(active) {
  const nav = document.getElementById("nav");
  const items = VIEWS.filter((v) => v.id !== "homeChat" || haHomeChatReady)
    .map((v) => {
      const on = v.id === active;
      return `<button type="button" data-view="${v.id}" class="nav-item${on ? " active" : ""}" aria-current="${
        on ? "page" : "false"
      }">${navItemIcon(v.id)}<span class="nav-item-label">${escapeHtml(t(v.labelKey))}</span></button>`;
    })
    .join("");
  nav.innerHTML = `<div class="nav-brand">
      <img src="/logo.png" width="32" height="32" alt="" />
      <div class="nav-brand-copy">
        <span class="nav-brand-name">${escapeHtml(t("app.name"))}</span>
        <span class="nav-brand-tag">${escapeHtml(t("app.lede"))}</span>
      </div>
    </div>
    <div class="nav-menu" role="navigation" aria-label="${escapeHtml(t("app.settings"))}">
      ${items}
    </div>`;
  nav.querySelectorAll("button[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
  renderTopbarTools();
}

function pickDefaultProfile(accounts) {
  if (!accounts.length) return "";
  const stored = accountId();
  if (stored && accounts.some((a) => a.accountId === stored)) return stored;
  // Fall back to most recently created when last-used is missing/stale.
  const sorted = [...accounts].sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
  );
  return sorted[0]?.accountId || accounts[0].accountId;
}

async function listAccountRows() {
  const res = await rpc("home.listAccounts");
  if (res.error) throw new Error(res.error.message || "listAccounts failed");
  const accounts = res.result?.accounts || [];
  const next = pickDefaultProfile(accounts);
  if (next) setAccountId(next);
  cachedAccounts = accounts;
  return accounts;
}

let profileGateBound = false;

function hideProfileGate() {
  const gate = document.getElementById("profile-gate");
  if (gate) gate.hidden = true;
  document.body.classList.remove("modal-open");
}

function bindProfileGateForm() {
  if (profileGateBound) return;
  profileGateBound = true;
  document.getElementById("profile-gate-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const displayName = String(fd.get("displayName") || "").trim();
    if (!displayName) return;
    const btn = ev.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const ans = await rpc("home.createAccount", { displayName });
      if (ans.error) {
        showToast(errMsg(ans) || t("profile.createFailed"), "err");
        return;
      }
      const created = ans.result?.account;
      if (created?.accountId) {
        setAccountId(created.accountId);
        showToast(t("profile.welcomeToast", { name: created.displayName || displayName }));
      }
      hideProfileGate();
      applyDomI18n();
      await showView(activeView);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

/** Blocking modal when the household has no profiles yet. */
async function ensureProfileGate() {
  if (!sock || sock.readyState !== WebSocket.OPEN) return false;
  bindProfileGateForm();
  const accounts = await listAccountRows();
  const gate = document.getElementById("profile-gate");
  if (!gate) return accounts.length > 0;
  if (accounts.length === 0) {
    gate.hidden = false;
    document.body.classList.add("modal-open");
    gate.querySelector('input[name="displayName"]')?.focus();
    return false;
  }
  hideProfileGate();
  return true;
}

function pre(obj) {
  return `<pre>${JSON.stringify(obj, null, 2)}</pre>`;
}

function errMsg(res) {
  if (res?.error) return res.error.message || JSON.stringify(res.error);
  return null;
}

/** Tauri IPC when running inside the desktop shell (`withGlobalTauri`). */
function tauriInvoke(cmd, args) {
  const invoke = globalThis.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") return Promise.resolve(undefined);
  return invoke(cmd, args);
}

function isTauriShell() {
  return typeof globalThis.__TAURI__?.core?.invoke === "function";
}

/** Open http(s) in the system browser (Tauri) or a new tab (plain browser).
 *  Resolves `false` when the open clearly failed. */
function openExternalUrl(url) {
  const href = String(url || "").trim();
  if (!/^https?:\/\//i.test(href)) return Promise.resolve(false);
  if (isTauriShell()) {
    return tauriInvoke("open_external_url", { url: href })
      .then(() => true)
      .catch((err) => {
        console.warn("open_external_url failed", err);
        return false;
      });
  }
  window.open(href, "_blank", "noopener,noreferrer");
  return Promise.resolve(true);
}

/** Tauri webviews ignore target=_blank — route external anchors via open_external_url. */
document.addEventListener(
  "click",
  (ev) => {
    if (ev.defaultPrevented) return;
    if (ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target instanceof Element ? ev.target.closest("a[href]") : null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href)) return;
    if (!isTauriShell()) return;
    ev.preventDefault();
    void openExternalUrl(href);
  },
  true,
);

/** Best-effort absolute path from a dropped File (Tauri / Chromium). */
function pathFromDroppedFile(file) {
  if (!file) return "";
  const p = /** @type {{ path?: string }} */ (file).path;
  return typeof p === "string" && p.trim() ? p.trim() : "";
}

/** Context window presets (wire = absolute tokens). Includes common vendor windows. */
const CONTEXT_TOKEN_PRESETS = [
  { value: 128_000, labelKey: "models.context128k" },
  { value: 200_000, labelKey: "models.context200k" },
  { value: 204_800, labelKey: "models.context205k" },
  { value: 256_000, labelKey: "models.context256k" },
  { value: 400_000, labelKey: "models.context400k" },
  { value: 500_000, labelKey: "models.context500k" },
  { value: 512_000, labelKey: "models.context512k" },
  { value: 1_000_000, labelKey: "models.context1m" },
  { value: 1_050_000, labelKey: "models.context1m05" },
  { value: 2_000_000, labelKey: "models.context2m" },
  { value: 10_000_000, labelKey: "models.context10m" },
];

function contextTokensSelectValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  const exact = CONTEXT_TOKEN_PRESETS.find((p) => p.value === n);
  if (exact) return String(exact.value);
  // Nearest preset (legacy raw token counts).
  let best = CONTEXT_TOKEN_PRESETS[0];
  let bestDist = Math.abs(n - best.value);
  for (const p of CONTEXT_TOKEN_PRESETS) {
    const d = Math.abs(n - p.value);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return String(best.value);
}

/** Optional Smart Routing fields — Advanced on add + editable on cards (collapsed). */
function providerRoutingFieldsHtml(values = {}) {
  const v = (key, fallback = "") => {
    const x = values[key];
    return x == null || x === "" ? fallback : String(x);
  };
  const ctxSel = contextTokensSelectValue(values.contextTokens);
  const ctxOpts = CONTEXT_TOKEN_PRESETS.map(
    (p) =>
      `<option value="${p.value}" ${ctxSel === String(p.value) ? "selected" : ""}>${escapeHtml(
        t(p.labelKey),
      )}</option>`,
  ).join("");
  const costSel = costRankSelectValue(values.costRank);
  const costOpts = COST_TIERS.map(
    (tier) =>
      `<option value="${tier.costRank}" ${costSel === String(tier.costRank) ? "selected" : ""}>${escapeHtml(
        t(tier.labelKey),
      )}</option>`,
  ).join("");
  const lat = String(values.latencyClass || "");
  const latOpts = [
    ["", "models.latencyUnset"],
    ["fast", "models.latencyFast"],
    ["standard", "models.latencyStandard"],
    ["slow", "models.latencySlow"],
  ]
    .map(
      ([val, key]) =>
        `<option value="${escapeHtml(val)}" ${lat === val ? "selected" : ""}>${escapeHtml(t(key))}</option>`,
    )
    .join("");
  return `<details class="prov-advanced">
            <summary>${escapeHtml(t("models.advanced"))}</summary>
            <p class="muted routing-hint">${escapeHtml(t("models.advancedHint"))}</p>
            <label>${escapeHtml(t("models.paramCountB"))}
              <input name="paramCountB" type="number" step="0.1" min="0" placeholder="e.g. 8" value="${escapeHtml(v("paramCountB"))}" />
            </label>
            <label>${escapeHtml(t("models.costRank"))}
              <select name="costRank">
                <option value="" ${costSel === "" ? "selected" : ""}>${escapeHtml(t("models.costUnset"))}</option>
                ${costOpts}
              </select>
            </label>
            <p class="muted routing-hint">${escapeHtml(t("models.costRankHint"))}</p>
            <label>${escapeHtml(t("models.contextTokens"))}
              <select name="contextTokens">
                <option value="" ${ctxSel === "" ? "selected" : ""}>${escapeHtml(t("models.contextUnset"))}</option>
                ${ctxOpts}
              </select>
            </label>
            <label>${escapeHtml(t("models.latencyClass"))}
              <select name="latencyClass">${latOpts}</select>
            </label>
            <label class="prov-check">
              <input type="checkbox" name="supportsVision" ${values.supportsVision === true ? "checked" : ""} />
              <span>${escapeHtml(t("models.supportsVision"))}</span>
            </label>
          </details>`;
}

/**
 * Parse Advanced fields. Tools are always assumed supported.
 * Empty / Unset → null so the daemon clears the stored value (autosave must not keep stale ranks).
 */
function routingPropsFromFormData(fd) {
  const out = { supportsTools: true };
  const rawParams = String(fd.get("paramCountB") ?? "").trim();
  if (rawParams === "") out.paramCountB = null;
  else {
    const paramCountB = Number(rawParams);
    if (Number.isFinite(paramCountB) && paramCountB > 0) out.paramCountB = paramCountB;
  }
  const rawCost = String(fd.get("costRank") ?? "").trim();
  if (rawCost === "") out.costRank = null;
  else {
    const costRank = Number(rawCost);
    if (Number.isFinite(costRank)) out.costRank = costRank;
  }
  const rawCtx = String(fd.get("contextTokens") ?? "").trim();
  if (rawCtx === "") out.contextTokens = null;
  else {
    const contextTokens = Number(rawCtx);
    if (Number.isFinite(contextTokens) && contextTokens > 0) {
      out.contextTokens = Math.floor(contextTokens);
    }
  }
  const rawLat = String(fd.get("latencyClass") ?? "").trim();
  if (rawLat === "") out.latencyClass = null;
  else if (rawLat === "fast" || rawLat === "standard" || rawLat === "slow") {
    out.latencyClass = rawLat;
  }
  out.supportsVision = fd.get("supportsVision") === "on";
  return out;
}

/** One-line Advanced summary under a provider card. */
function providerRoutingSummaryText(p) {
  const ctxLabel = (() => {
    if (p.contextTokens == null) return null;
    const sel = contextTokensSelectValue(p.contextTokens);
    const preset = CONTEXT_TOKEN_PRESETS.find((x) => String(x.value) === sel);
    return preset ? t(preset.labelKey) : `${p.contextTokens}`;
  })();
  const latLabel =
    p.latencyClass === "fast"
      ? t("models.latencyFast")
      : p.latencyClass === "standard"
        ? t("models.latencyStandard")
        : p.latencyClass === "slow"
          ? t("models.latencySlow")
          : null;
  return [
    p.paramCountB != null ? `${p.paramCountB}B` : null,
    (() => {
      const tier = costTierForRank(p.costRank);
      return tier ? t(tier.labelKey) : null;
    })(),
    ctxLabel,
    latLabel,
    p.supportsVision === true ? t("models.supportsVision") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Fill Advanced inputs under `root` from a curated model profile (preset catalog). */
function fillRoutingFieldsFromProfile(root, profile) {
  if (!root) return;
  const setInput = (name, value) => {
    const el = root.querySelector(`[name="${name}"]`);
    if (!el) return;
    if (el.type === "checkbox") {
      el.checked = value === true;
      return;
    }
    if (value == null || value === "") {
      el.value = "";
      return;
    }
    if (name === "contextTokens") {
      el.value = contextTokensSelectValue(value);
      return;
    }
    if (name === "costRank") {
      el.value = costRankSelectValue(value);
      return;
    }
    el.value = String(value);
  };
  setInput("paramCountB", profile?.paramCountB);
  setInput("costRank", profile?.costRank);
  setInput("contextTokens", profile?.contextTokens);
  setInput("latencyClass", profile?.latencyClass);
  // Add Provider: vision stays off by default — user opts in (do not inherit from catalog).
  setInput("supportsVision", false);
}

/** Prefer account-scoped routing; fall back if an older daemon still uses emptyParams. */
async function listProvidersRpc(aid) {
  if (!aid) return rpc("home.listProviders", {});
  const withAid = await rpc("home.listProviders", { accountId: aid });
  if (!withAid.error) return withAid;
  const msg = errMsg(withAid) || "";
  if (/accountId.*not an allowed field|\/params\/accountId/i.test(msg)) {
    return rpc("home.listProviders", {});
  }
  return withAid;
}

async function ensureChatSession(aid, purpose = "general") {
  const isHome = purpose === "home";
  let sid = isHome ? homeChatSessionId : chatSessionId;
  if (!sid) sid = loadStoredChatSessionId(aid, purpose);
  if (sid) {
    // Reuse stored session if the daemon still has it (keeps multi-turn history).
    const probe = await rpc("home.getTranscript", { accountId: aid, sessionId: sid }).catch(
      () => null,
    );
    if (probe && !probe.error) {
      if (isHome) homeChatSessionId = sid;
      else chatSessionId = sid;
      storeChatSessionId(aid, purpose, sid);
      return sid;
    }
  }
  const opened = await rpc("home.openSession", {
    accountId: aid,
    title: isHome ? t("homeChat.sessionTitle") : t("chat.sessionTitle"),
    ...(isHome ? { purpose: "home" } : { purpose: "general" }),
  });
  if (opened.error) throw new Error(errMsg(opened));
  sid = opened.result.sessionId;
  if (isHome) homeChatSessionId = sid;
  else chatSessionId = sid;
  storeChatSessionId(aid, purpose, sid);
  return sid;
}

async function showView(id) {
  // Legacy deep-links → LLM / Connections / Automation / System tabs
  if (id === "harness") {
    // Legacy deep-link: Harness UI is hidden; every profile uses envoy-harness.
    llmTab = "models";
    id = "llm";
  } else if (id === "local" || id === "models" || id === "routing" || id === "memory") {
    llmTab = id;
    id = "llm";
  } else if (
    id === "pairing" ||
    id === "bindings" ||
    id === "channels" ||
    id === "homeassistant" ||
    id === "mqtt"
  ) {
    // Legacy "bindings" / Channel links → combined Channels tab (IM + sender links).
    connectionsTab = id === "bindings" ? "channels" : id;
    id = "connections";
  } else if (id === "smarthome") {
    // Legacy Skills → Smart home → Connections → Home Assistant (bind lives there).
    connectionsTab = "homeassistant";
    id = "connections";
  } else if (id === "skills" || id === "workflows" || id === "jobs") {
    automationTab = id;
    id = "automation";
  } else if (id === "artifacts") {
    systemTab = "files";
    id = "system";
  } else if (id === "doctor") {
    systemTab = "health";
    id = "system";
  } else if (id === "advanced") {
    systemTab = "machine";
    id = "system";
  }
  activeView = id;
  document.body.dataset.view = id;
  renderNav(id);
  const el = document.getElementById("view");
  el.innerHTML = `<h2>${id}</h2><p>${escapeHtml(t("app.loading"))}</p>`;
  try {
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      el.innerHTML = `<h2>${id}</h2><p>${escapeHtml(t("app.waitingDaemon"))}</p>`;
      return;
    }
    const hasProfile = await ensureProfileGate();
    if (!hasProfile) {
      el.innerHTML = `<h2>${escapeHtml(t("profile.welcome"))}</h2>
        <div class="empty">
          <p>${escapeHtml(t("profile.welcomeHint"))}</p>
          <p class="muted">${escapeHtml(t("profile.welcomeMuted"))}</p>
        </div>`;
      return;
    }
    await refreshHaHomeChatReady();
    if (id === "homeChat" && !haHomeChatReady) {
      id = "chat";
      activeView = id;
      document.body.dataset.view = id;
    }
    const accounts = await listAccountRows();
    const aid = accountId();
    renderNav(id);

    if (id === "approvals") {
      // Pending approvals live in Chat; keep old deep-links working.
      await showView("chat");
      return;
    }

    if (id === "chat" || id === "homeChat") {
      const isHome = id === "homeChat";
      const log = isHome ? homeChatLog : chatLog;
      const emptyKey = isHome ? "homeChat.empty" : "chat.empty";
      const placeholderKey = isHome ? "homeChat.placeholder" : "chat.placeholder";
      if (!aid) {
        el.innerHTML = `<div class="chat-page">
          <div class="empty">
            <p>${escapeHtml(t("chat.needProfile"))}</p>
            <p class="muted">${escapeHtml(t("chat.needProfileHint"))}</p>
            <button type="button" id="go-accounts">${escapeHtml(t("profile.openProfiles"))}</button>
          </div>
        </div>`;
        document.getElementById("go-accounts")?.addEventListener("click", () => showView("accounts"));
        return;
      }
      // Restore / refresh thread from daemon (session id may come from localStorage).
      const purpose = isHome ? "home" : "general";
      if (!(isHome ? homeChatSessionId : chatSessionId)) {
        const stored = loadStoredChatSessionId(aid, purpose);
        if (stored) {
          if (isHome) homeChatSessionId = stored;
          else chatSessionId = stored;
        }
      }
      const existingSid = isHome ? homeChatSessionId : chatSessionId;
      if (existingSid) {
        const ok = await hydrateChatLogFromTranscript(aid, existingSid, log);
        if (!ok && log.length === 0) {
          // Stale stored id — clear so the next send opens a fresh session.
          if (isHome) homeChatSessionId = "";
          else chatSessionId = "";
          try {
            localStorage.removeItem(chatSessionStorageKey(aid, purpose));
          } catch {
            /* ignore */
          }
        }
      }
      const approvalsBody = await rpc("home.listApprovals", { accountId: aid }).catch(() => ({
        result: { approvals: [] },
      }));
      chatPendingApprovals = approvalsBody.result?.approvals || [];
      const banner = isHome
        ? `<p class="muted chat-home-banner">${escapeHtml(t("homeChat.banner"))}</p>`
        : "";
      const pendingFiles = pendingFilesForView(isHome);
      stopChatSpeech();
      const voiceTitle = chatVoiceSupported() ? t("chat.voiceHintOs") : chatOsDictationHint();
      el.innerHTML = `<div class="chat-page">
        ${banner}
        <div class="chat-layout">
          <div class="chat-log" id="chat-log">${chatThreadHtml(log, chatPendingApprovals, emptyKey)}</div>
          <form id="chat-form" class="chat-composer">
            <div class="chat-composer-main">
              ${chatAttachChipsHtml(pendingFiles)}
              <div class="chat-composer-row">
                <input type="file" id="chat-file" multiple hidden />
                <button type="button" class="secondary chat-attach-btn" id="chat-attach" title="${escapeHtml(t("chat.attachHint"))}">${escapeHtml(t("chat.attach"))}</button>
                <button type="button" class="secondary chat-voice-btn" id="chat-voice" title="${escapeHtml(voiceTitle)}" aria-label="${escapeHtml(t("chat.voice"))}" aria-pressed="false">${chatMicIconSvg()}</button>
                <input name="text" id="chat-input" placeholder="${escapeHtml(t(placeholderKey))}" autocomplete="off" />
                <button type="submit" id="chat-send">${escapeHtml(t("app.send"))}</button>
              </div>
            </div>
          </form>
        </div>
      </div>`;
      const logEl = document.getElementById("chat-log");
      if (logEl) {
        if (chatPendingApprovals.length) {
          bindApprovalActions(logEl, chatPendingApprovals, () => showView(id));
        }
        logEl.scrollTop = logEl.scrollHeight;
      }
      const form = document.getElementById("chat-form");
      const sendBtn = document.getElementById("chat-send");
      const fileInput = document.getElementById("chat-file");
      document.getElementById("chat-voice")?.addEventListener("click", () => {
        toggleChatSpeech(/** @type {HTMLInputElement | null} */ (document.getElementById("chat-input")));
      });
      const refreshAttachUi = () => {
        const list = document.getElementById("chat-attach-list");
        const wrap = document.querySelector(".chat-composer-main");
        const files = pendingFilesForView(isHome);
        const html = chatAttachChipsHtml(files);
        if (list) {
          if (html) list.outerHTML = html;
          else list.remove();
        } else if (html && wrap) {
          wrap.insertAdjacentHTML("afterbegin", html);
        }
        document.querySelectorAll("[data-attach-remove]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const rid = btn.getAttribute("data-attach-remove");
            setPendingFilesForView(
              isHome,
              pendingFilesForView(isHome).filter((f) => f.id !== rid),
            );
            refreshAttachUi();
          });
        });
      };
      document.getElementById("chat-attach")?.addEventListener("click", () => fileInput?.click());
      fileInput?.addEventListener("change", () => {
        const picked = Array.from(fileInput.files || []);
        fileInput.value = "";
        if (!picked.length) return;
        let next = [...pendingFilesForView(isHome)];
        let added = 0;
        for (const file of picked) {
          if (next.length >= CHAT_ATTACH_MAX_FILES) {
            showToast(t("chat.attachTooMany", { n: String(CHAT_ATTACH_MAX_FILES) }), "err");
            break;
          }
          if (file.size > CHAT_ATTACH_MAX_BYTES) {
            showToast(
              t("chat.attachTooLarge", {
                name: file.name,
                max: formatAttachSize(CHAT_ATTACH_MAX_BYTES),
              }),
              "err",
            );
            continue;
          }
          next.push({
            id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          });
          added += 1;
        }
        setPendingFilesForView(isHome, next);
        refreshAttachUi();
        if (added > 0) {
          showToast(
            t("chat.attachAdded", {
              n: String(added),
              max: String(CHAT_ATTACH_MAX_FILES),
              size: formatAttachSize(CHAT_ATTACH_MAX_BYTES),
            }),
            "ok",
          );
        }
      });
      refreshAttachUi();
      form?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        stopChatSpeech();
        const input = document.getElementById("chat-input");
        const text = String(new FormData(ev.target).get("text") || "").trim();
        const localFiles = [...pendingFilesForView(isHome)];
        if (!text && localFiles.length === 0) {
          showToast(t("chat.needTextOrAttach"), "err");
          return;
        }
        if (!sock || sock.readyState !== WebSocket.OPEN) {
          showToast(t("chat.notConnected"), "err");
          return;
        }
        if (sendBtn?.disabled) return;
        if (sendBtn) sendBtn.disabled = true;
        if (input) input.disabled = true;
        const attachBtn = document.getElementById("chat-attach");
        if (attachBtn) attachBtn.disabled = true;
        const voiceBtn = document.getElementById("chat-voice");
        if (voiceBtn) voiceBtn.disabled = true;
        /** @type {Array<{ kind: string, uri: string, fileName?: string, mimeType?: string, bytes?: number }>} */
        let media = [];
        try {
          for (const item of localFiles) {
            const contentBase64 = await fileToBase64(item.file);
            const up = await rpc(
              "home.uploadChatMedia",
              {
                accountId: aid,
                fileName: item.name,
                contentBase64,
                mimeType: item.mimeType,
              },
              { timeoutMs: 60_000 },
            );
            if (up.error) throw new Error(errMsg(up) || t("chat.attachUploadFailed"));
            media.push({
              kind: up.result.kind,
              uri: up.result.uri,
              fileName: up.result.fileName || item.name,
              ...(up.result.mimeType ? { mimeType: up.result.mimeType } : {}),
              ...(typeof up.result.bytes === "number" ? { bytes: up.result.bytes } : {}),
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          showToast(msg, "err");
          if (sendBtn) sendBtn.disabled = false;
          if (input) input.disabled = false;
          if (attachBtn) attachBtn.disabled = false;
          if (voiceBtn) voiceBtn.disabled = false;
          return;
        }
        setPendingFilesForView(isHome, []);
        refreshAttachUi();
        log.push({
          role: "user",
          text: text || t("chat.attachedOnly"),
          ...(media.length ? { media } : {}),
        });
        log.push({ role: "system", text: t("chat.thinking") });
        if (input) input.value = "";
        renderChatLogDom(log, emptyKey);
        try {
          const sessionId = await ensureChatSession(aid, isHome ? "home" : "general");
          const sent = await rpc(
            "home.sendMessage",
            {
              accountId: aid,
              sessionId,
              text: text || "",
              ...(media.length ? { media } : {}),
            },
            { timeoutMs: 60_000 },
          );
          if (sent.error) {
            clearThinkingPlaceholders(log);
            log.push({ role: "system", text: errMsg(sent) });
            showToast(errMsg(sent) || t("chat.sendFailed"), "err");
            renderChatLogDom(log, emptyKey);
            return;
          }
          const turnId =
            sent.result && typeof sent.result.turnId === "string" ? sent.result.turnId : "";
          if (turnId) {
            for (let i = log.length - 1; i >= 0; i--) {
              if (log[i].role === "user" && !log[i].turnId) {
                log[i].turnId = turnId;
                break;
              }
            }
          }
          // Block until transcript has the assistant reply (events are best-effort).
          await waitForAssistantReply(aid, sessionId, log, 90_000);
          // Refresh inline approvals for this turn (after the matching bubbles).
          const ap = await rpc("home.listApprovals", { accountId: aid }).catch(() => null);
          chatPendingApprovals = ap?.result?.approvals || [];
          if (activeView === id) renderChatLogDom(log, emptyKey);
        } catch (e) {
          clearThinkingPlaceholders(log);
          const msg = e instanceof Error ? e.message : String(e);
          log.push({ role: "system", text: msg });
          showToast(
            /not connected/i.test(msg) ? t("chat.notConnected") : msg,
            "err",
          );
          renderChatLogDom(log, emptyKey);
        } finally {
          if (sendBtn) sendBtn.disabled = false;
          if (attachBtn) attachBtn.disabled = false;
          if (voiceBtn) voiceBtn.disabled = false;
          if (input) {
            input.disabled = false;
            input.focus();
          }
        }
      });
      return;
    }

    if (id === "accounts") {
      const cards =
        accounts.length === 0
          ? `<div class="empty">
              <p>${escapeHtml(t("profile.empty"))}</p>
              <p class="muted">${escapeHtml(t("profile.emptyHint"))}</p>
            </div>`
          : accounts
              .map(
                (a) => `<div class="card">
            <strong>${escapeHtml(a.displayName || a.accountId)}</strong>
            ${a.accountId === aid ? `<span class="badge">${escapeHtml(t("app.active"))}</span>` : ""}
            ${
              a.createdAt
                ? `<div class="muted">${escapeHtml(t("profile.addedAt", { date: a.createdAt }))}</div>`
                : ""
            }
            <div class="row">
              <button type="button" class="secondary" data-use="${escapeHtml(a.accountId)}">${escapeHtml(
                t("app.use"),
              )}</button>
            </div>
          </div>`,
              )
              .join("");
      el.innerHTML = `<h2>${escapeHtml(t("profile.title"))}</h2>
        <p class="muted">${escapeHtml(t("profile.intro"))}</p>
        ${cards}
        <form id="create-acct" class="card">
          <h3>${escapeHtml(t("profile.addTitle"))}</h3>
          <label>${escapeHtml(t("profile.displayName"))} <input name="displayName" required placeholder="${escapeHtml(
            t("profile.displayNamePlaceholder"),
          )}" autocomplete="nickname" /></label>
          <button type="submit">${escapeHtml(t("app.add"))}</button>
        </form>`;
      el.querySelectorAll("[data-use]").forEach((btn) => {
        btn.addEventListener("click", () => {
          setAccountId(btn.getAttribute("data-use") || "");
          const name =
            accounts.find((a) => a.accountId === btn.getAttribute("data-use"))?.displayName ||
            btn.getAttribute("data-use");
          showToast(t("profile.using", { name }));
          showView("accounts");
        });
      });
      document.getElementById("create-acct")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const displayName = String(fd.get("displayName") || "").trim();
        const ans = await rpc("home.createAccount", { displayName });
        if (ans.error) {
          showToast(errMsg(ans) || t("profile.createFailed"), "err");
          return;
        }
        if (ans.result?.account?.accountId) {
          setAccountId(ans.result.account.accountId);
          showToast(t("profile.added", { name: ans.result.account.displayName || displayName }));
        }
        await showView("accounts");
      });
      return;
    }

    if (id === "connections") {
      const tab = (tabId, labelKey) =>
        `<button type="button" role="tab" class="page-tab${connectionsTab === tabId ? " active" : ""}" data-connections-tab="${tabId}" aria-selected="${
          connectionsTab === tabId ? "true" : "false"
        }">${escapeHtml(t(labelKey))}</button>`;
      const tabsHtml = `<div class="page-tabs" role="tablist">
        ${tab("pairing", "nav.pairing")}
        ${tab("homeassistant", "nav.homeAssistant")}
        ${tab("mqtt", "nav.mqtt")}
        ${tab("channels", "nav.channels")}
      </div>`;
      const shell = (panel) =>
        `<h2>${escapeHtml(t("nav.connections"))}</h2>${tabsHtml}<div class="page-tab-panel">${panel}</div>`;
      const wireTabs = () => {
        el.querySelectorAll("[data-connections-tab]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const next = btn.getAttribute("data-connections-tab");
            if (
              next !== "pairing" &&
              next !== "channels" &&
              next !== "homeassistant" &&
              next !== "mqtt"
            ) {
              return;
            }
            if (next === connectionsTab) return;
            connectionsTab = next;
            await showView("connections");
          });
        });
      };

      if (connectionsTab === "pairing") {

        // Mesh-first family invite: choose profile → QR/hostname/SSH → phones list.
        // Precedent: ../EnvoyCoder PairingSection + Design §2.3 EnvoyMesh join channels.
        if (!inviteAccountId || !accounts.some((a) => a.accountId === inviteAccountId)) {
          inviteAccountId = aid || accounts[0]?.accountId || "";
        }
        const [body, health, mesh] = await Promise.all([
          rpc("home.listPairedDevices"),
          rpc("home.health").catch(() => null),
          rpc("home.meshStatus").catch(() => null),
        ]);
        const devices = body.result?.devices || [];
        const wsPort = health?.result?.wsPort ?? health?.wsPort;
        const meshKind = mesh?.result?.mesh?.kind ?? mesh?.result?.kind;
        const meshHosting = meshKind === "hosting";
        const lanHintAddress = wsPort != null ? `192.168.x.x:${wsPort}` : undefined;
        const daemonLoopback =
          wsPort != null ? `127.0.0.1:${wsPort}` : undefined;
        const inviteOptions = profileOptionsHtml(inviteAccountId, accounts);

        const deviceRows = devices
          .map((d) => {
            const state = d.revoked
              ? "revoked"
              : d.lastSeenAt
                ? "active"
                : "unused";
            const stateLabel =
              state === "revoked"
                ? t("pairing.stateRevoked")
                : state === "active"
                  ? t("pairing.stateActive")
                  : t("pairing.stateUnused");
            const boundId = (d.accountIds || [])[0] || "";
            const assign =
              d.revoked || accounts.length === 0
                ? ""
                : `<label class="pairing-assign">
                    <span class="muted">${escapeHtml(t("pairing.assignProfile"))}</span>
                    <select data-assign="${escapeHtml(d.deviceId)}" aria-label="${escapeHtml(t("pairing.assignProfile"))}">
                      <option value="">${escapeHtml(t("app.none"))}</option>
                      ${profileOptionsHtml(boundId, accounts)}
                    </select>
                  </label>`;
            const action = d.revoked
              ? `<button type="button" class="secondary" data-forget="${escapeHtml(d.deviceId)}">${escapeHtml(t("pairing.forget"))}</button>`
              : `<button type="button" data-revoke="${escapeHtml(d.deviceId)}">${escapeHtml(t("pairing.revoke"))}</button>`;
            return `<li class="pairing-code-row" data-device-state="${state}" data-device="${escapeHtml(d.deviceId)}">
              <div class="pairing-code-main">
                <strong>${escapeHtml(d.label || d.deviceId)}</strong>
                <div class="muted">${escapeHtml(stateLabel)}</div>
                ${assign}
              </div>
              ${action}
            </li>`;
          })
          .join("");

        el.innerHTML = shell(`
          <p class="muted pairing-note">${escapeHtml(t("pairing.meshIntro"))}</p>
          <div class="card pairing-invite">
            <label class="pairing-field">
              <span>${escapeHtml(t("pairing.inviteProfile"))}</span>
              <select id="pairing-invite-profile" ${accounts.length ? "" : "disabled"}>
                ${inviteOptions || `<option value="">${escapeHtml(t("profile.noneSelected"))}</option>`}
              </select>
              <span class="muted">${escapeHtml(t("pairing.inviteProfileDetail"))}</span>
            </label>
          </div>

          <section class="pairing-route" data-route="qr" aria-labelledby="pairing-qr-heading">
            <div class="pairing-route-head">
              <h3 id="pairing-qr-heading">${escapeHtml(t("pairing.qrTitle"))}</h3>
              <span class="badge">${escapeHtml(t("pairing.qrPrimary"))}</span>
            </div>
            <p class="muted">${escapeHtml(t("pairing.qrDetail"))}</p>
            <p class="muted" data-mesh-route="${meshHosting ? "ready" : "unavailable"}">${escapeHtml(
              meshHosting ? t("pairing.qrMeshHosting") : t("pairing.qrMeshUnavailable"),
            )}</p>
            <div id="pairing-qr-panel"><p class="muted" role="status">${escapeHtml(t("pairing.qrBusy"))}</p></div>
            <button type="button" id="pairing-qr-fresh" class="secondary">${escapeHtml(t("pairing.qrAction"))}</button>
          </section>

          <section class="pairing-route" data-route="manual" aria-labelledby="pairing-manual-heading">
            <h3 id="pairing-manual-heading">${escapeHtml(t("pairing.manualTitle"))}</h3>
            <p class="muted">${escapeHtml(t("pairing.manualDetail"))}</p>
            <div class="pairing-form" id="pairing-manual-form">
              <label class="pairing-field">
                <span>${escapeHtml(t("pairing.manualAddress"))}</span>
                <input id="pairing-manual-address" type="text" autocomplete="off" spellcheck="false"
                  placeholder="${escapeHtml(t("pairing.manualAddressPlaceholder"))}" />
                <span class="muted">${escapeHtml(t("pairing.manualAddressDetail"))}</span>
                ${
                  lanHintAddress
                    ? `<span class="muted">${escapeHtml(t("pairing.manualLanHint", { address: lanHintAddress }))}</span>`
                    : ""
                }
              </label>
              <label class="pairing-field">
                <span>${escapeHtml(t("pairing.manualToken"))}</span>
                <input id="pairing-manual-token" type="text" autocomplete="off" spellcheck="false"
                  maxlength="${USER_PAIRING_TOKEN_MAX_LEN}"
                  placeholder="${escapeHtml(t("pairing.manualTokenPlaceholder"))}" />
                <span class="muted">${escapeHtml(t("pairing.manualTokenDetail"))}</span>
              </label>
              <button type="button" id="pairing-manual-mint">${escapeHtml(t("pairing.manualAction"))}</button>
              <p id="pairing-manual-error" class="muted" role="alert" hidden></p>
            </div>
            <div id="pairing-manual-result" hidden></div>
          </section>

          <section class="pairing-route" data-route="ssh" aria-labelledby="pairing-ssh-heading">
            <h3 id="pairing-ssh-heading">${escapeHtml(t("pairing.sshTitle"))}</h3>
            <p class="muted">${escapeHtml(t("pairing.sshDetail"))}</p>
            <p class="muted pairing-ssh-prerequisite">${escapeHtml(t("pairing.sshPrerequisite"))}</p>
            <dl class="pairing-facts">
              <div><dt>${escapeHtml(t("pairing.sshHost"))}</dt><dd>${escapeHtml(t("pairing.sshHostDetail"))}</dd></div>
              <div><dt>${escapeHtml(t("pairing.sshPort"))}</dt><dd>${escapeHtml(t("pairing.sshPortDetail"))}</dd></div>
              <div><dt>${escapeHtml(t("pairing.sshUser"))}</dt><dd>${escapeHtml(t("pairing.sshUserDetail"))}</dd></div>
              <div><dt>${escapeHtml(t("pairing.sshDaemon"))}</dt><dd>${escapeHtml(
                daemonLoopback
                  ? t("pairing.sshDaemonDetail", { address: daemonLoopback })
                  : t("pairing.sshDaemonUnknown"),
              )}</dd></div>
              <div><dt>${escapeHtml(t("pairing.sshToken"))}</dt><dd>${escapeHtml(t("pairing.sshTokenDetail"))}</dd></div>
            </dl>
            <p class="muted">${escapeHtml(t("pairing.sshNotInCode"))}</p>
          </section>

          <section class="pairing-route" data-route="phones" aria-labelledby="pairing-phones-heading">
            <h3 id="pairing-phones-heading">${escapeHtml(t("pairing.phonesTitle"))}</h3>
            <p class="muted">${escapeHtml(t("pairing.manage"))}</p>
            ${
              deviceRows
                ? `<ul class="pairing-code-list">${deviceRows}</ul>`
                : `<p class="muted">${escapeHtml(t("pairing.noDevices"))}</p>`
            }
          </section>`);
        wireTabs();

        const qrPanel = document.getElementById("pairing-qr-panel");
        const freshBtn = document.getElementById("pairing-qr-fresh");
        let pairingUri = "";

        const showQrOutcome = async (outcome) => {
          if (!qrPanel) return;
          if (!outcome.ok) {
            qrPanel.innerHTML = `<p class="muted" role="alert">${escapeHtml(outcome.message)}</p>
              <button type="button" id="pairing-qr-retry">${escapeHtml(t("pairing.qrAction"))}</button>`;
            document.getElementById("pairing-qr-retry")?.addEventListener("click", () => {
              void mintQr(true);
            });
            return;
          }
          pairingUri = outcome.uri;
          cachedPairingMint = {
            uri: outcome.uri,
            ...(outcome.deviceId ? { deviceId: outcome.deviceId } : {}),
            ...(outcome.accountId ? { accountId: outcome.accountId } : { accountId: pairingInviteAccountId() }),
          };
          const qrHtml = await renderPairingQrHtml(pairingUri);
          qrPanel.innerHTML = `<div class="pairing-mint" data-testid="pairing-panel">
            ${qrHtml}
            <label class="pairing-uri-label">${escapeHtml(t("pairing.uriLabel"))}
              <textarea id="pairing-uri" class="pairing-uri" readonly rows="3"></textarea>
            </label>
            <div class="row pairing-actions">
              <button type="button" id="pairing-copy">${escapeHtml(t("pairing.copy"))}</button>
            </div>
            <p class="muted">${escapeHtml(t("pairing.secret"))}</p>
          </div>`;
          const uriEl = document.getElementById("pairing-uri");
          if (uriEl) {
            uriEl.value = pairingUri;
            uriEl.addEventListener("focus", () => uriEl.select());
          }
          document.getElementById("pairing-copy")?.addEventListener("click", async () => {
            const ok = await copyText(pairingUri);
            const btn = document.getElementById("pairing-copy");
            if (btn) btn.textContent = ok ? t("pairing.copied") : t("pairing.copyFailed");
            if (ok) showToast(t("pairing.copied"), "ok");
          });
        };

        let qrBusy = false;
        const mintQr = async (fresh) => {
          if (qrBusy) return;
          const inviteId = pairingInviteAccountId();
          if (!fresh && cachedPairingMint?.uri) {
            const sameProfile =
              !cachedPairingMint.accountId || cachedPairingMint.accountId === inviteId;
            const stillListed =
              !cachedPairingMint.deviceId ||
              devices.some((d) => d.deviceId === cachedPairingMint.deviceId && !d.revoked);
            if (sameProfile && stillListed) {
              await showQrOutcome({
                ok: true,
                uri: cachedPairingMint.uri,
                deviceId: cachedPairingMint.deviceId,
                accountId: cachedPairingMint.accountId,
              });
              return;
            }
            cachedPairingMint = null;
          }
          qrBusy = true;
          if (freshBtn) {
            freshBtn.disabled = true;
            freshBtn.textContent = t("pairing.qrBusy");
          }
          if (qrPanel) {
            qrPanel.innerHTML = `<p class="muted" role="status">${escapeHtml(t("pairing.qrBusy"))}</p>`;
          }
          try {
            const outcome = await mintPairingCode({
              ...(fresh ? { fresh: true } : {}),
              accountId: inviteId,
            });
            if (outcome.ok) {
              cachedPairingMint = {
                uri: outcome.uri,
                ...(outcome.deviceId ? { deviceId: outcome.deviceId } : {}),
                accountId: inviteId,
              };
              qrBusy = false;
              await showView("pairing");
              return;
            }
            await showQrOutcome(outcome);
          } catch (err) {
            await showQrOutcome({
              ok: false,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          qrBusy = false;
          if (freshBtn) {
            freshBtn.disabled = false;
            freshBtn.textContent = t("pairing.qrAction");
          }
        };

        document.getElementById("pairing-invite-profile")?.addEventListener("change", (ev) => {
          inviteAccountId = String(ev.target.value || "");
          cachedPairingMint = null;
          void mintQr(true);
        });

        freshBtn?.addEventListener("click", () => {
          void mintQr(true);
        });
        void mintQr(false);

        document.getElementById("pairing-manual-mint")?.addEventListener("click", async () => {
          const errEl = document.getElementById("pairing-manual-error");
          const resultEl = document.getElementById("pairing-manual-result");
          const address = String(document.getElementById("pairing-manual-address")?.value || "").trim();
          const rawToken = String(document.getElementById("pairing-manual-token")?.value || "");
          if (errEl) {
            errEl.hidden = true;
            errEl.textContent = "";
          }
          if (!address) {
            if (errEl) {
              errEl.hidden = false;
              errEl.textContent = t("pairing.manualAddressMissing");
            }
            return;
          }
          const normalized = normalizeUserPairingToken(rawToken);
          if (!normalized.ok) {
            if (errEl) {
              errEl.hidden = false;
              errEl.textContent =
                normalized.reason === "length"
                  ? t("pairing.manualTokenLength")
                  : t("pairing.manualTokenCharset");
            }
            return;
          }
          const btn = document.getElementById("pairing-manual-mint");
          if (btn) {
            btn.disabled = true;
            btn.textContent = t("pairing.manualBusy");
          }
          const outcome = await mintPairingCode({
            host: address,
            token: normalized.token,
            deviceLabel: "Phone",
            accountId: pairingInviteAccountId(),
          });
          if (btn) {
            btn.disabled = false;
            btn.textContent = t("pairing.manualAction");
          }
          if (!outcome.ok) {
            if (errEl) {
              errEl.hidden = false;
              errEl.textContent = outcome.message;
            }
            if (resultEl) resultEl.hidden = true;
            return;
          }
          const link = readPairingLink(outcome.uri);
          if (resultEl) {
            resultEl.hidden = false;
            const fields = [];
            if (link.address) {
              fields.push(`<div class="pairing-copy-field">
                <span>${escapeHtml(t("pairing.manualAddress"))}</span>
                <code>${escapeHtml(link.address)}</code>
                <button type="button" class="secondary" data-copy="${escapeHtml(link.address)}">${escapeHtml(t("pairing.fieldCopy"))}</button>
              </div>`);
            }
            if (link.token) {
              fields.push(`<div class="pairing-copy-field">
                <span>${escapeHtml(t("pairing.manualToken"))}</span>
                <code>${escapeHtml(link.token)}</code>
                <button type="button" class="secondary" data-copy="${escapeHtml(link.token)}">${escapeHtml(t("pairing.fieldCopy"))}</button>
              </div>`);
            }
            resultEl.innerHTML = `${fields.join("")}<p class="muted">${escapeHtml(t("pairing.secret"))}</p>`;
            resultEl.querySelectorAll("[data-copy]").forEach((b) => {
              b.addEventListener("click", async () => {
                const ok = await copyText(b.getAttribute("data-copy") || "");
                b.textContent = ok ? t("pairing.copied") : t("pairing.copyFailed");
              });
            });
          }
          await showView("pairing");
        });

        el.querySelectorAll("[data-assign]").forEach((sel) => {
          sel.addEventListener("change", async () => {
            const deviceId = sel.getAttribute("data-assign");
            if (!deviceId) return;
            const next = String(sel.value || "");
            const ans = await rpc("home.setDeviceAccounts", {
              deviceId,
              accountIds: next ? [next] : [],
            });
            if (ans.error) {
              showToast(errMsg(ans) || t("pairing.assignFailed"), "err");
              await showView("pairing");
              return;
            }
            showToast(t("pairing.assignOk"), "ok");
          });
        });

        el.querySelectorAll("[data-revoke]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const deviceId = btn.getAttribute("data-revoke");
            if (!deviceId) return;
            const ans = await rpc("home.revokePairedDevice", { deviceId });
            if (ans.error) showToast(errMsg(ans) || t("pairing.revokeFailed"), "err");
            if (cachedPairingMint?.deviceId === deviceId) cachedPairingMint = null;
            await showView("pairing");
          });
        });
        el.querySelectorAll("[data-forget]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const deviceId = btn.getAttribute("data-forget");
            if (!deviceId) return;
            const ans = await rpc("home.forgetPairedDevice", { deviceId });
            if (ans.error) showToast(errMsg(ans) || t("pairing.forgetFailed"), "err");
            if (cachedPairingMint?.deviceId === deviceId) cachedPairingMint = null;
            await showView("pairing");
          });
        });
        return;
      }

      // Channels: Chat-only IM bots (Design §5.0 catalog) + sender → profile links.
      // Smart-home object binding lives on Connections → Home Assistant / MQTT.
      if (connectionsTab === "channels") {
        const chatIds = CHAT_BOTS.map((b) => b.id);
        const statusResults = await Promise.all(
          chatIds.map((id) => rpc("home.getChannelStatus", { id }).catch(() => null)),
        );
        const statusById = Object.fromEntries(
          chatIds.map((id, i) => [id, statusResults[i]?.result || {}]),
        );
        const bindingsBody = await rpc("home.listBindings", {}).catch(() => ({
          result: { bindings: [] },
        }));
        const chatIdSet = new Set(chatIds);
        const chatBindings = (bindingsBody.result?.bindings || []).filter(
          (b) => b.kind === "sender" && chatIdSet.has(b.channel),
        );
        const profileOpts = profileOptionsHtml(aid, accounts);
        const statusLine = (r) =>
          [
            r.enabled ? t("channels.haStatusEnabled") : t("channels.haStatusDisabled"),
            r.healthy === true
              ? t("channels.mqttStatusHealthy")
              : r.healthy === false
                ? t("channels.mqttStatusUnhealthy")
                : null,
            r.detail ? String(r.detail) : null,
          ]
            .filter(Boolean)
            .join(" · ") || t("channels.statusUnknown");
        const bindCards = chatBindings
          .map((b) => {
            const profile =
              accounts.find((a) => a.accountId === b.accountId)?.displayName || b.accountId || "";
            return `<li class="im-binding-row">
              <div class="im-binding-meta">
                <strong>${escapeHtml(b.channel || "")}</strong>
                <code>${escapeHtml(b.senderId || b.deviceId || "")}</code>
                <span class="muted">→</span>
                <span>${escapeHtml(profile)}</span>
              </div>
              <button type="button" class="secondary" data-unbind="${escapeHtml(b.bindingId || "")}">${escapeHtml(t("bindings.remove"))}</button>
            </li>`;
          })
          .join("");
        const botCards = CHAT_BOTS.map((bot) => {
          const draft = chatBotDrafts[bot.id] || {};
          // Hydrate non-secret config from daemon status so reload + Save cannot wipe agentId etc.
          const stored = statusById[bot.id]?.config;
          if (stored && typeof stored === "object") {
            for (const [k, v] of Object.entries(stored)) {
              if (v == null || v === "") continue;
              if (typeof draft[k] === "string" && draft[k].trim()) continue;
              draft[k] = typeof v === "string" || typeof v === "number" ? String(v) : draft[k];
            }
          }
          const formId = `${bot.id}-config`;
          const secretFields = (bot.secrets || [])
            .map(
              (s) => `<label>${escapeHtml(t(s.labelKey))}
              <input name="${escapeHtml(s.name)}" type="password" autocomplete="off" placeholder="${escapeHtml(t("channels.tokenKeep"))}" value="" /></label>`,
            )
            .join("");
          const configFields = (bot.configFields || [])
            .map(
              (f) => `<label>${escapeHtml(t(f.labelKey))}
              <input name="${escapeHtml(f.name)}" ${f.required ? "required" : ""} value="${escapeHtml(String(draft[f.name] || ""))}" /></label>`,
            )
            .join("");
          const advancedFields = (bot.advanced || [])
            .map(
              (f) => `<label>${escapeHtml(t(f.labelKey))}
              <input name="${escapeHtml(f.name)}" placeholder="${escapeHtml(f.placeholder || "")}" value="${escapeHtml(String(draft[f.name] || (f.name === "channelAccount" ? "default" : "")))}" /></label>`,
            )
            .join("");
          // Keep V-UX-3 ids for Telegram (#tg-config / #tg-enable / #tg-disable).
          const enableId = bot.id === "telegram" ? "tg-enable" : `${bot.id}-enable`;
          const disableId = bot.id === "telegram" ? "tg-disable" : `${bot.id}-disable`;
          const formAttr = bot.id === "telegram" ? 'id="tg-config"' : `id="${formId}"`;
          const enabled = statusById[bot.id]?.enabled === true;
          return `<form ${formAttr} class="card im-step-card" data-chat-bot="${escapeHtml(bot.id)}">
            <strong class="im-step-title">${escapeHtml(t(bot.titleKey))}</strong>
            <p class="muted" id="${escapeHtml(bot.id)}-status-line">${escapeHtml(statusLine(statusById[bot.id] || {}))}</p>
            <p class="muted ha-demo-body">${escapeHtml(t(bot.bodyKey))}</p>
            ${secretFields}
            ${configFields}
            <details class="channel-install-hint">
              <summary class="muted">${escapeHtml(t("channels.advanced"))}</summary>
              ${advancedFields}
              <p class="muted ha-intro-docs"><code>${escapeHtml(bot.doc)}</code></p>
            </details>
            <p class="muted">${escapeHtml(t(bot.hintKey))}</p>
            <p class="muted">${escapeHtml(t("channels.autoSaveHint"))}</p>
            <div class="row im-power-row" id="${escapeHtml(bot.id)}-power-row">
              <button type="button" id="${enableId}"${enabled ? " hidden" : ""}>${escapeHtml(t("channels.enable"))}</button>
              <button type="button" class="secondary" id="${disableId}"${enabled ? "" : " hidden"}>${escapeHtml(t("channels.disable"))}</button>
            </div>
          </form>`;
        }).join("");
        // Link only offers connections that are actually enabled (configured + running).
        const linkableBots = CHAT_BOTS.filter((b) => statusById[b.id]?.enabled === true);
        const channelOpts = linkableBots.length
          ? linkableBots
              .map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(t(b.titleKey))}</option>`)
              .join("")
          : `<option value="" disabled selected>${escapeHtml(t("channels.bindNoChannels"))}</option>`;
        el.innerHTML = shell(`
          <section class="channel-intro im-intro" aria-labelledby="im-intro-title">
            <h3 id="im-intro-title">${escapeHtml(t("channels.introTitle"))}</h3>
            <p class="lede">${escapeHtml(t("channels.introLede"))}</p>
            <ul class="ha-intro-list">
              <li>${escapeHtml(t("channels.introItemPhones"))}</li>
              <li>${escapeHtml(t("channels.introItemChatOnly"))}</li>
              <li>${escapeHtml(t("channels.introItemChat"))}</li>
            </ul>
          </section>

          <section class="channel-intro im-link-section" aria-labelledby="im-link-title">
            <h3 id="im-link-title">${escapeHtml(t("channels.linkSectionTitle"))}</h3>
            <p class="lede">${escapeHtml(t("channels.linkSectionLede"))}</p>
            <ul class="ha-intro-list">
              <li>${escapeHtml(t("channels.linkIntroItemDm"))}</li>
              <li>${escapeHtml(t("channels.linkIntroItemId"))}</li>
              <li>${escapeHtml(t("channels.linkIntroItemPick"))}</li>
              <li>${escapeHtml(t("channels.linkIntroItemMulti"))}</li>
            </ul>
            <form id="tg-bind" class="card im-step-card">
              <p class="muted ha-demo-body">${escapeHtml(t("channels.bindChatHint"))}</p>
              ${
                linkableBots.length === 0
                  ? `<p class="muted">${escapeHtml(t("channels.bindNeedChannel"))}</p>`
                  : ""
              }
              <label>${escapeHtml(t("channels.channel"))}
                <select name="channel" required ${linkableBots.length ? "" : "disabled"}>${channelOpts}</select>
              </label>
              <label>${escapeHtml(t("channels.senderId"))}
                <input name="senderId" required placeholder="sender id" ${linkableBots.length ? "" : "disabled"} />
              </label>
              <label>${escapeHtml(t("channels.profile"))}
                <select name="accountId" required ${linkableBots.length ? "" : "disabled"}>${profileOpts}</select>
              </label>
              <label>${escapeHtml(t("channels.channelAccount"))}
                <input name="channelAccount" value="default" ${linkableBots.length ? "" : "disabled"} />
              </label>
              <div class="row">
                <button type="submit" ${linkableBots.length ? "" : "disabled"}>${escapeHtml(t("channels.bind"))}</button>
              </div>
              <h4 class="im-bindings-heading">${escapeHtml(t("channels.bindingsTitle"))}</h4>
              <p class="muted ha-demo-body">${escapeHtml(t("channels.bindingsHint"))}</p>
              <ul class="im-binding-list">${bindCards || `<li class="muted">${escapeHtml(t("channels.noTelegramBindings"))}</li>`}</ul>
            </form>
          </section>

          <section class="channel-intro im-connections-section" aria-labelledby="im-connections-title">
            <h3 id="im-connections-title">${escapeHtml(t("channels.connectionsSectionTitle"))}</h3>
            <p class="lede">${escapeHtml(t("channels.connectionsSectionLede"))}</p>
            <p class="muted ha-intro-docs">${escapeHtml(t("channels.guide"))}
              <code>docs/telegram-demo-setup.md</code> · <code>docs/discord-setup.md</code> ·
              <code>docs/slack-setup.md</code> · <code>docs/feishu-setup.md</code> ·
              <code>docs/dingtalk-setup.md</code> · <code>docs/wecom-setup.md</code></p>
            ${botCards}
          </section>`);
        wireTabs();

        const secretNamesFor = (bot) => new Set((bot.secrets || []).map((s) => s.name));
        const configNamesFor = (bot) =>
          new Set([
            ...((bot.configFields || []).map((f) => f.name)),
            ...((bot.advanced || []).map((f) => f.name)),
          ]);

        /** Keep Link form channel list in sync when a bot enables/disables without full remount. */
        const refreshLinkChannelSelect = () => {
          const sel = document.querySelector('#tg-bind select[name="channel"]');
          if (!sel) return;
          const enabledBots = CHAT_BOTS.filter((b) => statusById[b.id]?.enabled === true);
          const prev = sel.value;
          if (enabledBots.length === 0) {
            sel.innerHTML = `<option value="" disabled selected>${escapeHtml(t("channels.bindNoChannels"))}</option>`;
            sel.disabled = true;
          } else {
            sel.innerHTML = enabledBots
              .map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(t(b.titleKey))}</option>`)
              .join("");
            sel.disabled = false;
            if (enabledBots.some((b) => b.id === prev)) sel.value = prev;
          }
          for (const name of ["senderId", "accountId", "channelAccount"]) {
            const field = document.querySelector(`#tg-bind [name="${name}"]`);
            if (field) field.disabled = enabledBots.length === 0;
          }
          const submit = document.querySelector('#tg-bind button[type="submit"]');
          if (submit) submit.disabled = enabledBots.length === 0;
        };

        for (const bot of CHAT_BOTS) {
          const draft = chatBotDrafts[bot.id];
          const formId = bot.id === "telegram" ? "tg-config" : `${bot.id}-config`;
          const enableId = bot.id === "telegram" ? "tg-enable" : `${bot.id}-enable`;
          const disableId = bot.id === "telegram" ? "tg-disable" : `${bot.id}-disable`;
          const secrets = secretNamesFor(bot);
          const configs = configNamesFor(bot);
          const requiredConfig = new Set(
            (bot.configFields || []).filter((f) => f.required).map((f) => f.name),
          );

          const syncDraft = () => {
            const form = document.getElementById(formId);
            if (!form || !draft) return;
            const fd = new FormData(form);
            for (const key of configs) {
              const v = String(fd.get(key) || "").trim();
              if (key === "channelAccount") draft[key] = v || "default";
              else draft[key] = v;
            }
            for (const key of secrets) {
              const v = String(fd.get(key) || "");
              if (v.trim()) draft[key] = v.trim();
            }
          };

          const syncPowerButtons = (enabled) => {
            const enBtn = document.getElementById(enableId);
            const disBtn = document.getElementById(disableId);
            if (enBtn) enBtn.hidden = enabled === true;
            if (disBtn) disBtn.hidden = enabled !== true;
          };

          const refreshStatusLine = async () => {
            const line = document.getElementById(`${bot.id}-status-line`);
            const st = await rpc("home.getChannelStatus", { id: bot.id }).catch(() => null);
            const r = st?.result || {};
            statusById[bot.id] = r;
            if (line) {
              line.textContent =
                [
                  r.enabled ? t("channels.haStatusEnabled") : t("channels.haStatusDisabled"),
                  r.healthy === true
                    ? t("channels.mqttStatusHealthy")
                    : r.healthy === false
                      ? t("channels.mqttStatusUnhealthy")
                      : null,
                  r.detail ? String(r.detail) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || t("channels.statusUnknown");
            }
            syncPowerButtons(r.enabled === true);
            refreshLinkChannelSelect();
          };

          /** Save config/secrets. Pass enable:true to also start the channel. */
          const persist = async ({ quiet = false, enable = false } = {}) => {
            syncDraft();
            const config = { channelAccount: draft.channelAccount || "default" };
            for (const key of configs) {
              if (key === "channelAccount") continue;
              const v = draft[key];
              if (v) config[key] = v;
              else if (!requiredConfig.has(key)) {
                // Explicit empty clears optional advanced fields via loader merge.
                config[key] = "";
              }
            }
            for (const key of requiredConfig) {
              if (!draft[key]) {
                if (!quiet) showToast(t("channels.needToken"), "err");
                return { ok: false };
              }
            }
            const secretBag = {};
            for (const key of secrets) {
              if (draft[key]) secretBag[key] = draft[key];
            }
            const st = statusById[bot.id] || {};
            const alreadyConfigured =
              st.enabled === true ||
              st.healthy === true ||
              (st.config && typeof st.config === "object" && Object.keys(st.config).length > 0);
            // Blank secret inputs mean "keep stored" once the channel was configured (tokenKeep).
            if (Object.keys(secretBag).length === 0 && !alreadyConfigured) {
              if (!quiet) showToast(t("channels.needToken"), "err");
              return { ok: false };
            }
            const ans = await rpc("home.setChannelConfig", {
              id: bot.id,
              config,
              ...(Object.keys(secretBag).length ? { secrets: secretBag } : {}),
            });
            if (ans.error) {
              if (!quiet) showToast(errMsg(ans) || t("channels.bindFailed"), "err");
              return { ok: false };
            }
            if (enable) {
              const en = await rpc("home.enableChannel", { id: bot.id });
              if (en.error && !/already|enabled/i.test(errMsg(en) || "")) {
                if (!quiet) showToast(errMsg(en) || t("channels.bindFailed"), "err");
                return { ok: false };
              }
            }
            return { ok: true };
          };

          /** Ready to autosave credentials (does not enable). */
          const canAutoSave = () => {
            syncDraft();
            for (const key of requiredConfig) {
              if (!draft[key]) return false;
            }
            const st = statusById[bot.id] || {};
            const alreadyConfigured =
              st.enabled === true ||
              st.healthy === true ||
              (st.config && typeof st.config === "object" && Object.keys(st.config).length > 0);
            const hasSecretDraft = [...secrets].some((k) => draft[k]);
            return hasSecretDraft || alreadyConfigured;
          };

          let saveTimer = 0;
          const scheduleAutoSave = () => {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(async () => {
              if (!canAutoSave()) return;
              // Save only — Enable is explicit so Disable is not silently undone by typing.
              const saved = await persist({ quiet: true, enable: false });
              if (saved.ok) await refreshStatusLine();
            }, 600);
          };

          const formEl = document.getElementById(formId);
          formEl?.addEventListener("input", scheduleAutoSave);
          formEl?.addEventListener("change", scheduleAutoSave);
          formEl?.addEventListener("submit", (ev) => {
            ev.preventDefault();
          });
          document.getElementById(enableId)?.addEventListener("click", async () => {
            clearTimeout(saveTimer);
            const saved = await persist({ quiet: false, enable: true });
            if (!saved.ok) return;
            showToast(t("channels.enabledOkGeneric", { name: t(bot.titleKey) }), "ok");
            await showView("channels");
          });
          document.getElementById(disableId)?.addEventListener("click", async () => {
            clearTimeout(saveTimer);
            const ans = await rpc("home.disableChannel", { id: bot.id });
            if (ans.error) {
              showToast(errMsg(ans), "err");
              return;
            }
            showToast(t("channels.disabledOkGeneric", { name: t(bot.titleKey) }), "ok");
            await showView("channels");
          });
        }

        document.getElementById("tg-bind")?.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target);
          const accountIdParam = String(fd.get("accountId") || aid || "");
          const channel = String(fd.get("channel") || "telegram").trim() || "telegram";
          if (!accountIdParam) {
            showToast(t("profile.pick"), "err");
            return;
          }
          const ans = await rpc("home.setBinding", {
            channel,
            channelAccount: String(fd.get("channelAccount") || "default"),
            senderId: String(fd.get("senderId") || "").trim(),
            accountId: accountIdParam,
          });
          if (ans.error) {
            showToast(errMsg(ans) || t("channels.bindFailed"), "err");
            return;
          }
          showToast(t("channels.bound"), "ok");
          await showView("channels");
        });
        el.querySelectorAll("[data-unbind]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const bindingId = btn.getAttribute("data-unbind");
            if (!bindingId) return;
            const ans = await rpc("home.removeBinding", { bindingId });
            if (ans.error) {
              showToast(errMsg(ans) || t("bindings.removeFailed"), "err");
              return;
            }
            await showView("channels");
          });
        });
        return;
      }

      // MQTT (dedicated Connections tab — same auto-save / Test / demo pattern as HA)
      if (connectionsTab === "mqtt") {
        const [mqttSt, demoMqttSt] = await Promise.all([
          rpc("home.getChannelStatus", { id: "mqtt" }).catch(() => null),
          rpc("home.getDemoMqttStatus").catch(() => null),
        ]);
        const mqttResult = mqttSt?.result || {};
        if (mqttResult.enabled === false) {
          const en = await rpc("home.enableChannel", { id: "mqtt" }).catch(() => null);
          if (!en?.error) {
            const refreshed = await rpc("home.getChannelStatus", { id: "mqtt" }).catch(() => null);
            Object.assign(mqttResult, refreshed?.result || {});
            await refreshHaHomeChatReady();
          }
        }
        const demoMqttRunning = demoMqttSt?.result?.running === true;
        const demoBrokerUrl = demoMqttSt?.result?.brokerUrl || "";
        const demoUsername = demoMqttSt?.result?.username || "";
        const demoPassword = demoMqttSt?.result?.password || "";
        // When demo is running, always show its URL + credentials (like HA demo token).
        if (demoMqttRunning) {
          if (demoBrokerUrl) mqttConfigDraft.brokerUrl = demoBrokerUrl;
          if (demoUsername) mqttConfigDraft.username = demoUsername;
          if (demoPassword) mqttConfigDraft.password = demoPassword;
        }
        const mqttBits = [
          mqttResult.ready ? t("channels.haStatusReady") : t("channels.haStatusNotReady"),
          mqttResult.enabled ? t("channels.haStatusEnabled") : t("channels.haStatusDisabled"),
          mqttResult.healthy === true
            ? t("channels.mqttStatusHealthy")
            : mqttResult.healthy === false
              ? t("channels.mqttStatusUnhealthy")
              : null,
          demoMqttRunning ? t("channels.mqttStatusDemoOn") : null,
        ].filter(Boolean);
        const brokerUrlValue =
          mqttConfigDraft.brokerUrl || (demoMqttRunning ? demoBrokerUrl : "");
        const usernameValue =
          mqttConfigDraft.username || (demoMqttRunning ? demoUsername : "");
        const mqttBind = await sourceBindingPanel({
          channel: "mqtt",
          aid: accountId(),
        });
        el.innerHTML = shell(`
          <section class="mqtt-intro channel-intro" aria-labelledby="mqtt-intro-title">
            <h3 id="mqtt-intro-title">${escapeHtml(t("channels.mqttIntroTitle"))}</h3>
            <p class="lede">${escapeHtml(t("channels.mqttIntroLede"))}</p>
            <ul class="ha-intro-list">
              <li>${escapeHtml(t("channels.mqttIntroItemBus"))}</li>
              <li>${escapeHtml(t("channels.mqttIntroItemNotBroker"))}</li>
              <li>${escapeHtml(t("channels.mqttIntroItemTools"))}</li>
              <li>${escapeHtml(t("channels.mqttIntroItemBind"))}</li>
              <li>${escapeHtml(t("channels.mqttIntroItemStatus"))}</li>
            </ul>
            <p class="muted ha-intro-docs">${escapeHtml(t("channels.mqttGuide"))} <code>docs/mqtt-setup.md</code></p>
          </section>
          <p class="muted" id="mqtt-status-line">${escapeHtml(mqttBits.join(" · ") || t("channels.mqttStatusUnknown"))}</p>
          <div class="card ha-demo-card">
            <strong>${escapeHtml(t("channels.mqttDemoTitle"))}</strong>
            <p class="muted ha-demo-body">${escapeHtml(t("channels.mqttDemoBody"))}</p>
            <div class="row">
              <button type="button" id="mqtt-demo-toggle">${escapeHtml(
                demoMqttRunning ? t("channels.mqttDemoStop") : t("channels.mqttDemoStart"),
              )}</button>
              ${
                demoMqttRunning
                  ? `<button type="button" class="secondary" id="mqtt-demo-open-panel">${escapeHtml(
                      t("channels.mqttDemoOpenPanel"),
                    )}</button>`
                  : ""
              }
            </div>
          </div>
          <p class="muted">${escapeHtml(t("channels.mqttRealTitle"))}</p>
          <details class="channel-install-hint">
            <summary class="muted">${escapeHtml(t("channels.mqttInstallTitle"))}</summary>
            <p class="muted">${escapeHtml(t("channels.mqttInstallBody"))}</p>
            <ul class="muted channel-install-list">
              <li>${escapeHtml(t("channels.mqttInstallMosquitto"))}
                <a href="https://mosquitto.org/download/" target="_blank" rel="noopener">mosquitto.org/download</a>
              </li>
              <li>${escapeHtml(t("channels.mqttInstallHaAddon"))}</li>
              <li><code>mqtt://127.0.0.1:1883</code> — ${escapeHtml(t("channels.mqttInstallLocal"))}</li>
            </ul>
          </details>
          <form id="mqtt-config" class="card">
            <label>${escapeHtml(t("channels.brokerUrl"))}
              <input name="brokerUrl" placeholder="mqtt://127.0.0.1:1883" value="${escapeHtml(brokerUrlValue)}" />
            </label>
            <label>${escapeHtml(t("channels.username"))}
              <input name="username" autocomplete="off" value="${escapeHtml(usernameValue)}" />
            </label>
            <label>${escapeHtml(t("channels.password"))}
              <input name="password" type="password" autocomplete="off" placeholder="${escapeHtml(t("channels.mqttPasswordKeep"))}" value="${escapeHtml(
                mqttConfigDraft.password || (demoMqttRunning ? demoPassword : ""),
              )}" />
            </label>
            <p class="muted">${escapeHtml(t("channels.mqttAutoSaveHint"))}</p>
            <p id="mqtt-test-status" class="ha-test-status muted" role="status" aria-live="polite"></p>
            <div class="row">
              <button type="button" id="mqtt-test">${escapeHtml(t("channels.mqttTest"))}</button>
            </div>
          </form>
          ${mqttBind.html}`);
        wireTabs();
        mqttBind.wire(el);
        const mqttPassInput = el.querySelector('#mqtt-config input[name="password"]');
        if (mqttPassInput && mqttConfigDraft.password) {
          mqttPassInput.value = mqttConfigDraft.password;
        }

        const setMqttTestStatus = (message, kind = "") => {
          const statusEl = document.getElementById("mqtt-test-status");
          if (!statusEl) return;
          statusEl.textContent = message || "";
          statusEl.className = `ha-test-status${kind === "ok" ? " ok" : kind === "err" ? " err" : " muted"}`;
        };

        const syncMqttDraftFromForm = () => {
          const form = document.getElementById("mqtt-config");
          if (!form) return;
          const fd = new FormData(form);
          mqttConfigDraft.brokerUrl = String(fd.get("brokerUrl") || "").trim();
          mqttConfigDraft.username = String(fd.get("username") || "").trim();
          const pass = String(fd.get("password") || "");
          if (pass.trim()) mqttConfigDraft.password = pass.trim();
        };

        const refreshMqttStatusLine = async () => {
          const line = document.getElementById("mqtt-status-line");
          if (!line) return;
          const [st, demo] = await Promise.all([
            rpc("home.getChannelStatus", { id: "mqtt" }).catch(() => null),
            rpc("home.getDemoMqttStatus").catch(() => null),
          ]);
          const r = st?.result || {};
          const bits = [
            r.ready ? t("channels.haStatusReady") : t("channels.haStatusNotReady"),
            r.enabled ? t("channels.haStatusEnabled") : t("channels.haStatusDisabled"),
            r.healthy === true
              ? t("channels.mqttStatusHealthy")
              : r.healthy === false
                ? t("channels.mqttStatusUnhealthy")
                : null,
            demo?.result?.running ? t("channels.mqttStatusDemoOn") : null,
          ].filter(Boolean);
          line.textContent = bits.join(" · ") || t("channels.mqttStatusUnknown");
          return r;
        };

        const persistMqttConfig = async ({ quiet = false } = {}) => {
          syncMqttDraftFromForm();
          const brokerUrl = mqttConfigDraft.brokerUrl;
          if (!brokerUrl) {
            if (!quiet) setMqttTestStatus(t("channels.mqttNeedUrl"), "err");
            return { ok: false, brokerUrl: "" };
          }
          // Set demo on the fake broker port; clear sticky demo when pointed at a real broker
          // (merge only deletes keys when value is "" / null — Design review sticky-flag fix).
          const config = {
            brokerUrl,
            demo: /(^|[/:])18883\/?$/.test(brokerUrl) ? true : "",
          };
          const secrets = {};
          if (mqttConfigDraft.username) secrets.username = mqttConfigDraft.username;
          if (mqttConfigDraft.password) secrets.password = mqttConfigDraft.password;
          const ans = await rpc("home.setChannelConfig", {
            id: "mqtt",
            config,
            ...(Object.keys(secrets).length ? { secrets } : {}),
          });
          if (ans.error) {
            if (!quiet) setMqttTestStatus(errMsg(ans) || t("channels.mqttSavedOk"), "err");
            return { ok: false, brokerUrl };
          }
          const en = await rpc("home.enableChannel", { id: "mqtt" });
          if (en.error && !/already|enabled/i.test(errMsg(en) || "")) {
            if (!quiet) setMqttTestStatus(errMsg(en), "err");
            return { ok: false, brokerUrl };
          }
          await refreshHaHomeChatReady();
          return { ok: true, brokerUrl };
        };

        let mqttSaveTimer = 0;
        const scheduleMqttAutoSave = () => {
          syncMqttDraftFromForm();
          clearTimeout(mqttSaveTimer);
          mqttSaveTimer = setTimeout(async () => {
            if (!mqttConfigDraft.brokerUrl) return;
            const saved = await persistMqttConfig({ quiet: true });
            if (saved.ok) await refreshMqttStatusLine();
          }, 600);
        };

        document.getElementById("mqtt-config")?.addEventListener("input", scheduleMqttAutoSave);
        document.getElementById("mqtt-config")?.addEventListener("change", scheduleMqttAutoSave);
        document.getElementById("mqtt-config")?.addEventListener("submit", (ev) => {
          ev.preventDefault();
        });

        document.getElementById("mqtt-test")?.addEventListener("click", async () => {
          const btn = document.getElementById("mqtt-test");
          const prevLabel = btn?.textContent || t("channels.mqttTest");
          if (btn) {
            btn.disabled = true;
            btn.textContent = t("channels.mqttTesting");
          }
          setMqttTestStatus(t("channels.mqttTesting"));
          try {
            const saved = await persistMqttConfig({ quiet: false });
            if (!saved.ok) return;
            // Re-enable forces start()+health() so TCP probe runs with the new URL.
            await rpc("home.disableChannel", { id: "mqtt" }).catch(() => null);
            const en = await rpc("home.enableChannel", { id: "mqtt" });
            if (en.error) {
              setMqttTestStatus(errMsg(en), "err");
              return;
            }
            const st = await refreshMqttStatusLine();
            if (st?.healthy === true) {
              setMqttTestStatus(t("channels.mqttTestOk"), "ok");
            } else {
              const detail =
                typeof st?.detail === "string" && st.detail
                  ? st.detail
                  : t("channels.mqttTestFail", { url: saved.brokerUrl });
              setMqttTestStatus(detail, "err");
            }
          } finally {
            if (btn) {
              btn.disabled = false;
              btn.textContent = prevLabel;
            }
          }
        });

        document.getElementById("mqtt-demo-open-panel")?.addEventListener("click", async () => {
          const st = await rpc("home.getDemoMqttStatus").catch(() => null);
          const panelUrl = st?.result?.panelUrl;
          if (!panelUrl) {
            showToast(t("channels.mqttDemoNotRunning"), "err");
            return;
          }
          const opened = await openExternalUrl(panelUrl);
          if (opened === false) {
            showToast(t("channels.mqttDemoPanelOpenFailed", { url: panelUrl }), "err");
          }
        });

        document.getElementById("mqtt-demo-toggle")?.addEventListener("click", async () => {
          if (demoMqttRunning) {
            const ans = await rpc("home.stopDemoMqtt", {});
            if (ans.error) {
              showToast(errMsg(ans) || t("channels.mqttDemoFailed"), "err");
              return;
            }
            showToast(t("channels.mqttDemoStopped"), "ok");
            await refreshHaHomeChatReady();
            await showView("mqtt");
            return;
          }
          const aid = accountId();
          if (!aid) {
            showToast(t("profile.pick"), "err");
            return;
          }
          const ans = await rpc("home.startDemoMqtt", { accountId: aid }, { timeoutMs: 15_000 });
          if (ans.error) {
            const msg = errMsg(ans) || t("channels.mqttDemoFailed");
            const stale = /version_too_low/i.test(msg);
            showToast(stale ? t("channels.mqttDemoStaleDaemon") : msg, "err");
            return;
          }
          if (ans.result?.brokerUrl) mqttConfigDraft.brokerUrl = ans.result.brokerUrl;
          if (ans.result?.username) mqttConfigDraft.username = ans.result.username;
          if (ans.result?.password) mqttConfigDraft.password = ans.result.password;
          const panelUrl = ans.result?.panelUrl;
          if (panelUrl) {
            const opened = await openExternalUrl(panelUrl);
            if (opened === false) {
              showToast(t("channels.mqttDemoPanelOpenFailed", { url: panelUrl }), "err");
            }
          }
          showToast(t("channels.mqttDemoStarted"), "ok");
          await refreshHaHomeChatReady();
          await showView("mqtt");
        });
        return;
      }

      // Home Assistant (dedicated Connections tab)
      if (connectionsTab === "homeassistant") {
        const [haSt, demoSt] = await Promise.all([
          rpc("home.getChannelStatus", { id: "homeassistant" }).catch(() => null),
          rpc("home.getDemoHaStatus").catch(() => null),
        ]);
        const haResult = haSt?.result || {};
        // Config present but disabled → enable automatically (no separate Enable button).
        if (haResult.enabled === false) {
          const en = await rpc("home.enableChannel", { id: "homeassistant" }).catch(() => null);
          if (!en?.error) {
            const refreshed = await rpc("home.getChannelStatus", { id: "homeassistant" }).catch(
              () => null,
            );
            Object.assign(haResult, refreshed?.result || {});
            await refreshHaHomeChatReady();
          }
        }
        const demoRunning = demoSt?.result?.running === true;
        const demoBaseUrl = demoSt?.result?.baseUrl || "";
        const demoToken = demoSt?.result?.token || "";
        // When demo is running, always show its Base URL + token (same as MQTT demo).
        if (demoRunning) {
          if (demoBaseUrl) haConfigDraft.baseUrl = demoBaseUrl;
          if (demoToken) haConfigDraft.accessToken = demoToken;
        }
        const statusBits = [
          haResult.ready ? t("channels.haStatusReady") : t("channels.haStatusNotReady"),
          haResult.enabled ? t("channels.haStatusEnabled") : t("channels.haStatusDisabled"),
          demoRunning ? t("channels.haStatusDemoOn") : null,
        ].filter(Boolean);
        const baseUrlValue = haConfigDraft.baseUrl || (demoRunning ? demoBaseUrl : "");
        const tokenValue =
          haConfigDraft.accessToken || (demoRunning ? demoToken : "");
        const haBind = await sourceBindingPanel({
          channel: "homeassistant",
          aid: accountId(),
        });
        el.innerHTML = shell(`
          <section class="ha-intro" aria-labelledby="ha-intro-title">
            <h3 id="ha-intro-title">${escapeHtml(t("channels.haIntroTitle"))}</h3>
            <p class="lede">${escapeHtml(t("channels.haIntroLede"))}</p>
            <ul class="ha-intro-list">
              <li>${escapeHtml(t("channels.haIntroItemChat"))}</li>
              <li>${escapeHtml(t("channels.haIntroItemApprovals"))}</li>
              <li>${escapeHtml(t("channels.haIntroItemHomeChat"))}</li>
              <li>${escapeHtml(t("channels.haIntroItemBind"))}</li>
              <li>${escapeHtml(t("channels.haIntroItemDemo"))}</li>
            </ul>
            <p class="muted ha-intro-docs">${escapeHtml(t("channels.haGuide"))} <code>docs/homeassistant-setup.md</code></p>
          </section>
          <p class="muted" id="ha-status-line">${escapeHtml(statusBits.join(" · "))}</p>
          <div class="card ha-demo-card">
            <strong>${escapeHtml(t("channels.haDemoTitle"))}</strong>
            <p class="muted ha-demo-body">${escapeHtml(t("channels.haDemoBody"))}</p>
            <div class="row">
              <button type="button" id="ha-demo-toggle">${escapeHtml(
                demoRunning ? t("channels.haDemoStop") : t("channels.haDemoStart"),
              )}</button>
              ${
                demoRunning
                  ? `<button type="button" class="secondary" id="ha-demo-open-panel">${escapeHtml(
                      t("channels.haDemoOpenPanel"),
                    )}</button>`
                  : ""
              }
            </div>
          </div>
          <p class="muted">${escapeHtml(t("channels.haRealTitle"))}</p>
          <details class="channel-install-hint">
            <summary class="muted">${escapeHtml(t("channels.haInstallTitle"))}</summary>
            <p class="muted">${escapeHtml(t("channels.haInstallBody"))}</p>
            <ul class="muted channel-install-list">
              <li>${escapeHtml(t("channels.haInstallOs"))}
                <a href="https://www.home-assistant.io/installation/" target="_blank" rel="noopener">home-assistant.io/installation</a>
              </li>
              <li>${escapeHtml(t("channels.haInstallDocker"))}</li>
              <li>${escapeHtml(t("channels.haInstallToken"))}</li>
              <li><code>http://homeassistant.local:8123</code> — ${escapeHtml(t("channels.haInstallUrl"))}</li>
            </ul>
          </details>
          <form id="ha-config" class="card">
            <label>${escapeHtml(t("channels.baseUrl"))}
              <input name="baseUrl" placeholder="http://homeassistant.local:8123" value="${escapeHtml(baseUrlValue)}" />
            </label>
            <label>${escapeHtml(t("channels.accessToken"))}
              <input name="accessToken" type="password" autocomplete="off" placeholder="${escapeHtml(t("channels.accessTokenKeep"))}" value="${escapeHtml(tokenValue)}" />
            </label>
            <p class="muted">${escapeHtml(t("channels.haAutoSaveHint"))}</p>
            <p id="ha-test-status" class="ha-test-status muted" role="status" aria-live="polite"></p>
            <div class="row">
              <button type="button" id="ha-test">${escapeHtml(t("channels.haTest"))}</button>
            </div>
          </form>
          ${haBind.html}`);
        wireTabs();
        haBind.wire(el);
        const tokenInput = el.querySelector('#ha-config input[name="accessToken"]');
        if (tokenInput && haConfigDraft.accessToken) {
          tokenInput.value = haConfigDraft.accessToken;
        }

        const setHaTestStatus = (message, kind = "") => {
          const statusEl = document.getElementById("ha-test-status");
          if (!statusEl) return;
          statusEl.textContent = message || "";
          statusEl.className = `ha-test-status${kind === "ok" ? " ok" : kind === "err" ? " err" : " muted"}`;
        };

        const syncHaDraftFromForm = () => {
          const form = document.getElementById("ha-config");
          if (!form) return;
          const fd = new FormData(form);
          haConfigDraft.baseUrl = String(fd.get("baseUrl") || "").trim().replace(/\/$/, "");
          const tok = String(fd.get("accessToken") || "");
          // Keep prior draft token when the field is left blank (keep-saved placeholder).
          if (tok.trim()) haConfigDraft.accessToken = tok.trim();
        };

        const refreshHaStatusLine = async () => {
          const line = document.getElementById("ha-status-line");
          if (!line) return;
          const [st, demo] = await Promise.all([
            rpc("home.getChannelStatus", { id: "homeassistant" }).catch(() => null),
            rpc("home.getDemoHaStatus").catch(() => null),
          ]);
          const r = st?.result || {};
          const bits = [
            r.ready ? t("channels.haStatusReady") : t("channels.haStatusNotReady"),
            r.enabled ? t("channels.haStatusEnabled") : t("channels.haStatusDisabled"),
            demo?.result?.running ? t("channels.haStatusDemoOn") : null,
          ].filter(Boolean);
          line.textContent = bits.join(" · ");
        };

        const persistHaConfig = async ({ quiet = false } = {}) => {
          syncHaDraftFromForm();
          const baseUrl = haConfigDraft.baseUrl;
          const token = haConfigDraft.accessToken;
          if (!baseUrl) {
            if (!quiet) setHaTestStatus(t("channels.haNeedUrl"), "err");
            return { ok: false, baseUrl: "" };
          }
          // Set demo on the fake-ha port; clear sticky demo when pointed at a real hub.
          const config = {
            baseUrl,
            demo: /(^|[/:])18123\/?$/.test(baseUrl) ? true : "",
          };
          const secrets = {};
          if (token) secrets.accessToken = token;
          const ans = await rpc("home.setChannelConfig", {
            id: "homeassistant",
            config,
            ...(Object.keys(secrets).length ? { secrets } : {}),
          });
          if (ans.error) {
            if (!quiet) setHaTestStatus(errMsg(ans) || t("channels.haDemoFailed"), "err");
            return { ok: false, baseUrl, token };
          }
          const en = await rpc("home.enableChannel", { id: "homeassistant" });
          if (en.error && !/already|enabled/i.test(errMsg(en) || "")) {
            if (!quiet) setHaTestStatus(errMsg(en) || t("channels.haDemoFailed"), "err");
            return { ok: false, baseUrl, token };
          }
          await refreshHaHomeChatReady();
          return { ok: true, baseUrl, token };
        };

        /** @returns {Promise<boolean|null>} true/false reachable; null if skipped */
        const probeHa = async (baseUrl, token) => {
          if (!baseUrl || !token) return null;
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 4000);
          try {
            const probe = await fetch(`${baseUrl}/api/`, {
              headers: { Authorization: `Bearer ${token}` },
              signal: ctrl.signal,
            });
            return probe.ok;
          } catch {
            return false;
          } finally {
            clearTimeout(timer);
          }
        };

        let haSaveTimer = 0;
        const scheduleHaAutoSave = () => {
          syncHaDraftFromForm();
          clearTimeout(haSaveTimer);
          haSaveTimer = setTimeout(async () => {
            if (!haConfigDraft.baseUrl) return;
            const saved = await persistHaConfig({ quiet: true });
            if (saved.ok) await refreshHaStatusLine();
          }, 600);
        };

        document.getElementById("ha-config")?.addEventListener("input", scheduleHaAutoSave);
        document.getElementById("ha-config")?.addEventListener("change", scheduleHaAutoSave);
        document.getElementById("ha-config")?.addEventListener("submit", (ev) => {
          ev.preventDefault();
        });

        document.getElementById("ha-test")?.addEventListener("click", async () => {
          const btn = document.getElementById("ha-test");
          const prevLabel = btn?.textContent || t("channels.haTest");
          if (btn) {
            btn.disabled = true;
            btn.textContent = t("channels.haTesting");
          }
          setHaTestStatus(t("channels.haTesting"));
          try {
            const saved = await persistHaConfig({ quiet: false });
            if (!saved.ok) return;
            let token = saved.token || haConfigDraft.accessToken;
            if (!token) {
              const demo = await rpc("home.getDemoHaStatus").catch(() => null);
              if (demo?.result?.running && demo.result?.token) token = demo.result.token;
            }
            if (!token) {
              setHaTestStatus(t("channels.haTestNeedToken"), "err");
              return;
            }
            const reachable = await probeHa(saved.baseUrl, token);
            if (reachable) setHaTestStatus(t("channels.haTestOk"), "ok");
            else setHaTestStatus(t("channels.haTestFail", { url: saved.baseUrl }), "err");
            await refreshHaStatusLine();
          } finally {
            if (btn) {
              btn.disabled = false;
              btn.textContent = prevLabel;
            }
          }
        });

        document.getElementById("ha-demo-open-panel")?.addEventListener("click", async () => {
          const st = await rpc("home.getDemoHaStatus").catch(() => null);
          const panelUrl = st?.result?.panelUrl;
          if (!panelUrl) {
            showToast(t("channels.haDemoNotRunning"), "err");
            return;
          }
          const opened = await openExternalUrl(panelUrl);
          if (opened === false) {
            showToast(t("channels.haDemoPanelOpenFailed", { url: panelUrl }), "err");
          }
        });

        document.getElementById("ha-demo-toggle")?.addEventListener("click", async () => {
          if (demoRunning) {
            const ans = await rpc("home.stopDemoHa", {});
            if (ans.error) {
              showToast(errMsg(ans) || t("channels.haDemoFailed"), "err");
              return;
            }
            showToast(t("channels.haDemoStopped"), "ok");
            await refreshHaHomeChatReady();
            await showView("homeassistant");
            return;
          }
          const aid = accountId();
          if (!aid) {
            showToast(t("profile.pick"), "err");
            return;
          }
          const ans = await rpc("home.startDemoHa", { accountId: aid }, { timeoutMs: 15_000 });
          if (ans.error) {
            const msg = errMsg(ans) || t("channels.haDemoFailed");
            const stale = /version_too_low/i.test(msg);
            showToast(stale ? t("channels.haDemoStaleDaemon") : msg, "err");
            return;
          }
          if (ans.result?.baseUrl) haConfigDraft.baseUrl = ans.result.baseUrl;
          if (ans.result?.token) haConfigDraft.accessToken = ans.result.token;
          const panelUrl = ans.result?.panelUrl;
          if (panelUrl) {
            const opened = await openExternalUrl(panelUrl);
            if (opened === false) {
              showToast(t("channels.haDemoPanelOpenFailed", { url: panelUrl }), "err");
            }
          }
          showToast(t("channels.haDemoStarted"), "ok");
          await refreshHaHomeChatReady();
          await showView("homeassistant");
        });
        return;
      }
    }

    if (id === "llm") {
      const tab = (tabId, labelKey) =>
        `<button type="button" role="tab" class="page-tab${llmTab === tabId ? " active" : ""}" data-llm-tab="${tabId}" aria-selected="${
          llmTab === tabId ? "true" : "false"
        }">${escapeHtml(t(labelKey))}</button>`;
      const tabsHtml = `<div class="page-tabs" role="tablist">
        ${tab("models", "nav.models")}
        ${tab("local", "nav.local")}
        ${tab("routing", "nav.routing")}
        ${tab("memory", "nav.memory")}
      </div>`;
      const shell = (panel) =>
        `<h2>${escapeHtml(t("nav.llm"))}</h2>${tabsHtml}<div class="page-tab-panel">${panel}</div>`;
      const wireTabs = () => {
        el.querySelectorAll("[data-llm-tab]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const next = btn.getAttribute("data-llm-tab");
            if (
              next !== "local" &&
              next !== "models" &&
              next !== "routing" &&
              next !== "memory"
            ) {
              return;
            }
            if (next === llmTab) return;
            llmTab = next;
            await showView("llm");
          });
        });
      };

      if (llmTab === "local") {
        let localStatus = {};
        let localErr = null;
        try {
          const st = await rpc("home.getLocalEngineStatus", {});
          if (st.error) localErr = errMsg(st);
          else localStatus = st.result || {};
        } catch (e) {
          localErr = e instanceof Error ? e.message : String(e);
        }

        let placementFilter = "any";
        let ollamaModel = "";
        {
          const body = await listProvidersRpc(aid || "");
          if (!body.error) {
            placementFilter = body.result?.placementFilter || "any";
            const ollamaRec = (body.result?.providers || []).find((p) => p.id === "ollama");
            if (ollamaRec?.model) ollamaModel = String(ollamaRec.model);
          }
        }

        const localMode = localStatus.mode || "off";
        const healthy = localStatus.healthy === true;
        const ggufs = Array.isArray(localStatus.modelsOnDisk) ? localStatus.modelsOnDisk : [];
        const engineOn = localStatus.enabled === true && localMode !== "off";
        const spawnOn = engineOn && localMode === "spawn";
        const ollamaOn = engineOn && localMode === "ollama";
        const activeLocalId =
          localMode === "ollama" ? "ollama" : spawnOn ? "envoyhome-local" : "";
        const cloudBlocksDefault = placementFilter === "cloud" && engineOn;
        const activeModelFile =
          typeof localStatus.activeModelFile === "string" ? localStatus.activeModelFile : "";
        const ollamaModels = Array.isArray(localStatus.modelIds) ? localStatus.modelIds : [];
        // Default highlight: llama.cpp when off or spawn; Ollama card only when that mode is live.
        const spawnSectionActive = !ollamaOn;
        const ollamaSectionActive = ollamaOn;

        const formatApprox = (bytes) => {
          const n = Number(bytes);
          if (!Number.isFinite(n) || n <= 0) return "";
          const gb = n / (1024 * 1024 * 1024);
          if (gb >= 1) return `${Math.round(gb * 10) / 10} GB`;
          return `${Math.round(n / (1024 * 1024))} MB`;
        };
        const rec = localStatus.recommendation;
        const recPrimary = rec?.primary;
        const recAlso = Array.isArray(rec?.also) ? rec.also : [];
        const useOrActiveBtn = (fileName) => {
          if (!fileName) return "";
          if (activeModelFile && activeModelFile === fileName) {
            return `<span class="status-pill ok">${escapeHtml(t("models.activeModel"))}</span>`;
          }
          return `<button type="button" class="secondary" data-use-model="${escapeHtml(fileName)}">${escapeHtml(t("models.useModel"))}</button>`;
        };
        for (const job of Array.isArray(localStatus.downloads) ? localStatus.downloads : []) {
          rememberDownloadJob(job);
        }

        const renderRecRow = (m, primary) => {
          if (!m?.id) return "";
          const size = formatApprox(m.approxBytes);
          const installed = m.installed === true;
          const fileName = typeof m.fileName === "string" ? m.fileName : "";
          const job = downloadJobFor(fileName, m.id);
          const inFlight =
            job &&
            (job.status === "downloading" || job.status === "paused" || job.status === "failed");
          return `<div class="le-rec-row${primary ? " primary" : ""}" data-model-id="${escapeHtml(m.id)}">
            <div class="le-rec-info">
              <div class="le-rec-title">
                <strong>${escapeHtml(m.label || m.id)}</strong>
                ${primary ? ` <span class="status-pill ok">${escapeHtml(t("models.recommended"))}</span>` : ""}
              </div>
              <div class="le-rec-meta muted">
                ${installed ? `<span>${escapeHtml(t("models.installed"))}</span>` : ""}
                ${size ? `<span>${escapeHtml(size)}</span>` : ""}
              </div>
              ${m.description ? `<div class="muted le-rec-desc">${escapeHtml(m.description)}</div>` : ""}
              <a class="muted le-rec-open" href="${escapeHtml(m.url || "#")}" target="_blank" rel="noopener">${escapeHtml(t("models.openUrl"))}</a>
              ${inFlight ? downloadProgressHtml(job) : ""}
            </div>
            <div class="le-rec-actions">
              ${
                installed
                  ? useOrActiveBtn(fileName)
                  : inFlight
                    ? ""
                    : `<button type="button" data-dl="${escapeHtml(m.id)}">${escapeHtml(t("models.download"))}</button>`
              }
            </div>
          </div>`;
        };
        if (localModelSubTab !== "recommended" && localModelSubTab !== "huggingface") {
          localModelSubTab = "recommended";
        }
        const hwLine = [rec?.hardwareSummary || localStatus.hardwareSummary, rec?.reason]
          .filter(Boolean)
          .join(" — ");
        const catalogRows = [
          ...(recPrimary ? [renderRecRow(recPrimary, true)] : []),
          ...recAlso.map((m) => renderRecRow(m, false)),
        ].filter(Boolean);
        const recHtml = catalogRows.length
          ? `<div class="le-rec" id="le-rec">
              <h4>${escapeHtml(t("models.hardwareRec"))}</h4>
              ${hwLine ? `<p class="muted le-rec-hw">${escapeHtml(hwLine)}</p>` : ""}
              <div class="le-rec-list">${catalogRows.join("")}</div>
            </div>`
          : `<p class="muted">${escapeHtml(t("models.noRecommendation"))}</p>`;
        const installedHtml =
          ggufs.length > 0
            ? `<div class="le-installed" id="le-installed">
                <h4>${escapeHtml(t("models.installedModels"))}</h4>
                <p class="muted le-installed-hint">${escapeHtml(t("models.installedHint"))}</p>
                <ul class="le-gguf-list">${ggufs
                  .map((n) => {
                    const isActive = activeModelFile === n;
                    return `<li class="le-gguf-row${isActive ? " active" : ""}">
                      <code>${escapeHtml(n)}</code>
                      <div class="row">${useOrActiveBtn(n)}</div>
                    </li>`;
                  })
                  .join("")}</ul>
              </div>`
            : "";
        const formatHfCount = (n) => {
          const v = Number(n);
          if (!Number.isFinite(v) || v < 0) return "";
          if (v >= 1_000_000) return `${Math.round((v / 1_000_000) * 10) / 10}M`;
          if (v >= 1_000) return `${Math.round((v / 1_000) * 10) / 10}k`;
          return String(Math.round(v));
        };
        const hfBrowseHtml = `<div class="le-hf" id="le-hf">
              <p class="muted le-hf-hint">${escapeHtml(t("models.hfBrowseHint"))}</p>
              <div id="le-hf-active-dls" class="le-hf-active-dls" hidden></div>
              <div class="row le-hf-search-row">
                <input type="search" id="le-hf-query" placeholder="${escapeHtml(t("models.hfSearchPlaceholder"))}" autocomplete="off" />
                <button type="button" id="le-hf-search">${escapeHtml(t("models.hfSearch"))}</button>
              </div>
              <div id="le-hf-results" class="le-hf-results"></div>
              <div class="le-hf-url-block">
                <label for="le-hf-url">${escapeHtml(t("models.hfPasteUrl"))}</label>
                <div class="row le-hf-url-row">
                  <input type="url" id="le-hf-url" placeholder="${escapeHtml(t("models.hfUrlPlaceholder"))}" autocomplete="off" />
                  <button type="button" id="le-hf-url-dl">${escapeHtml(t("models.download"))}</button>
                </div>
                <div id="le-hf-url-dl-progress" class="le-hf-url-dl-progress"></div>
              </div>
            </div>`;
        const spawnStatusLabel = spawnOn
          ? healthy
            ? t("models.statusSpawnOn")
            : t("models.statusSpawnUnhealthy")
          : t("models.statusOff");
        const ollamaStatusLabel = ollamaOn
          ? healthy
            ? t("models.statusOllamaOn")
            : t("models.statusOllamaUnhealthy")
          : t("models.statusOff");
        const activeLine =
          activeModelFile
            ? `<p class="muted le-active-line">${escapeHtml(
                t("models.usingModel", { file: activeModelFile }),
              )}${spawnOn && healthy ? "" : ` · ${escapeHtml(t("models.selectedNotRunning"))}`}</p>`
            : "";
        const ollamaModelOpts = ollamaModels
          .map(
            (m) =>
              `<option value="${escapeHtml(m)}" ${m === ollamaModel ? "selected" : ""}>${escapeHtml(m)}</option>`,
          )
          .join("");
        const leSub = (id, label) =>
          `<button type="button" role="tab" class="page-tab${localModelSubTab === id ? " active" : ""}" data-le-subtab="${id}" aria-selected="${
            localModelSubTab === id ? "true" : "false"
          }">${escapeHtml(label)}</button>`;
        const lePanel = (id, body) =>
          `<div class="le-subpanel" data-le-panel="${id}"${localModelSubTab === id ? "" : " hidden"}>${body}</div>`;

        el.innerHTML = shell(`
          <p class="muted le-lede">${escapeHtml(t("models.localHint"))}</p>
          ${
            cloudBlocksDefault
              ? `<p class="muted le-hint">${escapeHtml(t("models.poolCloudOnly"))}</p>`
              : ""
          }
          ${localErr ? `<p class="le-error">${escapeHtml(localErr)}</p>` : ""}

          <div class="card le-section${spawnSectionActive ? " le-section--active" : ""}" id="local-engine-card" data-le-engine="spawn">
            <div class="le-section-head">
              <div class="le-section-titles">
                <h3>${escapeHtml(t("models.engineSpawn"))}</h3>
                <p class="muted">${escapeHtml(t("models.engineSpawnDesc"))}</p>
              </div>
              ${
                spawnOn
                  ? `<span class="status-pill ok">${escapeHtml(t("models.engineInUse"))}</span>`
                  : ollamaOn
                    ? ""
                    : `<span class="status-pill ok">${escapeHtml(t("models.engineDefault"))}</span>`
              }
            </div>
            ${
              !spawnOn && !ollamaOn
                ? `<ol class="le-setup muted">
                    <li>${escapeHtml(t("models.spawnSetup1"))}</li>
                    <li>${escapeHtml(t("models.spawnSetup2"))}</li>
                    <li>${escapeHtml(t("models.spawnSetup3"))}</li>
                  </ol>`
                : ""
            }
            <div class="le-status">
              <div class="le-status-pills">
                <span class="status-pill ${spawnOn ? (healthy ? "ok" : "bad") : ""}">${escapeHtml(spawnStatusLabel)}</span>
              </div>
              <div class="le-status-actions">
                ${
                  spawnOn
                    ? `<button type="button" class="secondary" id="le-disable">${escapeHtml(t("models.disable"))}</button>`
                    : `<button type="button" id="le-enable">${escapeHtml(t("models.enableLocal"))}</button>`
                }
                <button type="button" id="le-test" ${spawnOn ? "" : "disabled"}>${escapeHtml(t("models.testLocal"))}</button>
              </div>
            </div>
            ${activeLine}
            <p class="muted le-hint">${escapeHtml(
              t("models.runtimeStatus", {
                runtime: localStatus.runtimeInstalled
                  ? t("models.installed")
                  : t("models.notInstalled"),
              }),
            )}</p>
            <p class="muted le-hint">${escapeHtml(t("models.spawnHint"))}</p>
            ${
              ollamaOn
                ? `<p class="muted le-hint">${escapeHtml(t("models.engineOtherActive", { other: t("models.engineOllama") }))}</p>`
                : !spawnOn && localStatus.hint
                  ? `<p class="muted le-hint">${escapeHtml(localStatus.hint)}</p>`
                  : ""
            }
            <div id="le-msg-spawn" class="le-section-msg"></div>
            <h4 class="le-models-heading">${escapeHtml(t("models.leModels"))}</h4>
            <div class="page-tabs le-subtabs" role="tablist" aria-label="${escapeHtml(t("models.leModels"))}">
              ${leSub("recommended", t("models.leTabRecommended"))}
              ${leSub("huggingface", t("models.leTabHf"))}
            </div>
            ${lePanel("recommended", `${recHtml}${installedHtml}`)}
            ${lePanel("huggingface", hfBrowseHtml)}
          </div>

          <details class="card le-section le-section--optional${ollamaSectionActive ? " le-section--active" : ""}" id="le-ollama-card" data-le-engine="ollama"${ollamaOn ? " open" : ""}>
            <summary class="le-section-head le-section-summary">
              <div class="le-section-titles">
                <h3>${escapeHtml(t("models.engineOllama"))} <span class="muted le-optional-tag">${escapeHtml(t("models.engineOptional"))}</span></h3>
                <p class="muted">${escapeHtml(t("models.engineOllamaDesc"))}</p>
              </div>
              ${
                ollamaOn
                  ? `<span class="status-pill ok">${escapeHtml(t("models.engineInUse"))}</span>`
                  : ""
              }
            </summary>
            <div class="le-ollama-body">
              <div class="le-status">
                <div class="le-status-pills">
                  <span class="status-pill ${ollamaOn ? (healthy ? "ok" : "bad") : ""}">${escapeHtml(ollamaStatusLabel)}</span>
                </div>
                <div class="le-status-actions">
                  ${
                    ollamaOn
                      ? `<button type="button" class="secondary" id="le-disable-ollama">${escapeHtml(t("models.disable"))}</button>`
                      : `<button type="button" id="le-ollama">${escapeHtml(t("models.connectOllama"))}</button>`
                  }
                  <button type="button" id="le-test-ollama" ${ollamaOn ? "" : "disabled"}>${escapeHtml(t("models.testLocal"))}</button>
                </div>
              </div>
              <p class="muted le-hint">${escapeHtml(t("models.ollamaHint"))}</p>
              ${
                spawnOn
                  ? `<p class="muted le-hint">${escapeHtml(t("models.engineOtherActive", { other: t("models.engineSpawn") }))}</p>`
                  : ""
              }
              ${
                ollamaOn && ollamaModel
                  ? `<p class="muted le-active-line">${escapeHtml(t("models.ollamaConnected", { model: ollamaModel }))}</p>`
                  : ""
              }
              ${
                ollamaOn && ollamaModels.length > 0
                  ? `<label class="le-ollama-model">${escapeHtml(t("models.ollamaPickModel"))}
                      <select id="le-ollama-model">${ollamaModelOpts}</select>
                    </label>`
                  : ollamaOn
                    ? `<p class="muted le-hint">${escapeHtml(t("models.ollamaNoModels"))}</p>`
                    : ""
              }
              <div id="le-msg-ollama" class="le-section-msg"></div>
            </div>
          </details>`);
        wireTabs();

        el.querySelectorAll("[data-le-subtab]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const next = btn.getAttribute("data-le-subtab");
            if (next !== "recommended" && next !== "huggingface") return;
            if (next === localModelSubTab) return;
            localModelSubTab = next;
            el.querySelectorAll("[data-le-subtab]").forEach((b) => {
              const on = b.getAttribute("data-le-subtab") === next;
              b.classList.toggle("active", on);
              b.setAttribute("aria-selected", on ? "true" : "false");
            });
            el.querySelectorAll("[data-le-panel]").forEach((panel) => {
              panel.hidden = panel.getAttribute("data-le-panel") !== next;
            });
          });
        });

        const leMsgSpawn = document.getElementById("le-msg-spawn");
        const leMsgOllama = document.getElementById("le-msg-ollama");
        const setLeBusy = (busy) => {
          el.querySelectorAll(".le-section button").forEach((b) => {
            if (b.hasAttribute("data-dl-stop") || b.hasAttribute("data-dl-resume")) return;
            if (busy) {
              b.classList.add("busy");
              b.disabled = true;
            } else {
              b.classList.remove("busy");
              if (b.id === "le-test") b.disabled = !spawnOn;
              else if (b.id === "le-test-ollama") b.disabled = !ollamaOn;
              else b.disabled = false;
            }
          });
        };
        const runLocalTest = async (providerId, box) => {
          if (!providerId) {
            if (box) {
              box.innerHTML = `<p class="le-error">${escapeHtml(t("models.testLocalOff"))}</p>`;
            }
            return;
          }
          setLeBusy(true);
          if (box) box.innerHTML = `<p class="muted">${escapeHtml(t("app.working"))}</p>`;
          try {
            const ans = await rpc("home.testProvider", { id: providerId }, { timeoutMs: 60_000 });
            if (ans.error) {
              if (box) {
                box.innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans) || "failed")}</p>`;
              }
              return;
            }
            const r = ans.result || {};
            if (!r.ok) {
              if (box) {
                box.innerHTML = `<p class="le-error">${escapeHtml(
                  r.error || t("models.testLocalFail"),
                )}</p>`;
              }
              return;
            }
            if (box) {
              const latency =
                typeof r.latencyMs === "number" ? ` · ${Math.round(r.latencyMs)} ms` : "";
              box.innerHTML = `<p class="muted">${escapeHtml(
                t("models.testOk", { model: r.model ? ` · ${r.model}` : "" }),
              )}${escapeHtml(latency)}</p>`;
            }
          } catch (e) {
            if (box) {
              box.innerHTML = `<p class="le-error">${escapeHtml(
                e instanceof Error ? e.message : String(e),
              )}</p>`;
            }
          } finally {
            setLeBusy(false);
          }
        };
        const showLeResult = (ans, box) => {
          if (!box) return;
          if (ans?.error) {
            box.innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans) || "failed")}</p>`;
          } else {
            const r = ans?.result || {};
            box.innerHTML = `<p class="muted">${escapeHtml(
              t("models.leOk", {
                mode: r.mode || "",
                health: r.healthy ? t("models.responding") : t("models.startingDown"),
              }),
            )} · <code>${escapeHtml(r.baseUrl || "")}</code></p>`;
          }
        };
        const runLocal = async (method, params, timeoutMs = 120_000, box = leMsgSpawn) => {
          setLeBusy(true);
          if (box) box.innerHTML = `<p class="muted">${escapeHtml(t("app.working"))}</p>`;
          try {
            const ans = await rpc(
              method,
              { ...(aid ? { accountId: aid } : {}), ...params },
              { timeoutMs },
            );
            showLeResult(ans, box);
            if (!ans.error) await showView("local");
          } catch (e) {
            if (box) {
              box.innerHTML = `<p class="le-error">${escapeHtml(
                e instanceof Error ? e.message : String(e),
              )}</p>`;
            }
          } finally {
            setLeBusy(false);
          }
        };
        el.querySelectorAll("[data-dl]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const modelId = btn.getAttribute("data-dl");
            if (!modelId) return;
            btn.disabled = true;
            try {
              const ans = await rpc("home.downloadLocalModel", { modelId }, { timeoutMs: 30_000 });
              if (ans.error) {
                showLeResult(ans, leMsgSpawn);
                btn.disabled = false;
                return;
              }
              const r = ans.result || {};
              rememberDownloadJob({ ...r, modelId, status: r.status || "downloading" });
              if (r.status === "completed") {
                if (leMsgSpawn) {
                  leMsgSpawn.innerHTML = `<p class="muted">${escapeHtml(
                    t("models.downloaded", { file: r.fileName || modelId }),
                  )}</p>`;
                }
                await showView("local");
                return;
              }
              const row = btn.closest(".le-rec-row");
              const info = row?.querySelector(".le-rec-info");
              const job = downloadJobFor(r.fileName, modelId);
              if (info && job) {
                const existing = info.querySelector(".le-dl");
                const html = downloadProgressHtml(job);
                if (existing) existing.outerHTML = html;
                else info.insertAdjacentHTML("beforeend", html);
                const actions = row?.querySelector(".le-rec-actions");
                if (actions) actions.innerHTML = "";
                wireDownloadControls(row || el);
              }
              if (leMsgSpawn) {
                leMsgSpawn.innerHTML = `<p class="muted">${escapeHtml(
                  t("models.downloading", { id: modelId }),
                )}</p>`;
              }
            } catch (e) {
              btn.disabled = false;
              if (leMsgSpawn) {
                leMsgSpawn.innerHTML = `<p class="le-error">${escapeHtml(
                  e instanceof Error ? e.message : String(e),
                )}</p>`;
              }
            }
          });
        });
        wireDownloadControls(el);
        el.querySelectorAll("[data-use-model]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const fileName = btn.getAttribute("data-use-model");
            if (!fileName) return;
            if (engineOn && healthy && activeModelFile === fileName) {
              if (leMsgSpawn) {
                leMsgSpawn.innerHTML = `<p class="muted">${escapeHtml(
                  t("models.usingModel", { file: fileName }),
                )}</p>`;
              }
              return;
            }
            runLocal("home.enableLocalEngine", { prefer: "spawn", modelPath: fileName });
          });
        });
        const hfResults = document.getElementById("le-hf-results");
        const ggufFileNameFrom = (pathOrUrl) => {
          try {
            const raw = String(pathOrUrl || "");
            const path = raw.includes("://") ? new URL(raw).pathname : raw;
            const base = path.split("/").filter(Boolean).pop() || "";
            return decodeURIComponent(base);
          } catch {
            const parts = String(pathOrUrl || "").split("/");
            return parts[parts.length - 1] || "";
          }
        };
        const downloadHfUrl = async (url, anchorEl) => {
          const trimmed = (url || "").trim();
          if (!trimmed) {
            if (leMsgSpawn) {
              leMsgSpawn.innerHTML = `<p class="le-error">${escapeHtml(t("models.hfUrlRequired"))}</p>`;
            }
            return;
          }
          localModelSubTab = "huggingface";
          const btn = anchorEl?.matches?.("button")
            ? anchorEl
            : anchorEl?.querySelector?.("[data-hf-url]");
          if (btn) btn.disabled = true;
          try {
            const ans = await rpc(
              "home.downloadLocalModelUrl",
              { url: trimmed },
              { timeoutMs: 30_000 },
            );
            if (ans.error) {
              showLeResult(ans, leMsgSpawn);
              if (btn) btn.disabled = false;
              return;
            }
            const r = ans.result || {};
            rememberDownloadJob({ ...r, status: r.status || "downloading" });
            if (r.status === "completed") {
              if (leMsgSpawn) {
                leMsgSpawn.innerHTML = `<p class="muted">${escapeHtml(
                  t("models.downloaded", { file: r.fileName || trimmed }),
                )}</p>`;
              }
              syncHfActiveDownloads();
              return;
            }
            const job = downloadJobFor(r.fileName, undefined);
            const row = anchorEl?.closest?.(".le-hf-file-row");
            if (row && job) {
              const existing = row.querySelector(".le-dl");
              const html = downloadProgressHtml(job);
              if (existing) existing.outerHTML = html;
              else row.insertAdjacentHTML("beforeend", html);
              const actions = row.querySelector(".le-hf-file-head") || row.querySelector(".row");
              if (actions) {
                actions.querySelectorAll("[data-hf-url]").forEach((b) => b.remove());
              }
              wireDownloadControls(row);
            } else if (job) {
              const slot = document.getElementById("le-hf-url-dl-progress");
              if (slot) {
                slot.innerHTML = downloadProgressHtml(job);
                wireDownloadControls(slot);
              }
            }
            syncHfActiveDownloads();
            if (leMsgSpawn) {
              leMsgSpawn.innerHTML = `<p class="muted">${escapeHtml(t("models.hfDownloading"))}</p>`;
            }
          } catch (e) {
            if (btn) btn.disabled = false;
            if (leMsgSpawn) {
              leMsgSpawn.innerHTML = `<p class="le-error">${escapeHtml(
                e instanceof Error ? e.message : String(e),
              )}</p>`;
            }
          }
        };
        const wireHfFileDownloads = (root) => {
          root?.querySelectorAll("[data-hf-url]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const url = btn.getAttribute("data-hf-url");
              if (url) void downloadHfUrl(url, btn);
            });
          });
          wireDownloadControls(root);
        };
        const renderHfFiles = (repoId, files) => {
          if (!files.length) {
            return `<p class="muted">${escapeHtml(t("models.hfNoGguf"))}</p>`;
          }
          return `<ul class="le-hf-files">${files
            .map((f) => {
              const size = formatApprox(f.size);
              const fileName = ggufFileNameFrom(f.path || f.url);
              const job = downloadJobFor(fileName, undefined);
              const inFlight =
                job &&
                (job.status === "downloading" ||
                  job.status === "paused" ||
                  job.status === "failed");
              return `<li class="le-hf-file-row" data-hf-file="${escapeHtml(fileName)}">
                <div class="le-hf-file-head">
                  <code title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</code>
                  <div class="row">
                    ${size ? `<span class="muted">${escapeHtml(size)}</span>` : ""}
                    ${
                      inFlight
                        ? ""
                        : `<button type="button" data-hf-url="${escapeHtml(f.url)}">${escapeHtml(t("models.download"))}</button>`
                    }
                  </div>
                </div>
                ${inFlight ? downloadProgressHtml(job) : ""}
              </li>`;
            })
            .join("")}</ul>`;
        };
        document.getElementById("le-hf-search")?.addEventListener("click", async () => {
          const q = /** @type {HTMLInputElement|null} */ (document.getElementById("le-hf-query"))
            ?.value?.trim();
          if (!hfResults) return;
          if (!q) {
            hfResults.innerHTML = `<p class="muted">${escapeHtml(t("models.hfQueryRequired"))}</p>`;
            return;
          }
          setLeBusy(true);
          hfResults.innerHTML = `<p class="muted">${escapeHtml(t("app.working"))}</p>`;
          try {
            const ans = await rpc("home.searchHuggingFaceModels", { query: q, limit: 20 }, {
              timeoutMs: 30_000,
            });
            if (ans.error) {
              hfResults.innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans) || "failed")}</p>`;
              return;
            }
            const models = Array.isArray(ans.result?.models) ? ans.result.models : [];
            if (!models.length) {
              hfResults.innerHTML = `<p class="muted">${escapeHtml(t("models.hfNoResults"))}</p>`;
              return;
            }
            hfResults.innerHTML = `<ul class="le-hf-repos">${models
              .map((m) => {
                const dl = formatHfCount(m.downloads);
                const meta = [
                  m.gated ? t("models.hfGated") : "",
                  dl ? t("models.hfDownloads", { count: dl }) : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                const hubUrl = `https://huggingface.co/${m.id}`;
                return `<li class="le-hf-repo" data-hf-repo="${escapeHtml(m.id)}">
                  <div class="le-hf-repo-head">
                    <button type="button" class="le-hf-repo-btn" data-hf-expand="${escapeHtml(m.id)}">
                      <strong>${escapeHtml(m.id)}</strong>
                      ${meta ? `<span class="muted">${escapeHtml(meta)}</span>` : ""}
                      <span class="muted le-hf-expand-hint">${escapeHtml(t("models.hfShowFiles"))}</span>
                    </button>
                    <a class="muted" href="${escapeHtml(hubUrl)}" target="_blank" rel="noopener">${escapeHtml(t("models.hfOpenRepo"))}</a>
                  </div>
                  <div class="le-hf-repo-files" hidden></div>
                </li>`;
              })
              .join("")}</ul>`;
            hfResults.querySelectorAll("[data-hf-expand]").forEach((btn) => {
              btn.addEventListener("click", async () => {
                const repoId = btn.getAttribute("data-hf-expand");
                if (!repoId) return;
                const li = btn.closest(".le-hf-repo");
                const filesEl = li?.querySelector(".le-hf-repo-files");
                if (!filesEl) return;
                if (!filesEl.hidden && filesEl.dataset.loaded === "1") {
                  filesEl.hidden = true;
                  syncHfActiveDownloads();
                  return;
                }
                filesEl.hidden = false;
                if (filesEl.dataset.loaded === "1") {
                  // Re-paint so Stop/Continue progress returns onto each file row.
                  try {
                    const files = JSON.parse(filesEl.dataset.filesJson || "[]");
                    filesEl.innerHTML = renderHfFiles(repoId, files);
                    wireHfFileDownloads(filesEl);
                  } catch {
                    // keep prior DOM
                  }
                  syncHfActiveDownloads();
                  return;
                }
                filesEl.innerHTML = `<p class="muted">${escapeHtml(t("app.working"))}</p>`;
                try {
                  const filesAns = await rpc(
                    "home.listHuggingFaceGgufFiles",
                    { repoId },
                    { timeoutMs: 45_000 },
                  );
                  if (filesAns.error) {
                    filesEl.innerHTML = `<p class="le-error">${escapeHtml(errMsg(filesAns) || "failed")}</p>`;
                    return;
                  }
                  const files = Array.isArray(filesAns.result?.files) ? filesAns.result.files : [];
                  filesEl.dataset.filesJson = JSON.stringify(files);
                  filesEl.innerHTML = renderHfFiles(repoId, files);
                  filesEl.dataset.loaded = "1";
                  wireHfFileDownloads(filesEl);
                  syncHfActiveDownloads();
                } catch (e) {
                  filesEl.innerHTML = `<p class="le-error">${escapeHtml(
                    e instanceof Error ? e.message : String(e),
                  )}</p>`;
                }
              });
            });
          } catch (e) {
            hfResults.innerHTML = `<p class="le-error">${escapeHtml(
              e instanceof Error ? e.message : String(e),
            )}</p>`;
          } finally {
            setLeBusy(false);
          }
        });
        document.getElementById("le-hf-query")?.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            document.getElementById("le-hf-search")?.click();
          }
        });
        document.getElementById("le-hf-url-dl")?.addEventListener("click", (ev) => {
          const url = /** @type {HTMLInputElement|null} */ (document.getElementById("le-hf-url"))
            ?.value?.trim();
          void downloadHfUrl(url || "", /** @type {HTMLElement} */ (ev.currentTarget));
        });
        document.getElementById("le-hf-url")?.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            document.getElementById("le-hf-url-dl")?.click();
          }
        });
        // Seed HuggingFace progress (URL paste + orphans from paused/partial jobs).
        {
          const urlSlot = document.getElementById("le-hf-url-dl-progress");
          const urlInput = /** @type {HTMLInputElement|null} */ (document.getElementById("le-hf-url"));
          const pastedName = urlInput?.value ? ggufFileNameFrom(urlInput.value) : "";
          if (urlSlot && pastedName) {
            const job = downloadJobFor(pastedName, undefined);
            if (job) {
              urlSlot.innerHTML = downloadProgressHtml(job);
              wireDownloadControls(urlSlot);
            }
          }
          syncHfActiveDownloads();
        }
        const warnNoGgufThen = async (prefer) => {
          if (ggufs.length > 0) {
            runLocal("home.enableLocalEngine", { prefer });
            return;
          }
          const modelLabel = recPrimary?.label || recPrimary?.id || "";
          const proceed = recPrimary?.id
            ? confirm(t("models.noGgufWarnDownload", { model: modelLabel }))
            : (alert(t("models.noGgufWarn")), false);
          if (!proceed) return;
          const modelId = recPrimary.id;
          try {
            const dl = await rpc("home.downloadLocalModel", { modelId }, { timeoutMs: 30_000 });
            if (dl.error) {
              showLeResult(dl, leMsgSpawn);
              return;
            }
            const r = dl.result || {};
            rememberDownloadJob({ ...r, modelId, status: r.status || "downloading" });
            localModelSubTab = "recommended";
            if (leMsgSpawn) {
              leMsgSpawn.innerHTML = `<p class="muted">${escapeHtml(
                t("models.downloading", { id: modelLabel || modelId }),
              )}</p>`;
            }
            await showView("local");
          } catch (e) {
            if (leMsgSpawn) {
              leMsgSpawn.innerHTML = `<p class="le-error">${escapeHtml(
                e instanceof Error ? e.message : String(e),
              )}</p>`;
            }
          }
        };
        document.getElementById("le-enable")?.addEventListener("click", () =>
          warnNoGgufThen("auto"),
        );
        document.getElementById("le-test")?.addEventListener("click", () =>
          runLocalTest(spawnOn ? "envoyhome-local" : "", leMsgSpawn),
        );
        document.getElementById("le-disable")?.addEventListener("click", () =>
          runLocal("home.disableLocalEngine", {}, 30_000, leMsgSpawn),
        );
        document.getElementById("le-ollama")?.addEventListener("click", () =>
          runLocal("home.enableOllama", {}, 30_000, leMsgOllama),
        );
        document.getElementById("le-disable-ollama")?.addEventListener("click", () =>
          runLocal("home.disableLocalEngine", {}, 30_000, leMsgOllama),
        );
        document.getElementById("le-test-ollama")?.addEventListener("click", () =>
          runLocalTest(ollamaOn ? "ollama" : "", leMsgOllama),
        );
        document.getElementById("le-ollama-model")?.addEventListener("change", (ev) => {
          const sel = /** @type {HTMLSelectElement} */ (ev.target);
          const model = String(sel.value || "").trim();
          if (!model) return;
          void runLocal("home.enableOllama", { model }, 30_000, leMsgOllama);
        });
        return;
      }

      if (llmTab === "models") {
        let providers = [];
        let defaultId = "";
        let listErr = null;
        if (aid) {
          const body = await listProvidersRpc(aid);
          if (body.error) listErr = errMsg(body);
          else {
            providers = body.result?.providers || [];
            defaultId = body.result?.defaultProviderId || "";
          }
        }

        const hasProviders = providers.length > 0;

        const pickerPresets = listProviderPresets({ includeLocal: false });
        const presetOpts = pickerPresets
          .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`)
          .join("");

        // Mesh-style: preset owns id/kind/label; user only edits key, model, endpoint.
        // Custom OpenAI / Anthropic compat are presets — no wire-kind picker.
        const addProviderFormHtml = `
          <p class="muted">${escapeHtml(t("models.presetHint"))}</p>
          <label>${escapeHtml(t("models.preset"))}
            <select name="preset" id="prov-preset">${presetOpts}</select>
          </label>
          <label>${escapeHtml(t("models.apiKey"))} <input name="apiKey" id="prov-apikey" type="password" autocomplete="off" placeholder="${escapeHtml(t("app.optional"))}" /></label>
          <p class="muted" id="prov-apikey-hint" hidden>${escapeHtml(t("models.needsApiKey"))}</p>
          <label id="prov-model-pick-wrap">${escapeHtml(t("models.model"))}
            <select id="prov-model-pick"></select>
          </label>
          <label id="prov-model-custom-wrap">${escapeHtml(t("models.modelCustom"))}
            <input name="model" id="prov-model" autocomplete="off" />
          </label>
          <p class="muted">${escapeHtml(t("models.modelHint"))}</p>
          <p class="muted" id="prov-preset-hint" hidden></p>
          <label id="prov-endpoint-wrap">${escapeHtml(t("models.endpoint"))}
            <input name="baseUrl" id="prov-base" autocomplete="off" />
          </label>
          <input type="hidden" name="id" id="prov-id" />
          <input type="hidden" name="kind" id="prov-kind" />
          <input type="hidden" name="label" id="prov-label" />
          ${providerRoutingFieldsHtml()}`;

        const cards = providers
          .map((p) => {
            const isCloud = String(p.kind || "").startsWith("cloud_");
            const place = p.placement || (isCloud ? "cloud" : "local");
            const props = providerRoutingSummaryText(p);
            const isDefault = isCloud && p.id === defaultId;
            return `<div class="card${isDefault ? " prov-card--default" : ""}" data-pid="${escapeHtml(p.id)}">
              <div class="prov-card-head">
                <strong>${escapeHtml(p.label || p.id)}</strong>
                ${isDefault ? `<span class="status-pill ok">${escapeHtml(t("channels.default"))}</span>` : ""}
                ${!isCloud && p.enabled ? `<span class="muted">· ${escapeHtml(t("models.localSingleton"))}</span>` : ""}
                ${p.enabled ? "" : `<span class="muted">· ${escapeHtml(t("channels.disabled"))}</span>`}
              </div>
              <div class="muted">${escapeHtml(p.kind)} · ${escapeHtml(place)} · secret=${p.hasSecret ? "yes" : "no"}</div>
              <div class="muted"><code>${escapeHtml(p.baseUrl || "")}</code> · ${escapeHtml(t("channels.model"))} <code>${escapeHtml(p.model || "")}</code></div>
              <div class="muted prov-card-routing-summary"${props ? "" : " hidden"}>${escapeHtml(props)}</div>
              <div class="row">
                ${
                  isCloud && !isDefault && p.enabled
                    ? `<button type="button" class="secondary" data-default="${escapeHtml(p.id)}">${escapeHtml(t("models.setDefault"))}</button>`
                    : ""
                }
                <button type="button" data-test="${escapeHtml(p.id)}">${escapeHtml(t("app.test"))}</button>
                <button type="button" class="secondary" data-toggle="${escapeHtml(p.id)}" data-en="${p.enabled ? "0" : "1"}">${
                  escapeHtml(p.enabled ? t("app.disable") : t("app.enable"))
                }</button>
                <button type="button" class="secondary" data-remove="${escapeHtml(p.id)}">${escapeHtml(t("app.remove"))}</button>
              </div>
              <form class="prov-props-form" data-props-id="${escapeHtml(p.id)}">
                ${providerRoutingFieldsHtml({
                  paramCountB: p.paramCountB,
                  costRank: p.costRank,
                  contextTokens: p.contextTokens,
                  latencyClass: p.latencyClass,
                  supportsVision: p.supportsVision,
                })}
              </form>
            </div>`;
          })
          .join("");

        const emptyHtml = `
          <p class="muted">${escapeHtml(t("models.emptyLead"))}</p>
          <form id="prov-save" class="card">
            <h3>${escapeHtml(t("models.addProvider"))}</h3>
            ${addProviderFormHtml}
            <button type="submit">${escapeHtml(t("models.saveProvider"))}</button>
          </form>
          <div id="prov-msg"></div>`;

        const listHtml = `
          <div class="prov-toolbar">
            <h3>${escapeHtml(t("models.configured"))}</h3>
            <button type="button" id="prov-add-open">${escapeHtml(t("models.addProvider"))}</button>
          </div>
          <div id="prov-msg"></div>
          ${cards}
          <div id="prov-add-modal" class="modal-backdrop" hidden>
            <div class="modal-card modal-card--wide" role="dialog" aria-modal="true" aria-labelledby="prov-add-title">
              <form id="prov-save" class="profile-gate-form">
                <h2 id="prov-add-title">${escapeHtml(t("models.addProvider"))}</h2>
                ${addProviderFormHtml}
                <div class="profile-gate-actions">
                  <button type="button" class="secondary" id="prov-add-cancel">${escapeHtml(t("models.cancel"))}</button>
                  <button type="submit">${escapeHtml(t("models.saveProvider"))}</button>
                </div>
              </form>
            </div>
          </div>`;

        el.innerHTML = shell(`
          ${!aid ? `<p class="muted">${escapeHtml(t("models.pickProfile"))}</p>` : ""}
          ${listErr ? `<p class="le-error">${escapeHtml(listErr)}</p>` : ""}
          ${aid ? (hasProviders ? listHtml : emptyHtml) : ""}`);
        wireTabs();

        if (aid) {
          const applyPreset = () => {
            const form = document.getElementById("prov-save");
            const preset = presetById(document.getElementById("prov-preset")?.value);
            if (!preset) return;
            const idEl = document.getElementById("prov-id");
            const kindEl = document.getElementById("prov-kind");
            const baseEl = document.getElementById("prov-base");
            const modelEl = document.getElementById("prov-model");
            const labelEl = document.getElementById("prov-label");
            const pickEl = document.getElementById("prov-model-pick");
            const pickWrap = document.getElementById("prov-model-pick-wrap");
            const customWrap = document.getElementById("prov-model-custom-wrap");
            const keyHint = document.getElementById("prov-apikey-hint");
            const keyEl = document.getElementById("prov-apikey");
            const presetHint = document.getElementById("prov-preset-hint");
            const models = listPresetModels(preset);
            if (idEl) idEl.value = preset.defaultProviderId;
            if (kindEl) kindEl.value = preset.kind;
            if (labelEl) labelEl.value = preset.label;
            if (baseEl) {
              baseEl.value = preset.baseUrl || "";
              baseEl.placeholder = preset.endpointPlaceholder || "";
              baseEl.readOnly = preset.endpointEditable === false;
            }
            // Visible <select> so every curated id is browsable (datalist hid most).
            if (pickEl && pickWrap && customWrap && modelEl) {
              if (models.length) {
                pickWrap.hidden = false;
                pickEl.innerHTML =
                  models
                    .map((m) => {
                      const shown = m.label || m.id;
                      return `<option value="${escapeHtml(m.id)}">${escapeHtml(shown)}</option>`;
                    })
                    .join("") +
                  `<option value="__custom__">${escapeHtml(t("models.modelOther"))}</option>`;
                pickEl.value = models[0].id;
                modelEl.value = models[0].id;
                customWrap.hidden = true;
                fillRoutingFieldsFromProfile(form, models[0]);
              } else {
                pickWrap.hidden = true;
                pickEl.innerHTML = "";
                customWrap.hidden = false;
                modelEl.value = "";
                modelEl.placeholder = t("models.modelHint");
                fillRoutingFieldsFromProfile(form, {});
              }
            }
            if (presetHint) {
              if (preset.hint) {
                presetHint.hidden = false;
                presetHint.textContent = preset.hint;
              } else {
                presetHint.hidden = true;
                presetHint.textContent = "";
              }
            }
            if (keyHint) keyHint.hidden = !preset.needsSecret;
            if (keyEl) {
              keyEl.placeholder = preset.needsSecret ? "" : t("app.optional");
              keyEl.required = !!preset.needsSecret;
            }
          };
          const syncModelPick = () => {
            const form = document.getElementById("prov-save");
            const preset = presetById(document.getElementById("prov-preset")?.value);
            const pickEl = document.getElementById("prov-model-pick");
            const modelEl = document.getElementById("prov-model");
            const customWrap = document.getElementById("prov-model-custom-wrap");
            if (!pickEl || !modelEl || !customWrap) return;
            if (pickEl.value === "__custom__") {
              customWrap.hidden = false;
              modelEl.value = "";
              modelEl.focus();
              fillRoutingFieldsFromProfile(form, {});
            } else {
              customWrap.hidden = true;
              modelEl.value = pickEl.value;
              fillRoutingFieldsFromProfile(form, resolveModelProfile(preset, pickEl.value));
            }
          };
          document.getElementById("prov-preset")?.addEventListener("change", applyPreset);
          document.getElementById("prov-model-pick")?.addEventListener("change", syncModelPick);
          applyPreset();

          const modal = document.getElementById("prov-add-modal");
          const openModal = () => {
            if (!modal) return;
            modal.hidden = false;
            document.body.classList.add("modal-open");
            document.getElementById("prov-preset")?.focus();
          };
          const closeModal = () => {
            if (!modal) return;
            modal.hidden = true;
            document.body.classList.remove("modal-open");
          };
          document.getElementById("prov-add-open")?.addEventListener("click", openModal);
          document.getElementById("prov-add-cancel")?.addEventListener("click", closeModal);
          modal?.addEventListener("click", (ev) => {
            if (ev.target === modal) closeModal();
          });

          document.getElementById("prov-save")?.addEventListener("submit", async (ev) => {
            ev.preventDefault();
            const fd = new FormData(ev.target);
            const preset = presetById(String(fd.get("preset") || ""));
            const pid = String(fd.get("id") || "").trim();
            const kind = String(fd.get("kind") || preset?.kind || "");
            const baseUrl =
              String(fd.get("baseUrl") || "").trim() || String(preset?.baseUrl || "").trim();
            const pickVal = String(
              document.getElementById("prov-model-pick")?.value || "",
            ).trim();
            const model =
              String(fd.get("model") || "").trim() ||
              (pickVal && pickVal !== "__custom__" ? pickVal : "") ||
              (Array.isArray(preset?.models) && preset.models[0] ? String(preset.models[0]) : "");
            const label = String(fd.get("label") || preset?.label || pid).trim();
            const apiKey = String(fd.get("apiKey") || "").trim();
            const box = document.getElementById("prov-msg");
            if (!pid || !kind) {
              if (box) box.innerHTML = `<p class="le-error">${escapeHtml(t("models.needIdKind"))}</p>`;
              return;
            }
            if (!baseUrl && (kind.startsWith("cloud_") || kind === "local_openai_compat")) {
              if (box) {
                box.innerHTML = `<p class="le-error">${escapeHtml(t("models.needEndpoint"))}</p>`;
              }
              return;
            }
            if (preset?.needsSecret && !apiKey) {
              if (box) {
                box.innerHTML = `<p class="le-error">${escapeHtml(t("models.needsApiKey"))}</p>`;
              }
              return;
            }
            const routingProps = routingPropsFromFormData(fd);
            const setAns = await rpc("home.setProvider", {
              id: pid,
              kind,
              ...(baseUrl ? { baseUrl } : {}),
              ...(model ? { model } : {}),
              label,
              enabled: true,
              ...routingProps,
            });
            if (setAns.error) {
              if (box) box.innerHTML = `<p class="le-error">${escapeHtml(errMsg(setAns))}</p>`;
              return;
            }
            if (apiKey) {
              const secAns = await rpc("home.setProviderSecret", {
                id: pid,
                field: "apiKey",
                value: apiKey,
              });
              if (secAns.error) {
                if (box) box.innerHTML = `<p class="le-error">${escapeHtml(errMsg(secAns))}</p>`;
                return;
              }
            }
            closeModal();
            if (box) {
              box.innerHTML = `<p class="muted">${escapeHtml(
                t(apiKey ? "models.savedWithKey" : "models.savedProvider", { id: pid }),
              )}</p>`;
            }
            // Daemon sets newest added cloud as defaultProviderId; local is singular / not a default pick.
            await showView("models");
          });

          el.querySelectorAll("form.prov-props-form").forEach((form) => {
            let saveInFlight = false;
            let saveQueued = false;
            let inputDebounce = 0;
            const ADV_PROP_NAMES = new Set([
              "paramCountB",
              "costRank",
              "contextTokens",
              "latencyClass",
              "supportsVision",
            ]);
            const persistProps = async () => {
              const pid = form.getAttribute("data-props-id");
              const rec = providers.find((x) => x.id === pid);
              const box = document.getElementById("prov-msg");
              if (!rec || !pid) return;
              if (saveInFlight) {
                saveQueued = true;
                return;
              }
              saveInFlight = true;
              saveQueued = false;
              try {
                const fd = new FormData(form);
                const routingProps = routingPropsFromFormData(fd);
                const ans = await rpc("home.setProvider", {
                  id: pid,
                  kind: rec.kind,
                  ...(rec.baseUrl ? { baseUrl: rec.baseUrl } : {}),
                  ...(rec.model ? { model: rec.model } : {}),
                  ...(rec.label ? { label: rec.label } : {}),
                  enabled: rec.enabled !== false,
                  ...routingProps,
                });
                if (ans.error) {
                  if (box) {
                    box.innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`;
                  }
                  return;
                }
                for (const key of ADV_PROP_NAMES) {
                  if (!(key in routingProps)) continue;
                  const val = routingProps[key];
                  if (val == null) delete rec[key];
                  else rec[key] = val;
                }
                rec.supportsTools = true;
                const card = form.closest("[data-pid]");
                const summary = card?.querySelector(".prov-card-routing-summary");
                if (summary) {
                  const text = providerRoutingSummaryText(rec);
                  summary.textContent = text;
                  summary.hidden = !text;
                }
                if (box) box.innerHTML = "";
              } finally {
                saveInFlight = false;
                if (saveQueued) void persistProps();
              }
            };
            form.addEventListener("submit", (ev) => ev.preventDefault());
            form.addEventListener("change", (ev) => {
              const target = ev.target;
              if (!(target instanceof HTMLElement)) return;
              const name = target.getAttribute("name");
              if (!name || !ADV_PROP_NAMES.has(name)) return;
              window.clearTimeout(inputDebounce);
              void persistProps();
            });
            // Debounced autosave while typing param count (change alone waits for blur).
            form.addEventListener("input", (ev) => {
              const target = ev.target;
              if (!(target instanceof HTMLInputElement)) return;
              if (target.getAttribute("name") !== "paramCountB") return;
              window.clearTimeout(inputDebounce);
              inputDebounce = window.setTimeout(() => void persistProps(), 400);
            });
          });

          el.querySelectorAll("[data-default]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const pid = btn.getAttribute("data-default");
              const box = document.getElementById("prov-msg");
              const ans = await rpc("home.setDefaultProvider", {
                accountId: aid,
                providerId: pid,
              });
              if (box) {
                box.innerHTML = ans.error
                  ? `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`
                  : `<p class="muted">${escapeHtml(t("models.defaultSet", { id: pid }))}</p>`;
              }
              if (!ans.error) await showView("models");
            });
          });

          el.querySelectorAll("[data-test]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const ans = await rpc("home.testProvider", { id: btn.getAttribute("data-test") });
              const box = document.getElementById("prov-msg");
              if (box) {
                box.innerHTML = ans.error
                  ? `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`
                  : `<p class="muted">${escapeHtml(
                      t("models.testOk", {
                        model: ans.result?.model ? ` · ${ans.result.model}` : "",
                      }),
                    )}</p>`;
              }
            });
          });
          el.querySelectorAll("[data-toggle]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const pid = btn.getAttribute("data-toggle");
              const row = providers.find((p) => p.id === pid);
              if (!row) return;
              const ans = await rpc("home.setProvider", {
                id: pid,
                kind: row.kind,
                enabled: btn.getAttribute("data-en") === "1",
                ...(row.baseUrl ? { baseUrl: row.baseUrl } : {}),
                ...(row.model ? { model: row.model } : {}),
                ...(row.label ? { label: row.label } : {}),
              });
              const box = document.getElementById("prov-msg");
              if (box) {
                box.innerHTML = ans.error
                  ? `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`
                  : `<p class="muted">${escapeHtml(t("app.updated"))}</p>`;
              }
              if (!ans.error) await showView("models");
            });
          });
          el.querySelectorAll("[data-remove]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const ans = await rpc("home.removeProvider", { id: btn.getAttribute("data-remove") });
              const box = document.getElementById("prov-msg");
              if (box) {
                box.innerHTML = ans.error
                  ? `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`
                  : `<p class="muted">${escapeHtml(t("app.removed"))}</p>`;
              }
              if (!ans.error) await showView("models");
            });
          });
        }
        return;
      }

      if (llmTab === "routing") {
        let placementFilter = "any";
        let autoSwitch = false;
        let enabledCount = 0;
        let daemonLocalOnly = false;
        let localEngineOn = false;
        let listErr = null;
        if (aid) {
          const body = await listProvidersRpc(aid);
          if (body.error) listErr = errMsg(body);
          else {
            const providers = body.result?.providers || [];
            enabledCount = providers.filter((p) => p.enabled).length;
            placementFilter = body.result?.placementFilter || "any";
            autoSwitch = body.result?.autoModelSwitch?.enabled === true;
            daemonLocalOnly = body.result?.localOnly === true;
          }
        }
        try {
          const st = await rpc("home.getLocalEngineStatus", {});
          if (!st.error) {
            const mode = st.result?.mode || "off";
            localEngineOn = st.result?.enabled === true && mode !== "off";
          }
        } catch {
          /* status optional for Routing hints */
        }
        const canAutoSwitch = enabledCount >= 2;

        el.innerHTML = shell(`
          ${!aid ? `<p class="muted">${escapeHtml(t("models.pickProfile"))}</p>` : ""}
          ${listErr ? `<p class="le-error">${escapeHtml(listErr)}</p>` : ""}
          ${
            aid
              ? `<form id="routing-form" class="card routing-card" data-local-only="${daemonLocalOnly ? "1" : "0"}">
            <h3>${escapeHtml(t("models.routing"))}</h3>
            <p class="muted routing-hint">${escapeHtml(t("models.routingHint"))}</p>
            <fieldset class="pool-fieldset">
              <legend>${escapeHtml(t("models.pool"))}</legend>
              <label class="pool-option">
                <input type="radio" name="placementFilter" value="cloud" ${placementFilter === "cloud" ? "checked" : ""} />
                <span class="pool-option-copy">
                  <span class="pool-option-title">${escapeHtml(t("models.poolCloud"))}</span>
                  <span class="pool-option-desc muted">${escapeHtml(t("models.poolDescCloud"))}</span>
                </span>
              </label>
              <label class="pool-option">
                <input type="radio" name="placementFilter" value="local" ${placementFilter === "local" ? "checked" : ""} />
                <span class="pool-option-copy">
                  <span class="pool-option-title">${escapeHtml(t("models.poolLocal"))}</span>
                  <span class="pool-option-desc muted">${escapeHtml(t("models.poolDescLocal"))}</span>
                </span>
              </label>
              <label class="pool-option">
                <input type="radio" name="placementFilter" value="any" ${placementFilter === "any" ? "checked" : ""} />
                <span class="pool-option-copy">
                  <span class="pool-option-title">${escapeHtml(t("models.poolAny"))}</span>
                  <span class="pool-option-desc muted">${escapeHtml(t("models.poolDescAny"))}</span>
                </span>
              </label>
            </fieldset>
            <div id="routing-extras"></div>
          </form>
          <div id="routing-msg"></div>`
              : ""
          }`);
        wireTabs();

        const routingForm = /** @type {HTMLFormElement | null} */ (
          document.getElementById("routing-form")
        );
        /** Keep pool radios; only rewrite auto-switch / Local-only hints (no full-view flash). */
        const syncRoutingExtras = (filter, switchChecked) => {
          const extras = document.getElementById("routing-extras");
          if (!extras) return;
          const bits = [];
          if (filter === "any" && canAutoSwitch) {
            bits.push(`<label class="routing-check">
              <input type="checkbox" name="autoSwitch" ${switchChecked ? "checked" : ""} />
              <span>${escapeHtml(t("models.autoSwitch"))}</span>
            </label>
            <p class="muted routing-hint">${escapeHtml(t("models.autoSwitchHint"))}</p>`);
          } else if (filter === "any") {
            bits.push(`<p class="muted routing-hint">${escapeHtml(t("models.autoSwitchNeedTwo"))}</p>
            <input type="hidden" name="autoSwitch" value="" />`);
          } else {
            bits.push(`<p class="muted routing-hint">${escapeHtml(t("models.autoSwitchSmartOnly"))}</p>
            <input type="hidden" name="autoSwitch" value="" />`);
          }
          if (filter === "local") {
            bits.push(
              `<p class="muted routing-hint">${escapeHtml(t("models.localOnlySharedHint"))}</p>`,
            );
          }
          if (!localEngineOn) {
            bits.push(
              `<p class="muted routing-hint">${escapeHtml(t("models.localOnlyHint"))}</p>`,
            );
          }
          extras.innerHTML = bits.join("");
        };
        syncRoutingExtras(placementFilter, autoSwitch);

        let routingSaveInFlight = false;
        let routingSaveQueued = false;
        const persistRouting = async () => {
          const form = /** @type {HTMLFormElement | null} */ (
            document.getElementById("routing-form")
          );
          if (!aid || !form) return;
          if (routingSaveInFlight) {
            routingSaveQueued = true;
            return;
          }
          routingSaveInFlight = true;
          routingSaveQueued = false;
          const fd = new FormData(form);
          const box = document.getElementById("routing-msg");
          const filter = String(fd.get("placementFilter") || "cloud");
          const switchOn =
            filter === "any" && canAutoSwitch && fd.get("autoSwitch") === "on";
          const leavingLocalOnly =
            form.getAttribute("data-local-only") === "1" && filter !== "local";
          // Local only is daemon-wide (shared: true). Use shared only when
          // entering Local only, or when leaving it (reset others to adaptive).
          // Never shared:true on ordinary Cloud / Smart Routing saves — that
          // would wipe other profiles' locked pools.
          try {
            let ans;
            if (filter === "local") {
              ans = await rpc("home.setPlacementFilter", {
                accountId: aid,
                filter: "local",
                shared: true,
              });
            } else if (leavingLocalOnly) {
              ans = await rpc("home.setPlacementFilter", {
                accountId: aid,
                filter: "cloud",
                shared: true,
              });
              if (!ans.error) {
                ans = await rpc("home.setPlacementFilter", { accountId: aid, filter });
              }
            } else {
              ans = await rpc("home.setPlacementFilter", { accountId: aid, filter });
            }
            if (ans.error) {
              if (box) box.innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`;
              return;
            }
            ans = await rpc("home.setAutoModelSwitch", { accountId: aid, enabled: switchOn });
            if (ans.error) {
              if (box) box.innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`;
              return;
            }
            form.setAttribute("data-local-only", filter === "local" ? "1" : "0");
            // Preserve checkbox intent when staying on Smart Routing; otherwise hide it.
            syncRoutingExtras(filter, switchOn);
            if (box) box.innerHTML = "";
          } finally {
            routingSaveInFlight = false;
            if (routingSaveQueued) void persistRouting();
          }
        };
        routingForm?.addEventListener("submit", (ev) => ev.preventDefault());
        routingForm?.addEventListener("change", (ev) => {
          const target = ev.target;
          if (!(target instanceof HTMLInputElement)) return;
          if (target.name !== "placementFilter" && target.name !== "autoSwitch") return;
          // Optimistic extras update so radios do not wait on RPC for layout.
          if (target.name === "placementFilter") {
            const form = document.getElementById("routing-form");
            const prevSwitch = form?.querySelector('input[name="autoSwitch"]');
            const wasOn = prevSwitch instanceof HTMLInputElement && prevSwitch.checked;
            syncRoutingExtras(target.value, wasOn);
          }
          void persistRouting();
        });
        return;
      }

      // memory
      {

        if (!aid) {
          el.innerHTML = shell(`<p>${escapeHtml(t("profile.pick"))}</p>`);
        wireTabs();
          return;
        }
        const listed = await rpc("home.listMemory", { accountId: aid });
        const mem = listed.result || {};
        const pendingLearns = await rpc("home.listPendingLearns", { accountId: aid });
        const learns =
          pendingLearns.result?.pending ||
          pendingLearns.result?.learns ||
          pendingLearns.result ||
          [];
        const list = Array.isArray(learns) ? learns : [];
        const learnKindLabel = (kind) => {
          const key = `memory.learnKind.${kind}`;
          const labeled = t(key);
          return labeled === key ? String(kind || t("memory.learnKind.unknown")) : labeled;
        };
        const cards = list
          .map((l) => {
            const summary = String(l.diff?.summary || l.summary || "").trim();
            const patch = typeof l.diff?.patch === "string" ? l.diff.patch.trim() : "";
            const stale = l.stale === true || l.status === "stale";
            const when = l.createdAt ? String(l.createdAt).slice(0, 19).replace("T", " ") : "";
            return `<div class="card mem-learn-card" data-id="${escapeHtml(l.id)}">
              <div class="mem-cap-title">
                <span class="mem-cap-label">${escapeHtml(learnKindLabel(l.kind))}</span>
                ${stale ? `<span class="status-pill warn">${escapeHtml(t("memory.learnStale"))}</span>` : ""}
              </div>
              <p class="mem-learn-summary">${escapeHtml(summary || t("memory.learnNoSummary"))}</p>
              ${
                patch
                  ? `<pre class="mem-learn-patch">${escapeHtml(patch.length > 400 ? `${patch.slice(0, 400)}…` : patch)}</pre>`
                  : ""
              }
              ${when ? `<p class="muted mem-learn-meta">${escapeHtml(when)}</p>` : ""}
              <div class="row">
                <button type="button" data-act="accept">${escapeHtml(t("app.accept"))}</button>
                <button type="button" data-act="reject">${escapeHtml(t("app.reject"))}</button>
              </div>
            </div>`;
          })
          .join("");
        const flushOn = mem.flushEnabled !== false;
        const reviewOn = mem.reviewEnabled !== false;
        const retention = mem.sessionRetentionDays ?? 180;
        const noteLabel = (path) => {
          const p = String(path || "");
          if (p === "profile.json" || p.endsWith("/profile.json")) return t("memory.noteProfile");
          if (p === "MEMORY.md" || p.endsWith("/MEMORY.md")) return t("memory.noteMemory");
          if (/memory\/\d{4}-\d{2}-\d{2}\.md$/i.test(p) || /^\d{4}-\d{2}-\d{2}\.md$/i.test(p)) {
            return t("memory.noteDaily");
          }
          if (p === "COMPACT.md" || p.endsWith("/COMPACT.md") || /memory\/compact\//i.test(p)) {
            return t("memory.noteCompact");
          }
          return t("memory.noteOther", { path: p });
        };
        const caps = (mem.notes || [])
          .map((n) => {
            const onDisk = t("memory.capsChars", {
              used: String(n.rawChars ?? 0),
              cap: String(n.rawSoftCap ?? "?"),
            });
            const inPrompt = t("memory.capsChars", {
              used: String(n.injectChars ?? 0),
              cap: String(n.injectBudget ?? "?"),
            });
            return `<li class="mem-cap-item">
              <div class="mem-cap-title">${escapeHtml(noteLabel(n.path))}
                <code class="mem-cap-path">${escapeHtml(n.path || "")}</code>
              </div>
              <div class="mem-cap-metrics">
                <span><strong>${escapeHtml(t("memory.capsOnDisk"))}</strong> ${escapeHtml(onDisk)}</span>
                <span><strong>${escapeHtml(t("memory.capsInPrompt"))}</strong> ${escapeHtml(inPrompt)}</span>
              </div>
              ${
                n.truncated
                  ? `<p class="muted mem-cap-warn">${escapeHtml(t("memory.capsTruncated"))}</p>`
                  : ""
              }
            </li>`;
          })
          .join("");
        const profiles = mem.injectProfiles;
        const injectMode =
          mem.injectBudgetMode === "baseline" || mem.injectBudgetMode === "custom"
            ? mem.injectBudgetMode
            : "auto";
        const cloudSeed = profiles?.cloud || {};
        const customL1 =
          typeof mem.caps?.l1?.injectBudget === "number"
            ? mem.caps.l1.injectBudget
            : (cloudSeed.l1 ?? 4000);
        const customL2 =
          typeof mem.caps?.l2?.injectBudget === "number"
            ? mem.caps.l2.injectBudget
            : (cloudSeed.l2 ?? 20_000);
        const customL3 =
          typeof mem.caps?.l3?.injectBudget === "number"
            ? mem.caps.l3.injectBudget
            : (cloudSeed.l3 ?? 20_000);
        const profileCard = (id, labelKey) => {
          const p = profiles?.[id];
          if (!p) return "";
          const active = profiles.active === id;
          const fromLine =
            typeof p.contextTokens === "number" && p.sourceProviderId
              ? t("memory.injectFrom", {
                  provider: p.sourceProviderId,
                  tokens: String(p.contextTokens),
                })
              : t("memory.injectUnknownCtx");
          const split = t("memory.injectSplit", {
            l1: String(p.l1 ?? "?"),
            l2: String(p.l2 ?? "?"),
            l3: String(p.l3 ?? "?"),
          });
          return `<li class="mem-cap-item${active ? " mem-cap-item--active" : ""}"${active ? ` title="${escapeHtml(t("memory.injectActiveTitle"))}"` : ""}>
            <div class="mem-cap-title"><span class="mem-cap-label">${escapeHtml(t(labelKey))}</span></div>
            <p class="muted mem-cap-path">${escapeHtml(fromLine)}</p>
            <div class="mem-cap-metrics"><span>${escapeHtml(split)}</span></div>
          </li>`;
        };
        const modeOpt = (value, labelKey) =>
          `<option value="${value}"${injectMode === value ? " selected" : ""}>${escapeHtml(t(labelKey))}</option>`;
        const injectProfilesHtml = profiles
          ? `<div class="mem-inject-profiles">
            <h4>${escapeHtml(t("memory.injectProfiles"))}</h4>
            <p class="muted mem-caps-hint">${escapeHtml(t("memory.injectProfilesHint"))}</p>
            <div id="mem-inject-settings" class="mem-inject-form">
              <label>${escapeHtml(t("memory.injectMode"))}
                <select name="injectBudgetMode" id="mem-inject-mode">
                  ${modeOpt("auto", "memory.injectModeAuto")}
                  ${modeOpt("baseline", "memory.injectModeBaseline")}
                  ${modeOpt("custom", "memory.injectModeCustom")}
                </select>
              </label>
              <div id="mem-custom-caps" class="mem-custom-caps"${injectMode === "custom" ? "" : " hidden"}>
                <p class="muted mem-caps-hint">${escapeHtml(t("memory.injectCustomHint"))}</p>
                <label>${escapeHtml(t("memory.injectL1"))}
                  <input name="injectL1" type="number" min="0" step="1" value="${Number(customL1)}"
                    data-cloud-seed="${Number(cloudSeed.l1 ?? 4000)}" />
                </label>
                <label>${escapeHtml(t("memory.injectL2"))}
                  <input name="injectL2" type="number" min="0" step="1" value="${Number(customL2)}"
                    data-cloud-seed="${Number(cloudSeed.l2 ?? 20_000)}" />
                </label>
                <label>${escapeHtml(t("memory.injectL3"))}
                  <input name="injectL3" type="number" min="0" step="1" value="${Number(customL3)}"
                    data-cloud-seed="${Number(cloudSeed.l3 ?? 20_000)}" />
                </label>
              </div>
              <p id="mem-inject-status" class="muted mem-inject-status" hidden></p>
            </div>
            <ul class="caps">
              ${profileCard("cloud", "memory.injectCloud")}
              ${profileCard("local", "memory.injectLocal")}
            </ul>
          </div>`
          : "";
        el.innerHTML = shell(`
          <p class="muted">${escapeHtml(t("memory.hint"))} · backend <code>${escapeHtml(mem.backendId || "?")}</code>
            · ${escapeHtml(t("memory.pendingCount", {
              count: String(mem.pendingLearnCount ?? list.length),
              cap: String(mem.pendingLearnCap ?? "?"),
            }))}</p>
          <form id="mem-settings" class="card">
            <h3>${escapeHtml(t("memory.flushReview"))}</h3>
            <label class="mem-check">
              <input type="checkbox" name="flushEnabled" ${flushOn ? "checked" : ""} />
              <span>${escapeHtml(t("memory.flushEnabled"))}</span>
            </label>
            <label class="mem-check">
              <input type="checkbox" name="reviewEnabled" ${reviewOn ? "checked" : ""} />
              <span>${escapeHtml(t("memory.reviewEnabled"))}</span>
            </label>
            <label>${escapeHtml(t("memory.sessionRetention"))} <input name="sessionRetentionDays" type="number" min="0" value="${retention}" /></label>
            <button type="submit">${escapeHtml(t("memory.saveSettings"))}</button>
          </form>
          <div class="card">
            <h3>${escapeHtml(t("memory.caps"))}</h3>
            <p class="muted mem-caps-hint">${escapeHtml(t("memory.capsHint"))}</p>
            ${injectProfilesHtml}
            <ul class="caps">${caps || `<li class='muted'>${escapeHtml(t("memory.noNotes"))}</li>`}</ul>
            <p class="muted mem-caps-hint">${escapeHtml(t("memory.compactHint"))}</p>
            <button type="button" id="compact-now">${escapeHtml(t("memory.compact"))}</button>
          </div>
          <div class="card">
            <h3>${escapeHtml(t("memory.pending"))}</h3>
            <p class="muted mem-caps-hint">${escapeHtml(t("memory.pendingHint"))}</p>
            ${cards || `<p class="muted">${escapeHtml(t("memory.queueEmpty"))}</p>`}
          </div>`);
        wireTabs();
        document.getElementById("mem-settings")?.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target);
          const ans = await rpc("home.setMemorySettings", {
            accountId: aid,
            flushEnabled: fd.get("flushEnabled") === "on",
            reviewEnabled: fd.get("reviewEnabled") === "on",
            sessionRetentionDays: Number(fd.get("sessionRetentionDays")),
          });
          if (ans.error) {
            el.insertAdjacentHTML("beforeend", `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
            return;
          }
          await showView("memory");
        });
        const injectRoot = document.getElementById("mem-inject-settings");
        const modeEl = document.getElementById("mem-inject-mode");
        const customBox = document.getElementById("mem-custom-caps");
        const injectStatus = document.getElementById("mem-inject-status");
        const seedCustomFromCloud = () => {
          if (!customBox) return;
          customBox.querySelectorAll("input[data-cloud-seed]").forEach((input) => {
            const seed = Number(input.getAttribute("data-cloud-seed"));
            if (Number.isFinite(seed)) input.value = String(seed);
          });
        };
        const readInjectBody = () => {
          const modeRaw = String(modeEl?.value || "auto");
          const mode = modeRaw === "baseline" || modeRaw === "custom" ? modeRaw : "auto";
          const body = { accountId: aid, injectBudgetMode: mode };
          if (mode === "custom" && customBox) {
            const num = (name) => {
              const input = customBox.querySelector(`input[name="${name}"]`);
              return Math.max(0, Math.floor(Number(input?.value) || 0));
            };
            body.caps = {
              l1: { injectBudget: num("injectL1") },
              l2: { injectBudget: num("injectL2") },
              l3: { injectBudget: num("injectL3") },
            };
          }
          return body;
        };
        let injectSaving = false;
        let injectSaveQueued = false;
        const persistInject = async () => {
          if (injectSaving) {
            injectSaveQueued = true;
            return;
          }
          injectSaving = true;
          if (injectStatus) {
            injectStatus.hidden = false;
            injectStatus.textContent = t("memory.injectSaving");
          }
          try {
            do {
              injectSaveQueued = false;
              const ans = await rpc("home.setMemorySettings", readInjectBody());
              if (ans.error) {
                if (injectStatus) injectStatus.textContent = errMsg(ans);
                return;
              }
            } while (injectSaveQueued);
            await showView("memory");
          } finally {
            injectSaving = false;
          }
        };
        modeEl?.addEventListener("change", () => {
          const custom = modeEl.value === "custom";
          if (customBox) customBox.hidden = !custom;
          if (custom && injectMode !== "custom") seedCustomFromCloud();
          void persistInject();
        });
        customBox?.querySelectorAll('input[type="number"]').forEach((input) => {
          // Commit on change (blur / stepper) so mid-edit digits are not saved as 0.
          input.addEventListener("change", () => {
            if (modeEl?.value !== "custom") return;
            void persistInject();
          });
        });
        injectRoot?.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" && ev.target instanceof HTMLInputElement) {
            ev.preventDefault();
            ev.target.blur();
          }
        });
        document.getElementById("compact-now")?.addEventListener("click", async () => {
          const ans = await rpc("home.compactMemory", { accountId: aid });
          if (ans.error) {
            el.insertAdjacentHTML("beforeend", `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
            return;
          }
          await showView("memory");
        });
        el.querySelectorAll(".mem-learn-card button[data-act]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const idLearn = btn.closest(".mem-learn-card")?.dataset.id;
            if (!idLearn) return;
            const method = btn.dataset.act === "accept" ? "home.acceptLearn" : "home.rejectLearn";
            const ans = await rpc(method, { accountId: aid, id: idLearn });
            if (ans.error) {
              el.insertAdjacentHTML("beforeend", `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
              return;
            }
            await showView("memory");
          });
        });
        return;
      }
    }


    if (id === "automation") {
      const tab = (tabId, labelKey) =>
        `<button type="button" role="tab" class="page-tab${automationTab === tabId ? " active" : ""}" data-automation-tab="${tabId}" aria-selected="${
          automationTab === tabId ? "true" : "false"
        }">${escapeHtml(t(labelKey))}</button>`;
      if (automationTab !== "skills" && automationTab !== "workflows" && automationTab !== "jobs") {
        automationTab = "skills";
      }
      const tabsHtml = `<div class="page-tabs" role="tablist">
        ${tab("skills", "nav.skills")}
        ${tab("workflows", "nav.workflows")}
        ${tab("jobs", "nav.jobs")}
      </div>`;
      const shell = (panel) =>
        `<h2>${escapeHtml(t("nav.skills"))}</h2>${tabsHtml}<div class="page-tab-panel">${panel}</div>`;
      const wireTabs = () => {
        el.querySelectorAll("[data-automation-tab]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const next = btn.getAttribute("data-automation-tab");
            if (next !== "skills" && next !== "workflows" && next !== "jobs") return;
            if (next === automationTab) return;
            automationTab = next;
            await showView("automation");
          });
        });
      };

      if (automationTab === "skills") {
        const body = await rpc("home.listSkills", {});
        const skills = body.result?.skills || [];
        const cards = skills
          .map((s) => {
            const status = s.verified
              ? `<span class="status-pill ok">${escapeHtml(t("skills.verified"))}</span>`
              : `<span class="status-pill warn">${escapeHtml(t("skills.needsVerify"))}</span>`;
            const en = s.enabled
              ? `<span class="muted">${escapeHtml(t("skills.enabled"))}</span>`
              : `<span class="muted">${escapeHtml(t("skills.disabled"))}</span>`;
            return `<div class="card">
              <div class="prov-card-head">
                <strong>${escapeHtml(s.name || s.id)}</strong>
                ${status}
                ${en}
              </div>
              <div class="muted"><code>${escapeHtml(s.id)}</code></div>
              <div class="row">
                <button type="button" data-verify="${escapeHtml(s.id)}">${escapeHtml(t("skills.verify"))}</button>
                <button type="button" class="secondary" data-remove="${escapeHtml(s.id)}">${escapeHtml(t("app.remove"))}</button>
              </div>
            </div>`;
          })
          .join("");
        el.innerHTML = shell(`
          <div id="install-skill" class="skill-install">
            <div id="skill-install-msg" class="le-section-msg"></div>
            <section class="card skill-source" id="skill-source-howto">
              <h3>${escapeHtml(t("skills.howtoTitle"))}</h3>
              <p class="muted">${escapeHtml(t("skills.howtoHint"))}</p>
              <pre class="skill-howto-md" id="skill-howto-md"><code>${escapeHtml(SKILL_MD_HOWTO_EXAMPLE)}</code></pre>
            </section>
            <section class="card skill-source" id="skill-source-disk">
              <h3>${escapeHtml(t("skills.install"))}</h3>
              <p class="muted">${escapeHtml(t("skills.installHint"))}</p>
              <div id="skill-drop" class="skill-drop" tabindex="0" role="button" aria-label="${escapeHtml(t("skills.drop"))}">
                <p class="skill-drop-label" id="skill-drop-label">${escapeHtml(t("skills.drop"))}</p>
                <div class="row skill-drop-actions">
                  <button type="button" id="skill-browse-folder">${escapeHtml(t("skills.browseFolder"))}</button>
                  <button type="button" class="secondary" id="skill-browse-file">${escapeHtml(t("skills.browseFile"))}</button>
                </div>
              </div>
            </section>
            <section class="card skill-source" id="skill-source-clawhub">
              <h3>${escapeHtml(t("skills.clawhubTitle"))}</h3>
              <p class="muted">${escapeHtml(t("skills.clawhubHint"))}</p>
              <div class="row skill-clawhub-search-bar">
                <input id="skill-clawhub-query" type="search" placeholder="${escapeHtml(t("skills.clawhubSearchPlaceholder"))}" autocomplete="off" />
                <button type="button" id="skill-clawhub-search">${escapeHtml(t("skills.clawhubSearch"))}</button>
              </div>
              <div id="skill-clawhub-results" class="skill-clawhub-results" aria-live="polite"></div>
              <details class="skill-clawhub-paste" id="skill-clawhub-paste">
                <summary>${escapeHtml(t("skills.clawhubPaste"))}</summary>
                <form id="skill-clawhub-form" class="skill-clawhub-manual">
                  <label>${escapeHtml(t("skills.clawhubRef"))}
                    <input name="ref" required placeholder="owner/slug" autocomplete="off" />
                  </label>
                  <button type="submit">${escapeHtml(t("skills.installClawhub"))}</button>
                </form>
              </details>
            </section>
            <section class="card skill-source" id="skill-source-url">
              <h3>${escapeHtml(t("skills.urlTitle"))}</h3>
              <p class="muted">${escapeHtml(t("skills.urlHint"))}</p>
              <form id="skill-url-form" class="skill-url-form">
                <label>${escapeHtml(t("skills.urlRef"))}
                  <input name="ref" type="url" required placeholder="https://…/skill.zip or …/SKILL.md" autocomplete="off" />
                </label>
                <button type="submit">${escapeHtml(t("skills.installUrl"))}</button>
              </form>
            </section>
          </div>
          ${cards || `<p class='muted'>${escapeHtml(t("skills.none"))}</p>`}`);
        wireTabs();

        const msgBox = () => document.getElementById("skill-install-msg");
        const setInstallMsg = (html) => {
          const box = msgBox();
          if (box) box.innerHTML = html;
        };
        const installFromPath = async (ref) => {
          const path = String(ref || "").trim();
          if (!path) return;
          setInstallMsg(`<p class="muted">${escapeHtml(t("skills.installing"))}</p>`);
          const ans = await rpc("home.installSkill", { source: "path", ref: path });
          if (ans.error) {
            setInstallMsg(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
            return;
          }
          await showView("automation");
        };

        const drop = document.getElementById("skill-drop");
        const dropLabel = document.getElementById("skill-drop-label");
        const setDropActive = (on) => {
          drop?.classList.toggle("skill-drop--active", on);
          if (dropLabel) {
            dropLabel.textContent = on ? t("skills.dropActive") : t("skills.drop");
          }
        };

        drop?.addEventListener("dragenter", (ev) => {
          ev.preventDefault();
          setDropActive(true);
        });
        drop?.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
          setDropActive(true);
        });
        drop?.addEventListener("dragleave", (ev) => {
          if (ev.target === drop) setDropActive(false);
        });
        drop?.addEventListener("drop", (ev) => {
          ev.preventDefault();
          setDropActive(false);
          const files = ev.dataTransfer?.files;
          if (!files || files.length === 0) return;
          const path = pathFromDroppedFile(files[0]);
          if (!path) {
            setInstallMsg(
              `<p class="le-error">${escapeHtml(t("skills.pickerUnavailable"))}</p>`,
            );
            return;
          }
          void installFromPath(path);
        });

        document.getElementById("skill-browse-folder")?.addEventListener("click", async () => {
          if (!isTauriShell()) {
            setInstallMsg(
              `<p class="muted">${escapeHtml(t("skills.pickerUnavailable"))}</p>`,
            );
            return;
          }
          try {
            const picked = await tauriInvoke("pick_skill_folder");
            if (typeof picked === "string" && picked) await installFromPath(picked);
          } catch (err) {
            setInstallMsg(
              `<p class="le-error">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`,
            );
          }
        });
        document.getElementById("skill-browse-file")?.addEventListener("click", async () => {
          if (!isTauriShell()) {
            setInstallMsg(
              `<p class="muted">${escapeHtml(t("skills.pickerUnavailable"))}</p>`,
            );
            return;
          }
          try {
            const picked = await tauriInvoke("pick_skill_file");
            if (typeof picked === "string" && picked) await installFromPath(picked);
          } catch (err) {
            setInstallMsg(
              `<p class="le-error">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`,
            );
          }
        });

        const installRemote = async (source, ref) => {
          const value = String(ref || "").trim();
          if (!value) return;
          setInstallMsg(`<p class="muted">${escapeHtml(t("skills.installing"))}</p>`);
          const ans = await rpc("home.installSkill", { source, ref: value }, { timeoutMs: 90_000 });
          if (ans.error) {
            setInstallMsg(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
            return;
          }
          await showView("automation");
        };

        const clawhubResults = document.getElementById("skill-clawhub-results");
        const runClawhubSearch = async () => {
          const q = /** @type {HTMLInputElement|null} */ (document.getElementById("skill-clawhub-query"))
            ?.value?.trim();
          if (!clawhubResults) return;
          if (!q) {
            clawhubResults.innerHTML = `<p class="muted">${escapeHtml(t("skills.clawhubQueryRequired"))}</p>`;
            return;
          }
          clawhubResults.innerHTML = `<p class="muted">${escapeHtml(t("app.working"))}</p>`;
          try {
            const ans = await rpc("home.searchClawHubSkills", { query: q, limit: 20 }, {
              timeoutMs: 30_000,
            });
            if (ans.error) {
              clawhubResults.innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans) || "failed")}</p>`;
              return;
            }
            const skills = Array.isArray(ans.result?.skills) ? ans.result.skills : [];
            if (!skills.length) {
              clawhubResults.innerHTML = `<p class="muted">${escapeHtml(t("skills.clawhubNoResults"))}</p>`;
              return;
            }
            clawhubResults.innerHTML = `<ul class="skill-clawhub-list">${skills
              .map((s) => {
                const ref = String(s.ref || (s.ownerHandle ? `${s.ownerHandle}/${s.slug}` : s.slug) || "");
                const title = s.ownerHandle
                  ? `${s.ownerHandle}/${s.name || s.slug}`
                  : String(s.name || s.slug || ref);
                const desc = s.description
                  ? `<span class="muted skill-clawhub-desc">${escapeHtml(s.description)}</span>`
                  : "";
                const open = s.url
                  ? `<a class="muted" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(t("skills.clawhubOpen"))}</a>`
                  : "";
                return `<li class="skill-clawhub-hit">
                  <div class="skill-clawhub-hit-info">
                    <strong>${escapeHtml(title)}</strong>
                    ${desc}
                    <code class="muted">${escapeHtml(ref)}</code>
                  </div>
                  <div class="row skill-clawhub-hit-actions">
                    ${open}
                    <button type="button" data-clawhub-install="${escapeHtml(ref)}">${escapeHtml(t("skills.installClawhub"))}</button>
                  </div>
                </li>`;
              })
              .join("")}</ul>`;
            clawhubResults.querySelectorAll("[data-clawhub-install]").forEach((btn) => {
              btn.addEventListener("click", async () => {
                const ref = btn.getAttribute("data-clawhub-install");
                if (!ref) return;
                btn.setAttribute("disabled", "true");
                await installRemote("clawhub", ref);
              });
            });
          } catch (e) {
            clawhubResults.innerHTML = `<p class="le-error">${escapeHtml(
              e instanceof Error ? e.message : String(e),
            )}</p>`;
          }
        };
        document.getElementById("skill-clawhub-search")?.addEventListener("click", () => {
          void runClawhubSearch();
        });
        document.getElementById("skill-clawhub-query")?.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            void runClawhubSearch();
          }
        });

        document.getElementById("skill-clawhub-form")?.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const fd = new FormData(/** @type {HTMLFormElement} */ (ev.target));
          await installRemote("clawhub", fd.get("ref"));
        });
        document.getElementById("skill-url-form")?.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const fd = new FormData(/** @type {HTMLFormElement} */ (ev.target));
          await installRemote("url", fd.get("ref"));
        });

        el.querySelectorAll("[data-verify]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const ans = await rpc("home.verifySkill", { id: btn.getAttribute("data-verify") });
            if (ans.error) {
              setInstallMsg(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
              return;
            }
            await showView("automation");
          });
        });
        el.querySelectorAll("[data-remove]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const ans = await rpc("home.removeSkill", { id: btn.getAttribute("data-remove") });
            if (ans.error) {
              setInstallMsg(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
              return;
            }
            await showView("automation");
          });
        });
        return;
      }

      if (automationTab === "workflows") {
        const body = await rpc("home.listWorkflows", aid ? { accountId: aid } : {});
        const toolsBody = await rpc("home.listWorkflowTools", aid ? { accountId: aid } : {});
        const catalogueTools = toolsBody.result?.tools || [];
        /** @type {Map<string, { name: string, risk: string, source: string, summary: string, sampleArgs?: Record<string, unknown>, available: boolean, unavailableReason?: string }>} */
        const toolByName = new Map(catalogueTools.map((row) => [row.name, row]));
        /** Ready tools only — HA/MQTT appear after those channels are enabled. */
        const readyTools = catalogueTools.filter((r) => r.available !== false);
        const countBySource = (src) => readyTools.filter((r) => r.source === src).length;
        const toolsSummaryText = t("workflows.toolsSummary", {
          builtin: String(countBySource("builtin")),
          skill: String(countBySource("skill")),
          smarthome: String(countBySource("smarthome")),
          available: String(readyTools.length),
        });
        const toolDatalistOptions = readyTools
          .map((r) => `<option value="${escapeHtml(r.name)}"></option>`)
          .join("");
        const workflows = body.result?.workflows || [];
        /** demo_* copies belong under sample cards below, not the main list. */
        const userWorkflows = workflows.filter((w) => !isDemoWorkflowId(w.id));
        /** @type {Map<string, (typeof workflows)[number]>} */
        const demoById = new Map(
          workflows.filter((w) => isDemoWorkflowId(w.id)).map((w) => [String(w.id), w]),
        );
        const list = userWorkflows
          .map((w) => {
            const en = w.enabled !== false;
            const acctAttr =
              w.source === "account" && w.accountId
                ? ` data-wf-account="${escapeHtml(w.accountId)}"`
                : "";
            const audience =
              w.source === "account"
                ? `${t("workflows.audienceAccount")}${w.accountId ? ` (${w.accountId})` : ""}`
                : t("workflows.audienceEveryone");
            return `<li class="wf-row" data-wf-id="${escapeHtml(w.id)}"${acctAttr}>
              <div class="wf-row-main">
                <strong><code>${escapeHtml(w.id)}</code></strong>
                <span class="muted wf-row-meta">${escapeHtml(audience)} · ${escapeHtml(en ? t("workflows.enabled") : t("workflows.disabled"))}</span>
              </div>
              <span class="row wf-row-actions">
                <button type="button" data-wf-edit="${escapeHtml(w.id)}"${acctAttr}>${escapeHtml(t("workflows.edit"))}</button>
                <button type="button" data-wf-toggle="${escapeHtml(w.id)}" data-en="${en ? "0" : "1"}"${acctAttr}>${escapeHtml(en ? t("app.disable") : t("app.enable"))}</button>
                <button type="button" data-wf-run="${escapeHtml(w.id)}"${acctAttr} ${aid ? "" : "disabled"}>${escapeHtml(t("workflows.runOnce"))}</button>
                <button type="button" class="secondary" data-wf-remove="${escapeHtml(w.id)}"${acctAttr}>${escapeHtml(t("app.remove"))}</button>
              </span>
            </li>`;
          })
          .join("");
        el.innerHTML = shell(`
          <div class="wf-toolbar row">
            <button type="button" id="wf-new">${escapeHtml(t("workflows.new"))}</button>
            <button type="button" class="secondary" id="reload-wf">${escapeHtml(t("workflows.reload"))}</button>
          </div>
          <p class="muted wf-list-hint">${escapeHtml(t("workflows.listHint"))}</p>
          <div id="wf-banner" class="le-section-msg"></div>
          <ul class="wf-list" id="wf-list">${list || `<li class='muted'>${escapeHtml(t("workflows.none"))}</li>`}</ul>

          <div id="wf-editor" class="modal-backdrop wf-editor-modal" hidden>
            <div class="modal-card wf-editor-card" role="dialog" aria-modal="true" aria-labelledby="wf-editor-title">
              <div class="wf-editor-head">
                <div class="wf-editor-head-text">
                  <h2 id="wf-editor-title">${escapeHtml(t("workflows.createTitle"))}</h2>
                  <p class="muted" id="wf-editor-hint">${escapeHtml(t("workflows.createHint"))}</p>
                </div>
                <button type="button" class="wf-editor-x" id="wf-editor-close" aria-label="${escapeHtml(t("workflows.close"))}">×</button>
              </div>
              <div class="wf-editor-body">
                <label class="wf-scope-label">${escapeHtml(t("workflows.whoCanUse"))}
                  <select id="wf-scope">
                    <option value="global" selected>${escapeHtml(t("workflows.scopeGlobalEveryone"))}</option>
                    ${
                      aid
                        ? `<option value="account">${escapeHtml(t("workflows.scopeAccountOnly"))} (${escapeHtml(aid)})</option>`
                        : ""
                    }
                  </select>
                </label>
                <p class="muted wf-scope-hint">${escapeHtml(t("workflows.whoCanUseHint"))}</p>
                <div class="wf-draft-bar">
                  <label class="wf-draft-label" for="wf-draft-text">${escapeHtml(t("workflows.draftLabel"))}</label>
                  <textarea id="wf-draft-text" rows="3" spellcheck="true"
                    placeholder="${escapeHtml(t("workflows.draftPlaceholder"))}"></textarea>
                  <span class="wf-draft-row">
                    <button type="button" id="wf-draft-go">${escapeHtml(t("workflows.draftAction"))}</button>
                    <span class="muted wf-draft-shortcut">${escapeHtml(t("workflows.draftShortcut"))}</span>
                  </span>
                  <p class="muted wf-draft-hint">${escapeHtml(t("workflows.draftHint"))}</p>
                </div>
                <div class="wf-mode-toggle" role="tablist" aria-label="${escapeHtml(t("workflows.modeLabel"))}">
                  <button type="button" class="secondary is-active" id="wf-mode-diagram" data-wf-mode="diagram">${escapeHtml(t("workflows.modeDiagram"))}</button>
                  <button type="button" class="secondary" id="wf-mode-yaml" data-wf-mode="yaml">${escapeHtml(t("workflows.modeYaml"))}</button>
                </div>
                <div id="wf-diagram-pane" class="wf-diagram-pane">
                  <div id="wf-canvas-host" class="wf-canvas-host"></div>
                </div>
                <div id="wf-yaml-pane" class="wf-yaml-pane" hidden>
                  <label class="wf-yaml-label">${escapeHtml(t("workflows.yamlLabel"))}
                    <textarea id="wf-yaml" rows="14" spellcheck="false"></textarea>
                  </label>
                  <div class="wf-insert-bar">
                    <label class="wf-insert-label">${escapeHtml(t("workflows.toolsInsertBar"))}
                      <span class="wf-insert-row">
                        <input id="wf-tool-pick" type="text" list="wf-tool-datalist" autocomplete="off"
                          placeholder="${escapeHtml(t("workflows.toolsPickPlaceholder"))}" />
                        <datalist id="wf-tool-datalist">${toolDatalistOptions}</datalist>
                        <button type="button" id="wf-tool-insert">${escapeHtml(t("workflows.toolsInsertAction"))}</button>
                      </span>
                    </label>
                  </div>
                </div>
                <details class="wf-tools-panel" id="wf-tools-panel">
                  <summary>${escapeHtml(t("workflows.toolsTitle"))}
                    <span class="wf-tools-summary-counts"> — ${escapeHtml(toolsSummaryText)}</span>
                  </summary>
                  <p class="muted wf-tools-hint">${escapeHtml(t("workflows.toolsHint"))}</p>
                  <div class="wf-tools-controls">
                    <label class="wf-tools-filter-label">${escapeHtml(t("workflows.toolsFilter"))}
                      <input id="wf-tools-filter" type="search" placeholder="${escapeHtml(t("workflows.toolsFilterPlaceholder"))}" />
                    </label>
                  </div>
                  <div id="wf-tools-browse">${
                    readyTools.length
                      ? ""
                      : `<p class="muted">${escapeHtml(t("workflows.toolsEmptyCatalogue"))}</p>`
                  }</div>
                </details>
              </div>
              <div class="wf-editor-footer">
                <div id="wf-msg" class="le-section-msg wf-editor-footer-msg"></div>
                <div class="row wf-editor-actions">
                  <button type="button" class="secondary" id="wf-cancel">${escapeHtml(t("workflows.cancel"))}</button>
                  <button type="button" class="secondary" id="wf-validate">${escapeHtml(t("workflows.validate"))}</button>
                  <button type="button" class="secondary" id="wf-editor-try" hidden>${escapeHtml(t("workflows.howtoTest"))}</button>
                  <button type="button" id="wf-save">${escapeHtml(t("workflows.save"))}</button>
                </div>
              </div>
            </div>
          </div>

          <details class="wf-howto card skill-source" open>
            <summary>${escapeHtml(t("workflows.howtoTitle"))}</summary>
            <p class="muted">${escapeHtml(t("workflows.howtoHint"))}</p>
            <div class="wf-howto-block" data-wf-demo="complex">
              <div class="wf-howto-head">
                <h4 class="muted">${escapeHtml(t("workflows.howtoComplex"))}</h4>
                <span class="wf-howto-actions">
                  <button type="button" class="secondary" id="wf-test-complex">${escapeHtml(t("workflows.howtoTest"))}</button>
                  <button type="button" id="wf-try-complex">${escapeHtml(t("workflows.howtoTry"))}</button>
                </span>
              </div>
              <p class="wf-howto-what">${escapeHtml(t("workflows.howtoComplexWhat"))}</p>
              <p class="muted wf-howto-blurb">${escapeHtml(t("workflows.howtoComplexHint"))}</p>
              <div class="wf-demo-saved" id="wf-saved-complex" hidden></div>
              <div class="wf-demo-canvas" id="wf-demo-complex"></div>
              <div class="wf-demo-run" id="wf-run-complex" hidden></div>
              <details class="wf-demo-yaml">
                <summary>${escapeHtml(t("workflows.howtoViewYaml"))}</summary>
                <pre class="skill-howto-md"><code>${escapeHtml(WORKFLOW_HOWTO_COMPLEX)}</code></pre>
              </details>
            </div>
            <div class="wf-howto-block" data-wf-demo="branch">
              <div class="wf-howto-head">
                <h4 class="muted">${escapeHtml(t("workflows.howtoBranch"))}</h4>
                <span class="wf-howto-actions">
                  <button type="button" class="secondary" id="wf-test-branch">${escapeHtml(t("workflows.howtoTest"))}</button>
                  <button type="button" id="wf-try-branch">${escapeHtml(t("workflows.howtoTry"))}</button>
                </span>
              </div>
              <p class="wf-howto-what">${escapeHtml(t("workflows.howtoBranchWhat"))}</p>
              <p class="muted wf-howto-blurb">${escapeHtml(t("workflows.howtoBranchHint"))}</p>
              <div class="wf-demo-saved" id="wf-saved-branch" hidden></div>
              <div class="wf-demo-canvas" id="wf-demo-branch"></div>
              <div class="wf-demo-run" id="wf-run-branch" hidden></div>
              <details class="wf-demo-yaml">
                <summary>${escapeHtml(t("workflows.howtoViewYaml"))}</summary>
                <pre class="skill-howto-md"><code>${escapeHtml(WORKFLOW_HOWTO_BRANCH)}</code></pre>
              </details>
            </div>
            <div class="wf-howto-block" data-wf-demo="linear">
              <div class="wf-howto-head">
                <h4 class="muted">${escapeHtml(t("workflows.howtoLinear"))}</h4>
                <span class="wf-howto-actions">
                  <button type="button" class="secondary" id="wf-test-linear">${escapeHtml(t("workflows.howtoTest"))}</button>
                  <button type="button" id="wf-try-linear">${escapeHtml(t("workflows.howtoTry"))}</button>
                </span>
              </div>
              <p class="wf-howto-what">${escapeHtml(t("workflows.howtoLinearWhat"))}</p>
              <p class="muted wf-howto-blurb">${escapeHtml(t("workflows.howtoLinearHint"))}</p>
              <div class="wf-demo-saved" id="wf-saved-linear" hidden></div>
              <div class="wf-demo-canvas" id="wf-demo-linear"></div>
              <div class="wf-demo-run" id="wf-run-linear" hidden></div>
              <details class="wf-demo-yaml">
                <summary>${escapeHtml(t("workflows.howtoViewYaml"))}</summary>
                <pre class="skill-howto-md"><code>${escapeHtml(WORKFLOW_HOWTO_LINEAR)}</code></pre>
              </details>
            </div>
          </details>
          <details class="wf-debug">
            <summary class="muted">${escapeHtml(t("workflows.debug"))}</summary>
            ${pre(body)}
          </details>`);
        wireTabs();
        const setWfMsg = (html) => {
          const box = document.getElementById("wf-msg");
          if (box) box.innerHTML = html;
        };
        const setBanner = (html) => {
          const box = document.getElementById("wf-banner");
          if (box) box.innerHTML = html;
        };
        const wfAccountParam = (elBtn) => {
          const acct = elBtn.getAttribute("data-wf-account");
          return acct ? { accountId: acct } : {};
        };
        const editor = document.getElementById("wf-editor");
        const titleEl = document.getElementById("wf-editor-title");
        const hintEl = document.getElementById("wf-editor-hint");
        const yamlEl = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("wf-yaml"));
        const scopeEl = /** @type {HTMLSelectElement | null} */ (document.getElementById("wf-scope"));
        const diagramPane = document.getElementById("wf-diagram-pane");
        const yamlPane = document.getElementById("wf-yaml-pane");
        const canvasHost = document.getElementById("wf-canvas-host");
        /** @type {"diagram" | "yaml"} */
        let wfViewMode = "diagram";
        /** @type {ReturnType<typeof mountWorkflowCanvas> | null} */
        let canvasApi = null;
        /** @type {Array<{ id: string, label: string, nodeType: string, prompt: string, out?: string }>} */
        let wfStepTemplates = [];

        const syncYamlFromCanvas = () => {
          if (!canvasApi || !yamlEl) return;
          yamlEl.value = graphToYaml(canvasApi.getGraph());
        };

        const refreshStepTemplates = async () => {
          const ans = await rpc(
            "home.listWorkflowStepTemplates",
            aid ? { accountId: aid } : {},
          );
          wfStepTemplates = Array.isArray(ans.result?.templates) ? ans.result.templates : [];
          canvasApi?.setStepTemplates?.(wfStepTemplates);
        };

        const mountOrRefreshCanvas = (yaml) => {
          if (!canvasHost) return false;
          const parsed = yamlToGraph(yaml || "");
          if (!parsed.ok) {
            setWfMsg(`<p class="le-error">${escapeHtml(parsed.error || t("workflows.invalid"))}</p>`);
            return false;
          }
          if (canvasApi) canvasApi.destroy();
          canvasApi = mountWorkflowCanvas(canvasHost, {
            graph: parsed.graph,
            tools: readyTools.map((r) => ({ name: r.name })),
            stepTemplates: wfStepTemplates,
            labels: {
              addStep: t("workflows.canvasAddStep"),
              addStepHeading: t("workflows.canvasAddStepHeading"),
              addStepTemplatesHeading: t("workflows.canvasAddStepTemplatesHeading"),
              addStepTemplatesEmpty: t("workflows.canvasAddStepTemplatesEmpty"),
              createCustomStep: t("workflows.createCustomStep"),
              createCustomStepHint: t("workflows.createCustomStepHint"),
              addSummarize: t("workflows.canvasAddSummarize"),
              addSummarizeHint: t("workflows.canvasAddSummarizeHint"),
              addFill: t("workflows.canvasAddFill"),
              addFillHint: t("workflows.canvasAddFillHint"),
              addTool: t("workflows.canvasAddTool"),
              addToolHeading: t("workflows.canvasAddToolHeading"),
              addToolEmpty: t("workflows.canvasAddToolEmpty"),
              addToolBlank: t("workflows.canvasAddToolBlank"),
              addToolBlankHint: t("workflows.canvasAddToolBlankHint"),
              delete: t("workflows.canvasDelete"),
              setEntry: t("workflows.canvasSetEntry"),
              hint: t("workflows.canvasHint"),
              inspector: t("workflows.canvasInspector"),
              selectHint: t("workflows.canvasSelectHint"),
              refinePrompt: t("workflows.refinePrompt"),
              saveAsStep: t("workflows.saveAsStep"),
              entry: t("workflows.canvasEntry"),
              zoomLabel: t("workflows.canvasZoom"),
              zoomIn: t("workflows.canvasZoomIn"),
              zoomOut: t("workflows.canvasZoomOut"),
              zoomReset: t("workflows.canvasZoomReset"),
              zoomResetShort: t("workflows.canvasZoomResetShort"),
            },
            onChange: () => {
              // Canvas remount rewrites YAML; only user graph edits clear "fresh create".
              preferFreshAiDraft = false;
              syncYamlFromCanvas();
              syncEditorPracticeMode();
              syncDraftGoLabel();
            },
            onDraftPrompt: async (node) => {
              if (!aid) {
                setWfMsg(`<p class="le-error">${escapeHtml(t("profile.pick"))}</p>`);
                return;
              }
              setWfMsg(`<p class="muted">${escapeHtml(t("workflows.refineWorking"))}</p>`);
              const ans = await rpc("home.draftWorkflowPrompt", {
                accountId: aid,
                nodeType: node.type === "llm_fill" ? "llm_fill" : "llm_summarize",
                ...(node.prompt ? { currentPrompt: node.prompt } : {}),
              });
              if (ans.error) {
                setWfMsg(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
                return;
              }
              const prompt = ans.result?.prompt;
              if (typeof prompt === "string" && prompt) {
                node.prompt = prompt;
                syncYamlFromCanvas();
                setWfMsg(`<p class="muted">${escapeHtml(t("workflows.refinePromptDone"))}</p>`);
              }
            },
            onSaveStepTemplate: async (node) => {
              if (node.type === "tool") return;
              const prompt = String(node.prompt || "").trim();
              if (!prompt) {
                setWfMsg(`<p class="le-error">${escapeHtml(t("workflows.saveAsStepNeedPrompt"))}</p>`);
                return;
              }
              const fields = await promptForm({
                title: t("workflows.saveAsStep"),
                fields: [
                  {
                    name: "label",
                    label: t("workflows.saveAsStepLabelPrompt"),
                    value: node.label || node.id || "",
                    placeholder: "Extract JSON",
                  },
                ],
                okLabel: t("workflows.saveAsStep"),
              });
              if (!fields?.label) return;
              // Global library so Your steps can reuse across workflows/profiles.
              const ans = await rpc("home.putWorkflowStepTemplate", {
                label: fields.label,
                nodeType: node.type === "llm_fill" ? "llm_fill" : "llm_summarize",
                prompt,
                ...(node.out ? { out: node.out } : {}),
              });
              if (ans.error) {
                setWfMsg(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
                return;
              }
              await refreshStepTemplates();
              node.label = fields.label;
              syncYamlFromCanvas();
              setWfMsg(
                `<p class="muted">${escapeHtml(
                  t("workflows.saveAsStepDone", { id: ans.result?.id || fields.label }),
                )}</p>`,
              );
            },
            onCreateStepTemplate: async () => {
              // Purpose-named template (e.g. "Extract JSON") — saved globally for reuse.
              // Uses in-app form: window.prompt is blocked in Tauri/WKWebView.
              if (!aid) {
                setWfMsg(`<p class="le-error">${escapeHtml(t("profile.pick"))}</p>`);
                return null;
              }
              const fields = await promptForm({
                title: t("workflows.createCustomStep"),
                fields: [
                  {
                    name: "label",
                    label: t("workflows.saveAsStepLabelPrompt"),
                    placeholder: "Extract JSON",
                  },
                  {
                    name: "prompt",
                    label: t("workflows.createStepPromptPrompt"),
                    multiline: true,
                    placeholder: t("workflows.createStepPromptPlaceholder"),
                  },
                ],
                okLabel: t("workflows.createCustomStepSave"),
                refinePrompt: {
                  fieldName: "prompt",
                  buttonLabel: t("workflows.refinePrompt"),
                  onRefine: async ({ values }) => {
                    const ans = await rpc("home.draftWorkflowPrompt", {
                      accountId: aid,
                      nodeType: "llm_fill",
                      ...(values.label ? { goal: values.label } : {}),
                      ...(values.prompt ? { currentPrompt: values.prompt } : {}),
                    });
                    if (ans.error) {
                      throw new Error(errMsg(ans));
                    }
                    const next = ans.result?.prompt;
                    if (typeof next !== "string" || !next.trim()) {
                      throw new Error(t("workflows.saveAsStepNeedPrompt"));
                    }
                    return next.trim();
                  },
                },
              });
              if (!fields) return null;
              if (!fields.label) return null;
              if (!fields.prompt) {
                setWfMsg(`<p class="le-error">${escapeHtml(t("workflows.saveAsStepNeedPrompt"))}</p>`);
                return null;
              }
              const nodeType = "llm_fill";
              const ans = await rpc("home.putWorkflowStepTemplate", {
                label: fields.label,
                nodeType,
                prompt: fields.prompt,
              });
              if (ans.error) {
                setWfMsg(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
                return null;
              }
              await refreshStepTemplates();
              setWfMsg(
                `<p class="muted">${escapeHtml(
                  t("workflows.saveAsStepDone", { id: ans.result?.id || fields.label }),
                )}</p>`,
              );
              return {
                nodeType,
                prompt: fields.prompt,
                id: ans.result?.id || undefined,
                label: fields.label,
              };
            },
          });
          syncYamlFromCanvas();
          void refreshStepTemplates();
          return true;
        };

        const setWfViewMode = (mode) => {
          if (mode === "diagram") {
            const yaml = yamlEl?.value || "";
            if (!mountOrRefreshCanvas(yaml)) {
              // Stay on YAML when parse fails.
              mode = "yaml";
            }
          } else if (canvasApi) {
            syncYamlFromCanvas();
          }
          wfViewMode = mode;
          if (diagramPane) diagramPane.hidden = mode !== "diagram";
          if (yamlPane) yamlPane.hidden = mode !== "yaml";
          document.getElementById("wf-mode-diagram")?.classList.toggle("is-active", mode === "diagram");
          document.getElementById("wf-mode-yaml")?.classList.toggle("is-active", mode === "yaml");
        };

        /** Practice mode: demo_* ids can be modified + tried, but not Saved as production. */
        let editorPracticeDemo = false;
        /** @type {"create" | "edit"} */
        let editorMode = "create";
        const syncEditorPracticeMode = () => {
          const id = yamlWorkflowId(yamlEl?.value || "");
          const practice = isDemoWorkflowId(id);
          editorPracticeDemo = practice;
          const saveBtn = document.getElementById("wf-save");
          const tryBtn = document.getElementById("wf-editor-try");
          if (saveBtn) saveBtn.hidden = practice;
          if (tryBtn) tryBtn.hidden = !practice;
          if (!titleEl || !hintEl) return;
          if (practice) {
            titleEl.textContent = t("workflows.demoPracticeTitle");
            hintEl.textContent = t("workflows.demoPracticeHint");
          } else {
            titleEl.textContent =
              editorMode === "edit" ? t("workflows.editTitle") : t("workflows.createTitle");
            hintEl.textContent =
              editorMode === "edit" ? t("workflows.editHint") : t("workflows.createHint");
          }
        };
        const onEditorEscape = (ev) => {
          if (ev.key === "Escape") {
            ev.preventDefault();
            closeEditor();
          }
        };
        const starterYaml = () => WORKFLOW_NEW_TEMPLATE.trim();
        const isBlankOrStarterYaml = (yaml) => {
          const trimmed = String(yaml || "").trim();
          return !trimmed || trimmed === starterYaml();
        };
        /**
         * Create mode starts as "fresh AI draft" so Diagram remount (which rewrites YAML)
         * does not flip the button to Revise with AI. Cleared after a successful draft or
         * when the user edits the graph/YAML.
         */
        let preferFreshAiDraft = false;
        let draftAiInFlight = false;
        const shouldReviseAiDraft = () => {
          if (preferFreshAiDraft) return false;
          if (editorMode === "edit") return true;
          return !isBlankOrStarterYaml(yamlEl?.value || "");
        };
        const syncDraftGoLabel = () => {
          const go = /** @type {HTMLButtonElement | null} */ (document.getElementById("wf-draft-go"));
          if (!go) return;
          const revise = shouldReviseAiDraft();
          go.textContent = revise ? t("workflows.reviseAction") : t("workflows.draftAction");
          go.disabled = draftAiInFlight;
        };
        const openEditor = (mode, yaml, scope, _opts = {}) => {
          if (!editor || !titleEl || !hintEl || !yamlEl || !scopeEl) return;
          editor.hidden = false;
          document.body.classList.add("modal-open");
          document.addEventListener("keydown", onEditorEscape);
          editorMode = mode === "edit" ? "edit" : "create";
          // New: first AI call is create until user edits or drafts successfully.
          preferFreshAiDraft = editorMode === "create";
          draftAiInFlight = false;
          yamlEl.value = yaml;
          scopeEl.value = scope === "account" && aid ? "account" : "global";
          setWfMsg("");
          setBanner("");
          setWfViewMode("diagram");
          syncEditorPracticeMode();
          syncDraftGoLabel();
        };
        const closeEditor = () => {
          if (canvasApi) {
            canvasApi.destroy();
            canvasApi = null;
          }
          preferFreshAiDraft = false;
          draftAiInFlight = false;
          editorPracticeDemo = false;
          const saveBtn = document.getElementById("wf-save");
          const tryBtn = document.getElementById("wf-editor-try");
          if (saveBtn) saveBtn.hidden = false;
          if (tryBtn) tryBtn.hidden = true;
          if (editor) editor.hidden = true;
          document.body.classList.remove("modal-open");
          document.removeEventListener("keydown", onEditorEscape);
          setWfMsg("");
        };

        const insertToolSample = (toolName) => {
          if (!yamlEl) return;
          const row = toolByName.get(toolName);
          if (!row) {
            setWfMsg(`<p class="le-error">${escapeHtml(t("workflows.toolsNeedPick"))}</p>`);
            return;
          }
          const stepId = toolName.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "tool_step";
          const args = row.sampleArgs && typeof row.sampleArgs === "object" ? row.sampleArgs : {};
          const argsLines = Object.keys(args).length
            ? [
                "    args:",
                ...Object.entries(args).map(([k, v]) => {
                  const rendered =
                    typeof v === "string"
                      ? JSON.stringify(v)
                      : typeof v === "number" || typeof v === "boolean"
                        ? String(v)
                        : JSON.stringify(v);
                  return `      ${k}: ${rendered}`;
                }),
              ]
            : [];
          const snippet = ["  - id: " + stepId, "    type: tool", "    name: " + toolName, ...argsLines].join(
            "\n",
          );
          let text = yamlEl.value || "";
          if (/\nsteps:\s*\n/.test(text) || /^steps:\s*\n/.test(text)) {
            text = text.replace(/(^|\n)steps:\s*\n/, `$1steps:\n${snippet}\n`);
          } else if (/\nnodes:\s*\n/.test(text) || /^nodes:\s*\n/.test(text)) {
            text = text.replace(/(^|\n)nodes:\s*\n/, `$1nodes:\n${snippet}\n`);
          } else {
            text = `${text.replace(/\s*$/, "")}\nsteps:\n${snippet}\n`;
          }
          yamlEl.value = text;
          yamlEl.focus();
          setWfMsg(
            `<p class="muted">${escapeHtml(t("workflows.toolsInserted"))}: <code>${escapeHtml(toolName)}</code></p>`,
          );
        };

        const sourceLabel = (src) => {
          if (src === "skill") return t("workflows.toolsSourceSkill");
          if (src === "smarthome") return t("workflows.toolsSourceSmarthome");
          return t("workflows.toolsSourceBuiltin");
        };

        const renderToolsBrowse = () => {
          const host = document.getElementById("wf-tools-browse");
          if (!host) return;
          const filterEl = /** @type {HTMLInputElement | null} */ (document.getElementById("wf-tools-filter"));
          const q = (filterEl?.value || "").trim().toLowerCase();
          const filtered = readyTools.filter((row) => {
            if (!q) return true;
            const hay = `${row.name} ${row.summary || ""} ${row.risk || ""}`.toLowerCase();
            return hay.includes(q);
          });
          if (!filtered.length) {
            host.innerHTML = `<p class="muted">${escapeHtml(
              readyTools.length ? t("workflows.toolsEmpty") : t("workflows.toolsEmptyCatalogue"),
            )}</p>`;
            return;
          }
          host.innerHTML = ["builtin", "skill", "smarthome"]
            .map((src) => {
              const rows = filtered.filter((r) => r.source === src);
              if (!rows.length) return "";
              const items = rows
                .map((row) => {
                  return `<li class="wf-tool-row" title="${escapeHtml(row.summary || "")}">
                    <div class="wf-tool-main">
                      <code>${escapeHtml(row.name)}</code>
                      <span class="muted wf-tool-risk">${escapeHtml(row.risk)}</span>
                    </div>
                    <p class="muted wf-tool-summary">${escapeHtml(row.summary || "")}</p>
                    <button type="button" class="secondary" data-wf-insert-tool="${escapeHtml(row.name)}">${escapeHtml(t("workflows.toolsInsert"))}</button>
                  </li>`;
                })
                .join("");
              return `<div class="wf-tool-group">
                <h4 class="muted">${escapeHtml(sourceLabel(src))} (${rows.length})</h4>
                <ul class="wf-tool-list">${items}</ul>
              </div>`;
            })
            .join("");
          host.querySelectorAll("[data-wf-insert-tool]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const name = btn.getAttribute("data-wf-insert-tool");
              if (name) insertToolSample(name);
            });
          });
        };

        document.getElementById("wf-tools-filter")?.addEventListener("input", () => {
          renderToolsBrowse();
        });
        document.getElementById("wf-tool-insert")?.addEventListener("click", () => {
          const pick = /** @type {HTMLInputElement | null} */ (document.getElementById("wf-tool-pick"));
          const name = (pick?.value || "").trim();
          insertToolSample(name);
        });
        document.getElementById("wf-tool-pick")?.addEventListener("keydown", (ev) => {
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          const pick = /** @type {HTMLInputElement | null} */ (document.getElementById("wf-tool-pick"));
          insertToolSample((pick?.value || "").trim());
        });
        renderToolsBrowse();

        document.getElementById("wf-mode-diagram")?.addEventListener("click", () => {
          setWfViewMode("diagram");
        });
        document.getElementById("wf-mode-yaml")?.addEventListener("click", () => {
          setWfViewMode("yaml");
        });
        const runWorkflowDraft = async () => {
          if (draftAiInFlight) return;
          if (!aid) {
            setWfMsg(`<p class="le-error">${escapeHtml(t("profile.pick"))}</p>`);
            return;
          }
          const draftEl = /** @type {HTMLTextAreaElement | null} */ (
            document.getElementById("wf-draft-text")
          );
          const text = (draftEl?.value || "").trim();
          if (!text) {
            setWfMsg(`<p class="le-error">${escapeHtml(t("workflows.draftNeedText"))}</p>`);
            return;
          }
          // Sync canvas → YAML before revise so we send the latest graph.
          if (wfViewMode === "diagram" && canvasApi) syncYamlFromCanvas();
          const currentYaml = (yamlEl?.value || "").trim();
          const revise = shouldReviseAiDraft();
          draftAiInFlight = true;
          syncDraftGoLabel();
          if (draftEl) draftEl.readOnly = true;
          setWfMsg(
            `<p class="muted">${escapeHtml(
              revise ? t("workflows.reviseWorking") : t("workflows.draftWorking"),
            )}</p>`,
          );
          try {
            const ans = await rpc("home.draftWorkflow", {
              accountId: aid,
              text,
              hintTools: readyTools.map((r) => r.name).slice(0, 40),
              ...(revise ? { currentYaml } : {}),
            });
            if (ans.error) {
              setWfMsg(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
              return;
            }
            const drafted = ans.result?.yaml;
            if (typeof drafted !== "string" || !drafted) {
              setWfMsg(`<p class="le-error">${escapeHtml(t("workflows.invalid"))}</p>`);
              return;
            }
            if (yamlEl) yamlEl.value = drafted;
            preferFreshAiDraft = false;
            // Keep the description so the user can revise again; remount Diagram always.
            setWfMsg(
              `<p class="muted">${escapeHtml(
                revise ? t("workflows.reviseDone") : t("workflows.draftDone"),
              )}</p>`,
            );
            syncEditorPracticeMode();
            if (!mountOrRefreshCanvas(drafted)) {
              setWfViewMode("yaml");
              return;
            }
            wfViewMode = "diagram";
            if (diagramPane) diagramPane.hidden = false;
            if (yamlPane) yamlPane.hidden = true;
            document.getElementById("wf-mode-diagram")?.classList.toggle("is-active", true);
            document.getElementById("wf-mode-yaml")?.classList.toggle("is-active", false);
          } finally {
            draftAiInFlight = false;
            if (draftEl) draftEl.readOnly = false;
            syncDraftGoLabel();
          }
        };
        document.getElementById("wf-draft-go")?.addEventListener("click", () => {
          void runWorkflowDraft();
        });
        document.getElementById("wf-draft-text")?.addEventListener("keydown", (ev) => {
          if (ev.key !== "Enter" || !(ev.metaKey || ev.ctrlKey)) return;
          ev.preventDefault();
          void runWorkflowDraft();
        });
        yamlEl?.addEventListener("input", () => {
          preferFreshAiDraft = false;
          syncDraftGoLabel();
        });
        document.getElementById("wf-new")?.addEventListener("click", () => {
          openEditor("create", starterYaml() + "\n", "global");
        });
        const mountHowtoDemo = (sampleKey, hostId, yaml) => {
          const host = document.getElementById(hostId);
          if (!host) return;
          const parsed = yamlToGraph(yaml);
          if (!parsed.ok) {
            host.innerHTML = `<p class="le-error">${escapeHtml(parsed.error || t("workflows.invalid"))}</p>`;
            return;
          }
          const prev = wfDemoCanvases.get(sampleKey);
          if (prev) prev.destroy();
          const api = mountWorkflowCanvas(host, {
            graph: parsed.graph,
            readOnly: true,
            labels: {
              readOnlyHint: t("workflows.howtoPreviewHint"),
              zoomLabel: t("workflows.canvasZoom"),
              zoomIn: t("workflows.canvasZoomIn"),
              zoomOut: t("workflows.canvasZoomOut"),
              zoomReset: t("workflows.canvasZoomReset"),
              zoomResetShort: t("workflows.canvasZoomResetShort"),
              runRunning: t("workflows.runBadgeRunning"),
              runOk: t("workflows.runBadgeOk"),
              runFail: t("workflows.runBadgeFail"),
              runPending: t("workflows.runBadgePending"),
            },
          });
          wfDemoCanvases.set(sampleKey, api);
        };
        mountHowtoDemo("complex", "wf-demo-complex", WORKFLOW_HOWTO_COMPLEX);
        mountHowtoDemo("branch", "wf-demo-branch", WORKFLOW_HOWTO_BRANCH);
        mountHowtoDemo("linear", "wf-demo-linear", WORKFLOW_HOWTO_LINEAR);

        const DEMO_SAMPLES = [
          ["complex", WORKFLOW_HOWTO_COMPLEX],
          ["branch", WORKFLOW_HOWTO_BRANCH],
          ["linear", WORKFLOW_HOWTO_LINEAR],
        ];

        /** Show the saved demo_* copy under its sample card (not in the main list). */
        const renderDemoSaved = (sampleKey, w) => {
          const host = document.getElementById(`wf-saved-${sampleKey}`);
          if (!host) return;
          if (!w?.id) {
            host.hidden = true;
            host.innerHTML = "";
            return;
          }
          const acct = w.accountId || aid || "";
          const acctAttr = acct ? ` data-wf-account="${escapeHtml(acct)}"` : "";
          host.hidden = false;
          host.innerHTML = `<div class="wf-demo-saved-row">
            <span class="muted">${escapeHtml(t("workflows.howtoSavedCopy", { id: w.id }))}</span>
            <span class="row wf-howto-actions">
              <button type="button" data-demo-rerun="${escapeHtml(w.id)}"${acctAttr} ${aid ? "" : "disabled"}>${escapeHtml(
                t("workflows.howtoRunAgain"),
              )}</button>
              <button type="button" class="secondary" data-demo-remove="${escapeHtml(w.id)}"${acctAttr}>${escapeHtml(
                t("app.remove"),
              )}</button>
            </span>
          </div>`;
        };
        for (const [key, yaml] of DEMO_SAMPLES) {
          renderDemoSaved(key, demoById.get(yamlWorkflowId(yaml)) || null);
        }

        const showDemoRunPanel = (sampleKey, html) => {
          for (const key of ["complex", "branch", "linear"]) {
            const other = document.getElementById(`wf-run-${key}`);
            if (other && key !== sampleKey) {
              other.hidden = true;
              other.innerHTML = "";
            }
          }
          const panel = document.getElementById(`wf-run-${sampleKey}`);
          if (!panel) return;
          panel.hidden = false;
          panel.innerHTML = html;
          panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        };

        /**
         * Put demo under the profile (always disabled) and attended-run with live highlights.
         * @param {string} yaml
         * @param {string} sampleKey
         * @param {{ canvas?: { beginRun: () => void, clearRun: () => void, setNodeRunState: (id: string, s: string) => void } | null }} [opts]
         */
        const testDemoWorkflow = async (yaml, sampleKey, opts = {}) => {
          if (!aid) {
            showDemoRunPanel(
              sampleKey,
              `<p class="le-error">${escapeHtml(t("profile.pick"))}</p>`,
            );
            return;
          }
          const canvas = opts.canvas || wfDemoCanvases.get(sampleKey);
          canvas?.beginRun();
          const parsedId = yamlToGraph(yaml);
          const workflowId = parsedId.ok ? parsedId.graph.id : "";
          wfDemoLive = { sampleKey, workflowId };
          showDemoRunPanel(
            sampleKey,
            `<p class="wf-demo-run-status">${escapeHtml(t("workflows.howtoTestWorking"))}</p>
             <ul class="wf-demo-run-log"></ul>`,
          );
          /** Demos are practice-only — never persist enabled:true for keyword matching. */
          let yamlToPut = yaml.trim().replace(/\s*$/, "\n");
          if (isDemoWorkflowId(yamlWorkflowId(yamlToPut))) {
            if (/^enabled:\s*/m.test(yamlToPut)) {
              yamlToPut = yamlToPut.replace(/^enabled:\s*.*$/m, "enabled: false");
            } else {
              yamlToPut = yamlToPut.replace(/^(id:\s*\S+[^\n]*\n)/, "$1enabled: false\n");
            }
          }
          const put = await rpc("home.putWorkflow", { yaml: yamlToPut, accountId: aid });
          if (put.error) {
            canvas?.clearRun();
            wfDemoLive = null;
            showDemoRunPanel(
              sampleKey,
              `<p class="le-error">${escapeHtml(errMsg(put))}</p>`,
            );
            return;
          }
          const id = put.result?.id || workflowId;
          if (!id) {
            canvas?.clearRun();
            wfDemoLive = null;
            showDemoRunPanel(
              sampleKey,
              `<p class="le-error">${escapeHtml(t("workflows.invalid"))}</p>`,
            );
            return;
          }
          renderDemoSaved(sampleKey, {
            id,
            enabled: false,
            accountId: aid,
            source: "account",
          });
          demoById.set(id, { id, enabled: false, accountId: aid, source: "account" });
          wfDemoLive.workflowId = id;
          const statusEl = document.querySelector(`#wf-run-${sampleKey} .wf-demo-run-status`);
          if (statusEl) statusEl.textContent = t("workflows.howtoRunRunning", { id });

          const run = await rpc("home.runWorkflow", {
            accountId: aid,
            id,
            text: t("workflows.howtoTestInput"),
          });
          if (run.result?.runId) wfDemoLive.runId = run.result.runId;

          if (run.error) {
            wfDemoLive = null;
            showDemoRunPanel(
              sampleKey,
              `<p class="le-error">${escapeHtml(errMsg(run))}</p>
               <p class="muted">${escapeHtml(t("workflows.howtoTestSaved", { id }))}</p>`,
            );
            return;
          }
          const ok = run.result?.ok !== false;
          const results = Array.isArray(run.result?.results) ? run.result.results : [];
          // Ensure final node colors even if WS events were missed.
          for (const r of results) {
            if (r?.nodeId) canvas?.setNodeRunState(r.nodeId, r.ok === false ? "fail" : "ok");
          }
          const lines = results
            .map((r) => {
              const status = r.ok ? "ok" : "fail";
              const detail = r.detail || r.output || "";
              return `<li class="${r.ok ? "is-ok" : "is-fail"}"><code>${escapeHtml(r.nodeId || "")}</code> · ${escapeHtml(status)}${detail ? ` — ${escapeHtml(String(detail).slice(0, 160))}` : ""}</li>`;
            })
            .join("");
          const logSnap = document.querySelector(`#wf-run-${sampleKey} .wf-demo-run-log`);
          const liveLog = logSnap ? logSnap.innerHTML : "";
          showDemoRunPanel(
            sampleKey,
            `<p class="wf-demo-run-status ${ok ? "is-ok" : "is-fail"}">${escapeHtml(
              ok ? t("workflows.howtoTestOk", { id }) : t("workflows.howtoTestFail", { id }),
            )}</p>
            <p class="muted">${escapeHtml(t("workflows.howtoTestSaved", { id }))}</p>
            <p class="muted wf-demo-run-sub">${escapeHtml(t("workflows.howtoRunResults"))}</p>
            <ul class="wf-demo-run-log wf-test-results">${lines || liveLog}</ul>`,
          );
          wfDemoLive = null;
        };

        document.getElementById("wf-try-complex")?.addEventListener("click", () => {
          openEditor("create", WORKFLOW_HOWTO_COMPLEX.trim() + "\n", "account", { practiceDemo: true });
          setWfMsg(`<p class="muted">${escapeHtml(t("workflows.howtoLoadedComplex"))}</p>`);
        });
        document.getElementById("wf-try-branch")?.addEventListener("click", () => {
          openEditor("create", WORKFLOW_HOWTO_BRANCH.trim() + "\n", "account", { practiceDemo: true });
          setWfMsg(`<p class="muted">${escapeHtml(t("workflows.howtoLoaded"))}</p>`);
        });
        document.getElementById("wf-try-linear")?.addEventListener("click", () => {
          openEditor("create", WORKFLOW_HOWTO_LINEAR.trim() + "\n", "account", { practiceDemo: true });
          setWfMsg(`<p class="muted">${escapeHtml(t("workflows.howtoLoaded"))}</p>`);
        });
        document.getElementById("wf-test-complex")?.addEventListener("click", () => {
          testDemoWorkflow(WORKFLOW_HOWTO_COMPLEX, "complex");
        });
        document.getElementById("wf-test-branch")?.addEventListener("click", () => {
          testDemoWorkflow(WORKFLOW_HOWTO_BRANCH, "branch");
        });
        document.getElementById("wf-test-linear")?.addEventListener("click", () => {
          testDemoWorkflow(WORKFLOW_HOWTO_LINEAR, "linear");
        });

        const sampleKeyForDemoId = (id) => {
          for (const [key, yaml] of DEMO_SAMPLES) {
            if (yamlWorkflowId(yaml) === id) return key;
          }
          return null;
        };
        document.querySelector(".wf-howto")?.addEventListener("click", async (ev) => {
          const btn =
            ev.target instanceof Element
              ? ev.target.closest("button[data-demo-rerun], button[data-demo-remove]")
              : null;
          if (!(btn instanceof HTMLButtonElement)) return;
          const acct = wfAccountParam(btn);
          const rerunId = btn.getAttribute("data-demo-rerun");
          const removeId = btn.getAttribute("data-demo-remove");
          if (rerunId) {
            const pair = DEMO_SAMPLES.find(([, yaml]) => yamlWorkflowId(yaml) === rerunId);
            if (pair) await testDemoWorkflow(pair[1], pair[0]);
            return;
          }
          if (removeId) {
            const ans = await rpc("home.removeWorkflow", { id: removeId, ...acct });
            if (ans.error) {
              setBanner(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
              return;
            }
            demoById.delete(removeId);
            const key = sampleKeyForDemoId(removeId);
            if (key) renderDemoSaved(key, null);
          }
        });

        yamlEl?.addEventListener("input", () => syncEditorPracticeMode());

        document.getElementById("wf-cancel")?.addEventListener("click", () => {
          closeEditor();
        });
        document.getElementById("wf-editor-close")?.addEventListener("click", () => {
          closeEditor();
        });
        editor?.addEventListener("click", (ev) => {
          if (ev.target === editor) closeEditor();
        });
        document.getElementById("reload-wf")?.addEventListener("click", async () => {
          const ans = await rpc("home.reloadWorkflows", {});
          if (ans.error) {
            setBanner(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
            return;
          }
          await showView("automation");
        });
        document.getElementById("wf-validate")?.addEventListener("click", async () => {
          if (wfViewMode === "diagram") syncYamlFromCanvas();
          const yaml = yamlEl?.value || "";
          const ans = await rpc("home.validateWorkflow", { yaml });
          if (ans.error) {
            setWfMsg(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
            return;
          }
          if (ans.result?.ok) {
            setWfMsg(`<p class="muted">${escapeHtml(t("workflows.valid"))}: <code>${escapeHtml(ans.result.id || "")}</code></p>`);
          } else {
            setWfMsg(`<p class="le-error">${escapeHtml(ans.result?.error || t("workflows.invalid"))}</p>`);
          }
        });
        document.getElementById("wf-editor-try")?.addEventListener("click", async () => {
          if (wfViewMode === "diagram") syncYamlFromCanvas();
          const yaml = yamlEl?.value || "";
          const id = yamlWorkflowId(yaml);
          if (!isDemoWorkflowId(id)) {
            syncEditorPracticeMode();
            return;
          }
          const sampleKey = sampleKeyForDemoId(id) || "complex";
          await testDemoWorkflow(yaml, sampleKey, { canvas: canvasApi });
          setWfMsg(`<p class="muted">${escapeHtml(t("workflows.demoPracticeTried"))}</p>`);
        });
        document.getElementById("wf-save")?.addEventListener("click", async () => {
          if (wfViewMode === "diagram") syncYamlFromCanvas();
          const yaml = yamlEl?.value || "";
          const id = yamlWorkflowId(yaml);
          if (isDemoWorkflowId(id)) {
            setWfMsg(`<p class="le-error">${escapeHtml(t("workflows.demoNoSave"))}</p>`);
            syncEditorPracticeMode();
            return;
          }
          const scope = scopeEl?.value;
          const params =
            scope === "account" && aid
              ? { yaml, accountId: aid }
              : { yaml };
          const ans = await rpc("home.putWorkflow", params);
          if (ans.error) {
            setWfMsg(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
            return;
          }
          await showView("automation");
        });
        el.querySelectorAll("[data-wf-edit]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-wf-edit");
            const acct = wfAccountParam(btn);
            const ans = await rpc("home.getWorkflow", { id, ...acct });
            if (ans.error) {
              setBanner(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
              return;
            }
            openEditor(
              "edit",
              ans.result?.yaml || "",
              acct.accountId ? "account" : "global",
            );
            if (titleEl && id) {
              titleEl.textContent = `${t("workflows.editTitle")}: ${id}`;
            }
          });
        });
        el.querySelectorAll("[data-wf-toggle]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-wf-toggle");
            const enabled = btn.getAttribute("data-en") === "1";
            const ans = await rpc("home.setWorkflowEnabled", {
              id,
              enabled,
              ...wfAccountParam(btn),
            });
            if (ans.error) {
              setBanner(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
              return;
            }
            await showView("automation");
          });
        });
        el.querySelectorAll("[data-wf-run]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!aid) {
              setBanner(`<p class="le-error">${escapeHtml(t("profile.pick"))}</p>`);
              return;
            }
            const id = btn.getAttribute("data-wf-run");
            const ans = await rpc("home.runWorkflow", { accountId: aid, id });
            if (ans.error) {
              setBanner(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
              return;
            }
            setBanner(
              `<p class="muted">${escapeHtml(t("workflows.runOnce"))}: <code>${escapeHtml(id || "")}</code></p>${pre(ans)}`,
            );
          });
        });
        el.querySelectorAll("[data-wf-remove]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-wf-remove");
            const ans = await rpc("home.removeWorkflow", {
              id,
              ...wfAccountParam(btn),
            });
            if (ans.error) {
              setBanner(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
              return;
            }
            await showView("automation");
          });
        });
        return;
      }

      if (automationTab === "jobs") {
        if (!aid) {
          el.innerHTML = shell(`<p>${escapeHtml(t("profile.pick"))}</p>`);
          wireTabs();
          return;
        }
        const [listed, wfBody, toolsBody, sourcesBody] = await Promise.all([
          rpc("home.listSchedules", { accountId: aid }),
          rpc("home.listWorkflows", { accountId: aid }),
          rpc("home.listWorkflowTools", { accountId: aid }),
          rpc("home.listSources", {}),
        ]);
        if (listed.error) {
          el.innerHTML = shell(
            `<p class="le-error">${escapeHtml(errMsg(listed))}</p>`,
          );
          wireTabs();
          return;
        }
        /** @type {Array<{ id: string, name: string, enabled: boolean, kind: string, source: string, payloadKind?: string, message?: string, workflowId?: string, toolName?: string, nextRunAt?: string, lastStatus?: string }>} */
        const jobs = (listed.result?.jobs || []).filter((j) => j.payloadKind !== "system");
        const workflows = (wfBody.result?.workflows || []).filter((w) => !isDemoWorkflowId(w.id));
        const readyTools = (toolsBody.result?.tools || []).filter((r) => r.available !== false);
        // Household: any bound device is usable by any profile (Design 2026-10-16l).
        const boundObjects = (sourcesBody.result?.sources || []).filter(
          (s) => s.bound && s.accountId,
        );
        const objectIdOptions = boundObjects
          .map((s) => {
            const oid = `${s.channel}:${s.sourceId}`;
            const label = s.displayName ? `${s.displayName} (${oid})` : oid;
            return `<option value="${escapeHtml(oid)}">${escapeHtml(label)}</option>`;
          })
          .join("");
        const payloadLabel = (kind) => {
          if (kind === "workflow") return t("jobs.payloadWorkflow");
          if (kind === "tool") return t("jobs.payloadTool");
          return t("jobs.payloadNotify");
        };
        const formatNext = (iso) => {
          if (!iso) return "—";
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return iso;
          try {
            return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
          } catch {
            return iso;
          }
        };
        const wfOptions = workflows
          .map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.id)}</option>`)
          .join("");
        /** @type {Map<string, (typeof readyTools)[number]>} */
        const toolByName = new Map(readyTools.map((r) => [r.name, r]));
        const toolOptions = readyTools
          .map(
            (r) =>
              `<option value="${escapeHtml(r.name)}" title="${escapeHtml(r.summary || "")}">${escapeHtml(r.name)}</option>`,
          )
          .join("");
        const rows = jobs
          .map((j) => {
            const synced = j.source === "workflow";
            const title =
              j.name ||
              j.message ||
              j.workflowId ||
              j.toolName ||
              j.id;
            const badge = synced
              ? `<span class="job-badge" title="${escapeHtml(t("jobs.syncedHint"))}">${escapeHtml(t("jobs.badgeWorkflow"))}</span>`
              : "";
            const status =
              j.lastStatus === "ok"
                ? `<span class="status-pill ok">${escapeHtml(t("jobs.statusOk"))}</span>`
                : j.lastStatus === "error"
                  ? `<span class="status-pill warn">${escapeHtml(t("jobs.statusError"))}</span>`
                  : j.lastStatus === "skipped"
                    ? `<span class="status-pill">${escapeHtml(t("jobs.statusSkipped"))}</span>`
                    : "";
            const removeBtn = synced
              ? ""
              : `<button type="button" class="secondary" data-act="remove">${escapeHtml(t("app.remove"))}</button>`;
            return `<li class="job-row" data-id="${escapeHtml(j.id)}" data-source="${escapeHtml(j.source || "user")}">
              <div class="job-row-main">
                <strong>${escapeHtml(title)} ${badge}</strong>
                <span class="muted job-row-meta">${escapeHtml(j.kind || "")} · ${escapeHtml(payloadLabel(j.payloadKind || "notify"))}${
                  j.workflowId ? ` · <code>${escapeHtml(j.workflowId)}</code>` : ""
                }${j.toolName ? ` · <code>${escapeHtml(j.toolName)}</code>` : ""} · ${escapeHtml(t("jobs.next"))}: ${escapeHtml(formatNext(j.nextRunAt))} ${status}</span>
                ${synced ? `<span class="muted job-synced-hint">${escapeHtml(t("jobs.syncedHint"))}</span>` : ""}
              </div>
              <span class="row job-row-actions">
                <button type="button" data-act="toggle" data-en="${j.enabled ? "0" : "1"}">${escapeHtml(j.enabled ? t("app.disable") : t("app.enable"))}</button>
                <button type="button" data-act="run">${escapeHtml(t("app.run"))}</button>
                ${removeBtn}
              </span>
            </li>`;
          })
          .join("");
        el.innerHTML = shell(`
          <p class="muted job-list-hint">${escapeHtml(t("jobs.hint"))}</p>
          <div id="job-banner" class="le-section-msg"></div>
          <div class="card job-create">
            <h3>${escapeHtml(t("jobs.createTitle"))}</h3>
            <div class="job-mode-toggle" role="tablist" aria-label="${escapeHtml(t("jobs.modeLabel"))}">
              <button type="button" class="secondary is-active" data-job-mode="notify">${escapeHtml(t("jobs.modeReminder"))}</button>
              <button type="button" class="secondary" data-job-mode="workflow">${escapeHtml(t("jobs.modeWorkflow"))}</button>
              <button type="button" class="secondary" data-job-mode="tool">${escapeHtml(t("jobs.modeTool"))}</button>
            </div>
            <label class="job-when-label">${escapeHtml(t("jobs.when"))}
              <span class="job-when-row">
                <input id="job-when-text" type="text" required placeholder="${escapeHtml(t("jobs.whenPlaceholder"))}" />
                <button type="button" class="secondary" id="job-preview">${escapeHtml(t("jobs.preview"))}</button>
              </span>
            </label>
            <p class="muted job-resolved" id="job-resolved" hidden></p>
            <div class="job-mode-pane" data-job-pane="notify">
              <label>${escapeHtml(t("jobs.message"))}
                <input id="job-message" type="text" placeholder="${escapeHtml(t("jobs.messagePlaceholder"))}" />
              </label>
            </div>
            <div class="job-mode-pane" data-job-pane="workflow" hidden>
              <label>${escapeHtml(t("jobs.pickWorkflow"))}
                <select id="job-workflow-id">
                  <option value="">${escapeHtml(t("jobs.pickWorkflowPlaceholder"))}</option>
                  ${wfOptions}
                </select>
              </label>
              ${
                workflows.length
                  ? ""
                  : `<p class="muted">${escapeHtml(t("jobs.noWorkflows"))}</p>`
              }
            </div>
            <div class="job-mode-pane" data-job-pane="tool" hidden>
              <label>${escapeHtml(t("jobs.pickTool"))}
                <select id="job-tool-name">
                  <option value="">${escapeHtml(t("jobs.pickToolPlaceholder"))}</option>
                  ${toolOptions}
                </select>
              </label>
              <p class="muted job-tool-summary" id="job-tool-summary" hidden></p>
              <div class="job-tool-args" id="job-tool-args" hidden></div>
              ${
                readyTools.length
                  ? ""
                  : `<p class="muted">${escapeHtml(t("jobs.noTools"))}</p>`
              }
            </div>
            <div class="row job-create-actions">
              <button type="button" id="job-create">${escapeHtml(t("jobs.createAction"))}</button>
            </div>
          </div>
          <ul class="job-list" id="job-list">${rows || `<li class="muted">${escapeHtml(t("jobs.none"))}</li>`}</ul>`);
        wireTabs();

        /** @type {{ proposalId: string, whenText: string, resolvedLocal: string, kind: string, message?: string } | null} */
        let previewProposal = null;
        /** @type {"notify" | "workflow" | "tool"} */
        let jobMode = "notify";
        const setJobBanner = (html) => {
          const box = document.getElementById("job-banner");
          if (box) box.innerHTML = html || "";
        };
        const setMode = (mode) => {
          jobMode = mode;
          el.querySelectorAll("[data-job-mode]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.getAttribute("data-job-mode") === mode);
          });
          el.querySelectorAll("[data-job-pane]").forEach((pane) => {
            const show = pane.getAttribute("data-job-pane") === mode;
            if (show) pane.removeAttribute("hidden");
            else pane.setAttribute("hidden", "");
          });
        };
        el.querySelectorAll("[data-job-mode]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const mode = btn.getAttribute("data-job-mode");
            if (mode === "notify" || mode === "workflow" || mode === "tool") setMode(mode);
          });
        });
        const argFieldLabel = (key) => {
          const k = `jobs.arg.${key}`;
          const labeled = t(k);
          return labeled === k ? key : labeled;
        };
        const argFieldHint = (key) => {
          const k = `jobs.argHint.${key}`;
          const hint = t(k);
          return hint === k ? "" : hint;
        };
        const domainFromObjectId = (objectId) => {
          // homeassistant:light.living_room → light
          const colon = objectId.indexOf(":");
          const entity = colon >= 0 ? objectId.slice(colon + 1) : objectId;
          const dot = entity.indexOf(".");
          if (dot <= 0) return "";
          return entity.slice(0, dot);
        };
        const optionsHtml = (values, selected, placeholder) => {
          const opts = [
            `<option value="">${escapeHtml(placeholder)}</option>`,
            ...values.map(
              (v) =>
                `<option value="${escapeHtml(v)}"${v === selected ? " selected" : ""}>${escapeHtml(v)}</option>`,
            ),
          ];
          if (selected && !values.includes(selected)) {
            opts.push(
              `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`,
            );
          }
          return opts.join("");
        };
        const pickPlaceholder = (key) => {
          if (key === "objectId") return t("jobs.argPickObject");
          if (key === "domain") return t("jobs.argPickDomain");
          if (key === "service") return t("jobs.argPickService");
          return t("jobs.argPickValue");
        };
        /**
         * Known multi-value args → dropdown. Sources (in order):
         * bound objects for objectId; catalogue argChoiceGroups[parent]; catalogue argChoices.
         * @param {any} row
         * @param {string} key
         * @param {Record<string, string>} parentValues
         * @returns {string[] | null}
         */
        const knownChoicesForArg = (row, key, parentValues) => {
          if (key === "objectId") {
            const ids = boundObjects.map((s) => `${s.channel}:${s.sourceId}`);
            return ids.length ? ids : null;
          }
          const dependsOn =
            (row.argChoiceDependsOn && row.argChoiceDependsOn[key]) ||
            (row.argChoiceGroups && row.argChoiceGroups[key] ? "domain" : undefined);
          const groups = row.argChoiceGroups && row.argChoiceGroups[key];
          if (groups && typeof groups === "object") {
            const parentKey = dependsOn || "domain";
            const parentVal = parentValues[parentKey] || "";
            if (parentVal && Array.isArray(groups[parentVal]) && groups[parentVal].length) {
              return groups[parentVal].map(String);
            }
            const flat = [...new Set(Object.values(groups).flatMap((v) => (Array.isArray(v) ? v : [])))].map(
              String,
            );
            return flat.length ? flat : null;
          }
          const choices = row.argChoices && row.argChoices[key];
          if (Array.isArray(choices) && choices.length > 0) return choices.map(String);
          return null;
        };
        const refillDependentSelects = (row) => {
          const argsHost = document.getElementById("job-tool-args");
          if (!argsHost || !row) return;
          /** @type {Record<string, string>} */
          const parents = {};
          argsHost.querySelectorAll("[data-job-arg]").forEach((el) => {
            const k = el.getAttribute("data-job-arg");
            if (!k) return;
            if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) {
              parents[k] = String(el.value || "").trim();
            }
          });
          argsHost.querySelectorAll("select[data-job-arg][data-job-depends]").forEach((el) => {
            if (!(el instanceof HTMLSelectElement)) return;
            const key = el.getAttribute("data-job-arg") || "";
            const list = knownChoicesForArg(row, key, parents) || [];
            const prev = el.value;
            el.innerHTML = optionsHtml(list, list.includes(prev) ? prev : list[0] || "", pickPlaceholder(key));
          });
        };
        const wireArgChoiceSync = (row) => {
          const argsHost = document.getElementById("job-tool-args");
          if (!argsHost || !row) return;
          const objEl = argsHost.querySelector('[data-job-arg="objectId"]');
          const domainEl = /** @type {HTMLSelectElement | null} */ (
            argsHost.querySelector('[data-job-arg="domain"]')
          );
          const syncDomainFromObject = () => {
            if (!domainEl) return;
            const oid =
              objEl instanceof HTMLSelectElement || objEl instanceof HTMLInputElement
                ? String(objEl.value || "").trim()
                : "";
            if (!oid) return;
            const inferred = domainFromObjectId(oid);
            if (!inferred) return;
            if (![...domainEl.options].some((o) => o.value === inferred)) {
              domainEl.appendChild(new Option(inferred, inferred, true, true));
            } else {
              domainEl.value = inferred;
            }
            refillDependentSelects(row);
          };
          objEl?.addEventListener("change", syncDomainFromObject);
          argsHost.querySelectorAll("select[data-job-arg]").forEach((el) => {
            el.addEventListener("change", () => refillDependentSelects(row));
          });
        };
        const renderToolArgsForm = (toolName) => {
          const summaryEl = document.getElementById("job-tool-summary");
          const argsHost = document.getElementById("job-tool-args");
          if (!summaryEl || !argsHost) return;
          const row = toolName ? toolByName.get(toolName) : undefined;
          if (!row) {
            summaryEl.hidden = true;
            summaryEl.textContent = "";
            argsHost.hidden = true;
            argsHost.innerHTML = "";
            return;
          }
          summaryEl.hidden = false;
          summaryEl.textContent = row.summary || "";
          const sample =
            row.sampleArgs && typeof row.sampleArgs === "object" && !Array.isArray(row.sampleArgs)
              ? row.sampleArgs
              : {};
          const keys = Object.keys(sample);
          if (!keys.length) {
            argsHost.hidden = false;
            argsHost.innerHTML = `<p class="muted job-tool-args-empty">${escapeHtml(t("jobs.toolArgsNone"))}</p>`;
            return;
          }
          const n = keys.length;
          const countHint =
            n > 1
              ? t("jobs.toolArgsMulti", { count: String(n) })
              : t("jobs.toolArgsHint");
          /** @type {Record<string, string>} */
          const parentSeed = {};
          for (const [k, v] of Object.entries(sample)) {
            if (typeof v === "string") parentSeed[k] = v;
          }
          argsHost.hidden = false;
          argsHost.innerHTML = `<p class="muted job-tool-args-hint">${escapeHtml(countHint)}</p>${keys
            .map((key, idx) => {
              const sampleVal = sample[key];
              const asText =
                sampleVal === null || sampleVal === undefined
                  ? ""
                  : typeof sampleVal === "string"
                    ? sampleVal
                    : JSON.stringify(sampleVal);
              const hint = argFieldHint(key);
              const hintHtml = hint
                ? `<p class="muted job-tool-arg-hint">${escapeHtml(hint)}</p>`
                : "";
              const step =
                n > 1
                  ? `<span class="job-tool-arg-step">${escapeHtml(t("jobs.argStep", { n: String(idx + 1), total: String(n) }))}</span>`
                  : "";
              const choices = knownChoicesForArg(row, key, parentSeed);
              const dependsOn =
                (row.argChoiceDependsOn && row.argChoiceDependsOn[key]) ||
                (row.argChoiceGroups && row.argChoiceGroups[key] ? "domain" : "");
              let control;
              if (choices && choices.length) {
                const selected = choices.includes(asText) ? asText : choices[0] || "";
                const depAttr = dependsOn ? ` data-job-depends="${escapeHtml(dependsOn)}"` : "";
                if (key === "objectId") {
                  control = `<select data-job-arg="${escapeHtml(key)}"${depAttr}>
                      <option value="">${escapeHtml(t("jobs.argPickObject"))}</option>
                      ${objectIdOptions}
                    </select>`;
                } else {
                  control = `<select data-job-arg="${escapeHtml(key)}"${depAttr}>${optionsHtml(choices, selected, pickPlaceholder(key))}</select>`;
                }
              } else if (key === "objectId") {
                control = `<input data-job-arg="${escapeHtml(key)}" type="text" value="" placeholder="${escapeHtml(asText || "homeassistant:light.living_room")}" />
                  <p class="muted job-tool-arg-hint">${escapeHtml(t("jobs.argNoBoundObjects"))}</p>`;
              } else {
                const isMultiline =
                  typeof sampleVal === "string" && (sampleVal.includes("\n") || asText.length > 80);
                control = isMultiline
                  ? `<textarea data-job-arg="${escapeHtml(key)}" rows="3" spellcheck="false" placeholder="${escapeHtml(asText)}">${escapeHtml(asText)}</textarea>`
                  : `<input data-job-arg="${escapeHtml(key)}" type="text" value="${escapeHtml(asText)}" placeholder="${escapeHtml(asText)}" />`;
              }
              return `<div class="job-tool-arg-field">
                <div class="job-tool-arg-head">${step}<span class="job-tool-arg-label">${escapeHtml(argFieldLabel(key))}</span></div>
                ${hintHtml}
                ${control}
              </div>`;
            })
            .join("")}`;
          wireArgChoiceSync(row);
        };
        const readToolArgsFromForm = () => {
          const argsHost = document.getElementById("job-tool-args");
          /** @type {Record<string, unknown>} */
          const out = {};
          if (!argsHost) return out;
          argsHost.querySelectorAll("[data-job-arg]").forEach((el) => {
            const key = el.getAttribute("data-job-arg");
            if (!key) return;
            const raw =
              el instanceof HTMLTextAreaElement ||
              el instanceof HTMLInputElement ||
              el instanceof HTMLSelectElement
                ? String(el.value || "").trim()
                : "";
            if (!raw) return;
            // Keep numbers/bools/objects if the sample was JSON; otherwise plain string.
            if (
              (raw.startsWith("{") && raw.endsWith("}")) ||
              (raw.startsWith("[") && raw.endsWith("]")) ||
              raw === "true" ||
              raw === "false" ||
              /^-?\d+(\.\d+)?$/.test(raw)
            ) {
              try {
                out[key] = JSON.parse(raw);
                return;
              } catch {
                /* fall through as string */
              }
            }
            out[key] = raw;
          });
          return out;
        };
        document.getElementById("job-tool-name")?.addEventListener("change", (ev) => {
          const sel = /** @type {HTMLSelectElement} */ (ev.currentTarget);
          renderToolArgsForm(sel.value);
        });
        const readWhenText = () =>
          String(
            /** @type {HTMLInputElement | null} */ (document.getElementById("job-when-text"))?.value || "",
          ).trim();
        const showPreview = (p) => {
          const line = document.getElementById("job-resolved");
          if (!line) return;
          line.hidden = false;
          line.textContent = t("jobs.resolvedLine", {
            when: p.resolvedLocal || "",
            kind: p.kind || "",
          });
          const msgEl = /** @type {HTMLInputElement | null} */ (document.getElementById("job-message"));
          if (msgEl && p.message && !msgEl.value.trim()) msgEl.value = p.message;
        };
        const clearPreviewIfStale = () => {
          const whenText = readWhenText();
          if (previewProposal && previewProposal.whenText !== whenText) {
            previewProposal = null;
            const line = document.getElementById("job-resolved");
            if (line) {
              line.hidden = true;
              line.textContent = "";
            }
          }
        };
        document.getElementById("job-when-text")?.addEventListener("input", clearPreviewIfStale);
        document.getElementById("job-preview")?.addEventListener("click", async () => {
          const whenText = readWhenText();
          if (!whenText) {
            setJobBanner(`<p class="le-error">${escapeHtml(t("jobs.whenRequired"))}</p>`);
            return;
          }
          setJobBanner(`<p class="muted">${escapeHtml(t("jobs.previewing"))}</p>`);
          const proposed = await rpc("home.proposeSchedule", { accountId: aid, text: whenText });
          if (proposed.error) {
            previewProposal = null;
            setJobBanner(`<p class="le-error">${escapeHtml(errMsg(proposed))}</p>`);
            return;
          }
          const p = proposed.result || {};
          previewProposal = {
            proposalId: String(p.proposalId || ""),
            whenText,
            resolvedLocal: String(p.resolvedLocal || ""),
            kind: String(p.kind || ""),
            ...(p.message ? { message: String(p.message) } : {}),
          };
          showPreview(previewProposal);
          setJobBanner(`<p class="muted">${escapeHtml(t("jobs.previewOk"))}</p>`);
        });
        document.getElementById("job-create")?.addEventListener("click", async () => {
          const whenText = readWhenText();
          if (!whenText) {
            setJobBanner(`<p class="le-error">${escapeHtml(t("jobs.whenRequired"))}</p>`);
            return;
          }
          /** @type {Record<string, unknown>} */
          let payload;
          let name;
          if (jobMode === "notify") {
            const message = String(
              /** @type {HTMLInputElement | null} */ (document.getElementById("job-message"))?.value || "",
            ).trim();
            payload = { kind: "notify", ...(message ? { message } : {}) };
            name = message.slice(0, 80);
          } else if (jobMode === "workflow") {
            const workflowId = String(
              /** @type {HTMLSelectElement | null} */ (document.getElementById("job-workflow-id"))
                ?.value || "",
            ).trim();
            if (!workflowId) {
              setJobBanner(`<p class="le-error">${escapeHtml(t("jobs.workflowRequired"))}</p>`);
              return;
            }
            payload = { kind: "workflow", workflowId, message: workflowId };
            name = workflowId;
          } else {
            const toolName = String(
              /** @type {HTMLSelectElement | null} */ (document.getElementById("job-tool-name"))
                ?.value || "",
            ).trim();
            if (!toolName) {
              setJobBanner(`<p class="le-error">${escapeHtml(t("jobs.toolRequired"))}</p>`);
              return;
            }
            const toolArgs = readToolArgsFromForm();
            payload = {
              kind: "tool",
              toolName,
              ...(Object.keys(toolArgs).length ? { toolArgs } : {}),
            };
            name = toolName;
          }
          setJobBanner(`<p class="muted">${escapeHtml(t("jobs.creating"))}</p>`);
          let proposalId =
            previewProposal && previewProposal.whenText === whenText
              ? previewProposal.proposalId
              : "";
          let proposedMessage =
            previewProposal && previewProposal.whenText === whenText
              ? previewProposal.message
              : undefined;
          if (!proposalId) {
            const proposed = await rpc("home.proposeSchedule", { accountId: aid, text: whenText });
            if (proposed.error) {
              setJobBanner(`<p class="le-error">${escapeHtml(errMsg(proposed))}</p>`);
              return;
            }
            const p = proposed.result || {};
            proposalId = String(p.proposalId || "");
            if (typeof p.message === "string") proposedMessage = p.message;
            if (proposalId) {
              previewProposal = {
                proposalId,
                whenText,
                resolvedLocal: String(p.resolvedLocal || ""),
                kind: String(p.kind || ""),
                ...(proposedMessage ? { message: proposedMessage } : {}),
              };
              showPreview(previewProposal);
            }
          }
          if (!proposalId) {
            setJobBanner(`<p class="le-error">${escapeHtml(t("jobs.whenRequired"))}</p>`);
            return;
          }
          if (jobMode === "notify") {
            const message =
              (typeof payload.message === "string" && payload.message) ||
              (typeof proposedMessage === "string" ? proposedMessage : "") ||
              "";
            if (!message.trim()) {
              setJobBanner(`<p class="le-error">${escapeHtml(t("jobs.messageRequired"))}</p>`);
              return;
            }
            payload = { kind: "notify", message: message.trim() };
            name = message.trim().slice(0, 80);
          }
          const ans = await rpc("home.confirmSchedule", {
            accountId: aid,
            proposalId,
            name,
            payload,
          });
          if (ans.error) {
            // Proposal may have been consumed or expired — clear so Create can re-propose.
            previewProposal = null;
            setJobBanner(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
            return;
          }
          automationTab = "jobs";
          await showView("automation");
        });
        el.querySelectorAll(".job-row button[data-act]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const row = btn.closest(".job-row");
            const jobId = row?.getAttribute("data-id");
            if (!jobId) return;
            const act = btn.getAttribute("data-act");
            let ans;
            if (act === "toggle") {
              const enabled = btn.getAttribute("data-en") === "1";
              ans = await rpc("home.updateSchedule", { accountId: aid, jobId, enabled });
            } else if (act === "run") {
              ans = await rpc("home.runSchedule", { accountId: aid, jobId });
            } else if (act === "remove") {
              if (!window.confirm(t("jobs.confirmRemove"))) return;
              ans = await rpc("home.removeSchedule", { accountId: aid, jobId });
            } else {
              return;
            }
            if (ans.error) {
              setJobBanner(`<p class="le-error">${escapeHtml(errMsg(ans))}</p>`);
              return;
            }
            if (act === "run") {
              const receipt = ans.result?.receipt;
              const line = receipt
                ? `${receipt.execStatus}${receipt.deliveryStatus ? ` · ${receipt.deliveryStatus}` : ""}`
                : t("jobs.runOk");
              setJobBanner(`<p class="muted">${escapeHtml(line)}</p>`);
            }
            automationTab = "jobs";
            await showView("automation");
          });
        });
        return;
      }
    }

    if (id === "system") {
      const tab = (tabId, labelKey) =>
        `<button type="button" role="tab" class="page-tab${systemTab === tabId ? " active" : ""}" data-system-tab="${tabId}" aria-selected="${
          systemTab === tabId ? "true" : "false"
        }">${escapeHtml(t(labelKey))}</button>`;
      const tabsHtml = `<div class="page-tabs" role="tablist">
        ${tab("files", "nav.artifacts")}
        ${tab("health", "nav.doctor")}
        ${tab("machine", "nav.advanced")}
      </div>`;
      const shell = (panel) =>
        `<h2>${escapeHtml(t("nav.system"))}</h2>${tabsHtml}<div class="page-tab-panel">${panel}</div>`;
      const wireTabs = () => {
        el.querySelectorAll("[data-system-tab]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const next = btn.getAttribute("data-system-tab");
            if (next !== "files" && next !== "health" && next !== "machine") return;
            if (next === systemTab) return;
            systemTab = next;
            await showView("system");
          });
        });
      };

      if (systemTab === "files") {
        if (!aid) {
          el.innerHTML = shell(`<p>${escapeHtml(t("profile.pick"))}</p>`);
          wireTabs();
          return;
        }
        const body = await rpc("home.listArtifacts", { accountId: aid });
        if (body.error) {
          el.innerHTML = shell(
            `<p class="muted">${escapeHtml(t("artifacts.hint"))}</p><p class="le-error">${escapeHtml(errMsg(body) || t("artifacts.loadFailed"))}</p>`,
          );
          wireTabs();
          return;
        }
        const arts = body.result?.artifacts || [];
        const formatWhen = (iso) => {
          if (!iso) return "";
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19).replace("T", " ");
          return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        };
        const fileLabel = (path) => {
          const p = String(path || "");
          const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
          return slash >= 0 ? p.slice(slash + 1) : p || t("artifacts.unnamed");
        };
        const rows = arts.length
          ? `<ul class="sys-list" id="art-list">${arts
              .map(
                (a) => `<li class="sys-row">
                  <div class="sys-row-main">
                    <span class="sys-row-title">${escapeHtml(fileLabel(a.path || a.id))}</span>
                    <span class="sys-row-meta muted">${escapeHtml(a.path || a.id || "")}${
                      a.createdAt ? ` · ${escapeHtml(formatWhen(a.createdAt))}` : ""
                    }</span>
                  </div>
                  <button type="button" class="secondary" data-path="${escapeHtml(a.path || "")}">${escapeHtml(t("artifacts.open"))}</button>
                </li>`,
              )
              .join("")}</ul>`
          : `<p class="muted sys-empty">${escapeHtml(t("artifacts.none"))}</p>`;
        el.innerHTML = shell(`
          <h3>${escapeHtml(t("artifacts.title"))}</h3>
          <p class="muted">${escapeHtml(t("artifacts.hint"))}</p>
          ${rows}
          <div id="art-url" class="sys-link-panel" hidden></div>`);
        wireTabs();
        el.querySelectorAll("[data-path]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const path = btn.getAttribute("data-path");
            if (!path) return;
            const ans = await rpc("home.getArtifactUrl", { accountId: aid, path, ttlSec: 3600 });
            const box = document.getElementById("art-url");
            if (!box) return;
            if (ans.error || !ans.result?.url) {
              box.hidden = false;
              box.innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans) || t("artifacts.linkFailed"))}</p>`;
              return;
            }
            const url = String(ans.result.url);
            const expires = formatWhen(ans.result.expiresAt);
            box.hidden = false;
            box.innerHTML = `
              <p class="sys-link-label">${escapeHtml(t("artifacts.linkReady"))}</p>
              <p class="sys-link-url"><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a></p>
              ${expires ? `<p class="muted">${escapeHtml(t("artifacts.expires", { at: expires }))}</p>` : ""}
              <div class="row">
                <button type="button" class="secondary" id="art-copy">${escapeHtml(t("artifacts.copy"))}</button>
                <button type="button" class="secondary" id="art-open-tab">${escapeHtml(t("artifacts.openTab"))}</button>
              </div>`;
            document.getElementById("art-copy")?.addEventListener("click", async () => {
              try {
                await navigator.clipboard.writeText(url);
                showToast(t("artifacts.copied"), "ok");
              } catch {
                showToast(t("artifacts.copyFailed"), "err");
              }
            });
            document.getElementById("art-open-tab")?.addEventListener("click", () => {
              window.open(url, "_blank", "noopener,noreferrer");
            });
          });
        });
        return;
      }

      if (systemTab === "health") {
        const body = await rpc("home.doctor", {});
        let supervised = null;
        try {
          const invoke = globalThis.__TAURI__?.core?.invoke;
          if (typeof invoke === "function") supervised = await invoke("daemon_status");
        } catch {
          supervised = null;
        }
        if (body.error) {
          el.innerHTML = shell(
            `<p class="muted">${escapeHtml(t("doctor.hint"))}</p><p class="le-error">${escapeHtml(errMsg(body) || t("doctor.loadFailed"))}</p>`,
          );
          wireTabs();
          return;
        }
        const ok = body.result?.ok === true;
        const issues = Array.isArray(body.result?.issues) ? body.result.issues : [];
        const fixableIds = issues.filter((i) => i.fixable).map((i) => i.id);
        const sevClass = (s) => {
          if (s === "error") return "bad";
          if (s === "warn") return "warn";
          return "ok";
        };
        const sevLabel = (s) => {
          if (s === "error") return t("doctor.sevError");
          if (s === "warn") return t("doctor.sevWarn");
          return t("doctor.sevInfo");
        };
        const summary = ok
          ? `<p class="sys-health-summary"><span class="status-pill ok">${escapeHtml(t("doctor.allClear"))}</span></p>`
          : `<p class="sys-health-summary"><span class="status-pill bad">${escapeHtml(
              t("doctor.issueCount", { count: String(issues.length) }),
            )}</span></p>`;
        const superviseRow =
          supervised && typeof supervised === "object"
            ? `<div class="sys-supervise muted">
                <span class="status-pill ${supervised.running ? "ok" : "bad"}">${escapeHtml(
                  supervised.running ? t("doctor.daemonRunning") : t("doctor.daemonStopped"),
                )}</span>
                ${supervised.pid != null ? `<span>${escapeHtml(t("doctor.daemonPid", { pid: String(supervised.pid) }))}</span>` : ""}
              </div>`
            : "";
        const issueRows = issues.length
          ? `<ul class="sys-list" id="doctor-issues">${issues
              .map(
                (i) => `<li class="sys-row">
                  <div class="sys-row-main">
                    <span class="sys-row-title">
                      <span class="status-pill ${sevClass(i.severity)}">${escapeHtml(sevLabel(i.severity))}</span>
                      ${escapeHtml(i.message || i.id || "")}
                    </span>
                    <span class="sys-row-meta muted">${escapeHtml(i.id || "")}${
                      i.fixable ? ` · ${escapeHtml(t("doctor.fixable"))}` : ""
                    }</span>
                  </div>
                </li>`,
              )
              .join("")}</ul>`
          : `<p class="muted sys-empty">${escapeHtml(t("doctor.noIssues"))}</p>`;
        const fixBtn = fixableIds.length
          ? `<button type="button" id="fix-safe">${escapeHtml(t("doctor.apply"))}</button>`
          : "";
        el.innerHTML = shell(`
          <h3>${escapeHtml(t("doctor.title"))}</h3>
          <p class="muted">${escapeHtml(t("doctor.hint"))}</p>
          ${summary}
          ${superviseRow}
          ${issueRows}
          <div class="row sys-health-actions">${fixBtn}<span id="doctor-fix-status" class="muted"></span></div>`);
        wireTabs();
        document.getElementById("fix-safe")?.addEventListener("click", async () => {
          const statusEl = document.getElementById("doctor-fix-status");
          const btn = document.getElementById("fix-safe");
          if (btn) btn.disabled = true;
          if (statusEl) statusEl.textContent = t("doctor.fixing");
          const ans = await rpc("home.doctorFix", { issueIds: fixableIds });
          if (btn) btn.disabled = false;
          if (ans.error) {
            if (statusEl) statusEl.textContent = "";
            showToast(errMsg(ans) || t("doctor.fixFailed"), "err");
            return;
          }
          const fixed = ans.result?.fixed || [];
          const failed = ans.result?.failed || [];
          showToast(
            t("doctor.fixResult", {
              fixed: String(fixed.length),
              failed: String(failed.length),
            }),
            failed.length ? "err" : "ok",
          );
          await showView("system");
        });
        return;
      }

      // machine
      {
        const status = await rpc("home.getServiceStatus");
        const health = await rpc("home.health");
        const grantsBody = aid
          ? await rpc("home.listGrants", { accountId: aid }).catch(() => ({ result: { grants: [] } }))
          : { result: { grants: [] } };
        const grants = grantsBody.result?.grants || [];
        const h = health.result || {};
        const svc = status.result || {};
        const formatWhen = (iso) => {
          if (!iso) return "";
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19).replace("T", " ");
          return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        };
        const formatUptime = (sec) => {
          const n = Number(sec);
          if (!Number.isFinite(n) || n < 0) return "—";
          if (n < 60) return t("advanced.uptimeSec", { n: String(Math.floor(n)) });
          if (n < 3600) return t("advanced.uptimeMin", { n: String(Math.floor(n / 60)) });
          const hours = Math.floor(n / 3600);
          const mins = Math.floor((n % 3600) / 60);
          return t("advanced.uptimeHour", { h: String(hours), m: String(mins) });
        };
        const managerLabel = (m) => {
          if (m === "launchd") return t("advanced.managerLaunchd");
          if (m === "systemd") return t("advanced.managerSystemd");
          if (m === "none" || !m) return t("advanced.managerNone");
          return String(m);
        };
        const dlRow = (label, valueHtml) =>
          `<div class="sys-dl-row"><dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd></div>`;

        const grantRows = grants.length
          ? `<ul class="sys-list">${grants
              .map((g) => {
                const title = g.summary || g.tool || g.id;
                const bits = [
                  g.objectId ? String(g.objectId) : "",
                  g.desiredState ? String(g.desiredState) : "",
                  g.expiresAt
                    ? t("advanced.grantExpires", { at: formatWhen(g.expiresAt) })
                    : t("advanced.grantNoExpiry"),
                ].filter(Boolean);
                return `<li class="sys-row" data-grant="${escapeHtml(g.id)}">
                  <div class="sys-row-main">
                    <span class="sys-row-title">${escapeHtml(title)}</span>
                    <span class="sys-row-meta muted">${escapeHtml(bits.join(" · "))}</span>
                  </div>
                  <button type="button" class="secondary" data-revoke-grant="${escapeHtml(g.id)}">${escapeHtml(t("approvals.revokeGrant"))}</button>
                </li>`;
              })
              .join("")}</ul>`
          : `<p class="muted sys-empty">${escapeHtml(aid ? t("approvals.noGrants") : t("profile.pick"))}</p>`;

        const eventRows = liveEvents.length
          ? `<ul class="sys-list sys-list-compact">${liveEvents
              .slice(0, 8)
              .map(
                (ev) => `<li class="sys-row">
                  <div class="sys-row-main">
                    <span class="sys-row-title">${escapeHtml(ev.event || t("advanced.eventUnknown"))}</span>
                    <span class="sys-row-meta muted">${escapeHtml(formatWhen(ev.at))}</span>
                  </div>
                </li>`,
              )
              .join("")}</ul>`
          : `<p class="muted sys-empty">${escapeHtml(t("advanced.eventsNone"))}</p>`;

        const healthOk = h.ok !== false && !health.error;
        const svcInstalled = svc.installed === true;
        const svcRunning = svc.running === true;
        const publicUrl = h.publicBaseUrl ? String(h.publicBaseUrl) : "";

        el.innerHTML = shell(`
          <h3>${escapeHtml(t("advanced.title"))}</h3>
          <p class="muted">${escapeHtml(t("advanced.hint"))}</p>

          <section class="sys-section">
            <h4>${escapeHtml(t("advanced.connectionTitle"))}</h4>
            <p class="muted">${escapeHtml(t("advanced.connectionHint"))}</p>
            <label class="sys-field">${escapeHtml(t("advanced.wsUrl"))}
              <input id="ws" value="${escapeHtml(wsUrl())}" autocomplete="off" spellcheck="false" />
            </label>
            <button type="button" id="save-ws">${escapeHtml(t("advanced.saveReconnect"))}</button>
          </section>

          <section class="sys-section" id="listen-card">
            <h4>${escapeHtml(t("advanced.listen"))}</h4>
            <p class="muted">${escapeHtml(t("advanced.listenHint"))}</p>
            <p class="sys-health-summary">
              <span class="status-pill ${healthOk ? "ok" : "bad"}">${escapeHtml(
                healthOk ? t("advanced.daemonOk") : t("advanced.daemonBad"),
              )}</span>
            </p>
            <dl class="sys-dl">
              ${dlRow(t("advanced.wsPort"), `<code>wsPort ${escapeHtml(String(h.wsPort ?? "—"))}</code>`)}
              ${dlRow(t("advanced.httpPort"), `<code>httpPort ${escapeHtml(String(h.httpPort ?? "—"))}</code>`)}
              ${dlRow(
                t("advanced.publicBaseUrl"),
                publicUrl
                  ? `<code>${escapeHtml(publicUrl)}</code>`
                  : `<span class="muted">${escapeHtml(t("advanced.publicBaseUrlEmpty"))}</span>`,
              )}
              ${dlRow(t("advanced.uptime"), escapeHtml(formatUptime(h.uptimeSec)))}
              ${dlRow(
                t("advanced.connections"),
                escapeHtml(
                  t("advanced.connectionsValue", {
                    clients: String(h.connections ?? "—"),
                    turns: String(h.activeTurns ?? "—"),
                  }),
                ),
              )}
            </dl>
          </section>

          <section class="sys-section">
            <h4>${escapeHtml(t("advanced.osService"))}</h4>
            <p class="muted">${escapeHtml(t("advanced.osServiceHint"))}</p>
            <p class="sys-pill-row">
              <span class="status-pill ${svcInstalled ? "ok" : "warn"}">${escapeHtml(
                svcInstalled ? t("advanced.svcInstalled") : t("advanced.svcNotInstalled"),
              )}</span>
              <span class="status-pill ${svcRunning ? "ok" : "bad"}">${escapeHtml(
                svcRunning ? t("advanced.svcRunning") : t("advanced.svcStopped"),
              )}</span>
              <span class="status-pill">${escapeHtml(managerLabel(svc.manager))}</span>
            </p>
            ${
              svc.lastError
                ? `<p class="le-error">${escapeHtml(t("advanced.svcLastError", { err: String(svc.lastError) }))}</p>`
                : ""
            }
            <div class="row sys-health-actions">
              <button type="button" id="svc-install">${escapeHtml(t("advanced.svcInstall"))}</button>
              <button type="button" class="secondary" id="svc-restart" ${svcInstalled ? "" : "disabled"}>${escapeHtml(t("advanced.svcRestart"))}</button>
              <button type="button" class="secondary" id="svc-uninstall" ${svcInstalled ? "" : "disabled"}>${escapeHtml(t("advanced.svcUninstall"))}</button>
            </div>
            <p id="svc-action-status" class="muted"></p>
          </section>

          <section class="sys-section">
            <h4>${escapeHtml(t("advanced.mobilePush"))}</h4>
            <p class="muted">${escapeHtml(t("advanced.mobilePushHint"))}</p>
            <button type="button" class="secondary" id="push-test">${escapeHtml(t("advanced.sendTestPush"))}</button>
            <p id="push-action-status" class="muted"></p>
          </section>

          <section class="sys-section">
            <h4>${escapeHtml(t("approvals.grants"))}</h4>
            <p class="muted">${escapeHtml(t("approvals.grantsHint"))}</p>
            ${grantRows}
          </section>

          <section class="sys-section">
            <h4>${escapeHtml(t("advanced.eventsTitle"))}</h4>
            <p class="muted">${escapeHtml(t("advanced.eventsHint"))}</p>
            ${eventRows}
          </section>`);
        wireTabs();
        el.querySelectorAll("[data-revoke-grant]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const grantId = btn.getAttribute("data-revoke-grant");
            if (!grantId) return;
            const ans = await rpc("home.revokeGrant", { id: grantId });
            if (ans.error) showToast(errMsg(ans), "err");
            else showToast(t("approvals.grantRevoked"), "ok");
            await showView("system");
          });
        });
        document.getElementById("save-ws")?.addEventListener("click", () => {
          const next = document.getElementById("ws")?.value?.trim() || "";
          localStorage.setItem("envoyhome.wsUrl", next);
          showToast(t("advanced.wsSaved"), "ok");
          if (sock) sock.close();
          connect();
        });
        const runSvcAction = async (btnId, statusId, run) => {
          const btn = document.getElementById(btnId);
          const statusEl = document.getElementById(statusId);
          if (btn) btn.disabled = true;
          if (statusEl) statusEl.textContent = t("advanced.working");
          const ans = await run();
          if (btn) btn.disabled = false;
          if (ans.error) {
            if (statusEl) statusEl.textContent = "";
            showToast(errMsg(ans) || t("advanced.actionFailed"), "err");
            return;
          }
          showToast(t("advanced.actionOk"), "ok");
          await showView("system");
        };
        document.getElementById("svc-install")?.addEventListener("click", () =>
          runSvcAction("svc-install", "svc-action-status", () =>
            rpc("home.installService", { manager: "auto" }),
          ),
        );
        document.getElementById("svc-restart")?.addEventListener("click", () =>
          runSvcAction("svc-restart", "svc-action-status", () => rpc("home.restartService", {})),
        );
        document.getElementById("svc-uninstall")?.addEventListener("click", async () => {
          if (!confirm(t("advanced.confirmUninstall"))) return;
          await runSvcAction("svc-uninstall", "svc-action-status", () =>
            rpc("home.uninstallService", { confirm: true }),
          );
        });
        document.getElementById("push-test")?.addEventListener("click", async () => {
          const statusEl = document.getElementById("push-action-status");
          const btn = document.getElementById("push-test");
          if (btn) btn.disabled = true;
          if (statusEl) statusEl.textContent = t("advanced.working");
          const ans = await rpc("home.sendTestPush", {
            title: t("app.name"),
            body: t("advanced.testPushBody"),
          });
          if (btn) btn.disabled = false;
          if (statusEl) statusEl.textContent = "";
          if (ans.error) showToast(errMsg(ans) || t("advanced.pushFailed"), "err");
          else showToast(t("advanced.pushSent"), "ok");
        });
        return;
      }
    }

    el.innerHTML = `<h2>${id}</h2><p>${escapeHtml(t("app.unknownView"))}</p>`;
  } catch (err) {
    el.innerHTML = `<h2>${id}</h2><pre>${err instanceof Error ? err.message : String(err)}</pre>`;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * In-app form dialog — Tauri/WKWebView often blocks window.prompt.
 * @param {{
 *   title: string,
 *   fields: Array<{ name: string, label: string, value?: string, multiline?: boolean, placeholder?: string }>,
 *   okLabel?: string,
 *   cancelLabel?: string,
 *   refinePrompt?: {
 *     fieldName: string,
 *     buttonLabel?: string,
 *     onRefine: (ctx: { values: Record<string, string> }) => Promise<string>,
 *   },
 * }} opts
 * @returns {Promise<Record<string, string> | null>}
 */
function promptForm(opts) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop wf-prompt-backdrop";
    backdrop.setAttribute("role", "presentation");
    let busy = false;
    let closed = false;
    const readValues = () => {
      /** @type {Record<string, string>} */
      const out = {};
      for (const f of opts.fields) {
        const el = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (
          backdrop.querySelector(`[name="${CSS.escape(f.name)}"]`)
        );
        out[f.name] = (el?.value || "").trim();
      }
      return out;
    };
    const fieldsHtml = opts.fields
      .map((f) => {
        const id = `wf-prompt-${escapeHtml(f.name)}`;
        const control = f.multiline
          ? `<textarea id="${id}" name="${escapeHtml(f.name)}" rows="5" placeholder="${escapeHtml(f.placeholder || "")}">${escapeHtml(f.value || "")}</textarea>`
          : `<input id="${id}" name="${escapeHtml(f.name)}" type="text" value="${escapeHtml(f.value || "")}" placeholder="${escapeHtml(f.placeholder || "")}" />`;
        return `<label class="wf-prompt-field">${escapeHtml(f.label)}${control}</label>`;
      })
      .join("");
    const refineAction = opts.refinePrompt
      ? `<button type="button" class="secondary wf-prompt-refine" data-wf-prompt-refine>
            ${escapeHtml(opts.refinePrompt.buttonLabel || t("workflows.refinePrompt"))}
          </button>`
      : "";
    backdrop.innerHTML = `
      <div class="modal-card wf-prompt-card" role="dialog" aria-modal="true" aria-labelledby="wf-prompt-title">
        <h2 id="wf-prompt-title">${escapeHtml(opts.title)}</h2>
        <form class="wf-prompt-form">${fieldsHtml}
          <p class="muted wf-prompt-status" data-wf-prompt-status hidden></p>
          <div class="row wf-prompt-actions">
            <button type="button" class="secondary" data-wf-prompt-cancel>${escapeHtml(opts.cancelLabel || t("workflows.cancel"))}</button>
            ${refineAction}
            <button type="submit" data-wf-prompt-ok>${escapeHtml(opts.okLabel || t("app.save"))}</button>
          </div>
        </form>
      </div>`;
    const statusEl = /** @type {HTMLElement | null} */ (
      backdrop.querySelector("[data-wf-prompt-status]")
    );
    const setStatus = (text, isError = false) => {
      if (!statusEl) return;
      if (!text) {
        statusEl.hidden = true;
        statusEl.textContent = "";
        statusEl.classList.remove("le-error");
        return;
      }
      statusEl.hidden = false;
      statusEl.textContent = text;
      statusEl.classList.toggle("le-error", isError);
    };
    const setBusy = (next) => {
      busy = next;
      backdrop.querySelectorAll("button, input, textarea").forEach((el) => {
        if (el instanceof HTMLButtonElement && el.matches("[data-wf-prompt-cancel]")) {
          el.disabled = next;
          return;
        }
        if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.disabled = next;
        }
      });
    };
    const finish = (value) => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeydown, true);
      backdrop.remove();
      resolve(value);
    };
    const onKeydown = (ev) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      if (!busy) finish(null);
    };
    const form = backdrop.querySelector("form");
    form?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (busy) return;
      finish(readValues());
    });
    backdrop.querySelector("[data-wf-prompt-cancel]")?.addEventListener("click", () => {
      if (!busy) finish(null);
    });
    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop && !busy) finish(null);
    });
    backdrop.querySelector("[data-wf-prompt-refine]")?.addEventListener("click", () => {
      if (busy || !opts.refinePrompt) return;
      void (async () => {
        setBusy(true);
        setStatus(t("workflows.refineWorking"));
        try {
          const refined = await opts.refinePrompt.onRefine({ values: readValues() });
          const ta = /** @type {HTMLTextAreaElement | HTMLInputElement | null} */ (
            backdrop.querySelector(`[name="${CSS.escape(opts.refinePrompt.fieldName)}"]`)
          );
          if (ta && typeof refined === "string") ta.value = refined;
          setStatus(t("workflows.refinePromptDone"));
        } catch (err) {
          setStatus(err instanceof Error ? err.message : String(err), true);
        } finally {
          setBusy(false);
        }
      })();
    });
    document.addEventListener("keydown", onKeydown, true);
    document.body.appendChild(backdrop);
    const first = /** @type {HTMLElement | null} */ (
      backdrop.querySelector("input, textarea")
    );
    queueMicrotask(() => first?.focus());
  });
}

initTheme();
initLocale();
applyDomI18n();
onLocaleChange(() => {
  applyDomI18n();
  renderNav(activeView);
  renderTopbarTools();
  if (sock && sock.readyState === WebSocket.OPEN) void showView(activeView);
});
onThemeChange(() => {
  renderTopbarTools();
});
renderNav(activeView);
connect();
