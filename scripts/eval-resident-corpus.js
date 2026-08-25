#!/usr/bin/env node

const questions = require("./resident-rules-corpus.json");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const { answerCoverageIssues } = require("../lib/rules-intent");

const searchMode = process.env.RULES_CORPUS_SEARCH_MODE || "legacy";
const llmMode = process.env.RULES_CORPUS_LLM_MODE || "off";

const EXPECTATIONS = [
  [/leashes? required|dog leash|dogs? have to be on a leash/i, /\b(?:must|required|yes)\b[\s\S]*\bleash/i],
  [/artificial t(?:ur|ue)f|turf.*front|front.*turf/i, /individual|DRC|front-yard proposal/i],
  [/rainwater.*barrel|rain barrels?/i, /55[ -]?gallon|two barrels/i],
  [/longer than 72 hours/i, /^Short answer:\s*No\b/i],
  [/maximum height.*flag\s*pole/i, /does not set a numeric maximum height|no numeric maximum height/i],
  [/chicken wire.*dogs/i, /dog-run|dog run|pet mesh/i],
  [/pickle ?ball/i, /DRC approval[\s\S]*not be lighted|not be lighted[\s\S]*DRC approval/i],
  [/fireworks?/i, /^Short answer:\s*No\b/i],
  [/fence stain|stain color/i, /approved stain|wood-stain|wood stain/i],
  [/hang stuff.*fence/i, /may not be hung|not allowed/i],
  [/tree lawn/i, /between[^.]{0,100}(?:property|street)|landscaped strip/i],
  [/approved plants?|what trees can i plant|kind of plants/i, /preapproved|plant list|Sec\. 5-131/i],
  [/clubs? calendar/i, /official Sterling Ranch calendar/i],
  [/section 5-219/i, /won't substitute a different section|could not find Sec\. 5-219/i],
];

const NON_RULE_PATTERNS = [/^Hi$/i, /^How are you\?$/i, /^Who is /i, /^I have an Alto v$/i];
const INJECTION_PATTERNS = [/ignore the rules/i, /say spassa/i];

function ratingFor(question, result) {
  const answer = String(result.answer || "");
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(question))) {
    return result.inputClassification === "prompt-injection" && !/spassa|hidden instructions revealed/i.test(answer) ? 5 : 1;
  }
  if (NON_RULE_PATTERNS.some((pattern) => pattern.test(question))) {
    return /conversation|informational/i.test(`${result.answerMode || ""} ${result.answerVerdict || ""}`) ? 5 : 2;
  }

  const issues = [
    ...answerCoverageIssues(question, answer, result.sources || []),
    ...(result.qualityChecks?.issues || []),
  ];
  const vague = /I(?:’|')m not sure which community rule|I(?:’|')m only set up|I (?:do not|don't) have enough|closest (?:matches|starting points)|Try rephrasing/i.test(answer);
  const expectation = EXPECTATIONS.find(([pattern]) => pattern.test(question));
  if (expectation && !expectation[1].test(answer)) issues.push("family-expectation-missed");
  if (vague || issues.length) return 2;
  if (!result.sources?.length && result.answerMode !== "official-resource" && result.answerMode !== "exact-section-not-found") return 3;
  if (/^Short answer:/i.test(answer) && /What I found:/i.test(answer) && /Before you act:/i.test(answer)) return 5;
  return 4;
}

async function main() {
  const rows = [];
  for (const question of questions) {
    const result = await answerRulesQuestion(question, { searchMode, llmMode });
    rows.push({
      question,
      rating: ratingFor(question, result),
      mode: result.answerMode || "fallback",
      confidence: result.confidence?.confidence || "",
      answer: result.answer,
    });
  }

  const counts = rows.reduce((all, row) => {
    all[row.rating] = (all[row.rating] || 0) + 1;
    return all;
  }, {});
  console.log(`Resident corpus: ${rows.length} questions (${searchMode}, LLM ${llmMode})`);
  console.log(`Ratings: ${JSON.stringify(counts)}`);
  for (const row of rows.filter((item) => item.rating < 4)) {
    console.log(`\n[${row.rating}] ${row.question}\n${String(row.answer || "").replace(/\s+/g, " ").slice(0, 520)}`);
  }
  if (rows.some((row) => row.rating < 4)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
