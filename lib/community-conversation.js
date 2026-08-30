const {
  INPUT_CLASSIFICATIONS,
  classifyRulesInput,
  hasPromptInjectionSignals,
  normalizeInput,
} = require("./rules-input");

const MAX_CONTEXT_PAIRS = 3;
const MAX_CONTEXT_FIELD_CHARS = 1200;
const DIRECT_REFERENCE_PATTERN = /\b(?:that|those|them|their|this|the same)\b/i;
const IT_REFERENCE_PATTERN = /\b(?:it|its)\b/i;
const DUMMY_IT_QUESTION_PATTERN = /\bis it (?:allowed|okay|ok|permitted|possible)\s+to\b/i;
const FOLLOW_UP_OPENING_PATTERN = /^(?:and\s+)?(?:what|how) about\b/i;
const FOLLOW_UP_FRAGMENT_PATTERN = /^(?:and\s+)?(?:menu|price|prices|cost|costs|how much|hours|when|where|what time|today|tomorrow)(?:\s+please)?[?.!]*$/i;
const CORRECTION_PATTERN = /^(?:actually|correction|i meant|no[,\s]+i meant|sorry[,\s]+i meant)\b/i;
const INCOMPLETE_PERMISSION_PATTERN = /^(?:can|could|may)\s+(?:i|we)[?.!]*$|^is it (?:allowed|okay|ok|permitted)[?.!]*$/i;

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
  // Only resident-authored fields can influence follow-up resolution. The
  // assistant answer is retained for the browser transcript, but it is not
  // used as evidence or instructions. Running the resident-input detector on
  // our own formatted answer caused phrases such as "Short answer" and
  // "with" to be mistaken for output-control attacks on the next turn.
  return context.some((pair) =>
    hasPromptInjectionSignals(pair.question)
    || hasPromptInjectionSignals(pair.resolvedQuestion)
  );
}

function shouldUsePriorContext(question = "", context = []) {
  if (!context.length) return false;
  const text = normalizeInput(question);
  if (!text) return false;
  const classified = classifyRulesInput(text);
  if (
    classified.classification === INPUT_CLASSIFICATIONS.CONVERSATION
    || classified.classification === INPUT_CLASSIFICATIONS.PROMPT_INJECTION
  ) return false;
  if (
    classified.classification === INPUT_CLASSIFICATIONS.UNRELATED
    && ["known-unrelated-topic", "person-identity"].includes(classified.reason)
  ) return false;

  // A complete, recognizable resident question starts a fresh retrieval even
  // when it is short. Prior context is only allowed when the new wording is
  // grammatically dependent on the previous turn. This prevents a prior topic
  // from contaminating standalone questions such as "Sheds" or "What fees do
  // residents pay?" without maintaining an ever-growing topic keyword list.
  const hasDirectReference = DIRECT_REFERENCE_PATTERN.test(text)
    || (IT_REFERENCE_PATTERN.test(text) && !DUMMY_IT_QUESTION_PATTERN.test(text));
  if (classified.classification === INPUT_CLASSIFICATIONS.RULES_QUESTION) {
    const words = text.match(/[a-z0-9']+/gi) || [];
    return hasDirectReference && words.length <= 6;
  }
  if (hasDirectReference) return true;
  if (CORRECTION_PATTERN.test(text)) return true;
  if (FOLLOW_UP_OPENING_PATTERN.test(text)) return true;
  if (FOLLOW_UP_FRAGMENT_PATTERN.test(text)) return true;
  return INCOMPLETE_PERMISSION_PATTERN.test(text);
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
