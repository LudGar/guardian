import { showTooltipAt, hideTooltip, nodeTooltipHtml } from "./tooltip.js";

export function renderLocation({ stageEl, universe, getTheme, planetId, setSelection }) {
  // cleanup previous listeners
  stageEl.__ac?.abort?.();
  stageEl.__ac = new AbortController();
  const { signal } = stageEl.__ac;

  const planet = universe.planets.find(p => p.id === planetId);
  stageEl.innerHTML = "";

  if (!planet) {
    stageEl.innerHTML = `<div style="padding:14px; color:rgba(255,255,255,.7)">Unknown planet: ${escapeHtml(planetId)}</div>`;
    return;
  }

  // Ensure arrays exist
  planet.nodes ??= [];
  planet.labels ??= []; // <--- labels live here

  // --- DOM ---
  const wrap = document.createElement("div");
  wrap.className = "mapWrap";
  stageEl.appendChild(wrap);

  const viewport = document.createElement("div");
  viewport.className = "mapViewport";
  wrap.appendChild(viewport);

  // transform this layer for panning (translate only)
  const content = document.createElement("div");
  content.className = "mapContent";
  viewport.appendChild(content);

  const img = document.createElement("img");
  img.className = "mapImage";
  img.src = planet.map?.image || "";
  img.alt = planet.name;
  img.draggable = false;
  img.addEventListener("dragstart", (e) => e.preventDefault(), { signal });
  content.appendChild(img);

  // Layers (same coordinate system: map pixels)
  const nodeLayer = document.createElement("div");
  nodeLayer.className = "nodeLayer";
  content.appendChild(nodeLayer);

  const labelLayer = document.createElement("div");
  labelLayer.className = "labelLayer";
  content.appendChild(labelLayer);

  // ---- pan state (no zoom) ----
  let tx = 0;
  let ty = 0;

  function applyPan() {
    content.style.transform = `translate(${tx}px, ${ty}px)`;
  }

  function screenToMap(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return { mx: sx - tx, my: sy - ty };
  }

  // center on load at 1:1
  img.onload = () => {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    const iw = img.naturalWidth || 0;
    const ih = img.naturalHeight || 0;

    // ensure 1:1 size
    if (iw) img.style.width = `${iw}px`;
    if (ih) img.style.height = `${ih}px`;

    nodeLayer.style.width = iw ? `${iw}px` : "";
    nodeLayer.style.height = ih ? `${ih}px` : "";
    labelLayer.style.width = iw ? `${iw}px` : "";
    labelLayer.style.height = ih ? `${ih}px` : "";

    tx = Math.round((vw - iw) * 0.5);
    ty = Math.round((vh - ih) * 0.5);
    applyPan();

    renderNodes();
    renderLabels();
  };

  if (img.complete && img.naturalWidth) img.onload?.();

  // ---- panning ----
  let panning = false;
  let startX = 0, startY = 0, startTx = 0, startTy = 0;

  viewport.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    // don't pan if grabbing a node/label
    if (e.target.closest(".node")) return;
    if (e.target.closest(".mapLabel")) return;

    panning = true;
    viewport.classList.add("panning");
    startX = e.clientX;
    startY = e.clientY;
    startTx = tx;
    startTy = ty;
    e.preventDefault();
  }, { signal });

  window.addEventListener("mousemove", (e) => {
    if (!panning) return;
    tx = startTx + (e.clientX - startX);
    ty = startTy + (e.clientY - startY);
    applyPan();
  }, { signal });

  window.addEventListener("mouseup", () => {
    if (!panning) return;
    panning = false;
    viewport.classList.remove("panning");
  }, { signal });

  // ---- dragging (node OR label), no rerender; just save ----
  // drag = { kind:"node"|"label", el, obj, grabDx, grabDy }
  let drag = null;

  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const { mx, my } = screenToMap(e.clientX, e.clientY);

    drag.obj.x = Math.round(mx - drag.grabDx);
    drag.obj.y = Math.round(my - drag.grabDy);

    // apply to DOM
    drag.el.style.left = `${drag.obj.x}px`;
    drag.el.style.top  = `${drag.obj.y}px`;
  }, { signal });

  window.addEventListener("mouseup", () => {
    if (!drag) return;

    // persist WITHOUT rerender so the camera doesn't reset
    window.__APP__?.save?.({ rerender: false });

    drag = null;
  }, { signal });

  // ---- helpers ----
  function clearSelectionClasses() {
    nodeLayer.querySelectorAll(".node.selected").forEach(n => n.classList.remove("selected"));
    labelLayer.querySelectorAll(".mapLabel.selected").forEach(l => l.classList.remove("selected"));
  }

  function renderNodes() {
    nodeLayer.innerHTML = "";

    for (const node of (planet.nodes || [])) {
      const theme = getTheme(node.type);

      const el = document.createElement("div");
      el.className = `node ${node.enabled === false ? "disabled" : ""}`;

      const size = node.size ?? 22;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.left = `${node.x ?? 200}px`;
      el.style.top  = `${node.y ?? 200}px`;

      el.style.borderColor = `${theme.color}55`;
      el.innerHTML = `
        <div class="ring"></div>
        <div class="glyph" style="color:${escapeHtml(theme.color)};">${escapeHtml(theme.icon || "•")}</div>
      `;

      nodeLayer.appendChild(el);

      if (node.enabled === false) continue;

      // select on click
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        clearSelectionClasses();
        el.classList.add("selected");
        setSelection({ kind: "activity", planetId: planet.id, nodeId: node.id });
      }, { signal });

      // tooltip (includes description)
      el.addEventListener("mousemove", (e) => {
        showTooltipAt(e.clientX, e.clientY, nodeTooltipHtml({ node, theme, planet }));
      }, { signal });
      el.addEventListener("mouseleave", hideTooltip, { signal });

      // drag
      el.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        clearSelectionClasses();
        el.classList.add("selected");
        setSelection({ kind: "activity", planetId: planet.id, nodeId: node.id });

        const { mx, my } = screenToMap(e.clientX, e.clientY);

        // grab offset so it doesn't jump
        const grabDx = mx - (node.x ?? 0);
        const grabDy = my - (node.y ?? 0);

        drag = { kind: "node", el, obj: node, grabDx, grabDy };
      }, { signal });
    }
  }

  function renderLabels() {
    labelLayer.innerHTML = "";

    for (const label of (planet.labels || [])) {
      const el = document.createElement("div");
      el.className = `mapLabel ${label.boxed ? "boxed" : ""}`;
      el.style.position = "absolute";
      el.style.left = `${label.x ?? 240}px`;
      el.style.top  = `${label.y ?? 240}px`;
      el.textContent = label.text ?? "";

      labelLayer.appendChild(el);

// select on click
el.addEventListener("click", (e) => {
  e.stopPropagation();
  clearSelectionClasses();
  el.classList.add("selected");
  setSelection({ kind: "label", planetId: planet.id, labelId: label.id });
}, { signal });

// drag labels
el.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();

  clearSelectionClasses();
  el.classList.add("selected");
  setSelection({ kind: "label", planetId: planet.id, labelId: label.id });

  const { mx, my } = screenToMap(e.clientX, e.clientY);
  const grabDx = mx - (label.x ?? 0);
  const grabDy = my - (label.y ?? 0);

  drag = { kind: "label", el, obj: label, grabDx, grabDy };
}, { signal });
    }
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}