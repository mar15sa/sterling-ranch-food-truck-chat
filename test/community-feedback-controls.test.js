const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const feedbackDraft = (html, subject) => {
  const start = html.indexOf(`href="mailto:hello@ideakitchen.ai?subject=${encodeURIComponent(subject)}`);
  if (start < 0) return null;
  return html.slice(start + 6, html.indexOf('"', start + 6));
};

test("Community Assistant feedback controls open clear email drafts without sending anything", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "rules-assistant.html"), "utf8");
  const bugReport = feedbackDraft(html, "Community Assistant bug report");
  const featureRequest = feedbackDraft(html, "Community Assistant feature request");

  assert.ok(html.includes("Report a bug"), "Report a bug must be visible link text");
  assert.ok(html.includes("Request a feature"), "Request a feature must be visible link text");
  assert.ok(bugReport, "Report a bug must open an email draft");
  assert.ok(featureRequest, "Request a feature must open an email draft");

  const bugDraft = new URL(bugReport.replaceAll("&amp;", "&")).searchParams;
  assert.equal(bugDraft.get("subject"), "Community Assistant bug report");
  assert.equal(
    bugDraft.get("body"),
    "What happened?\n\nWhat did you expect to happen?\n\nWhat question did you ask?\n\nWhat device and browser were you using?\n\nPlease attach a screenshot if you can."
  );

  const featureDraft = new URL(featureRequest.replaceAll("&amp;", "&")).searchParams;
  assert.equal(featureDraft.get("subject"), "Community Assistant feature request");
  assert.equal(
    featureDraft.get("body"),
    "What would you like Community Assistant to do?\n\nHow would this help you?"
  );

  assert.match(html, /Opens an email draft\. Nothing sends automatically\./i);
});
