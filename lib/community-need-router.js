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

function isClippedClaim(text = "") {
  return /(?:\.\.\.|…)/.test(String(text));
}

function preferredVerifiedDirectAnswer(result, directAnswer) {
  if (result.answer.answerStatus !== "verified" || !directAnswer || isClippedClaim(directAnswer)) return "";
  if (result.need.task === "permission"
    && (result.answer.claims || []).some((claim) => isClippedClaim(claim?.text))
    && /\b(?:yes|no|allowed|bars?|forbids?|disallows?|prohibited|required|requires|approval|permission|can|may|must)\b/i.test(directAnswer)) {
    return directAnswer;
  }
  if (/\b(?:does not|do not|did not|cannot|can't|couldn’t|couldn't)\b.{0,100}\b(?:set|say|state|specify|provide|publish|list|verify|confirm|find|grant)\b/i.test(directAnswer)) {
    return directAnswer;
  }
  return "";
}

function supportedAnswerText(result) {
  if (result.evidence.status === "handled-boundary") return directAnswerText(result.answer);
  if (["status", "schedule", "hours"].includes(result.need.task)) return directAnswerText(result.answer);
  const directAnswer = directAnswerText(result.answer);
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
  if (result.need.task === "action") {
    const actionClaim = proseClaims.find((claim) => (result.answer.actions || []).some((action) => {
      const label = String(action.label || "").replace(/^open\s+/i, "").trim();
      return label && claim.toLowerCase().includes(label.toLowerCase());
    }));
    if (actionClaim) return focusedClaimText(actionClaim, result.need.task);
    if (!(result.answer.actions || []).length) {
      const writtenInstructions = proseClaims.filter((claim) =>
        /\b(?:access|apply|bring|brought|call|contact|email|exchange(?:d)?|open|register|submit|visit(?:ing)?)\b/i.test(claim)
      ).slice(0, 3);
      if (writtenInstructions.length) {
        return writtenInstructions.map((claim) => focusedClaimText(claim, result.need.task)).join(" ");
      }
    }
    return "";
  }
  if (result.need.task === "specification") {
    const facets = [...new Set(String(result.need.evidenceFocus || result.need.request)
      .toLowerCase().match(/\b(?:height|size|dimension|setback|distance|material|color|finish)\b/g) || [])];
    if (facets.length === 1) {
      const facetPattern = facets[0] === "setback"
        ? /\b(?:setback|property lines?|\d+(?:[ -]\d+\/\d+)?\s*(?:feet|foot|ft\.?))\b/i
        : new RegExp(`\\b${facets[0]}\\b`, "i");
      const directLead = directAnswerText(result.answer).split(/(?<=[.!?])\s+/)[0].trim();
      const facetClaims = proseClaims.filter((claim) => facetPattern.test(claim));
      const concreteSpecification = facetClaims.find((claim) =>
        /#[0-9]{2,}\b|\b(?:\d+(?:[ -]\d+\/\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:feet|foot|inches|inch|ft\.?|in\.?)\b/i.test(claim)
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
      if (selected.length) return selected.map((claim) => focusedClaimText(claim, result.need.task)).join(" ");
    }
  }
  const displayClaims = proseClaims.length ? proseClaims : supportedClaims.filter((claim) => !isClippedClaim(claim));
  const prose = displayClaims.map((claim) => focusedClaimText(claim, result.need.task)).join(" ");
  const yesNoLead = directAnswerText(result.answer).match(/^(Yes|No)\./i)?.[0] || "";
  return yesNoLead && !prose.toLowerCase().startsWith(yesNoLead.toLowerCase()) ? `${yesNoLead} ${prose}` : prose;
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
  return (result.answer.claims || []).some((claim) => claim?.verified === true
    && (claim.evidenceSourceIds || []).length > 0
    && direct.toLowerCase().includes(String(claim.text || "").trim().toLowerCase()));
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
    const boundaryActions = hasScopedVerifiedBoundary(result)
      ? (result.answer.actions || []).filter((action) => (result.answer.sources || []).some((source) =>
        source.isOfficialResource === true && source.sourceUrl === action.url
      ))
      : [];
    return [...relevant, ...boundaryActions]
      .filter(Boolean)
      .map((action) => ({
        action: { ...action, retrievedForNeedIds: [result.need.id] },
        score: boundaryActions.includes(action) ? 3 : actionRelevanceScore(action, result.need),
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
