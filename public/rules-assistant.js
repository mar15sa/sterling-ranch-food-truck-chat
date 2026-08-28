const rulesScroll = document.querySelector("#rulesScroll");
const rulesMessages = document.querySelector("#rulesMessages");
const rulesForm = document.querySelector("#rulesForm");
const rulesQuestion = document.querySelector("#rulesQuestion");
const rulesSend = document.querySelector("#rulesSend");
const rulesTemplate = document.querySelector("#rulesAnswerTemplate");
const rulesStarters = document.querySelector("#rulesStarters");
const rulesDock = document.querySelector("#rulesDock");
const startersToggle = document.querySelector("#startersToggle");
const rulesStartOver = document.querySelector("#rulesStartOver");
const statusDot = document.querySelector("#statusDot");
const statusHeadline = document.querySelector("#statusHeadline");
const statusToggle = document.querySelector("#statusToggle");
const statusDetail = document.querySelector("#statusDetail");
const statusSource = document.querySelector("#statusSource");
const statusChecked = document.querySelector("#statusChecked");
const statusOnlineDate = document.querySelector("#statusOnlineDate");
const statusCodified = document.querySelector("#statusCodified");
const statusNote = document.querySelector("#statusNote");

const PUBLIC_SOURCE_NAME = "Official CAB sources and Rules and Regulations";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let conversationStarted = false;
let statusPollTimer = null;
let statusPollAttempts = 0;
const CONTEXT_STORAGE_KEY = "sterling-community-conversation-v1";
let conversationContext = loadConversationContext();

function loadConversationContext() {
  try {
    const value = JSON.parse(sessionStorage.getItem(CONTEXT_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.slice(-3) : [];
  } catch {
    return [];
  }
}

function saveConversationContext() {
  try { sessionStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(conversationContext.slice(-3))); } catch { /* session storage may be blocked */ }
}

function rememberExchange(question, data) {
  conversationContext.push({
    question: String(question).slice(0, 500),
    resolvedQuestion: String(data.resolvedQuestion || question).slice(0, 500),
    answer: String(data.directAnswer || data.answer || "").slice(0, 1200),
  });
  conversationContext = conversationContext.slice(-3);
  saveConversationContext();
}

function cleanQuestionForAnalytics(question) {
  return String(question || "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{5,}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function trackEvent(name, params = {}) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, {
    app_area: "rules_assistant",
    ...params,
  });
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDateShort(value) {
  if (!value) return "";
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

/* ---------- Scrolling ---------- */
function conversationScrolls() {
  return rulesScroll.scrollHeight > rulesScroll.clientHeight + 2;
}

function scrollToBottom() {
  const behavior = reduceMotion ? "auto" : "smooth";
  if (conversationScrolls()) {
    rulesScroll.scrollTo({ top: rulesScroll.scrollHeight, behavior });
  } else {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
  }
}

function scrollToMessageStart(message) {
  const behavior = reduceMotion ? "auto" : "smooth";
  if (conversationScrolls()) {
    const top =
      message.getBoundingClientRect().top -
      rulesScroll.getBoundingClientRect().top +
      rulesScroll.scrollTop -
      16;
    rulesScroll.scrollTo({ top: Math.max(top, 0), behavior });
  } else {
    const header = document.querySelector(".rules-header");
    const offset = (header ? header.offsetHeight : 0) + 12;
    const top = message.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(top, 0), behavior });
  }
}

/* ---------- Messages ---------- */
function addUserMessage(text) {
  const message = document.createElement("div");
  message.className = "rules-message rules-message-user";
  message.textContent = text;
  rulesMessages.append(message);
  scrollToBottom();
}

function addBotText(text) {
  const message = document.createElement("article");
  message.className = "rules-message rules-message-bot";
  const answer = document.createElement("div");
  answer.className = "rules-answer";
  renderAnswerInto(answer, text);
  message.append(answer);
  rulesMessages.append(message);
  return message;
}

function addThinking() {
  const message = document.createElement("article");
  message.className = "rules-message rules-message-bot";
  const typing = document.createElement("div");
  typing.className = "rules-typing";
  typing.setAttribute("aria-label", "Searching official community sources");
  typing.append(
    document.createElement("span"),
    document.createElement("span"),
    document.createElement("span")
  );
  message.append(typing);
  rulesMessages.append(message);
  scrollToBottom();
  return message;
}

