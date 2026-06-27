const statusTitle = document.querySelector("#poolStatusTitle");
const statusSummary = document.querySelector("#poolStatusSummary");
const residentAction = document.querySelector("#poolResidentAction");
const signalLabel = document.querySelector("#poolSignalLabel");
const lastChecked = document.querySelector("#poolLastChecked");
const sourceLink = document.querySelector("#poolSourceLink");
const actionLink = document.querySelector("#poolActionLink");
const refreshButton = document.querySelector("#refreshStatus");
const statusAlert = document.querySelector("#poolStatusAlert");
const statusDot = document.querySelector("#poolStatusDot");
const currentText = document.querySelector("#poolCurrentText");

const FALLBACK_STATUS = {
  state: "unknown",
  headline: "Status unavailable",
  summary: "The official CAB pool status could not be checked right now.",
  residentAction: "Open the official CAB pool page for the latest information.",
  officialColorLabel: "Unknown",
  sourceUrl: "https://sterlingranchcab.com/187/Pool",
  actionUrl: "https://sterlingranchcab.com/187/Pool",
  checkedAt: new Date().toISOString(),
};

function trackPoolEvent(name, params = {}) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

function formatCheckedAt(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "Just now";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function actionLabelFor(status) {
  if (status.state === "at-capacity") return "Open waitlist or CAB page";
  if (status.state === "event-only") return "Open CAB event details";
  return "Open official CAB page";
}

function setLoading(isRefreshing = false) {
  document.body.dataset.poolState = "loading";
  statusDot.dataset.state = "loading";
  currentText.textContent = isRefreshing ? "Refreshing" : "Checking";
  statusTitle.textContent = isRefreshing ? "Refreshing status" : "Checking status";
  statusSummary.textContent = "Reading the official CAB pool status and translating the color into words.";
  residentAction.textContent = "This page will show the status text as soon as it loads.";
  signalLabel.textContent = "Checking";
  statusAlert.hidden = true;
  refreshButton.disabled = true;
}

function updateStatus(rawStatus) {
  const status = { ...FALLBACK_STATUS, ...rawStatus };
  const state = status.state || "unknown";

  document.body.dataset.poolState = state;
  statusDot.dataset.state = state;
  statusTitle.textContent = status.headline;
  currentText.textContent = status.headline;
  statusSummary.textContent = status.summary;
  residentAction.textContent = status.residentAction;
  signalLabel.textContent = status.officialColorLabel || status.detectedLabel || "Unknown";
  lastChecked.textContent = formatCheckedAt(status.checkedAt);
  sourceLink.href = status.sourceUrl || FALLBACK_STATUS.sourceUrl;
  actionLink.href = status.actionUrl || status.sourceUrl || FALLBACK_STATUS.actionUrl;
  actionLink.textContent = actionLabelFor(status);

  if (status.stale || status.error) {
    statusAlert.hidden = false;
    statusAlert.textContent = status.error || "Showing the most recent status this page could load.";
  } else {
    statusAlert.hidden = true;
    statusAlert.textContent = "";
  }

  refreshButton.disabled = false;
}

async function loadPoolStatus(force = false) {
  setLoading(force);

  try {
    const response = await fetch(`/api/pool/status${force ? "?refresh=1" : ""}`);
    const data = await response.json();

    updateStatus(data);
    trackPoolEvent("pool_status_loaded", {
      state: data.state || "unknown",
      ok: response.ok,
    });
  } catch (error) {
    updateStatus({
      ...FALLBACK_STATUS,
      error: "Could not reach the pool status service. The official CAB page is the best backup.",
      checkedAt: new Date().toISOString(),
    });
    trackPoolEvent("pool_status_error");
  }
}

refreshButton.addEventListener("click", () => {
  trackPoolEvent("pool_status_refresh_click");
  loadPoolStatus(true);
});

loadPoolStatus();
