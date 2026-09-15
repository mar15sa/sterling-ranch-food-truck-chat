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
  return sentences.find((sentence) => pattern.test(sentence)) || String(text).trim();
}

function supportedAnswerText(result) {
  if (["status", "schedule"].includes(result.need.task)) return directAnswerText(result.answer);
  const claims = Array.isArray(result.answer.claims) ? result.answer.claims : [];
  const supportedClaims = result.evidence.supportingClaimIndexes
    .map((index) => String(claims[index]?.text || "").trim())
    .filter(Boolean);
  if (result.need.task === "action" && supportedClaims.length
    && supportedClaims.every((claim) => claim.split(/\s+/).length <= 8 && !/[.!?]/.test(claim))) return "";
  if (result.need.task === "specification") {
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

function selectedActions(results) {
  const unresolved = results.filter((result) => result.evidence.status !== "supported");
  const actionResults = unresolved.length ? unresolved : results;
  const selected = actionResults.flatMap((result) => result.evidence.relevantActionIndexes
    .map((index) => result.answer.actions?.[index])
    .filter(Boolean)
    .map((action) => ({ ...action, retrievedForNeedIds: [result.need.id] })));
  return uniqueBy(selected, (action) => `${action.url || ""}|${action.label || ""}`);
}

function completionOutcome(results) {
  const supported = results.filter((result) => result.evidence.status === "supported").length;
  if (supported === results.length && results.length) return "complete";
  if (supported) return "verified-partial";
  if (results.some((result) => result.evidence.status === "conflict")) return "conflict";
  if (results.some((result) => result.evidence.status === "ambiguous")) return "ambiguous";
  if (results.some((result) => result.evidence.status === "missing-evidence")) return "missing-evidence";
  return "unassessed";
}

function composedAnswer(results, actions, outcome) {
  const supported = results.filter((result) => result.evidence.status === "supported");
  const unresolved = results.filter((result) => result.evidence.status !== "supported");
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
  if (actions.length) lines.push(`Next step: ${actions[0].label}.`);
  return lines.filter(Boolean).join("\n\n") || "I couldn’t verify that from the available official evidence.";
}

async function runNeedFirstShadow(contract, answerNeed, { maxNeeds = DEFAULT_MAX_NEEDS } = {}) {
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
  const outcome = completionOutcome(results);
  const answer = composedAnswer(results, actions, outcome);
  return {
    isTest: true,
    answerMode: "need-first-shadow",
    answerStatus: outcome === "complete" ? "verified" : outcome === "verified-partial" ? "verified-incomplete" : outcome === "conflict" ? "conflicting-sources" : "could-not-verify",
    answer,
    directAnswer: answer.split(/\n\s*\n/)[0],
    keyDetails: answer.split(/\n\s*\n/).slice(1),
    nextStep: actions[0]?.label || "",
    sources: mergeCandidateSources(results),
    actions,
    completion: {
      outcome,
      needs: results.map((result) => ({
        needId: result.need.id,
        request: result.need.request,
        status: result.evidence.status,
        reason: result.evidence.reason,
        candidateSourceIds: result.evidence.candidateSourceIds,
        supportingSourceIds: result.evidence.supportingSourceIds,
        supportedDetails: result.evidence.supportedDetails,
        missingDetails: result.evidence.missingDetails,
      })),
    },
  };
}

module.exports = { DEFAULT_MAX_NEEDS, runNeedFirstShadow };
