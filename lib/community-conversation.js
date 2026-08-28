const { hasPromptInjectionSignals, normalizeInput } = require("./rules-input");

const MAX_CONTEXT_PAIRS = 3;
const MAX_CONTEXT_FIELD_CHARS = 1200;
const FOLLOW_UP_PATTERN = /\b(?:it|its|that|those|them|their|there|this|the same|what about|how about|and tomorrow|and today|menu|price|cost)\b/i;
const EXPLICIT_TOPIC_PATTERN = /\b(?:food trucks?|pool|park|pavilion|overlook|clubhouse|water|sewer|trash|recycling|drc|design review|fence|shed|yard|tree|pet|parking|event|calendar|form|fee|rule)\b/i;

function cleanField(value = "") {
  return normalizeInput(value).slice(0, MAX_CONTEXT_FIELD_CHARS);
}

function normalizeConversationContext(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_CONTEXT_PAIRS).map((item) => ({
    question: cleanField(item?.question),
    resolvedQuestion: cleanField(item?.resolvedQuestion || item?.question),
    answer: cleanField(item?.answer),
  })).filter((item) => item.question && item.answer);
}

function contextHasPromptInjection(context = []) {
  return context.some((pair) => hasPromptInjectionSignals(pair.question) || hasPromptInjectionSignals(pair.answer));
}

function shouldUsePriorContext(question = "", context = []) {
  if (!context.length) return false;
  const text = normalizeInput(question);
  if (!text) return false;
  if (EXPLICIT_TOPIC_PATTERN.test(text) && !/\b(?:it|its|that|those|them|their|there|the same)\b/i.test(text)) return false;
  if (FOLLOW_UP_PATTERN.test(text)) return true;
  const words = text.match(/[a-z0-9']+/gi) || [];
  return words.length <= 5 && !EXPLICIT_TOPIC_PATTERN.test(text);
}

function resolveConversationQuestion(question, rawContext) {
  const cleanQuestion = cleanField(question);
  const context = normalizeConversationContext(rawContext);
  if (contextHasPromptInjection(context)) {
    return { question: cleanQuestion, resolvedQuestion: cleanQuestion, usedPriorContext: false, context, unsafeContext: true };
  }
  if (!shouldUsePriorContext(cleanQuestion, context)) {
    return { question: cleanQuestion, resolvedQuestion: cleanQuestion, usedPriorContext: false, context, unsafeContext: false };
  }
  const previous = context.at(-1);
  const priorTopic = previous.resolvedQuestion || previous.question;
  const cleanPriorTopic = priorTopic.replace(/[?.!]+$/, "");
  const contactSubject = cleanPriorTopic.match(/\b(?:about|regarding)\s+(.+)$/i)?.[1];
  let resolvedQuestion = `Regarding “${cleanPriorTopic}”: ${cleanQuestion}`;
  if (contactSubject && /\bemail\b/i.test(cleanQuestion)) resolvedQuestion = `What email should I use for ${contactSubject}?`;
  else if (contactSubject && /\b(?:phone|call|number)\b/i.test(cleanQuestion)) resolvedQuestion = `What phone number should I use for ${contactSubject}?`;
  else if (/\b(?:menu|eat|food|price|cost)\b/i.test(cleanQuestion) && /\bfood\s*truck|\btruck\b/i.test(cleanPriorTopic)) {
    resolvedQuestion = `${cleanPriorTopic}. Food-truck follow-up: ${cleanQuestion}`;
  }
  return {
    question: cleanQuestion,
    resolvedQuestion: resolvedQuestion.slice(0, 500),
    usedPriorContext: true,
    context,
    unsafeContext: false,
  };
}

module.exports = {
  MAX_CONTEXT_PAIRS,
  contextHasPromptInjection,
  normalizeConversationContext,
  resolveConversationQuestion,
  shouldUsePriorContext,
};
