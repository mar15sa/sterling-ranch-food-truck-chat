const $ = (selector) => document.querySelector(selector);
const loginPanel = $("#loginPanel");
const dashboard = $("#dashboard");
const sourceList = $("#sourceList");
const emptyState = $("#emptyState");
const listError = $("#listError");
let items = [];
let currentPage = 1;
let pageCount = 1;
let loadVersion = 0;

function textElement(tag, value, className = "") {
  const node = document.createElement(tag);
  node.textContent = value || "Not provided";
  if (className) node.className = className;
  return node;
}

function showLogin(message = "") {
  loadVersion++;
  sourceList.replaceChildren();
  items = [];
  loginPanel.hidden = false; dashboard.hidden = true; $("#loginMessage").textContent = message;
}
function showDashboard() { loginPanel.hidden = true; dashboard.hidden = false; }

function sourceLink(url, label) {
  if (!url) return null;
  try { if (!['https:', 'http:'].includes(new URL(url).protocol)) return null; } catch { return null; }
  const link = textElement("a", label);
  link.href = url; link.target = "_blank"; link.rel = "noreferrer";
  return link;
}

function readableDate(value) {
  if (!value) return "Time not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time not available";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function setCheck(selector, state, label, detail) {
  const card = $(selector);
  card.dataset.state = state;
  card.querySelector(".check-state").textContent = label;
  card.querySelector("p").textContent = detail;
}

function categoryCard(category) {
  const card = document.createElement("details");
  card.className = "category-card";
  card.dataset.state = category.complete ? "complete" : "attention";
  const header = document.createElement("summary");
  header.className = "category-summary";
  const heading = document.createElement("div");
  heading.className = "category-heading";
  const title = textElement("h3", category.title);
  const state = textElement("span", category.complete ? "Handled" : `${category.heldForReview} still held`, "category-state");
  heading.append(title, state);
  const bar = document.createElement("div");
  bar.className = "coverage-bar";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", `${category.handled} of ${category.total} documents handled`);
  for (const [name, count] of [["active", category.activeEvidence], ["action", category.actionOnly], ["excluded", category.excluded], ["held", category.heldForReview]]) {
    if (!count) continue;
    const segment = document.createElement("span");
    segment.className = name;
    segment.style.flexGrow = String(count);
    bar.append(segment);
  }
  const counts = textElement("p", `${category.activeEvidence} available · ${category.actionOnly} link-only · ${category.excluded} excluded · ${category.heldForReview} held`, "category-counts");
  const hint = textElement("span", "View documents", "category-hint");
  header.append(heading, bar, counts, hint);
  const list = document.createElement("ul");
  list.className = "category-documents";
  const statusLabels = { active: "Answer evidence", action: "Safe link", held: "Held", excluded: "Excluded", unclassified: "Unclassified" };
  for (const sourceDocument of category.documents || []) {
    const item = document.createElement("li");
    item.dataset.state = sourceDocument.status;
    const copy = document.createElement("div");
    copy.append(textElement("strong", sourceDocument.title), textElement("span", `Document ${sourceDocument.documentId} · ${sourceDocument.reason}`, "document-reason"));
    if (sourceDocument.nextStep) copy.append(textElement("span", `Next: ${sourceDocument.nextStep}`, "document-next-step"));
    const controls = document.createElement("div");
    controls.className = "document-controls";
    controls.append(textElement("span", statusLabels[sourceDocument.status] || sourceDocument.status, "document-state"));
    const link = sourceLink(sourceDocument.sourceUrl, "Open official document");
    if (link) controls.append(link);
    item.append(copy, controls);
    list.append(item);
  }
  card.append(header, list);
  return card;
}

function heldWorkCard(item) {
  const card = document.createElement("article");
  card.className = "held-work-card";
  const header = document.createElement("div");
  header.append(textElement("span", "WITHHELD", "document-state"), textElement("span", `Document ${item.documentId}`, "held-document-id"));
  card.append(header, textElement("h3", item.title), textElement("p", item.nextStep));
  const link = sourceLink(item.sourceUrl, "Open official document");
  if (link) card.append(link);
  return card;
}

function renderReadiness(data = {}) {
  const readiness = data.readiness;
  if (!readiness) return;
  const hero = $("#readinessHero");
  hero.dataset.state = readiness.state;
  $("#readinessTitle").textContent = readiness.headline;
  $("#readinessExplanation").textContent = readiness.explanation;
  $("#readinessCheckedAt").textContent = `Dashboard checked ${readableDate(readiness.checkedAt)} · Approved evidence rechecked ${readableDate(readiness.evidence?.lastApprovedEvidenceCheckAt)}`;
  const reasons = readiness.reasons || [];
  $("#readinessReasons").replaceChildren(...reasons.map(reason => textElement("li", reason)));

  const totals = readiness.totals || {};
  $("#scopeSummary").textContent = `${totals.classified || 0} of ${totals.total || 0} documents classified. ${totals.handled || 0} are fully handled; ${totals.heldForReview || 0} are still safely withheld.`;
  $("#categoryList").replaceChildren(...(readiness.categories || []).map(categoryCard));
  const remainingWork = readiness.remainingWork || [];
  $("#remainingWork").hidden = remainingWork.length === 0;
  $("#remainingWorkList").replaceChildren(...remainingWork.map(item => {
    const row = document.createElement("li");
    row.append(textElement("strong", item.title), document.createTextNode(` — ${item.nextStep}`));
    return row;
  }));
  $("#heldWorkCount").textContent = String(remainingWork.length);
  $("#heldWorkList").replaceChildren(...remainingWork.map(heldWorkCard));
  $("#heldWorkEmpty").hidden = remainingWork.length > 0;

  const evidence = readiness.evidence || {};
  setCheck("#freshnessCheck", evidence.current ? "pass" : "attention", evidence.current ? "Current" : "Needs recheck",
    evidence.current
      ? `All currently approved evidence passed its current-source checks. This does not mean every CAB website page has been indexed. ${evidence.sourceCount || 0} source records are available.`
      : `${evidence.expiredSources || 0} approved sources and ${evidence.expiredFacts || 0} approved facts need to be checked against their official source.`);
  setCheck("#coverageCheck", totals.heldForReview ? "attention" : "pass", totals.heldForReview ? "Gaps remain" : "Complete",
    `${totals.activeEvidence || 0} documents contribute approved evidence, ${totals.actionOnly || 0} provide safe action links, and ${totals.excluded || 0} were intentionally kept out. ${totals.heldForReview || 0} necessary documents remain held.`);
  const conflicts = readiness.safeguards?.withheldConflictCount || 0;
  setCheck("#safetyCheck", conflicts ? "protected" : "pass", conflicts ? "Protected" : "Clear",
    conflicts ? `Across the currently indexed source bundle, ${conflicts} conflicting facts are blocked from resident answers. They are shown here as a safety guardrail, not as part of your 27-document count.` : "No unresolved conflicting facts are recorded.");

  const inventory = readiness.inventory || {};
  setCheck("#websiteCheck", inventory.complete ? "pass" : "attention", inventory.complete ? "Complete" : "Still building",
    inventory.complete
      ? `All ${inventory.eligible || 0} eligible CAB website pages in this inventory are indexed.`
      : `${inventory.indexed || 0} of ${inventory.eligible || 0} eligible CAB website pages are indexed; ${inventory.backlog || 0} remain in the site-wide backlog. CAB pages are sources, but the full website inventory is not complete.`);
  $("#inventoryExplanation").textContent = `${inventory.note || ""} Inventory snapshot: ${readableDate(readiness.evidence?.lastSnapshotAt)}.`;
  $("#discoveredCount").textContent = String(inventory.discovered || 0);
  $("#eligibleCount").textContent = String(inventory.eligible || 0);
  $("#indexedCount").textContent = String(inventory.indexed || 0);
  $("#inventoryExcludedCount").textContent = String(inventory.excluded || 0);
  $("#inventoryBacklogCount").textContent = String(inventory.backlog || 0);
  $("#reviewAvailability").textContent = data.reviewError || "The private review queue is connected.";
}

async function decide(item, decision, note, status) {
  status.textContent = "Saving decision…";
  const response = await fetch(`/api/community-sources/review/${encodeURIComponent(item.id)}/decision`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note }),
  });
  const data = await response.json();
  if (response.status === 401) {
    showLogin("Your private session expired. Please sign in again.");
    throw new Error("Your decision was not saved. Sign in and try again.");
  }
  if (!response.ok) throw new Error(data.error || "The decision could not be saved.");
  status.textContent = "Decision saved for release review. This does not publish a change.";
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

  card.append(textElement('p', 'This is the saved comparison from when the review was created. Its decision status does not confirm production deployment.', 'intro'));

  const comparison = document.createElement("div"); comparison.className = "comparison";
  const previousValue = item.currentValue === 'Not currently approved'
    ? 'No approved value was recorded before this review.' : item.currentValue;
  for (const [label, value] of [["Before this review", previousValue], ["Proposed change", item.proposedValue]]) {
    const section = document.createElement("section"); section.append(textElement("h3", label), textElement("p", value)); comparison.append(section);
  }
  card.append(comparison);
  const evidence = document.createElement("div"); evidence.className = "evidence";
  evidence.append(textElement("h3", "Why this source ranks here"), textElement("p", item.authorityReason));
  evidence.append(textElement("h3", "Expected resident impact"), textElement("p", item.predictedAnswerChange));
  if (item.supportingText) evidence.append(textElement('h3', 'Official supporting excerpt'), textElement('p', item.supportingText));
  evidence.append(textElement("h3", "Dates and release identity"), textElement("p", [
    `Published: ${item.publishedAt || "not stated"}`,
    `Effective: ${item.effectiveFrom || "not stated"}${item.effectiveTo ? ` through ${item.effectiveTo}` : ""}`,
    `Observed: ${item.lastObservedAt || item.firstObservedAt || "not stated"}`,
    `Fresh through: ${item.staleAfter || "not stated"}`,
    `Candidate: ${item.candidateFingerprint || "not stated"}`,
    `Release at review creation: ${item.releaseFingerprint || "not stated"}`,
  ].join("\n")));
  if ((item.relatedConflicts || []).length) {
    evidence.append(textElement('h3', 'Related contradictions'));
    const conflicts = document.createElement('ul');
    for (const conflict of item.relatedConflicts) {
      const row = document.createElement('li');
      if (typeof conflict === 'string') row.append(textElement('p', conflict));
      else {
        row.append(textElement('p', conflict.value));
        const link = sourceLink(conflict.sourceUrl, conflict.sourceTitle || 'Open conflicting source');
        if (link) row.append(link);
      }
      conflicts.append(row);
    }
    evidence.append(conflicts);
  }
  const links = document.createElement("div"); links.className = "source-links";
  [sourceLink(item.currentSourceUrl, "Open current source"), sourceLink(item.proposedSourceUrl, "Open proposed source")].filter(Boolean).forEach((link) => links.append(link));
  evidence.append(links); card.append(evidence);

  if (item.status === "pending") {
    const form = document.createElement("form"); form.className = "decision-form";
    const note = document.createElement("textarea"); note.placeholder = "Reviewer note (required when approving or marking superseded)"; note.setAttribute("aria-label", "Reviewer note");
    const actions = document.createElement("div"); actions.className = "decision-actions";
    const choices = [["Approve proposed", "approve-proposed", ""], ["Keep current", "keep-current", "secondary"], ["Mark superseded", "mark-current-superseded", "warning"], ["Exclude page", "exclude-page", "secondary"], ["Ask CAB", "escalate", "secondary"]];
    const status = textElement("p", "", "decision-status");
    status.textContent = "";
    let saving = false;
    const buttons = [];
    choices.forEach(([label, value, className]) => {
      const button = textElement("button", label, className); button.type = "button";
      buttons.push(button);
      button.addEventListener("click", async () => {
        if (saving) return;
        saving = true;
        buttons.forEach(control => { control.disabled = true; });
        try { await decide(item, value, note.value, status); }
        catch (error) { status.textContent = error.message; }
        finally { saving = false; buttons.forEach(control => { control.disabled = false; }); }
      });
      actions.append(button);
    });
    form.append(note, actions, status); card.append(form);
  }
  return card;
}

