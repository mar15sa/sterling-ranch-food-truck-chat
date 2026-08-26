(function () {
  "use strict";

  const form = document.getElementById("setup-form");
  const input = document.getElementById("community-url");
  const progress = document.getElementById("progress");
  const errorPanel = document.getElementById("error-panel");
  const results = document.getElementById("results");
  const submitButton = form.querySelector("button");

  function setText(id, value) {
    document.getElementById(id).textContent = value || "";
  }

  function sourceItem(source) {
    const row = document.createElement("div");
    row.className = "source-item";
    const type = document.createElement("span");
    type.textContent = source.typeLabel;
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = source.title;
    row.append(type, link);
    return row;
  }

  function render(data) {
    setText("community-name", data.communityName);
    setText("result-summary", data.summary);
    setText("platform-name", data.platform.label);
    setText("platform-connector", data.platform.connector);
    setText("resident-promise", data.residentPromise);

    const capabilityGrid = document.getElementById("capabilities");
    capabilityGrid.replaceChildren();
    data.capabilities.forEach((capability) => {
      const card = document.createElement("article");
      card.className = "capability";
      const top = document.createElement("div");
      top.className = "capability-top";
      const title = document.createElement("strong");
      title.textContent = capability.label;
      const status = document.createElement("span");
      status.className = `status ${capability.status}`;
      status.textContent = capability.status === "found" ? "Found" : capability.status === "available-to-connect" ? "Connector ready" : "Review";
      const explanation = document.createElement("p");
      explanation.textContent = capability.explanation;
      top.append(title, status);
      card.append(top, explanation);
      capabilityGrid.append(card);
    });

    const sourceList = document.getElementById("source-list");
    sourceList.replaceChildren();
    if (data.sources.length) {
      data.sources.slice(0, 16).forEach((source) => sourceList.append(sourceItem(source)));
    } else {
      const empty = document.createElement("p");
      empty.className = "empty-source";
      empty.textContent = "The homepage did not expose source links directly. The next setup pass would use the platform connector and site map.";
      sourceList.append(empty);
    }

    const steps = document.getElementById("setup-steps");
    steps.replaceChildren();
    data.setupSteps.forEach((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      steps.append(item);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorPanel.hidden = true;
    results.hidden = true;
    progress.hidden = false;
    submitButton.disabled = true;

    try {
      const response = await fetch("/api/community/setup-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ website: input.value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The preview could not be built.");
      render(data);
      results.hidden = false;
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      errorPanel.textContent = error.message || "The preview could not be built.";
      errorPanel.hidden = false;
    } finally {
      progress.hidden = true;
      submitButton.disabled = false;
    }
  });
})();
