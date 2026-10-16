// Vanilla DAG canvas for Workflows Diagram mode (Design §7 / V-UX-9).

import { autoLayout, uniqueNodeId } from "./workflow-model.js";

/**
 * @param {HTMLElement} root
 * @param {{
 *   graph: import("./workflow-model.js").WfGraph,
 *   tools?: Array<{ name: string }>,
 *   labels?: Record<string, string>,
 *   readOnly?: boolean,
 *   hideInspector?: boolean,
 *   onChange?: (graph: import("./workflow-model.js").WfGraph) => void,
 *   onDraftPrompt?: (node: import("./workflow-model.js").WfNode) => void | Promise<void>,
 *   onSaveStepTemplate?: (node: import("./workflow-model.js").WfNode) => void | Promise<void>,
 *   onCreateStepTemplate?: () =>
 *     Promise<{ nodeType: string, prompt: string, out?: string } | null | undefined>,
 *   stepTemplates?: Array<{ id: string, label: string, nodeType: string, prompt: string, out?: string }>,
 * }} opts
 */
export function mountWorkflowCanvas(root, opts) {
  /** @type {import("./workflow-model.js").WfGraph} */
  let graph = structuredClone(opts.graph);
  autoLayout(graph.nodes);
  const labels = opts.labels || {};
  const L = (k, fallback) => labels[k] || fallback;
  const readOnly = opts.readOnly === true;
  const hideInspector = opts.hideInspector === true || readOnly;
  /** @type {Array<{ id: string, label: string, nodeType: string, prompt: string, out?: string }>} */
  let stepTemplates = Array.isArray(opts.stepTemplates) ? [...opts.stepTemplates] : [];

  const truncateHint = (text, max = 48) => {
    const one = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (one.length <= max) return one;
    return `${one.slice(0, max - 1)}…`;
  };

  const renderStepTemplateItems = () => {
    const createBtn = `<button type="button" role="menuitem" class="wf-add-menu-item" data-wf-create-template>
        <span class="wf-add-menu-item-title">${escapeHtml(L("createCustomStep", "Custom step…"))}</span>
        <span class="wf-add-menu-item-hint">${escapeHtml(L("createCustomStepHint", "e.g. Extract JSON — name + prompt"))}</span>
      </button>`;
    if (!stepTemplates.length) {
      return `${createBtn}<p class="muted wf-add-menu-empty">${escapeHtml(L("addStepTemplatesEmpty", "Saved steps also appear here after you create them"))}</p>`;
    }
    return (
      stepTemplates
        .map(
          (t) => `<button type="button" role="menuitem" class="wf-add-menu-item" data-wf-add-template="${escapeHtml(t.id)}">
            <span class="wf-add-menu-item-title">${escapeHtml(t.label)}</span>
            <span class="wf-add-menu-item-hint">${escapeHtml(truncateHint(t.prompt))}</span>
          </button>`,
        )
        .join("") + createBtn
    );
  };

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2;
  const ZOOM_STEP = 0.1;
  let zoom = 1;

  root.classList.add("wf-canvas-root");
  if (readOnly) root.classList.add("is-readonly");
  root.innerHTML = `
    <div class="wf-canvas-toolbar">
      ${
        readOnly
          ? `<span class="muted wf-canvas-hint">${escapeHtml(L("readOnlyHint", "Preview — open in editor to edit"))}</span>`
          : `<div class="wf-add-menu" data-wf-menu="step">
        <button type="button" class="wf-add-menu-toggle" data-wf-menu-toggle aria-haspopup="menu" aria-expanded="false">
          <span>${escapeHtml(L("addStep", "Add step"))}</span>
          <span class="wf-add-menu-caret" aria-hidden="true"></span>
        </button>
        <div class="wf-add-menu-panel" role="menu" hidden>
          <p class="wf-add-menu-heading">${escapeHtml(L("addStepHeading", "Model steps"))}</p>
          <button type="button" role="menuitem" class="wf-add-menu-item" data-wf-add="llm_summarize">
            <span class="wf-add-menu-item-title">${escapeHtml(L("addSummarize", "Summarize"))}</span>
            <span class="wf-add-menu-item-hint">${escapeHtml(L("addSummarizeHint", "Free-form summary or paragraph"))}</span>
          </button>
          <button type="button" role="menuitem" class="wf-add-menu-item" data-wf-add="llm_fill">
            <span class="wf-add-menu-item-title">${escapeHtml(L("addFill", "Fill"))}</span>
            <span class="wf-add-menu-item-hint">${escapeHtml(L("addFillHint", "Short structured reply (labels, buckets)"))}</span>
          </button>
          <p class="wf-add-menu-heading">${escapeHtml(L("addStepTemplatesHeading", "Your steps"))}</p>
          <div data-wf-step-templates>${renderStepTemplateItems()}</div>
        </div>
      </div>
      <div class="wf-add-menu" data-wf-menu="tool">
        <button type="button" class="wf-add-menu-toggle" data-wf-menu-toggle aria-haspopup="menu" aria-expanded="false">
          <span>${escapeHtml(L("addTool", "Add tool…"))}</span>
          <span class="wf-add-menu-caret" aria-hidden="true"></span>
        </button>
        <div class="wf-add-menu-panel wf-add-menu-panel--tools" role="menu" hidden>
          <p class="wf-add-menu-heading">${escapeHtml(L("addToolHeading", "Ready tools"))}</p>
          ${(opts.tools || []).length
            ? (opts.tools || [])
                .map(
                  (t) =>
                    `<button type="button" role="menuitem" class="wf-add-menu-item wf-add-menu-item--tool" data-wf-add="tool" data-wf-tool="${escapeHtml(t.name)}">
                      <span class="wf-add-menu-item-title"><code>${escapeHtml(t.name)}</code></span>
                    </button>`,
                )
                .join("")
            : `<p class="muted wf-add-menu-empty">${escapeHtml(L("addToolEmpty", "No ready tools yet"))}</p>
               <button type="button" role="menuitem" class="wf-add-menu-item" data-wf-add="tool">
                 <span class="wf-add-menu-item-title">${escapeHtml(L("addToolBlank", "Add empty tool node"))}</span>
                 <span class="wf-add-menu-item-hint">${escapeHtml(L("addToolBlankHint", "Pick the tool name later in the inspector"))}</span>
               </button>`}
        </div>
      </div>
      <button type="button" class="secondary" data-wf-del>${escapeHtml(L("delete", "Delete"))}</button>
      <button type="button" class="secondary" data-wf-entry>${escapeHtml(L("setEntry", "Set entry"))}</button>
      <span class="muted wf-canvas-hint">${escapeHtml(L("hint", "Drag nodes · drag from ● to connect · click edge for when"))}</span>`
      }
      <span class="wf-zoom-controls" role="group" aria-label="${escapeHtml(L("zoomLabel", "Zoom"))}">
        <button type="button" class="secondary" data-wf-zoom-out title="${escapeHtml(L("zoomOut", "Zoom out"))}" aria-label="${escapeHtml(L("zoomOut", "Zoom out"))}">−</button>
        <span class="wf-zoom-label" data-wf-zoom-label>100%</span>
        <button type="button" class="secondary" data-wf-zoom-in title="${escapeHtml(L("zoomIn", "Zoom in"))}" aria-label="${escapeHtml(L("zoomIn", "Zoom in"))}">+</button>
        <button type="button" class="secondary" data-wf-zoom-reset title="${escapeHtml(L("zoomReset", "Reset zoom"))}" aria-label="${escapeHtml(L("zoomReset", "Reset zoom"))}">${escapeHtml(L("zoomResetShort", "100%"))}</button>
      </span>
    </div>
    <div class="wf-canvas-body${hideInspector ? " no-inspector" : ""}">
      <div class="wf-canvas-stage-wrap">
        <div class="wf-canvas-world">
          <div class="wf-canvas-world-inner">
            <svg class="wf-canvas-edges" aria-hidden="true"></svg>
            <div class="wf-canvas-stage"></div>
          </div>
        </div>
      </div>
      ${
        hideInspector
          ? ""
          : `<aside class="wf-canvas-inspector">
        <h4>${escapeHtml(L("inspector", "Inspector"))}</h4>
        <div class="wf-insp-empty muted">${escapeHtml(L("selectHint", "Select a node or edge"))}</div>
        <div class="wf-insp-fields" hidden></div>
      </aside>`
      }
    </div>
  `;

  const stageWrap = /** @type {HTMLElement} */ (root.querySelector(".wf-canvas-stage-wrap"));
  const world = /** @type {HTMLElement} */ (root.querySelector(".wf-canvas-world"));
  const worldInner = /** @type {HTMLElement} */ (root.querySelector(".wf-canvas-world-inner"));
  const stage = /** @type {HTMLElement} */ (root.querySelector(".wf-canvas-stage"));
  const edgesSvg = /** @type {SVGSVGElement} */ (root.querySelector(".wf-canvas-edges"));
  const zoomLabel = /** @type {HTMLElement | null} */ (root.querySelector("[data-wf-zoom-label]"));
  const inspEmpty = /** @type {HTMLElement | null} */ (root.querySelector(".wf-insp-empty"));
  const inspFields = /** @type {HTMLElement | null} */ (root.querySelector(".wf-insp-fields"));

  /** @type {{ kind: "node", id: string } | { kind: "edge", index: number } | null} */
  let selection = null;
  /** @type {{ fromId: string, x: number, y: number } | null} */
  let linkDrag = null;
  /** @type {{ id: string, ox: number, oy: number, mx: number, my: number } | null} */
  let nodeDrag = null;
  /** @type {Map<string, "pending" | "running" | "ok" | "fail">} */
  const runState = new Map();

  const emit = () => opts.onChange?.(structuredClone(graph));

  function clampZoom(z) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
  }

  function applyZoom() {
    if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    worldInner.style.transform = `scale(${zoom})`;
    const w = Number.parseFloat(worldInner.style.width) || worldInner.offsetWidth || 600;
    const h = Number.parseFloat(worldInner.style.height) || worldInner.offsetHeight || 420;
    world.style.width = `${Math.ceil(w * zoom)}px`;
    world.style.height = `${Math.ceil(h * zoom)}px`;
  }

  function setZoom(next) {
    zoom = clampZoom(next);
    applyZoom();
  }

  /** Map pointer to unscaled world coords. */
  function localPoint(clientX, clientY) {
    const rect = worldInner.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom,
    };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nodeById(id) {
    return graph.nodes.find((n) => n.id === id);
  }

  function render() {
    const wrapW = Math.max(stageWrap?.clientWidth || 600, 600);
    const w = Math.max(
      wrapW,
      ...graph.nodes.map((n) => (n.x || 0) + 200),
      600,
    );
    const h = Math.max(
      420,
      ...graph.nodes.map((n) => (n.y || 0) + 120),
      420,
    );
    worldInner.style.width = `${w}px`;
    worldInner.style.height = `${h}px`;
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    edgesSvg.setAttribute("width", String(w));
    edgesSvg.setAttribute("height", String(h));
    edgesSvg.style.width = `${w}px`;
    edgesSvg.style.height = `${h}px`;
    applyZoom();

    stage.innerHTML = graph.nodes
      .map((n) => {
        const selected = selection?.kind === "node" && selection.id === n.id;
        const entry = graph.entry === n.id;
        const rs = runState.get(n.id);
        const runClass = rs ? ` is-run-${rs}` : "";
        const title =
          n.type === "tool"
            ? n.name || "tool"
            : n.label
              ? n.label
              : n.type === "llm_fill"
                ? "llm_fill"
                : "llm_summarize";
        const runBadge =
          rs === "running"
            ? `<span class="wf-run-badge">${escapeHtml(L("runRunning", "running"))}</span>`
            : rs === "ok"
              ? `<span class="wf-run-badge">${escapeHtml(L("runOk", "ok"))}</span>`
              : rs === "fail"
                ? `<span class="wf-run-badge">${escapeHtml(L("runFail", "fail"))}</span>`
                : rs === "pending"
                  ? `<span class="wf-run-badge">${escapeHtml(L("runPending", "…"))}</span>`
                  : "";
        return `<div class="wf-node${selected ? " is-selected" : ""}${entry ? " is-entry" : ""}${runClass}"
          data-node-id="${escapeHtml(n.id)}"
          style="left:${n.x || 0}px;top:${n.y || 0}px">
          <div class="wf-node-head" data-drag-node="${escapeHtml(n.id)}">
            <span class="wf-node-type">${escapeHtml(n.label || n.type)}</span>
            ${entry ? `<span class="wf-node-entry">${escapeHtml(L("entry", "entry"))}</span>` : ""}
            ${runBadge}
          </div>
          <div class="wf-node-body"><code>${escapeHtml(n.id)}</code><div class="muted">${escapeHtml(title)}</div></div>
          ${
            readOnly
              ? ""
              : `<button type="button" class="wf-port wf-port-in" data-port-in="${escapeHtml(n.id)}" title="in"></button>
          <button type="button" class="wf-port wf-port-out" data-port-out="${escapeHtml(n.id)}" title="out"></button>`
          }
        </div>`;
      })
      .join("");

    const paths = [];
    graph.edges.forEach((e, index) => {
      const a = nodeById(e.from);
      const b = nodeById(e.to);
      if (!a || !b) return;
      const x1 = (a.x || 0) + 168;
      const y1 = (a.y || 0) + 44;
      const x2 = (b.x || 0);
      const y2 = (b.y || 0) + 44;
      const mx = (x1 + x2) / 2;
      const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
      const sel = selection?.kind === "edge" && selection.index === index;
      const label = e.when
        ? `<text class="wf-edge-label" x="${mx}" y="${(y1 + y2) / 2 - 6}">${escapeHtml(e.when)}</text>`
        : "";
      paths.push(
        `<g class="wf-edge${sel ? " is-selected" : ""}" data-edge-index="${index}">
          <path d="${d}" class="wf-edge-hit" />
          <path d="${d}" class="wf-edge-path" marker-end="url(#wf-arrow)" />
          ${label}
        </g>`,
      );
    });
    if (linkDrag) {
      const a = nodeById(linkDrag.fromId);
      if (a) {
        const x1 = (a.x || 0) + 168;
        const y1 = (a.y || 0) + 44;
        const d = `M ${x1} ${y1} L ${linkDrag.x} ${linkDrag.y}`;
        paths.push(`<path d="${d}" class="wf-edge-temp" />`);
      }
    }
    edgesSvg.innerHTML = `
      <defs>
        <marker id="wf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      ${paths.join("")}`;

    renderInspector();
    wireStageEvents();
  }

  function renderInspector() {
    if (!inspEmpty || !inspFields) return;
    if (!selection) {
      inspEmpty.hidden = false;
      inspFields.hidden = true;
      inspFields.innerHTML = "";
      return;
    }
    inspEmpty.hidden = true;
    inspFields.hidden = false;
    if (selection.kind === "edge") {
      const e = graph.edges[selection.index];
      if (!e) {
        selection = null;
        renderInspector();
        return;
      }
      inspFields.innerHTML = `
        <label>${escapeHtml(L("edgeFrom", "From"))}<input data-f="from" value="${escapeHtml(e.from)}" readonly /></label>
        <label>${escapeHtml(L("edgeTo", "To"))}<input data-f="to" value="${escapeHtml(e.to)}" readonly /></label>
        <label>${escapeHtml(L("edgeWhen", "when (optional)"))}
          <input data-f="when" value="${escapeHtml(e.when || "")}" placeholder="bucket == 'urgent'" />
        </label>
        <button type="button" class="secondary" data-f-del-edge>${escapeHtml(L("deleteEdge", "Delete edge"))}</button>
      `;
      inspFields.querySelector("[data-f=when]")?.addEventListener("change", (ev) => {
        const v = /** @type {HTMLInputElement} */ (ev.target).value.trim();
        if (v) e.when = v;
        else delete e.when;
        emit();
        render();
      });
      inspFields.querySelector("[data-f-del-edge]")?.addEventListener("click", () => {
        graph.edges.splice(selection.index, 1);
        selection = null;
        emit();
        render();
      });
      return;
    }
    const n = nodeById(selection.id);
    if (!n) {
      selection = null;
      renderInspector();
      return;
    }
    const toolOptions = (opts.tools || [])
      .map((t) => `<option value="${escapeHtml(t.name)}"${t.name === n.name ? " selected" : ""}>${escapeHtml(t.name)}</option>`)
      .join("");
    inspFields.innerHTML = `
      <label>${escapeHtml(L("nodeId", "Id"))}<input data-f="id" value="${escapeHtml(n.id)}" /></label>
      <label>${escapeHtml(L("nodeType", "Type"))}
        <select data-f="type">
          <option value="llm_summarize"${n.type === "llm_summarize" ? " selected" : ""}>llm_summarize</option>
          <option value="llm_fill"${n.type === "llm_fill" ? " selected" : ""}>llm_fill</option>
          <option value="tool"${n.type === "tool" ? " selected" : ""}>tool</option>
        </select>
      </label>
      <label class="wf-insp-tool"${n.type === "tool" ? "" : " hidden"}>${escapeHtml(L("toolName", "Tool"))}
        <select data-f="name"><option value="">—</option>${toolOptions}</select>
      </label>
      <label class="wf-insp-prompt"${n.type === "tool" ? " hidden" : ""}>${escapeHtml(L("prompt", "Prompt"))}
        <textarea data-f="prompt" rows="4">${escapeHtml(n.prompt || "")}</textarea>
      </label>
      <button type="button" class="secondary wf-insp-draft"${n.type === "tool" ? " hidden" : ""} data-f-draft>
        ${escapeHtml(L("refinePrompt", "Refine"))}
      </button>
      <button type="button" class="secondary wf-insp-save-step"${n.type === "tool" ? " hidden" : ""} data-f-save-step>
        ${escapeHtml(L("saveAsStep", "Save as step"))}
      </button>
      <label>${escapeHtml(L("out", "out"))}<input data-f="out" value="${escapeHtml(n.out || "")}" /></label>
      <label>${escapeHtml(L("join", "join"))}
        <select data-f="join">
          <option value=""${!n.join ? " selected" : ""}>any (default)</option>
          <option value="all"${n.join === "all" ? " selected" : ""}>all</option>
        </select>
      </label>
    `;
    const syncTypeUi = () => {
      const toolRow = inspFields.querySelector(".wf-insp-tool");
      const promptRow = inspFields.querySelector(".wf-insp-prompt");
      const draftBtn = inspFields.querySelector(".wf-insp-draft");
      const saveStepBtn = inspFields.querySelector(".wf-insp-save-step");
      const isTool = n.type === "tool";
      if (toolRow) toolRow.hidden = !isTool;
      if (promptRow) promptRow.hidden = isTool;
      if (draftBtn) draftBtn.hidden = isTool;
      if (saveStepBtn) saveStepBtn.hidden = isTool;
    };
    inspFields.querySelector("[data-f=id]")?.addEventListener("change", (ev) => {
      const next = /** @type {HTMLInputElement} */ (ev.target).value.trim();
      if (!next || next === n.id) return;
      if (graph.nodes.some((x) => x.id === next)) return;
      const old = n.id;
      n.id = next;
      if (graph.entry === old) graph.entry = next;
      for (const e of graph.edges) {
        if (e.from === old) e.from = next;
        if (e.to === old) e.to = next;
      }
      selection = { kind: "node", id: next };
      emit();
      render();
    });
    inspFields.querySelector("[data-f=type]")?.addEventListener("change", (ev) => {
      n.type = /** @type {HTMLSelectElement} */ (ev.target).value;
      syncTypeUi();
      emit();
      render();
    });
    inspFields.querySelector("[data-f=name]")?.addEventListener("change", (ev) => {
      const v = /** @type {HTMLSelectElement} */ (ev.target).value;
      if (v) n.name = v;
      else delete n.name;
      emit();
      render();
    });
    inspFields.querySelector("[data-f=prompt]")?.addEventListener("change", (ev) => {
      n.prompt = /** @type {HTMLTextAreaElement} */ (ev.target).value;
      emit();
    });
    inspFields.querySelector("[data-f=out]")?.addEventListener("change", (ev) => {
      const v = /** @type {HTMLInputElement} */ (ev.target).value.trim();
      if (v) n.out = v;
      else delete n.out;
      emit();
    });
    inspFields.querySelector("[data-f=join]")?.addEventListener("change", (ev) => {
      const v = /** @type {HTMLSelectElement} */ (ev.target).value;
      if (v === "all") n.join = "all";
      else delete n.join;
      emit();
    });
    inspFields.querySelector("[data-f-draft]")?.addEventListener("click", async () => {
      await opts.onDraftPrompt?.(n);
      const ta = /** @type {HTMLTextAreaElement | null} */ (inspFields.querySelector("[data-f=prompt]"));
      if (ta) ta.value = n.prompt || "";
      emit();
      render();
    });
    inspFields.querySelector("[data-f-save-step]")?.addEventListener("click", async () => {
      await opts.onSaveStepTemplate?.(n);
    });
  }

  function wireStageEvents() {
    stage.querySelectorAll("[data-drag-node]").forEach((el) => {
      el.addEventListener("pointerdown", (ev) => {
        const id = el.getAttribute("data-drag-node");
        const n = id ? nodeById(id) : null;
        if (!n || !id) return;
        ev.preventDefault();
        selection = { kind: "node", id };
        if (!readOnly) {
          nodeDrag = {
            id,
            ox: n.x || 0,
            oy: n.y || 0,
            mx: ev.clientX,
            my: ev.clientY,
          };
          el.setPointerCapture?.(ev.pointerId);
        } else {
          // read-only: selection highlight only
        }
        renderInspector();
        stage.querySelectorAll(".wf-node").forEach((nodeEl) => {
          nodeEl.classList.toggle("is-selected", nodeEl.getAttribute("data-node-id") === id);
        });
      });
    });
    if (!readOnly) {
      stage.querySelectorAll("[data-port-out]").forEach((el) => {
        el.addEventListener("pointerdown", (ev) => {
          ev.stopPropagation();
          const fromId = el.getAttribute("data-port-out");
          if (!fromId) return;
          const pt = localPoint(ev.clientX, ev.clientY);
          linkDrag = {
            fromId,
            x: pt.x,
            y: pt.y,
          };
          el.setPointerCapture?.(ev.pointerId);
          render();
        });
      });
    }
    stage.querySelectorAll("[data-node-id]").forEach((el) => {
      el.addEventListener("click", () => {
        if (nodeDrag || linkDrag) return;
        const id = el.getAttribute("data-node-id");
        if (!id) return;
        selection = { kind: "node", id };
        render();
      });
    });
  }

  edgesSvg.addEventListener("click", (ev) => {
    const g = /** @type {Element | null} */ (ev.target)?.closest?.("[data-edge-index]");
    if (!g) return;
    const index = Number(g.getAttribute("data-edge-index"));
    if (!Number.isFinite(index)) return;
    selection = { kind: "edge", index };
    render();
  });

  root.addEventListener("pointermove", (ev) => {
    if (nodeDrag) {
      const n = nodeById(nodeDrag.id);
      if (!n) return;
      n.x = Math.max(0, nodeDrag.ox + (ev.clientX - nodeDrag.mx) / zoom);
      n.y = Math.max(0, nodeDrag.oy + (ev.clientY - nodeDrag.my) / zoom);
      render();
      return;
    }
    if (linkDrag) {
      const pt = localPoint(ev.clientX, ev.clientY);
      linkDrag.x = pt.x;
      linkDrag.y = pt.y;
      render();
    }
  });

  root.addEventListener("pointerup", (ev) => {
    if (nodeDrag) {
      nodeDrag = null;
      emit();
      render();
      return;
    }
    if (linkDrag) {
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const toId = target?.closest?.("[data-port-in], [data-node-id]")?.getAttribute("data-port-in")
        || target?.closest?.("[data-node-id]")?.getAttribute("data-node-id");
      const fromId = linkDrag.fromId;
      linkDrag = null;
      if (toId && toId !== fromId) {
        const exists = graph.edges.some((e) => e.from === fromId && e.to === toId);
        if (!exists) {
          graph.edges.push({ from: fromId, to: toId });
          emit();
        }
      }
      render();
    }
  });

  const closeAllMenus = () => {
    root.querySelectorAll(".wf-add-menu").forEach((menu) => {
      const panel = menu.querySelector(".wf-add-menu-panel");
      const toggle = menu.querySelector("[data-wf-menu-toggle]");
      if (panel) panel.hidden = true;
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      menu.classList.remove("is-open");
    });
  };

  root.querySelectorAll("[data-wf-menu-toggle]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const menu = btn.closest(".wf-add-menu");
      const panel = menu?.querySelector(".wf-add-menu-panel");
      if (!menu || !panel) return;
      const willOpen = panel.hidden;
      closeAllMenus();
      if (willOpen) {
        panel.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        menu.classList.add("is-open");
      }
    });
  });

  const addNode = (type, toolName, extras = {}) => {
    const idPrefix =
      extras.idPrefix ||
      (type === "tool" ? "tool" : type === "llm_fill" ? "fill" : "sum");
    const id = uniqueNodeId(idPrefix, graph.nodes);
    const n = {
      id,
      type,
      x: 40 + (graph.nodes.length % 3) * 220,
      y: 40 + Math.floor(graph.nodes.length / 3) * 110,
      ...(type !== "tool" ? { prompt: extras.prompt || "" } : {}),
      ...(type !== "tool" && extras.out ? { out: extras.out } : {}),
      ...(type !== "tool" && extras.label ? { label: extras.label } : {}),
      ...(type === "tool" && toolName ? { name: toolName } : {}),
      ...(type === "tool" && !toolName && opts.tools?.[0] ? { name: opts.tools[0].name } : {}),
    };
    graph.nodes.push(n);
    if (!graph.entry) graph.entry = id;
    selection = { kind: "node", id };
    closeAllMenus();
    emit();
    render();
  };

  root.querySelector("[data-wf-step-templates]")?.addEventListener("click", (ev) => {
    const createBtn =
      ev.target instanceof Element ? ev.target.closest("[data-wf-create-template]") : null;
    if (createBtn instanceof HTMLElement) {
      ev.preventDefault();
      ev.stopPropagation();
      closeAllMenus();
      if (typeof opts.onCreateStepTemplate !== "function") return;
      void (async () => {
        const created = await opts.onCreateStepTemplate();
        if (!created || typeof created.prompt !== "string") return;
        addNode(created.nodeType === "llm_fill" ? "llm_fill" : "llm_summarize", undefined, {
          prompt: created.prompt,
          idPrefix: created.id || "step",
          ...(created.label ? { label: created.label } : {}),
          ...(created.out ? { out: created.out } : {}),
        });
      })();
      return;
    }
    const btn =
      ev.target instanceof Element ? ev.target.closest("[data-wf-add-template]") : null;
    if (!(btn instanceof HTMLElement)) return;
    ev.stopPropagation();
    const tid = btn.getAttribute("data-wf-add-template");
    const tmpl = stepTemplates.find((t) => t.id === tid);
    if (!tmpl) return;
    addNode(tmpl.nodeType === "llm_fill" ? "llm_fill" : "llm_summarize", undefined, {
      prompt: tmpl.prompt,
      idPrefix: tmpl.id,
      label: tmpl.label,
      ...(tmpl.out ? { out: tmpl.out } : {}),
    });
  });

  root.querySelectorAll("[data-wf-add]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const type = btn.getAttribute("data-wf-add") || "llm_summarize";
      const toolName = btn.getAttribute("data-wf-tool") || "";
      addNode(type, toolName || undefined);
    });
  });

  const menuDocAbort = new AbortController();
  document.addEventListener(
    "click",
    (ev) => {
      if (!(ev.target instanceof Node) || !root.contains(ev.target)) {
        closeAllMenus();
        return;
      }
      if (!(ev.target instanceof Element) || !ev.target.closest(".wf-add-menu")) {
        closeAllMenus();
      }
    },
    { signal: menuDocAbort.signal },
  );
  document.addEventListener(
    "keydown",
    (ev) => {
      if (ev.key === "Escape") closeAllMenus();
    },
    { signal: menuDocAbort.signal },
  );

  root.querySelector("[data-wf-del]")?.addEventListener("click", () => {
    if (!selection) return;
    if (selection.kind === "edge") {
      graph.edges.splice(selection.index, 1);
    } else {
      const id = selection.id;
      graph.nodes = graph.nodes.filter((n) => n.id !== id);
      graph.edges = graph.edges.filter((e) => e.from !== id && e.to !== id);
      if (graph.entry === id) graph.entry = graph.nodes[0]?.id || "";
    }
    selection = null;
    emit();
    render();
  });

  root.querySelector("[data-wf-entry]")?.addEventListener("click", () => {
    if (selection?.kind !== "node") return;
    graph.entry = selection.id;
    emit();
    render();
  });

  root.querySelector("[data-wf-zoom-in]")?.addEventListener("click", () => {
    setZoom(zoom + ZOOM_STEP);
  });
  root.querySelector("[data-wf-zoom-out]")?.addEventListener("click", () => {
    setZoom(zoom - ZOOM_STEP);
  });
  root.querySelector("[data-wf-zoom-reset]")?.addEventListener("click", () => {
    setZoom(1);
  });

  stageWrap.addEventListener(
    "wheel",
    (ev) => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      const delta = ev.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom(zoom + delta);
    },
    { passive: false },
  );

  render();

  return {
    /** @param {import("./workflow-model.js").WfGraph} next */
    setGraph(next) {
      graph = structuredClone(next);
      autoLayout(graph.nodes);
      selection = null;
      runState.clear();
      render();
    },
    getGraph() {
      return structuredClone(graph);
    },
    /** Mark all nodes pending before a live run. */
    beginRun() {
      runState.clear();
      for (const n of graph.nodes) runState.set(n.id, "pending");
      render();
    },
    clearRun() {
      runState.clear();
      render();
    },
    /**
     * @param {string} nodeId
     * @param {"pending" | "running" | "ok" | "fail"} status
     */
    setNodeRunState(nodeId, status) {
      runState.set(nodeId, status);
      render();
    },
    /**
     * @param {Array<{ id: string, label: string, nodeType: string, prompt: string, out?: string }>} next
     */
    setStepTemplates(next) {
      stepTemplates = Array.isArray(next) ? [...next] : [];
      const host = root.querySelector("[data-wf-step-templates]");
      if (host) host.innerHTML = renderStepTemplateItems();
    },
    destroy() {
      menuDocAbort.abort();
      root.innerHTML = "";
    },
  };
}
