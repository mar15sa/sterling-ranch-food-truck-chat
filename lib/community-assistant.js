const { buildAnswerContract, detectFactConflicts } = require("./community-contracts");
const { foodTruckAnswer, isFoodTruckQuestion } = require("./community-food-trucks");
const { claimsFromDraft } = require("./community-grounding");
const { planCommunitySearch: defaultPlanSearch, synthesizeCommunityAnswer: defaultSynthesize } = require("./community-llm");
const { classifyCommunityIntent, searchCommunityIndex, searchCommunityIndexWithQueries, tokens } = require("./community-search");
const { INPUT_CLASSIFICATIONS, classifyRulesInput, hasPromptInjectionSignals, normalizeInput } = require("./rules-input");

function sourceForDisplay(source) {
  return {
    ...source,
    nodeId: source.nodeId || `COMMUNITY_${String(source.id || "SOURCE").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
    sourceName: source.sourceName || "Official community website",
    isOfficialResource: true,
  };
}

function cleanAnswerText(value = "") {
  const cleaned = String(value)
    .replace(/\s*--\s*\d+\s+of\s+\d+\s*--\s*/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  let inFindings = false;
  let findingCount = 0;
  return cleaned.split(/\r?\n/).filter((line) => {
    if (/^What I found\s*:/i.test(line.trim())) { inFindings = true; return true; }
    if (/^Before you act\s*:/i.test(line.trim())) { inFindings = false; return true; }
    if (inFindings && /^[-•]\s+/.test(line.trim())) {
      findingCount += 1;
      return findingCount <= 3;
    }
    return true;
  }).join("\n");
}

function isOfficialCommunitySource(source = {}) {
  if (source.isOfficialResource) return true;
  try {
    return new URL(source.sourceUrl || "").hostname.toLowerCase() === "sterlingranchcab.com";
  } catch {
    return false;
  }
}

const GENERIC_EVIDENCE_TERMS = new Set([
  "account", "answer", "cab", "community", "contact", "does", "help", "hoa", "information",
  "number", "official", "phone", "question", "ranch", "rule", "rules", "sterling", "their",
]);

function hasDistinctiveCommunityEvidence(question, sources = []) {
  const distinctive = tokens(question).filter((token) => token.length >= 4 && !GENERIC_EVIDENCE_TERMS.has(token));
  if (!distinctive.length) return false;
  return sources.some((source) => {
    const evidence = `${source.title || ""} ${source.text || ""}`.toLowerCase();
    return distinctive.some((token) => evidence.includes(token));
  });
}

function officialCabHomepage() {
  return {
    title: "Official Sterling Ranch CAB website",
    sourceUrl: "https://sterlingranchcab.com/",
    text: "Official Sterling Ranch Community Authority Board website.",
    excerpt: "Official Sterling Ranch Community Authority Board website.",
    isOfficialResource: true,
  };
}

function safeRulesBoundaryAnswer(question, rulesAnswer = {}, index = {}) {
  const text = String(question);
  let directAnswer = "I could not verify a Sterling Ranch rule or official page that specifically answers that exact question.";
  let keyDetails = [];
  let nextStep = "Use the official CAB website below to confirm before acting; I won’t substitute a related rule for the missing answer.";
  let sources = [officialCabHomepage()];
  let actions = [{ label: "Open official CAB website", url: "https://sterlingranchcab.com/", actionType: "information" }];

  if (/\bremove\b.{0,30}\btrees?\b|\btrees?\b.{0,30}\bremove\b/i.test(text)) {
    directAnswer = "I could not verify blanket permission to remove a tree.";
    keyDetails = ["The current rules say dead trees must be replaced.", "A design change to the tree lawn requires DRC approval."];
    nextStep = "Confirm the tree’s location and condition with the DRC before removing it.";
    sources = (rulesAnswer.sources || []).filter((source) => /tree|landscape maintenance/i.test(source.title || "")).slice(0, 3);
    if (!sources.length) sources = [officialCabHomepage()];
  } else if (/\bfood\s*trucks?\b/i.test(text) && /\b(?:driveway|run|operate|business)\b/i.test(text)) {
    directAnswer = "I could not verify a Sterling Ranch rule that specifically allows operating a food-truck business from a residential driveway.";
    nextStep = "Confirm both CAB rules and Douglas County business requirements before operating or parking a commercial food truck at a home.";
  } else if (/\bquiet hours?\b/i.test(text)) {
    directAnswer = "I could not verify one community-wide quiet-hours rule in the connected official sources.";
    keyDetails = ["Facility hours are posted separately and should not be treated as a neighborhood-wide noise rule."];
    nextStep = "Use the official CAB website or contact the Resident Resource Center for the rule that applies to your location.";
  } else if (/\bmailbox\b/i.test(text)) {
    directAnswer = "I could not verify permission to repaint a neighborhood mailbox.";
    keyDetails = ["The connected exterior-paint rule applies to homes; it should not be reused as a mailbox-color rule."];
    nextStep = "Confirm with the CAB and USPS before altering a neighborhood mailbox unit.";
  } else if (/\binstagram\b/i.test(text)) {
    directAnswer = "I could not verify a current official CAB Instagram account from the connected official website.";
    nextStep = "Use the official CAB website below so an unverified social-media account is not presented as official.";
  } else if (/\bhelipad\b/i.test(text)) {
    directAnswer = "I could not verify a Sterling Ranch rule that specifically authorizes a residential helipad.";
    nextStep = "Contact the CAB and applicable county authorities before planning one; a shed or yard-art rule is not evidence for a helipad.";
  } else if (/\bhoa\b/i.test(text) && /\b(?:phone|number|contact)\b/i.test(text)) {
    const contactSource = (index?.sources || []).find((source) => /^Important Contact Information$/i.test(source.title || ""));
    const residentPhone = contactSource?.facts?.find((fact) => fact.type === "phone" && /Resident Resource Center/i.test(fact.context || ""));
    directAnswer = residentPhone
      ? `I could not verify a separate “HOA” phone number. The official CAB contact page lists the Resident Resource Center at ${residentPhone.value}.`
      : "I could not verify a separate “HOA” phone number; Sterling Ranch’s official site publishes CAB contacts instead.";
    nextStep = "Use the official Important Contact Information page to choose the current contact for your issue.";
    if (contactSource) {
      sources = [sourceForDisplay(contactSource)];
      actions = [{ label: "Open official Important Contact Information", url: contactSource.sourceUrl, actionType: "contact" }];
    }
  }

  const boundary = buildAnswerContract({ directAnswer, keyDetails, nextStep, actions, sources, status: "could-not-verify", answerMode: "community-rules-boundary" });
  return {
    ...boundary,
    answerVerdict: "unverified",
    inputClassification: rulesAnswer.inputClassification || "rules-question",
    confidence: { canAnswer: false, confidence: "high", reason: rulesAnswer.confidence?.reason || "no-exact-official-evidence" },
    reviewNeeded: false,
  };
}

function isWasteStorageRuleQuestion(question = "") {
  const text = String(question);
  return /\b(?:trash|garbage|recycling|waste|bins?|carts?|containers?)\b/i.test(text)
    && /\b(?:store|stored|storage|leave|left|overnight|curb|bring back|take back|taking|put out|outside|exact hour|what time)\b/i.test(text)
    && !/\b(?:pickup|pick up|collection|schedule|which day|what day)\b/i.test(text);
}

function sentenceScore(sentence, queryTokens, question = "") {
  const text = sentence.toLowerCase();
  return queryTokens.reduce((score, token) => score + (text.includes(token) ? 2 : 0), 0)
    + (/\$|@|\b\d{3}[-.)\s]\d{3}/.test(sentence) ? 1 : 0)
    + (/\b(?:contact|call|phone|email|who)\b/i.test(question) && /@|\b\d{3}[-.)\s]\d{3}/.test(sentence) ? 8 : 0)
    + (/\b(?:cost|price|fee|rate|deposit|how much)\b/i.test(question) && /\$/.test(sentence) ? 8 : 0)
    - (sentence.length > 420 ? 2 : 0);
}

function usefulSentences(question, sources, limit = 3) {
  const queryTokens = tokens(question);
  const candidates = [];
  for (const source of sources.slice(0, 3)) {
    const sentences = String(source.text || "")
      .replace(/^[^.!?]{0,180}?Skip to Main Content\s*/i, "")
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((sentence) => sentence.replace(/\s+/g, " ").trim())
      .filter((sentence) => sentence.length >= 35 && sentence.length <= 420);
    for (const sentence of sentences) candidates.push({ sentence, score: sentenceScore(sentence, queryTokens, question) });
  }
  const seen = new Set();
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .filter((item) => {
      const key = item.sentence.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((item) => item.sentence);
}

function relevantActions(question, sources, limit = 3) {
  const queryTokens = tokens(question);
  const generic = new Set(["apply", "application", "book", "call", "contact", "cost", "fee", "form", "pay", "price", "rent", "reserve", "reservation"]);
  const coreTokens = queryTokens.filter((token) => !generic.has(token));
  const actions = sources.flatMap((source) => (source.actions || []).map((action) => ({
    ...action,
    sourceTitle: source.title || "",
    explicitAction: source.connectorType === "official-action",
  })));
  const ranked = actions
    .map((action) => ({
      ...action,
      score: queryTokens.reduce((score, token) => score + (`${action.label} ${action.url} ${action.sourceTitle}`.toLowerCase().includes(token) ? 2 : 0), 0) + (action.explicitAction ? 20 : 0),
      coreMatch: !coreTokens.length || coreTokens.some((token) => `${action.label} ${action.url} ${action.sourceTitle}`.toLowerCase().includes(token)),
    }))
    .filter((action) => action.coreMatch && (action.score > 0 || actions.length === 1))
    .sort((a, b) => b.score - a.score)
    .filter((action, index, all) => all.findIndex((candidate) => candidate.url === action.url) === index)
    .slice(0, limit)
    .map(({ score, coreMatch, sourceTitle, explicitAction, ...action }) => action);
  if (ranked.length) return ranked;
  const top = sources[0];
  return top?.sourceUrl ? [{ label: `Open official ${top.title}`, url: top.sourceUrl, actionType: "information" }] : [];
}

function coveredDetails(requested, sources, actions) {
  const facts = sources.flatMap((source) => source.facts || []);
  return requested.filter((detail) => {
    if (detail === "action") return actions.length > 0;
    if (detail === "price") return facts.some((fact) => fact.type === "money");
    if (detail === "contact") return facts.some((fact) => ["phone", "email"].includes(fact.type));
    if (detail === "date") return facts.some((fact) => ["date", "schedule"].includes(fact.type)) || sources.some((source) => source.sourceType === "events");
    if (detail === "hours") return facts.some((fact) => fact.type === "time") || sources.some((source) => source.sourceType === "status");
    return true;
  });
}

function bestContactCandidate(question, sources) {
  const queryTokens = tokens(question).filter((token) => !["call", "contact", "email", "phone"].includes(token));
  const requestedType = /\bemail\b/i.test(question) ? "email" : /\b(?:phone|call|number)\b/i.test(question) ? "phone" : "";
  const candidates = sources.flatMap((source, sourceIndex) => (source.facts || [])
    .filter((fact) => ["phone", "email"].includes(fact.type))
    .filter((fact) => !requestedType || fact.type === requestedType)
    .map((fact) => ({
      source,
      context: fact.context || fact.value,
      score: queryTokens.reduce((score, token) => {
        const contextMatch = String(fact.context || "").toLowerCase().includes(token) ? 3 : 0;
        const titleMatch = String(source.title || "").toLowerCase().includes(token) ? 5 : 0;
        return score + contextMatch + titleMatch;
      }, Math.max(0, 5 - sourceIndex) * 2
        + (/@/.test(fact.context || "") && /\d{3}[-.)\s]\d{3}/.test(fact.context || "") ? 3 : 0)
        - (/^FAQs?\b/i.test(source.title || "") ? 5 : 0)),
    })));
  return candidates.sort((a, b) => b.score - a.score)[0] || null;
}

function bestContactContext(question, sources) {
  return bestContactCandidate(question, sources)?.context || "";
}

function contactDirectAnswer(sentence, sourceTitle, question = "") {
  const text = String(sentence || "").replace(/at::/gi, "at:").replace(/please completed\b/gi, "please complete");
  const wantsEmailOnly = /\bemail\b/i.test(question) && !/\b(?:phone|call|number)\b/i.test(question);
  const wantsPhoneOnly = /\b(?:phone|call|number)\b/i.test(question) && !/\bemail\b/i.test(question);
  const phone = wantsEmailOnly ? "" : text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/)?.[0];
  const email = wantsPhoneOnly ? "" : text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (!phone && !email) return text;
  const requestedSubject = String(question).match(/\b(?:contact|call|email)(?:\s+\w+){0,4}\s+(?:about|regarding|for)\s+(.+?)[?.!]*$/i)?.[1]
    || String(question).match(/\b(?:phone number|email)\s+(?:should i use\s+)?for\s+(.+?)[?.!]*$/i)?.[1];
  const label = requestedSubject || sourceTitle;
  return `For ${label}, ${[phone ? `call ${phone}` : "", email ? `email ${email}` : ""].filter(Boolean).join(" or ")}.`;
}

function extractiveAnswer(question, result) {
  let sources = result.sources.map(sourceForDisplay);
  if (!sources.length || Number(sources[0].score || 0) < 24) {
    return buildAnswerContract({
      directAnswer: "I could not verify that from the connected official community sources.",
      nextStep: "Try adding the service, facility, form, or rule you mean, or use the official community website below.",
      sources: result.index ? [{ title: `${result.index.communityName} official website`, sourceUrl: result.index.website, text: "Official community website", excerpt: "Official community website", isOfficialResource: true }] : [],
      status: "could-not-verify",
      answerMode: "community-no-source",
    });
  }
  if (result.requestedDetails.includes("contact")) {
    const contactCandidate = bestContactCandidate(question, sources);
    if (contactCandidate?.source) sources = [contactCandidate.source];
  }
  const sentences = usefulSentences(question, sources, 3);
  const scheduleFacts = sources.flatMap((source) => (source.facts || []).filter((fact) => fact.type === "schedule"));
  const operationalSourceLink = result.requestedDetails.some((detail) => ["contact", "date", "hours"].includes(detail));
  const actions = (operationalSourceLink || result.intent === "events") && sources[0]?.sourceUrl
    ? [{ label: `Open official ${sources[0].title}`, url: sources[0].sourceUrl, actionType: "information" }]
    : relevantActions(question, sources, 3);
  const covered = coveredDetails(result.requestedDetails, sources, actions);
  const complete = covered.length === result.requestedDetails.length;
  const directAnswer = result.requestedDetails.includes("date") && scheduleFacts.length
    ? `The official ${sources[0].title} schedule depends on your village or service area.`
    : result.intent === "events" && actions.length
    ? `Use the official ${sources[0].title} link below to find current community events.`
    : result.intent === "forms" && actions.length
    ? `Use the official ${sources[0].title} source below to open the current form or application.`
    : result.requestedDetails.includes("contact") && (bestContactContext(question, sources) || sentences[0])
      ? contactDirectAnswer(bestContactContext(question, sources) || sentences[0], sources[0].title, question)
    : sentences[0] || `The official ${sources[0].title} page is the closest current source for this question.`;
  const keyDetails = result.requestedDetails.includes("date") && scheduleFacts.length
    ? scheduleFacts.slice(0, 3).map((fact) => fact.value)
    : result.requestedDetails.includes("contact")
    ? []
    : result.intent === "forms"
      ? sentences.filter((sentence) => !/DRC design review architectural application/i.test(sentence)).slice(0, 2)
      : sentences.slice(1);
  const draft = { directAnswer, keyDetails };
  const claims = claimsFromDraft(draft, sources);
  const stale = sources.some((source) => source.staleAfter && new Date(source.staleAfter).getTime() < Date.now());
  return buildAnswerContract({
    directAnswer,
    keyDetails,
    nextStep: actions[0] ? `Use the “${actions[0].label}” link below for the current next step.` : `Open the official ${sources[0].title} page below for the current details.`,
    actions,
    sources,
    status: complete && !stale && claims.every((claim) => claim.verified) ? "verified" : "verified-incomplete",
    requestedDetails: result.requestedDetails,
    coveredDetails: covered,
    checkedAt: sources[0].checkedAt,
    answerMode: "community-source-extractive",
    claims,
  });
}

async function sourcedAnswer(question, result, options = {}) {
  const sources = result.sources.map(sourceForDisplay);
  if (!sources.length || Number(sources[0].score || 0) < 24) return extractiveAnswer(question, result);
  const conflicts = detectFactConflicts(sources, result.requestedDetails);
  if (conflicts.length) {
    return buildAnswerContract({
      directAnswer: "I found conflicting values in the connected official sources, so I can’t safely choose one for you.",
      nextStep: `Open the official ${sources[0].title} source below or contact the CAB to confirm the current value.`,
      actions: relevantActions(question, sources, 3),
      sources,
      status: "conflicting-sources",
      conflicts,
      requestedDetails: result.requestedDetails,
      answerMode: "community-source-conflict",
    });
  }

  // Contact details are exact structured facts, not prose for a model to
  // interpret. Keep phone numbers and email addresses on the deterministic
  // path so a grounded synthesis cannot accidentally omit or paraphrase them.
  if (result.requestedDetails.includes("contact")) {
    return extractiveAnswer(question, result);
  }

  const actions = relevantActions(question, sources, 3);
  const covered = coveredDetails(result.requestedDetails, sources, actions);
  const stale = sources.some((source) => source.staleAfter && new Date(source.staleAfter).getTime() < Date.now());
  const synthesize = options.synthesizeCommunityAnswer === false ? null : (options.synthesizeCommunityAnswer || defaultSynthesize);
  const aiDraft = synthesize ? await synthesize(question, sources, options.llmOptions || {}) : null;
  if (!aiDraft) return extractiveAnswer(question, result);
  return buildAnswerContract({
    directAnswer: aiDraft.directAnswer,
    keyDetails: aiDraft.keyDetails,
    nextStep: aiDraft.nextStep || (actions[0] ? `Use the “${actions[0].label}” link below for the current next step.` : `Open the official ${sources[0].title} page below for the current details.`),
    actions,
    sources,
    status: covered.length === result.requestedDetails.length && !stale ? "verified" : "verified-incomplete",
    requestedDetails: result.requestedDetails,
    coveredDetails: covered,
    checkedAt: sources[0].checkedAt,
    answerMode: aiDraft.answerMode || "community-grounded-ai",
    claims: aiDraft.claims,
  });
}

function poolStatusAnswer(status) {
  return buildAnswerContract({
    directAnswer: `${status.headline}. ${status.summary}`,
    keyDetails: status.stale ? ["The latest refresh failed, so this may be an older status."] : [],
    nextStep: status.residentAction,
    actions: [{ label: "Open official pool status", url: status.actionUrl || status.sourceUrl, actionType: "status" }],
    sources: [{ title: "Official CAB pool status", sourceUrl: status.sourceUrl, text: `${status.headline}. ${status.summary}`, excerpt: status.summary, authorityScore: 1, checkedAt: status.checkedAt, isOfficialResource: true }],
    status: status.stale ? "verified-incomplete" : "verified",
    checkedAt: status.checkedAt,
    answerMode: "community-live-status",
  });
}

function eventsAnswer(result) {
  const details = result.events.map((event) => {
    const time = event.time ? new Date(`2000-01-01T${event.time}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
    return `${event.title}: ${event.date}${time ? ` at ${time}` : ""}${event.location ? `, ${event.location}` : ""}.`;
  });
  if (!details.length) {
    return buildAnswerContract({
      directAnswer: `I did not find a listed event for ${result.range.label} on the current official calendar.`,
      nextStep: "Open the official calendar below to check newly added or category-specific events.",
      actions: [{ label: "Open official community calendar", url: result.sourceUrl, actionType: "calendar" }],
      sources: [{ title: "Official Sterling Ranch Calendar", sourceUrl: result.sourceUrl, text: "Official current community calendar", excerpt: "Official current community calendar", authorityScore: 1, checkedAt: result.checkedAt, isOfficialResource: true }],
      status: "verified",
      checkedAt: result.checkedAt,
      answerMode: "community-live-events",
    });
  }
  return buildAnswerContract({
    directAnswer: `I found ${details.length} official calendar ${details.length === 1 ? "event" : "events"} for ${result.range.label}.`,
    keyDetails: details,
    nextStep: "Open an event link below for its full details and any registration instructions.",
    actions: result.events.map((event) => ({ label: event.title, url: event.url, actionType: "event" })),
    sources: result.events.map((event) => ({ title: event.title, sourceUrl: event.url, text: `${event.title} ${event.startDate} ${event.location}`, excerpt: `${event.date} ${event.time} ${event.location}`, authorityScore: 1, checkedAt: result.checkedAt, isOfficialResource: true })),
    status: "verified",
    checkedAt: result.checkedAt,
    answerMode: "community-live-events",
  });
}

