#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const residentQuestions = require("./resident-rules-corpus.json");
const authoredCases = require("./rules-eval-cases.json");
const unseenCases = require("./rules-unseen-eval-cases.json");
const { score } = require("./eval-community-assistant");

const expectationByQuestion = new Map();
for (const item of authoredCases) {
  for (const question of [item.question, ...(item.variants || [])]) {
    expectationByQuestion.set(String(question).toLowerCase().trim(), item);
  }
}
for (const item of unseenCases) {
  expectationByQuestion.set(String(item.question).toLowerCase().trim(), item);
}

const baseUrl = String(process.env.COMMUNITY_ANSWERS_BASE_URL || "https://sterling-ranch-food-truck-chat-staging.up.railway.app").replace(/\/$/, "");
const delayMs = Math.max(0, Number(process.env.COMMUNITY_ANSWERS_DELAY_MS || 2100));
const reportPath = path.join(__dirname, "..", "data", "community-answers-live-report.json");
const questions = [...new Set([
  ...residentQuestions,
  ...authoredCases.flatMap((item) => [item.question, ...(item.variants || [])]),
  ...unseenCases.map((item) => item.question),
  "What events are going on tomorrow?",
  "Anything fun happening in the community this weekend?",
  "Are there kid-friendly events tomorrow?",
  "How much is the Great Hall and how do I reserve it?",
  "Yo, is the pool open rn?",
  "Whens recyling pickup next?",
].map((question) => String(question).trim()).filter(Boolean))];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function ask(question) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}/api/community/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Sterling-Ranch-Live-Answer-Eval/1.0" },
    body: JSON.stringify({ question, isTest: true }),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 429) {
    await sleep(Math.max(1000, Number(response.headers.get("retry-after") || 1) * 1000));
    return ask(question);
  }
  const answer = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${answer.error || "request failed"}`);
  return { answer, durationMs: Date.now() - started };
}

async function main() {
  const rows = [];
  for (const question of questions) {
    const { answer, durationMs } = await ask(question);
    const assessment = score(question, answer, {
      expectation: expectationByQuestion.get(question.toLowerCase().trim()),
    });
    const unsupportedClaims = (answer.claims || []).filter((claim) => !claim.verified).length;
    const issues = [...assessment.issues];
    if (!answer.answerId) issues.push("answer-id-missing");
    if (unsupportedClaims) issues.push("unsupported-claim");
    if (durationMs > 15000) issues.push("request-over-15-seconds");
    rows.push({
      questionFingerprint: require("node:crypto").createHash("sha256").update(question.toLowerCase()).digest("hex").slice(0, 16),
      score: assessment.score,
      rating: assessment.rating,
      issues: [...new Set(issues)],
      answerMode: answer.answerMode,
      answerStatus: answer.answerStatus,
      sourceCount: answer.sources?.length || 0,
      unsupportedClaims,
      durationMs,
    });
    if (delayMs) await sleep(delayMs);
  }
  const failures = rows.filter((row) => row.score < 4 || row.issues.length || row.unsupportedClaims);
  const sortedDurations = rows.map((row) => row.durationMs).sort((a, b) => a - b);
  const p95DurationMs = sortedDurations[Math.min(sortedDurations.length - 1, Math.ceil(sortedDurations.length * 0.95) - 1)] || 0;
  const report = { generatedAt: new Date().toISOString(), baseUrl, questionCount: rows.length, failureCount: failures.length, p95DurationMs, rows };
  if (process.argv.includes("--write")) fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Live Community Assistant audit: ${rows.length} questions, ${failures.length} failures, p95 ${p95DurationMs}ms.`);
  failures.slice(0, 30).forEach((row) => console.error(JSON.stringify(row)));
  if (process.argv.includes("--enforce") && failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
