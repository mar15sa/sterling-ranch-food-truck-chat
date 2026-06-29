const messages = document.querySelector("#messages");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#questionInput");
const statusPill = document.querySelector("#statusPill");
const template = document.querySelector("#botResultTemplate");
const quickActions = document.querySelector("#quickActions");
const MAX_MORE_LINKS = 4;

function trackEvent(name, params = {}) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

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

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getInitialDateFromUrl() {
  const date = new URLSearchParams(window.location.search).get("date") || "";
  return /^20\d{2}-\d{2}-\d{2}$/.test(date) ? date : "";
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

function parseAskedDate(question) {
  const text = String(question || "").toLowerCase();
  const today = new Date();

  if (/\btomorrow\b/.test(text)) return formatIsoDate(addDays(today, 1));
  if (/\byesterday\b/.test(text)) return formatIsoDate(addDays(today, -1));
  if (/\btoday\b/.test(text)) return formatIsoDate(today);

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    let year = slash[3] ? Number(slash[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }

  const monthNames =
    "january february march april may june july august september october november december";
  const monthMatch = text.match(
    new RegExp(`\\b(${monthNames.split(" ").join("|")})\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?\\b`)
  );
  if (monthMatch) {
    const month = monthNames.split(" ").indexOf(monthMatch[1]) + 1;
    const year = monthMatch[3] ? Number(monthMatch[3]) : today.getFullYear();
    return `${year}-${String(month).padStart(2, "0")}-${monthMatch[2].padStart(2, "0")}`;
  }

  const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const wantedDay = weekdays.findIndex((day) => new RegExp(`\\b${day}\\b`).test(text));
  if (wantedDay !== -1) {
    const currentDay = today.getDay();
    let offset = (wantedDay - currentDay + 7) % 7;
    if (offset === 0 && /\bnext\b/.test(text)) offset = 7;
    return formatIsoDate(addDays(today, offset));
  }

  return "";
}

function buildQuickActions() {
  const today = new Date();
  const quickDates = [
    {
      label: "Today",
      question: "What food truck is here today?",
      date: formatIsoDate(today),
      selected: true,
    },
    {
      label: "Tomorrow",
      question: "What food truck is here tomorrow?",
      date: formatIsoDate(addDays(today, 1)),
    },
    {
      label: formatShortDate(addDays(today, 2)),
      question: `What food truck is here ${formatQuestionDate(addDays(today, 2))}?`,
      date: formatIsoDate(addDays(today, 2)),
    },
  ];

  quickDates.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.setAttribute("aria-pressed", String(Boolean(action.selected)));
    button.addEventListener("click", () => {
      input.value = "";
      quickActions.querySelectorAll("button").forEach((quickButton) => {
        quickButton.setAttribute("aria-pressed", String(quickButton === button));
      });
      trackEvent("quick_question_click", {
        label: action.label,
      });
      ask(action.question, "quick", action.date);
    });
    quickActions.append(button);
  });
}

