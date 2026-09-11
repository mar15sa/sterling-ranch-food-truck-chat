const test = require("node:test");
const assert = require("node:assert/strict");

const { verifyStructuredDraft } = require("../lib/community-grounding");
const { answerCoverageIssues } = require("../lib/rules-intent");

const unsupportedIssue = "unsupported-resource-absence-claim";

test("semantic search-miss wording cannot claim that a named catalog item is absent", () => {
  const cases = [
    {
      question: "Can I plant Moonbeam Dragonfruit in my yard?",
      answer: "The rules don't specifically list Moonbeam Dragonfruit on the preapproved plant list.",
      source: { title: "Preapproved plant list", text: "Boulder Raspberry is a preapproved shrub." },
    },
    {
      question: "Can I hire Acme Roofing?",
      answer: "The official source doesn't mention Acme Roofing.",
      source: { title: "Approved contractor directory", text: "Beacon Roofing is an approved contractor." },
    },
    {
      question: "May I use Alpine Solar?",
      answer: "I couldn't find Alpine Solar in the approved vendor registry.",
      source: { title: "Approved vendor registry", text: "Summit Electric is an approved vendor." },
    },
    {
      question: "Is FlexFit offered?",
      answer: "The search results didn't show any entry for FlexFit in the class roster.",
      source: { title: "Class roster", text: "Morning Yoga is listed." },
    },
    {
      question: "Is Bright Futures Preschool listed?",
      answer: "Bright Futures Preschool isn't mentioned in the official directory.",
      source: { title: "Childcare directory", text: "Little Pines Preschool is listed." },
    },
    {
      question: "Is Rapid Rooter an approved plumber?",
      answer: "Rapid Rooter isn't an approved contractor.",
      source: { title: "Approved contractor list", text: "Clearwater Plumbing is approved." },
    },
    {
      question: "Can I grow Moonbeam Dragonfruit?",
      answer: "Moonbeam Dragonfruit isn't on the preapproved plant list for Sterling Ranch.",
      source: { title: "Preapproved plant list", text: "Boulder Raspberry is a preapproved shrub." },
    },
    {
      question: "Can I hire Acme Roofing?",
      answer: "Acme Roofing does not appear in the approved contractor directory for this community.",
      source: { title: "Approved contractor directory", text: "Beacon Roofing is an approved contractor." },
    },
    {
      question: "Can I grow Moonbeam Dragonfruit?",
      answer: "Moonbeam Dragonfruit isn't on the preapproved plant list, but that doesn't mean you can't grow it.",
      source: { title: "Preapproved plant list", text: "Boulder Raspberry is a preapproved shrub." },
    },
    {
      question: "Can I hire Acme Roofing?",
      answer: "Acme Roofing is not listed in the approved contractor directory; contact the CAB for approval guidance.",
      source: { title: "Approved contractor directory", text: "Beacon Roofing is an approved contractor." },
    },
    {
      question: "Can I hire Acme Roofing?",
      answer: "Acme Roofing doesn't appear in the approved contractor directory — the directory may not be complete.",
      source: { title: "Approved contractor directory", text: "Beacon Roofing is an approved contractor." },
    },
    {
      question: "Can I grow Moonbeam Dragonfruit?",
      answer: "The preapproved plant list doesn't specifically name Moonbeam Dragonfruit, but other species may be considered.",
      source: { title: "Preapproved plant list", text: "Boulder Raspberry is a preapproved shrub." },
    },
    {
      question: "Can I grow Moonbeam Dragonfruit?",
      answer: "Check with the DRC if Moonbeam Dragonfruit isn't on it.",
      source: { title: "Preapproved plant list", text: "Boulder Raspberry is a preapproved shrub." },
    },
    {
      question: "Can I grow Moonbeam Dragonfruit?",
      answer: "The preapproved plant list doesn't specifically name Moonbeam Dragonfruit, but that does not mean you cannot grow it. Check with the DRC if Moonbeam Dragonfruit isn't on it.",
      source: { title: "Preapproved plant list", text: "Boulder Raspberry is a preapproved shrub." },
    },
  ];

  for (const { question, answer, source } of cases) {
    assert.ok(answerCoverageIssues(question, answer, [source]).includes(unsupportedIssue), question);
  }
});

test("the semantic guard allows explicit exclusion evidence and ordinary uncertainty", () => {
  const explicit = answerCoverageIssues(
    "Can I hire Acme Roofing?",
    "The approved contractor directory does not include Acme Roofing.",
    [{
      title: "Approved contractor directory",
      text: "Acme Roofing is not included in the approved contractor directory.",
    }]
  );
  assert.ok(!explicit.includes(unsupportedIssue));

  const cautious = answerCoverageIssues(
    "Can I hire Acme Roofing?",
    "I couldn't verify whether Acme Roofing is approved. Check with the CAB before hiring.",
    [{ title: "Approved contractor directory", text: "Beacon Roofing is an approved contractor." }]
  );
  assert.ok(!cautious.includes(unsupportedIssue));

  const nonCatalog = answerCoverageIssues(
    "What is the deadline?",
    "The rule does not state a deadline.",
    [{ title: "Application rule", text: "Submit the application to the CAB." }]
  );
  assert.ok(!nonCatalog.includes(unsupportedIssue));

  const cautiousMembershipBoundary = answerCoverageIssues(
    "Can I grow Moonbeam Dragonfruit?",
    "The official source does not confirm whether Moonbeam Dragonfruit is included. Check with the DRC before planting.",
    [{ title: "Preapproved plant list", text: "Boulder Raspberry is a preapproved shrub." }]
  );
  assert.ok(!cautiousMembershipBoundary.includes(unsupportedIssue));
});

test("community answer validation rejects indirect negative catalog membership claims", () => {
  const source = {
    id: "plant-list",
    title: "Preapproved plant list",
    text: "Boulder Raspberry is a preapproved shrub.",
  };
  const verified = verifyStructuredDraft({
    directAnswer: "The rules don't specifically list Moonbeam Dragonfruit on the preapproved plant list.",
    keyDetails: [],
    nextStep: "Ask the DRC about approval.",
  }, [source], { question: "Can I plant Moonbeam Dragonfruit in my yard?" });

  assert.equal(verified.valid, false);
  assert.equal(verified.reason, "question-relevance");
  assert.ok(verified.relevanceIssues.includes(unsupportedIssue));
});
