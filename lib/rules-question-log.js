const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const MAX_NOTION_RICH_TEXT_CHARS = 2000;
const MAX_LOG_ANSWER_CHARS = 12000;
const QUESTION_LOG_TIME_ZONE = "America/Denver";
const { scoreCommunityAnswer } = require("./community-answer-quality");

let dataSourcePromise = null;
let schemaPromise = null;

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function propertyNames() {
  return {
    question: env("RULES_QUESTION_NOTION_TITLE_PROPERTY", "Question"),
    askedAt: env("RULES_QUESTION_NOTION_ASKED_AT_PROPERTY", "Asked at"),
    answerMode: env("RULES_QUESTION_NOTION_ANSWER_MODE_PROPERTY", "Answer mode"),
    canAnswer: env("RULES_QUESTION_NOTION_CAN_ANSWER_PROPERTY", "Can answer"),
    sourceCount: env("RULES_QUESTION_NOTION_SOURCE_COUNT_PROPERTY", "Source count"),
    answer: env("RULES_QUESTION_NOTION_ANSWER_PROPERTY", "Answer"),
    reviewStatus: env("RULES_QUESTION_NOTION_REVIEW_STATUS_PROPERTY", "Review status"),
    testing: env("RULES_QUESTION_NOTION_TESTING_PROPERTY", "Testing"),
    confidenceReason: env("RULES_QUESTION_NOTION_CONFIDENCE_REASON_PROPERTY", "Confidence reason"),
    answerVerdict: env("RULES_QUESTION_NOTION_ANSWER_VERDICT_PROPERTY", "Answer verdict"),
    topSource: env("RULES_QUESTION_NOTION_TOP_SOURCE_PROPERTY", "Top source"),
    qualityRating: env("RULES_QUESTION_NOTION_QUALITY_RATING_PROPERTY", "Quality rating"),
    qualityScore: env("RULES_QUESTION_NOTION_QUALITY_SCORE_PROPERTY", "Quality score"),
    qualityIssues: env("RULES_QUESTION_NOTION_QUALITY_ISSUES_PROPERTY", "Quality issues"),
    residentEffort: env("RULES_QUESTION_NOTION_RESIDENT_EFFORT_PROPERTY", "Resident effort"),
    residentEffortScore: env("RULES_QUESTION_NOTION_RESIDENT_EFFORT_SCORE_PROPERTY", "Resident effort score"),
  };
}

