// Thin Settings shell — Design §10. Persistent WS, live events, Chat / Models / Pairing.

import QRCode from "qrcode";
import { PROVIDER_PRESETS, presetById } from "./provider-presets.js";
import {
  LOCALE_OPTIONS,
  applyDomI18n,
  getLocale,
  initLocale,
  onLocaleChange,
  setLocale,
  t,
} from "./i18n/index.js";

const DEFAULT_WS = "ws://127.0.0.1:4780/ws";

const VIEWS = [
  // Home — day-to-day use
  { id: "chat", labelKey: "nav.chat", groupKey: "navGroup.home" },
  // Intelligence — agent brain (models, harness, memory)
  { id: "models", labelKey: "nav.models", groupKey: "navGroup.intelligence" },
  { id: "harness", labelKey: "nav.harness", groupKey: "navGroup.intelligence" },
  { id: "memory", labelKey: "nav.memory", groupKey: "navGroup.intelligence" },
  // Connections — how phones/IM/devices attach (Profiles managed from sidebar popup)
  { id: "pairing", labelKey: "nav.pairing", groupKey: "navGroup.connections" },
  { id: "channels", labelKey: "nav.channels", groupKey: "navGroup.connections" },
  { id: "bindings", labelKey: "nav.bindings", groupKey: "navGroup.connections" },
  // Automation — skills, schedules, smart home
  { id: "skills", labelKey: "nav.skills", groupKey: "navGroup.automation" },
  { id: "workflows", labelKey: "nav.workflows", groupKey: "navGroup.automation" },
  { id: "jobs", labelKey: "nav.jobs", groupKey: "navGroup.automation" },
  { id: "smarthome", labelKey: "nav.smarthome", groupKey: "navGroup.automation" },
  // Operations — health, artifacts, operator knobs
  { id: "artifacts", labelKey: "nav.artifacts", groupKey: "navGroup.ops" },
  { id: "doctor", labelKey: "nav.doctor", groupKey: "navGroup.ops" },
  { id: "advanced", labelKey: "nav.advanced", groupKey: "navGroup.ops" },
];

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
/** @type {Array<{ role: string, text: string }>} */
const chatLog = [];
let chatSessionId = "";
let activeView = "chat";
/** @type {Array<{ accountId: string, displayName?: string, createdAt?: string }>} */
let cachedAccounts = [];
/**
 * Last QR mint in this Settings session — reopen Pair devices without stacking
 * another unused code (daemon also prunes unused QR rows).
 * @type {{ uri: string, deviceId?: string } | null}
 */
let cachedPairingMint = null;

function wsUrl() {
  return localStorage.getItem("envoyhome.wsUrl") || DEFAULT_WS;
}

function accountId() {
  return localStorage.getItem("envoyhome.accountId") || "";
}

