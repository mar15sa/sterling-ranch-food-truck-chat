"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function readStdin(sentinel = null) {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
      if (!sentinel) return;
      const markerIndex = input.indexOf(sentinel);
      if (markerIndex === -1) return;
      process.stdin.pause();
      resolve(input.slice(0, markerIndex));
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const encoded = process.argv[2];
  if (!encoded) throw new Error("Supply a base64-encoded JSON question sample, or - to read JSON from stdin.");

  const stdinSentinel = process.argv.includes("--stdin-sentinel")
    ? "__CODEX_PRIVATE_ROWS_END_7F4C2A91__"
    : null;
  const rows = JSON.parse(encoded === "-" ? await readStdin(stdinSentinel) : Buffer.from(encoded, "base64").toString("utf8"));
  if (!Array.isArray(rows) || rows.length > 100) throw new Error("Question sample must contain at most 100 rows.");
  const needFirst = process.argv.includes("--need-first");
  const summaryOnly = process.argv.includes("--summary");
  const useQualityRubric = process.argv.includes("--quality-rubric");
  const summaryFileArg = process.argv.find((arg) => arg.startsWith("--summary-file="));

  const index = require("../../data/community-index.json");
  const profile = require("../../data/communities/sterling-ranch.json");
  const { answerCommunityQuestion } = require("../../lib/community-assistant");
  const { answerRulesQuestion } = require("../../lib/rules-assistant");
  const { assessCommunityAnswerQuality } = require("../../lib/community-quality-rubric");
  const fallbackNow = new Date();

  const summary = {
    total: 0,
    outcomes: {},
    modes: {},
    ratings: {},
    residentEffort: {},
    proofFailures: 0,
    sourcesMissing: 0,
    qualityIssues: {},
    missingDetails: {},
    unresolvedTasks: {},
    unresolvedGoals: {},
    ratingTransitions: {},
    dimensionValues: {},
    unresolved: [],
  };

  for (const row of rows) {
    const question = String(row.Question || "").trim();
    if (!question) continue;
    const rowNow = row.askedAt ? new Date(row.askedAt) : fallbackNow;
    const now = Number.isNaN(rowNow.getTime()) ? fallbackNow : rowNow;
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
    if (useQualityRubric) output.candidateQuality = assessCommunityAnswerQuality(question, result);

    if (!summaryOnly) {
      process.stdout.write(`${JSON.stringify(output)}\n`);
      continue;
    }

    summary.total += 1;
    const outcome = output.completionOutcome || "unknown";
    const mode = output.candidateMode || "unknown";
    summary.outcomes[outcome] = (summary.outcomes[outcome] || 0) + 1;
    summary.modes[mode] = (summary.modes[mode] || 0) + 1;
    if (output.candidateQuality?.rating) {
      const rating = output.candidateQuality.rating;
      const effort = output.candidateQuality.residentEffort;
      summary.ratings[rating] = (summary.ratings[rating] || 0) + 1;
      summary.residentEffort[effort] = (summary.residentEffort[effort] || 0) + 1;
      const transition = `${output.priorRating || "Not rated"} -> ${rating}`;
      summary.ratingTransitions[transition] = (summary.ratingTransitions[transition] || 0) + 1;
      for (const issue of output.candidateQuality.issues || []) {
        summary.qualityIssues[issue] = (summary.qualityIssues[issue] || 0) + 1;
      }
      for (const [dimension, value] of Object.entries(output.candidateQuality.dimensions || {})) {
        summary.dimensionValues[dimension] ||= { 0: 0, 1: 0, 2: 0 };
        summary.dimensionValues[dimension][value.value] = (summary.dimensionValues[dimension][value.value] || 0) + 1;
      }
    }
    if (output.sourceCount === 0) summary.sourcesMissing += 1;
    if (outcome === "complete" && output.proofCount === 0) summary.proofFailures += 1;
    if (outcome !== "complete") {
      const contractNeeds = result._requestContract?.needs || [];
      const completionNeeds = result.completion?.needs || [];
      const tasks = [...new Set(contractNeeds.map((need) => need.task).filter(Boolean))];
      const goals = [...new Set(contractNeeds.map((need) => need.goal).filter(Boolean))];
      const requestedDetails = [...new Set(contractNeeds.flatMap((need) => need.requestedDetails || []))];
      const missingDetails = [...new Set(completionNeeds.flatMap((need) => need.missingDetails || []))];
      for (const task of tasks) summary.unresolvedTasks[task] = (summary.unresolvedTasks[task] || 0) + 1;
      for (const goal of goals) summary.unresolvedGoals[goal] = (summary.unresolvedGoals[goal] || 0) + 1;
      for (const detail of missingDetails) summary.missingDetails[detail] = (summary.missingDetails[detail] || 0) + 1;
      summary.unresolved.push({
        id: output.id,
        outcome,
        mode,
        rating: output.candidateQuality?.rating || null,
        priorRating: output.priorRating,
        tasks,
        goals,
        requestedDetails,
        missingDetails,
        sourceCount: output.sourceCount,
      });
    }
  }

  if (summaryOnly) {
    const serialized = `${JSON.stringify(summary)}\n`;
    if (summaryFileArg) {
      const outputPath = path.resolve(summaryFileArg.slice("--summary-file=".length));
      const workingDirectory = `${path.resolve(process.cwd())}${path.sep}`;
      if (!outputPath.startsWith(workingDirectory)) throw new Error("Summary file must stay inside the working directory.");
      fs.writeFileSync(outputPath, serialized, "utf8");
    } else {
      process.stdout.write(serialized);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
