let tipEl;

export function initTooltip(el) {
  tipEl = el;
}

export function hideTooltip() {
  if (!tipEl) return;
  tipEl.hidden = true;
}

export function showTooltipAt(x, y, html) {
  if (!tipEl) return;
  tipEl.innerHTML = html;
  tipEl.hidden = false;

  const pad = 14;
  const rect = tipEl.getBoundingClientRect();
  let left = x + 16;
  let top  = y + 16;

  // keep onscreen
  if (left + rect.width > window.innerWidth - pad) left = x - rect.width - 16;
  if (top + rect.height > window.innerHeight - pad) top = y - rect.height - 16;

  tipEl.style.left = `${Math.max(pad, left)}px`;
  tipEl.style.top  = `${Math.max(pad, top)}px`;
}

function arr(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === "string" && v.trim()) return v.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

export function nodeTooltipHtml({ node, theme }) {
  const typeLabel = theme?.label || node.type || "Unknown";
  const icon = theme?.icon || "•";
  const color = theme?.color || "#78BEFF";

  const enemies = arr(node.enemies);
  const bosses  = arr(node.bosses);

  const desc = (node.description || "").trim();

  return `
    <div class="ttHead">
      <div>
        <div class="ttTitle">${escapeHtml(node.name || node.id)}</div>
        <div class="ttType">${escapeHtml(typeLabel)}</div>
      </div>
      <div style="font-family:var(--mono); color:${escapeHtml(color)}; font-size:16px;">
        ${escapeHtml(icon)}
      </div>
    </div>

    ${desc ? `<div class="ttBody">${escapeHtml(desc)}</div>` : ``}

    ${(enemies.length || bosses.length) ? `
      <div class="kv" style="margin-top:${desc ? "10px" : "8px"};">
        ${enemies.length ? `<div class="k">enemies</div><div>${escapeHtml(enemies.join(", "))}</div>` : ``}
        ${bosses.length  ? `<div class="k">bosses</div><div>${escapeHtml(bosses.join(", "))}</div>` : ``}
      </div>
    ` : ``}

    <div class="ttBar">
      <div style="width:${node.enabled === false ? "18%" : "72%"}; background:${escapeHtml(color)}"></div>
    </div>

    <div class="kv">
      <div class="k">node id</div><div>${escapeHtml(node.id)}</div>
      <div class="k">type</div><div>${escapeHtml(node.type || "")}</div>
      <div class="k">status</div><div>${node.enabled === false ? "disabled" : "active"}</div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
