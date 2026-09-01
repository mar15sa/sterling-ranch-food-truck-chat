const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildQuestionLogEntry,
  cleanAnswerForLog,
  cleanQuestionForLog,
  deriveReviewStatus,
  notionProperties,
  queryQuestionLogs,
  questionLogDateRange,
  resetQuestionLogCachesForTest,
  resolveNotionDataSourceId,
} = require("../lib/rules-question-log");

test("question log redacts personal contact details in questions and answers", () => {
  assert.equal(
    cleanQuestionForLog("Email me at owner@example.com or call 303-555-1212"),
    "Email me at [email] or call [phone]"
  );
  assert.equal(
    cleanAnswerForLog("I will repeat owner@example.com and 303-555-1212"),
    "I will repeat [email] and [phone]"
  );
});

test("review status highlights genuine confidence failures only", () => {
  assert.equal(
    deriveReviewStatus({ confidence: { canAnswer: true }, reviewNeeded: false }),
    "Answered"
  );
  assert.equal(
    deriveReviewStatus({ confidence: { canAnswer: false }, reviewNeeded: true }),
    "Needs review"
  );
  assert.equal(
    deriveReviewStatus({ inputClassification: "unclear", confidence: { canAnswer: false } }),
    "Clarification"
  );
  assert.equal(
    deriveReviewStatus({ inputClassification: "unrelated", confidence: { canAnswer: false } }),
    "Out of scope"
  );
  assert.equal(
    deriveReviewStatus({ answerStatus: "safety-rejected", confidence: { canAnswer: false } }),
    "Safety response"
  );
});

test("log entry stores the displayed answer and test marker", () => {
  const entry = buildQuestionLogEntry(
    "Can I build a shed?",
    {
      answer: "Yes, with the listed approval steps.",
      answerMode: "community-rules",
      answerVerdict: "conditional",
      confidence: { canAnswer: true, confidence: "high", reason: "official-source" },
      sources: [{ title: "Shed rule", sourceUrl: "https://example.com/shed" }],
    },
    { isTest: true, askedAt: "2026-09-01T18:00:00.000Z" }
  );
  assert.equal(entry.answer, "Yes, with the listed approval steps.");
  assert.equal(entry.isTest, true);
  assert.equal(entry.reviewStatus, "Answered");
  assert.equal(entry.topSourceUrl, "https://example.com/shed");
  assert.ok(["Excellent", "Good", "Mixed", "Weak", "Poor"].includes(entry.qualityRating));
  assert.ok(entry.qualityScore >= 1 && entry.qualityScore <= 5);
  const properties = notionProperties(entry);
  assert.equal(properties.Answer.rich_text[0].text.content, entry.answer);
  assert.equal(properties.Testing.checkbox, true);
  assert.equal(properties["Review status"].select.name, "Answered");
  assert.equal(properties["Quality rating"].select.name, entry.qualityRating);
  assert.equal(properties["Quality score"].number, entry.qualityScore);
});

test("Denver date presets use the correct daylight-saving boundaries", () => {
  const summer = questionLogDateRange("today", new Date("2026-09-01T18:00:00.000Z"));
  assert.deepEqual(summer, {
    start: "2026-09-01T06:00:00.000Z",
    end: "2026-09-02T06:00:00.000Z",
  });
  const winter = questionLogDateRange("today", new Date("2026-12-01T18:00:00.000Z"));
  assert.deepEqual(winter, {
    start: "2026-12-01T07:00:00.000Z",
    end: "2026-12-02T07:00:00.000Z",
  });
});