/* ---------- Answer formatting ----------
   The API returns plain text shaped like:
     Short answer: ...
     What I found:
     - Section title: excerpt
     Before you act: ...
   Render those cues as structured, readable blocks. */
function renderAnswerInto(container, text) {
  container.replaceChildren();
  const lines = String(text || "").split(/\r?\n/);
  let list = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      list = null;
      continue;
    }

    const bullet = line.match(/^[-•]\s+(.*)$/);
    if (bullet) {
      if (!list) {
        list = document.createElement("ul");
        list.className = "rules-answer-list";
        container.append(list);
      }
      list.append(renderBullet(bullet[1]));
      continue;
    }
    list = null;

    const labeled = line.match(/^(Short answer|Before you act|What I found)\s*:\s*(.*)$/i);
    if (labeled) {
      container.append(renderLabeled(labeled[1].toLowerCase(), labeled[2]));
      continue;
    }

    const paragraph = document.createElement("p");
    paragraph.className = "rules-answer-p";
    paragraph.textContent = line;
    container.append(paragraph);
  }

  if (!container.childNodes.length) {
    const paragraph = document.createElement("p");
    paragraph.className = "rules-answer-p";
    paragraph.textContent = String(text || "");
    container.append(paragraph);
  }
}

function renderBullet(body) {
  const item = document.createElement("li");
  const split = body.indexOf(": ");
  if (split > 0 && split < 90) {
    const name = document.createElement("strong");
    name.textContent = body.slice(0, split);
    item.append(name, document.createTextNode(": " + body.slice(split + 2)));
  } else {
    item.textContent = body;
  }
  return item;
}

function renderLabeled(key, rest) {
  if (key === "short answer") {
    const lead = document.createElement("p");
    lead.className = "rules-answer-lead";
    const tag = document.createElement("span");
    tag.className = "rules-answer-tag";
    tag.textContent = "Short answer";
    lead.append(tag, document.createTextNode(rest));
    return lead;
  }

  if (key === "before you act") {
    const note = document.createElement("p");
    note.className = "rules-callout";
    const tag = document.createElement("span");
    tag.className = "rules-callout-tag";
    tag.textContent = "Before you act";
    note.append(tag, document.createTextNode(rest));
    return note;
  }

  const subhead = document.createElement("p");
  subhead.className = "rules-answer-subhead";
  subhead.textContent = rest || "What I found";
  return subhead;
}

/* ---------- Sources ---------- */
function sourceMeta(source) {
  const details = [source.chapter, source.article].filter(Boolean);
  if (source.isSupplemental) {
    details.unshift(
      source.sourceLifecycle === "current"
        ? "Current supplemental policy"
        : "Supplemental policy"
    );
  } else if (!source.isOfficialResource) {
    details.unshift("Codified rulebook");
  }
  const effective = formatDateShort(source.effectiveDate || source.approvedDate);
  if (effective) details.push(`effective ${effective}`);
  return details.join(" · ");
}

function textFragmentPhrase(text) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\.\.\.$/, "")
    .trim();
  if (!clean || clean.length < 16) return "";
  if (clean.length <= 140) return clean;

  const firstSentence = clean.match(/^.{16,140}?[.!?](?=\s|$)/);
  return (firstSentence ? firstSentence[0] : clean.slice(0, 140)).trim();
}

function sourceHref(source) {
  const href = source.sourceUrl || "";
  const phrase = textFragmentPhrase(source.jumpText || source.excerpt || "");
  if (!href || !phrase) return href;

  try {
    const parsed = new URL(href, window.location.href);
    if (!/\.?municode\.com$/i.test(parsed.hostname)) return href;
    parsed.hash = `:~:text=${encodeURIComponent(phrase)}`;
    return parsed.toString();
  } catch {
    return href;
  }
}

function renderSourceItem(source) {
  const item = document.createElement("li");
  item.className = "rules-source-item";

  const link = document.createElement("a");
  link.className = "rules-source-title";
  link.href = sourceHref(source);
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = source.title || "Rulebook section";
  item.append(link);

  const meta = sourceMeta(source);
  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "rules-source-meta";
    metaEl.textContent = meta;
    item.append(metaEl);
  }

  if (source.excerpt) {
    const excerpt = document.createElement("p");
    excerpt.className = "rules-source-excerpt";
    const cleanExcerpt = String(source.excerpt).replace(/\s+/g, " ").trim();
    excerpt.textContent = cleanExcerpt.length > 520
      ? `${cleanExcerpt.slice(0, 517).trim()}…`
      : cleanExcerpt;
    item.append(excerpt);
  }

  return item;
}

