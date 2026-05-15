const messages = document.querySelector("#messages");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#questionInput");
const statusPill = document.querySelector("#statusPill");
const template = document.querySelector("#botResultTemplate");
const quickActions = document.querySelector("#quickActions");

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
  anchor.href = link.url;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.textContent = link.title || link.url;
  li.append(anchor);

  if (link.snippet) {
    const snippet = document.createElement("p");
    snippet.className = "snippet";
    snippet.textContent = link.snippet;
    li.append(snippet);
  }

  return li;
}

function addBotResult(data) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector(".answer-text").textContent = data.text;

  const source = node.querySelector(".source-link");
  source.href = data.sourceUrl;

  if (data.truck) {
    node.querySelector(".truck-card").classList.remove("hidden");
    node.querySelector(".truck-name").textContent = data.truck;
    node.querySelector(".truck-date").textContent = data.friendlyDate;
  }

  const items = data.menu?.items || [];
  if (items.length) {
    const section = node.querySelector(".menu-section");
    const list = node.querySelector(".menu-items");
    section.classList.remove("hidden");
    items.forEach((item) => list.append(renderMenuItem(item)));
  }

  const links = data.menu?.links || [];
  if (links.length) {
    const section = node.querySelector(".links-section");
    const list = node.querySelector(".menu-links");
    section.classList.remove("hidden");
    links.forEach((link) => list.append(renderLink(link)));
  }

  messages.append(node);
  scrollToBottom();
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
