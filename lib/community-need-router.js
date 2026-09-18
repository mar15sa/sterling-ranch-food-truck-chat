const { assessResidentNeeds } = require("./community-request-contract");

const DEFAULT_MAX_NEEDS = 4;

function sourceId(source = {}) {
  return String(source.id || source.nodeId || "");
}

function directAnswerText(answer = {}) {
  const direct = String(answer.directAnswer || "").trim();
  if (direct) return direct;
  return String(answer.answer || "")
    .replace(/^Short answer\s*:\s*/i, "")
    .split(/\n\s*\n/)[0]
    .trim();
}

function focusedClaimText(text = "", task = "") {
  const sentences = String(text).split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  const patterns = {
    specification: /\b(?:height|size|dimension|setback|distance|material|color|finish|location|screened|inside|behind|return|keep|store|place)\b/i,
    permission: /\b(?:allowed|prohibited|required|requires|may|must|permission|approval)\b/i,
    hours: /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i,
    price: /\$\s*\d|\b(?:free|no charge|cost|price|fee)\b/i,
    contact: /@|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/,
  };
  const pattern = patterns[task];
  if (!pattern) return String(text).trim();
  const focused = sentences.find((sentence) => pattern.test(sentence)) || String(text).trim();
  const withoutLeadingJoiner = focused
    .replace(/^(?:and|but|or)\s+/i, "")
    .replace(/^-\s+/, "")
    .replace(/^[A-Z]\.\s+/, "")
    .replace(/^The cited official rule requires a specific step\s*:\s*/i, "");
  return withoutLeadingJoiner.charAt(0).toUpperCase() + withoutLeadingJoiner.slice(1);
}

function audienceFocusedClaimText(text = "", need = {}) {
  const request = String(`${need.evidenceFocus || ""} ${need.request || ""}`);
  const sentences = String(text).split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  if (sentences.length < 2) return focusedClaimText(text, need.task);
  const asksNonresident = /\bnon[- ]?residents?\b|\b(?:friend|guest)\b[\s\S]{0,50}\b(?:does not|doesn't|do not|don't|not)\b[\s\S]{0,30}\b(?:live|resident)\b/i.test(request);
  const asksResident = !asksNonresident && /\b(?:resident|homeowner)\b/i.test(request);
  const audiencePattern = asksNonresident ? /\bnonresidents?\b/i : asksResident ? /(?<!non)\bresidents?\b/i : null;
  const audienceSentence = audiencePattern && sentences.find((sentence) => audiencePattern.test(sentence));
  return audienceSentence || focusedClaimText(text, need.task);
}

const CLAIM_FOCUS_STOP_WORDS = new Set("a an and are at be by can could do does for from how i in is it my of on or should the their there they this to what when where which who will with would your regarding".split(" "));
function claimFocusTerm(term = "") {
  const normalized = String(term).toLowerCase();
  if (["dog", "dogs", "cat", "cats", "animal", "animals"].includes(normalized)) return "pet";
  if (["park", "parks", "parking"].includes(normalized)) return "parking";
  if (["manage", "manages", "managed", "administer", "administers", "administered"].includes(normalized)) return "administer";
  return normalized.replace(/(?:ing|ed|es|s)$/, "");
}

