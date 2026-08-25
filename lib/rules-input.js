const INPUT_CLASSIFICATIONS = Object.freeze({
  RULES_QUESTION: "rules-question",
  CONVERSATION: "conversation",
  PROMPT_INJECTION: "prompt-injection",
  UNRELATED: "unrelated",
  UNCLEAR: "unclear",
});

const { hasCommunityTopicSignal, normalizeResidentQuestion } = require("./rules-intent");

const RULE_TOPIC_PATTERN = new RegExp(
  `\\b(?:${[
    "animals?|cats?|chickens?|dogs?|fowl|hens?|livestock|pets?|poultry|roosters?",
    "approval|cab|chapter|drc|design review|hoa|phone|rules?|rulebook|regulations?|sections?|allowed|prohibited|permits?",
    "architectural|decks?|fences?|flags?|greenhouses?|landscap\\w*|lights?|lighting|mailboxes?|ornaments?|paints?|panels?|patios?|pools?|roofs?|screens?|sheds?|signs?|solar|spa|trampolines?|trees?|yards?",
    "cars?|campers?|commercial vehicle|driveways?|motor homes?|motorhomes?|parking|rv|street|trailers?|vehicles?",
    "assessments?|bins?|curb|deadlines?|delinquent|enforcement|fees?|fines?|garbage|rates?|recycling|trash|utilities|utility|violations?|water",
    "airbnb|amenities|amenity|clubhouse|facilities|facility|fire pit|home automation|homeseer|irrigation|lumiere|parks?|pavilion|quiet hours|reservations?|shelters?|short[-\\s]?term rentals?|sprinklers?|steward|vacation rentals?|vrbo|watering",
  ].join("|")})\\b`,
  "i"
);

const RULE_REQUEST_PATTERN =
  /\b(?:am i allowed|are we allowed|can i|can we|do i need|does .* require|how many|how much|is .* allowed|may i|must i|need approval|what (?:are|is) the (?:cab |community )?rules?|when (?:can|may|must)|where (?:can|may|must))\b/i;

const SHORT_TERM_RENTAL_REQUEST_PATTERN =
  /\b(?:book|host|rent|lease)\b.{0,45}\b(?:home|house|place|property|residence|room)\b.{0,45}\b(?:days?|nights?|weekend|week|travelers?|guests?)\b|\b(?:guests?|travelers?)\b.{0,35}\b(?:book|rent|stay)\b.{0,35}\b(?:home|house|place|property|room)\b/i;

const UNRELATED_TOPIC_PATTERN = new RegExp(
  [
    "atlas(?:\\s+\\w+){0,3}\\s+wi[- ]?fi",
    "wi[- ]?fi",
    "food trucks?",
    "forecast|temperature|weather",
    "homework|write (?:an|my) essay|solve (?:this|my) math",
    "movie|music|recipe|restaurant|sports?|stock price",
    "tell me a joke|translate this",
  ].join("|"),
  "i"
);

function normalizeInput(value = "") {
  return String(value)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function safetyText(value = "") {
  return normalizeInput(value)
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/[7]/g, "t");
}

function compactSafetyText(value = "") {
  return safetyText(value).replace(/[^a-z0-9]+/g, "");
}

