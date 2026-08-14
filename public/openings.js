const state = {
  catalog: null,
  items: [],
  quickStatus: "all",
  map: null,
  markerLayer: null,
  page: 1,
  pageSize: 15,
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

const MAP_STATUS_COLORS = {
  "opening-soon": "#c7792e",
  "under-construction": "#8d5b3d",
  confirmed: "#2e6f84",
  approved: "#5f6fa8",
  proposed: "#7a6b82",
  open: "#247456",
  paused: "#777777",
  closed: "#555555",
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
  pager: document.querySelector("#list-pager"),
  pagePrevious: document.querySelector("#page-previous"),
  pageNext: document.querySelector("#page-next"),
  pageStatus: document.querySelector("#page-status"),
  template: document.querySelector("#opening-card-template"),
  dialog: document.querySelector("#tip-dialog"),
  tipForm: document.querySelector("#tip-form"),
  tipMessage: document.querySelector("#tip-message"),
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  fillSelect(els.community, catalog.filters.communities);
  fillSelect(els.category, catalog.filters.categories);
}

function cardFor(item) {
  const card = els.template.content.firstElementChild.cloneNode(true);
  card.dataset.status = item.status;
  const status = card.querySelector(".status-badge");
  status.textContent = STATUS_LABELS[item.status] || item.status;
  status.classList.add(`status-${item.status}`);
  card.querySelector(".verified-date").textContent = `Verified ${formatDate(item.verifiedAt)}`;
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
    quickStatus: state.quickStatus,
  };
}

function filteredItems() {
  const filters = currentFilters();
  return state.catalog.items.filter((item) => {
    if (filters.community !== "all" && item.community !== filters.community) return false;
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.quickStatus === "coming" && ["open", "closed"].includes(item.status)) return false;
    if (["opening-soon", "open"].includes(filters.quickStatus) && item.status !== filters.quickStatus) return false;
    if (!filters.query) return true;
    return [item.name, item.community, item.area, item.category, item.summary]
      .join(" ")
      .toLowerCase()
      .includes(filters.query);
  });
}

function sortItems(items) {
  const statusOrder = {
    "opening-soon": 0,
    "under-construction": 1,
    confirmed: 2,
    approved: 3,
    proposed: 4,
    open: 5,
    paused: 6,
    closed: 7,
  };
  return [...items].sort((a, b) => {
    const statusDifference = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (statusDifference) return statusDifference;
    const dateDifference = String(b.verifiedAt || "").localeCompare(String(a.verifiedAt || ""));
    return dateDifference || a.name.localeCompare(b.name);
  });
}

function listSection(title, items) {
  const section = document.createElement("section");
  section.className = "opening-group";
  const heading = document.createElement("div");
  heading.className = "opening-group-heading";
  const name = document.createElement("h3");
  name.textContent = title;
  const count = document.createElement("span");
  count.textContent = `${items.length} ${items.length === 1 ? "place" : "places"}`;
  heading.append(name, count);
  const rows = document.createElement("div");
  rows.className = "opening-rows";
  rows.append(...items.map(cardFor));
  section.append(heading, rows);
  return section;
}

