const loginPanel = document.querySelector("#loginPanel");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#loginForm");
const ownerPassword = document.querySelector("#ownerPassword");
const loginMessage = document.querySelector("#loginMessage");
const logoutButton = document.querySelector("#logoutButton");
const rangeFilter = document.querySelector("#rangeFilter");
const statusFilter = document.querySelector("#statusFilter");
const qualityFilter = document.querySelector("#qualityFilter");
const ownerReviewFilter = document.querySelector("#ownerReviewFilter");
const searchFilter = document.querySelector("#searchFilter");
const includeTests = document.querySelector("#includeTests");
const refreshButton = document.querySelector("#refreshButton");
const updatedAt = document.querySelector("#updatedAt");
const listError = document.querySelector("#listError");
const questionList = document.querySelector("#questionList");
const emptyState = document.querySelector("#emptyState");
const loadMoreButton = document.querySelector("#loadMoreButton");
const questionCount = document.querySelector("#questionCount");
const answeredCount = document.querySelector("#answeredCount");
const reviewCount = document.querySelector("#reviewCount");
const qualityConcernCount = document.querySelector("#qualityConcernCount");
const needsWorkCount = document.querySelector("#needsWorkCount");
const sourceHealthState = document.querySelector("#sourceHealthState");
const sourceApprovedCount = document.querySelector("#sourceApprovedCount");
const sourceCoverage = document.querySelector("#sourceCoverage");
const sourcePendingCount = document.querySelector("#sourcePendingCount");
const sourceExcludedCount = document.querySelector("#sourceExcludedCount");
const rulesFreshness = document.querySelector("#rulesFreshness");
const rulesLastChecked = document.querySelector("#rulesLastChecked");
const rulesOnlineUpdate = document.querySelector("#rulesOnlineUpdate");
const rulesCodified = document.querySelector("#rulesCodified");
const rulesIndexSize = document.querySelector("#rulesIndexSize");
const rulesWarnings = document.querySelector("#rulesWarnings");
const communityGenerated = document.querySelector("#communityGenerated");
const communityInventory = document.querySelector("#communityInventory");
const communityFreshness = document.querySelector("#communityFreshness");
const communityFailures = document.querySelector("#communityFailures");
const communityReview = document.querySelector("#communityReview");
const communityRefreshError = document.querySelector("#communityRefreshError");
const communityPromotion = document.querySelector("#communityPromotion");
const communityFingerprint = document.querySelector("#communityFingerprint");
const communityCandidateFingerprint = document.querySelector("#communityCandidateFingerprint");
const sourceHealthCaptured = document.querySelector("#sourceHealthCaptured");

let refreshTimer = null;
let searchTimer = null;
let nextCursor = null;
let items = [];
const expandedQuestionIds = new Set();

function showLogin(message = "") {
  loginPanel.hidden = false;
  dashboard.hidden = true;
  loginMessage.textContent = message;
  window.setTimeout(() => ownerPassword.focus(), 0);
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  startPolling();
}