test("legacy Notion database setting resolves its single data source", async () => {
  const previousToken = process.env.RULES_QUESTION_NOTION_TOKEN;
  const previousDatabase = process.env.RULES_QUESTION_NOTION_DATABASE_ID;
  const previousSource = process.env.RULES_QUESTION_NOTION_DATA_SOURCE_ID;
  process.env.RULES_QUESTION_NOTION_TOKEN = "test-token";
  process.env.RULES_QUESTION_NOTION_DATABASE_ID = "legacy-database";
  delete process.env.RULES_QUESTION_NOTION_DATA_SOURCE_ID;
  resetQuestionLogCachesForTest();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data_sources: [{ id: "current-data-source" }] }),
    };
  };
  try {
    assert.equal(await resolveNotionDataSourceId(fetchImpl), "current-data-source");
    assert.match(calls[0].url, /\/v1\/databases\/legacy-database$/);
    assert.equal(calls[0].options.headers["notion-version"], "2026-03-11");
  } finally {
    if (previousToken === undefined) delete process.env.RULES_QUESTION_NOTION_TOKEN;
    else process.env.RULES_QUESTION_NOTION_TOKEN = previousToken;
    if (previousDatabase === undefined) delete process.env.RULES_QUESTION_NOTION_DATABASE_ID;
    else process.env.RULES_QUESTION_NOTION_DATABASE_ID = previousDatabase;
    if (previousSource === undefined) delete process.env.RULES_QUESTION_NOTION_DATA_SOURCE_ID;
    else process.env.RULES_QUESTION_NOTION_DATA_SOURCE_ID = previousSource;
    resetQuestionLogCachesForTest();
  }
});

test("question query hides tests by default and maps the stored answer", async () => {
  const previousToken = process.env.RULES_QUESTION_NOTION_TOKEN;
  const previousSource = process.env.RULES_QUESTION_NOTION_DATA_SOURCE_ID;
  process.env.RULES_QUESTION_NOTION_TOKEN = "test-token";
  process.env.RULES_QUESTION_NOTION_DATA_SOURCE_ID = "question-source";
  resetQuestionLogCachesForTest();
  const calls = [];
  const schema = {
    Answer: {},
    "Review status": {},
    Testing: {},
    "Confidence reason": {},
    "Answer verdict": {},
    "Top source": {},
    "Quality rating": {},
    "Quality score": {},
    "Quality issues": {},
    "Resident effort": {},
    "Resident effort score": {},
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/data_sources/question-source")) {
      return { ok: true, status: 200, json: async () => ({ properties: schema }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: "question-1",
            created_time: "2026-09-01T18:00:00.000Z",
            properties: {
              Question: { title: [{ plain_text: "Can I build a shed?" }] },
              "Asked at": { date: { start: "2026-09-01T18:00:00.000Z" } },
              Answer: { rich_text: [{ plain_text: "Yes, with approval." }] },
              "Review status": { select: { name: "Answered" } },
              Testing: { checkbox: false },
              "Answer mode": { rich_text: [{ plain_text: "community-rules" }] },
              "Can answer": { checkbox: true },
              "Source count": { number: 1 },
              "Confidence reason": { rich_text: [] },
              "Answer verdict": { rich_text: [{ plain_text: "conditional" }] },
              "Top source": { url: "https://example.com/shed" },
              "Quality rating": { select: { name: "Good" } },
              "Quality score": { number: 4 },
              "Quality issues": { rich_text: [] },
              "Resident effort": { select: { name: "Resolved" } },
              "Resident effort score": { number: 5 },
            },
          },
        ],
        has_more: false,
      }),
    };
  };
  try {
    const result = await queryQuestionLogs(
      { range: "today", status: "Answered", quality: "concerns", search: "shed", now: new Date("2026-09-01T18:00:00Z") },
      fetchImpl
    );
    assert.equal(result.items[0].answer, "Yes, with approval.");
    assert.equal(result.items[0].qualityRating, "Good");
    assert.equal(result.items[0].residentEffort, "Resolved");
    const queryCall = calls.find((call) => call.url.endsWith("/query"));
    const body = JSON.parse(queryCall.options.body);
    assert.ok(
      body.filter.and.some(
        (filter) => filter.property === "Testing" && filter.checkbox?.equals === false
      )
    );
    assert.ok(body.filter.and.some((filter) => filter.property === "Review status" && filter.select.equals === "Answered"));
    assert.ok(body.filter.and.some((filter) => filter.or?.some((part) => part.property === "Quality rating" && part.select.equals === "Weak")));
    assert.ok(body.filter.and.some((filter) => filter.property === "Question" && filter.title.contains === "shed"));
  } finally {
    if (previousToken === undefined) delete process.env.RULES_QUESTION_NOTION_TOKEN;
    else process.env.RULES_QUESTION_NOTION_TOKEN = previousToken;
    if (previousSource === undefined) delete process.env.RULES_QUESTION_NOTION_DATA_SOURCE_ID;
    else process.env.RULES_QUESTION_NOTION_DATA_SOURCE_ID = previousSource;
    resetQuestionLogCachesForTest();
  }
});