function render(data = {}) {
  renderReadiness(data);
  items = data.items || [];
  sourceList.replaceChildren(...items.map(reviewCard)); emptyState.hidden = items.length > 0;
  $("#emptyState p").textContent = items.length ? "" : "No newly detected source changes match this filter. The scoped documents still withheld are listed above.";
  currentPage = data.pagination?.page || 1;
  pageCount = data.pagination?.pageCount || 1;
  const total = data.pagination?.total ?? items.length;
  const start = total ? (currentPage - 1) * (data.pagination?.pageSize || 25) + 1 : 0;
  $("#pageStatus").textContent = `Showing ${start}-${total ? start + items.length - 1 : 0} of ${total} matching reviews | Page ${currentPage} of ${pageCount}`;
  $("#previousPage").disabled = currentPage <= 1;
  $("#nextPage").disabled = currentPage >= pageCount;
  $("#pendingCount").textContent = String(data.summary?.pending ?? items.filter(item => item.status === "pending").length);
  $("#sensitiveCount").textContent = String(data.summary?.sensitive ?? items.filter(item => item.risk === "high").length);
  $("#conflictCount").textContent = String(data.summary?.conflicts ?? items.filter(item => item.conflict).length);
  $("#retirementCount").textContent = String(data.counts?.retirementPendingPageCount || 0);
}