function redactSensitiveText(value, maxChars) {
  return String(value || "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{5,}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function cleanQuestionForLog(question) {
  return redactSensitiveText(question, 500);
}

function cleanAnswerForLog(answer) {
  return String(answer || "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{5,}\b/g, "[number]")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_LOG_ANSWER_CHARS);
}

function deriveReviewStatus(answer = {}) {
  const classification = String(answer.inputClassification || "rules-question");
  const answerStatus = String(answer.answerStatus || "");
  if (
    answer.answerMode === "safety" ||
    answerStatus === "safety-rejected" ||
    classification === "prompt-injection"
  ) {
    return "Safety response";
  }
  if (classification === "unclear") return "Clarification";
  if (["conversation", "unrelated"].includes(classification)) return "Out of scope";
  const needsReview =
    answer.reviewNeeded === true ||
    (answer?.confidence?.canAnswer !== true && answer.reviewNeeded !== false);
  return needsReview ? "Needs review" : "Answered";
}

function buildQuestionLogEntry(question, answer = {}, options = {}) {
  const topSource = Array.isArray(answer.sources) ? answer.sources[0] : null;
  const reviewStatus = deriveReviewStatus(answer);
  const quality = scoreCommunityAnswer(question, answer);
  return {
    question: cleanQuestionForLog(question),
    answer: cleanAnswerForLog(answer.answer || answer.directAnswer || ""),
    askedAt: options.askedAt || new Date().toISOString(),
    answerMode: String(answer.answerMode || "deterministic").slice(0, 200),
    answerVerdict: String(answer.answerVerdict || answer.answerStatus || "").slice(0, 200),
    inputClassification: String(answer.inputClassification || "rules-question").slice(0, 200),
    canAnswer: Boolean(answer?.confidence?.canAnswer),
    confidence: String(answer?.confidence?.confidence || "none").slice(0, 100),
    confidenceReason: cleanAnswerForLog(answer?.confidence?.reason || "").slice(0, 1000),
    reviewStatus,
    reviewNeeded: reviewStatus === "Needs review",
    isTest: options.isTest === true,
    sourceCount: Array.isArray(answer.sources) ? answer.sources.length : 0,
    topSourceTitle: String(topSource?.title || "").slice(0, 300),
    topSourceUrl: String(topSource?.sourceUrl || "").slice(0, 1000),
    qualityRating: quality.rating,
    qualityScore: quality.score,
    qualityIssues: quality.issues.join(", "),
    residentEffort: quality.residentEffort.rating,
    residentEffortScore: quality.residentEffort.score,
  };
}

function richText(value) {
  const text = String(value || "");
  if (!text) return [];
  const chunks = [];
  for (let index = 0; index < text.length && chunks.length < 100; index += MAX_NOTION_RICH_TEXT_CHARS) {
    chunks.push({ type: "text", text: { content: text.slice(index, index + MAX_NOTION_RICH_TEXT_CHARS) } });
  }
  return chunks;
}

function notionProperties(entry, names = propertyNames()) {
  return {
    [names.question]: { title: richText(entry.question || "Question") },
    [names.askedAt]: { date: { start: entry.askedAt } },
    [names.answerMode]: { rich_text: richText(entry.answerMode || "deterministic") },
    [names.canAnswer]: { checkbox: Boolean(entry.canAnswer) },
    [names.sourceCount]: { number: entry.sourceCount || 0 },
    [names.answer]: { rich_text: richText(entry.answer) },
    [names.reviewStatus]: { select: { name: entry.reviewStatus || "Answered" } },
    [names.testing]: { checkbox: Boolean(entry.isTest) },
    [names.confidenceReason]: { rich_text: richText(entry.confidenceReason) },
    [names.answerVerdict]: { rich_text: richText(entry.answerVerdict) },
    [names.topSource]: entry.topSourceUrl ? { url: entry.topSourceUrl } : { url: null },
    [names.qualityRating]: { select: { name: entry.qualityRating || "Not rated" } },
    [names.qualityScore]: { number: Number(entry.qualityScore) || 0 },
    [names.qualityIssues]: { rich_text: richText(entry.qualityIssues) },
    [names.residentEffort]: { select: { name: entry.residentEffort || "Not rated" } },
    [names.residentEffortScore]: { number: Number(entry.residentEffortScore) || 0 },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notionRequest(path, options = {}, fetchImpl = globalThis.fetch) {
  const token = env("RULES_QUESTION_NOTION_TOKEN", env("NOTION_API_KEY"));
  if (!token || typeof fetchImpl !== "function") return null;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchImpl(`${NOTION_API_URL}${path}`, {
        ...options,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "notion-version": NOTION_VERSION,
          ...(options.headers || {}),
        },
      });
      if (response.ok) return response.status === 204 ? {} : response.json();
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 2) {
        throw new Error(`Notion question log request failed: HTTP ${response.status}`);
      }
      const retryAfter = Number(response.headers?.get?.("retry-after")) || 0;
      await sleep(Math.max(retryAfter * 1000, 200 * (attempt + 1)));
    } catch (error) {
      lastError = error;
      if (attempt === 2 || /HTTP 4\d\d/.test(error.message || "")) throw error;
      await sleep(200 * (attempt + 1));
    }
  }
  throw lastError || new Error("Notion question log request failed.");
}

async function resolveNotionDataSourceId(fetchImpl = globalThis.fetch) {
  const configured = env("RULES_QUESTION_NOTION_DATA_SOURCE_ID");
  if (configured) return configured;
  const databaseId = env("RULES_QUESTION_NOTION_DATABASE_ID");
  if (!databaseId) return "";
  if (!dataSourcePromise) {
    dataSourcePromise = notionRequest(`/databases/${encodeURIComponent(databaseId)}`, {}, fetchImpl)
      .then((database) => {
        const sources = Array.isArray(database?.data_sources) ? database.data_sources : [];
        if (sources.length !== 1 || !sources[0]?.id) {
          throw new Error(
            "Set RULES_QUESTION_NOTION_DATA_SOURCE_ID because the configured Notion database does not contain exactly one data source."
          );
        }
        return sources[0].id;
      })
      .catch((error) => {
        dataSourcePromise = null;
        throw error;
      });
  }
  return dataSourcePromise;
}