function hasPromptInjectionSignals(query) {
  const text = safetyText(query);
  const compact = compactSafetyText(query);

  const outputControl =
    /\b(?:all|each|every|future|next)\s+(?:answer|message|reply|response)s?\b/i.test(text) ||
    /\b(?:answer|begin|prefix|reply|respond|response|say|start)\b.{0,55}\b(?:exactly|only|with)\b/i.test(text) ||
    /\b(?:before|at (?:the )?beginning of|at (?:the )?start of)\b.{0,45}\b(?:answer|reply|response)s?\b/i.test(text) ||
    /(?:every|future)(?:answer|reply|response)/.test(compact);

  const outputCommand =
    /\b(?:answer|begin|include|insert|prefix|reply|respond|say|start|write)\b/i.test(text) ||
    /(?:answer|begin|include|insert|prefix|reply|respond|say|start|write)/.test(compact);

  const protectedInstructionTarget =
    /\b(?:above|developer|hidden|initial|original|previous|private|secret|system)\s+(?:directions?|instructions?|message|prompt|rules?)\b/i.test(text) ||
    /\b(?:developer|system)\s+prompt\b/i.test(text) ||
    /\b(?:directions?|instructions?|prompt)\b/i.test(text);

  const instructionAttack =
    /\b(?:bypass|disregard|forget|ignore|overrid\w*)\b/i.test(text) ||
    /\bdo\s+(?:not|the opposite of)\b.{0,35}\b(?:follow|obey|use)\b/i.test(text) ||
    /(?:bypass|disregard|forget|ignore|override)(?:all|any|the|your)?(?:above|developer|instructions|previous|prompt|rules|rulebook|system)/.test(
      compact
    ) ||
    /(?:above|developer|instructions|previous|prompt|rules|rulebook|system)(?:bypass|disregard|forget|ignore|override)/.test(
      compact
    );

  const disclosureAttack =
    /\b(?:display|dump|expose|give|list|output|print|provide|repeat|return|reveal|send|show|tell me)\b.{0,80}\b(?:api keys?|access keys?|auth(?:entication)? tokens?|config(?:uration)?|credentials?|database tokens?|developer|env(?:ironment)? (?:variables?|vars?)|hidden|instructions?|passwords?|prompts?|secrets?|system|tokens?|webhook urls?)\b/i.test(
      text
    ) ||
    /(?:display|dump|expose|give|list|output|print|provide|repeat|return|reveal|send|show)(?:all|me|the|your)*(?:accesskeys?|apikeys?|authtokens?|config(?:uration)?|credentials?|databasetokens?|developer|environmentvariables?|envvars?|hidden|instructions|passwords?|prompts?|secrets?|system|tokens?|webhookurls?)/.test(
      compact
    );

  const roleAttack =
    /\b(?:act as|pretend|roleplay)\b.{0,35}\b(?:different|developer|not (?:a|the)|system|you are)\b/i.test(text) ||
    /\b(?:do not|don't|stop)\b.{0,30}\b(?:cite|follow|use)\b.{0,30}\b(?:rulebook|rules?|sources?)\b/i.test(
      text
    );

  const rulesBypassAttack =
    /\b(?:bypass|disregard|forget|ignore|override)\b.{0,35}\b(?:rulebook|rules?|sources?)\b.{0,55}\b(?:answer|instead|memory|say|tell me|yes|without)\b/i.test(
      text
    ) ||
    /\b(?:answer|say|tell me)\b.{0,45}\b(?:instead|without)\b.{0,35}\b(?:rulebook|rules?|sources?)\b/i.test(
      text
    );

  const typoOutputAttack =
    /\b(?:s[ae]y|sya)\b.{0,55}\b(?:befor\w*|start)\b.{0,25}\b(?:ans+w?e?r|reply|response)s?\b/i.test(
      text
    );

  return (
    disclosureAttack ||
    roleAttack ||
    rulesBypassAttack ||
    (instructionAttack && protectedInstructionTarget) ||
    (outputControl && outputCommand) ||
    typoOutputAttack
  );
}

function isConversation(query) {
  const text = normalizeInput(query);
  return (
    /^\s*(?:good\s+(?:afternoon|evening|morning)|hello|hey|hi|howdy)[!.?\s]*$/i.test(text) ||
    /^\s*(?:bye|goodbye|thanks|thank you|who are you|what can you do)[!.?\s]*$/i.test(text)
  );
}

function classifyRulesInput(query) {
  const text = normalizeResidentQuestion(normalizeInput(query));
  if (!text) {
    return { classification: INPUT_CLASSIFICATIONS.UNCLEAR, normalized: text, reason: "empty-input" };
  }

  if (hasPromptInjectionSignals(text)) {
    return { classification: INPUT_CLASSIFICATIONS.PROMPT_INJECTION, normalized: text, reason: "prompt-injection" };
  }

  if (isConversation(text)) {
    return { classification: INPUT_CLASSIFICATIONS.CONVERSATION, normalized: text, reason: "conversation" };
  }

  if (/^who\s+is\s+[a-z][a-z.'-]+(?:\s+[a-z][a-z.'-]+){0,3}[?.!]*$/i.test(text)) {
    return { classification: INPUT_CLASSIFICATIONS.UNRELATED, normalized: text, reason: "person-identity" };
  }

  if (/^(?:can i|can we|could i|is it allowed|may i)[?.!\s]*$/i.test(text)) {
    return { classification: INPUT_CLASSIFICATIONS.UNCLEAR, normalized: text, reason: "missing-topic" };
  }

  if (RULE_TOPIC_PATTERN.test(text) || RULE_REQUEST_PATTERN.test(text) || SHORT_TERM_RENTAL_REQUEST_PATTERN.test(text) || hasCommunityTopicSignal(text)) {
    return { classification: INPUT_CLASSIFICATIONS.RULES_QUESTION, normalized: text, reason: "known-rule-signal" };
  }

  if (UNRELATED_TOPIC_PATTERN.test(text)) {
    return { classification: INPUT_CLASSIFICATIONS.UNRELATED, normalized: text, reason: "known-unrelated-topic" };
  }

  const words = text.match(/[a-z0-9']+/gi) || [];
  if (words.length <= 2 || /^(?:can|could|is|may|what|when|where|who|why)\b/i.test(text)) {
    return { classification: INPUT_CLASSIFICATIONS.UNCLEAR, normalized: text, reason: "missing-topic" };
  }

  return { classification: INPUT_CLASSIFICATIONS.UNRELATED, normalized: text, reason: "no-known-rule-signal" };
}

module.exports = {
  INPUT_CLASSIFICATIONS,
  classifyRulesInput,
  hasPromptInjectionSignals,
  normalizeInput,
};
