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
let queuePollTimer = null;
let queuePollCount = 0;

function stopQueuePoll() {
  if (queuePollTimer !== null && typeof clearTimeout === 'function') clearTimeout(queuePollTimer);
  queuePollTimer = null;
}

function textElement(tag, value, className = "") {
  const node = document.createElement(tag);
  node.textContent = value || "Not provided";
  if (className) node.className = className;
  return node;
}

function showLogin(message = "") {
  stopQueuePoll();
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

function appendReviewDetails(parent, source) {
  if (source.reviewedAt) parent.append(textElement('span', `Content reviewed ${readableDate(source.reviewedAt)}`, 'document-reason'));
  const approved = source.approvedClaims || [];
  const withheld = source.withheldClaims || [];
  const scopes = source.approvedScopes || [];
  if (!approved.length && !withheld.length && !scopes.length) return;
  const details = document.createElement('details');
  details.append(textElement('summary', `${approved.length} approved details · ${withheld.length} limits or exclusions`));
  for (const [label, values] of [['Approved use', scopes], ['Available to answers', approved], ['Not approved from this source', withheld]]) {
    if (!values.length) continue;
    details.append(textElement('strong', label));
    const list = document.createElement('ul');
    for (const value of values) list.append(textElement('li', typeof value === 'string' ? value : value.reason || value.claim));
    details.append(list);
  }
  parent.append(details);
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
  const remainingCount = category.heldForReview || 0;
  const state = textElement("span", category.complete ? "Handled" : `${remainingCount} still need review`, "category-state");
  heading.append(title, state);
  const bar = document.createElement("div");
  bar.className = "coverage-bar";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", `${category.handled} of ${category.total} inventoried items reviewed`);
  for (const [name, count] of [["active", category.activeEvidence], ["action", (category.actionOnly || 0) + (category.liveFeed || 0)], ["excluded", category.excluded], ["held", category.heldForReview]]) {
    if (!count) continue;
    const segment = document.createElement("span");
    segment.className = name;
    segment.style.flexGrow = String(count);
    bar.append(segment);
  }
  const counts = textElement("p", `${category.total} inventoried items (${category.documents?.length || 0} documents + ${category.pages?.length || 0} pages), including links and exclusions · ${category.auditedUrls} URLs assessed`, "category-counts");
  const hint = textElement("span", "View every primary document and page", "category-hint");
  header.append(heading, bar, counts, hint);
  const list = document.createElement("ul");
  list.className = "category-documents";
  const statusLabels = { active: "Answer evidence", action: "Safe link", held: "Held", excluded: "Excluded", unclassified: "Unclassified" };
  for (const sourceDocument of category.documents || []) {
    const item = document.createElement("li");
    item.dataset.state = sourceDocument.status;
    const copy = document.createElement("div");
    copy.append(textElement("strong", sourceDocument.title), textElement("span", sourceDocument.reason, "document-reason"));
    if (sourceDocument.nextStep) copy.append(textElement("span", `Next: ${sourceDocument.nextStep}`, "document-next-step"));
    appendReviewDetails(copy, sourceDocument);
    const controls = document.createElement("div");
    controls.className = "document-controls";
    controls.append(textElement("span", statusLabels[sourceDocument.status] || sourceDocument.status, "document-state"));
    const link = sourceLink(sourceDocument.sourceUrl, "Open official document");
    if (link) controls.append(link);
    item.append(copy, controls);
    list.append(item);
  }
  const pageSection = document.createElement("section");
  pageSection.className = "category-pages-section";
  pageSection.append(textElement("h4", "CAB website pages"), textElement("p", `${category.pageCounts?.answerEvidence || 0} provide approved answer evidence · ${category.pageCounts?.safeLink || 0} are link-only · ${category.pageCounts?.liveFeed || 0} use a live feed · ${category.pageCounts?.reviewRequired || 0} need claim review · ${category.pageCounts?.unavailableRecheck || 0} need retry · ${category.pageCounts?.excluded || 0} are intentionally excluded`, "category-page-counts"));
  const pageList = document.createElement("ul");
  pageList.className = "category-pages";
  const pageStatusLabels = { active: "Approved claims", action: "Safe link", live: "Live feed", held: "Needs review", excluded: "Excluded" };
  for (const page of category.pages || []) {
    const item = document.createElement("li");
    item.dataset.state = page.status;
    const copy = document.createElement("div");
    copy.append(textElement("strong", page.title), textElement("span", page.reason, "document-reason"));
    const controls = document.createElement("div");
    controls.className = "document-controls";
    controls.append(textElement("span", pageStatusLabels[page.status] || page.status, "document-state"));
    appendReviewDetails(copy, page);
    const link = sourceLink(page.sourceUrl, "Open official page");
    if (link) controls.append(link);
    item.append(copy, controls);
    pageList.append(item);
  }
  pageSection.append(pageList);
  const routeNote = textElement("p", `${category.duplicateUrls || 0} duplicate URLs and ${category.technicalRoutes || 0} technical routes were also assessed and consolidated here.`, "category-route-note");
  card.append(header, textElement("h4", "Official documents", "category-subheading"), list, pageSection, routeNote);
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
  $("#scopeSummary").textContent = `${totals.answerEvidence || 0} sources provide approved answer evidence. ${totals.primarySources || 0} relevant items were inventoried, including ${totals.safeLink || 0} link-only items and ${totals.excluded || 0} exclusions. ${totals.reviewRequired || 0} need claim review and ${totals.unavailableRecheck || 0} need a retry. The full inventory assessed ${totals.audited || 0} discovered CAB URLs.`;
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
  const sourceRemainingWork = readiness.sourceRemainingWork || [];
  $("#pageWorkCount").textContent = String(sourceRemainingWork.length);
  $("#pageWorkSummary").textContent = sourceRemainingWork.length
    ? `${sourceRemainingWork.length} inventoried items still need review or retrieval. Open the category cards above to see each item and the reason.`
    : "Every useful source in the four categories has completed claim review.";

  const evidence = readiness.evidence || {};
  setCheck("#freshnessCheck", evidence.current ? "pass" : "attention", evidence.current ? "Current" : "Needs recheck",
    evidence.current
      ? `All currently approved evidence passed its current-source checks. The broader index contains ${evidence.sourceCount || 0} records; only approved, eligible details can support answers.`
      : `${evidence.expiredSources || 0} approved sources and ${evidence.expiredFacts || 0} approved facts need to be checked against their official source.`);
  const coverageGaps = (totals.reviewRequired || 0) + (totals.unavailableRecheck || 0);
  setCheck("#coverageCheck", coverageGaps ? "attention" : "pass", coverageGaps ? "Gaps remain" : "Complete",
    `${totals.answerEvidence || 0} sources can support approved claims, ${totals.safeLink || 0} are safe links, and ${totals.liveFeed || 0} uses a live feed. ${totals.reviewRequired || 0} still need claim review; ${totals.unavailableRecheck || 0} need retrieval retry.`);
  const conflicts = readiness.safeguards?.withheldConflictCount || 0;
  const approvedConflicts = readiness.safeguards?.approvedConflictGroupCount;
  const candidateConflicts = readiness.safeguards?.candidateConflictGroupCount;
  setCheck("#safetyCheck", conflicts ? "protected" : "pass", conflicts ? "Protected" : "Clear",
    Number.isFinite(approvedConflicts) && Number.isFinite(candidateConflicts)
      ? `${approvedConflicts} unresolved conflict groups involve approved evidence. ${candidateConflicts} additional groups are unapproved extraction diagnostics, not approved answers; their details remain withheld.`
      : conflicts ? `${conflicts} extracted conflict groups remain withheld; this total is not a count of conflicting approved answers.` : "No unresolved conflicting facts are recorded.");

  const inventory = readiness.inventory || {};
  setCheck("#websiteCheck", inventory.reconciled ? "pass" : "attention", inventory.reconciled ? "Fully assessed" : "Inventory gap",
    `${inventory.audited || 0} of ${inventory.discovered || 0} discovered CAB URLs have a recorded scope decision. ${inventory.pending || 0} remain unclassified.`);
  $("#inventoryExplanation").textContent = `${inventory.note || ""} Audit completed ${readableDate(readiness.decidedAt)}. ${inventory.failureCount || 0} access error is explicitly recorded; it is outside the four selected categories.`;
  $("#discoveredCount").textContent = String(inventory.discovered || 0);
  $("#eligibleCount").textContent = String(inventory.eligible || 0);
  $("#indexedCount").textContent = String(inventory.audited || 0);
  $("#inventoryExcludedCount").textContent = String(inventory.technicalExclusions || 0);
  $("#inventoryBacklogCount").textContent = String(inventory.pending || 0);
}

function renderQueueConnection(data) {
  const storage = data.queue?.storage;
  $("#reviewAvailability").textContent = data.reviewError || (storage
    ? !storage.loaded ? 'Connection configured. Saved reviews are loading in the background; the content audit above is available now.'
      : `Saved reviews loaded ${readableDate(storage.checkedAt)}.${storage.loading ? ' Checking for updates…' : storage.stale ? ' This is an older snapshot; refresh before making decisions.' : ' This snapshot is current.'}`
    : 'The private review queue is connected.');
  const observation = data.queue?.observation;
  $("#reviewObservation").textContent = observation
    ? `${observation.initialized ? `Official sources last checked ${readableDate(observation.checkedAt)}.` : 'Official-source checks have not completed since this restart.'}${observation.refreshing ? ' A source check is running.' : ''}${observation.error ? ` Latest check failed: ${observation.error}` : ''}` : '';
  const sync = data.queue?.sync;
  $("#reviewSync").textContent = sync
    ? `${sync.status === 'succeeded' ? `Latest sync succeeded ${readableDate(sync.lastSuccessAt)}. ${sync.createdCount || 0} new review entries saved.`
      : sync.status === 'syncing' ? `Saving source changes to the private queue (started ${readableDate(sync.lastAttemptAt)}).`
        : sync.status === 'failed' ? `Latest sync failed: ${sync.lastError || 'The private database could not be updated.'}`
          : sync.status === 'unconfigured' ? 'Source-change sync is not configured.' : 'Source-change sync has not run since this restart.'}${sync.status !== 'succeeded' && sync.lastSuccessAt ? ` Last successful sync: ${readableDate(sync.lastSuccessAt)}.` : ''} Saving a review entry does not approve or publish it.` : '';
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
  if (item.queueBucket) badges.append(textElement('span', ({ current: 'Current change', comparison: 'Needs comparison', discovery: 'Needs scope review', history: 'History', outside: 'Outside scope' })[item.queueBucket] || item.queueBucket, 'badge'));
  header.append(heading, badges); card.append(header);

  card.append(textElement('p', 'This is the saved comparison from when the review was created. Its decision status does not confirm production deployment.', 'intro'));
  if (item.queueReason) card.append(textElement('p', item.queueReason, 'queue-note'));
  if (item.duplicateCount > 1) card.append(textElement('p', `${item.duplicateCount} identical saved copies are grouped here. The originals are retained.`, 'queue-note'));

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

  if ((item.status === "pending" || item.status === 'escalated') && item.canDecide === true) {
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

function render(data = {}, polling = false) {
  if (!polling) renderReadiness(data);
  renderQueueConnection(data);
  items = data.items || [];
  sourceList.replaceChildren(...items.map(reviewCard)); emptyState.hidden = items.length > 0;
  $("#emptyState p").textContent = items.length ? "" : "No saved entries match this view and its filters. Other views retain history, outside-scope material, and sources still needing comparison.";
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
  const queue = data.queue;
  const storage = queue?.storage;
  $("#queueBuckets").textContent = queue && storage?.loaded
    ? `${queue.current || 0} current changes · ${queue.comparison || 0} need comparison · ${queue.discovery || 0} new sources to sort · ${queue.history || 0} history · ${queue.outside || 0} outside scope${storage.stale ? ' · Older snapshot' : ''}`
    : queue ? `Review counts are not known yet.${data.reviewError ? ' The saved inventory could not be loaded.' : ' The saved inventory is loading.'}` : '';
  if (data.reviewError || (storage && (!storage.loaded || storage.stale))) {
    for (const selector of ['#pendingCount', '#sensitiveCount', '#conflictCount']) $(selector).textContent = 'Unknown';
    $("#emptyState h2").textContent = data.reviewError ? 'Source-change queue unavailable' : storage.loaded ? 'Showing an older review snapshot' : 'Loading saved reviews';
    $("#emptyState p").textContent = `${data.reviewError || 'Current review counts are not available yet.'} The completed content audit above is available. This does not confirm that no changes need review.`;
    if (!storage?.loaded) $("#pageStatus").textContent = data.reviewError ? 'Reviews unavailable. Use Refresh to retry.' : 'Loading saved reviews in the background…';
  } else {
    $("#emptyState h2").textContent = 'No entries in this view';
  }
}

async function loadReviews(page = currentPage, refresh = false, polling = false) {
  stopQueuePoll();
  if (!polling) queuePollCount = 0;
  const editingNote = () => typeof document.querySelectorAll === 'function'
    && [...document.querySelectorAll('.decision-form textarea')].some(note => note.value || note === document.activeElement);
  if (polling && editingNote()) {
    listError.textContent = 'Automatic updates paused while you edit a note. Use Refresh when finished.';
    return;
  }
  const version = ++loadVersion;
  listError.textContent = "";
  $("#pageStatus").textContent = "Loading reviews...";
  $("#previousPage").disabled = true;
  $("#nextPage").disabled = true;
  sourceList.setAttribute("aria-busy", "true");
  if (!polling) { sourceList.replaceChildren(); emptyState.hidden = true; }
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set('queue', $('#queueFilter').value || 'attention');
  if (refresh) params.set('refresh', 'true');
  if ($("#riskFilter").value) params.set("risk", $("#riskFilter").value);
  if ($("#statusFilter").value) params.set("status", $("#statusFilter").value);
  if ($("#conflictFilter").checked) params.set("conflict", "true");
  try {
    const response = await fetch(`/api/community-sources/review?${params}`);
    const data = await response.json();
    if (version !== loadVersion) return;
    if (response.status === 401) return showLogin("Your private session expired. Please sign in again.");
    if (!response.ok) throw new Error(data.error || "Reviews could not be loaded.");
    if (polling && editingNote()) {
      renderQueueConnection(data);
      listError.textContent = 'Automatic updates paused while you edit a note. Use Refresh when finished.';
      return;
    }
    showDashboard(); render(data, polling);
    if ((data.queue?.storage?.loading || data.queue?.observation?.refreshing || data.queue?.sync?.status === 'syncing') && queuePollCount < 90 && typeof setTimeout === 'function') {
      queuePollCount++;
      queuePollTimer = setTimeout(() => { queuePollTimer = null; loadReviews(currentPage, false, true).catch(error => { listError.textContent = error.message; }); }, 2000);
    }
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
[$("#queueFilter"), $("#riskFilter"), $("#statusFilter"), $("#conflictFilter")].forEach((control) => control.addEventListener("change", () => { currentPage = 1; return loadReviews(1).catch((error) => { listError.textContent = error.message; }); }));
$("#refreshButton").addEventListener("click", () => loadReviews(currentPage, true).catch((error) => { listError.textContent = error.message; }));
loadReviews().catch((error) => { listError.textContent = error.message; });

$("#previousPage").addEventListener("click", () => loadReviews(currentPage - 1).catch(error => { listError.textContent = error.message; }));
$("#nextPage").addEventListener("click", () => loadReviews(currentPage + 1).catch(error => { listError.textContent = error.message; }));
