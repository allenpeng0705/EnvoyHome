/** Device stand-in panel — same visual language as fake-ha (tiles + sections + conn meta). */

export function panelHtml(opts?: {
  title?: string;
  brokerUrl?: string;
  username?: string;
  password?: string;
}): string {
  const title = opts?.title ?? "EnvoyHome — local MQTT devices";
  const brokerUrl = opts?.brokerUrl ?? "mqtt://127.0.0.1:18883";
  const username = opts?.username ?? "envoyhome";
  const password = opts?.password ?? "demo";
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root {
      --bg0: #0f1419;
      --bg1: #1a222c;
      --ink: #e8eef4;
      --muted: #8b9aab;
      --accent: #f0c14b;
      --off: #3a4553;
      --ok: #5ecf8a;
      --warn: #ff9f7a;
      --info: #7eb6ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 600px at 20% -10%, #2a3a4a 0%, transparent 55%),
        radial-gradient(900px 500px at 100% 0%, #183a2a 0%, transparent 50%),
        var(--bg0);
    }
    header {
      padding: 1.5rem 1.75rem 0.25rem;
      max-width: 1040px;
      margin: 0 auto;
    }
    header h1 {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 650;
      letter-spacing: -0.02em;
    }
    header p { margin: 0.4rem 0 0; color: var(--muted); font-size: 0.92rem; line-height: 1.45; }
    header code { color: var(--accent); font-size: 0.85em; }
    .conn-meta {
      margin-top: 0.85rem;
      display: grid;
      gap: 0.45rem;
      padding: 0.75rem 0.9rem;
      border: 1px solid #2c3846;
      border-radius: 12px;
      background: rgba(26, 34, 44, 0.75);
      max-width: 36rem;
    }
    .conn-meta .row {
      display: grid;
      grid-template-columns: 7.5rem 1fr;
      gap: 0.5rem;
      align-items: baseline;
      font-size: 0.88rem;
    }
    .conn-meta .label {
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 650;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .conn-meta code { word-break: break-all; }
    .conn-meta .hint {
      margin: 0.15rem 0 0;
      font-size: 0.78rem;
      color: var(--muted);
      line-height: 1.4;
    }
    #status { margin-top: 0.5rem; min-height: 1.2em; color: var(--muted); font-size: 0.85rem; }
    section.group {
      max-width: 1040px;
      margin: 0 auto;
      padding: 0.75rem 1.75rem 0.25rem;
    }
    section.group h2 {
      margin: 0 0 0.65rem;
      font-size: 0.78rem;
      font-weight: 650;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
      gap: 0.85rem;
    }
    button.tile, .tile.readonly {
      appearance: none;
      border: 1px solid #2c3846;
      background: linear-gradient(180deg, var(--bg1), #141b22);
      border-radius: 16px;
      padding: 1rem 0.75rem 0.85rem;
      color: inherit;
      text-align: center;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease;
      width: 100%;
      font: inherit;
    }
    button.tile { cursor: pointer; }
    button.tile:hover { transform: translateY(-2px); border-color: #4a5b6e; }
    button.tile:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .tile.readonly { cursor: default; opacity: 0.92; }
    button.tile.on, .tile.active {
      border-color: #c9a227;
      box-shadow: 0 0 0 1px rgba(240,193,75,0.25), 0 12px 40px rgba(240,193,75,0.1);
    }
    .glyph {
      width: 52px; height: 52px; margin: 0 auto 0.65rem;
      border-radius: 12px; background: var(--off);
      position: relative;
    }
    .glyph.bulb { border-radius: 50% 50% 42% 42%; }
    button.tile.on .glyph.bulb {
      background: radial-gradient(circle at 35% 30%, #fff6d0, var(--accent) 55%, #b8860b);
      box-shadow: 0 0 28px rgba(240,193,75,0.55);
    }
    .glyph.bulb::after {
      content: ""; position: absolute; left: 50%; bottom: -7px; transform: translateX(-50%);
      width: 16px; height: 9px; border-radius: 0 0 4px 4px; background: #555;
    }
    .glyph.fan::before {
      content: ""; position: absolute; inset: 10px; border: 3px solid #9aa8b8; border-radius: 50%;
    }
    button.tile.on .glyph.fan::before { border-color: var(--info); animation: spin 1.2s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .glyph.sensor::before {
      content: ""; position: absolute; inset: 16px; border-radius: 50%; background: #5a6a7a;
    }
    .tile.active .glyph.sensor::before { background: var(--warn); box-shadow: 0 0 16px rgba(255,159,122,0.5); }
    .glyph.climate::before {
      content: ""; position: absolute; left: 50%; top: 10px; transform: translateX(-50%);
      width: 9px; height: 26px; border-radius: 6px; background: var(--info);
      box-shadow: 0 0 12px rgba(126,182,255,0.45);
    }
    .row-actions { display: flex; gap: 0.35rem; justify-content: center; margin-top: 0.5rem; }
    .row-actions button {
      appearance: none; border: 1px solid #3a4553; background: #121820; color: var(--ink);
      border-radius: 8px; padding: 0.2rem 0.55rem; font-size: 0.75rem; cursor: pointer;
    }
    .row-actions button:hover { border-color: var(--accent); }
    .name { font-weight: 600; font-size: 0.9rem; }
    .state {
      margin-top: 0.2rem; font-size: 0.75rem; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    button.tile.on .state, .tile.active .state { color: var(--ok); }
    .topic {
      margin-top: 0.35rem;
      font-size: 0.65rem;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      word-break: break-all;
      line-height: 1.3;
      opacity: 0.85;
    }
    footer {
      max-width: 1040px; margin: 0 auto; padding: 1.25rem 1.75rem 2rem;
      color: var(--muted); font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <header>
    <h1>MQTT devices</h1>
    <p>
      Device stand-in for an MQTT broker — same publish/subscribe path EnvoyHome uses in production.
      Chat / Home chat / Approvals are the <strong>real</strong> product path; these tiles only show topic state.
      Click a tile or Allow an approval — same store.
    </p>
    <div class="conn-meta" aria-label="MQTT connection details">
      <div class="row">
        <span class="label">Broker URL</span>
        <code id="broker">${esc(brokerUrl)}</code>
      </div>
      <div class="row">
        <span class="label">Username</span>
        <code id="user">${esc(username)}</code>
      </div>
      <div class="row">
        <span class="label">Password</span>
        <code id="pass">${esc(password)}</code>
      </div>
      <p class="hint">
        Same fields as a real broker: EnvoyHome → Connections → MQTT
        (<strong>Broker URL</strong> + user/pass). <strong>Start demo MQTT</strong> fills them for you.
      </p>
    </div>
    <p id="status">Loading…</p>
  </header>
  <div id="root"></div>
  <footer>
    Stand-in broker only — not a product device graph. When you have a real Mosquitto (or HA MQTT), paste its URL in Connections; Chat and Approvals stay the same. Can run alongside Demo HA.
  </footer>
  <script>
    const root = document.getElementById("root");
    const status = document.getElementById("status");

    const SECTIONS = [
      { id: "actuators", label: "Lights & switches", match: (d) => d.class === "light" || d.class === "switch" },
      { id: "climate", label: "Climate", match: (d) => d.class === "climate" },
      { id: "sensors", label: "Sensors", match: (d) => d.class === "sensor" || d.readOnly },
      { id: "other", label: "Other", match: (d) => d.class === "other" },
    ];

    function glyphClass(d) {
      if (d.class === "climate") return "climate";
      if (d.class === "sensor" || d.readOnly) return "sensor";
      if (/fan/i.test(d.topic) || /fan/i.test(d.displayName || "")) return "fan";
      return "bulb";
    }

    function isOn(d) {
      if (d.readOnly || d.class === "sensor") return false;
      if (d.class === "climate") return true;
      return String(d.state).toUpperCase() === "ON";
    }

    function stateLabel(d) {
      if (d.class === "climate" || d.class === "sensor" || d.readOnly) {
        const n = Number(d.state);
        if (Number.isFinite(n)) return n + " °C";
        return String(d.state);
      }
      return String(d.state).toUpperCase() === "ON" ? "on" : "off";
    }

    function primaryName(d) {
      const name = String(d.displayName || d.topic);
      const part = name.split("/")[0].trim();
      return part || name;
    }

    async function setState(topic, payload) {
      const res = await fetch("/api/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, payload }),
      });
      if (!res.ok) throw new Error("/api/set → " + res.status);
      await refresh();
    }

    function render(rows) {
      root.innerHTML = "";
      const claimed = new Set();
      for (const sec of SECTIONS) {
        const items = rows.filter((d) => sec.match(d) && !claimed.has(d.topic));
        for (const d of items) claimed.add(d.topic);
        if (!items.length) continue;
        const section = document.createElement("section");
        section.className = "group";
        section.innerHTML = "<h2></h2><div class=\\"grid\\"></div>";
        section.querySelector("h2").textContent = sec.label;
        const grid = section.querySelector(".grid");
        for (const d of items) {
          const active = isOn(d);
          const readOnly = Boolean(d.readOnly || d.class === "sensor");
          const isClimate = d.class === "climate";
          const el = document.createElement(readOnly ? "div" : isClimate ? "div" : "button");
          if (!readOnly && !isClimate) el.type = "button";
          el.className =
            "tile" +
            (active ? " on active" : "") +
            (readOnly ? " readonly" : "") +
            (isClimate ? " climate-tile" : "");
          const g = glyphClass(d);
          el.innerHTML =
            '<div class="glyph ' + g + '" aria-hidden="true"></div>' +
            '<div class="name"></div><div class="state"></div><div class="topic"></div>';
          el.querySelector(".name").textContent = primaryName(d);
          el.querySelector(".state").textContent = stateLabel(d);
          el.querySelector(".topic").textContent = d.topic;
          if (isClimate && !readOnly) {
            const actions = document.createElement("div");
            actions.className = "row-actions";
            actions.innerHTML =
              '<button type="button" data-delta="-1">−</button><button type="button" data-delta="1">+</button>';
            actions.addEventListener("click", (ev) => {
              ev.stopPropagation();
              const btn = ev.target.closest("button[data-delta]");
              if (!btn) return;
              const cur = Number(d.state);
              const base = Number.isFinite(cur) ? cur : 22;
              const next = Math.round((base + Number(btn.getAttribute("data-delta"))) * 2) / 2;
              setState(d.topic, String(next)).catch((e) => { status.textContent = String(e); });
            });
            el.appendChild(actions);
          } else if (!readOnly) {
            el.addEventListener("click", () => {
              const next = active ? "OFF" : "ON";
              setState(d.topic, next).catch((e) => { status.textContent = String(e); });
            });
          }
          grid.appendChild(el);
        }
        root.appendChild(section);
      }
    }

    async function refresh() {
      try {
        const res = await fetch("/api/devices");
        if (!res.ok) throw new Error("/api/devices → " + res.status);
        const rows = await res.json();
        render(rows);
        status.textContent = rows.length + " devices · live with Home chat / panel";
      } catch (e) {
        status.textContent = "API error: " + e;
      }
    }

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`;
}
