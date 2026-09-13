const test = require("node:test");
const assert = require("node:assert/strict");

const {
  actionLabel,
  nextStepFromActions,
  plainLanguageSourceText,
  residentVoiceIssues,
} = require("../lib/resident-answer-voice");

test("shared source prose cleanup fixes legal fragments without supplying resident facts", () => {
  const raw = [
    "Landscape screens. DRC approval is required.",
    "Five-foot maximum overall height for exposed landscape screen from grade. We encourage plantings around base of screens and, therefore, will allow a six-foot maximum overall height from grade if plantings are installed around the screen base. Eight-foot maximum overall width for landscape screens.",
    "Must be freestanding in the rear or side yard. Landscape screens are only allowed in rear or side yards and must remain outside easements. A maximum of three screens are allowed if lot square footage permits.",
    "Landscape screens must have 30 percent required transparency. Vinyl is not permitted.",
  ].join("\n\n");

  const cleaned = plainLanguageSourceText(raw);
  assert.match(cleaned, /^You'll need DRC approval for landscape screens\./i);
  assert.match(cleaned, /maximum height is 5 feet, measured from ground level/i);
  assert.match(cleaned, /maximum height can increase to 6 feet, measured from ground level/i);
  assert.match(cleaned, /maximum width is 8 feet/i);
  assert.match(cleaned, /It must be freestanding/i);
  assert.match(cleaned, /up to 3 screens are allowed if the lot has enough room/i);
  assert.match(cleaned, /30% transparency/i);
  assert.match(cleaned, /Vinyl isn't allowed/i);
  assert.deepEqual(residentVoiceIssues(cleaned), []);
});

test("shared voice checks identify the reported failure patterns", () => {
  const issues = residentVoiceIssues("Must be freestanding. Five-foot maximum overall height from grade. We encourage screening and will allow an exception. Vinyl is not allowed under the cited material rule: Vinyl is not permitted.");
  assert.deepEqual(issues.sort(), [
    "duplicated-claim",
    "rulebook-measurement-language",
    "sentence-fragment",
    "source-author-voice",
    "source-meta-language",
  ].sort());
});

test("official action titles become natural labels and a specific next step", () => {
  const actions = [
    { label: actionLabel("Landscape Screens One-Sheet") },
    { label: actionLabel("Submit a DRC Application") },
  ];
  assert.deepEqual(actions.map((action) => action.label), ["Open Landscape Screens One-Sheet", "Submit a DRC Application"]);
  assert.equal(
    nextStepFromActions("Open the linked official section if you need the complete wording.", actions),
    "Review the Landscape Screens One-Sheet, then submit a DRC application."
  );
});

test("plain-language cleanup keeps prohibitions accurate", () => {
  const answer = plainLanguageSourceText(
    "Prohibited under the cited rule: No animals, livestock, fowl, or poultry of any kind shall be raised, bred or kept except domesticated birds, fish and other small domestic animals confined indoors."
  );
  assert.match(answer, /^No\./i);
  assert.match(answer, /can't be raised, bred or kept/i);
  assert.match(answer, /except domesticated birds/i);
  assert.doesNotMatch(answer, /must be raised|under the cited rule/i);
  assert.deepEqual(residentVoiceIssues(answer), []);
});