function sharedAnswerUrl(question) {
  const url = new URL("/community-assistant", window.location.origin);
  url.searchParams.set("q", question);
  return url.toString();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some browsers expose the Clipboard API but block it. Use the older
      // copy path below so residents still get a one-tap experience.
    }
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.append(helper);
  helper.select();
  const copied = document.execCommand("copy");
  helper.remove();
  if (!copied) throw new Error("Could not copy the link.");
}

function setShareButtonMessage(button, message, state = "") {
  button.querySelector(".rules-share-label").textContent = message;
  if (state) button.dataset.state = state;
  else delete button.dataset.state;
}

async function copyAnswerLink(button, question) {
  const url = sharedAnswerUrl(question);
  button.disabled = true;

  try {
    await copyText(url);
    trackEvent("rules_answer_shared", { share_method: "copied_link" });
    setShareButtonMessage(button, "Link copied", "success");
  } catch {
    setShareButtonMessage(button, "Couldn’t copy — try again");
  } finally {
    button.disabled = false;
    window.setTimeout(() => setShareButtonMessage(button, "Copy answer link"), 2400);
  }
}

function addAnswer(data, question) {
  const node = rulesTemplate.content.firstElementChild.cloneNode(true);
  const sources = Array.isArray(data.sources) ? data.sources : [];

  renderAnswerInto(node.querySelector(".rules-answer"), data.answer || "");

  const answerLabel = node.querySelector(".rules-answer-actions-label");
  if (data.answerMode === "safety" || data.answerStatus === "safety-rejected" || data.inputClassification === "prompt-injection") {
    answerLabel.textContent = "Safety response";
    answerLabel.dataset.state = "unverified";
  } else if (["conversation", "unrelated", "unclear"].includes(data.inputClassification)) {
    answerLabel.textContent = "Community assistant";
  } else if (data.answerVerdict === "unverified" || data.confidence?.canAnswer !== true) {
    answerLabel.textContent = "Could not verify — next step included";
    answerLabel.dataset.state = "unverified";
  } else if (data.answerVerdict === "prohibited") {
    answerLabel.textContent = "Rule says no";
    answerLabel.dataset.state = "prohibited";
  } else if (data.answerVerdict === "conditional") {
    answerLabel.textContent = "Allowed with approval or conditions";
    answerLabel.dataset.state = "conditional";
  } else if (data.answerVerdict === "allowed") {
    answerLabel.textContent = "Rule says yes";
    answerLabel.dataset.state = "allowed";
  } else {
    answerLabel.textContent = "Verified community answer";
  }

  const shareButton = node.querySelector(".rules-share-button");
  shareButton.addEventListener("click", () => copyAnswerLink(shareButton, question));

  const actions = Array.isArray(data.actions) ? data.actions.filter((action) => action?.label && /^https?:\/\//i.test(action.url || "")) : [];
  if (actions.length) {
    const actionPanel = document.createElement("div");
    actionPanel.className = "rules-next-actions";
    const actionLabel = document.createElement("p");
    actionLabel.className = "rules-next-actions-label";
    actionLabel.textContent = "Official next steps";
    const actionLinks = document.createElement("div");
    actionLinks.className = "rules-next-actions-links";
    actions.slice(0, 3).forEach((action) => {
      const link = document.createElement("a");
      link.href = action.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = action.label;
      actionLinks.append(link);
    });
    actionPanel.append(actionLabel, actionLinks);
    node.querySelector(".rules-answer").after(actionPanel);
  }

  const details = node.querySelector(".rules-sources");
  if (sources.length) {
    node.querySelector(".rules-sources-count").textContent = `(${sources.length})`;
    const list = details.querySelector("ul");
    sources.forEach((source) => list.append(renderSourceItem(source)));
  } else {
    details.remove();
  }

  rulesMessages.append(node);
  updateStatus(data.sourceStatus || {});
  followRefreshingStatus(data.sourceStatus || {});
  scrollToMessageStart(node);
}

/* ---------- Source status ---------- */
function updateStatus(status) {
  if (!status) return;

  statusSource.textContent = PUBLIC_SOURCE_NAME;
  const community = status.communitySources || {};
  const lastChecked = formatDateTime(status.lastFetchedAt);
  const communityChecked = formatDateTime(community.generatedAt);
  statusChecked.textContent =
    status.refreshing && lastChecked !== "Not available"
      ? `Checking now; last successful check ${lastChecked}`
      : communityChecked !== "Not available"
        ? `Rules: ${lastChecked}; community pages: ${communityChecked}`
        : lastChecked;
  statusOnlineDate.textContent = formatDateTime(status.onlineUpdateDate);
  statusCodified.textContent = status.codifiedThrough || "Not available";

  let headline;
  let state;
  if (status.refreshing || community.refreshing) {
    headline = "Refreshing official sources…";
    state = "busy";
  } else if (status.isStale || community.stale) {
    headline = "Some official sources may be out of date";
    state = "warn";
  } else {
    headline = "Official sources ready";
    state = "ok";
  }
  statusHeadline.textContent = headline;
  statusDot.dataset.state = state;

  const notes = [];
  if (status.refreshing) notes.push("Refreshing the rulebook index now.");
  if (status.isStale) notes.push("The local rulebook index may be stale.");
  if (community.refreshing) notes.push("Refreshing official community pages now.");
  if (community.stale) notes.push("One or more community pages are due for a freshness check.");
  if (community.lastRefreshError) notes.push("The latest community-page refresh failed; older sources are marked accordingly.");
  if (Array.isArray(status.warnings)) {
    const sourcePlatformPattern = new RegExp(`\\b${["Muni", "code"].join("")}\\b`, "g");
    status.warnings
      .map((warning) =>
        String(warning).replace(sourcePlatformPattern, "the official online source")
      )
      .forEach((warning) => notes.push(warning));
  }
  statusNote.textContent = notes.join(" ");
  statusNote.hidden = notes.length === 0;
}

function scheduleStatusPoll() {
  if (statusPollTimer || statusPollAttempts >= 12) return;

  statusPollTimer = window.setTimeout(() => {
    statusPollTimer = null;
    statusPollAttempts += 1;
    loadStatus();
  }, 5000);
}

function followRefreshingStatus(status) {
  if (status?.refreshing || status?.refreshStarted) {
    scheduleStatusPoll();
    return;
  }

  statusPollAttempts = 0;
}

async function loadStatus() {
  try {
    const response = await fetch("/api/rules/status");
    const data = await response.json();
    updateStatus(data);
    followRefreshingStatus(data);
  } catch {
    statusHeadline.textContent = "Could not check the source just now";
    statusDot.dataset.state = "warn";
    statusChecked.textContent = "Could not check";
    statusOnlineDate.textContent = "Could not check";
  }
}

/* ---------- Asking ---------- */
function setLoading(isLoading) {
  rulesSend.disabled = isLoading;
  rulesSend.classList.toggle("is-loading", isLoading);
}

async function askRules(question, source = "typed") {
  startConversation();
  addUserMessage(question);
  const thinking = addThinking();
  setLoading(true);
  trackEvent("rules_question_submitted", {
    question_text: cleanQuestionForAnalytics(question),
    question_length: question.length,
    question_source: source,
  });

  try {
    const response = await fetch("/api/community/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, context: conversationContext }),
    });
    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("The community assistant is temporarily unavailable.");
    }

    if (!response.ok) {
      throw new Error(data.error || "The community assistant is temporarily unavailable.");
    }

    thinking.remove();
    addAnswer(data, question);
    rememberExchange(question, data);
    trackEvent("rules_answer_received", {
      answer_mode: data.answerMode || "deterministic",
      can_answer: Boolean(data.confidence?.canAnswer),
      source_count: Array.isArray(data.sources) ? data.sources.length : 0,
    });
    if (data.confidence?.canAnswer !== true) {
      trackEvent("rules_answer_unverified", {
        reason: data.confidence?.reason || "unknown",
        input_classification: data.inputClassification || "unknown",
      });
    }
  } catch (error) {
    trackEvent("rules_answer_error");
    const answer = document.createElement("div");
    answer.className = "rules-answer";
    renderAnswerInto(
      answer,
      error.message || "The community assistant is temporarily unavailable."
    );
    thinking.replaceChildren(answer);
    scrollToMessageStart(thinking);
  } finally {
    setLoading(false);
  }
}

