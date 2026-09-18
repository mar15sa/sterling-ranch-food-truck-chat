const fs = require("node:fs");
const path = require("node:path");
const {
  emptyLedger,
  applyExplicitDecision,
  importPacket,
  summary,
  upsertObservation,
  validateLedger,
  versionKey,
} = require("../lib/canonical-source-ledger");

const root = path.join(__dirname, "..");
const imports = require(path.join(root, "data", "canonical-source-ledger-imports.json"));
const formEvidence = require(path.join(root, "data", "community-form-approval-evidence.json"));
const legacyDecisions = require(path.join(root, "data", "community-owner-decisions-batch-1-2026-09-08.json"));
const scopedDecisions = require(path.join(root, "data", "canonical-source-ledger-decisions.json"));
const v5Decisions = require(path.join(root, "data", "community-source-approvals-v5.json"));
const v6Decisions = require(path.join(root, "data", "community-source-approvals-v6.json"));
const v7Decisions = require(path.join(root, "data", "community-source-approvals-v7.json"));
const v8Path = path.join(root, 'data', 'community-source-approvals-v8.json');
const v8Decisions = fs.existsSync(v8Path) ? JSON.parse(fs.readFileSync(v8Path, 'utf8')) : { decisions: [] };
const v9Path = path.join(root, 'data', 'community-source-approvals-v9.json');
const v9Decisions = fs.existsSync(v9Path) ? JSON.parse(fs.readFileSync(v9Path, 'utf8')) : { decisions: [] };
const v10Path = path.join(root, 'data', 'community-source-approvals-v10.json');
const v10Decisions = fs.existsSync(v10Path) ? JSON.parse(fs.readFileSync(v10Path, 'utf8')) : { decisions: [] };
const outputPath = path.join(root, "data", "canonical-source-ledger.json");

