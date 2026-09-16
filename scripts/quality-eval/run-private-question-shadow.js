"use strict";

const crypto = require("node:crypto");

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const encoded = process.argv[2];
  if (!encoded) throw new Error("Supply a base64-encoded JSON question sample, or - to read JSON from stdin.");

  const rows = JSON.parse(encoded === "-" ? await readStdin() : Buffer.from(encoded, "base64").toString("utf8"));
  if (!Array.isArray(rows) || rows.length > 100) throw new Error("Question sample must contain at most 100 rows.");
  const needFirst = process.argv.includes("--need-first");
  const summaryOnly = process.argv.includes("--summary");

  const index = require("../../data/community-index.json");
  const profile = require("../../data/communities/sterling-ranch.json");
  const { answerCommunityQuestion } = require("../../lib/community-assistant");
  const { answerRulesQuestion } = require("../../lib/rules-assistant");
  const now = new Date();

  const summary = {
    total: 0,
    outcomes: {},
    modes: {},
    proofFailures: 0,
    sourcesMissing: 0,
    unresolved: [],
  };

  for (const row of rows) {
    const question = String(row.Question || "").trim();
    if (!question) continue;
    const result = await answerCommunityQuestion(question, {
      index,
      communityId: profile.communityId,
      communityProfile: profile,
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
      now,
      isTest: true,
      ...(needFirst ? {
        requestContractMode: "need-first-candidate",
        needRouterBackend: "current-local",
      } : {}),
    });
    const output = {
      id: crypto.createHash("sha256").update(String(row.url || question)).digest("hex").slice(0, 12),
      question,
      priorAnswer: row.Answer || null,
      priorRating: row["Quality rating"] || null,
      priorIssues: row["Quality issues"] || null,
      candidateAnswer: result.answer || null,
      candidateMode: result.answerMode || null,
      candidateVerdict: result.answerVerdict || result.verdict || null,
      completionOutcome: result.completion?.outcome || null,
      proofCount: Array.isArray(result.claims) ? result.claims.filter((claim) => claim?.verified === true).length : 0,
      sourceCount: Array.isArray(result.sources) ? result.sources.length : 0,
    };

    if (!summaryOnly) {
      process.stdout.write(`${JSON.stringify(output)}\n`);
      continue;
    }

    summary.total += 1;
    const outcome = output.completionOutcome || "unknown";
    const mode = output.candidateMode || "unknown";
    summary.outcomes[outcome] = (summary.outcomes[outcome] || 0) + 1;
    summary.modes[mode] = (summary.modes[mode] || 0) + 1;
    if (output.sourceCount === 0) summary.sourcesMissing += 1;
    if (outcome === "complete" && output.proofCount === 0) summary.proofFailures += 1;
    if (outcome !== "complete") {
      summary.unresolved.push({ id: output.id, outcome, mode });
    }
  }

  if (summaryOnly) process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
