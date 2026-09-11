const DISPOSITIONS = new Set([
  "approved-evidence",
  "pending-review",
  "duplicate-exact-version",
  "excluded-with-reason",
  "unavailable-recheck-required",
  "retirement-pending",
]);

function canonicalUrl(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    for (const name of [...url.searchParams.keys()]) {
      if (/^(?:utm_[^=]+|fbclid|gclid)$/i.test(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return String(value || "").trim();
  }
}

function versionKey({ canonicalUrl: url, sourceUrl, contentHash } = {}) {
  const canonical = canonicalUrl(url || sourceUrl);
  const hash = String(contentHash || "").trim().toLowerCase();
  if (!canonical || !hash) throw new Error("A ledger version needs both a canonical URL and a content hash.");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("A ledger content hash must be an exact SHA-256 hex digest.");
  return `${canonical}#sha256:${hash}`;
}

function communityIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))].sort();
}

function normalizeDisposition(value = "") {
  const compact = String(value).trim().toLowerCase().replace(/[—–]/g, "-").replace(/\s+/g, "-");
  const aliases = {
    "pending": "pending-review",
    "pending-review": "pending-review",
    "pending-navigation-only-review": "pending-review",
    "pending-cab/specialist-review": "pending-review",
    "approved": "approved-evidence",
    "approved-evidence": "approved-evidence",
    "duplicate": "duplicate-exact-version",
    "duplicate-of-exact-source/version": "duplicate-exact-version",
    "excluded": "excluded-with-reason",
    "unavailable": "unavailable-recheck-required",
    "retirement-pending": "retirement-pending",
  };
  const disposition = aliases[compact] || compact;
  if (!DISPOSITIONS.has(disposition)) throw new Error(`Unknown source disposition: ${value}`);
  return disposition;
}

function observationFrom(record = {}, origin = {}) {
  const availability = record.availability || {};
  const checkedAt = record.observedAt || availability.checkedAt || record.checkedAt || origin.preparedAt || "";
  if (!checkedAt) throw new Error(`Observation for ${record.canonicalUrl || record.sourceUrl || "source"} needs a checkedAt time.`);
  const communities = communityIds([
    ...communityIds([...(record.communityIds || []), record.communityId]),
    ...communityIds([...(origin.communityIds || []), origin.communityId]),
  ]);
  if (!communities.length) throw new Error(`Observation for ${record.canonicalUrl || record.sourceUrl || "source"} needs community provenance.`);
  return {
    observedAt: checkedAt,
    httpStatus: availability.httpStatus ?? record.httpStatus ?? null,
    finalUrl: canonicalUrl(availability.finalUrl || record.finalUrl || record.canonicalUrl || record.sourceUrl),
    contentFingerprint: record.contentFingerprint || "",
    rawResponseSha256: record.rawResponseSha256 || "",
    origin: origin.packetId || origin.origin || "inventory",
    communityIds: communities,
  };
}

