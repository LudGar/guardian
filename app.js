// app.js
import { loadAllData, saveUniverseJson, getThemeFromCatalog } from "./js/storage.js";
import { initTooltip, hideTooltip } from "./js/tooltip.js";
import { renderDirector } from "./js/director.js";
import { renderLocation } from "./js/location.js";

const stageEl = document.getElementById("stage");
const tooltipEl = document.getElementById("tooltip");
const crumbsEl = document.getElementById("crumbs");
const brandBtn = document.getElementById("brandBtn");

initTooltip(tooltipEl);

let universe = null;
let catalog = null;
let selection = null;

function parseRoute() {
  const h = location.hash.replace(/^#/, "");
  if (!h || h === "director") return { page: "director" };
  const [page, planetId] = h.split("/");
  if (page === "location" && planetId) return { page: "location", planetId };
  return { page: "director" };
}

function setRoute(route) {
  if (route.page === "director") location.hash = "director";
  else if (route.page === "location") location.hash = `location/${route.planetId}`;
}

function setSelection(sel) {
  selection = sel;
  window.__APP__?.onSelection?.(sel);
}

function getTheme(type) {
  return getThemeFromCatalog(catalog, type);
}

function save({ rerender = true } = {}) {
  if (!universe) return;
  saveUniverseJson(universe);
  if (rerender) render();
}

function render() {
  if (!universe) return;
  hideTooltip();

  const route = parseRoute();

  if (route.page === "director") {
    crumbsEl.textContent = "DIRECTOR";
    renderDirector({
      stageEl,
      universe,
      catalog,
      getTheme,
      setRoute,
      setSelection
    });
    return;
  }

  if (route.page === "location") {
    const planet = universe.planets.find(p => p.id === route.planetId);
    crumbsEl.textContent = `DIRECTOR / ${planet?.name ?? route.planetId}`;

    renderLocation({
      stageEl,
      universe,
      catalog,
      getTheme,
      planetId: route.planetId,
      setSelection
    });
    return;
  }
}

async function boot() {
  const data = await loadAllData();
  universe = data.universe;
  catalog = data.catalog;

  window.__APP__ = {
    // data
    getUniverse: () => universe,
    setUniverse: (u, { rerender = true } = {}) => {
      universe = u;
      if (rerender) render();
    },
    getCatalog: () => catalog,
    setCatalog: (c, { rerender = true } = {}) => {
      catalog = c;
      if (rerender) render();
    },

    // selection + routing
    getSelection: () => selection,
    setSelection,
    setRoute,

    // theming
    getTheme,

    // persistence
    save,

    // view
    render
  };

  render();
}

window.addEventListener("resize", () => window.__APP__?.render?.());
window.addEventListener("hashchange", () => window.__APP__?.render?.());

brandBtn.addEventListener("click", () => setRoute({ page: "director" }));

  else alert("Editor not available (read-only build).");
});

boot().catch(err => {
  console.error(err);
  stageEl.innerHTML = `<pre style="padding:14px; color:rgba(255,120,120,.9); white-space:pre-wrap;">${String(err)}</pre>`;
});