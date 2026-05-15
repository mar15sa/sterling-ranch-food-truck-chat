const messages = document.querySelector("#messages");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#questionInput");
const statusPill = document.querySelector("#statusPill");
const template = document.querySelector("#botResultTemplate");
const quickActions = document.querySelector("#quickActions");
const MAX_MORE_LINKS = 4;

function setStatus(text) {
  statusPill.textContent = text;
}

function addUserMessage(text) {
  const message = document.createElement("div");
  message.className = "message user";
  message.textContent = text;
  messages.append(message);
  scrollToBottom();
}

function addPlainBotMessage(text) {
  const message = document.createElement("div");
  message.className = "message bot";
  message.textContent = text;
  messages.append(message);
  scrollToBottom();
  return message;
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function scrollToMessageStart(message) {
  const target = message.offsetTop - messages.offsetTop - 12;
  messages.scrollTo({
    top: Math.max(target, 0),
    behavior: "smooth",
  });
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatQuestionDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  }).format(date);
}

function buildQuickActions() {
  const quickDates = [
    { label: "Today", question: "What food truck is here today?" },
    { label: "Tomorrow", question: "What food truck is here tomorrow?" },
    {
      label: formatShortDate(addDays(new Date(), 2)),
      question: `What food truck is here ${formatQuestionDate(addDays(new Date(), 2))}?`,
    },
  ];

  quickDates.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      input.value = "";
      ask(action.question);
    });
    quickActions.append(button);
  });
}

function renderMenuItem(item) {
  const li = document.createElement("li");
  const title = document.createElement("div");
  title.className = "menu-name";

  const name = document.createElement("span");
  name.textContent = item.name;
  title.append(name);

  if (item.price) {
    const price = document.createElement("span");
    price.className = "menu-price";
    price.textContent = item.price;
    title.append(price);
  }

  li.append(title);

  if (item.description) {
    const description = document.createElement("p");
    description.className = "menu-description";
    description.textContent = item.description;
    li.append(description);
  }

  return li;
}

function renderLink(link) {
  const li = document.createElement("li");
  const anchor = document.createElement("a");
  const meta = document.createElement("span");

  li.className = "compact-link";
  anchor.href = link.url;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.textContent = link.title || link.url;

  meta.className = "link-domain";
  meta.textContent = formatLinkDomain(link.url);

  li.append(anchor, meta);
  return li;
}

function formatLinkDomain(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatCheckedAt(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "Last checked just now";

  return `Last checked ${new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

function normalizeLinkUrl(url = "") {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return String(url).replace(/\/$/, "").toLowerCase();
  }
}

function renderFeaturedLink(label, link) {
  const li = document.createElement("li");
  const anchor = document.createElement("a");
  const icon = document.createElement("span");
  const text = document.createElement("span");

  anchor.href = link.url;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.className = "link-icon-button";
  anchor.setAttribute("aria-label", `${label}: ${link.title || link.url}`);
  anchor.title = `${label}: ${link.title || link.url}`;

  icon.className = `link-icon ${label.toLowerCase().replace(/\s+/g, "-")}`;
  icon.innerHTML = getLinkIcon(label);

  text.className = "link-icon-text";
  text.textContent = label;

  anchor.append(icon, text);
  li.append(anchor);
  return li;
}

function getLinkIcon(label) {
  if (label === "Facebook") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8.5h2V5h-2.7C10.7 5 9 6.7 9 9.4V12H7v3.5h2V22h4v-6.5h2.8l.5-3.5H13V9.7c0-.8.4-1.2 1-1.2Z"/></svg>';
  }

  if (label === "Instagram") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4"/><circle cx="12" cy="12" r="3.2"/><circle cx="16.5" cy="7.5" r="1"/></svg>';
  }

  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2 2.2 3 4.9 3 8s-1 5.8-3 8M12 4c-2 2.2-3 4.9-3 8s1 5.8 3 8"/></svg>';
}

function addBotResult(data) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector(".answer-text").textContent = data.text;

  const source = node.querySelector(".source-link");
  source.href = data.sourceUrl;
  node.querySelector(".checked-at").textContent = formatCheckedAt(data.checkedAt);

  if (data.truck) {
    node.querySelector(".truck-card").classList.remove("hidden");
    node.querySelector(".truck-name").textContent = data.truck;
    node.querySelector(".truck-date").textContent = data.friendlyDate;
  }

  const featuredLinks = data.menu?.featuredLinks || {};
  const featured = [
    ["Official website", featuredLinks.official],
    ["Facebook", featuredLinks.facebook],
    ["Instagram", featuredLinks.instagram],
  ].filter(([, link]) => link?.url);
  const moreSection = node.querySelector(".truck-more-section");

  if (featured.length) {
    const section = node.querySelector(".featured-links-section");
    const list = node.querySelector(".featured-links");
    section.classList.remove("hidden");
    featured.forEach(([label, link]) => list.append(renderFeaturedLink(label, link)));
  }

  const items = data.menu?.items || [];
  if (items.length) {
    const section = node.querySelector(".menu-section");
    const list = node.querySelector(".menu-items");
    section.classList.remove("hidden");
    items.forEach((item) => list.append(renderMenuItem(item)));
  } else if (data.truck) {
    node.querySelector(".menu-fallback").classList.remove("hidden");
  }

  const featuredUrls = new Set(featured.map(([, link]) => normalizeLinkUrl(link.url)));
  const links = (data.menu?.links || [])
    .filter((link) => link?.url && !featuredUrls.has(normalizeLinkUrl(link.url)))
    .slice(0, MAX_MORE_LINKS);

  if (links.length) {
    const section = node.querySelector(".links-section");
    const list = node.querySelector(".menu-links");
    moreSection.classList.remove("hidden");
    section.classList.remove("hidden");
    links.forEach((link) => list.append(renderLink(link)));
  }

  messages.append(node);
  scrollToMessageStart(node);
}

async function ask(question) {
  addUserMessage(question);
  setStatus("Checking");
  const thinking = addPlainBotMessage("Checking the calendar and menu pages...");

  try {
    const response = await fetch(`/api/ask?q=${encodeURIComponent(question)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || data.error || "Request failed");
    }

    thinking.remove();
    addBotResult(data);
    setStatus("Ready");
  } catch (error) {
    thinking.textContent = `I ran into a lookup problem: ${error.message}`;
    setStatus("Issue");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  ask(question);
});

buildQuickActions();
addPlainBotMessage("Ask me which food truck is here, and I’ll check the Sterling Ranch calendar plus likely menu pages.");
