const NUMBER_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function capitalize(text = "") {
  return String(text).replace(/^(\s*)([a-z])/, (_, space, letter) => `${space}${letter.toUpperCase()}`);
}

function lowerFirst(text = "") {
  return String(text).replace(/^(\s*)([A-Z])/, (_, space, letter) => `${space}${letter.toLowerCase()}`);
}

function numberValue(value = "") {
  const normalized = String(value).trim().toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return normalized;
  return Object.hasOwn(NUMBER_WORDS, normalized) ? String(NUMBER_WORDS[normalized]) : String(value);
}

function completeSentence(text = "") {
  const value = String(text).trim();
  return !value || /[.!?]["')\]]?$/.test(value) ? value : `${value}.`;
}

function readableCondition(text = "") {
  return String(text)
    .replace(/^lot square footage permits\.?$/i, "the lot has enough room")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

function friendlySourceSentence(sentence = "") {
  let value = completeSentence(String(sentence).replace(/\s+/g, " ").trim());
  if (!value) return "";

  const prohibitedUnderCitedRule = /^Prohibited under (?:the )?cited rule:\s*/i.test(value);
  value = value.replace(/^Prohibited under (?:the )?cited rule:\s*/i, "");

  const noSubjectProhibition = value.match(/^No (.+?) shall be (.+?)(,? except .+?)?\.?$/i);
  if (noSubjectProhibition) {
    const exception = noSubjectProhibition[3]
      ? `,${noSubjectProhibition[3].replace(/^,?\s*except\s+/i, " except ").replace(/\.$/, "")}`
      : "";
    const plainProhibition = `${capitalize(noSubjectProhibition[1])} can't be ${noSubjectProhibition[2].replace(/\.$/, "")}${exception}.`;
    return prohibitedUnderCitedRule ? `No. ${plainProhibition}` : plainProhibition;
  }

  const repeatedProhibition = value.match(
    /^(.{1,90}?)\s+is not allowed under (?:the )?cited [^:]{1,90}:\s*\1\s+is not permitted\.?$/i
  );
  if (repeatedProhibition) return `${capitalize(repeatedProhibition[1])} isn't allowed.`;

  value = value.replace(
    /^(?:The )?(?:selected|cited) (?:official )?(?:rule|source|passage|material rule) (?:says?|requires?|restricts?)(?: this)?\s*:\s*/i,
    ""
  );
  value = value.replace(
    /^(.+?)\s+is not allowed under (?:the )?cited [^:]{1,90}:\s*/i,
    "$1 isn't allowed. "
  );

  const approvalFor = value.match(/^((?:DRC|CAB) approval) is required for (.+?)\.?$/i);
  if (approvalFor) return `You'll need ${approvalFor[1]} for ${lowerFirst(approvalFor[2]).replace(/\.$/, "")}.`;

  const maximum = value.match(
    /^([a-z]+)-foot maximum overall (height|width)(?: for .+?)?( from grade)?\.?$/i
  );
  if (maximum) {
    const measurement = maximum[2].toLowerCase();
    const groundLevel = maximum[3] ? ", measured from ground level" : "";
    return `The maximum ${measurement} is ${numberValue(maximum[1])} feet${groundLevel}.`;
  }

  const conditionalMaximum = value.match(
    /^We encourage .+? and,? therefore,? will allow a ([a-z]+)-foot maximum overall (height|width)( from grade)? if (.+?)\.?$/i
  );
  if (conditionalMaximum) {
    const groundLevel = conditionalMaximum[3] ? ", measured from ground level," : "";
    return `The maximum ${conditionalMaximum[2].toLowerCase()} can increase to ${numberValue(conditionalMaximum[1])} feet${groundLevel} if ${readableCondition(conditionalMaximum[4])}.`;
  }

  const placement = value.match(
    /^(.+?) are only allowed in (.+?) and (?:are not allowed in|must remain outside) (.+?)\.?$/i
  );
  if (placement) {
    return `${capitalize(placement[1])} must be in ${placement[2]} and outside ${placement[3].replace(/\.$/, "")}.`;
  }

  const maximumCount = value.match(/^A maximum of ([a-z0-9-]+) (.+?) are allowed if (.+?)\.?$/i);
  if (maximumCount) {
    return `Up to ${numberValue(maximumCount[1])} ${maximumCount[2]} are allowed if ${readableCondition(maximumCount[3])}.`;
  }

  const transparency = value.match(/^(.+?) must have ([a-z0-9-]+) percent required transparency\.?$/i);
  if (transparency) {
    return `${capitalize(transparency[1])} must have ${numberValue(transparency[2])}% transparency.`;
  }

  const prohibited = value.match(/^(.+?) is not permitted\.?$/i);
  if (prohibited) return `${capitalize(prohibited[1])} isn't allowed.`;

  value = value
    .replace(/^Must be\b/i, "It must be")
    .replace(/\bshall not\b/gi, "must not")
    .replace(/\bshall be\b/gi, "must be")
    .replace(/\b([a-z0-9-]+) percent\b/gi, (_, amount) => `${numberValue(amount)}%`)
    .replace(/\bfrom grade\b/gi, "measured from ground level")
    .replace(/\b([a-z]+)-foot\b/gi, (_, amount) => `${numberValue(amount)}-foot`)
    .replace(/\s+/g, " ")
    .trim();
  return completeSentence(capitalize(value));
}

function plainLanguageSourcePart(text = "") {
  let value = String(text).replace(/\s+/g, " ").trim();
  if (!value) return "";

  const headingApproval = value.match(/^([^.!?]{2,100})\.\s*((?:DRC|CAB) approval is required)\.?(.*)$/i);
  const sentences = [];
  if (headingApproval) {
    sentences.push(`You'll need ${headingApproval[2].replace(/ is required$/i, "")} for ${lowerFirst(headingApproval[1])}.`);
    value = headingApproval[3].trim();
  }

  if (value) {
    sentences.push(...value
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map(friendlySourceSentence)
      .filter(Boolean));
  }

  return sentences.join(" ").replace(/\s+/g, " ").trim();
}

function plainLanguageSourceText(text = "") {
  return String(text)
    .split(/\n\s*\n/)
    .map(plainLanguageSourcePart)
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function residentVoiceIssues(answer = "") {
  const value = String(answer || "");
  const issues = [];
  if (/\bunder (?:the )?cited (?:rule|source|passage|material rule)\s*:/i.test(value)) {
    issues.push("source-meta-language");
  }
  if (/(?:^|[.!?]\s+)Must be\b/m.test(value)) issues.push("sentence-fragment");
  if (/\b(?:maximum overall (?:height|width)|required transparency|from grade)\b/i.test(value)) {
    issues.push("rulebook-measurement-language");
  }
  if (/\bWe encourage\b.{0,260}\bwill allow\b/is.test(value)) issues.push("source-author-voice");
  if (/\b(.{1,70}?) is not allowed\b.{0,120}\b\1 is not permitted\b/i.test(value)) {
    issues.push("duplicated-claim");
  }
  return [...new Set(issues)];
}

function actionLabel(title = "") {
  const value = String(title).replace(/\s+/g, " ").trim();
  if (!value) return "";
  return /^(?:Apply|Book|Check|Contact|Download|Open|Pay|Register|Reserve|Review|Start|Submit|View)\b/i.test(value)
    ? value
    : `Open ${value}`;
}

function nextStepFromActions(nextStep = "", actions = []) {
  const current = plainLanguageSourceText(nextStep);
  const generic = /^(?:Open|Review|Check) (?:the )?(?:linked )?official (?:source|section|page)\b/i.test(current);
  if (!generic) return current;
  if (!actions.length) return "Open the official source for the complete wording.";

  const submit = actions.find((action) => /^(?:Apply|Start|Submit)\b/i.test(action.label || ""));
  const reference = actions.find((action) => action !== submit && /^(?:Download|Open|Review|View)\b/i.test(action.label || ""));
  if (reference && submit) {
    const referenceTitle = String(reference.label).replace(/^(?:Download|Open|Review|View)\s+/i, "");
    const submitSentence = lowerFirst(submit.label).replace(/\b(Application|Form|Page)\b/g, (word) => word.toLowerCase());
    return `Review the ${referenceTitle}, then ${submitSentence}.`;
  }
  return completeSentence(capitalize(actions[0].label));
}

module.exports = {
  actionLabel,
  nextStepFromActions,
  plainLanguageSourcePart,
  plainLanguageSourceText,
  residentVoiceIssues,
};
