#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const inputPosition = process.argv.indexOf("--input");
const inputPath = inputPosition >= 0 ? process.argv[inputPosition + 1] : process.env.COMMUNITY_EVIDENCE_INDEX || "";
const communityIndex = inputPath ? JSON.parse(fs.readFileSync(inputPath, "utf8")) : require("../data/community-index.json");
const communityProfile = require("../data/communities/sterling-ranch.json");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const { answerRulesQuestion } = require("../lib/rules-assistant");
const { sourceReviewState } = require('../lib/community-source-answerability');

const CASES = [
  ["Can I build a shed in my backyard?", /Backyard utility sheds/i],
  ["When can I put up holiday lights?", /Updated exterior lighting policy/i],
  ["What are the landscaping and yard rules?", /Required lot landscape/i],
  ["What fees do residents pay?", /water, sanitary sewer, and stormwater/i],
  ["What are the rules for parks and open spaces?", /17-54/i],
  // v8 approves private-use information and the rental-details handoff, not
  // live availability or a completed booking. Require exact scoped evidence.
  ["How do I reserve the Overlook Clubhouse?", /Rent the Facility/i, true, {
    sourceUrl: 'https://sterlingranchcab.com/269/Rent-the-Facility',
    requiredClaims: ['complete-cab-review-20260914-97b97fbb46ee-operations-great-hall-features'],
    actionUrl: 'https://sterlingranchcab.com/269/Rent-the-Facility',
  }],
  ["Who do I contact about water billing?", /Water Billing/i],
  // v7 approves current public-court operations, not private construction,
  // live availability, launch history, account setup, or booking outcomes.
  ["What are the neighborhood pickleball court rules?", /Pickleball Courts/i, true, {
    sourceUrl: 'https://sterlingranchcab.com/418/Pickleball-Courts',
    requiredClaims: ['pickleball-general-hours', 'pickleball-play-modes-daily-limit'],
    actionUrl: 'https://sterlingranchcab.com/420/Court-Reserve',
  }],
  ["What is the maximum height a freestanding flag pole can be?", /2024 CAB Code amendments/i],
  ["What trees can we plant?", /5-131|Preapproved plant list/i],
  ["What are the rules for yard art?", /2024 CAB Code amendments/i],
  ["When am I allowed to water my lawn?", /13-105|Water conservation measures/i],
  ["What approval and setbacks apply to a backyard spa?", /Hot tubs, outdoor spas/i],
  ["Can I have chickens?", /1-33|Pets and livestock/i],
  ["Dogs?", /1-33|Pets and livestock/i],
  ["Can I park on the street?", /1-37|Vehicles; parking/i],
  ["Can I build a greenhouse?", /Greenhouses/i],
  ["What day is trash pickup?", /Trash & Recycling/i],
  ["Who do I contact about internet service?", /Internet Service/i, false, {
    sourceUrl: 'https://sterlingranchcab.com/242/Internet-Service',
    answerMode: 'community-contact-boundary', reason: 'missing-requested-contact-info',
    contactMustRemainMissing: true,
  }],
  ["What email do I use for design review questions?", /Design Review contact and submission/i],
];

function retrievalCaseIssues(answer, testCase, index, now = Date.now()) {
  const [, expected, expectedCanAnswer = true, evidence = {}] = testCase;
  const issues = [];
  const firstSource = answer.sources?.[0];
  if (!expected.test(firstSource?.title || '')) issues.push('wrong-controlling-source');
  if (answer.confidence?.canAnswer !== expectedCanAnswer) issues.push('wrong-answerability');
  if (!expectedCanAnswer && (answer.answerMode !== (evidence.answerMode || 'community-freshness-withheld')
    || answer.confidence?.reason !== (evidence.reason || 'source-review-required'))) issues.push('wrong-withholding-boundary');
  if (evidence.sourceUrl && firstSource?.sourceUrl !== evidence.sourceUrl) issues.push('wrong-source-identity');
  if (evidence.requiredClaims) {
    const source = index.sources.find(source => source.id === firstSource?.id
      && source.sourceUrl === evidence.sourceUrl && source.contentHash === firstSource?.contentHash);
    const entries = source ? sourceReviewState(index, now).entriesFor(source) : [];
    const allowed = new Set(entries.map(entry => entry.approvalClaim).filter(Boolean));
    const claims = answer.claims || [];
    const selected = claims.flatMap(claim => claim.approvalClaimIds || []);
    if (!source || !entries.length || claims.some(claim => !claim.verified || !claim.approvalClaimIds?.length
      || !claim.evidenceSourceIds?.includes(source.id))
      || selected.some(id => !allowed.has(id))
      || evidence.requiredClaims.some(id => !allowed.has(id) || !selected.includes(id))) issues.push('missing-exact-approved-claims');
    const action = (answer.actions || []).find(action => action.url === evidence.actionUrl);
    if (!action || !entries.some(entry => entry.factType === 'link' && entry.normalizedValue === action.url
      && entry.approvalClaim === action.approvalClaim)
      || (answer.actions || []).some(action => action.url !== evidence.actionUrl)) issues.push('missing-exact-approved-action');
    if ((answer.sources || []).some(item => item.sourceUrl !== evidence.sourceUrl)) issues.push('unrelated-source-claim');
    if (/\b(?:available now|booking confirmed|reservation confirmed|your booking is confirmed)\b/i.test(answer.answer || '')) issues.push('unsupported-live-outcome');
  }
  if (evidence.contactMustRemainMissing) {
    const text = answer.answer || '';
    if ((answer.claims || []).length || (answer.sources || []).some(source => (source.facts || []).length)
      || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{3}[-.\s)]\s*\d{3}[-.\s]\d{4}\b/i.test(text)) issues.push('unsupported-contact');
    if (!(answer.actions || []).length || (answer.actions || []).some(action => action.url !== evidence.sourceUrl)
      || (answer.sources || []).some(source => source.sourceUrl !== evidence.sourceUrl)) issues.push('unrelated-contact-handoff');
  }
  return issues;
}

async function main() {
  let passed = 0;
  const failures = [];
  for (const testCase of CASES) {
    const [question, expected, expectedCanAnswer = true] = testCase;
    const answer = await answerCommunityQuestion(question, {
      index: communityIndex,
      communityId: "sterling-ranch",
      communityProfile,
      isTest: true,
      answerRulesQuestion,
      rulesOptions: { searchMode: "legacy", llmMode: "off" },
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
    });
    const firstSource = answer.sources?.[0]?.title || "";
    const issues = retrievalCaseIssues(answer, testCase, communityIndex);
    if (!issues.length) passed += 1;
    else failures.push({ question, expected: String(expected), expectedCanAnswer, firstSource, reason: answer.confidence?.reason, issues });
  }
  const recall = passed / CASES.length;
  console.log(`Community controlling-source retrieval: ${passed}/${CASES.length} (${Math.round(recall * 100)}%).`);
  const outputPosition = process.argv.indexOf("--output");
  const outputPath = outputPosition >= 0 ? process.argv[outputPosition + 1] : process.env.COMMUNITY_EVIDENCE_REPORT_DIR
    ? path.join(process.env.COMMUNITY_EVIDENCE_REPORT_DIR, "community-retrieval-report.json")
    : path.join(__dirname, '../data/community-retrieval-report.json');
  fs.writeFileSync(outputPath, JSON.stringify({checkedAt:new Date().toISOString(),passed,total:CASES.length,failures},null,2)+'\n');
  if (recall < 1) {
    for (const failure of failures) console.error(JSON.stringify(failure));
    throw new Error("Every critical question must use its controlling source before release.");
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { CASES, retrievalCaseIssues };
