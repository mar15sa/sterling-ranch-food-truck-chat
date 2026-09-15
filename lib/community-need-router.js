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
  const withoutLeadingJoiner = focused.replace(/^(?:and|but|or)\s+/i, "");
  return withoutLeadingJoiner.charAt(0).toUpperCase() + withoutLeadingJoiner.slice(1);
}

function supportedAnswerText(result) {
  if (["status", "schedule", "hours"].includes(result.need.task)) return directAnswerText(result.answer);
  const claims = Array.isArray(result.answer.claims) ? result.answer.claims : [];
  const supportedClaims = result.evidence.supportingClaimIndexes
    .map((index) => String(claims[index]?.text || "").trim())
    .filter(Boolean);
  const directWithNewDetails = ({ includeKeyDetails = false } = {}) => {
    const direct = directAnswerText(result.answer);
    const eligibleClaims = includeKeyDetails
      ? [...supportedClaims, ...(result.answer.keyDetails || []).map((detail) => String(detail).trim()).filter(Boolean)]
      : supportedClaims;
    const supplemental = uniqueBy(eligibleClaims, (claim) => claim.toLowerCase())
      .filter((claim) => !direct.toLowerCase().includes(claim.toLowerCase()));
    return [direct, ...supplemental.map((claim) => focusedClaimText(claim, result.need.task))].filter(Boolean).join(" ");
  };
  if (result.need.task === "permission") return directWithNewDetails();
  if (result.need.task === "action" && supportedClaims.length
    && supportedClaims.every((claim) => claim.split(/\s+/).length <= 8 && !/[.!?]/.test(claim))) return "";
  if (result.need.task === "action" && supportedClaims.length) return directAnswerText(result.answer);
  if (result.need.task === "specification") {
    if (/\b(?:all|every|same|depend(?:s|ing)?)\b/i.test(result.need.evidenceFocus || result.need.request)) {
      return directWithNewDetails({ includeKeyDetails: true });
    }
    const facets = [...new Set(String(result.need.evidenceFocus || result.need.request)
      .toLowerCase().match(/\b(?:height|size|dimension|setback|distance|material|color|finish)\b/g) || [])];
    if (facets.length === 1) {
      const focused = supportedClaims.find((claim) => new RegExp(`\\b${facets[0]}\\b`, "i").test(claim));
      if (focused) return focusedClaimText(focused, result.need.task);
    }
  }
  return supportedClaims.length
    ? supportedClaims.map((claim) => focusedClaimText(claim, result.need.task)).join(" ")
    : directAnswerText(result.answer);
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

function mergeCandidateSources(results) {
  const merged = new Map();
  for (const result of results) {
    const candidateIds = new Set([
      ...result.evidence.supportingSourceIds,
      ...(result.evidence.status === "supported" ? (result.answer.claims || [])
        .filter((claim) => claim?.verified === true
          && supportedAnswerText(result).toLowerCase().includes(String(claim.text || "").trim().toLowerCase()))
        .flatMap((claim) => claim.evidenceSourceIds || []) : []),
      ...result.evidence.relevantActionIndexes
        .map((index) => result.answer.actions?.[index]?.sourceId)
        .filter(Boolean),
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
    if (result.evidence.status !== "supported") continue;
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
  const labelTokens = new Set((label.match(/[a-z0-9]+/g) || []).map((token) => token.replace(/s$/, "")));
  const requestTokens = new Set((request.match(/[a-z0-9]+/g) || []).map((token) => token.replace(/s$/, "")));
  const overlap = [...labelTokens].filter((token) => token.length > 2 && requestTokens.has(token)).length;
  return (overlap * 2)
    + (requestedActionMatches(action, need) ? 5 : 0)
    + Number(/^https?:\/\//i.test(action.url || ""))
    - (/\bfull\b.{0,30}\banswer\b/i.test(action.label || "") ? 5 : 0);
}

function selectedActions(results) {
  const unresolved = results.filter((result) => !["supported", "handled-boundary"].includes(result.evidence.status));
  const actionResults = unresolved.length ? unresolved : results;
  const selected = actionResults.flatMap((result) => result.evidence.relevantActionIndexes
    .map((index) => result.answer.actions?.[index])
    .filter(Boolean)
    .map((action) => ({ action: { ...action, retrievedForNeedIds: [result.need.id] }, score: actionRelevanceScore(action, result.need) })));
  return uniqueBy(selected.sort((left, right) => right.score - left.score), ({ action }) => `${action.url || ""}|${action.label || ""}`)
    .map(({ action }) => action);
}

function completionOutcome(results) {
  const supported = results.filter((result) => result.evidence.status === "supported").length;
  if (supported === results.length && results.length) return "complete";
  const handled = results.filter((result) => result.evidence.status === "handled-boundary").length;
  if (supported + handled === results.length && handled) return "handled-boundary";
  if (supported) return "verified-partial";
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

function composedAnswer(results, actions, outcome) {
  const supported = results.filter((result) => ["supported", "handled-boundary"].includes(result.evidence.status));
  const unresolved = results.filter((result) => !["supported", "handled-boundary"].includes(result.evidence.status));
  const lines = [];
  if (supported.length) {
    lines.push(...uniqueBy(supported.map(supportedAnswerText).filter(Boolean), (text) => text));
  }
  if (unresolved.length) {
    if (unresolved.length === 1) {
      const lead = outcome === "ambiguous" ? "I need one more detail before I can check this accurately" : "I couldn’t verify this part yet";
      lines.push(`${lead}: ${unresolved[0].need.text || unresolved[0].need.request}.`);
    } else {
      lines.push(`I couldn’t verify these parts yet:\n${unresolved.map((result) => `- ${result.need.text || result.need.request}`).join("\n")}`);
    }
  }
  const renderedSupport = lines.join(" ").toLowerCase();
  const actionAddsRequestedValue = actions.length && results.some((result) => requestedActionMatches(actions[0], result.need));
  if (actions.length && (unresolved.length || actionAddsRequestedValue)
    && !renderedSupport.includes(String(actions[0].label || "").toLowerCase())) {
    lines.push(`Next step: ${actions[0].label}.`);
  }
  return lines.filter(Boolean).join("\n\n") || "I couldn’t verify that from the available official evidence.";
}

async function runNeedFirstShadow(contract, answerNeed, {
  maxNeeds = DEFAULT_MAX_NEEDS,
  answerMode = "need-first-shadow",
} = {}) {
  if (!contract || !Array.isArray(contract.needs) || !contract.needs.length) throw new Error("A resident-needs contract is required.");
  if (typeof answerNeed !== "function") throw new Error("A test-only per-need answer function is required.");
  if (!Number.isInteger(maxNeeds) || maxNeeds < 1 || contract.needs.length > maxNeeds) throw new Error("Resident need limit exceeded.");

  const results = [];
  for (const [index, need] of contract.needs.entries()) {
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
    results.push({ need, answer, evidence: assessment.needs[0] });
  }

  const actions = selectedActions(results);
  const candidateSources = mergeCandidateSources(results);
  const candidateClaims = mergeSupportingClaims(results);
  const preliminaryOutcome = completionOutcome(results);
  const answer = composedAnswer(results, actions, preliminaryOutcome);
  const directAnswer = answer.split(/\n\s*\n/)[0];
  const keyDetails = answer.split(/\n\s*\n/).slice(1);
  const preliminaryAnswerStatus = answerStatusForOutcome(preliminaryOutcome, results);
  // Re-run the evidence contract against the exact composed text. This keeps
  // a claim that was useful during drafting from counting after the composer
  // omits it, and prevents a presentation change from silently overstating
  // completeness.
  const finalAssessment = assessResidentNeeds(contract, {
    answer,
    directAnswer,
    keyDetails,
    answerStatus: preliminaryAnswerStatus,
    sources: candidateSources,
    claims: candidateClaims,
    actions,
    conflicts: [],
  });
  const finalResults = results.map((result, index) => ({ ...result, evidence: finalAssessment.needs[index] }));
  const outcome = completionOutcome(finalResults);
  const supportingClaimIndexes = new Set(finalAssessment.needs.flatMap((need) => need.supportingClaimIndexes || []));
  const claims = candidateClaims.filter((claim, index) => supportingClaimIndexes.has(index));
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
