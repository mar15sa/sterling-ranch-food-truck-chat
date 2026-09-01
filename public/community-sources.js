const $ = (selector) => document.querySelector(selector);
const loginPanel = $("#loginPanel");
const dashboard = $("#dashboard");
const sourceList = $("#sourceList");
const emptyState = $("#emptyState");
const listError = $("#listError");
let items = [];

function textElement(tag, value, className = "") {
  const node = document.createElement(tag);
  node.textContent = value || "Not provided";
  if (className) node.className = className;
  return node;
}

function showLogin(message = "") {
  loginPanel.hidden = false; dashboard.hidden = true; $("#loginMessage").textContent = message;
}
function showDashboard() { loginPanel.hidden = true; dashboard.hidden = false; }

function sourceLink(url, label) {
  if (!url) return null;
  const link = textElement("a", label);
  link.href = url; link.target = "_blank"; link.rel = "noreferrer";
  return link;
}

async function decide(item, decision, note, status) {
  status.textContent = "Saving decision…";
  const response = await fetch(`/api/community-sources/review/${encodeURIComponent(item.id)}/decision`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The decision could not be saved.");
  status.textContent = "Decision saved. It will be applied to the next tested release.";
  await loadReviews();
}

function reviewCard(item) {
  const card = document.createElement("article"); card.className = "source-card";
  const header = document.createElement("header");
  const heading = document.createElement("div");
  heading.append(textElement("p", item.facet === "source" ? "PAGE CHANGE" : String(item.facet || "FACT").replaceAll("-", " ").toUpperCase(), "eyebrow"));
  heading.append(textElement("h2", item.topic || "Source change"));
  heading.append(textElement("p", (item.affectedQuestions || []).join(" · "), "intro"));
  const badges = document.createElement("div"); badges.className = "badges";
  badges.append(textElement("span", item.risk === "high" ? "Sensitive" : "Standard", `badge ${item.risk}`));
  if (item.conflict) badges.append(textElement("span", "Conflict", "badge conflict"));
  badges.append(textElement("span", item.status || "pending", "badge"));
  header.append(heading, badges); card.append(header);

  const comparison = document.createElement("div"); comparison.className = "comparison";
  for (const [label, value] of [["Current approved", item.currentValue], ["Proposed", item.proposedValue]]) {
    const section = document.createElement("section"); section.append(textElement("h3", label), textElement("p", value)); comparison.append(section);
  }
  card.append(comparison);
  const evidence = document.createElement("div"); evidence.className = "evidence";
  evidence.append(textElement("h3", "Why this source ranks here"), textElement("p", item.authorityReason));
  evidence.append(textElement("h3", "Expected resident impact"), textElement("p", item.predictedAnswerChange));
  evidence.append(textElement("h3", "Dates and release identity"), textElement("p", [
    `Published: ${item.publishedAt || "not stated"}`,
    `Effective: ${item.effectiveFrom || "not stated"}${item.effectiveTo ? ` through ${item.effectiveTo}` : ""}`,
    `Observed: ${item.lastObservedAt || item.firstObservedAt || "not stated"}`,
    `Fresh through: ${item.staleAfter || "not stated"}`,
    `Candidate: ${item.candidateFingerprint || "not stated"}`,
    `Current release: ${item.releaseFingerprint || "not stated"}`,
  ].join("\n")));
  if ((item.relatedConflicts || []).length) evidence.append(textElement("h3", "Related contradictions"), textElement("p", item.relatedConflicts.join("\n")));
  const links = document.createElement("div"); links.className = "source-links";
  [sourceLink(item.currentSourceUrl, "Open current source"), sourceLink(item.proposedSourceUrl, "Open proposed source")].filter(Boolean).forEach((link) => links.append(link));
  evidence.append(links); card.append(evidence);

  if (item.status === "pending") {
    const form = document.createElement("form"); form.className = "decision-form";
    const note = document.createElement("textarea"); note.placeholder = "Reviewer note (required when approving or marking superseded)"; note.setAttribute("aria-label", "Reviewer note");
    const actions = document.createElement("div"); actions.className = "decision-actions";
    const choices = [["Approve proposed", "approve-proposed", ""], ["Keep current", "keep-current", "secondary"], ["Mark superseded", "mark-current-superseded", "warning"], ["Exclude page", "exclude-page", "secondary"], ["Ask CAB", "escalate", "secondary"]];
    const status = textElement("p", "", "decision-status");
    choices.forEach(([label, value, className]) => { const button = textElement("button", label, className); button.type = "button"; button.addEventListener("click", () => decide(item, value, note.value, status).catch((error) => { status.textContent = error.message; })); actions.append(button); });
    form.append(note, actions, status); card.append(form);
  }
  return card;
}

function render(data = {}) {
  items = data.items || [];
  sourceList.replaceChildren(...items.map(reviewCard)); emptyState.hidden = items.length > 0;
  $("#pendingCount").textContent = String(items.filter((item) => item.status === "pending").length);
  $("#sensitiveCount").textContent = String(items.filter((item) => item.risk === "high").length);
  $("#conflictCount").textContent = String(items.filter((item) => item.conflict).length);
  $("#retirementCount").textContent = String(data.counts?.retirementPendingPageCount || 0);
}

async function loadReviews() {
  listError.textContent = "";
  const params = new URLSearchParams();
  if ($("#riskFilter").value) params.set("risk", $("#riskFilter").value);
  if ($("#statusFilter").value) params.set("status", $("#statusFilter").value);
  if ($("#conflictFilter").checked) params.set("conflict", "true");
  const response = await fetch(`/api/community-sources/review?${params}`); const data = await response.json();
  if (response.status === 401) return showLogin("Your private session expired. Please sign in again.");
  if (!response.ok) throw new Error(data.error || "Reviews could not be loaded.");
  showDashboard(); render(data);
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault(); $("#loginMessage").textContent = "Signing in…";
  try { const response = await fetch("/api/community-questions/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("#ownerPassword").value }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); $("#ownerPassword").value = ""; await loadReviews(); } catch (error) { $("#loginMessage").textContent = error.message || "Could not sign in."; }
});
$("#logoutButton").addEventListener("click", async () => { await fetch("/api/community-questions/logout", { method: "POST" }).catch(() => {}); showLogin("You have been signed out."); });
[$("#riskFilter"), $("#statusFilter"), $("#conflictFilter")].forEach((control) => control.addEventListener("change", () => loadReviews().catch((error) => { listError.textContent = error.message; })));
$("#refreshButton").addEventListener("click", () => loadReviews().catch((error) => { listError.textContent = error.message; }));
loadReviews().catch((error) => { listError.textContent = error.message; });