/* ---------- Composer behavior ---------- */
function autoGrow() {
  rulesQuestion.style.height = "auto";
  const next = Math.min(rulesQuestion.scrollHeight, 160);
  rulesQuestion.style.height = `${next}px`;
  rulesQuestion.style.overflowY = rulesQuestion.scrollHeight > 160 ? "auto" : "hidden";
}

function resetComposer() {
  rulesQuestion.value = "";
  rulesQuestion.style.height = "";
  rulesQuestion.style.overflowY = "";
  rulesQuestion.focus();
}

function startConversation() {
  if (conversationStarted) return;
  conversationStarted = true;
  rulesDock.classList.add("has-conversation");
  rulesDock.classList.remove("starters-open");
  startersToggle.setAttribute("aria-expanded", "false");
  startersToggle.textContent = "Show example questions";
}

rulesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (rulesSend.disabled) return;
  const question = rulesQuestion.value.trim();
  if (!question) return;
  resetComposer();
  askRules(question);
});

rulesQuestion.addEventListener("input", autoGrow);

rulesQuestion.addEventListener("focus", () => {
  rulesDock.classList.add("is-composing");
});

rulesQuestion.addEventListener("blur", () => {
  if (!rulesQuestion.value.trim()) {
    rulesDock.classList.remove("is-composing");
  }
});