function uniqueObservations(observations = []) {
  const seen = new Set();
  return observations
    .filter(Boolean)
    .sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)))
    .filter((observation) => {
      const key = JSON.stringify([observation.observedAt, observation.httpStatus, observation.finalUrl, observation.rawResponseSha256, observation.origin, observation.communityIds]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function emptyLedger({ generatedAt = "", source = "" } = {}) {
  return { schemaVersion: 1, generatedAt, source, records: [] };
}

function assertRecord(record = {}) {
  versionKey(record);
  normalizeDisposition(record.disposition);
  if (record.hashScheme && !["page-text-v1", "page-text-actions-v1"].includes(record.hashScheme)) {
    throw new Error(`Unknown source hash scheme for ${record.key || ""}.`);
  }
  if (!Array.isArray(record.observations) || !record.observations.length) throw new Error(`Ledger record ${record.key || ""} needs observation history.`);
  const communities = communityIds(record.communityIds);
  if (!communities.length) throw new Error(`Ledger record ${record.key || ""} needs community provenance.`);
  for (const observation of record.observations || []) {
    if (!communityIds(observation.communityIds).length) throw new Error(`Observation for ${record.key || ""} needs community provenance.`);
  }
  const approvedDecisions = new Set();
  for (const approval of record.approvals || []) {
    if (approval.status !== "approved" || !approval.decisionId || !approval.communityId || !approval.scopeKind) {
      throw new Error(`Approved ledger record ${record.key || ""} needs a scoped explicit decision ID.`);
    }
    if (!communities.includes(approval.communityId)) throw new Error(`Approval community is not recorded for ${record.key || ""}.`);
    const decisionKey = `${approval.communityId}:${approval.decisionId}`;
    if (approvedDecisions.has(decisionKey)) throw new Error(`Duplicate community decision for ${record.key || ""}.`);
    approvedDecisions.add(decisionKey);
  }
}

function refreshDisposition(record) {
  if (!["pending-review", "approved-evidence"].includes(record.disposition)) return;
  const approved = new Set((record.approvals || []).filter((approval) => approval.status === "approved" && approval.scopeKind === "entire-source").map((approval) => approval.communityId));
  record.disposition = (record.communityIds || []).every((communityId) => approved.has(communityId))
    ? "approved-evidence"
    : "pending-review";
}

function upsertObservation(ledger, record = {}, { origin = "inventory", disposition = "pending-review", title = "", authorityRole = "", communityId = "", communityIds: optionCommunityIds = [] } = {}) {
  const canonical = canonicalUrl(record.canonicalUrl || record.sourceUrl);
  const key = versionKey({ canonicalUrl: canonical, contentHash: record.contentHash });
  const records = ledger.records || (ledger.records = []);
  let target = records.find((item) => item.key === key);
  if (!target) {
    target = {
      key,
      canonicalUrl: canonical,
      contentHash: String(record.contentHash).toLowerCase(),
      hashScheme: record.hashScheme || "",
      title: record.title || title || "",
      disposition: normalizeDisposition(record.disposition || disposition),
      dispositionReason: record.dispositionReason || "",
      authorityRole: record.authorityRole || authorityRole || "",
      communityIds: [],
      observations: [],
      approvals: [],
      packetRefs: [],
    };
    records.push(target);
  } else if (record.hashScheme) {
    if (target.hashScheme && target.hashScheme !== record.hashScheme) throw new Error(`Conflicting source hash scheme for ${key}.`);
    target.hashScheme = record.hashScheme;
  }
  const observation = observationFrom(record, { packetId: origin, communityId, communityIds: optionCommunityIds });
  target.observations = uniqueObservations([...target.observations, observation]);
  target.communityIds = communityIds([...target.communityIds, ...observation.communityIds]);
  refreshDisposition(target);
  if (origin && !target.packetRefs.includes(origin)) target.packetRefs.push(origin);
  return target;
}

// A packet is discovery/review preparation. Even an owner action written in a
// packet is deliberately not interpreted as approval here.
function importPacket(ledger, packet = {}) {
  for (const record of packet.records || []) {
    upsertObservation(ledger, { ...record, checkedAt: record.checkedAt || packet.preparedAt }, {
      origin: packet.packetId || "review-packet",
      disposition: normalizePacketDisposition(record.proposedDisposition),
      title: record.title,
      authorityRole: record.authorityRole,
      communityId: packet.communityId,
    });
  }
  return ledger;
}

function normalizePacketDisposition(value = "") {
  const text = String(value || "").toLowerCase();
  if (/exact duplicate|duplicate of exact/.test(text)) return "duplicate-exact-version";
  if (/unavailable/.test(text)) return "unavailable-recheck-required";
  if (/retirement/.test(text)) return "retirement-pending";
  if (/excluded/.test(text)) return "excluded-with-reason";
  return "pending-review";
}

function applyExplicitDecision(ledger, decision = {}) {
  const key = versionKey(decision);
  const target = (ledger.records || []).find((record) => record.key === key);
  if (!target) return { applied: false, reason: "version-not-in-ledger", key };
  if (decision.decision !== "approve-proposed" && decision.status !== "approved") {
    return { applied: false, reason: "decision-does-not-approve", key };
  }
  if (!decision.decisionId && !decision.reviewId && !decision.id) return { applied: false, reason: "missing-decision-id", key };
  const communityId = String(decision.communityId || "").trim();
  if (!communityId) return { applied: false, reason: "missing-community-id", key };
  if (!target.communityIds.includes(communityId)) return { applied: false, reason: "community-not-observed", key };
  const approval = {
    status: "approved",
    communityId,
    decisionId: decision.decisionId || decision.reviewId || decision.id,
    scope: decision.scope || decision.approvedScope || "",
    scopeKind: decision.scopeKind || "scoped-claims",
    approvedClaims: Array.isArray(decision.approvedClaims) ? decision.approvedClaims : [],
    withheldClaims: Array.isArray(decision.withheldClaims) ? decision.withheldClaims : [],
    controllingSources: Array.isArray(decision.controllingSources) ? decision.controllingSources : [],
    approvedActions: Array.isArray(decision.approvedActions) ? decision.approvedActions : [],
    decidedAt: decision.decidedAt || "",
  };
  target.approvals = [...(target.approvals || []).filter((item) => !(item.communityId === communityId && item.decisionId === approval.decisionId)), approval];
  refreshDisposition(target);
  return { applied: true, key };
}

function approvalForCommunity(record = {}, communityId = "", decisionId = "") {
  return (record.approvals || []).find((approval) => approval.communityId === communityId && approval.status === "approved" && (!decisionId || approval.decisionId === decisionId)) || null;
}

function scopedApprovalsForVersion(ledger = {}, source = {}, communityId = "") {
  if (!/^[a-f0-9]{64}$/i.test(String(source.contentHash || ""))) return [];
  const key = versionKey({ sourceUrl: source.sourceUrl || source.canonicalUrl, contentHash: source.contentHash });
  const record = (ledger.records || []).find((item) => item.key === key);
  if (!record) return [];
  return (record.approvals || []).filter((approval) => approval.status === "approved"
    && approval.communityId === communityId
    && approval.scopeKind === "scoped-claims");
}

function summary(ledger = {}) {
  const byDisposition = Object.fromEntries([...DISPOSITIONS].map((status) => [status, 0]));
  for (const record of ledger.records || []) byDisposition[record.disposition] += 1;
  return {
    uniqueVersions: (ledger.records || []).length,
    byDisposition,
    approvedEvidence: (ledger.records || []).filter((record) => record.disposition === "approved-evidence").length,
    scopedApprovals: (ledger.records || []).flatMap((record) => record.approvals || []).length,
    pendingReview: byDisposition["pending-review"],
  };
}

function validateLedger(ledger = {}) {
  const seen = new Set();
  for (const record of ledger.records || []) {
    assertRecord(record);
    if (seen.has(record.key)) throw new Error(`Duplicate canonical source version: ${record.key}`);
    seen.add(record.key);
  }
  return summary(ledger);
}

module.exports = {
  DISPOSITIONS,
  applyExplicitDecision,
  approvalForCommunity,
  scopedApprovalsForVersion,
  canonicalUrl,
  communityIds,
  emptyLedger,
  importPacket,
  normalizeDisposition,
  summary,
  upsertObservation,
  validateLedger,
  versionKey,
};