function requiredSchema(names = propertyNames()) {
  return {
    [names.answer]: { rich_text: {} },
    [names.reviewStatus]: {
      select: {
        options: ["Answered", "Needs review", "Clarification", "Out of scope", "Safety response"].map(
          (name) => ({ name })
        ),
      },
    },
    [names.testing]: { checkbox: {} },
    [names.confidenceReason]: { rich_text: {} },
    [names.answerVerdict]: { rich_text: {} },
    [names.topSource]: { url: {} },
    [names.qualityRating]: {
      select: { options: ["Excellent", "Good", "Mixed", "Weak", "Poor", "Not rated"].map((name) => ({ name })) },
    },
    [names.qualityScore]: { number: { format: "number" } },
    [names.qualityIssues]: { rich_text: {} },
    [names.residentEffort]: {
      select: { options: ["Resolved", "Some work remains", "High resident effort", "Not rated"].map((name) => ({ name })) },
    },
    [names.residentEffortScore]: { number: { format: "number" } },
  };
}

async function ensureQuestionLogSchema(dataSourceId, fetchImpl = globalThis.fetch) {
  if (!dataSourceId) return;
  if (!schemaPromise) {
    schemaPromise = notionRequest(`/data_sources/${encodeURIComponent(dataSourceId)}`, {}, fetchImpl)
      .then(async (source) => {
        const existing = source?.properties || {};
        const missing = Object.fromEntries(
          Object.entries(requiredSchema()).filter(([name]) => !existing[name])
        );
        if (Object.keys(missing).length) {
          await notionRequest(
            `/data_sources/${encodeURIComponent(dataSourceId)}`,
            { method: "PATCH", body: JSON.stringify({ properties: missing }) },
            fetchImpl
          );
        }
      })
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }
  return schemaPromise;
}

async function postQuestionLogWebhook(entry, fetchImpl = globalThis.fetch) {
  const webhook = env("RULES_QUESTION_LOG_WEBHOOK_URL");
  if (!webhook || typeof fetchImpl !== "function") return;
  const response = await fetchImpl(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!response.ok) throw new Error(`Question log webhook failed: HTTP ${response.status}`);
}

async function postQuestionLogToNotion(entry, fetchImpl = globalThis.fetch) {
  const dataSourceId = await resolveNotionDataSourceId(fetchImpl);
  if (!dataSourceId) return;
  await ensureQuestionLogSchema(dataSourceId, fetchImpl);
  await notionRequest(
    "/pages",
    {
      method: "POST",
      body: JSON.stringify({
        parent: { data_source_id: dataSourceId },
        properties: notionProperties(entry),
      }),
    },
    fetchImpl
  );
}

function logRulesQuestion(question, answer, req, options = {}) {
  const entry = buildQuestionLogEntry(question, answer, options);
  Promise.allSettled([postQuestionLogWebhook(entry), postQuestionLogToNotion(entry)]).then(
    (results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          console.warn(`Community question log failed: ${result.reason?.message || "unknown error"}`);
        }
      }
    }
  );
  return entry;
}

function denverDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: QUESTION_LOG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function offsetAt(date, timeZone = QUESTION_LOG_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour) === 24 ? 0 : Number(values.hour);
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    hour,
    Number(values.minute),
    Number(values.second)
  ) - date.getTime();
}

function localMidnightUtc(parts) {
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  let candidate = new Date(localAsUtc);
  for (let index = 0; index < 2; index += 1) {
    candidate = new Date(localAsUtc - offsetAt(candidate));
  }
  return candidate;
}

