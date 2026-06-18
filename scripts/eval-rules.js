const fs = require("node:fs/promises");
const path = require("node:path");

const { answerRulesQuestion } = require("../lib/rules-assistant");

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

// --- Groundedness check -----------------------------------------------------
// Flags answers that assert specifics — numbers, fee amounts, or section
// numbers — that do not appear in the sections actually cited with the answer.
// This catches the highest-risk hallucinations regardless of how the answer was
// produced (the built-in extractive answer or a Claude rewrite), so it gates
// both paths. Run with ANTHROPIC_API_KEY set to exercise the Claude rewrite.

function citedCorpus(sources) {
  return sources
    .map((source) => [source?.text, source?.excerpt, source?.title].filter(Boolean).join(" "))
    .join(" \n ");
}

// "Sec. 21-22", "Section 13-179", "Sec 5-182" -> ["21-22", "13-179", "5-182"]
function sectionReferences(text) {
  const matches = String(text || "").match(/\bsec(?:tion|\.)?\s*\d+[a-z]?-\d+[a-z]?\b/gi) || [];
  const refs = matches
    .map((match) => (match.match(/\d+[a-z]?-\d+[a-z]?/i) || [""])[0].toLowerCase())
    .filter(Boolean);
  return [...new Set(refs)];
}

// Standalone numbers / money / measurements, with section-number patterns removed.
function numericTokens(text) {
  const withoutSectionNumbers = String(text || "").replace(/\b\d+[a-z]?-\d+[a-z]?\b/gi, " ");
  const matches = withoutSectionNumbers.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) || [];
  return matches
    .map((token) => token.replace(/[$,%\s]/g, "").replace(/\.0+$/, ""))
    .filter(Boolean);
}

// Rule text often spells numbers out ("within seven calendar days"), while
// answers use digits ("7 days"). Convert spelled-out numbers (0-99) to digits so
// the two forms compare equal and a grounded number isn't falsely flagged.
const ONES = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

function numberWordsToDigits(text) {
  const words = String(text || "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word in TENS) {
      const unit = words[i + 1];
      if (unit && unit in ONES && ONES[unit] >= 1 && ONES[unit] <= 9) {
        out.push(String(TENS[word] + ONES[unit]));
        i += 1;
      } else {
        out.push(String(TENS[word]));
      }
    } else if (word in ONES) {
      out.push(String(ONES[word]));
    }
  }
  return out;
}

function groundednessIssues(answer, sources) {
  const corpus = citedCorpus(sources);
  const issues = [];

  const corpusNumbers = new Set([...numericTokens(corpus), ...numberWordsToDigits(corpus)]);
  const answerNumbers = new Set([...numericTokens(answer), ...numberWordsToDigits(answer)]);
  const missingNumbers = [...answerNumbers].filter((token) => !corpusNumbers.has(token));
  if (missingNumbers.length) {
    issues.push(`number(s) not in cited sections: ${missingNumbers.join(", ")}`);
  }

  const citedRefs = new Set(sectionReferences(corpus));
  const missingRefs = sectionReferences(answer).filter((ref) => !citedRefs.has(ref));
  if (missingRefs.length) {
    issues.push(`section reference(s) not among cited sources: ${missingRefs.join(", ")}`);
  }

  return issues;
}

async function main() {
  const raw = await fs.readFile(CASES_PATH, "utf8");
  const cases = JSON.parse(raw);
  const failures = [];

  for (const testCase of cases) {
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
      const grounding = groundednessIssues(result.answer || "", result.sources || []);
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
    console.error(`Rules assistant eval failed: ${failures.length}/${cases.length} cases failed.`);
    failures.forEach((failure, index) => {
      console.error(`\n${index + 1}. ${failure.question}`);
      console.error(`Issue: ${failure.issue}`);
      console.error(`Confidence: ${JSON.stringify(failure.confidence)}`);
      console.error(`Sources: ${failure.sources}`);
      console.error(`Answer: ${failure.answer.split("\n")[0]}`);
    });
    process.exit(1);
  }

  console.log(`Rules assistant eval passed: ${cases.length}/${cases.length} cases.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