async function loadReviews(page = currentPage) {
  const version = ++loadVersion;
  listError.textContent = "";
  $("#pageStatus").textContent = "Loading reviews...";
  $("#previousPage").disabled = true;
  $("#nextPage").disabled = true;
  sourceList.setAttribute("aria-busy", "true");
  sourceList.replaceChildren();
  emptyState.hidden = true;
  const params = new URLSearchParams();
  params.set("page", String(page));
  if ($("#riskFilter").value) params.set("risk", $("#riskFilter").value);
  if ($("#statusFilter").value) params.set("status", $("#statusFilter").value);
  if ($("#conflictFilter").checked) params.set("conflict", "true");
  try {
    const response = await fetch(`/api/community-sources/review?${params}`);
    const data = await response.json();
    if (version !== loadVersion) return;
    if (response.status === 401) return showLogin("Your private session expired. Please sign in again.");
    if (!response.ok) throw new Error(data.error || "Reviews could not be loaded.");
    showDashboard(); render(data);
  } catch (error) {
    if (version !== loadVersion) return;
    $("#pageStatus").textContent = "Reviews could not be loaded. Use Refresh to try again.";
    throw error;
  } finally {
    if (version === loadVersion) sourceList.setAttribute("aria-busy", "false");
  }
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault(); $("#loginMessage").textContent = "Signing in…";
  try { const response = await fetch("/api/community-questions/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("#ownerPassword").value }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); $("#ownerPassword").value = ""; await loadReviews(1); } catch (error) { $("#loginMessage").textContent = error.message || "Could not sign in."; }
});
$("#logoutButton").addEventListener("click", async () => { showLogin("You have been signed out."); await fetch("/api/community-questions/logout", { method: "POST" }).catch(() => {}); });
[$("#riskFilter"), $("#statusFilter"), $("#conflictFilter")].forEach((control) => control.addEventListener("change", () => { currentPage = 1; return loadReviews(1).catch((error) => { listError.textContent = error.message; }); }));
$("#refreshButton").addEventListener("click", () => loadReviews().catch((error) => { listError.textContent = error.message; }));
loadReviews().catch((error) => { listError.textContent = error.message; });

$("#previousPage").addEventListener("click", () => loadReviews(currentPage - 1).catch(error => { listError.textContent = error.message; }));
$("#nextPage").addEventListener("click", () => loadReviews(currentPage + 1).catch(error => { listError.textContent = error.message; }));