function renderList() {
  const pageCount = Math.max(1, Math.ceil(state.items.length / state.pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * state.pageSize;
  const pageItems = state.items.slice(start, start + state.pageSize);
  const upcoming = pageItems.filter((item) => item.status !== "open" && item.status !== "closed");
  const recentlyOpen = pageItems.filter((item) => item.status === "open");
  const other = pageItems.filter((item) => !upcoming.includes(item) && !recentlyOpen.includes(item));
  const groups = [];
  if (upcoming.length) groups.push(listSection("Coming up", upcoming));
  if (recentlyOpen.length) groups.push(listSection("Recently opened", recentlyOpen));
  if (other.length) groups.push(listSection("Other updates", other));
  els.list.replaceChildren(...groups);
  els.pager.hidden = state.items.length <= state.pageSize;
  els.pagePrevious.disabled = state.page === 1;
  els.pageNext.disabled = state.page === pageCount;
  els.pageStatus.textContent = `Page ${state.page} of ${pageCount}`;
}

function renderItems() {
  state.items = sortItems(filteredItems());
  renderList();
  const active = Object.values(currentFilters()).some((value) => value && value !== "all");
  els.clear.hidden = !active;
  els.resultCount.textContent = `${state.items.length} ${state.items.length === 1 ? "place" : "places"} shown`;
  const selectedCommunity = currentFilters().community;
  const coverage = state.catalog.communityCoverage?.[selectedCommunity];
  els.emptyTitle.textContent = coverage?.emptyTitle || "No matches yet";
  els.emptyMessage.textContent = coverage?.emptyMessage || "Try removing a filter—or share a tip if we missed something.";
  els.empty.hidden = state.items.length > 0;
  els.list.hidden = state.items.length === 0;
  els.mapPanel.hidden = state.items.length === 0;
  if (state.items.length) renderMap();
}

function renderMap() {
  if (!window.L) return;
  if (!state.map) {
    state.map = L.map("openings-map", { scrollWheelZoom: false }).setView([39.48, -104.96], 10);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(state.map);
    let lastPinchZoom = 0;
    document.querySelector("#openings-map").addEventListener("wheel", (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastPinchZoom < 120) return;
      lastPinchZoom = now;
      const change = event.deltaY < 0 ? 1 : -1;
      const nextZoom = Math.max(state.map.getMinZoom(), Math.min(state.map.getMaxZoom(), state.map.getZoom() + change));
      state.map.setZoom(nextZoom);
    }, { passive: false });
  }
  if (state.markerLayer) state.markerLayer.remove();
  state.markerLayer = L.layerGroup().addTo(state.map);
  const bounds = [];
  const coordinateCounts = new Map();
  for (const item of state.items) {
    const lat = Number(item.coordinates?.lat);
    const lng = Number(item.coordinates?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const overlapIndex = coordinateCounts.get(key) || 0;
    coordinateCounts.set(key, overlapIndex + 1);
    const angle = overlapIndex * 2.399963;
    const radius = overlapIndex === 0 ? 0 : .00016 * Math.ceil(overlapIndex / 5);
    const coords = [
      lat + Math.cos(angle) * radius,
      lng + Math.sin(angle) * radius * 1.25,
    ];
    bounds.push(coords);
    const marker = L.circleMarker(coords, {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: MAP_STATUS_COLORS[item.status] || "#174b3a",
      fillOpacity: .95,
    });
    const precision = item.coordinates.precision === "address" ? "Address location" : "Approximate project location";
    const source = item.sources?.[0];
    const sourceLink = source
      ? `<a class="popup-source" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">View evidence ↗</a>`
      : "";
    marker.bindPopup(
      `<strong>${escapeHtml(item.name)}</strong>` +
      `<span>${escapeHtml(item.community)} · ${escapeHtml(item.area)}</span>` +
      `<span class="popup-status">${escapeHtml(STATUS_LABELS[item.status] || item.status)}</span>` +
      `<span class="popup-precision">${precision}</span>` +
      sourceLink
    );
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
    body.sourceUrl = normalizeSourceUrl(body.sourceUrl);
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

function normalizeSourceUrl(value) {
  const sourceUrl = String(value || "").trim();
  if (!sourceUrl || /^[a-z][a-z\d+.-]*:\/\//i.test(sourceUrl)) return sourceUrl;
  return `https://${sourceUrl}`;
}

for (const input of [els.search, els.community, els.category, els.status]) {
  input.addEventListener(input === els.search ? "input" : "change", () => {
    if (input === els.status) {
      state.quickStatus = "all";
      document.querySelectorAll("[data-quick-status]").forEach((button) => button.setAttribute("aria-pressed", "false"));
    }
    state.page = 1;
    renderItems();
  });
}
els.clear.addEventListener("click", () => {
  els.search.value = "";
  els.community.value = "all";
  els.category.value = "all";
  els.status.value = "all";
  state.quickStatus = "all";
  document.querySelectorAll("[data-quick-status]").forEach((button) => button.setAttribute("aria-pressed", "false"));
  state.page = 1;
  renderItems();
});
els.pagePrevious.addEventListener("click", () => {
  state.page -= 1;
  renderItems();
  document.querySelector(".tracker")?.scrollIntoView({ behavior: "smooth", block: "start" });
});
els.pageNext.addEventListener("click", () => {
  state.page += 1;
  renderItems();
  document.querySelector(".tracker")?.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelectorAll("[data-quick-status]").forEach((button) => {
  button.addEventListener("click", () => {
    state.quickStatus = state.quickStatus === button.dataset.quickStatus ? "all" : button.dataset.quickStatus;
    els.status.value = "all";
    state.page = 1;
    document.querySelectorAll("[data-quick-status]").forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate.dataset.quickStatus === state.quickStatus));
    });
    renderItems();
    document.querySelector(".tracker")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
document.querySelectorAll("[data-open-tip]").forEach((button) => button.addEventListener("click", openTip));
document.querySelector("[data-close-tip]").addEventListener("click", () => els.dialog.close());
els.dialog.addEventListener("click", (event) => { if (event.target === els.dialog) els.dialog.close(); });
els.tipForm.addEventListener("submit", submitTip);
loadCatalog().catch((error) => {
  els.resultCount.textContent = error.message;
});
