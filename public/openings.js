const state = {
  catalog: null,
  items: [],
  view: "list",
  map: null,
  markerLayer: null,
};

const STATUS_LABELS = {
  "opening-soon": "Opening soon",
  "under-construction": "Under construction",
  confirmed: "Confirmed",
  approved: "Approved",
  proposed: "Proposed",
  open: "Recently open",
  paused: "Paused",
  closed: "Closed",
};

const EVIDENCE_LABELS = {
  official: "Official source",
  permits: "Permit verified",
  firsthand: "Visited & verified",
  "business-confirmed": "Business confirmed",
  reported: "Credible reporting",
};

const COMMUNITY_COORDS = {
  "Castle Rock": [39.3722, -104.8561],
  Parker: [39.5186, -104.7614],
  "Lone Tree": [39.5362, -104.882],
  "Castle Pines": [39.458, -104.896],
  Sedalia: [39.4367, -104.959],
  "Highlands Ranch": [39.5539, -104.9694],
  Littleton: [39.6133, -105.0166],
  "Sterling Ranch": [39.4758, -105.0057],
  Roxborough: [39.4708, -105.0783],
  Larkspur: [39.2286, -104.8872],
};

const els = {
  list: document.querySelector("#list-view"),
  mapPanel: document.querySelector("#map-view"),
  empty: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"),
  emptyMessage: document.querySelector("#empty-message"),
  search: document.querySelector("#search"),
  community: document.querySelector("#community-filter"),
  category: document.querySelector("#category-filter"),
  status: document.querySelector("#status-filter"),
  resultCount: document.querySelector("#result-count"),
  clear: document.querySelector("#clear-filters"),
  template: document.querySelector("#opening-card-template"),
  dialog: document.querySelector("#tip-dialog"),
  tipForm: document.querySelector("#tip-form"),
  tipMessage: document.querySelector("#tip-message"),
  sourceSection: document.querySelector("#source-section"),
  sourceList: document.querySelector("#source-list"),
};

