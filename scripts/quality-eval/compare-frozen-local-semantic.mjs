import fs from "node:fs";
import path from "node:path";
import { createCommunitySemanticRanker } from "./community-semantic-ranker.mjs";
import { createSemanticRanker } from "./semantic-ranker.mjs";
import corpusTools from "./semantic-corpus.js";
import rules from "../../lib/rules-assistant.js";

const fixture = JSON.parse(fs.readFileSync("scripts/community-frozen-unseen-v1.json", "utf8"));
const communityIndex = JSON.parse(fs.readFileSync("data/community-index.json", "utf8"));
const profile = JSON.parse(fs.readFileSync("data/communities/sterling-ranch.json", "utf8"));
const rulesIndex = await rules.loadRulesIndex();
const expected = {
  utilities: /water.{0,40}(?:pay|bill)|utility.?hawk|payment/i,
  "design-process": /shed|utility structure/i,
  "short-term-home-rental": /short.?term|vacation|vrbo|home rental/i,
  "rv-duration": /recreational vehicle|motor home|\brv\b/i,
  "watering-time": /irrigat|watering/i,
  "fence-height": /fence/i,
  "trash-timing": /trash|garbage|container|cart/i,
};
const cases = fixture.cases.filter((item) => expected[item.family]);
const output = path.resolve("artifacts/quality-eval/frozen-local-semantic-20260916");
fs.mkdirSync(output, { recursive: true });
let communityRanker;
let ruleRanker;
const rows = [];
const initializedAt = Date.now();
try {
  communityRanker = await createCommunitySemanticRanker({
    directory: path.resolve("artifacts/quality-eval/community-action-proof-20260915"),
    communityId: profile.communityId,
    index: communityIndex,
  });
  const documents = corpusTools.eligibleCorpus(rulesIndex, profile.communityId, Date.now());
  const scopedRulesIndex = { ...rulesIndex, documents };
  ruleRanker = await createSemanticRanker({
    directory: path.resolve("artifacts/quality-eval/semantic-identity-recapture-20260914"),
    documents,
    communityId: profile.communityId,
  });
  const initializationMs = Date.now() - initializedAt;
  for (const item of cases) {
    const started = Date.now();
    const [community, governing] = await Promise.all([
      communityRanker.search(communityIndex, item.question, 5),
      ruleRanker.search(scopedRulesIndex, item.question, 5, { now: Date.now(), eligibilityQuestion: item.question, method: "hybrid" }),
    ]);
    const candidates = [...community.map((source) => ({ lane: "community", id: source.id, title: source.title, text: source.text })),
      ...governing.map((source) => ({ lane: "governing", id: source.id, title: source.title, text: source.text }))];
    const matching = candidates.filter((source) => expected[item.family].test(`${source.title || ""} ${source.text || ""}`));
    rows.push({ id: item.id, family: item.family, question: item.question, hitAt10: matching.length > 0,
      matching: matching.map(({ lane, id, title }) => ({ lane, id, title })),
      top: candidates.map(({ lane, id, title }) => ({ lane, id, title })), elapsedMs: Date.now() - started });
  }
  const hits = rows.filter((row) => row.hitAt10).length;
  const report = {
    schemaVersion: 1, isTest: true, frozenCasesSha256: fixture.casesSha256,
    status: "completed-local-semantic-source-recall-diagnostic", cases: rows.length, hits, recallAt10: hits / rows.length,
    initializationMs, medianQueryMs: [...rows].sort((a, b) => a.elapsedMs - b.elapsedMs)[Math.floor(rows.length / 2)]?.elapsedMs || 0,
    paidApiCalls: 0, newSubscriptions: 0, productionHostingCostUsd: null, rows,
    limitations: [
      "This checks whether a relevant source family appears in five community plus five governing results; it does not prove the final answer.",
      "The frozen phrasings were already revealed before this diagnostic, so it is development evidence rather than a blind acceptance score.",
      "The local model and cached vectors avoid API charges but require measured production memory, startup, and hosting work before adoption.",
    ],
  };
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, rows: rows.map(({ top, ...row }) => row) }, null, 2));
} finally {
  await ruleRanker?.dispose();
  await communityRanker?.dispose();
}
