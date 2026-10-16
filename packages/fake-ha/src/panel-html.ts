/** Device stand-in panel — sections for lights, climate, covers, security, sensors, media. */

export function panelHtml(title = "EnvoyHome — local HA devices"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
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
        radial-gradient(900px 500px at 100% 0%, #3a2a18 0%, transparent 50%),
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
    .conn-meta code {
      word-break: break-all;
    }
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
    .glyph.lock::before {
      content: ""; position: absolute; inset: 12px 16px 16px; border: 3px solid #9aa8b8; border-radius: 6px;
    }
    .glyph.lock.open { background: #4a3030; }
    .glyph.climate::before {
      content: ""; position: absolute; left: 50%; top: 10px; transform: translateX(-50%);
      width: 9px; height: 26px; border-radius: 6px; background: var(--info);
      box-shadow: 0 0 12px rgba(126,182,255,0.45);
    }
    .glyph.cover::before {
      content: ""; position: absolute; left: 12px; right: 12px; top: 14px; height: 8px;
      background: #9aa8b8; border-radius: 2px; box-shadow: 0 10px 0 #6a7786, 0 20px 0 #4a5560;
    }
    button.tile.on .glyph.cover::before { background: var(--ok); box-shadow: 0 10px 0 var(--ok), 0 20px 0 #2a6b45; }
    .glyph.alarm::before {
      content: ""; position: absolute; left: 50%; top: 12px; transform: translateX(-50%);
      width: 0; height: 0; border-left: 14px solid transparent; border-right: 14px solid transparent;
      border-bottom: 24px solid #9aa8b8;
    }
    button.tile.on .glyph.alarm::before { border-bottom-color: var(--warn); }
    .glyph.sensor::before {
      content: ""; position: absolute; inset: 16px; border-radius: 50%; background: #5a6a7a;
    }
    .tile.active .glyph.sensor::before { background: var(--warn); box-shadow: 0 0 16px rgba(255,159,122,0.5); }
    .glyph.camera::before {
      content: ""; position: absolute; left: 12px; right: 12px; top: 16px; bottom: 16px;
      border: 3px solid #9aa8b8; border-radius: 6px;
    }
    .glyph.media::before {
      content: ""; position: absolute; left: 18px; right: 14px; top: 14px; bottom: 14px;
      border-left: 14px solid #9aa8b8; border-top: 12px solid transparent; border-bottom: 12px solid transparent;
    }
    button.tile.on .glyph.media::before { border-left-color: var(--ok); }
    .name { font-weight: 600; font-size: 0.9rem; }
    .state {
      margin-top: 0.2rem; font-size: 0.75rem; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    button.tile.on .state, .tile.active .state { color: var(--ok); }
    .hint { margin-top: 0.35rem; font-size: 0.7rem; color: var(--muted); }
    .row-actions { display: flex; gap: 0.35rem; justify-content: center; margin-top: 0.5rem; }
    .row-actions button {
      appearance: none; border: 1px solid #3a4553; background: #121820; color: var(--ink);
      border-radius: 8px; padding: 0.2rem 0.55rem; font-size: 0.75rem; cursor: pointer;
    }
    .row-actions button:hover { border-color: var(--accent); }
    footer {
      max-width: 1040px; margin: 0 auto; padding: 1.25rem 1.75rem 2rem;
      color: var(--muted); font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <header>
    <h1>Home devices</h1>
    <p>
      Device stand-in for a Home Assistant hub — same REST contract EnvoyHome uses in production.
      Chat / Home chat / Approvals are the <strong>real</strong> product path; these tiles only show device state
      (lights, climate, covers, locks, alarm, sensors, media). Click a tile or Allow an approval — same store.
    </p>
    <div class="conn-meta" aria-label="HA connection details">
      <div class="row">
        <span class="label">Base URL</span>
        <code id="base"></code>
      </div>
      <div class="row">
        <span class="label">Access token</span>
        <code id="token">envoyhome-demo</code>
      </div>
      <p class="hint">
        Same fields as a real hub: EnvoyHome → Connections → Home Assistant
        (<strong>Base URL</strong> + <strong>Access token</strong>). <strong>Start local HA</strong> fills them for you.
      </p>
    </div>
    <p id="status">Loading…</p>
  </header>
  <div id="root"></div>
  <footer>
    Stand-in hub only — not a product device graph. When you have a real Home Assistant, paste its URL + token in Connections; Chat and Approvals stay the same.
  </footer>
  <script>
    const token = "envoyhome-demo";
    const root = document.getElementById("root");
    const status = document.getElementById("status");
    document.getElementById("base").textContent = location.origin;

    const SECTIONS = [
      { id: "lights", label: "Lights & fans", match: (id) => /^(light|switch|fan)\\./.test(id) },
      { id: "climate", label: "Climate", match: (id) => id.startsWith("climate.") },
      { id: "covers", label: "Covers & garage", match: (id) => /^(cover|valve)\\./.test(id) },
      { id: "security", label: "Security", match: (id) => /^(lock|alarm_control_panel|camera)\\./.test(id) },
      { id: "sensors", label: "Sensors", match: (id) => /^(sensor|binary_sensor)\\./.test(id) },
      { id: "media", label: "Media", match: (id) => id.startsWith("media_player.") },
    ];

    const READ_ONLY = new Set([
      "sensor.outdoor_temperature",
      "binary_sensor.front_door_contact",
      "camera.porch",
    ]);

    function glyphClass(id) {
      if (id.startsWith("light.") || id.startsWith("switch.")) return "bulb";
      if (id.startsWith("fan.")) return "fan";
      if (id.startsWith("lock.")) return "lock";
      if (id.startsWith("climate.")) return "climate";
      if (id.startsWith("cover.") || id.startsWith("valve.")) return "cover";
      if (id.startsWith("alarm_control_panel.")) return "alarm";
      if (id.startsWith("camera.")) return "camera";
      if (id.startsWith("sensor.") || id.startsWith("binary_sensor.")) return "sensor";
      if (id.startsWith("media_player.")) return "media";
      return "bulb";
    }

    function isActive(row) {
      const id = row.entity_id;
      if (id.startsWith("lock.")) return row.state === "unlocked";
      if (id.startsWith("climate.")) return row.state !== "off";
      if (id.startsWith("cover.") || id.startsWith("valve.")) return row.state === "open" || row.state === "opening";
      if (id.startsWith("alarm_control_panel.")) return String(row.state).startsWith("armed");
      if (id.startsWith("binary_sensor.")) return row.state === "on";
      if (id.startsWith("media_player.")) return row.state === "playing";
      if (id.startsWith("camera.")) return row.state === "recording";
      if (id.startsWith("sensor.")) return false;
      return row.state === "on";
    }

    function stateLabel(row) {
      const id = row.entity_id;
      if (id.startsWith("climate.")) {
        const t = row.attributes && row.attributes.temperature;
        return row.state + (t != null ? " · " + t + "°" : "");
      }
      if (id.startsWith("sensor.") && row.attributes && row.attributes.unit_of_measurement) {
        return row.state + " " + row.attributes.unit_of_measurement;
      }
      if (id.startsWith("fan.") && row.state === "on" && row.attributes && row.attributes.percentage != null) {
        return "on · " + row.attributes.percentage + "%";
      }
      if (id.startsWith("media_player.") && row.attributes && row.attributes.media_title) {
        return row.state + " · " + row.attributes.media_title;
      }
      return row.state;
    }

    async function api(path, init) {
      const res = await fetch(path, {
        ...init,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          ...(init && init.headers || {}),
        },
      });
      if (!res.ok) throw new Error(path + " → " + res.status);
      if (res.status === 204) return null;
      return res.json();
    }

    function serviceForToggle(row) {
      const [domain] = row.entity_id.split(".");
      if (domain === "lock") return row.state === "locked" ? "unlock" : "lock";
      if (domain === "cover") return "toggle";
      if (domain === "valve") return "toggle";
      if (domain === "alarm_control_panel") return "toggle";
      if (domain === "climate") return "toggle";
      if (domain === "binary_sensor") return "toggle";
      if (domain === "media_player") return "toggle";
      if (domain === "fan") return row.state === "on" ? "turn_off" : "turn_on";
      if (domain === "light" || domain === "switch") return row.state === "on" ? "turn_off" : "turn_on";
      return "toggle";
    }

    async function call(domain, service, body) {
      await api("/api/services/" + domain + "/" + service, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await refresh();
    }

    async function onTileClick(row) {
      if (READ_ONLY.has(row.entity_id)) return;
      const [domain] = row.entity_id.split(".");
      await call(domain, serviceForToggle(row), { entity_id: row.entity_id });
    }

    async function bumpClimate(row, delta) {
      const cur = Number(row.attributes && row.attributes.temperature);
      const next = (Number.isFinite(cur) ? cur : 21) + delta;
      await call("climate", "set_temperature", {
        entity_id: row.entity_id,
        temperature: Math.round(next * 2) / 2,
      });
    }

    function render(rows) {
      root.innerHTML = "";
      for (const sec of SECTIONS) {
        const items = rows.filter((r) => sec.match(r.entity_id));
        if (!items.length) continue;
        const section = document.createElement("section");
        section.className = "group";
        section.innerHTML = "<h2></h2><div class=\\"grid\\"></div>";
        section.querySelector("h2").textContent = sec.label;
        const grid = section.querySelector(".grid");
        for (const row of items) {
          const name = (row.attributes && row.attributes.friendly_name) || row.entity_id;
          const active = isActive(row);
          const readOnly = READ_ONLY.has(row.entity_id);
          const el = document.createElement(readOnly ? "div" : "button");
          if (!readOnly) el.type = "button";
          el.className = "tile" + (active ? " on active" : "") + (readOnly ? " readonly" : "");
          const g = glyphClass(row.entity_id);
          const lockOpen = row.entity_id.startsWith("lock.") && row.state === "unlocked";
          el.innerHTML =
            '<div class="glyph ' + g + (lockOpen ? " open" : "") + '" aria-hidden="true"></div>' +
            '<div class="name"></div><div class="state"></div>';
          el.querySelector(".name").textContent = name;
          el.querySelector(".state").textContent = stateLabel(row);
          if (row.entity_id.startsWith("climate.")) {
            const actions = document.createElement("div");
            actions.className = "row-actions";
            actions.innerHTML = "<button type=\\"button\\" data-delta=\\"-1\\">−</button><button type=\\"button\\" data-delta=\\"1\\">+</button>";
            actions.addEventListener("click", (ev) => {
              ev.stopPropagation();
              const btn = ev.target.closest("button[data-delta]");
              if (!btn) return;
              bumpClimate(row, Number(btn.getAttribute("data-delta"))).catch((e) => {
                status.textContent = String(e);
              });
            });
            el.appendChild(actions);
          }
          if (row.entity_id === "binary_sensor.hallway_motion") {
            const hint = document.createElement("div");
            hint.className = "hint";
            hint.textContent = "click to simulate";
            el.appendChild(hint);
          }
          if (!readOnly) {
            el.addEventListener("click", () => onTileClick(row).catch((e) => { status.textContent = String(e); }));
          }
          grid.appendChild(el);
        }
        root.appendChild(section);
      }
    }

    async function refresh() {
      try {
        const rows = await api("/api/states");
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
