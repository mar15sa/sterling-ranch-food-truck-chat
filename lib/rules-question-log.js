const NOTION_API_URL = "https://api.notion.com/v1/pages";
const NOTION_VERSION = "2022-06-28";
const QUESTION_LOG_WEBHOOK_URL = process.env.RULES_QUESTION_LOG_WEBHOOK_URL || "";
const NOTION_TOKEN =
  process.env.RULES_QUESTION_NOTION_TOKEN || process.env.NOTION_API_KEY || "";
const NOTION_DATABASE_ID = process.env.RULES_QUESTION_NOTION_DATABASE_ID || "";
const NOTION_TITLE_PROPERTY =
  process.env.RULES_QUESTION_NOTION_TITLE_PROPERTY || "Question";
const NOTION_ASKED_AT_PROPERTY =
  process.env.RULES_QUESTION_NOTION_ASKED_AT_PROPERTY || "Asked at";
const NOTION_ANSWER_MODE_PROPERTY =
  process.env.RULES_QUESTION_NOTION_ANSWER_MODE_PROPERTY || "Answer mode";
const NOTION_CAN_ANSWER_PROPERTY =
  process.env.RULES_QUESTION_NOTION_CAN_ANSWER_PROPERTY || "Can answer";
const NOTION_SOURCE_COUNT_PROPERTY =
  process.env.RULES_QUESTION_NOTION_SOURCE_COUNT_PROPERTY || "Source count";

function cleanQuestionForLog(question) {
  return String(question || "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{5,}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function shortTitle(text) {
  const clean = cleanQuestionForLog(text);
  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean || "Question";
}

function notionProperties(entry) {
  return {
    [NOTION_TITLE_PROPERTY]: {
      title: [{ text: { content: shortTitle(entry.question) } }],
    },
    [NOTION_ASKED_AT_PROPERTY]: {
      date: { start: entry.askedAt },
    },
    [NOTION_ANSWER_MODE_PROPERTY]: {
      rich_text: [{ text: { content: entry.answerMode || "deterministic" } }],
    },
    [NOTION_CAN_ANSWER_PROPERTY]: {
      checkbox: Boolean(entry.canAnswer),
    },
    [NOTION_SOURCE_COUNT_PROPERTY]: {
      number: entry.sourceCount || 0,
    },
  };
}

async function postQuestionLogWebhook(entry) {
  if (!QUESTION_LOG_WEBHOOK_URL || typeof fetch !== "function") return;

  await fetch(QUESTION_LOG_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry),
  });
}

async function postQuestionLogToNotion(entry) {
  if (!NOTION_TOKEN || !NOTION_DATABASE_ID || typeof fetch !== "function") return;

  const response = await fetch(NOTION_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${NOTION_TOKEN}`,
      "content-type": "application/json",
      "notion-version": NOTION_VERSION,
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: notionProperties(entry),
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: cleanQuestionForLog(entry.question) },
              },
            ],
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Notion question log failed: HTTP ${response.status}`);
  }
}

function logRulesQuestion(question, answer, req) {
  const topSource = Array.isArray(answer?.sources) ? answer.sources[0] : null;
  const entry = {
    question: cleanQuestionForLog(question),
    askedAt: new Date().toISOString(),
    answerMode: answer?.answerMode || "deterministic",
    canAnswer: Boolean(answer?.confidence?.canAnswer),
    confidence: answer?.confidence?.confidence || "none",
    confidenceReason: answer?.confidence?.reason || "",
    sourceCount: Array.isArray(answer?.sources) ? answer.sources.length : 0,
    topSourceTitle: String(topSource?.title || "").slice(0, 300),
    topSourceUrl: String(topSource?.sourceUrl || "").slice(0, 1000),
    userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 300),
  };

  Promise.allSettled([
    postQuestionLogWebhook(entry),
    postQuestionLogToNotion(entry),
  ]).then((results) => {
    for (const result of results) {
      if (result.status === "rejected") {
        console.warn(result.reason?.message || result.reason);
      }
    }
  });
}

module.exports = {
  cleanQuestionForLog,
  logRulesQuestion,
};