function statusClass(status) {
  return String(status || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function renderSourceHealth(sourceHealth = {}) {
  const rules = sourceHealth.rules || {};
  const community = sourceHealth.community || {};
  const pendingReview = community.pendingReview || null;
  const hasError = !rules.exists || Boolean(community.lastRefreshError) || Number(community.failureCount || 0) > 0;
  const isWorking = Boolean(rules.refreshing || community.refreshing);
  const needsMonitoring = Boolean(rules.isStale || community.stale || !community.inventoryComplete || pendingReview);
  const state = hasError ? "Needs attention" : isWorking ? "Refreshing" : needsMonitoring ? "Monitoring" : "Healthy";
  sourceHealthState.textContent = state;
  sourceHealthState.dataset.state = hasError ? "error" : isWorking ? "working" : needsMonitoring ? "monitoring" : "healthy";

  sourceApprovedCount.textContent = String(community.sourceCount ?? "—");
  sourceCoverage.textContent = community.inventoryAvailable
    ? `${community.pageCount || 0} of ${community.eligiblePageCount || 0}`
    : "Not built";
  sourcePendingCount.textContent = String(community.pendingPageCount ?? "—");
  sourceExcludedCount.textContent = String(community.excludedPageCount ?? "—");

  rulesFreshness.textContent = !rules.exists
    ? "Index unavailable"
    : rules.refreshing
      ? "Refreshing now"
      : rules.isStale
        ? "Due for refresh; approved index remains active"
        : "Current";
  rulesLastChecked.textContent = formatDateTime(rules.lastFetchedAt);
  rulesOnlineUpdate.textContent = formatDateTime(rules.onlineUpdateDate);
  rulesCodified.textContent = rules.codifiedThrough || "Not available";
  rulesIndexSize.textContent = `${rules.sectionCount || 0} sections · ${rules.chunkCount || 0} chunks · ${rules.inlineTopicCount || 0} topics`;
  rulesWarnings.textContent = Array.isArray(rules.warnings) && rules.warnings.length ? rules.warnings.join(" ") : "None";

  communityGenerated.textContent = formatDateTime(community.generatedAt);
  communityInventory.textContent = community.inventoryAvailable
    ? `${community.inventoryComplete ? "Complete" : "In progress"} · ${community.discoveredPageCount || 0} discovered`
    : "Not built";
  communityFreshness.textContent = community.refreshing
    ? "Refreshing now"
    : community.stale
      ? `${community.staleSourceCount || 0} approved sources due for a freshness check`
      : "Current";
  communityFailures.textContent = `${community.failureCount || 0} crawl failures · ${community.liveConnectorCount || 0} live connectors`;
  communityReview.textContent = pendingReview
    ? `${pendingReview.changedSourceCount || 0} changed · ${pendingReview.newSourceCount || 0} new · ${pendingReview.removedSourceCount || 0} removed · checked ${formatDateTime(pendingReview.checkedAt)}`
    : "No source changes awaiting review";
  communityRefreshError.textContent = community.lastRefreshError || "None";
  communityPromotion.textContent = [
    community.promotionMode || "Not available",
    community.lastSuccessfulPromotion ? `last promoted ${formatDateTime(community.lastSuccessfulPromotion)}` : "no recorded promotion",
    community.lastRollback ? `last rollback ${formatDateTime(community.lastRollback)}` : "no recorded rollback",
  ].join(" · ");
  communityFingerprint.textContent = community.activeFingerprint || "Not available";
  communityCandidateFingerprint.textContent = pendingReview?.candidateFingerprint || "No candidate awaiting review";
  sourceHealthCaptured.textContent = formatDateTime(sourceHealth.checkedAt);
}

function answerPreview(answer) {
  const text = String(answer || "");
  return text.length > 130 ? `${text.slice(0, 127)}…` : text;
}

function createQuestionEntry(item) {
  const details = document.createElement("details");
  const cssStatus = statusClass(item.reviewStatus);
  details.className = `question-entry ${cssStatus}${item.needsWork ? " owner-needs-work" : ""}`;
  details.open = expandedQuestionIds.has(item.id);
  details.addEventListener("toggle", () => {
    if (details.open) expandedQuestionIds.add(item.id);
    else expandedQuestionIds.delete(item.id);
  });

  const summary = document.createElement("summary");
  const time = document.createElement("span");
  time.className = "question-time";
  time.textContent = formatTime(item.askedAt);

  const question = document.createElement("span");
  question.className = "question-text";
  question.textContent = item.question;
  const preview = document.createElement("span");
  preview.className = "answer-preview";
  preview.textContent = answerPreview(item.answer);
  question.append(preview);

  const labels = document.createElement("span");
  labels.className = "entry-labels";
  const status = document.createElement("span");
  status.className = `status-label ${cssStatus}`;
  status.textContent = item.reviewStatus || "Answered";
  if (item.isTest) {
    const test = document.createElement("span");
    test.className = "test-label";
    test.textContent = "Test";
    labels.append(test);
  }
  if (item.needsWork) {
    const needsWork = document.createElement("span");
    needsWork.className = "needs-work-label";
    needsWork.textContent = "Needs work";
    labels.append(needsWork);
  }
  const quality = document.createElement("span");
  const qualityClass = statusClass(item.qualityRating || "Not rated");
  quality.className = `quality-label ${qualityClass}`;
  quality.textContent = item.qualityRating === "Not rated"
    ? "Not rated"
    : `${item.qualityRating} ${item.qualityScore || ""}/5`.trim();
  labels.prepend(status, quality);
  summary.append(time, question, labels);

  const body = document.createElement("div");
  body.className = "question-detail";
  const answerHeading = document.createElement("h3");
  answerHeading.textContent = "Answer provided";
  const answer = document.createElement("p");
  answer.textContent = item.answer;
  body.append(answerHeading, answer);

  const meta = document.createElement("div");
  meta.className = "detail-meta";
  if (item.confidenceReason) {
    const reason = document.createElement("span");
    reason.textContent = `Reason: ${item.confidenceReason}`;
    meta.append(reason);
  }
  if (item.answerMode) {
    const mode = document.createElement("span");
    mode.textContent = `Answer mode: ${item.answerMode}`;
    meta.append(mode);
  }
  if (item.residentEffort && item.residentEffort !== "Not rated") {
    const effort = document.createElement("span");
    effort.textContent = `Helpfulness: ${item.residentEffort}`;
    meta.append(effort);
  }
  if (item.qualityIssues) {
    const issues = document.createElement("span");
    issues.textContent = `Quality flags: ${item.qualityIssues.replaceAll("-", " ")}`;
    meta.append(issues);
  }
  if (item.topSourceUrl) {
    const source = document.createElement("a");
    source.href = item.topSourceUrl;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = "Open top source";
    meta.append(source);
  }
  body.append(meta);

  const ownerReviewActions = document.createElement("div");
  ownerReviewActions.className = "owner-review-actions";
  const needsWorkButton = document.createElement("button");
  needsWorkButton.type = "button";
  needsWorkButton.className = `needs-work-button${item.needsWork ? " marked" : ""}`;
  needsWorkButton.setAttribute("aria-pressed", String(Boolean(item.needsWork)));
  needsWorkButton.textContent = item.needsWork ? "Marked as needs work — undo" : "Mark as needs work";
  const ownerReviewNote = document.createElement("p");
  ownerReviewNote.className = "owner-review-note";
  ownerReviewNote.textContent = "Your mark is saved separately from the automatic score.";
  needsWorkButton.addEventListener("click", async () => {
    needsWorkButton.disabled = true;
    listError.textContent = "";
    try {
      const response = await fetch("/api/community-questions/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, needsWork: !item.needsWork }),
      });
      const data = await response.json();
      if (response.status === 401) {
        stopPolling();
        showLogin("Your private session expired. Please sign in again.");
        return;
      }
      if (!response.ok) throw new Error(data.error || "Could not save your review.");
      items = ownerReviewFilter.value === "needs-work" && !data.needsWork
        ? items.filter((current) => current.id !== item.id)
        : items.map((current) => current.id === item.id
          ? { ...current, needsWork: data.needsWork }
          : current);
      renderItems();
    } catch (error) {
      listError.textContent = error.message || "Could not save your review.";
      needsWorkButton.disabled = false;
    }
  });
  ownerReviewActions.append(needsWorkButton, ownerReviewNote);
  body.append(ownerReviewActions);
  details.append(summary, body);
  return details;
}

function renderItems() {
  questionList.replaceChildren(...items.map(createQuestionEntry));
  emptyState.hidden = items.length !== 0;
  questionCount.textContent = String(items.length);
  answeredCount.textContent = String(items.filter((item) => item.reviewStatus === "Answered").length);
  reviewCount.textContent = String(items.filter((item) => item.reviewStatus === "Needs review").length);
  qualityConcernCount.textContent = String(items.filter((item) => ["Weak", "Poor"].includes(item.qualityRating)).length);
  needsWorkCount.textContent = String(items.filter((item) => item.needsWork).length);
  loadMoreButton.hidden = !nextCursor;
}

function queryString(cursor = "") {
  const params = new URLSearchParams({
    range: rangeFilter.value,
    status: statusFilter.value,
    quality: qualityFilter.value,
    ownerReview: ownerReviewFilter.value,
    includeTests: String(includeTests.checked),
  });
  const search = searchFilter.value.trim();
  if (search) params.set("search", search);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

async function loadQuestions({ append = false, quiet = false } = {}) {
  if (!quiet) {
    refreshButton.disabled = true;
    updatedAt.textContent = "Checking for questions…";
  }
  listError.textContent = "";
  try {
    const response = await fetch(`/api/community-questions?${queryString(append ? nextCursor : "")}`);
    const data = await response.json();
    if (response.status === 401) {
      stopPolling();
      const wasViewingDashboard = !dashboard.hidden;
      showLogin(wasViewingDashboard ? "Your private session expired. Please sign in again." : "");
      return;
    }
    if (!response.ok) throw new Error(data.error || "Could not load the question log.");
    items = append ? [...items, ...(data.items || [])] : data.items || [];
    nextCursor = data.nextCursor || null;
    renderItems();
    showDashboard();
    updatedAt.textContent = `Updated ${new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date())}`;
  } catch (error) {
    listError.textContent = error.message || "Could not load the question log.";
    updatedAt.textContent = "Update failed";
  } finally {
    refreshButton.disabled = false;
  }
}

async function loadSourceHealth() {
  try {
    const response = await fetch("/api/community-source-health");
    const data = await response.json();
    if (response.status === 401) return;
    if (!response.ok) throw new Error(data.error || "Could not load source health.");
    renderSourceHealth(data);
  } catch {
    sourceHealthState.textContent = "Unavailable";
    sourceHealthState.dataset.state = "error";
  }
}

function stopPolling() {
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = null;
}

function startPolling() {
  if (refreshTimer) return;
  refreshTimer = window.setInterval(() => {
    if (!document.hidden) {
      loadQuestions({ quiet: true });
      loadSourceHealth();
    }
  }, 5000);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "Signing in…";
  const submit = loginForm.querySelector("button");
  submit.disabled = true;
  try {
    const response = await fetch("/api/community-questions/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: ownerPassword.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not sign in.");
    ownerPassword.value = "";
    showDashboard();
    await Promise.all([loadQuestions(), loadSourceHealth()]);
  } catch (error) {
    loginMessage.textContent = error.message || "Could not sign in.";
  } finally {
    submit.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  stopPolling();
  await fetch("/api/community-questions/logout", { method: "POST" }).catch(() => {});
  items = [];
  expandedQuestionIds.clear();
  renderItems();
  showLogin("You have been signed out.");
});

rangeFilter.addEventListener("change", () => loadQuestions());
statusFilter.addEventListener("change", () => loadQuestions());
qualityFilter.addEventListener("change", () => loadQuestions());
ownerReviewFilter.addEventListener("change", () => loadQuestions());
includeTests.addEventListener("change", () => loadQuestions());
refreshButton.addEventListener("click", () => {
  loadQuestions();
  loadSourceHealth();
});
loadMoreButton.addEventListener("click", () => loadQuestions({ append: true }));
searchFilter.addEventListener("input", () => {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => loadQuestions(), 350);
});

loadQuestions({ quiet: true });
loadSourceHealth();