function shiftLocalDate(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function questionLogDateRange(preset = "today", now = new Date()) {
  const today = denverDateParts(now);
  const definitions = { today: [0, 1], yesterday: [-1, 0], "7d": [-6, 1], "30d": [-29, 1] };
  const [startOffset, endOffset] = definitions[preset] || definitions.today;
  return {
    start: localMidnightUtc(shiftLocalDate(today, startOffset)).toISOString(),
    end: localMidnightUtc(shiftLocalDate(today, endOffset)).toISOString(),
  };
}

function plainTextProperty(property) {
  const values = property?.title || property?.rich_text || [];
  return values.map((item) => item?.plain_text ?? item?.text?.content ?? "").join("");
}

function mapNotionQuestion(page, names = propertyNames()) {
  const properties = page?.properties || {};
  const answer = plainTextProperty(properties[names.answer]);
  return {
    id: String(page?.id || ""),
    askedAt: properties[names.askedAt]?.date?.start || page?.created_time || "",
    question: plainTextProperty(properties[names.question]) || "Question",
    answer: answer || "Answer wasn’t recorded for this older question.",
    hasRecordedAnswer: Boolean(answer),
    reviewStatus:
      properties[names.reviewStatus]?.select?.name ||
      (properties[names.canAnswer]?.checkbox ? "Answered" : "Needs review"),
    isTest: Boolean(properties[names.testing]?.checkbox),
    answerMode: plainTextProperty(properties[names.answerMode]),
    answerVerdict: plainTextProperty(properties[names.answerVerdict]),
    confidenceReason: plainTextProperty(properties[names.confidenceReason]),
    canAnswer: Boolean(properties[names.canAnswer]?.checkbox),
    sourceCount: Number(properties[names.sourceCount]?.number || 0),
    topSourceUrl: properties[names.topSource]?.url || "",
    qualityRating: properties[names.qualityRating]?.select?.name || "Not rated",
    qualityScore: Number(properties[names.qualityScore]?.number || 0),
    qualityIssues: plainTextProperty(properties[names.qualityIssues]),
    residentEffort: properties[names.residentEffort]?.select?.name || "Not rated",
    residentEffortScore: Number(properties[names.residentEffortScore]?.number || 0),
  };
}

async function queryQuestionLogs(options = {}, fetchImpl = globalThis.fetch) {
  const dataSourceId = await resolveNotionDataSourceId(fetchImpl);
  if (!dataSourceId) throw new Error("The Notion question log is not configured.");
  await ensureQuestionLogSchema(dataSourceId, fetchImpl);
  const names = propertyNames();
  const range = questionLogDateRange(options.range, options.now);
  const filters = [
    { property: names.askedAt, date: { on_or_after: range.start } },
    { property: names.askedAt, date: { before: range.end } },
  ];
  if (options.includeTests !== true) {
    filters.push({ property: names.testing, checkbox: { equals: false } });
  }
  if (options.status && options.status !== "all") {
    filters.push({ property: names.reviewStatus, select: { equals: options.status } });
  }
  if (options.quality && options.quality !== "all") {
    const ratings = options.quality === "concerns" ? ["Weak", "Poor"] : [options.quality];
    filters.push({
      or: ratings.map((rating) => ({ property: names.qualityRating, select: { equals: rating } })),
    });
  }
  if (options.search) {
    filters.push({ property: names.question, title: { contains: String(options.search).slice(0, 100) } });
  }
  const result = await notionRequest(
    `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        page_size: Math.min(Math.max(Number(options.pageSize) || 100, 1), 100),
        ...(options.cursor ? { start_cursor: String(options.cursor) } : {}),
        filter: { and: filters },
        sorts: [{ property: names.askedAt, direction: "descending" }],
      }),
    },
    fetchImpl
  );
  return {
    items: (result?.results || []).map((page) => mapNotionQuestion(page, names)),
    nextCursor: result?.has_more ? result.next_cursor : null,
  };
}

function resetQuestionLogCachesForTest() {
  dataSourcePromise = null;
  schemaPromise = null;
}

module.exports = {
  buildQuestionLogEntry,
  cleanAnswerForLog,
  cleanQuestionForLog,
  deriveReviewStatus,
  ensureQuestionLogSchema,
  logRulesQuestion,
  mapNotionQuestion,
  notionProperties,
  postQuestionLogToNotion,
  queryQuestionLogs,
  questionLogDateRange,
  resetQuestionLogCachesForTest,
  resolveNotionDataSourceId,
};
