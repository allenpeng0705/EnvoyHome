// Thin Settings shell — Design §10. Persistent WS, live events, Chat / Models / Pairing.

import QRCode from "qrcode";
import { PROVIDER_PRESETS, presetById } from "./provider-presets.js";

const DEFAULT_WS = "ws://127.0.0.1:4780/ws";

const VIEWS = [
  { id: "chat", label: "Chat", group: "Home" },
  { id: "approvals", label: "Approvals", group: "Home" },
  { id: "accounts", label: "Accounts", group: "Household" },
  { id: "bindings", label: "Bindings", group: "Household" },
  { id: "pairing", label: "Pairing", group: "Household" },
  { id: "channels", label: "Channels", group: "Household" },
  { id: "models", label: "Models", group: "Intelligence" },
  { id: "harness", label: "Harness", group: "Intelligence" },
  { id: "memory", label: "Memory", group: "Intelligence" },
  { id: "skills", label: "Skills", group: "Automation" },
  { id: "workflows", label: "Workflows", group: "Automation" },
  { id: "jobs", label: "Jobs", group: "Automation" },
  { id: "smarthome", label: "Smart home", group: "Automation" },
  { id: "artifacts", label: "Artifacts", group: "Ops" },
  { id: "doctor", label: "Doctor", group: "Ops" },
  { id: "advanced", label: "Advanced", group: "Ops" },
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
  const t = String(a?.tool || "");
  return (
    t === "ha_call_service" ||
    t === "mqtt_publish" ||
    Boolean(a?.objectId) ||
    a?.safetyClass === true
  );
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

function connect() {
  if (sock && (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const url = wsUrl();
  setConnChrome("connecting", "Connecting…", url, `Connecting ${url}…`);
  sock = new WebSocket(url);
  sock.onopen = async () => {
    setConnChrome("ok", "Connected", url, `Connected ${url}`);
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
      const product = h?.product || "EnvoyHome";
      const ver = h?.version || "";
      setConnChrome(
        healthOk ? "ok" : "bad",
        healthOk ? `${product} ready` : `${product} degraded`,
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
        "RPC failed",
        url,
        `Connected but RPC failed: ${err instanceof Error ? err.message : String(err)}`,
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
      if (activeView === "approvals" && name.includes("approval")) void showView("approvals");
      if (name === "home:approval-needed") {
        showToast("Approval needed — open Approvals", "ok");
      }
    }
  };
  sock.onerror = () => {
    setConnChrome(
      "bad",
      "Daemon unreachable",
      url,
      "WebSocket error — daemon not reachable. Tauri app supervises on launch, or: pnpm --filter @envoyhome/daemon dev",
    );
  };
  sock.onclose = () => {
    setConnChrome("connecting", "Disconnected", "retrying in 2s…", "Disconnected — retrying in 2s…");
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

function renderNav(active) {
  const nav = document.getElementById("nav");
  const groups = [];
  for (const v of VIEWS) {
    const g = v.group || "Other";
    if (!groups.includes(g)) groups.push(g);
  }
  let html = `<div class="nav-brand"><img src="/logo.png" width="28" height="28" alt="" /><span>EnvoyHome</span></div>`;
  for (const g of groups) {
    html += `<div class="nav-group">${escapeHtml(g)}</div>`;
    html += VIEWS.filter((v) => (v.group || "Other") === g)
      .map(
        (v) =>
          `<button type="button" data-view="${v.id}" class="${v.id === active ? "active" : ""}">${escapeHtml(
            v.label,
          )}</button>`,
      )
      .join("");
  }
  nav.innerHTML = html;
  nav.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
}

function accountPickerHtml(accounts) {
  const cur = accountId();
  const opts = accounts
    .map(
      (a) =>
        `<option value="${escapeHtml(a.accountId)}" ${a.accountId === cur ? "selected" : ""}>${escapeHtml(
          a.displayName || a.accountId,
        )}</option>`,
    )
    .join("");
  return `<div class="account-bar"><label>Account <select id="acct">${
    opts || '<option value="">(none)</option>'
  }</select></label><span class="muted">Scoped settings use this account</span></div>`;
}

function bindAccountPicker() {
  const sel = document.getElementById("acct");
  if (!sel) return;
  sel.addEventListener("change", () => {
    setAccountId(sel.value);
    showView(activeView);
  });
}

async function listAccountRows() {
  const res = await rpc("home.listAccounts");
  if (res.error) throw new Error(res.error.message || "listAccounts failed");
  const accounts = res.result?.accounts || [];
  if (!accountId() && accounts[0]) setAccountId(accounts[0].accountId);
  return accounts;
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
  const opened = await rpc("home.openSession", { accountId: aid, title: "Settings chat" });
  if (opened.error) throw new Error(errMsg(opened));
  chatSessionId = opened.result.sessionId;
  return chatSessionId;
}

async function showView(id) {
  activeView = id;
  renderNav(id);
  const el = document.getElementById("view");
  el.innerHTML = `<h2>${id}</h2><p>Loading…</p>`;
  try {
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      el.innerHTML = `<h2>${id}</h2><p>Waiting for daemon connection…</p>`;
      return;
    }
    const accounts = await listAccountRows();
    const aid = accountId();

    if (id === "chat") {
      if (!aid) {
        el.innerHTML = `<h2>Chat</h2>
          <div class="empty">
            <p>Create an account first, then come back to chat.</p>
            <p class="muted">Loopback Settings chat — or enable Telegram under Channels.</p>
            <button type="button" id="go-accounts">Open Accounts</button>
          </div>`;
        document.getElementById("go-accounts")?.addEventListener("click", () => showView("accounts"));
        return;
      }
      const bubbles = chatLog
        .map(
          (m) =>
            `<div class="bubble ${escapeHtml(m.role)}"><strong>${escapeHtml(m.role)}</strong>${escapeHtml(
              m.text,
            )}</div>`,
        )
        .join("");
      el.innerHTML = `<h2>Chat</h2>${accountPickerHtml(accounts)}
        <p class="muted">Desktop loopback turn · session ${
          chatSessionId ? `<code>${escapeHtml(chatSessionId)}</code>` : "(opens on first send)"
        }</p>
        <div class="chat-layout">
          <div class="chat-log" id="chat-log">${
            bubbles || `<div class="empty">No messages yet — say hello to your home agent.</div>`
          }</div>
          <form id="chat-form" class="chat-composer">
            <input name="text" placeholder="Message the home agent…" autocomplete="off" required />
            <button type="submit">Send</button>
          </form>
        </div>
        <details class="card">
          <summary>Live events</summary>
          ${pre(liveEvents.slice(0, 8))}
        </details>`;
      bindAccountPicker();
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
            showToast(errMsg(sent) || "Send failed", "err");
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
          ? `<div class="empty">No household accounts yet.</div>`
          : accounts
              .map(
                (a) => `<div class="card">
            <strong>${escapeHtml(a.displayName || a.accountId)}</strong>
            ${a.accountId === aid ? '<span class="badge">active</span>' : ""}
            <div class="muted"><code>${escapeHtml(a.accountId)}</code>${
              a.createdAt ? ` · ${escapeHtml(a.createdAt)}` : ""
            }</div>
            <div class="row">
              <button type="button" class="secondary" data-use="${escapeHtml(a.accountId)}">Use</button>
            </div>
          </div>`,
              )
              .join("");
      el.innerHTML = `<h2>Accounts</h2>${accountPickerHtml(accounts)}
        ${cards}
        <form id="create-acct" class="card">
          <h3>Create account</h3>
          <label>Display name <input name="displayName" required placeholder="Alice" /></label>
          <label>Account id (optional) <input name="accountId" placeholder="alice" /></label>
          <button type="submit">Create</button>
        </form>`;
      bindAccountPicker();
      el.querySelectorAll("[data-use]").forEach((btn) => {
        btn.addEventListener("click", () => {
          setAccountId(btn.getAttribute("data-use") || "");
          showToast(`Using ${btn.getAttribute("data-use")}`);
          showView("accounts");
        });
      });
      document.getElementById("create-acct")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const params = { displayName: fd.get("displayName") };
        if (fd.get("accountId")) params.accountId = fd.get("accountId");
        const ans = await rpc("home.createAccount", params);
        if (ans.error) {
          showToast(errMsg(ans) || "Create failed", "err");
          return;
        }
        if (ans.result?.account?.accountId) {
          setAccountId(ans.result.account.accountId);
          showToast(`Created ${ans.result.account.accountId}`);
        }
        await showView("accounts");
      });
      return;
    }

    if (id === "pairing") {
      const body = await rpc("home.listPairedDevices");
      const devices = body.result?.devices || [];
      const deviceCards = devices
        .map(
          (d) => `<div class="card" data-device="${escapeHtml(d.deviceId)}">
            <strong>${escapeHtml(d.label || d.deviceId)}</strong>
            ${d.revoked ? '<span class="muted"> · revoked</span>' : ""}
            <div class="muted">accounts: ${(d.accountIds || []).map((a) => escapeHtml(a)).join(", ") || "(none)"}</div>
            <div class="row">
              ${
                d.revoked
                  ? ""
                  : `<button type="button" data-revoke="${escapeHtml(d.deviceId)}">home.revokePairedDevice</button>`
              }
            </div>
          </div>`,
        )
        .join("");
      el.innerHTML = `<h2>Pairing</h2>${accountPickerHtml(accounts)}
        <form id="mint-form" class="card">
          <h3>Mint pairing</h3>
          <label>deviceLabel <input name="deviceLabel" value="phone" required /></label>
          <label>host <input name="host" value="127.0.0.1" required /></label>
          <label>lanHost <input name="lanHost" value="127.0.0.1" required /></label>
          <button type="submit">home.mintPairing</button>
        </form>
        <div id="mint-out"></div>
        <h3>Paired devices</h3>
        ${deviceCards || "<p class='muted'>No devices yet.</p>"}
        ${pre(body)}`;
      bindAccountPicker();
      document.getElementById("mint-form")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const params = {
          deviceLabel: fd.get("deviceLabel"),
          host: fd.get("host"),
          lanHost: fd.get("lanHost"),
        };
        if (aid) params.accountIds = [aid];
        const ans = await rpc("home.mintPairing", params);
        const out = document.getElementById("mint-out");
        if (!out) return;
        if (ans.result?.uri) {
          const uri = String(ans.result.uri);
          let qrHtml = "";
          try {
            const dataUrl = await QRCode.toDataURL(uri, { width: 220, margin: 1 });
            qrHtml = `<img id="pairing-qr" class="pairing-qr" alt="Pairing QR" src="${dataUrl}" width="220" height="220" />`;
          } catch (err) {
            qrHtml = `<p class="muted">QR unavailable: ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
          }
          out.innerHTML = `<div class="card pairing-mint">
            ${qrHtml}
            <p><strong>URI</strong><br/><code style="word-break:break-all">${escapeHtml(uri)}</code></p>
          </div>${pre(ans)}`;
        } else {
          out.innerHTML = pre(ans);
        }
      });
      el.querySelectorAll("[data-revoke]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const deviceId = btn.getAttribute("data-revoke");
          if (!deviceId) return;
          const ans = await rpc("home.revokePairedDevice", { deviceId });
          el.insertAdjacentHTML("beforeend", pre(ans));
          await showView("pairing");
        });
      });
      return;
    }

    if (id === "approvals") {
      if (!aid) {
        el.innerHTML = `<h2>Approvals</h2><p>Create an account first.</p>`;
        return;
      }
      const body = await rpc("home.listApprovals", { accountId: aid });
      const grantsBody = await rpc("home.listGrants", { accountId: aid });
      const rows = body.result?.approvals || [];
      const grants = grantsBody.result?.grants || [];
      const cards = rows
        .map((a) => {
          const actuation = isActuationApproval(a);
          const label = actuation
            ? `<span class="badge">actuation</span> `
            : "";
          const target = a.objectId
            ? `<div class="muted">object <code>${escapeHtml(a.objectId)}</code>${
                a.desiredState ? ` → ${escapeHtml(a.desiredState)}` : ""
              }</div>`
            : "";
          return `<div class="card" data-id="${a.id}">
            ${label}<strong>${escapeHtml(a.tool || "")}</strong> · ${escapeHtml(a.risk || "")} · ${escapeHtml(a.origin || "")}
            <div class="muted">${escapeHtml(a.summary || a.argsDigest || "")}</div>
            ${target}
            <div class="row">
              <button type="button" data-act="allow">Allow</button>
              <button type="button" data-act="deny">Deny</button>
            </div>
          </div>`;
        })
        .join("");
      const grantCards = grants
        .map(
          (g) => `<div class="card" data-grant="${escapeHtml(g.id)}">
            <strong>${escapeHtml(g.tool || g.id)}</strong>
            <div class="muted">${escapeHtml(g.scope || "")} · ${escapeHtml(g.argsDigest || "").slice(0, 16)}…</div>
            <button type="button" data-revoke-grant="${escapeHtml(g.id)}">home.revokeGrant</button>
          </div>`,
        )
        .join("");
      el.innerHTML = `<h2>Approvals</h2>${accountPickerHtml(accounts)}
        <p class="muted">${rows.length} pending · ${grants.length} grants · ${liveEvents.length} buffered events</p>
        ${cards || "<p>None pending.</p>"}
        <h3>Grants</h3>
        ${grantCards || "<p class='muted'>No durable grants.</p>"}
        <h3>Recent events</h3>${pre(liveEvents.slice(0, 8))}`;
      bindAccountPicker();
      el.querySelectorAll(".card [data-act]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const card = btn.closest(".card");
          const approval = rows.find((r) => r.id === card.dataset.id);
          if (!approval) return;
          const ans = await rpc("home.answerApproval", {
            id: approval.id,
            decision: btn.dataset.act === "allow" ? "allow" : "deny",
            argsDigest: approval.argsDigest,
            scope: "once",
          });
          el.insertAdjacentHTML("beforeend", pre(ans));
          await showView("approvals");
        });
      });
      el.querySelectorAll("[data-revoke-grant]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const grantId = btn.getAttribute("data-revoke-grant");
          if (!grantId) return;
          const ans = await rpc("home.revokeGrant", { id: grantId });
          el.insertAdjacentHTML("beforeend", pre(ans));
          await showView("approvals");
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
            `sender <code>${escapeHtml(b.senderId || b.deviceId || "")}</code> → ` +
            `<code>${escapeHtml(b.accountId || "")}</code> ` +
            `<button type="button" data-unbind="${escapeHtml(b.bindingId || "")}">remove</button></li>`,
        )
        .join("");
      el.innerHTML = `<h2>Channels</h2>
        <p class="muted">Enable <strong>Telegram</strong> with a bot token (V-UX-3). Full checklist: <code>docs/telegram-demo-setup.md</code></p>
        <table class="card" style="width:100%;border-collapse:collapse">
          <thead><tr><th>Channel</th><th>Kind</th><th>Status</th></tr></thead>
          <tbody>${rows || "<tr><td colspan=3>none</td></tr>"}</tbody>
        </table>
        ${tgStatus ? `<p class="muted">telegram health: ${escapeHtml(JSON.stringify(tgStatus.result || tgStatus.error))}</p>` : ""}
        <form id="tg-config" class="card">
          <h3>Telegram demo</h3>
          <label>channelAccount <input name="channelAccount" value="default" /></label>
          <label>botToken <input name="botToken" type="password" autocomplete="off" placeholder="from @BotFather" /></label>
          <label>apiBase (optional) <input name="apiBase" placeholder="https://api.telegram.org" /></label>
          <div class="row">
            <button type="submit">home.setChannelConfig</button>
            <button type="button" id="tg-enable">home.enableChannel</button>
            <button type="button" id="tg-disable">home.disableChannel</button>
          </div>
        </form>
        <form id="tg-bind" class="card">
          <h3>Bind Telegram sender → account</h3>
          <p class="muted">User DMs the bot; if unbound, bot replies with numeric <code>senderId</code>. Paste it here.</p>
          ${accountPickerHtml(accounts)}
          <label>senderId <input name="senderId" required placeholder="123456789" /></label>
          <label>channelAccount <input name="channelAccount" value="default" /></label>
          <button type="submit">home.setBinding</button>
          <ul>${bindRows || "<li class='muted'>No Telegram bindings yet.</li>"}</ul>
        </form>
        <form id="mqtt-config" class="card">
          <h3>MQTT (event-source, read-only)</h3>
          <label>brokerUrl <input name="brokerUrl" placeholder="mqtt://127.0.0.1:1883" /></label>
          <label>username <input name="username" autocomplete="off" /></label>
          <label>password <input name="password" type="password" autocomplete="off" /></label>
          <div class="row">
            <button type="submit">setChannelConfig mqtt</button>
            <button type="button" id="mqtt-enable">enable</button>
          </div>
        </form>
        <form id="ha-config" class="card">
          <h3>Home Assistant (event-source, read-only token)</h3>
          <label>baseUrl <input name="baseUrl" placeholder="http://homeassistant.local:8123" /></label>
          <label>accessToken <input name="accessToken" type="password" autocomplete="off" /></label>
          <div class="row">
            <button type="submit">setChannelConfig homeassistant</button>
            <button type="button" id="ha-enable">enable</button>
          </div>
        </form>
        ${pre(body)}`;
      bindAccountPicker();
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
          el.insertAdjacentHTML("beforeend", pre({ error: { message: "pick an account" } }));
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
          ? "Mesh Local"
          : localMode === "spawn"
            ? "Home llama-server"
            : localMode === "ollama"
              ? "Ollama"
              : "Off";
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
            ${p.id === defaultId ? '<span class="muted"> · default</span>' : ""}
            ${p.enabled ? "" : '<span class="muted"> · disabled</span>'}
            <div class="muted">${escapeHtml(p.kind)} · ${escapeHtml(place)} · secret=${p.hasSecret ? "yes" : "no"}</div>
            <div class="muted"><code>${escapeHtml(p.baseUrl || "")}</code> · model <code>${escapeHtml(p.model || "")}</code></div>
            ${props ? `<div class="muted">${escapeHtml(props)}</div>` : ""}
            <div class="row">
              <button type="button" data-test="${escapeHtml(p.id)}">Test</button>
              <button type="button" class="secondary" data-toggle="${escapeHtml(p.id)}" data-en="${p.enabled ? "0" : "1"}">${
                p.enabled ? "Disable" : "Enable"
              }</button>
              <button type="button" class="secondary" data-remove="${escapeHtml(p.id)}">Remove</button>
            </div>
          </div>`;
        })
        .join("");

      const ggufList =
        ggufs.length > 0
          ? `<ul class="le-gguf">${ggufs.map((n) => `<li><code>${escapeHtml(n)}</code></li>`).join("")}</ul>`
          : `<p class="muted">No <code>.gguf</code> files in state <code>local-engine/models/</code> yet — needed only for Spawn.</p>`;

      el.innerHTML = `<h2>Models</h2>
        <div class="card" id="local-engine-card">
          <h3>Local model</h3>
          <p>
            <span class="status-pill ${engineOn ? (healthy ? "ok" : "bad") : ""}">${escapeHtml(modeLabel)}</span>
            <span class="status-pill ${healthy ? "ok" : engineOn ? "bad" : ""}">${
              engineOn ? (healthy ? "responding" : "not responding") : "disabled"
            }</span>
            <span class="muted">Mesh engine ${localStatus.meshAttachAvailable ? "available" : "not running"} · runtime ${
              localStatus.runtimeInstalled ? "installed" : "not installed"
            }</span>
          </p>
          ${localStatus.hint ? `<p class="muted">${escapeHtml(localStatus.hint)}</p>` : ""}
          ${localErr ? `<p class="le-error">${escapeHtml(localErr)}</p>` : ""}
          ${ggufList}
          <div class="row" id="le-primary">
            <button type="button" id="le-enable">Enable Local</button>
            <button type="button" id="le-ollama">Use Ollama</button>
            <button type="button" class="secondary" id="le-disable" ${engineOn ? "" : "disabled"}>Disable</button>
            ${
              aid && engineOn
                ? `<button type="button" id="le-local-only">Use for this account (local-only)</button>`
                : ""
            }
          </div>
          ${
            cloudBlocksDefault
              ? `<p class="muted">Pool is <strong>cloud only</strong> — local engine is on but won’t be the default until you set pool to <strong>local only</strong> or <strong>any</strong>.</p>`
              : ""
          }
          <div id="le-msg"></div>
          <details>
            <summary>Advanced</summary>
            <p class="muted">Auto prefers Mesh Envoy Local when available, otherwise spawns Home <code>llama-server</code>. Ollama must already be running on this machine.</p>
            <div class="row">
              <button type="button" class="secondary" id="le-attach">Attach Mesh only</button>
              <button type="button" class="secondary" id="le-spawn" ${
                ggufs.length === 0
                  ? 'disabled title="Drop a .gguf into local-engine/models/ first"'
                  : ""
              }>Spawn llama-server</button>
            </div>
            ${
              ggufs.length === 0
                ? `<p class="muted">Spawn is disabled until a <code>.gguf</code> is present.</p>`
                : ""
            }
          </details>
        </div>
        ${accountPickerHtml(accounts)}
        ${
          !aid
            ? `<p class="muted">Pick an account to set the default model and pool (local-only / any / cloud).</p>`
            : ""
        }
        ${listErr ? `<p class="le-error">${escapeHtml(listErr)}</p>` : ""}
        ${
          aid
            ? `<form id="routing-form" class="card">
          <h3>Routing for this account</h3>
          <div class="row">
            <label>default model
              <select name="defaultProviderId">${defaultOpts || "<option value=''>—</option>"}</select>
            </label>
            <label>pool
              <select name="placementFilter">
                <option value="any" ${placementFilter === "any" ? "selected" : ""}>any</option>
                <option value="local" ${placementFilter === "local" ? "selected" : ""}>local only</option>
                <option value="cloud" ${placementFilter === "cloud" ? "selected" : ""}>cloud only</option>
              </select>
            </label>
          </div>
          <label class="row"><input type="checkbox" name="autoSwitch" ${autoSwitch ? "checked" : ""} /> Auto-switch models (when ≥2)</label>
          <p class="muted">§10.2 Local-only: set pool to <strong>local only</strong> after Enable Local / Use Ollama (or press the button above).</p>
          <p class="muted">Compat mode: ${escapeHtml(mode)}</p>
          <button type="submit">Save routing</button>
        </form>
        <h3>Configured</h3>
        ${cards || "<p class='muted'>No providers yet — enable Local/Ollama above or add one below.</p>"}
        <div id="prov-msg"></div>
        <form id="prov-save" class="card">
          <h3>Add provider</h3>
          <label>Preset
            <select name="preset" id="prov-preset">${presetOpts}</select>
          </label>
          <label>API key <input name="apiKey" type="password" autocomplete="off" placeholder="optional for local" /></label>
          <label>Model <input name="model" id="prov-model" /></label>
          <details id="prov-advanced">
            <summary>Advanced</summary>
            <label>id <input name="id" id="prov-id" required /></label>
            <label>kind
              <select name="kind" id="prov-kind">
                <option value="local_llama_cpp">local_llama_cpp</option>
                <option value="local_openai_compat">local_openai_compat</option>
                <option value="cloud_openai_compat">cloud_openai_compat</option>
                <option value="cloud_anthropic_compat">cloud_anthropic_compat</option>
              </select>
            </label>
            <label>baseUrl <input name="baseUrl" id="prov-base" /></label>
            <label>label <input name="label" id="prov-label" /></label>
            <label>paramCountB <input name="paramCountB" id="prov-params" type="number" step="0.1" placeholder="e.g. 8" /></label>
            <label>costRank <input name="costRank" id="prov-costrank" type="number" placeholder="0 local, 100 cloud" /></label>
          </details>
          <button type="submit">Save provider</button>
        </form>`
            : ""
        }`;
      bindAccountPicker();

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
          leMsg.innerHTML = `<p class="muted">OK — ${escapeHtml(r.mode || "")} · ${
            r.healthy ? "responding" : "starting / down"
          } · <code>${escapeHtml(r.baseUrl || "")}</code></p>`;
        }
      };
      const runLocal = async (method, params, timeoutMs = 120_000) => {
        setLeBusy(true);
        if (leMsg) leMsg.innerHTML = `<p class="muted">Working…</p>`;
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
              `<p class="le-error">Drop a <code>.gguf</code> into <code>local-engine/models/</code> before spawning.</p>`;
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
        if (leMsg) leMsg.innerHTML = `<p class="muted">Setting local-only routing…</p>`;
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
              leMsg.innerHTML = `<p class="muted">Local-only: pool=<code>local</code>, default=<code>${escapeHtml(
                activeLocalId,
              )}</code>.</p>`;
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
              : `<p class="muted">Routing saved.</p>`;
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
            box.innerHTML = `<p class="muted">Saved <code>${escapeHtml(pid)}</code>${
              apiKey ? " + API key" : ""
            }. Use Test on the card to verify.</p>`;
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
                : `<p class="muted">Test OK${ans.result?.model ? ` · ${escapeHtml(ans.result.model)}` : ""}.</p>`;
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
                : `<p class="muted">Updated.</p>`;
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
                : `<p class="muted">Removed.</p>`;
            }
            if (!ans.error) await showView("models");
          });
        });
      }
      return;
    }

    if (id === "memory") {
      if (!aid) {
        el.innerHTML = `<h2>Memory</h2><p>Pick an account.</p>`;
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
              <button type="button" data-act="accept">Accept</button>
              <button type="button" data-act="reject">Reject</button>
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
      el.innerHTML = `<h2>Memory</h2>${accountPickerHtml(accounts)}
        <p class="muted">V-UX-5 / V-UX-MEM-1 · backend <code>${escapeHtml(mem.backendId || "?")}</code>
          · pending ${mem.pendingLearnCount ?? list.length}/${mem.pendingLearnCap ?? "?"}</p>
        <form id="mem-settings" class="card">
          <h3>Flush / review</h3>
          <label class="row"><input type="checkbox" name="flushEnabled" ${flushOn ? "checked" : ""} /> flushEnabled</label>
          <label class="row"><input type="checkbox" name="reviewEnabled" ${reviewOn ? "checked" : ""} /> reviewEnabled</label>
          <label>sessionRetentionDays <input name="sessionRetentionDays" type="number" min="0" value="${retention}" /></label>
          <button type="submit">home.setMemorySettings</button>
        </form>
        <div class="card">
          <h3>Caps (standing notes)</h3>
          <ul class="caps">${caps || "<li class='muted'>No notes yet.</li>"}</ul>
          <button type="button" id="compact-now">home.compactMemory</button>
        </div>
        <h3>Pending learns</h3>
        ${cards || "<p>Queue empty.</p>"}
        ${pre({ listMemory: listed, pendingLearns })}`;
      bindAccountPicker();
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
              <strong>sender</strong> <code>${escapeHtml(b.channel)}/${escapeHtml(b.channelAccount)}</code>
              <code>${escapeHtml(b.senderId)}</code> → <code>${escapeHtml(b.accountId)}</code>
              <button type="button" data-unbind="${escapeHtml(b.bindingId)}">remove</button>
            </div>`;
          }
          return `<div class="card">
            <strong>device</strong> <code>${escapeHtml(b.deviceId)}</code> → <code>${escapeHtml(b.accountId)}</code>
            ${b.ownerTrusted ? " · ownerTrusted" : ""}
            <button type="button" data-unbind="${escapeHtml(b.bindingId)}">remove</button>
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
      el.innerHTML = `<h2>Bindings</h2>${accountPickerHtml(accounts)}
        <p class="muted">V-UX-1 · sender/device → account; unbound smart-home objects listed below.</p>
        <form id="bind-sender" class="card">
          <h3>Bind channel sender</h3>
          <label>channel <input name="channel" value="telegram" required /></label>
          <label>channelAccount <input name="channelAccount" value="default" required /></label>
          <label>senderId <input name="senderId" required /></label>
          <button type="submit">home.setBinding</button>
        </form>
        ${bindCards || "<p class='muted'>No bindings.</p>"}
        <h3>Unbound smart-home objects</h3>
        <ul>${unboundList || "<li class='muted'>None (enable MQTT/HA and wait for inventory).</li>"}</ul>
        ${pre(bindings)}`;
      bindAccountPicker();
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
      el.innerHTML = `<h2>Harness</h2>${accountPickerHtml(accounts)}
        <p class="muted">Default harness from <code>home.listHarnesses</code>.</p>
        <form id="set-harness" class="card">
          <label>harnessId <input name="harnessId" value="${escapeHtml(body.result?.defaultId || "envoy-harness")}" required /></label>
          <label class="row"><input type="checkbox" name="confirm" /> confirm (non-default)</label>
          <button type="submit">home.setHarness</button>
        </form>
        ${pre(body)}`;
      bindAccountPicker();
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
              <button type="button" data-verify="${escapeHtml(s.id)}">verify</button>
              <button type="button" data-remove="${escapeHtml(s.id)}">remove</button>
            </div>
          </div>`,
        )
        .join("");
      el.innerHTML = `<h2>Skills</h2>
        <form id="install-skill" class="card">
          <h3>Install</h3>
          <label>source
            <select name="source">
              <option value="path">path</option>
              <option value="url">url</option>
              <option value="clawhub">clawhub</option>
            </select>
          </label>
          <label>ref <input name="ref" required placeholder="/path/to/skill or URL" /></label>
          <button type="submit">home.installSkill</button>
        </form>
        ${cards || "<p class='muted'>No skills installed.</p>"}
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
      el.innerHTML = `<h2>Workflows</h2>
        <button type="button" id="reload-wf">home.reloadWorkflows</button>
        <ul>${list || "<li class='muted'>No workflows loaded.</li>"}</ul>
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
        el.innerHTML = `<h2>Jobs</h2><p>Pick an account.</p>`;
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
              <button type="button" data-act="toggle">${j.enabled ? "Disable" : "Enable"}</button>
              <button type="button" data-act="run">Run</button>
              <button type="button" data-act="remove">Remove</button>
            </td>
          </tr>`,
        )
        .join("");
      el.innerHTML = `<h2>Jobs</h2>${accountPickerHtml(accounts)}
        <p class="muted">ScheduleService (§7.4) — propose NL, confirm to arm. Notify delivers over EnvoyMesh WS + push.</p>
        <form id="job-propose" class="card">
          <h3>Propose</h3>
          <label>Natural language
            <input name="text" required placeholder="remind me tomorrow at 8am to take out trash" style="width:100%" />
          </label>
          <button type="submit">home.proposeSchedule</button>
        </form>
        <div id="job-proposal"></div>
        <table class="card">
          <thead><tr><th>id</th><th>name</th><th>kind</th><th>source</th><th></th><th>next</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="muted">No jobs.</td></tr>'}</tbody>
        </table>
        ${pre(listed)}`;
      bindAccountPicker();
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
          <button type="button" id="job-confirm" data-id="${escapeHtml(p.proposalId || "")}">Confirm &amp; arm</button>
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
            const enabled = btn.textContent === "Enable";
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
        el.innerHTML = `<h2>Artifacts</h2><p>Pick an account.</p>`;
        return;
      }
      const body = await rpc("home.listArtifacts", { accountId: aid });
      const arts = body.result?.artifacts || [];
      const cards = arts
        .map(
          (a) => `<div class="card">
            <code>${escapeHtml(a.path || a.id)}</code>
            <div class="muted">${escapeHtml(a.createdAt || "")}</div>
            <button type="button" data-path="${escapeHtml(a.path)}">Open signed URL</button>
          </div>`,
        )
        .join("");
      el.innerHTML = `<h2>Artifacts</h2>${accountPickerHtml(accounts)}
        <p class="muted">Mint a short-lived HMAC URL (V-OUT-1).</p>
        ${cards || "<p class='muted'>No artifacts yet.</p>"}
        <div id="art-url"></div>
        ${pre(body)}`;
      bindAccountPicker();
      el.querySelectorAll("[data-path]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const path = btn.getAttribute("data-path");
          const ans = await rpc("home.getArtifactUrl", { accountId: aid, path, ttlSec: 3600 });
          const box = document.getElementById("art-url");
          if (box && ans.result?.url) {
            box.innerHTML = `<p><a href="${escapeHtml(ans.result.url)}" target="_blank" rel="noopener">${escapeHtml(ans.result.url)}</a></p>
              <p class="muted">expires ${escapeHtml(ans.result.expiresAt || "")}</p>`;
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
            <button type="button" data-fill-bind>Fill bind form</button>
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
              presence ? " (presence: share refused)" : ""
            } · neverUnattended=${s.neverUnattended}</div>
            <div class="row">
              <button type="button" data-toggle-nu="${escapeHtml(s.channel)}" data-ca="${escapeHtml(s.channelAccount)}" data-sid="${escapeHtml(s.sourceId)}" data-nu="${s.neverUnattended ? "0" : "1"}" data-cls="${escapeHtml(s.class)}" data-shared="${s.shared ? "1" : "0"}">
                Toggle neverUnattended
              </button>
              <button type="button" data-toggle-shared="${escapeHtml(s.channel)}" data-ca="${escapeHtml(s.channelAccount)}" data-sid="${escapeHtml(s.sourceId)}" data-nu="${s.neverUnattended ? "1" : "0"}" data-cls="${escapeHtml(s.class)}" data-shared="${s.shared ? "0" : "1"}" ${presence ? "disabled title='presence class cannot be shared'" : ""}>
                Toggle shared
              </button>
              <button type="button" data-unbind-src="${escapeHtml(s.channel)}" data-ca="${escapeHtml(s.channelAccount)}" data-sid="${escapeHtml(s.sourceId)}">Unbind</button>
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
      el.innerHTML = `<h2>Smart home</h2>${accountPickerHtml(accounts)}
        <p class="muted">V-UX-6 · bind unbound objects; shared refused for presence classes; neverUnattended; journal.</p>
        <div class="card">
          <h3>Integration health</h3>
          <p>MQTT: ${escapeHtml(JSON.stringify(mqttSt?.result || mqttSt?.error || "—"))}</p>
          <p>Home Assistant: ${escapeHtml(JSON.stringify(haSt?.result || haSt?.error || "—"))}</p>
          <p class="muted">Write credentials on event-source plugins are refused (read-only).</p>
        </div>
        <h3>Unbound objects</h3>
        ${unboundCards || "<p class='muted'>None unbound.</p>"}
        <form id="bind-form" class="card">
          <h3>Bind / update object</h3>
          <label>channel <input name="channel" id="sh-channel" required placeholder="homeassistant" /></label>
          <label>channelAccount <input name="channelAccount" id="sh-ca" value="default" required /></label>
          <label>sourceId <input name="sourceId" id="sh-sid" required /></label>
          <label>class <select name="class" id="sh-class">${classOpts}</select></label>
          <label class="row"><input type="checkbox" name="shared" id="sh-shared" /> shared (read)</label>
          <label class="row"><input type="checkbox" name="neverUnattended" id="sh-nu" /> neverUnattended</label>
          <label>MQTT allow-list (comma) <input name="allow" placeholder="topic/cmd" /></label>
          <button type="submit">home.setSourceBinding</button>
        </form>
        <h3>Bound objects</h3>
        ${boundCards || "<p class='muted'>None bound.</p>"}
        <h3>Actuation journal</h3>
        <table class="card" style="width:100%;border-collapse:collapse">
          <thead><tr><th>object</th><th>desired</th><th>outcome</th><th>stateChanged</th><th>risk</th></tr></thead>
          <tbody>${journal || "<tr><td colspan=5 class='muted'>empty</td></tr>"}</tbody>
        </table>`;
      bindAccountPicker();
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
      el.innerHTML = `<h2>Doctor</h2>
        ${supervised ? pre({ tauriSupervise: supervised }) : ""}
        <button type="button" id="fix-safe">Apply safe fixes</button>
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
      const h = health.result || {};
      const svc = status.result || status;
      el.innerHTML = `<h2>Advanced</h2>
        <p class="muted">V-UX-4 · Privacy Mode preview: <code>accounts/&lt;id&gt;/privacy-mode.json</code></p>
        <label class="row">WS URL <input id="ws" value="${wsUrl()}" style="min-width:20rem" /></label>
        <button type="button" id="save-ws">Save & reconnect</button>
        <div class="card" id="listen-card">
          <h3>Listen</h3>
          <p>wsPort <code>${h.wsPort ?? "?"}</code> · httpPort <code>${h.httpPort ?? "?"}</code></p>
          <p>publicBaseUrl <code>${escapeHtml(h.publicBaseUrl || "")}</code></p>
        </div>
        <div class="card">
          <h3>OS service</h3>
          <p class="muted">installed=${svc.installed} running=${svc.running} manager=${svc.manager}</p>
          <div class="row">
            <button type="button" id="svc-install">Install</button>
            <button type="button" id="svc-restart">Restart</button>
            <button type="button" id="svc-uninstall">Uninstall</button>
          </div>
        </div>
        <div class="card">
          <h3>Mobile push</h3>
          <p class="muted">Sends a test APNs/FCM alert to registered phones (see docs/mobile-ios-android-setup.md).</p>
          <button type="button" id="push-test">home.sendTestPush</button>
        </div>
        <h3>Service / claim</h3>${pre(status)}
        <h3>Mesh</h3>${pre(mesh)}
        <h3>Live events</h3>${pre(liveEvents.slice(0, 12))}`;
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
        if (!confirm("Uninstall OS service unit?")) return;
        const ans = await rpc("home.uninstallService", { confirm: true });
        el.insertAdjacentHTML("beforeend", pre(ans));
        await showView("advanced");
      });
      document.getElementById("push-test")?.addEventListener("click", async () => {
        const ans = await rpc("home.sendTestPush", {
          title: "EnvoyHome",
          body: "Test push from Advanced",
        });
        el.insertAdjacentHTML("beforeend", pre(ans));
      });
      return;
    }

    el.innerHTML = `<h2>${id}</h2><p>unknown view</p>`;
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

connect();
