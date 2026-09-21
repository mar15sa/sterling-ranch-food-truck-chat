const crypto = require("node:crypto");
const { SENSITIVE_FACETS, buildFactLedger, factLedgerStatus, resolveFactLedger } = require("./community-truth");
const { fingerprint } = require("./community-release");

function observationHash(communityId, observation) {
  const version = {
    communityId,
    id: observation.id,
    title: observation.title,
    observedAt: observation.observedAt,
    evidence: observation.evidence,
    facts: observation.facts,
  };
  return crypto.createHash("sha256").update(JSON.stringify(version)).digest("hex");
}

function validateObservationPackage(packageData = {}) {
  if (packageData.schemaVersion !== 1) throw new Error("Unsupported owner observation schema version.");
  if (!packageData.communityId || !packageData.decidedAt || !packageData.authorization) {
    throw new Error("Owner observation package is missing approval metadata.");
  }
  if (!Array.isArray(packageData.observations)) throw new Error("Owner observations must be an array.");
  const ids = new Set();
  for (const observation of packageData.observations) {
    if (!observation.id || !observation.title || !observation.evidencePageUrl
      || !observation.observedAt || !observation.reviewAfter || !observation.evidence?.kind
      || !observation.evidence?.sha256 || !Array.isArray(observation.facts) || !observation.facts.length) {
      throw new Error(`Incomplete owner observation: ${observation.id || "unknown"}.`);
    }
    if (ids.has(observation.id)) throw new Error(`Duplicate owner observation: ${observation.id}.`);
    ids.add(observation.id);
    if (new URL(observation.evidencePageUrl).protocol !== "https:") {
      throw new Error(`Owner observation ${observation.id} must use an HTTPS evidence page.`);
    }
    if (!Number.isFinite(Date.parse(observation.observedAt))
      || !Number.isFinite(Date.parse(observation.reviewAfter))
      || Date.parse(observation.reviewAfter) <= Date.parse(observation.observedAt)) {
      throw new Error(`Owner observation ${observation.id} has an invalid review window.`);
    }
    for (const fact of observation.facts) {
      if (!fact.id || !fact.text || !fact.subjectKey || !fact.scopeKey) {
        throw new Error(`Owner observation ${observation.id} has an incomplete fact.`);
      }
    }
  }
  return packageData;
}

function buildOwnerObservationSources(packageData) {
  validateObservationPackage(packageData);
  return packageData.observations.map((observation) => {
    const contentHash = observationHash(packageData.communityId, observation);
    const reviewDecisionId = `owner-observation-${observation.id}`;
    const review = {
      reviewDecisionId,
      reviewedBy: "community-owner",
      reviewedAt: packageData.decidedAt,
      reviewStatus: "approved",
      sourceVersion: contentHash,
    };
    const facts = observation.facts.map((fact) => ({
      ...fact,
      ...review,
      approvalClaim: `${reviewDecisionId}-${fact.id}`,
      value: fact.text,
      context: fact.text,
      supportingQuote: fact.text,
    }));
    const text = facts.map((fact) => fact.text).join(" ");
    return {
      id: `owner-observation-${observation.id}`,
      communityId: packageData.communityId,
      title: observation.title,
      sourceUrl: observation.evidencePageUrl,
      sourceType: observation.sourceType || "services",
      connectorType: "owner-observation",
      authorityClass: "owner-observation",
      authorityScore: 0.9,
      provenanceType: "owner-observation",
      sourceName: "Community-provided onsite information",
      isOfficialResource: false,
      evidenceKind: observation.evidence.kind,
      evidenceDigest: observation.evidence.sha256,
      observedAt: observation.observedAt,
      reviewAfter: observation.reviewAfter,
      text,
      excerpt: text,
      facts,
      actions: [],
      contentHash,
      hashScheme: "owner-observation-v1",
      checkedAt: observation.observedAt,
      staleAfter: observation.reviewAfter,
      lifecycle: "current",
      reviewStatus: "approved"
    };
  });
}

function applyOwnerObservations(index, packageData) {
  const sources = buildOwnerObservationSources(packageData);
  const ids = new Set(sources.map((source) => source.id));
  const updated = {
    ...index,
    sources: [...(index.sources || []).filter((source) => !ids.has(source.id)), ...sources],
  };
  updated.sourceCount = updated.sources.length;
  const observationLedger = buildFactLedger({
    communityId: updated.communityId,
    factAuthority: updated.factAuthority,
    sources,
  }, {
    observedAt: packageData.decidedAt,
  });
  updated.factLedger = [
    ...(index.factLedger || []).filter((entry) => !ids.has(entry.sourceId)),
    ...observationLedger,
  ];
  const status = factLedgerStatus(updated, Date.parse(packageData.decidedAt));
  const truth = resolveFactLedger(updated.factLedger, { factAuthority: updated.factAuthority || {} });
  updated.truthStatus = {
    ...(updated.truthStatus || {}),
    generatedAt: packageData.decidedAt,
    totalFactCount: status.totalFactCount,
    approvedFactCount: status.approvedFactCount,
    candidateFactCount: status.candidateFactCount,
    staleFactCount: status.staleFactCount,
    conflictedFactCount: truth.unresolvedSensitive.length,
    retirementPendingCount: status.retirementPendingCount,
    unresolvedConflictCount: truth.unresolved.length,
    unresolvedSensitiveConflictCount: truth.unresolvedSensitive.length,
    pendingSensitiveReviewCount: updated.factLedger.filter((entry) =>
      entry.reviewStatus === "candidate" && SENSITIVE_FACETS.has(entry.facet)
      && entry.lifecycle !== "retired").length,
  };
  updated.promotedAt = packageData.decidedAt;
  updated.releaseFingerprint = fingerprint(updated);
  return updated;
}

module.exports = { applyOwnerObservations, buildOwnerObservationSources, observationHash, validateObservationPackage };