rulesQuestion.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    rulesForm.requestSubmit();
  }
});

rulesStarters.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  trackEvent("rules_starter_clicked");
  askRules(button.textContent.trim(), "example");
});

startersToggle.addEventListener("click", () => {
  const open = rulesDock.classList.toggle("starters-open");
  startersToggle.setAttribute("aria-expanded", String(open));
  startersToggle.textContent = open ? "Hide example questions" : "Show example questions";
});

rulesStartOver.addEventListener("click", () => {
  conversationContext = [];
  saveConversationContext();
  rulesMessages.replaceChildren();
  conversationStarted = false;
  rulesDock.classList.remove("has-conversation", "starters-open");
  startersToggle.setAttribute("aria-expanded", "false");
  startersToggle.textContent = "Show example questions";
  addBotText("Ask me a new question about Sterling Ranch rules, services, facilities, events, pool status, or food trucks.");
  rulesQuestion.focus();
  trackEvent("rules_conversation_reset");
});

statusToggle.addEventListener("click", () => {
  const open = statusDetail.hasAttribute("hidden");
  statusDetail.toggleAttribute("hidden", !open);
  statusToggle.setAttribute("aria-expanded", String(open));
});

function closeStatusDetail() {
  if (statusDetail.hasAttribute("hidden")) return;
  statusDetail.setAttribute("hidden", "");
  statusToggle.setAttribute("aria-expanded", "false");
}

document.addEventListener("click", (event) => {
  if (statusDetail.hasAttribute("hidden")) return;
  if (statusToggle.contains(event.target) || statusDetail.contains(event.target)) return;
  closeStatusDetail();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !statusDetail.hasAttribute("hidden")) {
    closeStatusDetail();
    statusToggle.focus();
  }
});

// Full disclaimer on desktop; collapsed on mobile. Only flip when crossing the
// breakpoint so a user's manual expand on mobile isn't undone by every resize.
const disclaimerEl = document.querySelector(".rules-disclaimer");
let disclaimerIsDesktop = null;
function syncDisclaimerForViewport() {
  if (!disclaimerEl) return;
  const isDesktop = window.innerWidth > 720;
  if (isDesktop === disclaimerIsDesktop) return;
  disclaimerIsDesktop = isDesktop;
  disclaimerEl.open = isDesktop;
}
syncDisclaimerForViewport();
window.addEventListener("resize", syncDisclaimerForViewport);

loadStatus();

const sharedQuestion = new URLSearchParams(window.location.search).get("q")?.trim() || "";
if (sharedQuestion) {
  conversationContext = [];
  saveConversationContext();
  askRules(sharedQuestion, "shared_link");
} else if (conversationContext.length) {
  startConversation();
  conversationContext.forEach((exchange) => {
    addUserMessage(exchange.question);
    addBotText(`Short answer: ${exchange.answer}`);
  });
} else {
  addBotText(
    "Ask me about Sterling Ranch rules, services, forms, facilities, events, pool status, or food trucks. I’ll give you a clear answer with the official sources and next steps I used. Not sure where to start? Try one of the examples below."
  );
}
