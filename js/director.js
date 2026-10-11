// director.js
import { showTooltipAt, hideTooltip, nodeTooltipHtml } from "./tooltip.js";

const ORBITS = { moon: "earth", phobos: "mars", io: "jupiter", europa: "jupiter", titan: "saturn" };
const isMoonKey = (key) => Object.prototype.hasOwnProperty.call(ORBITS, key);

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bodyGlyph(kind) {
  if (kind === "star") return "☉";
  if (kind === "planet") return "⬢";
  return "•";
}

function getLinkedLocations(universe, body) {
  const ids = body.locations || [];
  return ids.map(id => universe.planets.find(p => p.id === id)).filter(Boolean);
}

function addLine(svg, x1, y1, x2, y2, alpha = 0.14) {
  const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
  ln.setAttribute("x1", String(Math.round(x1)));
  ln.setAttribute("y1", String(Math.round(y1)));
  ln.setAttribute("x2", String(Math.round(x2)));
  ln.setAttribute("y2", String(Math.round(y2)));
  ln.setAttribute("stroke", `rgba(255,255,255,${alpha})`);
  ln.setAttribute("stroke-width", "1");
  svg.appendChild(ln);
  return ln;
}

function normalizeIconUrl(v) {
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || t === "null" || t === "undefined") return "";
    return t;
  }
  if (v && typeof v === "object") {
    if (typeof v.image === "string") return v.image;
    if (typeof v.src === "string") return v.src;
    if (typeof v.url === "string") return v.url;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return "";
}

function hexToRgb(hex) {
  const s = String(hex || "").replace("#", "").trim();
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16);
    const g = parseInt(s[1] + s[1], 16);
    const b = parseInt(s[2] + s[2], 16);
    return { r, g, b };
  }
  if (s.length === 6) {
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    return { r, g, b };
  }
  return { r: 120, g: 190, b: 255 }; // fallback #78BEFF
}


// Cache: url|size|tint -> dataURL (or null)
const __BLUE_TINT_CACHE__ = new Map();

/**
 * Takes source PNG, uses its BLUE channel as ALPHA, and paints RGB = tint color.
 * Output pixel: (tintR, tintG, tintB, alpha=sourceBlue)
 * Returns dataURL or null if it fails (404/CORS/tainted canvas).
 */
async function blueToAlphaTintDataUrl(url, size, tintHex) {
  const key = `${url}|${size}|${tintHex}`;
  if (__BLUE_TINT_CACHE__.has(key)) return __BLUE_TINT_CACHE__.get(key);

  const outP = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const s = Math.max(2, Math.round(size || 64));
        const canvas = document.createElement("canvas");
        canvas.width = s;
        canvas.height = s;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        ctx.clearRect(0, 0, s, s);

        // contain-fit into square
        const iw = img.naturalWidth || s;
        const ih = img.naturalHeight || s;
        const sc = Math.min(s / iw, s / ih);
        const dw = Math.round(iw * sc);
        const dh = Math.round(ih * sc);
        const dx = Math.round((s - dw) * 0.5);
        const dy = Math.round((s - dh) * 0.5);
        ctx.drawImage(img, dx, dy, dw, dh);

        const im = ctx.getImageData(0, 0, s, s);
        const d = im.data;

        const tint = hexToRgb(tintHex || "#78BEFF");

        for (let i = 0; i < d.length; i += 4) {
          const b = d[i + 2];      // source blue
          d[i + 0] = tint.r;       // tint rgb
          d[i + 1] = tint.g;
          d[i + 2] = tint.b;
          d[i + 3] = b;            // alpha = blue
        }

        ctx.putImageData(im, 0, 0);
        const out = canvas.toDataURL("image/png");
        __BLUE_TINT_CACHE__.set(key, out);
        resolve(out);
      } catch {
        __BLUE_TINT_CACHE__.set(key, null);
        resolve(null);
      }
    };

    img.onerror = () => {
      __BLUE_TINT_CACHE__.set(key, null);
      resolve(null);
    };

    img.src = url;

  });

  const out = await outP;
  __BLUE_TINT_CACHE__.set(key, out);
  return out;
}