function buildLedger() {
  const ledger = emptyLedger({ generatedAt: imports.packets?.[0]?.preparedAt || "", source: "review-packets-a-b-c-and-explicit-form-evidence" });
  for (const packet of imports.packets || []) importPacket(ledger, { ...packet, communityId: "sterling-ranch" });

  // These are the only existing approvals with both a URL and an exact hash.
  // They are retained at their documented staging-only scope; an URL-only
  // owner decision is listed below but cannot approve a version in this ledger.
  for (const review of formEvidence.reviews || []) {
    for (const contentHash of review.hashes || []) {
      const record = upsertObservation(ledger, {
        canonicalUrl: review.url,
        contentHash,
        communityId: "sterling-ranch",
        title: `DocumentCenter item ${review.documentId}`,
        availability: { checkedAt: review.reviewedAt, httpStatus: 200, finalUrl: review.url },
      }, { origin: "community-form-approval-evidence" });
      record.disposition = "approved-evidence";
      record.approvals = [{
        status: "approved",
        communityId: "sterling-ranch",
        decisionId: `form-evidence-${review.documentId}-${contentHash}`,
        scope: review.scope || formEvidence.scope || "",
        scopeKind: "entire-source",
        decidedAt: review.reviewedAt,
      }];
    }
  }

  // The approval artifact is itself the exact-version decision record.  Keep
  // its version identity in the canonical ledger before attaching the scoped
  // claims below; never turn this into an entire-source approval.
  for (const decision of v5Decisions.decisions || []) {
    for (const version of decision.versions || []) {
      upsertObservation(ledger, {
        ...version,
        title: decision.decisionId,
        checkedAt: v5Decisions.decidedAt,
        availability: { checkedAt: v5Decisions.decidedAt, httpStatus: 200, finalUrl: version.canonicalUrl },
      }, { origin: "community-source-approvals-v5", communityId: v5Decisions.communityId });
    }
  }

  for (const decision of v6Decisions.decisions || []) {
    for (const version of decision.versions || []) {
      upsertObservation(ledger, {
        ...version,
        title: decision.decisionId,
        checkedAt: v6Decisions.decidedAt,
        availability: { checkedAt: v6Decisions.decidedAt, httpStatus: 200, finalUrl: version.canonicalUrl },
      }, { origin: "community-source-approvals-v6", communityId: v6Decisions.communityId });
    }
  }

  for (const decision of v7Decisions.decisions || []) {
    for (const version of decision.versions || []) {
      upsertObservation(ledger, {
        ...version,
        title: decision.decisionId,
        checkedAt: v7Decisions.decidedAt,
        availability: { checkedAt: v7Decisions.decidedAt, httpStatus: 200, finalUrl: version.canonicalUrl },
      }, { origin: "community-source-approvals-v7", communityId: v7Decisions.communityId });
    }
  }

  for (const decision of v8Decisions.decisions || []) {
    for (const version of decision.versions || []) {
      upsertObservation(ledger, { ...version, title: decision.title,
        checkedAt: decision.checkedAt,
      }, { origin: 'community-source-approvals-v8', communityId: v8Decisions.communityId });
    }
  }

  for (const decision of v9Decisions.decisions || []) {
    for (const version of decision.versions || []) {
      upsertObservation(ledger, { ...version, title: decision.title,
        checkedAt: decision.checkedAt,
      }, { origin: 'community-source-approvals-v9', communityId: v9Decisions.communityId });
    }
  }

  for (const decision of v10Decisions.decisions || []) {
    for (const version of decision.versions || []) {
      upsertObservation(ledger, { ...version, title: decision.title,
        checkedAt: decision.checkedAt,
      }, { origin: 'community-source-approvals-v10', communityId: v10Decisions.communityId });
    }
  }

  ledger.decisionApplications = [];
  for (const decision of [...(scopedDecisions.decisions || []), ...(v5Decisions.decisions || []), ...(v6Decisions.decisions || []), ...(v7Decisions.decisions || []), ...(v8Decisions.decisions || []), ...(v9Decisions.decisions || []), ...(v10Decisions.decisions || [])]) {
    for (const version of decision.versions || []) {
      const packageData = (v10Decisions.decisions || []).includes(decision)
        ? v10Decisions : (v9Decisions.decisions || []).includes(decision) ? v9Decisions
        : (v8Decisions.decisions || []).includes(decision) ? v8Decisions
        : (v7Decisions.decisions || []).includes(decision) ? v7Decisions
        : (v6Decisions.decisions || []).includes(decision) ? v6Decisions
        : (v5Decisions.decisions || []).includes(decision) ? v5Decisions : scopedDecisions;
      const result = applyExplicitDecision(ledger, {
        ...decision,
        approvedActions: decision.approvedActions || [],
        decision: decision.decision || "approve-proposed",
        ...version,
        communityId: packageData.communityId,
        decidedAt: packageData.decidedAt,
      });
      if (!result.applied) throw new Error(`Could not apply ${decision.decisionId}: ${result.reason}`);
      ledger.decisionApplications.push({ decisionId: decision.decisionId, communityId: packageData.communityId, key: result.key });
    }
  }
  ledger.deferred = scopedDecisions.deferred || [];

  const boundDecisionIds = new Set(ledger.decisionApplications.map((entry) => entry.decisionId));
  ledger.unmatchedLegacyDecisions = (legacyDecisions.decisions || []).filter((decision) => !boundDecisionIds.has(decision.id)).map((decision) => ({
    id: decision.id,
    canonicalUrl: decision.sourceUrl,
    status: decision.status,
    reason: "The decision has no content hash, so it cannot approve any URL version. Preserve its stated boundary until an exact-version decision is recorded.",
  }));
  ledger.reconciliation = {
    historicalSnapshots: [
      { label: "bundled candidate pending pages", observedAt: "2026-09-06", count: 222 },
      { label: "later live crawl backlog", observedAt: "2026-09-08", count: 917 },
    ],
    interpretation: "These are discovery queues from different crawl snapshots, not ledger totals. Neither count creates an approved record or reduces the other.",
    backfillLimit: "The historical queue rows do not carry a complete canonical URL plus content hash pair, so they cannot be converted into ledger versions without a source-level export.",
  };
  ledger.summary = summary(ledger);
  validateLedger(ledger);
  return ledger;
}

const ledger = buildLedger();
if (process.argv.includes("--write")) fs.writeFileSync(outputPath, `${JSON.stringify(ledger, null, 2)}\n`);
if (process.argv.includes("--check")) {
  const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  if (JSON.stringify(existing) !== JSON.stringify(ledger)) throw new Error("Canonical source ledger is out of date. Run: node scripts/build-canonical-source-ledger.js --write");
}
console.log(JSON.stringify(ledger.summary));

module.exports = { buildLedger, versionKey };
