const loginPanel = document.querySelector("#loginPanel");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#loginForm");
const ownerPassword = document.querySelector("#ownerPassword");
const loginMessage = document.querySelector("#loginMessage");
const logoutButton = document.querySelector("#logoutButton");
const rangeFilter = document.querySelector("#rangeFilter");
const statusFilter = document.querySelector("#statusFilter");
const qualityFilter = document.querySelector("#qualityFilter");
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

function answerPreview(answer) {
  const text = String(answer || "");
  return text.length > 130 ? `${text.slice(0, 127)}…` : text;
}

function createQuestionEntry(item) {
  const details = document.createElement("details");
  const cssStatus = statusClass(item.reviewStatus);
  details.className = `question-entry ${cssStatus}`;
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
  loadMoreButton.hidden = !nextCursor;
}

function queryString(cursor = "") {
  const params = new URLSearchParams({
    range: rangeFilter.value,
    status: statusFilter.value,
    quality: qualityFilter.value,
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

function stopPolling() {
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = null;
}

function startPolling() {
  if (refreshTimer) return;
  refreshTimer = window.setInterval(() => {
    if (!document.hidden) loadQuestions({ quiet: true });
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
    await loadQuestions();
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
includeTests.addEventListener("change", () => loadQuestions());
refreshButton.addEventListener("click", () => loadQuestions());
loadMoreButton.addEventListener("click", () => loadQuestions({ append: true }));
searchFilter.addEventListener("input", () => {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => loadQuestions(), 350);
});

loadQuestions({ quiet: true });