function setAccountId(id) {
  localStorage.setItem("envoyhome.accountId", id);
  chatSessionId = "";
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

async function mintPairingCode(input = {}) {
  const params = {
    deviceLabel: input.deviceLabel || "Phone",
  };
  if (input.host) params.host = input.host;
  if (input.token) params.token = input.token;
  if (input.fresh === true) params.fresh = true;
  const aid = accountId();
  if (aid) params.accountIds = [aid];
  try {
    const ans = await rpc("home.mintPairing", params);
    if (ans.error || !ans.result?.uri) {
      return { ok: false, message: errMsg(ans) || t("pairing.mintFailed") };
    }
    return {
      ok: true,
      uri: String(ans.result.uri),
      deviceId: ans.result.device?.deviceId ? String(ans.result.device.deviceId) : undefined,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
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
        ],
      });
      for (const event of [
        "home:turn-finished",
        "home:turn-delta",
        "home:approval-needed",
        "home:approval-resolved",
        "home:learn-proposed",
      ]) {
        await rpc("on", { event }).catch(() => undefined);
      }
      const hello = await rpc("home.hello");
      const health = await rpc("home.health");
      const svc = await rpc("home.getServiceStatus");
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
        chatLog.push({ role: "assistant", text: data.text });
        if (activeView === "chat") void showView("chat");
      }
      if (name === "home:turn-finished" && activeView === "chat") void showView("chat");
      if (name.includes("approval") && activeView === "chat") void showView("chat");
      if (name === "home:approval-needed") {
        showToast(t("approvals.neededToast"), "ok");
        if (activeView !== "chat") void showView("chat");
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
  return `<div class="nav-profile">
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

function renderNav(active) {
  const nav = document.getElementById("nav");
  const groups = [];
  for (const v of VIEWS) {
    const g = v.groupKey || "navGroup.ops";
    if (!groups.includes(g)) groups.push(g);
  }
  let html = `<div class="nav-brand"><img src="/logo.png" width="28" height="28" alt="" /><span>${escapeHtml(
    t("app.name"),
  )}</span></div>${navProfileHtml()}`;
  for (const g of groups) {
    html += `<div class="nav-group">${escapeHtml(t(g))}</div>`;
    html += VIEWS.filter((v) => (v.groupKey || "navGroup.ops") === g)
      .map(
        (v) =>
          `<button type="button" data-view="${v.id}" class="${v.id === active ? "active" : ""}">${escapeHtml(
            t(v.labelKey),
          )}</button>`,
      )
      .join("");
  }
  html += `<div class="nav-group">${escapeHtml(t("app.language"))}</div>
    <label class="nav-lang"><select id="locale-select" aria-label="${escapeHtml(t("app.language"))}">
      ${LOCALE_OPTIONS.map(
        (o) =>
          `<option value="${o.id}" ${o.id === getLocale() ? "selected" : ""}>${escapeHtml(o.label)}</option>`,
      ).join("")}
    </select></label>`;
  nav.innerHTML = html;
  nav.querySelectorAll("button[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
  document.getElementById("locale-select")?.addEventListener("change", (ev) => {
    setLocale(ev.target.value);
  });
  bindNavProfile();
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

async function ensureChatSession(aid) {
  if (chatSessionId) return chatSessionId;
  const opened = await rpc("home.openSession", { accountId: aid, title: t("chat.sessionTitle") });
  if (opened.error) throw new Error(errMsg(opened));
  chatSessionId = opened.result.sessionId;
  return chatSessionId;
}

async function showView(id) {
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
    const accounts = await listAccountRows();
    const aid = accountId();
    renderNav(id);

    if (id === "approvals") {
      // Pending approvals live in Chat; keep old deep-links working.
      await showView("chat");
      return;
    }

    if (id === "chat") {
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
      const approvalsBody = await rpc("home.listApprovals", { accountId: aid }).catch(() => ({
        result: { approvals: [] },
      }));
      const pending = approvalsBody.result?.approvals || [];
      const approvalStrip =
        pending.length > 0
          ? `<div class="chat-approvals" id="chat-approvals">
              <div class="chat-approvals-label">${escapeHtml(
                t("chat.pendingApprovals", { count: pending.length }),
              )}</div>
              ${pending.map(approvalCardHtml).join("")}
            </div>`
          : "";
      const bubbles = chatLog
        .map((m) => {
          const role = escapeHtml(m.role);
          if (m.role === "system") {
            return `<div class="bubble system">${escapeHtml(m.text)}</div>`;
          }
          return `<div class="bubble ${role}">${escapeHtml(m.text)}</div>`;
        })
        .join("");
      el.innerHTML = `<div class="chat-page">
        ${approvalStrip}
        <div class="chat-layout">
          <div class="chat-log" id="chat-log">${
            bubbles || `<div class="chat-empty">${escapeHtml(t("chat.empty"))}</div>`
          }</div>
          <form id="chat-form" class="chat-composer">
            <input name="text" placeholder="${escapeHtml(t("chat.placeholder"))}" autocomplete="off" required />
            <button type="submit">${escapeHtml(t("app.send"))}</button>
          </form>
        </div>
      </div>`;
      if (pending.length) bindApprovalActions(el, pending, () => showView("chat"));
      const logEl = document.getElementById("chat-log");
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
      document.getElementById("chat-form")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const text = new FormData(ev.target).get("text");
        if (!text) return;
        chatLog.push({ role: "user", text: String(text) });
        try {
          const sessionId = await ensureChatSession(aid);
          const sent = await rpc("home.sendMessage", {
            accountId: aid,
            sessionId,
            text: String(text),
          });
          if (sent.error) {
            chatLog.push({ role: "system", text: errMsg(sent) });
            showToast(errMsg(sent) || t("chat.sendFailed"), "err");
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          chatLog.push({ role: "system", text: msg });
          showToast(msg, "err");
        }
        ev.target.reset();
        await showView("chat");
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

    if (id === "pairing") {
      // EnvoyDev Settings → Pair devices: three routes (QR / manual / SSH) + issued codes list.
      // Precedent: ../EnvoyCoder/apps/desktop/src/components/settings/PairingSection.tsx
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
          const profiles =
            (d.accountIds || [])
              .map((id) => {
                const row = accounts.find((a) => a.accountId === id);
                return row?.displayName || id;
              })
              .join(", ") || t("app.none");
          const action = d.revoked
            ? `<button type="button" class="secondary" data-forget="${escapeHtml(d.deviceId)}">${escapeHtml(t("pairing.forget"))}</button>`
            : `<button type="button" data-revoke="${escapeHtml(d.deviceId)}">${escapeHtml(t("pairing.revoke"))}</button>`;
          return `<li class="pairing-code-row" data-device-state="${state}" data-device="${escapeHtml(d.deviceId)}">
            <div>
              <strong>${escapeHtml(d.label || d.deviceId)}</strong>
              <div class="muted">${escapeHtml(stateLabel)} · ${escapeHtml(t("pairing.profiles", { list: profiles }))}</div>
            </div>
            ${action}
          </li>`;
        })
        .join("");

      el.innerHTML = `<h2>${escapeHtml(t("pairing.title"))}</h2>
        <p class="muted pairing-note">${escapeHtml(t("pairing.note"))}</p>

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

        <section class="pairing-route" data-route="codes" aria-labelledby="pairing-codes-heading">
          <h3 id="pairing-codes-heading">${escapeHtml(t("pairing.codesTitle"))}</h3>
          <p class="muted">${escapeHtml(t("pairing.manage"))}</p>
          ${
            deviceRows
              ? `<ul class="pairing-code-list">${deviceRows}</ul>`
              : `<p class="muted">${escapeHtml(t("pairing.noDevices"))}</p>`
          }
        </section>`;

      const qrPanel = document.getElementById("pairing-qr-panel");
      const freshBtn = document.getElementById("pairing-qr-fresh");
      /** Keep the last minted URI so Copy still works after re-renders of the panel. */
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
        // Reuse this session's code when reopening Pair devices (no new list row).
        if (!fresh && cachedPairingMint?.uri) {
          const stillListed = !cachedPairingMint.deviceId
            || devices.some(
              (d) => d.deviceId === cachedPairingMint.deviceId && !d.revoked,
            );
          if (stillListed) {
            await showQrOutcome({ ok: true, uri: cachedPairingMint.uri, deviceId: cachedPairingMint.deviceId });
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
          const outcome = await mintPairingCode(fresh ? { fresh: true } : {});
          if (outcome.ok) {
            cachedPairingMint = {
              uri: outcome.uri,
              ...(outcome.deviceId ? { deviceId: outcome.deviceId } : {}),
            };
            // Reload the page so Pairing codes reflects prune; session cache avoids a second mint.
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

      freshBtn?.addEventListener("click", () => {
        void mintQr(true);
      });
      // Auto-show QR: reuse session cache, else mint once (daemon drops prior unused QR).
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

    if (id === "channels") {
      const body = await rpc("home.listChannels");
      const listed = body.result?.channels || body.result || [];
      const channels = Array.isArray(listed) ? listed : [];
      const rows = channels
        .map(
          (c) => `<tr>
            <td><strong>${escapeHtml(c.label || c.id)}</strong><br/><code>${escapeHtml(c.id)}</code></td>
            <td>${escapeHtml(c.channelKind || c.kind || "")}</td>
            <td>${c.enabled ? "on" : "off"} / ${escapeHtml(c.status || "")}</td>
          </tr>`,
        )
        .join("");
      const tgStatus = await rpc("home.getChannelStatus", { id: "telegram" }).catch(() => null);
      const bindings = await rpc("home.listBindings", {}).catch(() => ({ result: { bindings: [] } }));
      const bindRows = (bindings.result?.bindings || [])
        .filter((b) => b.kind === "sender" && b.channel === "telegram")
        .map(
          (b) =>
            `<li><code>${escapeHtml(b.channel || "")}/${escapeHtml(b.channelAccount || "")}</code> ` +
            `${escapeHtml(t("bindings.sender"))} <code>${escapeHtml(b.senderId || b.deviceId || "")}</code> → ` +
            `<code>${escapeHtml(b.accountId || "")}</code> ` +
            `<button type="button" data-unbind="${escapeHtml(b.bindingId || "")}">${escapeHtml(t("bindings.remove"))}</button></li>`,
        )
        .join("");
      el.innerHTML = `<h2>${escapeHtml(t("channels.title"))}</h2>
        <p class="muted">${escapeHtml(t("channels.enableTelegram"))} <code>docs/telegram-demo-setup.md</code></p>
        <table class="card" style="width:100%;border-collapse:collapse">
          <thead><tr><th>${escapeHtml(t("channels.channel"))}</th><th>${escapeHtml(t("channels.kind"))}</th><th>${escapeHtml(t("channels.status"))}</th></tr></thead>
          <tbody>${rows || `<tr><td colspan=3>${escapeHtml(t("app.none"))}</td></tr>`}</tbody>
        </table>
        ${tgStatus ? `<p class="muted">telegram: ${escapeHtml(JSON.stringify(tgStatus.result || tgStatus.error))}</p>` : ""}
        <form id="tg-config" class="card">
          <h3>${escapeHtml(t("channels.telegramDemo"))}</h3>
          <label>${escapeHtml(t("channels.channelAccount"))} <input name="channelAccount" value="default" /></label>
          <label>${escapeHtml(t("channels.botToken"))} <input name="botToken" type="password" autocomplete="off" placeholder="from @BotFather" /></label>
          <label>${escapeHtml(t("channels.apiBase"))} <input name="apiBase" placeholder="https://api.telegram.org" /></label>
          <div class="row">
            <button type="submit">${escapeHtml(t("channels.saveConfig"))}</button>
            <button type="button" id="tg-enable">${escapeHtml(t("channels.enable"))}</button>
            <button type="button" id="tg-disable">${escapeHtml(t("channels.disable"))}</button>
          </div>
        </form>
        <form id="tg-bind" class="card">
          <h3>${escapeHtml(t("channels.bindTelegram"))}</h3>
          <p class="muted">${escapeHtml(t("channels.bindTelegramHint"))}</p>
          <label>${escapeHtml(t("channels.senderId"))} <input name="senderId" required placeholder="123456789" /></label>
          <label>${escapeHtml(t("channels.channelAccount"))} <input name="channelAccount" value="default" /></label>
          <button type="submit">${escapeHtml(t("channels.bind"))}</button>
          <ul>${bindRows || `<li class='muted'>${escapeHtml(t("channels.noTelegramBindings"))}</li>`}</ul>
        </form>
        <form id="mqtt-config" class="card">
          <h3>${escapeHtml(t("channels.mqtt"))}</h3>
          <label>${escapeHtml(t("channels.brokerUrl"))} <input name="brokerUrl" placeholder="mqtt://127.0.0.1:1883" /></label>
          <label>${escapeHtml(t("channels.username"))} <input name="username" autocomplete="off" /></label>
          <label>${escapeHtml(t("channels.password"))} <input name="password" type="password" autocomplete="off" /></label>
          <div class="row">
            <button type="submit">${escapeHtml(t("channels.saveMqtt"))}</button>
            <button type="button" id="mqtt-enable">${escapeHtml(t("channels.enableMqtt"))}</button>
          </div>
        </form>
        <form id="ha-config" class="card">
          <h3>${escapeHtml(t("channels.ha"))}</h3>
          <label>${escapeHtml(t("channels.baseUrl"))} <input name="baseUrl" placeholder="http://homeassistant.local:8123" /></label>
          <label>${escapeHtml(t("channels.accessToken"))} <input name="accessToken" type="password" autocomplete="off" /></label>
          <div class="row">
            <button type="submit">${escapeHtml(t("channels.saveHa"))}</button>
            <button type="button" id="ha-enable">${escapeHtml(t("channels.enableHa"))}</button>
          </div>
        </form>
        ${pre(body)}`;
      document.getElementById("tg-config")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const config = { channelAccount: String(fd.get("channelAccount") || "default") };
        const apiBase = String(fd.get("apiBase") || "").trim();
        if (apiBase) config.apiBase = apiBase;
        const secrets = {};
        const token = String(fd.get("botToken") || "").trim();
        if (token) secrets.botToken = token;
        const ans = await rpc("home.setChannelConfig", {
          id: "telegram",
          config,
          ...(Object.keys(secrets).length ? { secrets } : {}),
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("channels");
      });
      document.getElementById("tg-enable")?.addEventListener("click", async () => {
        const ans = await rpc("home.enableChannel", { id: "telegram" });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("channels");
      });
      document.getElementById("tg-disable")?.addEventListener("click", async () => {
        const ans = await rpc("home.disableChannel", { id: "telegram" });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("channels");
      });
      document.getElementById("tg-bind")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const aid = accountId() || String(fd.get("accountId") || "");
        if (!aid) {
          el.insertAdjacentHTML("beforeend", pre({ error: { message: t("profile.pick") } }));
          return;
        }
        const ans = await rpc("home.setBinding", {
          channel: "telegram",
          channelAccount: String(fd.get("channelAccount") || "default"),
          senderId: String(fd.get("senderId")),
          accountId: aid,
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("channels");
      });
      el.querySelectorAll("[data-unbind]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const bindingId = btn.getAttribute("data-unbind");
          if (!bindingId) return;
          const ans = await rpc("home.removeBinding", { bindingId });
          el.insertAdjacentHTML("beforeend", pre(ans));
          await showView("channels");
        });
      });
      document.getElementById("mqtt-config")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const config = {};
        const brokerUrl = String(fd.get("brokerUrl") || "").trim();
        if (brokerUrl) config.brokerUrl = brokerUrl;
        const secrets = {};
        const user = String(fd.get("username") || "").trim();
        const pass = String(fd.get("password") || "").trim();
        if (user) secrets.username = user;
        if (pass) secrets.password = pass;
        const ans = await rpc("home.setChannelConfig", {
          id: "mqtt",
          config,
          ...(Object.keys(secrets).length ? { secrets } : {}),
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("channels");
      });
      document.getElementById("mqtt-enable")?.addEventListener("click", async () => {
        el.insertAdjacentHTML("beforeend", pre(await rpc("home.enableChannel", { id: "mqtt" })));
        await showView("channels");
      });
      document.getElementById("ha-config")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const config = {};
        const baseUrl = String(fd.get("baseUrl") || "").trim();
        if (baseUrl) config.baseUrl = baseUrl;
        const secrets = {};
        const token = String(fd.get("accessToken") || "").trim();
        if (token) secrets.accessToken = token;
        const ans = await rpc("home.setChannelConfig", {
          id: "homeassistant",
          config,
          ...(Object.keys(secrets).length ? { secrets } : {}),
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("channels");
      });
      document.getElementById("ha-enable")?.addEventListener("click", async () => {
        el.insertAdjacentHTML(
          "beforeend",
          pre(await rpc("home.enableChannel", { id: "homeassistant" })),
        );
        await showView("channels");
      });
      return;
    }

    if (id === "models") {
      let localStatus = {};
      let localErr = null;
      try {
        const st = await rpc("home.getLocalEngineStatus", {});
        if (st.error) localErr = errMsg(st);
        else localStatus = st.result || {};
      } catch (e) {
        localErr = e instanceof Error ? e.message : String(e);
      }

      let providers = [];
      let defaultId = "";
      let placementFilter = "any";
      let autoSwitch = false;
      let mode = "mix";
      let listErr = null;
      if (aid) {
        const body = await rpc("home.listProviders", { accountId: aid });
        if (body.error) listErr = errMsg(body);
        else {
          mode = body.result?.mode || "mix";
          providers = body.result?.providers || [];
          defaultId = body.result?.defaultProviderId || "";
          placementFilter = body.result?.placementFilter || "any";
          autoSwitch = body.result?.autoModelSwitch?.enabled === true;
        }
      }

      const localMode = localStatus.mode || "off";
      const modeLabel =
        localMode === "attach"
          ? t("models.modeMesh")
          : localMode === "spawn"
            ? t("models.modeSpawn")
            : localMode === "ollama"
              ? t("models.modeOllama")
              : t("models.modeOff");
      const healthy = localStatus.healthy === true;
      const ggufs = Array.isArray(localStatus.modelsOnDisk) ? localStatus.modelsOnDisk : [];
      const engineOn = localStatus.enabled === true && localMode !== "off";
      const activeLocalId =
        localMode === "ollama" ? "ollama" : engineOn ? "envoyhome-local" : "";
      const cloudBlocksDefault = placementFilter === "cloud" && engineOn;

      const presetOpts = PROVIDER_PRESETS.map(
        (p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`,
      ).join("");
      const defaultOpts = providers
        .filter((p) => p.enabled)
        .map(
          (p) =>
            `<option value="${escapeHtml(p.id)}" ${p.id === defaultId ? "selected" : ""}>${escapeHtml(
              p.label || p.id,
            )}</option>`,
        )
        .join("");
      const cards = providers
        .map((p) => {
          const place = p.placement || (p.kind?.startsWith("cloud_") ? "cloud" : "local");
          const props = [
            p.paramCountB != null ? `${p.paramCountB}B` : null,
            p.costRank != null ? `costRank=${p.costRank}` : null,
            p.capabilityRank != null ? `cap=${p.capabilityRank}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return `<div class="card" data-pid="${escapeHtml(p.id)}">
            <strong>${escapeHtml(p.label || p.id)}</strong>
            ${p.id === defaultId ? `<span class="muted"> · ${escapeHtml(t("channels.default"))}</span>` : ""}
            ${p.enabled ? "" : `<span class="muted"> · ${escapeHtml(t("channels.disabled"))}</span>`}
            <div class="muted">${escapeHtml(p.kind)} · ${escapeHtml(place)} · secret=${p.hasSecret ? "yes" : "no"}</div>
            <div class="muted"><code>${escapeHtml(p.baseUrl || "")}</code> · ${escapeHtml(t("channels.model"))} <code>${escapeHtml(p.model || "")}</code></div>
            ${props ? `<div class="muted">${escapeHtml(props)}</div>` : ""}
            <div class="row">
              <button type="button" data-test="${escapeHtml(p.id)}">${escapeHtml(t("app.test"))}</button>
              <button type="button" class="secondary" data-toggle="${escapeHtml(p.id)}" data-en="${p.enabled ? "0" : "1"}">${
                escapeHtml(p.enabled ? t("app.disable") : t("app.enable"))
              }</button>
              <button type="button" class="secondary" data-remove="${escapeHtml(p.id)}">${escapeHtml(t("app.remove"))}</button>
            </div>
          </div>`;
        })
        .join("");

      const ggufList =
        ggufs.length > 0
          ? `<ul class="le-gguf">${ggufs.map((n) => `<li><code>${escapeHtml(n)}</code></li>`).join("")}</ul>`
          : `<p class="muted">${escapeHtml(t("models.noGguf"))}</p>`;

      el.innerHTML = `<h2>${escapeHtml(t("models.title"))}</h2>
        <div class="card" id="local-engine-card">
          <h3>${escapeHtml(t("models.local"))}</h3>
          <p>
            <span class="status-pill ${engineOn ? (healthy ? "ok" : "bad") : ""}">${escapeHtml(modeLabel)}</span>
            <span class="status-pill ${healthy ? "ok" : engineOn ? "bad" : ""}">${escapeHtml(
              engineOn
                ? healthy
                  ? t("models.responding")
                  : t("models.notResponding")
                : t("channels.disabled"),
            )}</span>
            <span class="muted">${escapeHtml(
              t("models.meshRuntime", {
                mesh: localStatus.meshAttachAvailable
                  ? t("models.available")
                  : t("models.notRunning"),
                runtime: localStatus.runtimeInstalled
                  ? t("models.installed")
                  : t("models.notInstalled"),
              }),
            )}</span>
          </p>
          ${localStatus.hint ? `<p class="muted">${escapeHtml(localStatus.hint)}</p>` : ""}
          ${localErr ? `<p class="le-error">${escapeHtml(localErr)}</p>` : ""}
          ${ggufList}
          <div class="row" id="le-primary">
            <button type="button" id="le-enable">${escapeHtml(t("models.enableLocal"))}</button>
            <button type="button" id="le-ollama">${escapeHtml(t("models.useOllama"))}</button>
            <button type="button" class="secondary" id="le-disable" ${engineOn ? "" : "disabled"}>${escapeHtml(t("models.disable"))}</button>
            ${
              aid && engineOn
                ? `<button type="button" id="le-local-only">${escapeHtml(t("models.useLocalOnly"))}</button>`
                : ""
            }
          </div>
          ${
            cloudBlocksDefault
              ? `<p class="muted">${escapeHtml(t("models.poolCloudOnly"))}</p>`
              : ""
          }
          <div id="le-msg"></div>
          <details>
            <summary>${escapeHtml(t("models.advanced"))}</summary>
            <p class="muted">${escapeHtml(t("models.localHint"))}</p>
            <div class="row">
              <button type="button" class="secondary" id="le-attach">${escapeHtml(t("models.attachMesh"))}</button>
              <button type="button" class="secondary" id="le-spawn" ${
                ggufs.length === 0
                  ? `disabled title="${escapeHtml(t("models.dropGguf"))}"`
                  : ""
              }>${escapeHtml(t("models.spawn"))}</button>
            </div>
            ${
              ggufs.length === 0
                ? `<p class="muted">${escapeHtml(t("models.spawnDisabled"))}</p>`
                : ""
            }
          </details>
        </div>
        
        ${
          !aid
            ? `<p class="muted">${escapeHtml(t("models.pickProfile"))}</p>`
            : ""
        }
        ${listErr ? `<p class="le-error">${escapeHtml(listErr)}</p>` : ""}
        ${
          aid
            ? `<form id="routing-form" class="card">
          <h3>${escapeHtml(t("models.routing"))}</h3>
          <div class="row">
            <label>${escapeHtml(t("models.defaultModel"))}
              <select name="defaultProviderId">${defaultOpts || "<option value=''>—</option>"}</select>
            </label>
            <label>${escapeHtml(t("models.pool"))}
              <select name="placementFilter">
                <option value="any" ${placementFilter === "any" ? "selected" : ""}>${escapeHtml(t("models.poolAny"))}</option>
                <option value="local" ${placementFilter === "local" ? "selected" : ""}>${escapeHtml(t("models.poolLocal"))}</option>
                <option value="cloud" ${placementFilter === "cloud" ? "selected" : ""}>${escapeHtml(t("models.poolCloud"))}</option>
              </select>
            </label>
          </div>
          <label class="row"><input type="checkbox" name="autoSwitch" ${autoSwitch ? "checked" : ""} /> ${escapeHtml(t("models.autoSwitch"))}</label>
          <p class="muted">${escapeHtml(t("models.localOnlyHint"))}</p>
          <p class="muted">${escapeHtml(t("models.compatMode", { mode }))}</p>
          <button type="submit">${escapeHtml(t("models.saveRouting"))}</button>
        </form>
        <h3>${escapeHtml(t("models.configured"))}</h3>
        ${cards || `<p class='muted'>${escapeHtml(t("models.noProviders"))}</p>`}
        <div id="prov-msg"></div>
        <form id="prov-save" class="card">
          <h3>${escapeHtml(t("models.addProvider"))}</h3>
          <label>${escapeHtml(t("models.preset"))}
            <select name="preset" id="prov-preset">${presetOpts}</select>
          </label>
          <label>${escapeHtml(t("models.apiKey"))} <input name="apiKey" type="password" autocomplete="off" placeholder="${escapeHtml(t("app.optional"))}" /></label>
          <label>${escapeHtml(t("models.model"))} <input name="model" id="prov-model" /></label>
          <details id="prov-advanced">
            <summary>${escapeHtml(t("models.advanced"))}</summary>
            <label>${escapeHtml(t("models.id"))} <input name="id" id="prov-id" required /></label>
            <label>${escapeHtml(t("models.kind"))}
              <select name="kind" id="prov-kind">
                <option value="local_llama_cpp">local_llama_cpp</option>
                <option value="local_openai_compat">local_openai_compat</option>
                <option value="cloud_openai_compat">cloud_openai_compat</option>
                <option value="cloud_anthropic_compat">cloud_anthropic_compat</option>
              </select>
            </label>
            <label>baseUrl <input name="baseUrl" id="prov-base" /></label>
            <label>label <input name="label" id="prov-label" /></label>
            <label>${escapeHtml(t("models.paramCountB"))} <input name="paramCountB" id="prov-params" type="number" step="0.1" placeholder="e.g. 8" /></label>
            <label>${escapeHtml(t("models.costRank"))} <input name="costRank" id="prov-costrank" type="number" placeholder="0 local, 100 cloud" /></label>
          </details>
          <button type="submit">${escapeHtml(t("models.saveProvider"))}</button>
        </form>`
            : ""
        }`;

      const leMsg = document.getElementById("le-msg");
      const setLeBusy = (busy) => {
        el.querySelectorAll("#local-engine-card button").forEach((b) => {
          if (busy) {
            b.classList.add("busy");
            b.disabled = true;
          } else {
            b.classList.remove("busy");
            if (b.id === "le-disable") b.disabled = !engineOn;
            else if (b.id === "le-spawn") b.disabled = ggufs.length === 0;
            else b.disabled = false;
          }
        });
      };
      const showLeResult = (ans) => {
        if (!leMsg) return;
        if (ans?.error) {
          leMsg.innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans) || "failed")}</p>`;
        } else {
          const r = ans?.result || {};
          leMsg.innerHTML = `<p class="muted">${escapeHtml(
            t("models.leOk", {
              mode: r.mode || "",
              health: r.healthy ? t("models.responding") : t("models.startingDown"),
            }),
          )} · <code>${escapeHtml(r.baseUrl || "")}</code></p>`;
        }
      };
      const runLocal = async (method, params, timeoutMs = 120_000) => {
        setLeBusy(true);
        if (leMsg) leMsg.innerHTML = `<p class="muted">${escapeHtml(t("app.working"))}</p>`;
        try {
          const ans = await rpc(
            method,
            { ...(aid ? { accountId: aid } : {}), ...params },
            { timeoutMs },
          );
          showLeResult(ans);
          if (!ans.error) await showView("models");
        } catch (e) {
          if (leMsg) {
            leMsg.innerHTML = `<p class="le-error">${escapeHtml(
              e instanceof Error ? e.message : String(e),
            )}</p>`;
          }
        } finally {
          setLeBusy(false);
        }
      };
      document.getElementById("le-enable")?.addEventListener("click", () =>
        runLocal("home.enableLocalEngine", { prefer: "auto" }),
      );
      document.getElementById("le-attach")?.addEventListener("click", () =>
        runLocal("home.enableLocalEngine", { prefer: "attach" }),
      );
      document.getElementById("le-spawn")?.addEventListener("click", () => {
        if (ggufs.length === 0) {
          if (leMsg) {
            leMsg.innerHTML =
              `<p class="le-error">${escapeHtml(t("models.dropGguf"))}</p>`;
          }
          return;
        }
        runLocal("home.enableLocalEngine", { prefer: "spawn" });
      });
      document.getElementById("le-ollama")?.addEventListener("click", () =>
        runLocal("home.enableOllama", {}),
      );
      document.getElementById("le-disable")?.addEventListener("click", () =>
        runLocal("home.disableLocalEngine", {}, 30_000),
      );
      document.getElementById("le-local-only")?.addEventListener("click", async () => {
        if (!aid || !activeLocalId) return;
        setLeBusy(true);
        if (leMsg) leMsg.innerHTML = `<p class="muted">${escapeHtml(t("models.settingLocalOnly"))}</p>`;
        try {
          let ans = await rpc("home.setPlacementFilter", { accountId: aid, filter: "local" });
          if (ans.error) {
            showLeResult(ans);
            return;
          }
          ans = await rpc("home.setDefaultProvider", {
            accountId: aid,
            providerId: activeLocalId,
          });
          if (ans.error) {
            showLeResult(ans);
            return;
          }
          ans = await rpc("home.setAutoModelSwitch", { accountId: aid, enabled: false });
          showLeResult(ans.error ? ans : { result: { mode: "local", healthy: true, baseUrl: "" } });
          if (!ans.error) {
            if (leMsg) {
              leMsg.innerHTML = `<p class="muted">${escapeHtml(t("models.localOnlySet", { id: activeLocalId }))}</p>`;
            }
            await showView("models");
          }
        } catch (e) {
          if (leMsg) {
            leMsg.innerHTML = `<p class="le-error">${escapeHtml(
              e instanceof Error ? e.message : String(e),
            )}</p>`;
          }
        } finally {
          setLeBusy(false);
        }
      });

      if (aid) {
        const applyPreset = () => {
          const preset = presetById(document.getElementById("prov-preset")?.value);
          if (!preset) return;
          const idEl = document.getElementById("prov-id");
          const kindEl = document.getElementById("prov-kind");
          const baseEl = document.getElementById("prov-base");
          const modelEl = document.getElementById("prov-model");
          const labelEl = document.getElementById("prov-label");
          if (idEl) idEl.value = preset.defaultProviderId;
          if (kindEl) kindEl.value = preset.kind;
          if (baseEl) baseEl.value = preset.baseUrl;
          if (modelEl) modelEl.value = preset.model;
          if (labelEl) labelEl.value = preset.label;
        };
        document.getElementById("prov-preset")?.addEventListener("change", applyPreset);
        applyPreset();

        document.getElementById("routing-form")?.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target);
          const box = document.getElementById("prov-msg");
          const filter = String(fd.get("placementFilter") || "any");
          const def = String(fd.get("defaultProviderId") || "").trim();
          const switchOn = fd.get("autoSwitch") === "on";
          let ans = await rpc("home.setPlacementFilter", { accountId: aid, filter });
          if (ans.error) {
            if (box) box.innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`;
            return;
          }
          if (def) {
            ans = await rpc("home.setDefaultProvider", { accountId: aid, providerId: def });
            if (ans.error) {
              if (box) box.innerHTML = `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`;
              return;
            }
          }
          ans = await rpc("home.setAutoModelSwitch", { accountId: aid, enabled: switchOn });
          if (box) {
            box.innerHTML = ans.error
              ? `<p class="le-error">${escapeHtml(errMsg(ans))}</p>`
              : `<p class="muted">${escapeHtml(t("models.routingSaved"))}</p>`;
          }
          if (!ans.error) await showView("models");
        });

        document.getElementById("prov-save")?.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target);
          const preset = presetById(String(fd.get("preset") || ""));
          const pid = String(fd.get("id") || "").trim();
          const kind = String(fd.get("kind") || "");
          const baseUrl = String(fd.get("baseUrl") || "").trim();
          const model = String(fd.get("model") || "").trim();
          const label = String(fd.get("label") || preset?.label || pid).trim();
          const apiKey = String(fd.get("apiKey") || "").trim();
          const box = document.getElementById("prov-msg");
          const paramCountB = Number(fd.get("paramCountB"));
          const costRank = Number(fd.get("costRank"));
          const setAns = await rpc("home.setProvider", {
            id: pid,
            kind,
            ...(baseUrl ? { baseUrl } : {}),
            ...(model ? { model } : {}),
            label,
            enabled: true,
            ...(Number.isFinite(paramCountB) && paramCountB > 0 ? { paramCountB } : {}),
            ...(Number.isFinite(costRank) ? { costRank } : {}),
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
          if (box) {
            box.innerHTML = `<p class="muted">${escapeHtml(
              t(apiKey ? "models.savedWithKey" : "models.savedProvider", { id: pid }),
            )}</p>`;
          }
          await showView("models");
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

    if (id === "memory") {
      if (!aid) {
        el.innerHTML = `<h2>${escapeHtml(t("memory.title"))}</h2><p>${escapeHtml(t("profile.pick"))}</p>`;
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
      const cards = list
        .map(
          (l) => `<div class="card" data-id="${l.id}">
            <strong>${l.kind}</strong>
            <div class="muted">${escapeHtml(l.summary || l.diffKey || "")}</div>
            <div class="row">
              <button type="button" data-act="accept">${escapeHtml(t("app.accept"))}</button>
              <button type="button" data-act="reject">${escapeHtml(t("app.reject"))}</button>
            </div>
          </div>`,
        )
        .join("");
      const flushOn = mem.flushEnabled !== false;
      const reviewOn = mem.reviewEnabled !== false;
      const retention = mem.sessionRetentionDays ?? 180;
      const caps = (mem.notes || [])
        .map(
          (n) =>
            `<li><code>${escapeHtml(n.path)}</code> raw ${n.rawChars}/${n.rawSoftCap} inject ${n.injectChars}/${n.injectBudget}${n.truncated ? " truncated" : ""}</li>`,
        )
        .join("");
      el.innerHTML = `<h2>${escapeHtml(t("memory.title"))}</h2>
        <p class="muted">${escapeHtml(t("memory.hint"))} · backend <code>${escapeHtml(mem.backendId || "?")}</code>
          · pending ${mem.pendingLearnCount ?? list.length}/${mem.pendingLearnCap ?? "?"}</p>
        <form id="mem-settings" class="card">
          <h3>${escapeHtml(t("memory.flushReview"))}</h3>
          <label class="row"><input type="checkbox" name="flushEnabled" ${flushOn ? "checked" : ""} /> ${escapeHtml(t("memory.flushEnabled"))}</label>
          <label class="row"><input type="checkbox" name="reviewEnabled" ${reviewOn ? "checked" : ""} /> ${escapeHtml(t("memory.reviewEnabled"))}</label>
          <label>${escapeHtml(t("memory.sessionRetention"))} <input name="sessionRetentionDays" type="number" min="0" value="${retention}" /></label>
          <button type="submit">${escapeHtml(t("memory.saveSettings"))}</button>
        </form>
        <div class="card">
          <h3>${escapeHtml(t("memory.caps"))}</h3>
          <ul class="caps">${caps || `<li class='muted'>${escapeHtml(t("memory.noNotes"))}</li>`}</ul>
          <button type="button" id="compact-now">${escapeHtml(t("memory.compact"))}</button>
        </div>
        <h3>${escapeHtml(t("memory.pending"))}</h3>
        ${cards || `<p>${escapeHtml(t("memory.queueEmpty"))}</p>`}
        ${pre({ listMemory: listed, pendingLearns })}`;
      document.getElementById("mem-settings")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const ans = await rpc("home.setMemorySettings", {
          accountId: aid,
          flushEnabled: fd.get("flushEnabled") === "on",
          reviewEnabled: fd.get("reviewEnabled") === "on",
          sessionRetentionDays: Number(fd.get("sessionRetentionDays")),
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("memory");
      });
      document.getElementById("compact-now")?.addEventListener("click", async () => {
        const ans = await rpc("home.compactMemory", { accountId: aid });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("memory");
      });
      el.querySelectorAll(".card button[data-act]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const idLearn = btn.closest(".card").dataset.id;
          const method = btn.dataset.act === "accept" ? "home.acceptLearn" : "home.rejectLearn";
          const ans = await rpc(method, { accountId: aid, id: idLearn });
          el.insertAdjacentHTML("beforeend", pre(ans));
          await showView("memory");
        });
      });
      return;
    }

    if (id === "bindings") {
      const bindings = await rpc("home.listBindings", aid ? { accountId: aid } : {});
      // Owner list without accountId so unbound (accountId=null) are visible.
      const sources = await rpc("home.listSources", { bound: false });
      const rows = bindings.result?.bindings || [];
      const unbound = (sources.result?.sources || []).filter((s) => !s.bound || !s.accountId);
      const bindCards = rows
        .map((b) => {
          if (b.kind === "sender") {
            return `<div class="card">
              <strong>${escapeHtml(t("bindings.sender"))}</strong> <code>${escapeHtml(b.channel)}/${escapeHtml(b.channelAccount)}</code>
              <code>${escapeHtml(b.senderId)}</code> → <code>${escapeHtml(b.accountId)}</code>
              <button type="button" data-unbind="${escapeHtml(b.bindingId)}">${escapeHtml(t("bindings.remove"))}</button>
            </div>`;
          }
          return `<div class="card">
            <strong>${escapeHtml(t("bindings.device"))}</strong> <code>${escapeHtml(b.deviceId)}</code> → <code>${escapeHtml(b.accountId)}</code>
            ${b.ownerTrusted ? " · ownerTrusted" : ""}
            <button type="button" data-unbind="${escapeHtml(b.bindingId)}">${escapeHtml(t("bindings.remove"))}</button>
          </div>`;
        })
        .join("");
      const unboundList = unbound
        .map(
          (s) =>
            `<li><code>${escapeHtml(s.channel)}/${escapeHtml(s.sourceId)}</code> ` +
            `${escapeHtml(s.displayName || "")} · ${escapeHtml(s.class || "")}</li>`,
        )
        .join("");
      el.innerHTML = `<h2>${escapeHtml(t("bindings.title"))}</h2>
        <p class="muted">${escapeHtml(t("bindings.hint"))}</p>
        <form id="bind-sender" class="card">
          <h3>${escapeHtml(t("bindings.bindSender"))}</h3>
          <label>${escapeHtml(t("bindings.channel"))} <input name="channel" value="telegram" required /></label>
          <label>${escapeHtml(t("channels.channelAccount"))} <input name="channelAccount" value="default" required /></label>
          <label>${escapeHtml(t("channels.senderId"))} <input name="senderId" required /></label>
          <button type="submit">${escapeHtml(t("channels.bind"))}</button>
        </form>
        ${bindCards || `<p class='muted'>${escapeHtml(t("bindings.noBindings"))}</p>`}
        <h3>${escapeHtml(t("bindings.unboundObjects"))}</h3>
        <ul>${unboundList || `<li class='muted'>${escapeHtml(t("bindings.noneUnbound"))}</li>`}</ul>
        ${pre(bindings)}`;
      document.getElementById("bind-sender")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (!aid) return;
        const fd = new FormData(ev.target);
        const ans = await rpc("home.setBinding", {
          channel: fd.get("channel"),
          channelAccount: fd.get("channelAccount"),
          senderId: fd.get("senderId"),
          accountId: aid,
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("bindings");
      });
      el.querySelectorAll("[data-unbind]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const bindingId = btn.getAttribute("data-unbind");
          if (!bindingId) return;
          const ans = await rpc("home.removeBinding", { bindingId });
          el.insertAdjacentHTML("beforeend", pre(ans));
          await showView("bindings");
        });
      });
      return;
    }

    if (id === "harness") {
      const body = await rpc("home.listHarnesses", {});
      el.innerHTML = `<h2>${escapeHtml(t("harness.title"))}</h2>
        <p class="muted">${escapeHtml(t("harness.hint"))}</p>
        <form id="set-harness" class="card">
          <label>${escapeHtml(t("harness.id"))} <input name="harnessId" value="${escapeHtml(body.result?.defaultId || "envoy-harness")}" required /></label>
          <label class="row"><input type="checkbox" name="confirm" /> ${escapeHtml(t("harness.confirm"))}</label>
          <button type="submit">${escapeHtml(t("harness.set"))}</button>
        </form>
        ${pre(body)}`;
      document.getElementById("set-harness")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (!aid) return;
        const fd = new FormData(ev.target);
        const ans = await rpc("home.setHarness", {
          accountId: aid,
          harnessId: fd.get("harnessId"),
          ...(fd.get("confirm") === "on" ? { confirm: true } : {}),
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("harness");
      });
      return;
    }

    if (id === "skills") {
      const body = await rpc("home.listSkills", {});
      const skills = body.result?.skills || [];
      const cards = skills
        .map(
          (s) => `<div class="card">
            <strong>${escapeHtml(s.name || s.id)}</strong>
            · verified=${s.verified} · enabled=${s.enabled}
            <div class="row">
              <button type="button" data-verify="${escapeHtml(s.id)}">${escapeHtml(t("skills.verify"))}</button>
              <button type="button" data-remove="${escapeHtml(s.id)}">${escapeHtml(t("app.remove"))}</button>
            </div>
          </div>`,
        )
        .join("");
      el.innerHTML = `<h2>${escapeHtml(t("skills.title"))}</h2>
        <form id="install-skill" class="card">
          <h3>${escapeHtml(t("skills.install"))}</h3>
          <label>${escapeHtml(t("skills.source"))}
            <select name="source">
              <option value="path">${escapeHtml(t("skills.path"))}</option>
              <option value="url">${escapeHtml(t("skills.url"))}</option>
              <option value="clawhub">clawhub</option>
            </select>
          </label>
          <label>${escapeHtml(t("skills.ref"))} <input name="ref" required placeholder="/path/to/skill or URL" /></label>
          <button type="submit">${escapeHtml(t("skills.installAction"))}</button>
        </form>
        ${cards || `<p class='muted'>${escapeHtml(t("skills.none"))}</p>`}
        ${pre(body)}`;
      document.getElementById("install-skill")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const ans = await rpc("home.installSkill", {
          source: fd.get("source"),
          ref: fd.get("ref"),
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("skills");
      });
      el.querySelectorAll("[data-verify]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const ans = await rpc("home.verifySkill", { id: btn.getAttribute("data-verify") });
          el.insertAdjacentHTML("beforeend", pre(ans));
          await showView("skills");
        });
      });
      el.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const ans = await rpc("home.removeSkill", { id: btn.getAttribute("data-remove") });
          el.insertAdjacentHTML("beforeend", pre(ans));
          await showView("skills");
        });
      });
      return;
    }

    if (id === "workflows") {
      const body = await rpc("home.listWorkflows", {});
      const workflows = body.result?.workflows || [];
      const list = workflows
        .map(
          (w) =>
            `<li><code>${escapeHtml(w.id)}</code> · ${escapeHtml(w.source || "")}` +
            `${w.accountId ? ` · ${escapeHtml(w.accountId)}` : ""}</li>`,
        )
        .join("");
      el.innerHTML = `<h2>${escapeHtml(t("workflows.title"))}</h2>
        <button type="button" id="reload-wf">${escapeHtml(t("workflows.reload"))}</button>
        <ul>${list || `<li class='muted'>${escapeHtml(t("workflows.none"))}</li>`}</ul>
        ${pre(body)}`;
      document.getElementById("reload-wf")?.addEventListener("click", async () => {
        const ans = await rpc("home.reloadWorkflows", {});
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("workflows");
      });
      return;
    }

    if (id === "jobs") {
      if (!aid) {
        el.innerHTML = `<h2>${escapeHtml(t("jobs.title"))}</h2><p>${escapeHtml(t("profile.pick"))}</p>`;
        return;
      }
      const listed = await rpc("home.listSchedules", { accountId: aid });
      const jobs = listed.result?.jobs || [];
      const rows = jobs
        .map(
          (j) => `<tr data-id="${escapeHtml(j.id)}">
            <td><code>${escapeHtml(j.id)}</code></td>
            <td>${escapeHtml(j.name || "")}</td>
            <td>${escapeHtml(j.kind || "")}</td>
            <td>${escapeHtml(j.source || "")}</td>
            <td>${j.enabled ? "on" : "off"}</td>
            <td class="muted">${escapeHtml(j.nextRunAt || "—")}</td>
            <td class="row">
              <button type="button" data-act="toggle" data-en="${j.enabled ? "0" : "1"}">${escapeHtml(j.enabled ? t("app.disable") : t("app.enable"))}</button>
              <button type="button" data-act="run">${escapeHtml(t("app.run"))}</button>
              <button type="button" data-act="remove">${escapeHtml(t("app.remove"))}</button>
            </td>
          </tr>`,
        )
        .join("");
      el.innerHTML = `<h2>${escapeHtml(t("jobs.title"))}</h2>
        <p class="muted">${escapeHtml(t("jobs.hint"))}</p>
        <form id="job-propose" class="card">
          <h3>${escapeHtml(t("jobs.propose"))}</h3>
          <label>${escapeHtml(t("jobs.natural"))}
            <input name="text" required placeholder="${escapeHtml(t("jobs.naturalPlaceholder"))}" style="width:100%" />
          </label>
          <button type="submit">${escapeHtml(t("jobs.proposeAction"))}</button>
        </form>
        <div id="job-proposal"></div>
        <table class="card">
          <thead><tr><th>id</th><th>${escapeHtml(t("jobs.name"))}</th><th>kind</th><th>source</th><th></th><th>${escapeHtml(t("jobs.next"))}</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7" class="muted">${escapeHtml(t("jobs.none"))}</td></tr>`}</tbody>
        </table>
        ${pre(listed)}`;
      document.getElementById("job-propose")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const proposed = await rpc("home.proposeSchedule", {
          accountId: aid,
          text: String(fd.get("text") || ""),
        });
        const box = document.getElementById("job-proposal");
        if (!box) return;
        if (proposed.error) {
          box.innerHTML = pre(proposed);
          return;
        }
        const p = proposed.result || {};
        box.innerHTML = `<div class="card">
          <p><strong>${escapeHtml(p.resolvedLocal || "")}</strong>
            · ${escapeHtml(p.kind || "")}
            ${p.message ? ` · ${escapeHtml(p.message)}` : ""}</p>
          <button type="button" id="job-confirm" data-id="${escapeHtml(p.proposalId || "")}">${escapeHtml(t("jobs.confirmArm"))}</button>
          ${pre(proposed)}
        </div>`;
        document.getElementById("job-confirm")?.addEventListener("click", async () => {
          const ans = await rpc("home.confirmSchedule", {
            accountId: aid,
            proposalId: p.proposalId,
          });
          box.insertAdjacentHTML("beforeend", pre(ans));
          if (!ans.error) await showView("jobs");
        });
      });
      el.querySelectorAll("tr[data-id] button[data-act]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const jobId = btn.closest("tr").dataset.id;
          const act = btn.dataset.act;
          let ans;
          if (act === "toggle") {
            const enabled = btn.getAttribute("data-en") === "1";
            ans = await rpc("home.updateSchedule", { accountId: aid, jobId, enabled });
          } else if (act === "run") {
            ans = await rpc("home.runSchedule", { accountId: aid, jobId });
          } else {
            ans = await rpc("home.removeSchedule", { accountId: aid, jobId });
          }
          el.insertAdjacentHTML("beforeend", pre(ans));
          if (!ans.error) await showView("jobs");
        });
      });
      return;
    }

    if (id === "artifacts") {
      if (!aid) {
        el.innerHTML = `<h2>${escapeHtml(t("artifacts.title"))}</h2><p>${escapeHtml(t("profile.pick"))}</p>`;
        return;
      }
      const body = await rpc("home.listArtifacts", { accountId: aid });
      const arts = body.result?.artifacts || [];
      const cards = arts
        .map(
          (a) => `<div class="card">
            <code>${escapeHtml(a.path || a.id)}</code>
            <div class="muted">${escapeHtml(a.createdAt || "")}</div>
            <button type="button" data-path="${escapeHtml(a.path)}">${escapeHtml(t("artifacts.open"))}</button>
          </div>`,
        )
        .join("");
      el.innerHTML = `<h2>${escapeHtml(t("artifacts.title"))}</h2>
        <p class="muted">${escapeHtml(t("artifacts.hint"))}</p>
        ${cards || `<p class='muted'>${escapeHtml(t("artifacts.none"))}</p>`}
        <div id="art-url"></div>
        ${pre(body)}`;
      el.querySelectorAll("[data-path]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const path = btn.getAttribute("data-path");
          const ans = await rpc("home.getArtifactUrl", { accountId: aid, path, ttlSec: 3600 });
          const box = document.getElementById("art-url");
          if (box && ans.result?.url) {
            box.innerHTML = `<p><a href="${escapeHtml(ans.result.url)}" target="_blank" rel="noopener">${escapeHtml(ans.result.url)}</a></p>
              <p class="muted">${escapeHtml(t("artifacts.expires", { at: ans.result.expiresAt || "" }))}</p>`;
          } else if (box) {
            box.innerHTML = pre(ans);
          }
        });
      });
      return;
    }

    if (id === "smarthome") {
      // Full registry for owner (unbound rows have accountId=null and vanish with account filter).
      const sourcesBody = await rpc("home.listSources", {});
      const sources = sourcesBody.result?.sources || [];
      const unbound = sources.filter((s) => !s.bound || s.accountId == null);
      const bound = sources.filter(
        (s) => s.bound && s.accountId && (!aid || s.accountId === aid || s.shared),
      );
      const actuations = await rpc("home.listActuations", {
        ...(aid ? { accountId: aid } : {}),
        limit: 20,
      });
      const mqttSt = await rpc("home.getChannelStatus", { id: "mqtt" }).catch(() => null);
      const haSt = await rpc("home.getChannelStatus", { id: "homeassistant" }).catch(() => null);
      const classOpts = OBJECT_CLASSES.map((c) => `<option value="${c}">${c}</option>`).join("");
      const unboundCards = unbound
        .map(
          (s) => `<div class="card" data-ch="${escapeHtml(s.channel)}" data-ca="${escapeHtml(s.channelAccount)}" data-sid="${escapeHtml(s.sourceId)}">
            <strong>${escapeHtml(s.displayName || s.sourceId)}</strong>
            <div class="muted"><code>${escapeHtml(s.channel)}/${escapeHtml(s.sourceId)}</code> · ${escapeHtml(s.class || "other")}</div>
            <button type="button" data-fill-bind>${escapeHtml(t("smarthome.fillBind"))}</button>
          </div>`,
        )
        .join("");
      const boundCards = bound
        .map((s) => {
          const presence = PRESENCE_CLASSES.has(s.class);
          return `<div class="card">
            <strong>${escapeHtml(s.displayName || s.sourceId)}</strong>
            → <code>${escapeHtml(s.accountId)}</code>
            <div class="muted">${escapeHtml(s.class)} · shared=${s.shared}${
              presence ? ` (${escapeHtml(t("smarthome.presenceNoShare"))})` : ""
            } · neverUnattended=${s.neverUnattended}</div>
            <div class="row">
              <button type="button" data-toggle-nu="${escapeHtml(s.channel)}" data-ca="${escapeHtml(s.channelAccount)}" data-sid="${escapeHtml(s.sourceId)}" data-nu="${s.neverUnattended ? "0" : "1"}" data-cls="${escapeHtml(s.class)}" data-shared="${s.shared ? "1" : "0"}">
                ${escapeHtml(t("smarthome.toggleNu"))}
              </button>
              <button type="button" data-toggle-shared="${escapeHtml(s.channel)}" data-ca="${escapeHtml(s.channelAccount)}" data-sid="${escapeHtml(s.sourceId)}" data-nu="${s.neverUnattended ? "1" : "0"}" data-cls="${escapeHtml(s.class)}" data-shared="${s.shared ? "0" : "1"}" ${presence ? `disabled title="${escapeHtml(t("smarthome.presenceNoShare"))}"` : ""}>
                ${escapeHtml(t("smarthome.toggleShared"))}
              </button>
              <button type="button" data-unbind-src="${escapeHtml(s.channel)}" data-ca="${escapeHtml(s.channelAccount)}" data-sid="${escapeHtml(s.sourceId)}">${escapeHtml(t("smarthome.unbind"))}</button>
            </div>
          </div>`;
        })
        .join("");
      const journal = (actuations.result?.actuations || [])
        .map(
          (a) => `<tr>
            <td><code>${escapeHtml(a.objectId)}</code></td>
            <td>${escapeHtml(a.desiredState || "")}</td>
            <td>${escapeHtml(a.outcome || "")}</td>
            <td>${escapeHtml(String(a.stateChanged ?? ""))}</td>
            <td>${escapeHtml(a.risk || "")}</td>
          </tr>`,
        )
        .join("");
      el.innerHTML = `<h2>${escapeHtml(t("smarthome.title"))}</h2>
        <p class="muted">${escapeHtml(t("smarthome.hint"))}</p>
        <div class="card">
          <h3>${escapeHtml(t("smarthome.health"))}</h3>
          <p>MQTT: ${escapeHtml(JSON.stringify(mqttSt?.result || mqttSt?.error || "—"))}</p>
          <p>Home Assistant: ${escapeHtml(JSON.stringify(haSt?.result || haSt?.error || "—"))}</p>
          <p class="muted">${escapeHtml(t("smarthome.readOnlyHint"))}</p>
        </div>
        <h3>${escapeHtml(t("smarthome.unbound"))}</h3>
        ${unboundCards || `<p class='muted'>${escapeHtml(t("smarthome.noneUnbound"))}</p>`}
        <form id="bind-form" class="card">
          <h3>${escapeHtml(t("smarthome.bindObject"))}</h3>
          <label>${escapeHtml(t("bindings.channel"))} <input name="channel" id="sh-channel" required placeholder="homeassistant" /></label>
          <label>${escapeHtml(t("channels.channelAccount"))} <input name="channelAccount" id="sh-ca" value="default" required /></label>
          <label>${escapeHtml(t("smarthome.sourceId"))} <input name="sourceId" id="sh-sid" required /></label>
          <label>${escapeHtml(t("smarthome.class"))} <select name="class" id="sh-class">${classOpts}</select></label>
          <label class="row"><input type="checkbox" name="shared" id="sh-shared" /> ${escapeHtml(t("smarthome.shared"))}</label>
          <label class="row"><input type="checkbox" name="neverUnattended" id="sh-nu" /> ${escapeHtml(t("smarthome.neverUnattended"))}</label>
          <label>${escapeHtml(t("smarthome.mqttAllow"))} <input name="allow" placeholder="topic/cmd" /></label>
          <button type="submit">${escapeHtml(t("smarthome.bindAction"))}</button>
        </form>
        <h3>${escapeHtml(t("smarthome.bound"))}</h3>
        ${boundCards || `<p class='muted'>${escapeHtml(t("smarthome.noneBound"))}</p>`}
        <h3>${escapeHtml(t("smarthome.journal"))}</h3>
        <table class="card" style="width:100%;border-collapse:collapse">
          <thead><tr><th>${escapeHtml(t("approvals.object"))}</th><th>${escapeHtml(t("smarthome.desired"))}</th><th>${escapeHtml(t("smarthome.outcome"))}</th><th>${escapeHtml(t("smarthome.stateChanged"))}</th><th>${escapeHtml(t("smarthome.risk"))}</th></tr></thead>
          <tbody>${journal || `<tr><td colspan=5 class='muted'>${escapeHtml(t("smarthome.empty"))}</td></tr>`}</tbody>
        </table>`;
      const syncSharedGate = () => {
        const cls = document.getElementById("sh-class")?.value;
        const shared = document.getElementById("sh-shared");
        if (shared && PRESENCE_CLASSES.has(cls)) {
          shared.checked = false;
          shared.disabled = true;
        } else if (shared) {
          shared.disabled = false;
        }
      };
      document.getElementById("sh-class")?.addEventListener("change", syncSharedGate);
      syncSharedGate();
      el.querySelectorAll("[data-fill-bind]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = btn.closest(".card");
          document.getElementById("sh-channel").value = card.dataset.ch || "";
          document.getElementById("sh-ca").value = card.dataset.ca || "default";
          document.getElementById("sh-sid").value = card.dataset.sid || "";
        });
      });
      document.getElementById("bind-form")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (!aid) return;
        const fd = new FormData(ev.target);
        const cls = String(fd.get("class") || "other");
        const shared = fd.get("shared") === "on" && !PRESENCE_CLASSES.has(cls);
        const allow = String(fd.get("allow") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const ans = await rpc("home.setSourceBinding", {
          accountId: aid,
          channel: fd.get("channel"),
          channelAccount: fd.get("channelAccount"),
          sourceId: fd.get("sourceId"),
          class: cls,
          shared,
          neverUnattended: fd.get("neverUnattended") === "on",
          ...(allow.length ? { actuationAllowList: allow } : {}),
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("smarthome");
      });
      const rebindFlags = async (btn, shared, neverUnattended) => {
        if (!aid) return;
        const ans = await rpc("home.setSourceBinding", {
          accountId: aid,
          channel: btn.getAttribute("data-toggle-nu") || btn.getAttribute("data-toggle-shared"),
          channelAccount: btn.getAttribute("data-ca"),
          sourceId: btn.getAttribute("data-sid"),
          class: btn.getAttribute("data-cls"),
          shared,
          neverUnattended,
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("smarthome");
      };
      el.querySelectorAll("[data-toggle-nu]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await rebindFlags(btn, btn.getAttribute("data-shared") === "1", btn.getAttribute("data-nu") === "1");
        });
      });
      el.querySelectorAll("[data-toggle-shared]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const cls = btn.getAttribute("data-cls");
          if (PRESENCE_CLASSES.has(cls)) return;
          await rebindFlags(btn, btn.getAttribute("data-shared") === "1", btn.getAttribute("data-nu") === "1");
        });
      });
      el.querySelectorAll("[data-unbind-src]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const ans = await rpc("home.removeSourceBinding", {
            channel: btn.getAttribute("data-unbind-src"),
            channelAccount: btn.getAttribute("data-ca"),
            sourceId: btn.getAttribute("data-sid"),
          });
          el.insertAdjacentHTML("beforeend", pre(ans));
          await showView("smarthome");
        });
      });
      return;
    }

    if (id === "doctor") {
      const body = await rpc("home.doctor", {});
      let supervised = null;
      try {
        const invoke = globalThis.__TAURI__?.core?.invoke;
        if (typeof invoke === "function") supervised = await invoke("daemon_status");
      } catch {
        supervised = null;
      }
      el.innerHTML = `<h2>${escapeHtml(t("doctor.title"))}</h2>
        ${supervised ? pre({ tauriSupervise: supervised }) : ""}
        <button type="button" id="fix-safe">${escapeHtml(t("doctor.apply"))}</button>
        ${pre(body)}`;
      document.getElementById("fix-safe")?.addEventListener("click", async () => {
        const issues = body.result?.issues || [];
        const issueIds = issues.filter((i) => i.autoFixable).map((i) => i.id);
        const ans = await rpc("home.doctorFix", { issueIds });
        el.insertAdjacentHTML("beforeend", pre(ans));
      });
      return;
    }

    if (id === "advanced") {
      const status = await rpc("home.getServiceStatus");
      const health = await rpc("home.health");
      const mesh = await rpc("home.meshStatus");
      const grantsBody = aid
        ? await rpc("home.listGrants", { accountId: aid }).catch(() => ({ result: { grants: [] } }))
        : { result: { grants: [] } };
      const grants = grantsBody.result?.grants || [];
      const grantCards = grants
        .map(
          (g) => `<div class="card" data-grant="${escapeHtml(g.id)}">
            <strong>${escapeHtml(g.tool || g.id)}</strong>
            <div class="muted">${escapeHtml(g.scope || "")} · ${escapeHtml(String(g.argsDigest || "").slice(0, 16))}…</div>
            <button type="button" data-revoke-grant="${escapeHtml(g.id)}">${escapeHtml(t("approvals.revokeGrant"))}</button>
          </div>`,
        )
        .join("");
      const h = health.result || {};
      const svc = status.result || status;
      el.innerHTML = `<h2>${escapeHtml(t("advanced.title"))}</h2>
        <p class="muted">${escapeHtml(t("advanced.privacyHint"))}</p>
        <label class="row">${escapeHtml(t("advanced.wsUrl"))} <input id="ws" value="${wsUrl()}" style="min-width:20rem" /></label>
        <button type="button" id="save-ws">${escapeHtml(t("advanced.saveReconnect"))}</button>
        <div class="card" id="listen-card">
          <h3>${escapeHtml(t("advanced.listen"))}</h3>
          <p>wsPort <code>${h.wsPort ?? "?"}</code> · httpPort <code>${h.httpPort ?? "?"}</code></p>
          <p>${escapeHtml(t("advanced.publicBaseUrl"))} <code>${escapeHtml(h.publicBaseUrl || "")}</code></p>
        </div>
        <div class="card">
          <h3>${escapeHtml(t("advanced.osService"))}</h3>
          <p class="muted">installed=${svc.installed} running=${svc.running} manager=${svc.manager}</p>
          <div class="row">
            <button type="button" id="svc-install">${escapeHtml(t("app.install"))}</button>
            <button type="button" id="svc-restart">${escapeHtml(t("app.restart"))}</button>
            <button type="button" id="svc-uninstall">${escapeHtml(t("app.uninstall"))}</button>
          </div>
        </div>
        <div class="card">
          <h3>${escapeHtml(t("advanced.mobilePush"))}</h3>
          <p class="muted">${escapeHtml(t("advanced.mobilePushHint"))}</p>
          <button type="button" id="push-test">${escapeHtml(t("advanced.sendTestPush"))}</button>
        </div>
        <div class="card">
          <h3>${escapeHtml(t("approvals.grants"))}</h3>
          <p class="muted">${escapeHtml(t("approvals.grantsHint"))}</p>
          ${grantCards || `<p class="muted">${escapeHtml(t("approvals.noGrants"))}</p>`}
        </div>
        <h3>${escapeHtml(t("advanced.serviceClaim"))}</h3>${pre(status)}
        <h3>${escapeHtml(t("advanced.mesh"))}</h3>${pre(mesh)}
        <h3>${escapeHtml(t("chat.liveEvents"))}</h3>${pre(liveEvents.slice(0, 12))}`;
      el.querySelectorAll("[data-revoke-grant]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const grantId = btn.getAttribute("data-revoke-grant");
          if (!grantId) return;
          const ans = await rpc("home.revokeGrant", { id: grantId });
          if (ans.error) showToast(errMsg(ans), "err");
          else showToast(t("approvals.grantRevoked"), "ok");
          await showView("advanced");
        });
      });
      document.getElementById("save-ws")?.addEventListener("click", () => {
        localStorage.setItem("envoyhome.wsUrl", document.getElementById("ws").value.trim());
        if (sock) sock.close();
        connect();
      });
      document.getElementById("svc-install")?.addEventListener("click", async () => {
        const ans = await rpc("home.installService", { manager: "auto" });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("advanced");
      });
      document.getElementById("svc-restart")?.addEventListener("click", async () => {
        const ans = await rpc("home.restartService", {});
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("advanced");
      });
      document.getElementById("svc-uninstall")?.addEventListener("click", async () => {
        if (!confirm(t("advanced.confirmUninstall"))) return;
        const ans = await rpc("home.uninstallService", { confirm: true });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("advanced");
      });
      document.getElementById("push-test")?.addEventListener("click", async () => {
        const ans = await rpc("home.sendTestPush", {
          title: t("app.name"),
          body: t("advanced.testPushBody"),
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
      });
      return;
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

initLocale();
applyDomI18n();
onLocaleChange(() => {
  applyDomI18n();
  renderNav(activeView);
  if (sock && sock.readyState === WebSocket.OPEN) void showView(activeView);
});
renderNav(activeView);
connect();
