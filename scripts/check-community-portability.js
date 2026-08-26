#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { crawlCommunity } = require("../lib/community-ingest");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { validateCommunityProfile } = require("../lib/community-contracts");

const root = path.join(__dirname, "..");
const profilePath = path.join(root, "data", "communities", "castle-rock.json");
const proofPath = path.join(root, "data", "portability-proof.json");

async function main() {
  const profile = validateCommunityProfile(JSON.parse(fs.readFileSync(profilePath, "utf8")));
  const previous = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  const index = await crawlCommunity(profile);
  const allowedHosts = new Set(profile.allowedHosts.map((host) => host.replace(/^www\./i, "").toLowerCase()));
  const answers = [];

  for (const sample of previous.sampleQuestions || []) {
    const result = await answerCommunityQuestion(sample.question, {
      index,
      communityId: profile.communityId,
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
    });
    const officialSources = (result.sources || []).filter((source) => {
      try { return allowedHosts.has(new URL(source.sourceUrl).hostname.replace(/^www\./i, "").toLowerCase()); }
      catch { return false; }
    });
    const expectedSourceFound = officialSources.some((source) => String(source.title || "").toLowerCase().includes(sample.topOfficialSource.toLowerCase()));
    if (!result.confidence?.canAnswer) throw new Error(`Could not answer second-community question: ${sample.question}`);
    if (!officialSources.length) throw new Error(`No tenant-approved official source supported: ${sample.question}`);
    if (!expectedSourceFound) throw new Error(`Expected official source “${sample.topOfficialSource}” was not retrieved for: ${sample.question}`);
    answers.push({
      question: sample.question,
      answer: result.answer,
      answerMode: result.answerMode,
      topOfficialSource: officialSources[0].title,
      sourceUrls: officialSources.map((source) => source.sourceUrl),
      actionUrls: (result.actions || []).map((action) => action.url).filter(Boolean),
    });
  }

  const report = {
    checkedAt: new Date().toISOString(),
    result: "passed",
    communityId: profile.communityId,
    communityName: profile.name,
    platform: profile.platform,
    configurationOnly: true,
    coreCodeChangesRequired: 0,
    livePagesChecked: index.pageCount,
    normalizedSourceRecords: index.sourceCount,
    sourceFailures: index.failureCount,
    sourceTypesFound: [...new Set(index.sources.map((source) => source.sourceType))].sort(),
    sampleQuestions: (previous.sampleQuestions || []).map((sample) => ({ ...sample })),
    endToEndAnswers: answers,
  };
  if (process.argv.includes("--write")) fs.writeFileSync(proofPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Community portability check passed: ${answers.length} end-to-end answers from ${index.sourceCount} sources across ${index.pageCount} live pages.`);
}

main().catch((error) => {
  console.error(`Community portability check failed: ${error.message}`);
  process.exitCode = 1;
});
