const fs = require("node:fs/promises");
const path = require("node:path");

const { answerRulesQuestion, loadRulesIndex } = require("../lib/rules-assistant");
const { groundednessIssues: sharedGroundednessIssues } = require("../lib/rules-grounding");

const CASES_PATH = path.join(__dirname, "rules-eval-cases.json");

function includesAny(text, needles = []) {
  const haystack = String(text || "").toLowerCase();
  return needles.some((needle) => haystack.includes(String(needle).toLowerCase()));
}

function sourceText(source) {
  return [
    source?.title,
    source?.nodeId,
    source?.sourceUrl,
    source?.excerpt,
  ]
    .filter(Boolean)
    .join(" ");
}

function sourceMatchesAny(sources, needles = []) {
  return sources.some((source) => includesAny(sourceText(source), needles));
}

function firstSourceMatchesAny(sources, needles = []) {
  return sources.length > 0 && includesAny(sourceText(sources[0]), needles);
}

function isRefusal(result) {
  return (
    result.confidence?.canAnswer === false ||
    /^Short answer: I couldn't find a clear rule/i.test(result.answer || "")
  );
}

function formatSources(sources) {
  if (!sources.length) return "(none)";
  return sources.map((source) => source.title || source.nodeId || "(untitled)").join(" | ");
}

async function main() {
  const raw = await fs.readFile(CASES_PATH, "utf8");
  const cases = JSON.parse(raw);
  const index = await loadRulesIndex();
  const topicDocuments = (index?.documents || []).filter((document) => document.isInlineTopic);
  const topicIds = new Set(topicDocuments.map((document) => document.nodeId));
  const requiredTopics = ["9", "37", "48", "54", "64", "89", "99"];
  const missingTopics = requiredTopics.filter(
    (number) => !topicDocuments.some((document) => new RegExp(`\\(b\\)\\(${number}\\)`).test(document.title || ""))
  );
  if (topicIds.size < 100 || missingTopics.length) {
    throw new Error(
      `Inline topic-card check failed: found ${topicIds.size}; missing required topics: ${missingTopics.join(", ") || "none"}.`
    );
  }

  const expandedCases = cases.flatMap((testCase) => {
    const questions = [
      testCase.question,
      ...(Array.isArray(testCase.variants) ? testCase.variants : []),
    ];

    return [...new Set(questions.filter(Boolean))].map((question) => ({
      ...testCase,
      question,
      primaryQuestion: testCase.question,
    }));
  });
  const failures = [];

  for (const testCase of expandedCases) {
    const result = await answerRulesQuestion(testCase.question);
    const refused = isRefusal(result);

    if (testCase.shouldRefuse) {
      if (!refused) {
        failures.push({
          question: testCase.question,
          issue: "Expected a refusal, but got an answer.",
          confidence: result.confidence,
          sources: formatSources(result.sources || []),
          answer: result.answer,
        });
        continue;
      }

      if (
        testCase.expectedReason &&
        result.confidence?.reason !== testCase.expectedReason
      ) {
        failures.push({
          question: testCase.question,
          issue: `Expected refusal reason "${testCase.expectedReason}", got "${result.confidence?.reason}".`,
          confidence: result.confidence,
          sources: formatSources(result.sources || []),
          answer: result.answer,
        });
      }
      continue;
    }

    if (refused) {
      failures.push({
        question: testCase.question,
        issue: "Expected a supported answer, but got a refusal.",
        confidence: result.confidence,
        sources: formatSources(result.sources || []),
        answer: result.answer,
      });
      continue;
    }

    if (
      testCase.expectedFirstAny &&
      !firstSourceMatchesAny(result.sources || [], testCase.expectedFirstAny)
    ) {
      failures.push({
        question: testCase.question,
        issue: `Expected first source to include one of: ${testCase.expectedFirstAny.join(", ")}`,
        confidence: result.confidence,
        sources: formatSources(result.sources || []),
        answer: result.answer,
      });
    }

    if (
      testCase.expectedAny &&
      !sourceMatchesAny(result.sources || [], testCase.expectedAny)
    ) {
      failures.push({
        question: testCase.question,
        issue: `Expected any source to include one of: ${testCase.expectedAny.join(", ")}`,
        confidence: result.confidence,
        sources: formatSources(result.sources || []),
        answer: result.answer,
      });
    }

    if (
      testCase.answerIncludesAny &&
      !includesAny(result.answer || "", testCase.answerIncludesAny)
    ) {
      failures.push({
        question: testCase.question,
        issue: `Expected answer to include one of: ${testCase.answerIncludesAny.join(", ")}`,
        confidence: result.confidence,
        sources: formatSources(result.sources || []),
        answer: result.answer,
      });
    }

    if (
      testCase.answerIncludesAll &&
      !testCase.answerIncludesAll.every((needle) =>
        includesAny(result.answer || "", [needle])
      )
    ) {
      failures.push({
        question: testCase.question,
        issue: `Expected answer to include all of: ${testCase.answerIncludesAll.join(", ")}`,
        confidence: result.confidence,
        sources: formatSources(result.sources || []),
        answer: result.answer,
      });
    }

    if (
      testCase.answerExcludesAny &&
      includesAny(result.answer || "", testCase.answerExcludesAny)
    ) {
      failures.push({
        question: testCase.question,
        issue: `Expected answer not to include any of: ${testCase.answerExcludesAny.join(", ")}`,
        confidence: result.confidence,
        sources: formatSources(result.sources || []),
        answer: result.answer,
      });
    }

    if (!testCase.skipGroundedness) {
      const grounding = sharedGroundednessIssues(result.answer || "", result.sources || []);
      if (grounding.length) {
        failures.push({
          question: testCase.question,
          issue: `Answer not grounded in cited sources — ${grounding.join("; ")}`,
          confidence: result.confidence,
          sources: formatSources(result.sources || []),
          answer: result.answer,
        });
      }
    }
  }

  if (failures.length) {
    console.error(
      "Rules assistant eval failed: " +
        failures.length +
        "/" +
        expandedCases.length +
        " question variants failed."
    );
    failures.forEach((failure, index) => {
      console.error(`\n${index + 1}. ${failure.question}`);
      console.error(`Issue: ${failure.issue}`);
      console.error(`Confidence: ${JSON.stringify(failure.confidence)}`);
      console.error(`Sources: ${failure.sources}`);
      console.error(`Answer: ${failure.answer.split("\n")[0]}`);
    });
    process.exit(1);
  }

  console.log(
    "Rules assistant eval passed: " +
      expandedCases.length +
      "/" +
      expandedCases.length +
      " question variants across " +
      cases.length +
      " rule cases and " +
      topicIds.size +
      " indexed topic cards."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
