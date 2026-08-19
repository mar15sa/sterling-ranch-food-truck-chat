const INPUT_CLASSIFICATIONS = Object.freeze({
  RULES_QUESTION: "rules-question",
  CONVERSATION: "conversation",
  PROMPT_INJECTION: "prompt-injection",
  UNRELATED: "unrelated",
  UNCLEAR: "unclear",
});

const RULE_TOPIC_PATTERN = new RegExp(
  [
    "animal|cat|chicken|dog|fowl|hen|livestock|pet|poultry|rooster",
    "approval|cab|chapter|drc|design review|hoa|phone|rule|rulebook|regulation|section|allowed|prohibited|permit",
    "architectural|deck|fence|flag|greenhouse|landscap|light|mailbox|ornament|paint|panel|patio|pool|roof|screen|shed|sign|solar|spa|trampoline|tree|yard",
    "car|camper|commercial vehicle|driveway|motor home|parking|rv|street|trailer|vehicle",
    "assessment|deadline|delinquent|enforcement|fee|fine|rate|trash|utility|violation|water",
    "amenity|clubhouse|facility|fire pit|home automation|homeseer|lumiere|park|pavilion|quiet hours|reservation|shelter|steward|watering",
  ].join("|"),
  "i"
);

const RULE_REQUEST_PATTERN =
  /\b(?:am i allowed|are we allowed|can i|can we|do i need|does .* require|how many|how much|is .* allowed|may i|must i|need approval|what (?:are|is) the (?:cab |community )?rules?|when (?:can|may|must)|where (?:can|may|must))\b/i;

const UNRELATED_TOPIC_PATTERN = new RegExp(
  [
    "atlas\\s+wi[- ]?fi",
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
    /\b(?:display|expose|print|repeat|reveal|show|tell me)\b.{0,65}\b(?:api key|developer|hidden|instructions?|password|prompt|secret|system|token)\b/i.test(
      text
    ) ||
    /(?:display|expose|print|repeat|reveal|show)(?:all|me|the|your)*(?:apikey|developer|hidden|instructions|password|prompt|secret|system|token)/.test(
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
  const text = normalizeInput(query);
  if (!text) {
    return { classification: INPUT_CLASSIFICATIONS.UNCLEAR, normalized: text };
  }

  if (hasPromptInjectionSignals(text)) {
    return { classification: INPUT_CLASSIFICATIONS.PROMPT_INJECTION, normalized: text };
  }

  if (isConversation(text)) {
    return { classification: INPUT_CLASSIFICATIONS.CONVERSATION, normalized: text };
  }

  if (/^(?:can i|can we|could i|is it allowed|may i)[?.!\s]*$/i.test(text)) {
    return { classification: INPUT_CLASSIFICATIONS.UNCLEAR, normalized: text };
  }

  if (RULE_TOPIC_PATTERN.test(text) || RULE_REQUEST_PATTERN.test(text)) {
    return { classification: INPUT_CLASSIFICATIONS.RULES_QUESTION, normalized: text };
  }

  if (UNRELATED_TOPIC_PATTERN.test(text)) {
    return { classification: INPUT_CLASSIFICATIONS.UNRELATED, normalized: text };
  }

  const words = text.match(/[a-z0-9']+/gi) || [];
  if (words.length <= 2 || /^(?:can|could|is|may|what|when|where|who|why)\b/i.test(text)) {
    return { classification: INPUT_CLASSIFICATIONS.UNCLEAR, normalized: text };
  }

  return { classification: INPUT_CLASSIFICATIONS.UNRELATED, normalized: text };
}

module.exports = {
  INPUT_CLASSIFICATIONS,
  classifyRulesInput,
  hasPromptInjectionSignals,
  normalizeInput,
};
