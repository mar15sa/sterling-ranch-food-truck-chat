const COMPLETION_OUTCOMES = new Set([
  "complete",
  "verified-partial",
  "ambiguous",
  "missing-evidence",
  "conflict",
]);

const STATUS_BY_OUTCOME = {
  complete: "verified",
  "verified-partial": "verified-incomplete",
  ambiguous: "could-not-verify",
  "missing-evidence": "source-unavailable",
  conflict: "conflicting-sources",
};

function uniqueKeys(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeMissingDetails(values = []) {
  return values.map((value) => typeof value === "string" ? { key: value, reason: "missing-evidence" } : value)
    .filter((value) => value?.key)
    .map((value) => ({
      key: String(value.key),
      reason: String(value.reason || "missing-evidence"),
      ...(value.subject ? { subject: String(value.subject) } : {}),
    }));
}

function resolveAnswerCompletion({
  requestedDetails = [],
  resolvedDetails = [],
  missingDetails = [],
  blockers = [],
  conflicts = [],
  ambiguous = false,
  evidenceUnavailable = false,
  clarification = {},
  nextBestMove = {},
} = {}) {
  const requested = uniqueKeys(requestedDetails);
  const initiallyResolved = uniqueKeys(resolvedDetails).filter((key) => !requested.length || requested.includes(key));
  const hasConflict = conflicts.length > 0 || blockers.some((blocker) => blocker?.type === "source-conflict");
  const conflictKeys = uniqueKeys([
    ...conflicts.flatMap((conflict) => [conflict?.detailKey, ...(conflict?.detailKeys || [])]),
    ...blockers.filter((blocker) => blocker?.type === "source-conflict")
      .flatMap((blocker) => [blocker?.detailKey, ...(blocker?.detailKeys || [])]),
  ]).filter((key) => !requested.length || requested.includes(key));
  // If a conflict has no facet scope, none of the purportedly resolved facets
  // can be proven independent. Fail the whole answer closed.
  const resolved = hasConflict && conflictKeys.length === 0
    ? []
    : initiallyResolved.filter((key) => !conflictKeys.includes(key));
  const explicitMissing = normalizeMissingDetails(missingDetails);
  const missingKeys = new Set(explicitMissing.map((detail) => detail.key));
  for (const key of conflictKeys) {
    if (!missingKeys.has(key)) {
      explicitMissing.push({ key, reason: "source-conflict" });
      missingKeys.add(key);
    }
  }
  for (const key of requested) {
    if (!resolved.includes(key) && !missingKeys.has(key)) {
      explicitMissing.push({ key, reason: ambiguous ? "ambiguous-request" : "missing-evidence" });
      missingKeys.add(key);
    }
  }

  let outcome;
  if (hasConflict && resolved.length === 0) outcome = "conflict";
  else if (hasConflict) outcome = "verified-partial";
  else if (ambiguous && resolved.length === 0) outcome = "ambiguous";
  else if (explicitMissing.length && resolved.length) outcome = "verified-partial";
  else if (explicitMissing.length) outcome = hasConflict ? "conflict" : ambiguous ? "ambiguous" : "missing-evidence";
  else if (evidenceUnavailable) outcome = "missing-evidence";
  else outcome = "complete";

  return {
    outcome,
    requestedDetails: requested,
    resolvedDetails: resolved,
    missingDetails: explicitMissing,
    blockers: blockers.filter(Boolean),
    clarification: {
      needed: outcome === "ambiguous" && Boolean(clarification.question),
      question: String(clarification.question || ""),
      detailKey: String(clarification.detailKey || ""),
      rationale: String(clarification.rationale || ""),
    },
    nextBestMove: {
      type: String(nextBestMove.type || "none"),
      label: String(nextBestMove.label || ""),
      actionId: String(nextBestMove.actionId || ""),
      url: String(nextBestMove.url || ""),
    },
  };
}

function answerStatusForCompletion(completion, currentStatus = "verified") {
  if (!completion || !COMPLETION_OUTCOMES.has(completion.outcome)) return currentStatus;
  // Completion may expose missing coverage, but this first rollout never
  // promotes a status that an existing evidence or safety gate held back.
  if (completion.outcome === "complete") return currentStatus;
  if (completion.outcome === "missing-evidence" && ["could-not-verify", "source-unavailable"].includes(currentStatus)) return currentStatus;
  return STATUS_BY_OUTCOME[completion.outcome];
}

module.exports = { COMPLETION_OUTCOMES, answerStatusForCompletion, resolveAnswerCompletion };