function warmUpcomingDates() {
  fetch("/api/warmup?days=8").catch(() => {
    // Warming is optional. Normal lookups still work if this request fails.
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

function renderTruckListing(listing, friendlyDate) {
  const section = document.createElement("section");
  const truckCard = document.createElement("div");
  const truckBox = document.createElement("div");
  const dateBox = document.createElement("div");
  const featuredBox = document.createElement("div");
  const truckLabel = document.createElement("span");
  const truckName = document.createElement("strong");
  const dateLabel = document.createElement("span");
  const dateText = document.createElement("strong");
  const featuredLabel = document.createElement("span");
  const featuredList = document.createElement("ul");

  section.className = "truck-listing";
  truckCard.className = "truck-card";
  truckLabel.className = "label";
  truckLabel.textContent = listing.location ? `Truck - ${listing.location}` : "Truck";
  truckName.textContent = listing.name;
  truckBox.append(truckLabel, truckName);

  dateLabel.className = "label";
  dateLabel.textContent = "Date";
  dateText.textContent = friendlyDate;
  dateBox.append(dateLabel, dateText);
  truckCard.append(truckBox, dateBox);

  const featuredLinks = listing.menu?.featuredLinks || {};
  const featured = [
    ["Official website", featuredLinks.official],
    ["Facebook", featuredLinks.facebook],
    ["Instagram", featuredLinks.instagram],
  ].filter(([, link]) => link?.url);

  if (featured.length) {
    featuredBox.className = "featured-links-section";
    featuredLabel.className = "label";
    featuredLabel.textContent = "Links";
    featuredList.className = "featured-links";
    featured.forEach(([label, link]) => featuredList.append(renderFeaturedLink(label, link)));
    featuredBox.append(featuredLabel, featuredList);
    truckCard.append(featuredBox);
  }

  section.append(truckCard);

  const items = listing.menu?.items || [];
  if (items.length) {
    const menuSection = document.createElement("div");
    const heading = document.createElement("h2");
    const list = document.createElement("ul");
    menuSection.className = "menu-section";
    heading.textContent = "Menu items found";
    list.className = "menu-items";
    items.forEach((item) => list.append(renderMenuItem(item)));
    menuSection.append(heading, list);
    section.append(menuSection);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "menu-fallback";
    fallback.innerHTML =
      "<h2>Menu not readable yet</h2><p>I found the truck, but could not pull menu items automatically this time. The official and helpful links are the best backup.</p>";
    section.append(fallback);
  }

  const featuredUrls = new Set(featured.map(([, link]) => normalizeLinkUrl(link.url)));
  const links = (listing.menu?.links || [])
    .filter((link) => link?.url && !featuredUrls.has(normalizeLinkUrl(link.url)))
    .slice(0, MAX_MORE_LINKS);

  if (links.length) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const content = document.createElement("div");
    const linksSection = document.createElement("div");
    const heading = document.createElement("h2");
    const list = document.createElement("ul");
    details.className = "truck-more-section";
    summary.textContent = "More about this truck";
    content.className = "truck-more-content";
    linksSection.className = "links-section";
    heading.textContent = "Other helpful links";
    list.className = "menu-links";
    links.forEach((link) => list.append(renderLink(link)));
    linksSection.append(heading, list);
    content.append(linksSection);
    details.append(summary, content);
    section.append(details);
  }

  return section;
}

function addBotResult(data) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector(".answer-text").textContent = data.text;

  const source = node.querySelector(".source-link");
  source.href = data.sourceUrl;
  node.querySelector(".checked-at").textContent = formatCheckedAt(data.checkedAt);

  const truckListings = data.trucks || [];
  if (truckListings.length) {
    const meta = node.querySelector(".result-meta");
    truckListings.forEach((listing) => {
      node.insertBefore(renderTruckListing(listing, data.friendlyDate), meta);
    });
    messages.append(node);
    scrollToMessageStart(node);
    return;
  }

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

async function ask(question, source = "typed", date = "", showUserMessage = true) {
  if (showUserMessage) addUserMessage(question);
  trackEvent("question_submitted", {
    source,
  });
  setStatus("Checking");
  const thinking = addPlainBotMessage("Checking the calendar and menu pages...");

  try {
    const params = new URLSearchParams({ q: question });
    const resolvedDate = date || parseAskedDate(question);
    if (resolvedDate) params.set("date", resolvedDate);
    const response = await fetch(`/api/ask?${params.toString()}`);
    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("The food truck service is temporarily unavailable. Please try again in a minute.");
    }

    if (!response.ok) {
      throw new Error(
        data.error || "The food truck service is temporarily unavailable. Please try again in a minute."
      );
    }

    thinking.remove();
    addBotResult(data);
    trackEvent("menu_lookup_result", {
      source,
      date: data.date || "unknown",
      truck: data.truck || "none",
      has_truck: Boolean(data.truck),
      has_menu_items: Boolean(data.menu?.items?.length),
      item_count: data.menu?.items?.length || 0,
    });
    setStatus("Ready");
  } catch (error) {
    thinking.textContent =
      error.message || "The food truck service is temporarily unavailable. Please try again in a minute.";
    trackEvent("menu_lookup_error", {
      source,
    });
    setStatus("Try again");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  ask(question, "typed");
});

buildQuickActions();
addPlainBotMessage("Ask me which food truck is here, and I’ll check the Sterling Ranch calendar plus likely menu pages.");
document.querySelectorAll("[data-feedback-type]").forEach((link) => {
  link.addEventListener("click", () => {
    trackEvent("feedback_link_click", {
      feedback_type: link.dataset.feedbackType,
    });
  });
});
const settingsMenu = document.querySelector("#settingsMenu");
document.addEventListener("click", (event) => {
  if (settingsMenu?.open && !settingsMenu.contains(event.target)) {
    settingsMenu.removeAttribute("open");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && settingsMenu?.open) {
    settingsMenu.removeAttribute("open");
    settingsMenu.querySelector("summary")?.focus();
  }
});
const initialDate = getInitialDateFromUrl();
ask(
  initialDate ? `What food truck is here on ${initialDate}?` : "What food truck is here today?",
  initialDate ? "calendar-link" : "default",
  initialDate || formatIsoDate(new Date())
).finally(warmUpcomingDates);
