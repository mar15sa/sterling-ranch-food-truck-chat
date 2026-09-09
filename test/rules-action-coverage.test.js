const test = require("node:test");
const assert = require("node:assert/strict");
const { actionLinkIssues } = require("../lib/rules-action-coverage");
const { answerRulesQuestion } = require("../lib/rules-assistant");

test("action-link coverage detects instructions that lack a usable destination", () => {
  assert.deepEqual(
    actionLinkIssues("Submit the application to reserve the room.", [
      { title: "General rules", sourceUrl: "https://example.gov/rules" },
    ]),
    ["submit-or-apply", "book-or-reserve"]
  );
  assert.deepEqual(
    actionLinkIssues("Submit the application to reserve the room.", [
      { title: "Facility rental application", sourceUrl: "https://example.gov/forms/rental", actionType: "booking" },
    ]),
    []
  );
});

test("action-link coverage recognizes instructions proved by an approved nested action", () => {
  assert.deepEqual(
    actionLinkIssues("Please register your account through Utility Hawk.", [
      {
        title: "Water Billing & Payment Options",
        sourceUrl: "https://example.gov/water-billing",
        actions: [{
          label: "Utility Hawk",
          url: "https://billing.example.gov",
          actionType: "payment",
          context: "Please register your account through Utility Hawk and select Pay Online.",
          reviewStatus: "approved",
        }],
      },
    ]),
    []
  );
});

test("action-link coverage does not trust an unapproved nested action", () => {
  assert.deepEqual(
    actionLinkIssues("Please register your account through Utility Hawk.", [
      {
        title: "Water Billing & Payment Options",
        sourceUrl: "https://example.gov/water-billing",
        actions: [{
          label: "Utility Hawk",
          url: "https://billing.example.gov",
          actionType: "payment",
          context: "Please register your account through Utility Hawk.",
          reviewStatus: "candidate",
        }],
      },
    ]),
    ["register"]
  );
});

test("park booking answers provide a current action path instead of naming an unlinked form", async () => {
  for (const question of ["How do I book the park?", "Can I reserve a park shelter?"]) {
    const result = await answerRulesQuestion(question);
    assert.equal(result.confidence?.canAnswer, true, question);
    assert.match(result.answer, /\$15\.00 per hour/i, question);
    assert.match(result.answer, /online booking may not be available|contact Recreation/i, question);
    assert.doesNotMatch(result.answer, /^.*submit the Facilities Rental Application/m, question);
    assert.ok(result.sources.some((source) => /Park Shelters/i.test(source.title || "")), question);
    assert.ok(result.sources.some((source) => /Facility Rentals Catalog/i.test(source.title || "")), question);
    assert.deepEqual(actionLinkIssues(result.answer, result.sources), [], question);
  }
});
