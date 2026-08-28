const { buildAnswerContract, detectFactConflicts } = require("./community-contracts");
const { claimsFromDraft } = require("./community-grounding");
const { planCommunitySearch: defaultPlanSearch, synthesizeCommunityAnswer: defaultSynthesize } = require("./community-llm");
const { classifyCommunityIntent, searchCommunityIndex, searchCommunityIndexWithQueries, tokens } = require("./community-search");
const { hasPromptInjectionSignals, normalizeInput } = require("./rules-input");

function sourceForDisplay(source) {
  return {
    ...source,
    nodeId: source.nodeId || `COMMUNITY_${String(source.id || "SOURCE").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
    sourceName: source.sourceName || "Official community website",
    isOfficialResource: true,
  };
}

function cleanAnswerText(value = "") {
  return String(value)
    .replace(/\s*--\s*\d+\s+of\s+\d+\s*--\s*/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
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
    if (detail === "date") return facts.some((fact) => fact.type === "date") || sources.some((source) => source.sourceType === "events");
    if (detail === "hours") return facts.some((fact) => fact.type === "time") || sources.some((source) => source.sourceType === "status");
    return true;
  });
}

function bestContactCandidate(question, sources) {
  const queryTokens = tokens(question).filter((token) => !["call", "contact", "email", "phone"].includes(token));
  const candidates = sources.flatMap((source, sourceIndex) => (source.facts || [])
    .filter((fact) => ["phone", "email"].includes(fact.type))
    .map((fact) => ({
      source,
      context: fact.context || fact.value,
      score: queryTokens.reduce((score, token) => {
        const contextMatch = String(fact.context || "").toLowerCase().includes(token) ? 3 : 0;
        const titleMatch = String(source.title || "").toLowerCase().includes(token) ? 2 : 0;
        return score + contextMatch + titleMatch;
      }, Math.max(0, 5 - sourceIndex) * 2 + (/@/.test(fact.context || "") && /\d{3}[-.)\s]\d{3}/.test(fact.context || "") ? 3 : 0)),
    })));
  return candidates.sort((a, b) => b.score - a.score)[0] || null;
}

function bestContactContext(question, sources) {
  return bestContactCandidate(question, sources)?.context || "";
}

function contactDirectAnswer(sentence, sourceTitle, question = "") {
  const text = String(sentence || "").replace(/at::/gi, "at:").replace(/please completed\b/gi, "please complete");
  const phone = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/)?.[0];
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (!phone && !email) return text;
  const requestedSubject = String(question).match(/\b(?:contact|call|email)(?:\s+\w+){0,3}\s+(?:about|regarding)\s+(.+?)[?.!]*$/i)?.[1];
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
  const actions = (result.requestedDetails.includes("contact") || result.intent === "events") && sources[0]?.sourceUrl
    ? [{ label: `Open official ${sources[0].title}`, url: sources[0].sourceUrl, actionType: "information" }]
    : relevantActions(question, sources, 3);
  const covered = coveredDetails(result.requestedDetails, sources, actions);
  const complete = covered.length === result.requestedDetails.length;
  const directAnswer = result.intent === "events" && actions.length
    ? `Use the official ${sources[0].title} link below to find current community events.`
    : result.intent === "forms" && actions.length
    ? `Use the official ${sources[0].title} source below to open the current form or application.`
    : result.requestedDetails.includes("contact") && (bestContactContext(question, sources) || sentences[0])
      ? contactDirectAnswer(bestContactContext(question, sources) || sentences[0], sources[0].title, question)
    : sentences[0] || `The official ${sources[0].title} page is the closest current source for this question.`;
  const keyDetails = result.requestedDetails.includes("contact")
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
      confidence: { ...rejected.confidence, reason: "prompt-injection-rejected" },
    };
  }
  if (!question) {
    return buildAnswerContract({ directAnswer: "What would you like to know about the community?", status: "could-not-verify", answerMode: "conversation" });
  }
  if (/^(?:hi|hello|hey|thanks|thank you|how are you|tell me a joke)[!.?\s]*$/i.test(question)) {
    const conversation = buildAnswerContract({ directAnswer: "Hi! Ask me about community rules, services, forms, facilities, events, or current status.", status: "out-of-scope", answerMode: "conversation" });
    return {
      ...conversation,
      inputClassification: "conversation",
      confidence: { ...conversation.confidence, reason: "conversation-not-rule-question" },
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
    if (rulesAnswer?.inputClassification === "unclear" || rulesAnswer?.answerMode === "targeted-clarification") {
      return { ...rulesAnswer, answer: cleanAnswerText(rulesAnswer.answer), communityIntent: intent };
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
        .filter((source) => source.isOfficialResource && /^https?:\/\//i.test(source.sourceUrl || ""))
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
  if ((!result.sources.length || Number(result.sources[0].score || 0) < 24) && rulesFallback && /conversation|informational/i.test(`${rulesFallback.answerMode} ${rulesFallback.answerVerdict}`)) {
    return { ...rulesFallback, communityIntent: intent };
  }
  const answer = await sourcedAnswer(question, result, options);
  return { ...answer, communityIntent: result.intent || intent };
}

module.exports = { answerCommunityQuestion, bestContactContext, cleanAnswerText, contactDirectAnswer, eventsAnswer, extractiveAnswer, poolStatusAnswer, relevantActions, sourcedAnswer, usefulSentences };
