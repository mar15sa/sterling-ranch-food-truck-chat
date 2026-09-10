const { sourceReviewState } = require("./community-source-answerability");
const { normalizeUrl } = require("./community-truth");

const SUBJECT_STOP_WORDS = new Set([
  "account", "action", "answer", "community", "consequence", "consequences", "current",
  "does", "happen", "happens", "information", "late", "non", "options", "policy",
  "pay", "payment", "resident", "service", "services", "unpaid", "what", "when", "where", "with",
]);

function normalizedSubjectTokens(value = "") {
  return [...new Set((String(value).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || [])
    .map((token) => token.replace(/(?:ing|ment|ed|s)$/i, ""))
    .filter((token) => token.length >= 3 && !SUBJECT_STOP_WORDS.has(token)))];
}

function allowedOfficialUrl(value = "", profile = {}) {
  const allowedHosts = new Set((profile.allowedHosts || []).map((host) => String(host).toLowerCase()));
  try {
    if (profile.website) allowedHosts.add(new URL(profile.website).hostname.toLowerCase());
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.size > 0 && allowedHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function requestedRelatedActionFacet(routingPlan = {}, controllingAnswer = {}) {
  if (["payment", "contact"].includes(routingPlan.nextActionFacet)) return routingPlan.nextActionFacet;
  if (["payment", "booking", "application", "registration", "account-access", "contact"].includes(routingPlan.goal)) return "";
  const controllingText = [
    routingPlan.subject,
    controllingAnswer.answer,
    ...(controllingAnswer.sources || []).flatMap((source) => [
      source.title,
      source.ownerReview?.approvedScope,
      source.ownerReview?.approvedAnswerEvidence,
    ]),
  ].filter(Boolean).join(" ");
  const describesCollectionConsequence = /\b(?:delinquen\w*|past[ -]?due|unpaid|disconnect\w*|collection process|late[ -]?fee|what happens)\b/i.test(controllingText);
  if (describesCollectionConsequence
    && /\b(?:pay|payment|paid)\b/i.test(controllingText)
    && /\b(?:bill|invoice|balance|fee)\b/i.test(controllingText)) return "payment";
  return "";
}

function subjectScore(subjectTokens, source = {}, action = {}) {
  const titleTokens = new Set(normalizedSubjectTokens(source.title));
  const bodyTokens = new Set(normalizedSubjectTokens(`${source.text || ""} ${source.excerpt || ""} ${action.context || ""}`));
  let matched = 0;
  let titleMatched = 0;
  let score = 0;
  for (const token of subjectTokens) {
    if (titleTokens.has(token)) { matched += 1; titleMatched += 1; score += 5; }
    else if (bodyTokens.has(token)) { matched += 1; score += 1; }
  }
  return { matched, titleMatched, score };
}

function selectApprovedRelatedAction({ index = {}, profile = {}, controllingAnswer = {}, subject = "", actionFacet = "", now = Date.now() } = {}) {
  if (!actionFacet || controllingAnswer.confidence?.canAnswer !== true) return null;
  const communityId = index.communityId || profile.communityId || "";
  if (!communityId || (profile.communityId && profile.communityId !== communityId)) return null;
  const subjectTokens = normalizedSubjectTokens(subject);
  if (subjectTokens.length < 2) return null;
  const reviewState = sourceReviewState(index, new Date(now).getTime());
  const nowTime = new Date(now).getTime();
  const candidates = [];

  for (const source of index.sources || []) {
    if (source.communityId !== communityId || source.lifecycle !== "current") continue;
    if (source.staleAfter && new Date(source.staleAfter).getTime() < nowTime) continue;
    if (!allowedOfficialUrl(source.sourceUrl, profile)) continue;
    const approvedEntries = reviewState.entriesFor(source).filter((entry) => entry.factType === "link");
    if (!approvedEntries.length) continue;
    for (const action of source.actions || []) {
      if (action.actionType !== actionFacet || !action.approvalClaim || !allowedOfficialUrl(action.url, profile)) continue;
      const approval = approvedEntries.find((entry) => entry.approvalClaim === action.approvalClaim
        && entry.sourceVersion === source.contentHash
        && normalizeUrl(entry.normalizedValue || entry.displayValue) === normalizeUrl(action.url));
      if (!approval) continue;
      const relevance = subjectScore(subjectTokens, source, action);
      if (relevance.matched < 2 || relevance.titleMatched < 2) continue;
      candidates.push({ source, action, approval, relevance });
    }
  }

  const selected = candidates.sort((left, right) =>
    right.relevance.score - left.relevance.score
      || Number(right.source.authorityScore || 0) - Number(left.source.authorityScore || 0)
      || String(left.source.id).localeCompare(String(right.source.id))
  )[0];
  if (!selected) return null;
  return {
    action: {
      id: selected.action.id || "",
      label: selected.action.label,
      url: selected.action.url,
      actionType: selected.action.actionType,
      evidenceSourceId: selected.source.id,
      sourceVersion: selected.source.contentHash,
      reviewDecisionId: selected.approval.reviewDecisionId,
      approvalClaim: selected.approval.approvalClaim,
    },
    evidence: {
      sourceId: selected.source.id,
      sourceUrl: selected.source.sourceUrl,
      sourceVersion: selected.source.contentHash,
      reviewDecisionId: selected.approval.reviewDecisionId,
      approvalClaim: selected.approval.approvalClaim,
      role: "supporting-action",
    },
  };
}

function attachApprovedRelatedAction(answer = {}, selection = null) {
  if (!selection?.action) return answer;
  const actions = [selection.action, ...(answer.actions || [])].filter((action, index, all) =>
    action?.url && all.findIndex((candidate) => candidate?.url === action.url) === index
  );
  return {
    ...answer,
    actions,
    actionEvidence: [selection.evidence],
    controllingSourceOnly: true,
    authorityDecision: "governing-answer-with-approved-operational-action",
    claimAuthorityBoundary: {
      policyStagesAndCharges: "governing-source-only",
      residentAction: "exact-approved-operational-action-only",
    },
  };
}

module.exports = {
  allowedOfficialUrl,
  attachApprovedRelatedAction,
  normalizedSubjectTokens,
  requestedRelatedActionFacet,
  selectApprovedRelatedAction,
};
