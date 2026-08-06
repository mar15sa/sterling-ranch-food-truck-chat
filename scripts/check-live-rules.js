const DEFAULT_BASE_URL =
  "https://sterling-ranch-food-truck-chat-production.up.railway.app";
const BASE_URL = String(process.env.RULES_LIVE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = Number(process.env.RULES_LIVE_TIMEOUT_MS) || 25000;

const CHECKS = [
  {
    question: "What is the rule on privacy screens in your backyard?",
    firstSourceIncludes: "(b)(54) - Landscape screens",
    answerIncludes: ["DRC approval", "30 percent"],
  },
  {
    question: "Are rooftop solar panels subject to design review?",
    firstSourceIncludes: "(b)(89) - Solar energy devices and systems",
    answerIncludes: ["DRC approval"],
  },
  {
    question: "When am I allowed to water my lawn?",
    firstSourceIncludes: "Sec. 13-105",
    answerIncludes: ["10:00", "6:00", "May 1", "September 30"],
  },
  {
    question: "What approval and setbacks apply to a backyard spa?",
    firstSourceIncludes: "(b)(48) - Hot tubs, outdoor spas, outdoor saunas",
    answerIncludes: ["DRC approval", "five feet"],
  },
];

function includesAll(text, values) {
  const haystack = String(text || "").toLowerCase();
  return values.every((value) => haystack.includes(String(value).toLowerCase()));
}

async function askLive(question) {
  const response = await fetch(`${BASE_URL}/api/rules/ask`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "SterlingRanchRulesQualityMonitor/1.0",
    },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body.error || "request failed"}`);
  }
  return body;
}

async function main() {
  const failures = [];

  for (const check of CHECKS) {
    try {
      const result = await askLive(check.question);
      const firstSource = result.sources?.[0]?.title || "";
      const issues = [];

      if (result.confidence?.canAnswer !== true || result.confidence?.confidence !== "high") {
        issues.push(`expected a high-confidence answer, got ${JSON.stringify(result.confidence)}`);
      }
      if (!firstSource.includes(check.firstSourceIncludes)) {
        issues.push(`expected first source containing "${check.firstSourceIncludes}", got "${firstSource}"`);
      }
      if (!includesAll(result.answer, check.answerIncludes)) {
        issues.push(`answer is missing: ${check.answerIncludes.filter((value) => !includesAll(result.answer, [value])).join(", ")}`);
      }
      if ((result.sourceStatus?.inlineTopicCount || 0) < 100) {
        issues.push(`expected at least 100 indexed topic cards, got ${result.sourceStatus?.inlineTopicCount || 0}`);
      }

      if (issues.length) {
        failures.push({ question: check.question, issues });
      } else {
        console.log(`PASS: ${check.question}`);
      }
    } catch (error) {
      failures.push({
        question: check.question,
        issues: [error && error.message ? error.message : String(error)],
      });
    }
  }

  if (failures.length) {
    console.error(`Live rules quality monitor failed: ${failures.length}/${CHECKS.length} checks failed.`);
    for (const failure of failures) {
      console.error(`\n${failure.question}`);
      failure.issues.forEach((issue) => console.error(`- ${issue}`));
    }
    process.exit(1);
  }

  console.log(`Live rules quality monitor passed: ${CHECKS.length}/${CHECKS.length} checks.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});