export function renderDirector({ stageEl, universe, getTheme, setRoute, setSelection }) {
  stageEl.innerHTML = "";

  const bodies = universe.solSystem?.bodies || [];
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;

  // IMPORTANT: use integer midY so nodes and line share exact center
  const midY = Math.round(h * 0.5);

  // SVG overlay
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.style.position = "absolute";
  svg.style.inset = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.zIndex = "5";
  svg.style.pointerEvents = "none";
  stageEl.appendChild(svg);

  // Midline
  const midLine = document.createElement("div");
  midLine.style.position = "absolute";
  midLine.style.height = "1px";
  midLine.style.background = "rgba(255,255,255,.10)";
  midLine.style.top = `${midY}px`;
  midLine.style.zIndex = "6";
  stageEl.appendChild(midLine);

  const primaries = bodies.filter(b => !isMoonKey(b.key));
  const moons = bodies.filter(b => isMoonKey(b.key));

  const pad = clamp(Math.round(w * 0.06), 50, 140);
  const left = pad;
  const right = Math.max(left + 1, w - pad);
  const span = right - left;

  const pos = new Map(); // key -> {x,y,size,kind}

  // Place primaries
  primaries.forEach((b, i) => {
    const t = primaries.length === 1 ? 0.5 : i / (primaries.length - 1);
    const x = Math.round(left + span * t);
    const kind = b.kind || (b.key === "sun" ? "star" : "planet");
    const size = kind === "star" ? 78 : 54;

    pos.set(b.key, { x, y: midY, size, kind });

    const node = makeBodyNodeSync({ stageEl, universe, body: b, x, y: midY, size, glyph: bodyGlyph(kind) });
    stageEl.appendChild(node.el);
    stageEl.appendChild(node.labelEl);

    // async icon processing (does NOT block layout)
    void hydrateBodyIcon(node.el, b, size);
  });

  // Midline endpoints: first and last primary centers
  if (primaries.length) {
    const first = pos.get(primaries[0].key);
    const last = pos.get(primaries[primaries.length - 1].key);
    const x1 = first?.x ?? left;
    const x2 = last?.x ?? right;
    midLine.style.left = `${Math.min(x1, x2)}px`;
    midLine.style.width = `${Math.abs(x2 - x1)}px`;
  } else {
    midLine.style.left = `${left}px`;
    midLine.style.width = `${span}px`;
  }

  // --- Moons stack above parent ---
  const moonsByParent = new Map();
  for (const m of moons) {
    const parentKey = ORBITS[m.key];
    if (!moonsByParent.has(parentKey)) moonsByParent.set(parentKey, []);
    moonsByParent.get(parentKey).push(m);
  }

  const moonFirstLift = 150; // more air
  const moonGap = 34;

  for (const [parentKey, list] of moonsByParent.entries()) {
    const parent = pos.get(parentKey);
    if (!parent) continue;

    list.forEach((m, idx) => {
      const x = parent.x;
      const y = midY - moonFirstLift - idx * moonGap;
      const size = 30;

      // Register moon position so locations can be attached to moons too.
      pos.set(m.key, { x, y, size, kind: "moon" });

      addLine(svg, x, y + size * 0.15, parent.x, midY - parent.size * 0.15, 0.14);

      const node = makeBodyNodeSync({ stageEl, universe, body: m, x, y, size, glyph: bodyGlyph("moon") });
      stageEl.appendChild(node.el);
      stageEl.appendChild(node.labelEl);
      void hydrateBodyIcon(node.el, m, size);
    });
  }

  // --- Director location dots (above/below bodies) ---
  // Locations inherit their dot color/icon from a per-location nodeType.
  // We support both primaries and moons as attach points.
  const allBodies = [...primaries, ...moons];

  function getLocNodeType(loc, fallback) {
    const d = loc?.director || {};
    const t = (d.nodeType ?? d.type ?? "");
    if (typeof t === "string" && t.trim()) return t.trim();
    return fallback;
  }

  function themeForLoc(loc, fallbackType) {
    const t = getLocNodeType(loc, fallbackType);
    return getTheme?.(t) || { label: t, icon: "•", color: "#78BEFF" };
  }

  const orbitalFirstLift = 110;
  const orbitalGap = 92;
  const labelNudge = 22;
  const dotSize = 26;

  // collect: orbitals + surface
  const orbitalsByParent = new Map();
  const surfaceByParent = new Map();

  for (const b of allBodies) {
    const parentKey = b.key;
    const linked = getLinkedLocations(universe, b);
    if (!linked.length) continue;

    const orbitalLocs = linked
      .filter(p => p.director?.bodyKey === parentKey && !!p.director?.orbital)
      .slice()
      .sort((a, bb) => (Number(a.director?.stackOrder ?? 0) - Number(bb.director?.stackOrder ?? 0)));

    const surfaceLocs = linked
      .filter(p => !(p.director?.bodyKey === parentKey && !!p.director?.orbital))
      .slice()
      .sort((a, bb) => (Number(a.director?.stackOrder ?? 0) - Number(bb.director?.stackOrder ?? 0)));

    if (orbitalLocs.length) orbitalsByParent.set(parentKey, orbitalLocs);
    if (surfaceLocs.length) surfaceByParent.set(parentKey, surfaceLocs);
  }

  function makeLocDot({ loc, parentKey, parentPos, x, y, theme, kindTag }) {
    const dot = document.createElement("div");
    dot.className = "node";
    dot.style.position = "absolute";
    dot.style.transform = "translate(-50%,-50%)";
    dot.style.width = `${dotSize}px`;
    dot.style.height = `${dotSize}px`;
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    dot.style.zIndex = "11";
    dot.style.borderColor = `${theme.color}55`;

    // Add a tiny moon tag if this location is attached to a moon body.
    const tag = kindTag ? `<div style="position:absolute; right:-6px; bottom:-6px; width:14px; height:14px; border-radius:999px; border:1px solid rgba(255,255,255,.18); background:rgba(0,0,0,.35); display:flex; align-items:center; justify-content:center; font-size:9px; font-family:var(--mono); color:${escapeHtml(theme.color)};">${escapeHtml(kindTag)}</div>` : "";

    dot.innerHTML = `
      <div class="ring"></div>
      <div class="glyph" style="color:${escapeHtml(theme.color)};">${escapeHtml(theme.icon || "•")}</div>
      ${tag}
    `;

    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      setSelection?.({ kind: "planet", planetId: loc.id });
      setRoute?.({ page: "location", planetId: loc.id });
    });

    dot.addEventListener("mousemove", (e) => {
      const fakeNode = {
        id: loc.id,
        name: loc.name,
        type: theme.label || getLocNodeType(loc, "Location"),
        enabled: true,
        description: loc.subtitle || ""
      };
      showTooltipAt(e.clientX, e.clientY, nodeTooltipHtml({ node: fakeNode, theme, planet: { name: parentKey } }));
    });
    dot.addEventListener("mouseleave", hideTooltip);

    stageEl.appendChild(dot);

    const lab = document.createElement("div");
    lab.style.position = "absolute";
    lab.style.left = `${x}px`;
    lab.style.top = `${y + labelNudge}px`;
    lab.style.transform = "translateX(-50%)";
    lab.style.fontFamily = "var(--mono)";
    lab.style.fontSize = "10px";
    lab.style.letterSpacing = ".08em";
    lab.style.color = "rgba(255,255,255,.55)";
    lab.style.zIndex = "9";
    lab.textContent = (loc.name || loc.id).toUpperCase();
    stageEl.appendChild(lab);
  }

  // Orbitals ABOVE the body they are attached to.
  for (const [parentKey, locs] of orbitalsByParent.entries()) {
    const parentPos = pos.get(parentKey);
    if (!parentPos) continue;
    const isMoon = parentPos.kind === "moon";

    locs.forEach((loc, idx) => {
      const x = parentPos.x;
      const y = parentPos.y - orbitalFirstLift - idx * orbitalGap;
      const theme = themeForLoc(loc, "Landing Zone");

      addLine(svg, x, y, parentPos.x, parentPos.y, 0.12);
      makeLocDot({ loc, parentKey, parentPos, x, y, theme, kindTag: isMoon ? "M" : "" });
    });
  }

  // Surface locations BELOW the body they are attached to.
  for (const [parentKey, locs] of surfaceByParent.entries()) {
    const parentPos = pos.get(parentKey);
    if (!parentPos) continue;
    const isMoon = parentPos.kind === "moon";

    locs.forEach((loc, idx) => {
      const x = parentPos.x;
      const y = parentPos.y + orbitalFirstLift + idx * orbitalGap;
      const theme = themeForLoc(loc, "Patrol");

      addLine(svg, x, y, parentPos.x, parentPos.y, 0.10);
      makeLocDot({ loc, parentKey, parentPos, x, y, theme, kindTag: isMoon ? "M" : "" });
    });
  }

  // ---------- helpers (sync DOM + async icon hydrate) ----------

  function makeBodyNodeSync({ stageEl, universe, body, x, y, size, glyph }) {
    const node = document.createElement("div");
    node.className = "node";
    node.style.position = "absolute";
    node.style.transform = "translate(-50%,-50%)";
    node.style.width = `${size}px`;
    node.style.height = `${size}px`;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.zIndex = "10";

    const color = String(body.color || "#78BEFF").trim();
    node.style.borderColor = `${color}55`;

    // Placeholder: glyph visible; icon img exists but empty (we fill later if possible)
    node.innerHTML = `
      <div class="ring"></div>
      <img class="nodeIcon" alt="${escapeHtml(body.label || body.key)}" draggable="false" style="display:none;" />
      <div class="glyph" style="color:${escapeHtml(color)};">${escapeHtml(glyph || "•")}</div>
    `;

    const linked = getLinkedLocations(universe, body);

    // Bodies are NOT clickable now; only hover tooltip
    node.addEventListener("mousemove", (e) => {
      const fakeNode = {
        id: body.key,
        name: body.label,
        type: "destination",
        enabled: true,
        description: linked.length ? `${linked.length} location(s) linked` : "No linked locations yet"
      };
      showTooltipAt(e.clientX, e.clientY, nodeTooltipHtml({
        node: fakeNode,
        theme: { label: "Destination", icon: glyph || "⬢", color },
        planet: { name: body.label }
      }));
    });
    node.addEventListener("mouseleave", hideTooltip);

    const labelEl = document.createElement("div");
    labelEl.style.position = "absolute";
    labelEl.style.left = `${x}px`;
    labelEl.style.top = `${y + size * 0.65 + 10}px`;
    labelEl.style.transform = "translateX(-50%)";
    labelEl.style.fontFamily = "var(--mono)";
    labelEl.style.fontSize = "11px";
    labelEl.style.letterSpacing = ".08em";
    labelEl.style.color = "rgba(255,255,255,.65)";
    labelEl.style.zIndex = "9";
    labelEl.textContent = (body.label || body.key).toUpperCase();

    return { el: node, labelEl };
  }

  async function hydrateBodyIcon(nodeEl, body, size) {
    const iconUrl = normalizeIconUrl(body.icon ?? body.iconUrl ?? body.image ?? "");
    const url = String(iconUrl || "").trim();
    if (!url) return;

    const color = String(body.color || "#78BEFF").trim();
    const imgEl = nodeEl.querySelector(".nodeIcon");
    const glyphEl = nodeEl.querySelector(".glyph");

    if (!imgEl) return;

    imgEl.addEventListener("dragstart", (e) => e.preventDefault());

    const processed = await blueToAlphaTintDataUrl(url, size, color);
    if (!processed) {
      // Fail: keep glyph, hide img
      imgEl.style.display = "none";
      return;
    }

    imgEl.src = processed;
    imgEl.style.display = "block";
    // Hide glyph when we have a proper icon
    if (glyphEl) glyphEl.textContent = "";
  }
}