function formatDate(value) {
  if (!value) return "Not yet scanned";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(value.includes("T") ? value : `${value}T12:00:00`));
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function fillSelect(select, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function renderSummary(catalog) {
  setText("#hero-count", catalog.total);
  setText("#hero-update", `Catalog checked ${formatDate(catalog.updatedAt)}.`);
  setText("#stat-coming", catalog.stats.coming);
  setText("#stat-soon", catalog.stats.openingSoon);
  setText("#stat-open", catalog.stats.open);
  setText("#stat-communities", catalog.stats.communities);
  fillSelect(els.community, catalog.filters.communities);
  fillSelect(els.category, catalog.filters.categories);
}

function cardFor(item) {
  const card = els.template.content.firstElementChild.cloneNode(true);
  const status = card.querySelector(".status-badge");
  status.textContent = STATUS_LABELS[item.status] || item.status;
  status.classList.add(`status-${item.status}`);
  card.querySelector(".verified-date").textContent = `Checked ${formatDate(item.verifiedAt)}`;
  card.querySelector(".card-place").textContent = `${item.community} · ${item.area}`;
  card.querySelector("h3").textContent = item.name;
  card.querySelector(".opening-window").textContent = item.openingWindow;
  card.querySelector(".card-summary").textContent = item.summary;
  card.querySelector(".evidence-badge").textContent = EVIDENCE_LABELS[item.confidence] || "Source backed";
  card.querySelector(".category").textContent = item.category;
  card.querySelector(".address").textContent = item.address;
  const sourceLinks = card.querySelector(".source-links");
  for (const source of item.sources || []) {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `${source.label} ↗`;
    sourceLinks.append(link);
  }
  return card;
}

function currentFilters() {
  return {
    query: els.search.value.trim().toLowerCase(),
    community: els.community.value,
    category: els.category.value,
    status: els.status.value,
  };
}

function filteredItems() {
  const filters = currentFilters();
  return state.catalog.items.filter((item) => {
    if (filters.community !== "all" && item.community !== filters.community) return false;
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (!filters.query) return true;
    return [item.name, item.community, item.area, item.category, item.summary]
      .join(" ")
      .toLowerCase()
      .includes(filters.query);
  });
}

function renderItems() {
  state.items = filteredItems();
  els.list.replaceChildren(...state.items.map(cardFor));
  const active = Object.values(currentFilters()).some((value) => value && value !== "all");
  els.clear.hidden = !active;
  els.resultCount.textContent = `${state.items.length} ${state.items.length === 1 ? "place" : "places"} shown`;
  const selectedCommunity = currentFilters().community;
  const coverage = state.catalog.communityCoverage?.[selectedCommunity];
  els.emptyTitle.textContent = coverage?.emptyTitle || "No matches yet";
  els.emptyMessage.textContent = coverage?.emptyMessage || "Try removing a filter—or share a tip if we missed something.";
  els.empty.hidden = state.items.length > 0;
  els.list.hidden = state.view !== "list" || state.items.length === 0;
  els.mapPanel.hidden = state.view !== "map" || state.items.length === 0;
  if (state.view === "map" && state.items.length) renderMap();
}

function renderMap() {
  if (!window.L) return;
  if (!state.map) {
    state.map = L.map("openings-map", { scrollWheelZoom: false }).setView([39.48, -104.96], 10);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(state.map);
  }
  if (state.markerLayer) state.markerLayer.remove();
  state.markerLayer = L.layerGroup().addTo(state.map);
  const groups = new Map();
  for (const item of state.items) {
    if (!groups.has(item.community)) groups.set(item.community, []);
    groups.get(item.community).push(item);
  }
  const bounds = [];
  for (const [community, items] of groups) {
    const coords = COMMUNITY_COORDS[community];
    if (!coords) continue;
    bounds.push(coords);
    const marker = L.circleMarker(coords, {
      radius: Math.min(19, 9 + items.length),
      color: "#ffffff",
      weight: 3,
      fillColor: "#174b3a",
      fillOpacity: .95,
    });
    marker.bindPopup(`<strong>${community}</strong><span>${items.length} ${items.length === 1 ? "listing" : "listings"}</span>`);
    marker.on("click", () => {
      els.community.value = community;
    });
    marker.addTo(state.markerLayer);
  }
  setTimeout(() => {
    state.map.invalidateSize();
    if (bounds.length > 1) state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
  }, 50);
}

async function loadCatalog() {
  const response = await fetch("/api/openings");
  if (!response.ok) throw new Error("Could not load the openings tracker.");
  const catalog = await response.json();
  state.catalog = catalog;
  renderSummary(catalog);
  renderItems();
}

function renderSources(data) {
  const automated = data.automated ?? data.total;
  const responding = automated - data.errors;
  setText("#source-healthy", `${responding}/${automated}`);
  setText("#source-checked", data.lastRunAt ? `Last scan ${formatDate(data.lastRunAt)}` : "First automatic scan is queued");
  els.sourceList.replaceChildren(...data.sources.map((source) => {
    const item = document.createElement("article");
    item.className = "source-item";
    const dot = document.createElement("span");
    dot.className = `source-dot ${source.status}`;
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = source.name;
    const note = document.createElement("p");
    const coverage = source.monitorMode === "manual" ? "Manual verification" : source.community;
    note.textContent = `${coverage} · ${source.notes}`;
    copy.append(name, note);
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open ↗";
    item.append(dot, copy, link);
    return item;
  }));
}

async function loadSources() {
  try {
    const response = await fetch("/api/openings/sources");
    if (!response.ok) throw new Error();
    renderSources(await response.json());
  } catch {
    setText("#source-checked", "Source status unavailable");
  }
}

function openTip() {
  els.tipMessage.textContent = "";
  if (typeof els.dialog.showModal === "function") els.dialog.showModal();
}

async function submitTip(event) {
  event.preventDefault();
  const button = els.tipForm.querySelector(".submit-tip");
  button.disabled = true;
  els.tipMessage.textContent = "Sending…";
  try {
    const body = Object.fromEntries(new FormData(els.tipForm).entries());
    const response = await fetch("/api/openings/tips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    els.tipMessage.textContent = result.message || "Thanks for the tip.";
    if (response.ok) {
      els.tipForm.reset();
      button.textContent = "Tip received ✓";
      setTimeout(() => els.dialog.close(), 1500);
    }
  } catch {
    els.tipMessage.textContent = "We couldn’t send that tip. Please try again in a moment.";
  } finally {
    button.disabled = false;
    setTimeout(() => { button.textContent = "Send tip for verification"; }, 1800);
  }
}

for (const input of [els.search, els.community, els.category, els.status]) {
  input.addEventListener(input === els.search ? "input" : "change", renderItems);
}
els.clear.addEventListener("click", () => {
  els.search.value = "";
  els.community.value = "all";
  els.category.value = "all";
  els.status.value = "all";
  renderItems();
});
document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    document.querySelectorAll("[data-view]").forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle("active", active);
      candidate.setAttribute("aria-pressed", String(active));
    });
    renderItems();
  });
});
document.querySelectorAll("[data-open-tip]").forEach((button) => button.addEventListener("click", openTip));
document.querySelector("[data-close-tip]").addEventListener("click", () => els.dialog.close());
els.dialog.addEventListener("click", (event) => { if (event.target === els.dialog) els.dialog.close(); });
els.tipForm.addEventListener("submit", submitTip);
document.querySelector("#show-sources").addEventListener("click", () => {
  els.sourceSection.hidden = false;
  els.sourceSection.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#hide-sources").addEventListener("click", () => { els.sourceSection.hidden = true; });

Promise.all([loadCatalog(), loadSources()]).catch((error) => {
  els.resultCount.textContent = error.message;
});