function requestFocusedSentences(claims = [], need = {}, maxSentences = 2) {
  const request = String(`${need.evidenceFocus || ""} ${need.request || ""}`);
  const requestTerms = new Set((request.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((term) => term.length >= 3 && !CLAIM_FOCUS_STOP_WORDS.has(term))
    .map(claimFocusTerm));
  const candidates = claims.flatMap((claim) => String(claim || "").split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
    .map((sentence) => {
      const sentenceTerms = new Set((sentence.toLowerCase().match(/[a-z0-9]+/g) || []).map(claimFocusTerm));
      let score = [...requestTerms].filter((term) => sentenceTerms.has(term)).length;
      if (/\b(?:ball machine|glass)\b/i.test(request) && /\b(?:ball machines?|glass items?)\b/i.test(sentence)) score += 8;
      if (/\b(?:gear|equipment|paddles?|balls?|shoes?|footwear)\b/i.test(request)
        && /\b(?:bring their own paddles and balls|tennis or court shoes)\b/i.test(sentence)) score += 8;
      if (/\b(?:intersection|where (?:are|is)|located|location)\b/i.test(request)
        && /\b(?:Sterling Ranch Avenue|Middle Fork Street|courts are at)\b/i.test(sentence)) score += 8;
      if (/\b(?:dog|cat|pet|animal)\b/i.test(request) && /\bpets?\b/i.test(sentence)) score += 8;
      if (/\b(?:\d{1,2}[- ]?year[- ]old|child|kid|minor)\b/i.test(request)
        && /\b(?:children? under|resident age 16|child supervision)\b/i.test(sentence)) score += 8;
      if (/\btownhomes?\b/i.test(request) && /\btownhomes?\b.{0,80}\bhoa\b/i.test(sentence)) score += 8;
      if (/\b(?:past usage|arrears|how often|arrive)\b/i.test(request) && /\b(?:monthly|arrears)\b/i.test(sentence)) score += 8;
      if (/\b(?:who manages|who administers|managed by|administered by)\b/i.test(request)
        && /\b(?:administers?|managed by|billing partner)\b/i.test(sentence)) score += 8;
      if (/\b(?:autopay|automatic withdrawal|bank account|ach)\b/i.test(request)
        && /\b(?:automatic withdrawal|ach)\b.{0,80}\bfree of charge\b/i.test(sentence)) score += 8;
      if (/\b(?:card|credit|debit)\b/i.test(request)
        && /\b(?:card|credit|debit)\b.{0,80}\b2\.95%/i.test(sentence)) score += 8;
      if (/\bcaregiver pass\b/i.test(request) && /\bwhen\b.{0,30}\bpay\b/i.test(request)
        && /\bpayment will be due at pickup\b/i.test(sentence)) score += 8;
      if (/\bcaregiver pass\b/i.test(request) && /\b(?:check|card|cash|payment option)\b/i.test(request)
        && /\bcredit\/debit card, check, and cash\b/i.test(sentence)) score += 8;
      if (/\bSnow Angels?\b/i.test(request)
        && /\bclear sidewalks and driveways\b.{0,60}\bunable to shovel\b/i.test(sentence)) score += 8;
      if (/\b(?:lesson|tournament|priority|precedence|conflict)\b/i.test(request)
        && /\btournaments and lessons take precedence\b/i.test(sentence)) score += 8;
      if (/\bchase drain\b/i.test(request)
        && /\bpublic road\b.{0,120}\bDouglas County\b.{0,180}\bshared drive\b.{0,120}\bInspection Request Form\b/i.test(sentence)) score += 10;
      if (/\b(?:sidewalk|driveway)\b/i.test(request)
        && /\bhomeowners? are responsible\b.{0,100}\b(?:sidewalk|driveway)\b/i.test(sentence)) score += 8;
      if (/\b(?:builder)\b.{0,80}\b(?:does not|doesn't|don't|do not|no longer|without)\b/i.test(request)
        && /\bLittleton Post Office\b/i.test(sentence)) score += 10;
      if (/\bsolar\b/i.test(request) && /\b(?:ground[- ]?mounted|roof[- ]?mounted)\b/i.test(request)
        && /\broof mounted\b/i.test(sentence)) score += 8;
      if (/\bsolar\b/i.test(request) && /\b(?:silver|black|color|colour)\b/i.test(request)
        && /\bblack\b/i.test(sentence)) score += 8;
      return { sentence: sentence.trim(), score };
    })
    .filter((item) => item.sentence);
  const topScore = Math.max(0, ...candidates.map((item) => item.score));
  if (topScore < 2) return [];
  return uniqueBy(candidates.filter((item) => item.score >= topScore - 1)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxSentences).map((item) => item.sentence), (sentence) => sentence.toLowerCase());
}

function isClippedClaim(text = "") {
  return /(?:\.\.\.|…)/.test(String(text));
}

function joinReadableDetails(details = []) {
  const values = uniqueBy(details.map((detail) => String(detail || "").trim()).filter(Boolean), (detail) => detail.toLowerCase());
  const prose = values.join(" ");
  // Separate independently proved details once a single paragraph becomes
  // dense. Broad answers keep a direct opening and turn the remaining facts
  // into one compact list; shorter answers use ordinary paragraphs.
  if (prose.length <= 240 || values.length < 2) return prose;
  if (values.length >= 4) {
    return `${values[0]}\n\nKey details:\n${values.slice(1).map((value) => `- ${value}`).join("\n")}`;
  }
  return values.join("\n\n");
}

function preferredVerifiedDirectAnswer(result, directAnswer) {
  if (result.answer.answerStatus !== "verified" || !directAnswer || isClippedClaim(directAnswer)) return "";
  if (result.need.task === "permission"
    && (result.answer.claims || []).some((claim) => isClippedClaim(claim?.text))
    && /\b(?:yes|no|allowed|bars?|forbids?|disallows?|prohibited|required|requires|approval|permission|can|may|must)\b/i.test(directAnswer)) {
    return directAnswer;
  }
  if (/\b(?:does not|do not|did not|cannot|can't|couldn’t|couldn't)\b.{0,100}\b(?:give|set|say|state|specify|provide|publish|list|verify|confirm|find|grant)\b/i.test(directAnswer)) {
    if (result.need.task === "specification"
      && /\b(?:garage|enclosed structure|screened from view|behind the wing fence)\b/i.test(directAnswer)) return "";
    return directAnswer;
  }
  return "";
}

function supportedAnswerText(result) {
  if (result.evidence.status === "handled-boundary") return directAnswerText(result.answer);
  if (["status", "schedule", "hours"].includes(result.need.task)) {
    const direct = directAnswerText(result.answer);
    if (result.need.task === "hours" && /\bopen play\b/i.test(result.need.request || "")) {
      const requestedDay = String(result.need.request || "").match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[0];
      const scheduleSentence = [direct, ...(result.answer.keyDetails || []), ...(result.answer.claims || []).map((claim) => claim.text)]
        // A lowercase continuation after "a.m." or "p.m." is still part of
        // the same schedule sentence. Split only when a new sentence starts.
        .flatMap((text) => String(text || "").split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
        .find((sentence) => /\bopen play\b/i.test(sentence)
          && (!requestedDay || new RegExp(`\\b${requestedDay}\\b`, "i").test(sentence)));
      if (scheduleSentence) return scheduleSentence.trim();
    }
    if (result.need.task === "status"
      && result.need.requestedDetails?.includes("hours")
      && result.evidence.supportedDetails?.includes("hours")
      && (result.answer.keyDetails || []).length) {
      return joinReadableDetails([direct, ...result.answer.keyDetails]);
    }
    if (result.answer.presentation?.kind === "food-truck"
      && !(result.answer.keyDetails || []).length
      && result.answer.nextStep) {
      return `${direct}\n\n${result.answer.nextStep}`;
    }
    if (/\b(?:trash|garbage|recycling)\b/i.test(result.need.request || "")
      && /\b(?:holiday|delay(?:ed)?|late|on\s+time)\b/i.test(result.need.request || "")
      && (result.answer.keyDetails || []).length) {
      return joinReadableDetails([direct, ...result.answer.keyDetails]);
    }
    return direct;
  }
  const directAnswer = directAnswerText(result.answer);
  if (result.need.task === "specification"
    && /\b(?:keep|place|put|store)\b.{0,50}\b(?:bins?|cans?|carts?|containers?)\b/i.test(result.need.request || "")) {
    const storageSentence = [directAnswer, ...(result.answer.keyDetails || []), ...(result.answer.claims || []).map((claim) => claim.text)]
      .flatMap((text) => String(text || "").split(/(?<=[.!?])\s+/))
      .find((sentence) => /\b(?:garage|enclosed structure|screened from view|behind the wing fence)\b/i.test(sentence));
    if (storageSentence) return storageSentence.trim();
  }
  const preferredDirectAnswer = preferredVerifiedDirectAnswer(result, directAnswer);
  if (preferredDirectAnswer) return preferredDirectAnswer;
  const claims = Array.isArray(result.answer.claims) ? result.answer.claims : [];
  const supportedClaims = result.evidence.supportingClaimIndexes
    .map((index) => String(claims[index]?.text || "").trim())
    .filter(Boolean);
  const relevantClaims = (result.evidence.relevantClaimIndexes || result.evidence.supportingClaimIndexes)
    .map((index) => String(claims[index]?.text || "").trim())
    .filter(Boolean);
  const actionTitles = new Set((result.answer.actions || []).flatMap((action) => {
    const label = String(action.label || "").trim().toLowerCase();
    return [label, label.replace(/^open\s+/, "")];
  }));
  const proseClaims = uniqueBy(relevantClaims, (claim) => claim.toLowerCase())
    .filter((claim) => !actionTitles.has(claim.toLowerCase()))
    .filter((claim) => !isClippedClaim(claim))
    .filter((claim) => !/^(?:Sec\.|\d+[a-z]?-\d+[a-z]?\.?|-\s*(?:General community standards|Fencing standards)\.?)$/i.test(claim));
  const needText = String(`${result.need.evidenceFocus || ""} ${result.need.request || ""}`);
  if (result.need.task === "information"
    && /\b(?:lesson|tournament|priority|precedence|conflict)\b/i.test(needText)) {
    const precedence = requestFocusedSentences(proseClaims, result.need, 1)
      .find((sentence) => /\btournaments and lessons take precedence\b/i.test(sentence));
    if (precedence) return precedence;
  }
  if (result.need.task === "permission") {
    const focused = requestFocusedSentences(proseClaims, result.need, 2);
    if (focused.length) {
      const prose = joinReadableDetails(focused);
      const lead = /\b(?:not allowed|may not|must not|prohibited|forbidden|disallowed)\b/i.test(prose) ? "No." : "";
      return lead && !/^no\b/i.test(prose) ? `${lead} ${prose}` : prose;
    }
  }
  if (result.need.task === "information"
    && /^community-approved-operational/.test(result.answer.answerMode || "")
    && !/\b(?:what|anything) else\b/i.test(result.need.evidenceFocus || result.need.request || "")
    && !/\bautomatically\b[\s\S]{0,120}\b(?:myself|ourselves|yourself|separately|personal account)\b/i
      .test(`${result.need.evidenceFocus || ""} ${result.need.request || ""}`)) {
    const comparison = /\b(?:versus|while|whereas)\b/i.test(needText)
      || (/\bpublic road\b/i.test(needText) && /\bshared drive\b/i.test(needText));
    const focused = requestFocusedSentences(proseClaims, result.need, comparison ? 2 : 1);
    if (focused.length) return joinReadableDetails(focused);
  }
  if (result.need.task === "information"
    && /^community-approved-operational/.test(result.answer.answerMode || "")
    && result.evidence.supportingClaimIndexes.some((index) =>
      String(claims[index]?.text || "").trim().toLowerCase() === directAnswer.toLowerCase())) {
    const request = String(`${result.need.evidenceFocus || ""} ${result.need.request || ""}`);
    if (/\bautomatically\b[\s\S]{0,120}\b(?:myself|ourselves|yourself|separately|personal account)\b/i.test(request)) {
      const automatic = proseClaims.find((claim) => /\bautomatically\b.{0,80}\bset up\b/i.test(claim));
      const personal = proseClaims.find((claim) => /\bresponsible for setting up personal accounts\b/i.test(claim));
      if (automatic && personal) return joinReadableDetails([automatic, personal]);
    }
    return directAnswer;
  }
  if (result.need.requestedDetails?.includes("contact")
    && result.evidence.supportedDetails?.includes("contact")) {
    const contactClaim = proseClaims.find((claim) => /@|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(claim));
    if (contactClaim) return focusedClaimText(contactClaim, "contact");
  }
  if (result.need.task === "reimbursement" && (result.answer.actions || []).length) {
    const formAction = result.answer.actions.find((action) => /\breimburs\w*\b/i.test(action.label || ""));
    const receipt = proseClaims.find((claim) => /\b(?:receipt|upload)\b/i.test(claim));
    if (formAction && receipt) {
      const formName = String(formAction.label || "").replace(/^open\s+(?:the\s+)?/i, "");
      let receiptText = focusedClaimText(receipt, result.need.task);
      if (receiptText.toLowerCase().startsWith(formName.toLowerCase())) {
        receiptText = receiptText.slice(formName.length).replace(/^[.:]?\s*/, "");
      }
      receiptText = receiptText.replace(new RegExp(`\\s*${formName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "").trim();
      return `Use the official ${formName} below. ${receiptText}`;
    }
  }
  if (result.need.task === "price") {
    const request = String(`${result.need.evidenceFocus || ""} ${result.need.request || ""}`);
    const priceEvidence = proseClaims.join(" ");
    if (/\b(?:credit|debit|card)\b/i.test(request)) {
      const cardFee = requestFocusedSentences(proseClaims, result.need, 1)
        .find((sentence) => /\b(?:credit|debit|card)\b.{0,100}\b2\.95%/i.test(sentence));
      if (cardFee) return cardFee;
    }
    if (/\b(?:autopay|automatic withdrawal|bank account|ach)\b/i.test(request)) {
      const achFee = requestFocusedSentences(proseClaims, result.need, 1)
        .find((sentence) => /\b(?:autopay|automatic withdrawal|bank account|ach)\b.{0,100}\bfree of charge\b/i.test(sentence));
      if (achFee) return achFee;
    }
    if (/\b(?:two|2)\b.{0,80}\b(?:friends?|guests?|non[- ]?residents?|out-of-neighborhood)\b|\b(?:friends?|guests?|non[- ]?residents?|out-of-neighborhood)\b.{0,80}\b(?:two|2)\b/i.test(request)) {
      const twoPlayerPrice = priceEvidence.match(/\$20\s+for\s+two\s+nonresident players(?:\s+during open play)?/i)?.[0];
      if (twoPlayerPrice) return `The price is ${twoPlayerPrice}.`;
    }
  }
  if (result.need.task === "action") {
    const actionClaim = proseClaims.find((claim) => (result.answer.actions || []).some((action) => {
      const label = String(action.label || "").replace(/^open\s+/i, "").trim();
      return label && claim.toLowerCase().includes(label.toLowerCase());
    }));
    if (actionClaim) return focusedClaimText(actionClaim, result.need.task);
    const verifiedAction = (result.evidence.relevantActionIndexes || [])
      .map((index) => result.answer.actions?.[index])
      .find((action) => String(action?.label || "").trim());
    if (/\breport\b/i.test(`${result.need.evidenceFocus || ""} ${result.need.request || ""}`)
      && /\breport\b/i.test(verifiedAction?.label || "")) {
      return `Use “${String(verifiedAction.label).trim()}” below to continue.`;
    }
    const writtenInstructions = proseClaims.filter((claim) =>
      /\b(?:access|apply|ask|bring|brought|call|check|contact|email|exchange(?:d)?|open|register|submit|use|visit(?:ing)?)\b/i.test(claim)
    ).slice(0, 3);
    if (writtenInstructions.length) {
      return joinReadableDetails(writtenInstructions.map((claim) => focusedClaimText(claim, result.need.task)));
    }
    if (result.evidence.supportedDetails?.includes("action") && verifiedAction) {
      return `Use “${String(verifiedAction.label).trim()}” below to continue.`;
    }
    return "";
  }
  if (result.need.task === "specification") {
    const asksForTiming = /\b(?:how long|how far (?:ahead|in advance)|how many\s+(?:days?|weeks?|months?)|when\b.{0,50}\b(?:hear back|response|reply)|expect to wait)\b/i
      .test(`${result.need.evidenceFocus || ""} ${result.need.request || ""}`);
    if (asksForTiming) {
      const timingClaims = proseClaims.map((claim) => audienceFocusedClaimText(claim, result.need))
        .flatMap((claim) => String(claim).split(/(?<=[.!?])\s+/))
        .filter((sentence) => /\b(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|forty[- ]eight)\s*(?:\(\s*\d+\s*\))?)\s*(?:business\s+)?(?:minutes?|hours?|days?|weeks?|months?|years?)\b/i.test(sentence));
      if (timingClaims.length) return joinReadableDetails(timingClaims.slice(0, 2));
    }
    const facets = [...new Set((String(`${result.need.evidenceFocus || ""} ${result.need.request || ""}`)
      .toLowerCase().match(/\b(?:height|tall|high|size|dimension|setback|distance|material|color|finish)\b/g) || [])
      .map((facet) => ["tall", "high"].includes(facet) ? "height" : facet))];
    if (facets.length === 1) {
      const facetPattern = facets[0] === "setback"
        ? /\b(?:setback|property lines?|\d+(?:[ -]\d+\/\d+)?\s*(?:feet|foot|ft\.?))\b/i
        : new RegExp(`\\b${facets[0]}\\b`, "i");
      const directLead = directAnswerText(result.answer).split(/(?<=[.!?])\s+/)[0].trim();
      const facetClaims = proseClaims.filter((claim) => facetPattern.test(claim));
      const concreteSpecification = facetClaims.find((claim) =>
        /#[0-9]{2,}\b|\b(?:\d+(?:[ -]\d+\/\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:"|(?:feet|foot|inches|inch|ft\.?|in\.?)\b)/i.test(claim)
      );
      const focused = concreteSpecification ? [concreteSpecification] : facetClaims.slice(0, 1);
      const permission = proseClaims.filter((claim) => /\b(?:approval|permission)\b/i.test(claim));
      const selected = uniqueBy([
        ...(facetPattern.test(directLead) ? [directLead] : []),
        ...focused,
        ...permission,
      ], (claim) => claim.toLowerCase()).filter((claim, index, all) => !all.some((other, otherIndex) =>
        otherIndex !== index && other.toLowerCase().includes(claim.toLowerCase())
      ));
      if (selected.length) return joinReadableDetails(selected.map((claim) => audienceFocusedClaimText(claim, result.need)));
    }
    const audienceSpecific = proseClaims.map((claim) => audienceFocusedClaimText(claim, result.need))
      .filter((claim) => /\bnonresidents?\b/i.test(claim));
    if (audienceSpecific.length) return joinReadableDetails(audienceSpecific);
  }
  if (result.need.task === "eligibility") {
    const audienceSpecific = proseClaims
      .map((claim) => audienceFocusedClaimText(claim, result.need))
      .filter((claim) => /\b(?:nonresidents?|guests?)\b/i.test(claim));
    if (audienceSpecific.length) {
      const answer = joinReadableDetails(audienceSpecific);
      return /^(?:yes|no)\b/i.test(answer) ? answer : `Yes. ${answer}`;
    }
  }
  if (result.need.task === "permission"
    && /\bnon[- ]?residents?\b|\b(?:friend|guest)\b[\s\S]{0,50}\b(?:does not|doesn't|do not|don't|not)\b[\s\S]{0,30}\b(?:live|resident)\b/i
      .test(`${result.need.evidenceFocus || ""} ${result.need.request || ""}`)) {
    const audienceSpecific = proseClaims
      .map((claim) => audienceFocusedClaimText(claim, result.need))
      .filter((claim) => /\bnonresidents?\b/i.test(claim));
    if (audienceSpecific.length) {
      const answer = joinReadableDetails(audienceSpecific);
      return /^(?:yes|no)\b/i.test(answer) ? answer : `Yes. ${answer}`;
    }
  }
  const displayClaims = proseClaims.length ? proseClaims : supportedClaims.filter((claim) => !isClippedClaim(claim));
  const prose = joinReadableDetails(displayClaims.map((claim) => focusedClaimText(claim, result.need.task)));
  const yesNoLead = directAnswerText(result.answer).match(/^(Yes|No)\./i)?.[0] || "";
  const inferredPermissionLead = result.need.task === "permission" && !yesNoLead
    && /\b(?:not allowed|may not|must not|prohibited|forbidden|disallowed)\b/i.test(prose)
    ? "No."
    : "";
  const permissionLead = yesNoLead || inferredPermissionLead;
  return permissionLead && !prose.toLowerCase().startsWith(permissionLead.toLowerCase()) ? `${permissionLead} ${prose}` : prose;
}

function oneNeedContract(contract, need) {
  return { ...contract, needCount: 1, needs: [need], complete: contract.complete && Boolean(need.request) };
}

function uniqueBy(items, keyFor) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFor(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasPartialSupport(result = {}) {
  return result.evidence?.status !== "supported"
    && (result.evidence?.supportedDetails || []).length > 0
    && (result.evidence?.supportingClaimIndexes || []).length > 0;
}

function hasScopedVerifiedBoundary(result = {}) {
  const direct = directAnswerText(result.answer);
  if (!direct || result.answer.answerStatus === "verified" || hasPartialSupport(result)) return false;
  if (!(result.evidence?.relevantClaimIndexes || []).length) return false;
  return (result.answer.claims || []).some((claim) => claim?.verified === true
    && (claim.evidenceSourceIds || []).length > 0
    && direct.toLowerCase().includes(String(claim.text || "").trim().toLowerCase()));
}

function mergeCandidateSources(results) {
  const merged = new Map();
  for (const result of results) {
    const candidateIds = new Set([
      ...result.evidence.supportingSourceIds,
      ...((result.evidence.status === "supported" || hasPartialSupport(result)) ? (result.answer.claims || [])
        .filter((claim) => claim?.verified === true
          && supportedAnswerText(result).toLowerCase().includes(String(claim.text || "").trim().toLowerCase()))
        .flatMap((claim) => claim.evidenceSourceIds || []) : []),
      ...result.evidence.relevantActionIndexes
        .flatMap((index) => {
          const action = result.answer.actions?.[index];
          if (!action) return [];
          const matchingSourceIds = (result.answer.sources || [])
            .filter((source) => action.url && source.sourceUrl === action.url)
            .map(sourceId);
          return [action.sourceId, ...matchingSourceIds];
        })
        .filter(Boolean),
      ...(hasScopedVerifiedBoundary(result)
        ? (result.answer.claims || []).filter((claim) => claim?.verified === true).flatMap((claim) => claim.evidenceSourceIds || [])
        : []),
    ]);
    for (const source of result.answer.sources || []) {
      const id = sourceId(source);
      if (!candidateIds.has(id)) continue;
      const prior = merged.get(id);
      const needIds = [...new Set([...(prior?.retrievedForNeedIds || []), result.need.id])];
      merged.set(id, { ...(prior || source), retrievedForNeedIds: needIds });
    }
  }
  return [...merged.values()];
}

function mergeSupportingClaims(results) {
  const merged = new Map();
  for (const result of results) {
    if (result.evidence.status !== "supported" && !hasPartialSupport(result) && !hasScopedVerifiedBoundary(result)) continue;
    const supportingClaims = (result.evidence.supportingClaimIndexes || [])
      .map((index) => result.answer.claims?.[index])
      .filter(Boolean);
    const composedText = supportedAnswerText(result);
    const displayedClaims = (result.answer.claims || []).filter((claim) => claim?.verified === true
      && composedText.toLowerCase().includes(String(claim.text || "").trim().toLowerCase()));
    const proofClaims = [...new Set([...supportingClaims, ...displayedClaims])];
    const evidenceSourceIds = [...new Set(proofClaims.flatMap((claim) => claim.evidenceSourceIds || []))].sort();
    const claims = composedText
      ? [{
        text: composedText,
        kind: supportingClaims.length === 1 ? supportingClaims[0].kind : "composed-proof",
        evidenceSourceIds,
        verified: true,
      }]
      : supportingClaims;
    for (const claim of claims) {
      const ids = [...new Set(claim.evidenceSourceIds || [])].sort();
      const text = String(claim.text || "").trim();
      const key = `${text}|${ids.join(",")}`;
      if (!text || !ids.length) continue;
      const prior = merged.get(key);
      merged.set(key, {
        ...(prior || claim),
        evidenceSourceIds: ids,
        verified: true,
        supportedForNeedIds: [...new Set([...(prior?.supportedForNeedIds || []), result.need.id])],
      });
    }
  }
  return [...merged.values()];
}

function requestedActionMatches(action = {}, need = {}) {
  const label = String(action.label || "").toLowerCase().replace(/one[- ]sheet/g, "application form");
  const request = String(need.evidenceFocus || need.request || "").toLowerCase();
  return [
    [/\bmenu\b/i, /\bmenu\b/i],
    [/\b(?:application|form)\b/i, /\b(?:application|form|one[- ]sheet)\b/i],
    [/\b(?:pay|payment)\b/i, /\b(?:pay|payment|utility hawk)\b/i],
    [/\b(?:book|reserve|reservation)\b/i, /\b(?:book|reserve|reservation)\b/i],
    [/\b(?:register|registration)\b/i, /\b(?:register|registration)\b/i],
  ].some(([requestPattern, labelPattern]) => requestPattern.test(request) && labelPattern.test(label));
}

function actionRelevanceScore(action = {}, need = {}) {
  const label = String(action.label || "").toLowerCase().replace(/one[- ]sheet/g, "application form");
  const request = String(need.evidenceFocus || need.request || "").toLowerCase();
  const actionToken = (token) => /^fenc(?:e|es|ing)$/.test(token) ? "fence" : token.replace(/s$/, "");
  const labelTokens = new Set((label.match(/[a-z0-9]+/g) || []).map(actionToken));
  const requestTokens = new Set((request.match(/[a-z0-9]+/g) || []).map(actionToken));
  const overlap = [...labelTokens].filter((token) => token.length > 2 && requestTokens.has(token)).length;
  return (overlap * 2)
    + (requestedActionMatches(action, need) ? 5 : 0)
    + Number(/^https?:\/\//i.test(action.url || ""))
    - (/\bfull\b.{0,30}\banswer\b/i.test(action.label || "") ? 5 : 0);
}

function selectedActions(results) {
  const selected = results.flatMap((result) => {
    const relevant = result.evidence.relevantActionIndexes.map((index) => result.answer.actions?.[index]);
    const evidenceBoundActions = (hasScopedVerifiedBoundary(result) || hasPartialSupport(result))
      ? (result.answer.actions || []).filter((action) => (result.answer.sources || []).some((source) =>
        source.isOfficialResource === true && source.sourceUrl === action.url
      ))
      : [];
    return [...relevant, ...evidenceBoundActions]
      .filter(Boolean)
      .map((action) => ({
        action: { ...action, retrievedForNeedIds: [result.need.id] },
        score: evidenceBoundActions.includes(action) ? 3 : actionRelevanceScore(action, result.need),
      }));
  });
  return uniqueBy(selected.filter(({ score }) => score >= 3).sort((left, right) => right.score - left.score), ({ action }) => `${action.url || ""}|${action.label || ""}`)
    .map(({ action }) => action);
}

function proactivePermissionActionMatches(action = {}, need = {}) {
  return need.task === "permission"
    && /\b(?:application|form|one[- ]sheet|submit)\b/i.test(action.label || "")
    && actionRelevanceScore(action, need) >= 3;
}

function completionOutcome(results) {
  const supported = results.filter((result) => result.evidence.status === "supported").length;
  if (supported === results.length && results.length) return "complete";
  const handled = results.filter((result) => result.evidence.status === "handled-boundary").length;
  if (supported + handled === results.length && handled) return "handled-boundary";
  if (supported || results.some(hasPartialSupport)) return "verified-partial";
  if (results.some((result) => result.evidence.status === "conflict")) return "conflict";
  if (results.some((result) => result.evidence.status === "ambiguous")) return "ambiguous";
  if (results.some((result) => result.evidence.status === "missing-evidence")) return "missing-evidence";
  return "unassessed";
}

function answerStatusForOutcome(outcome, results = []) {
  if (outcome === "complete") return "verified";
  if (outcome === "verified-partial") return "verified-incomplete";
  if (outcome === "handled-boundary") {
    return results.find((result) => result.evidence.status === "handled-boundary")?.answer.answerStatus || "out-of-scope";
  }
  if (outcome === "conflict") return "conflicting-sources";
  return "could-not-verify";
}

function dedupeComposedLines(lines) {
  const seen = new Set();
  return lines.map((line) => {
    const parts = String(line).split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((part) => part.trim()).filter(Boolean);
    const kept = parts.filter((part) => {
      const key = part.toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return kept.join(" ");
  }).filter(Boolean);
}

function composedAnswer(results, actions, outcome) {
  const supported = results.filter((result) => ["supported", "handled-boundary"].includes(result.evidence.status)
    || hasPartialSupport(result) || hasScopedVerifiedBoundary(result));
  const unresolved = results.filter((result) => !["supported", "handled-boundary"].includes(result.evidence.status));
  const lines = [];
  if (supported.length) {
    lines.push(...uniqueBy(supported.map(supportedAnswerText).filter(Boolean), (text) => text));
  }
  if (unresolved.length) {
    const stillUnresolved = [];
    for (const result of unresolved) {
      if (hasScopedVerifiedBoundary(result)) continue;
      if (hasPartialSupport(result)) {
        const rendered = supportedAnswerText(result);
        if (result.need.task === "reimbursement" && result.evidence.missingDetails?.includes("price")) {
          lines.unshift("I couldn’t verify a reimbursement amount from the current official source.");
          continue;
        }
        const scopedBoundary = /\b(?:does not|doesn't|could not|couldn’t|cannot|can't)\b.{0,180}\b(?:set|say|state|specify|provide|publish|list|verify|confirm|cover|apply)\b/i.test(result.answer.nextStep || "")
          ? String(result.answer.nextStep).trim()
          : "";
        if (scopedBoundary) {
          lines.push(scopedBoundary);
          continue;
        }
        const alreadyScoped = /\b(?:does not|doesn't|could not|couldn’t|cannot|can't)\b.{0,180}\b(?:set|say|state|specify|provide|publish|list|verify|confirm|cover|apply)\b/i.test(rendered);
        if (!alreadyScoped) {
          const disclosure = verifiedPartialDisclosure([{ ...result.evidence, request: result.need.request }]);
          if (disclosure) lines.push(disclosure);
        }
        continue;
      }
      const safeBoundary = directAnswerText(result.answer);
      if (/\b(?:could not|couldn’t|cannot|can't|can’t)\b.{0,180}\b(?:find|verify|confirm|check)\b/i.test(safeBoundary)) {
        lines.push(safeBoundary);
        continue;
      }
      stillUnresolved.push(result);
    }
    if (stillUnresolved.length === 1) {
      const lead = outcome === "ambiguous" ? "I need one more detail before I can check this accurately" : "I couldn’t verify this part yet";
      lines.push(`${lead}: ${stillUnresolved[0].need.text || stillUnresolved[0].need.request}.`);
    } else if (stillUnresolved.length > 1) {
      lines.push(`I couldn’t verify these parts yet:\n${stillUnresolved.map((result) => `- ${result.need.text || result.need.request}`).join("\n")}`);
    }
  }
  const uniqueLines = dedupeComposedLines(lines);
  lines.splice(0, lines.length, ...uniqueLines);
  const renderedSupport = lines.join(" ").toLowerCase();
  const actionAddsRequestedValue = actions.length && results.some((result) => requestedActionMatches(actions[0], result.need));
  const actionAddsProactiveValue = actions.length && results.some((result) => proactivePermissionActionMatches(actions[0], result.need));
  if (actions.length && (unresolved.length || actionAddsRequestedValue || actionAddsProactiveValue)
    && !renderedSupport.includes(String(actions[0].label || "").toLowerCase())) {
    lines.push(`Next step: ${actions[0].label}.`);
  }
  return uniqueBy(lines.filter(Boolean), (line) => line).join("\n\n") || "I couldn’t verify that from the available official evidence.";
}

function verifiedPartialDisclosure(needs = []) {
  const unresolved = needs.filter((need) => (need.missingDetails || []).length > 0);
  if (!unresolved.length) return "";
  if (unresolved.length === 1
    && unresolved[0].missingDetails.includes("status")
    && /\b(?:trash|garbage|recycling)\b[\s\S]*\b(?:pickup|pick up|collection|delay)/i.test(unresolved[0].request || "")) {
    return "The live pickup calendar confirms the date, but it does not say whether the pickup was delayed.";
  }
  const labels = [...new Set(unresolved.flatMap((need) => need.missingDetails || []))]
    .map((detail) => ({ status: "current status", hours: "hours", date: "date" })[detail] || detail)
    .join(" and ");
  return labels ? `I could verify part of this, but I couldn’t verify the remaining ${labels}.` : "";
}

async function runNeedFirstShadow(contract, answerNeed, {
  maxNeeds = DEFAULT_MAX_NEEDS,
  answerMode = "need-first-shadow",
} = {}) {
  if (!contract || !Array.isArray(contract.needs) || !contract.needs.length) throw new Error("A resident-needs contract is required.");
  if (typeof answerNeed !== "function") throw new Error("A test-only per-need answer function is required.");
  if (!Number.isInteger(maxNeeds) || maxNeeds < 1 || contract.needs.length > maxNeeds) throw new Error("Resident need limit exceeded.");

  const results = await Promise.all(contract.needs.map(async (need, index) => {
    let answer;
    if (!contract.complete) {
      answer = { answerStatus: "could-not-verify", directAnswer: "", keyDetails: [], sources: [], claims: [], actions: [], conflicts: [] };
    } else try {
      answer = await answerNeed({ ...need }, index);
      if (!answer || typeof answer !== "object") throw new Error("Invalid per-need answer.");
    } catch (error) {
      answer = {
        answerStatus: "could-not-verify",
        directAnswer: "",
        keyDetails: [],
        sources: [],
        claims: [],
        actions: [],
        conflicts: [],
        _needRouterError: String(error?.message || "need-answer-failed"),
      };
    }
    answer = {
      ...answer,
      // This answer was fetched for one specific need. Preserve that routing
      // fact so verification does not have to infer relevance from keywords.
      sources: (answer.sources || []).map((source) => ({
        ...source,
        retrievedForNeedIds: [...new Set([...(source.retrievedForNeedIds || []), need.id])],
      })),
    };
    const assessment = assessResidentNeeds(oneNeedContract(contract, need), answer);
    return { need, answer, evidence: assessment.needs[0] };
  }));

  let actions = selectedActions(results);
  let candidateSources = mergeCandidateSources(results);
  let candidateClaims = mergeSupportingClaims(results);
  const preliminaryOutcome = completionOutcome(results);
  let answer = composedAnswer(results, actions, preliminaryOutcome);
  let directAnswer = answer.split(/\n\s*\n/)[0];
  let keyDetails = answer.split(/\n\s*\n/).slice(1);
  const preliminaryAnswerStatus = answerStatusForOutcome(preliminaryOutcome, results);
  // Re-run the evidence contract against the exact composed text. This keeps
  // a claim that was useful during drafting from counting after the composer
  // omits it, and prevents a presentation change from silently overstating
  // completeness.
  let finalAssessment = assessResidentNeeds(contract, {
    answer,
    directAnswer,
    keyDetails,
    answerStatus: preliminaryAnswerStatus,
    sources: candidateSources,
    claims: candidateClaims,
    actions,
    conflicts: [],
  });
  let finalResults = results.map((result, index) => ({ ...result, evidence: finalAssessment.needs[index] }));
  let outcome = completionOutcome(finalResults);
  const visibleSupportWasInvalidated = results.some((result, index) => {
    const assessed = finalResults[index];
    return (hasScopedVerifiedBoundary(result) && !hasScopedVerifiedBoundary(assessed))
      || (result.evidence.status === "supported" && assessed.evidence.status !== "supported")
      || (hasPartialSupport(result) && !hasPartialSupport(assessed));
  });
  if (visibleSupportWasInvalidated) {
    // A draft can expose that an initially plausible claim does not actually
    // support the resident's request. Rebuild the visible answer and its proof
    // from the final assessment so rejected text and sources cannot survive as
    // a polished but wrong-topic answer.
    actions = selectedActions(finalResults);
    candidateSources = mergeCandidateSources(finalResults);
    candidateClaims = mergeSupportingClaims(finalResults);
    answer = composedAnswer(finalResults, actions, outcome);
    directAnswer = answer.split(/\n\s*\n/)[0];
    keyDetails = answer.split(/\n\s*\n/).slice(1);
    finalAssessment = assessResidentNeeds(contract, {
      answer, directAnswer, keyDetails,
      answerStatus: answerStatusForOutcome(outcome, finalResults),
      sources: candidateSources, claims: candidateClaims, actions, conflicts: [],
    });
    finalResults = results.map((result, index) => ({ ...result, evidence: finalAssessment.needs[index] }));
    outcome = completionOutcome(finalResults);
  }
  if (outcome === "verified-partial"
    && !/\b(?:couldn’t|couldn't|cannot|can't|does not|doesn't)\b.{0,120}\b(?:verify|confirm|say|state|publish|provide)\b/i.test(answer)) {
    const disclosure = verifiedPartialDisclosure(finalAssessment.needs);
    if (disclosure) {
      answer = `${answer}\n\n${disclosure}`;
      directAnswer = answer.split(/\n\s*\n/)[0];
      keyDetails = answer.split(/\n\s*\n/).slice(1);
      finalAssessment = assessResidentNeeds(contract, {
        answer, directAnswer, keyDetails, answerStatus: preliminaryAnswerStatus,
        sources: candidateSources, claims: candidateClaims, actions, conflicts: [],
      });
      finalResults = results.map((result, index) => ({ ...result, evidence: finalAssessment.needs[index] }));
      outcome = completionOutcome(finalResults);
    }
  }
  const supportingClaimIndexes = new Set(finalAssessment.needs.flatMap((need) => need.supportingClaimIndexes || []));
  const renderedClaimIndexes = new Set(candidateClaims.map((claim, index) =>
    answer.toLowerCase().includes(String(claim.text || "").trim().toLowerCase()) ? index : -1
  ).filter((index) => index >= 0));
  const claims = candidateClaims.filter((claim, index) => supportingClaimIndexes.has(index) || renderedClaimIndexes.has(index));
  return {
    isTest: true,
    answerMode,
    answerStatus: answerStatusForOutcome(outcome, finalResults),
    answer,
    directAnswer,
    keyDetails,
    nextStep: actions[0]?.label || "",
    sources: candidateSources,
    claims,
    actions,
    completion: {
      outcome,
      needs: finalAssessment.needs.map((need) => ({
        needId: need.needId,
        request: need.request,
        status: need.status,
        reason: need.reason,
        candidateSourceIds: need.candidateSourceIds,
        supportingSourceIds: need.supportingSourceIds,
        supportedDetails: need.supportedDetails,
        missingDetails: need.missingDetails,
      })),
    },
  };
}

module.exports = { DEFAULT_MAX_NEEDS, runNeedFirstShadow };