async function answerCommunityQuestion(query, options = {}) {
  const question = normalizeInput(query);
  if (hasPromptInjectionSignals(question)) {
    const rejected = buildAnswerContract({
      directAnswer: "I can help with community questions, but I can’t follow instructions that try to change my safeguards or reveal private information.",
      nextStep: "Ask about a community rule, service, form, facility, event, or current status instead.",
      status: "safety-rejected",
      answerMode: "safety",
    });
    return {
      ...rejected,
      inputClassification: "prompt-injection",
      reviewNeeded: false,
      confidence: { ...rejected.confidence, reason: "prompt-injection-rejected" },
    };
  }
  if (!question) {
    return buildAnswerContract({ directAnswer: "What would you like to know about the community?", status: "could-not-verify", answerMode: "conversation" });
  }
  const classifiedInput = classifyRulesInput(question);
  if (classifiedInput.classification === INPUT_CLASSIFICATIONS.CONVERSATION) {
    const conversation = buildAnswerContract({ directAnswer: "Hi! Ask me about community rules, services, forms, facilities, events, or current status.", status: "out-of-scope", answerMode: "conversation" });
    return {
      ...conversation,
      inputClassification: "conversation",
      confidence: { ...conversation.confidence, reason: "conversation-not-rule-question" },
    };
  }
  if (
    classifiedInput.classification === INPUT_CLASSIFICATIONS.UNCLEAR
    && /^(?:what about (?:that|this|it|them|those)|please help|help me|can i|can we|could i|is it allowed|may i)[?.!\s]*$/i.test(question)
  ) {
    const clarification = buildAnswerContract({
      directAnswer: "What would you like help with in the community?",
      nextStep: "Add the rule, service, facility, form, or activity you mean—for example, “Can I build a shed?” or “How do I reserve a park shelter?”",
      status: "could-not-verify",
      answerMode: "conversation",
    });
    return {
      ...clarification,
      inputClassification: INPUT_CLASSIFICATIONS.UNCLEAR,
      confidence: { canAnswer: false, confidence: "high", reason: "unclear-input" },
      reviewNeeded: false,
    };
  }
  if (/^(?:can|could|may|should|would)\s+(?:i|we|you)(?:\s+please)?[!.?\s]*$/i.test(question)) {
    return { ...buildAnswerContract({
      directAnswer: "What would you like permission or help to do?",
      nextStep: "Add the activity, facility, service, or rule you mean—for example, “Can I build a shed?” or “Can I reserve a park shelter?”",
      status: "could-not-verify",
      answerMode: "conversation",
    }), inputClassification: "unclear" };
  }

  if (isFoodTruckQuestion(question) && options.getFoodTruckAnswer) {
    try {
      return { ...foodTruckAnswer(await options.getFoodTruckAnswer(question)), communityIntent: "food-trucks" };
    } catch {
      const unavailable = buildAnswerContract({
        directAnswer: "I could not check the live food-truck schedule just now.",
        nextStep: "Use the official Sterling Ranch calendar below before making plans.",
        actions: [{ label: "Open official community calendar", url: "https://sterlingranchcab.com/Calendar.aspx", actionType: "calendar" }],
        status: "source-unavailable",
        answerMode: "community-live-food-truck",
      });
      return { ...unavailable, communityIntent: "food-trucks" };
    }
  }

  if (
    classifiedInput.classification === INPUT_CLASSIFICATIONS.UNRELATED
    && ["known-unrelated-topic", "person-identity"].includes(classifiedInput.reason)
  ) {
    const unrelated = buildAnswerContract({
      directAnswer: classifiedInput.reason === "person-identity"
        ? "I can verify official community information, but I can’t reliably identify or describe a person from the rulebook."
        : "I can help with Sterling Ranch rules and official community information, but I can’t verify that unrelated request from those sources.",
      nextStep: classifiedInput.reason === "person-identity"
        ? "Use the official CAB staff or board directory if you are trying to identify a community representative."
        : "Ask about a community rule, service, form, facility, event, pool status, or food truck instead.",
      status: "out-of-scope",
      answerMode: "conversation",
    });
    return {
      ...unrelated,
      answerVerdict: "informational",
      inputClassification: classifiedInput.classification,
      confidence: { canAnswer: false, confidence: "high", reason: "unrelated-not-rule-question" },
      reviewNeeded: false,
    };
  }

  const intent = classifyCommunityIntent(question);
  let rulesFallback = null;
  if (intent === "status" && options.getPoolStatus) {
    try { return poolStatusAnswer(await options.getPoolStatus()); } catch { /* source fallback below */ }
  }
  if (intent === "events" && options.getCommunityEvents) {
    try { return eventsAnswer(await options.getCommunityEvents(question)); } catch { /* indexed fallback below */ }
  }

  if (options.answerRulesQuestion) {
    let rulesAnswer = await options.answerRulesQuestion(question, options.rulesOptions || {});
    rulesFallback = rulesAnswer;
    if (
      rulesAnswer?.inputClassification === INPUT_CLASSIFICATIONS.CONVERSATION
      || (
        rulesAnswer?.inputClassification === INPUT_CLASSIFICATIONS.UNRELATED
        && ["known-unrelated-topic", "person-identity"].includes(rulesAnswer?.confidence?.reason)
      )
    ) {
      return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), communityIntent: intent };
    }
    if (rulesAnswer?.answerMode === "targeted-clarification") {
      return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), communityIntent: intent };
    }
    if (rulesAnswer?.inputClassification === "unclear") {
      const communityEvidence = searchCommunityIndex(question, { index: options.index, indexPath: options.indexPath, communityId: options.communityId, intent, limit: 5 });
      if (Number(communityEvidence.sources[0]?.score || 0) >= 24 && hasDistinctiveCommunityEvidence(question, communityEvidence.sources)) {
        const communityAnswer = await sourcedAnswer(question, communityEvidence, options);
        return { ...communityAnswer, communityIntent: intent };
      }
      return { ...safeRulesBoundaryAnswer(question, rulesAnswer, communityEvidence.index || options.index), communityIntent: intent };
    }
    if (/\b(?:section|sec\.?)[\s#]*(?:\d+-\d+|\d+)\b/i.test(question)) {
      return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), communityIntent: intent };
    }
    if ((!rulesAnswer?.confidence?.canAnswer || ["conversation", "safety"].includes(rulesAnswer.answerMode)) && intent === "facilities") {
      rulesAnswer = await options.answerRulesQuestion(
        `${question} Community facility rental reservation process fees application`,
        options.rulesOptions || {}
      );
    }
    if (rulesAnswer?.confidence?.canAnswer && !["conversation", "safety"].includes(rulesAnswer.answerMode)) {
      const community = searchCommunityIndex(question, { index: options.index, indexPath: options.indexPath, communityId: options.communityId, intent, limit: 3 });

      const requestedOperationalDetail = community.requestedDetails.some((detail) => ["contact", "date", "hours", "action"].includes(detail));
      const rulesAdmitsMissingDetail = /does not (?:give|include|list|provide|set|specify|state)|not found in the rulebook|use the .*instructions/i.test(String(rulesAnswer.answer || ""));
      if (intent === "services" && requestedOperationalDetail && rulesAdmitsMissingDetail && !isWasteStorageRuleQuestion(question) && Number(community.sources[0]?.score || 0) >= 36) {
        return { ...await sourcedAnswer(question, community, options), communityIntent: intent };
      }

      // The mature rules path may produce a plausible prose answer before the
      // broader community index is consulted. For contact questions, prefer
      // exact structured phone/email facts whenever the official community
      // source has them; those facts must outrank an earlier AI summary.
      if (
        community.requestedDetails.includes("contact")
        && !/@|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(String(rulesAnswer.answer || ""))
        && community.sources.some((source) => (source.facts || []).some((fact) => ["phone", "email"].includes(fact.type)))
      ) {
        return { ...extractiveAnswer(question, community), communityIntent: intent };
      }

      const extraSources = community.sources.map(sourceForDisplay);
      const officialRuleActions = (rulesAnswer.sources || [])
        .filter((source) => isOfficialCommunitySource(source) && /^https?:\/\//i.test(source.sourceUrl || ""))
        .map((source) => ({ label: `Open ${source.title}`, url: source.sourceUrl, actionType: /catalog/i.test(source.title) ? "booking" : "information" }))
        .sort((a, b) => Number(b.actionType === "booking") - Number(a.actionType === "booking"));
      const extraActions = officialRuleActions.length ? officialRuleActions.slice(0, 3) : relevantActions(question, extraSources, 3);
      const mergedSources = [...(rulesAnswer.sources || []), ...extraSources].filter((source, index, all) =>
        all.findIndex((candidate) => (candidate.sourceUrl || candidate.title) === (source.sourceUrl || source.title)) === index
      );
      const mergedActions = [...(rulesAnswer.actions || []), ...extraActions].filter((action, index, all) =>
        action?.url && all.findIndex((candidate) => candidate?.url === action.url) === index
      );
      return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), answerStatus: "verified", sources: mergedSources, actions: mergedActions, communityIntent: intent };
    }
    if (intent === "rules") {
      return { ...safeRulesBoundaryAnswer(question, rulesAnswer, options.index), communityIntent: intent };
    }
  }

  let result = searchCommunityIndex(question, { index: options.index, indexPath: options.indexPath, communityId: options.communityId, intent });
  if ((!result.sources.length || Number(result.sources[0].score || 0) < 72) && options.planCommunitySearch !== false) {
    const planner = options.planCommunitySearch || defaultPlanSearch;
    const plan = await planner(question, options.llmOptions || {});
    if (plan?.searchQueries?.length) {
      result = searchCommunityIndexWithQueries(question, plan.searchQueries, {
        index: options.index,
        indexPath: options.indexPath,
        communityId: options.communityId,
        intent: plan.intent || intent,
      });
      result.intent = plan.intent || intent;
    }
  }
  const distinctiveEvidence = hasDistinctiveCommunityEvidence(question, result.sources);
  if ((!result.sources.length || Number(result.sources[0].score || 0) < 24 || !distinctiveEvidence) && rulesFallback) {
    if (/conversation|informational/i.test(`${rulesFallback.answerMode} ${rulesFallback.answerVerdict}`) && rulesFallback.inputClassification !== INPUT_CLASSIFICATIONS.UNCLEAR) {
      return { ...rulesFallback, communityIntent: intent };
    }
    return { ...safeRulesBoundaryAnswer(question, rulesFallback, result.index || options.index), communityIntent: intent };
  }
  const answer = await sourcedAnswer(question, result, options);
  return { ...answer, communityIntent: result.intent || intent };
}

module.exports = { answerCommunityQuestion, bestContactContext, cleanAnswerText, contactDirectAnswer, eventsAnswer, extractiveAnswer, poolStatusAnswer, relevantActions, sourcedAnswer, usefulSentences };
