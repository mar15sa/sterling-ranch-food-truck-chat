const fs = require("node:fs");
const path = require("node:path");
const { crawlCommunity } = require("./community-ingest");
const { validateCommunityProfile, validateSourceRecord } = require("./community-contracts");
const { fingerprint } = require("./community-release");
const { buildFactLedger, factLedgerStatus, resolveFactLedger } = require("./community-truth");
const { buildReviewItems, syncReviewItems } = require("./community-source-review");
const { isDynamicSource, isFreshnessTrackedSource } = require("./community-source-identity");
const { applyDomainOutageGrace, observeCanonicalSource, revalidateApprovedEvidence } = require("./community-approved-revalidation");

const PROFILE_PATH = path.join(__dirname, "..", "data", "communities", "sterling-ranch.json");
const INDEX_PATH = path.join(__dirname, "..", "data", "community-index.json");
const REFRESH_INTERVAL_MS = Number(process.env.COMMUNITY_REFRESH_INTERVAL_MS || 6 * 60 * 60 * 1000);
const INVENTORY_INTERVAL_MS = Number(process.env.COMMUNITY_INVENTORY_INTERVAL_MS || 24 * 60 * 60 * 1000);
const FORCED_RECONCILIATION_INTERVAL_MS = Number(process.env.COMMUNITY_FORCED_RECONCILIATION_INTERVAL_MS || 7 * 24 * 60 * 60 * 1000);
let profile;
let currentIndex;
let refreshPromise = null;
let lastRefreshError = "";
let pendingReview = null;
let lastSuccessfulPromotion = null;
let lastRollback = null;
let reviewItems = [];
let lastReviewSyncError = "";
let lastIncrementalRefresh = null;
let lastInventoryReconciliation = null;
let lastForcedReconciliation = null;
let lastExactRevalidation = null;

function loadJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

function getCommunityProfile() {
  if (!profile) profile = validateCommunityProfile(loadJson(PROFILE_PATH));
  return profile;
}

function getBundledIndex() {
  if (!currentIndex) {
    currentIndex = loadJson(INDEX_PATH);
    currentIndex.sources.forEach(validateSourceRecord);
    if (!Array.isArray(currentIndex.factLedger)) {
      currentIndex.factAuthority = getCommunityProfile().factAuthority;
      currentIndex.factLedger = buildFactLedger(currentIndex, { trusted: true });
      const resolution = resolveFactLedger(currentIndex.factLedger, getCommunityProfile());
      currentIndex.truthStatus = {
        generatedAt: currentIndex.generatedAt,
        unresolvedConflictCount: resolution.unresolved.length,
        unresolvedSensitiveConflictCount: resolution.unresolvedSensitive.length,
        pendingSensitiveReviewCount: 0,
      };
    }
    lastSuccessfulPromotion = currentIndex.promotedAt || lastSuccessfulPromotion;
  }
  return currentIndex;
}

function communitySourceStatus(index = getBundledIndex(), now = Date.now(), { includeStaleSources = false, refreshError } = {}) {
  const staleSources = index.sources.filter((source) => isFreshnessTrackedSource(source) && source.staleAfter && new Date(source.staleAfter).getTime() < now);
  const factStatus = factLedgerStatus(index, now);
  const inventoryBacklog = Number(index.inventory?.pendingCount || 0);
  const expiredApprovedSourceCount = staleSources.length;
  const expiredApprovedFactCount = factStatus.staleFactCount;
  const effectiveRefreshError = refreshError ?? lastRefreshError;
  const approvedEvidenceCurrent = index.sources.length > 0
    && Number(index.failureCount || 0) === 0
    && expiredApprovedSourceCount === 0
    && expiredApprovedFactCount === 0
    && !effectiveRefreshError;
  return {
    communityId: index.communityId,
    generatedAt: index.generatedAt,
    sourceCount: index.sources.length,
    pageCount: Number(index.inventory?.indexedPageCount || index.pageCount || 0),
    discoveredPageCount: Number(index.inventory?.discoveredCount || index.pageCount || 0),
    eligiblePageCount: Number(index.inventory?.eligibleCount || index.pageCount || 0),
    pendingPageCount: inventoryBacklog,
    // Inventory coverage and approved-evidence freshness are separate health
    // signals. A crawl may still have pages left to discover, but it cannot
    // pass a release gate while approved resident evidence is expired.
    inventoryBacklog,
    excludedPageCount: Number(index.inventory?.excludedCount || 0),
    duplicatePageCount: (index.pages || []).filter((page) => Boolean(page.duplicateOf)).length,
    retirementPendingPageCount: (index.pages || []).filter((page) => page.lifecycle === "retirement-pending").length,
    inventoryAvailable: Boolean(index.inventory),
    inventoryComplete: index.inventory?.complete === true,
    failureCount: Number(index.failureCount || 0),
    staleSourceCount: expiredApprovedSourceCount,
    expiredApprovedSourceCount,
    expiredApprovedFactCount,
    // This is a narrow evidence-freshness signal, not a release decision.
    // The release workflow still evaluates candidate review, inventory, and
    // deployment gates independently.
    approvedEvidenceCurrent,
    // Record details are opt-in for the authenticated owner endpoint only.
    ...(includeStaleSources ? { staleSources: staleSources.map(({ id, sourceUrl, contentHash, checkedAt, staleAfter }) => ({
      id, sourceUrl, contentHash, checkedAt, staleAfter,
    })) } : {}),
    liveConnectorCount: index.sources.filter((source) => isDynamicSource(source) || /-connector-/.test(String(source.id || ""))).length,
    // Source and fact freshness drive the same stale gate. A fact-only expiry
    // must wake source monitors and soak checks just like an expired page.
    stale: expiredApprovedSourceCount > 0 || expiredApprovedFactCount > 0,
    refreshing: Boolean(refreshPromise),
    lastRefreshError: effectiveRefreshError,
    // A release fingerprint identifies the reviewed snapshot. Live calendar
    // and status records rotate normally and must not change this identifier.
    activeFingerprint: index.releaseFingerprint || fingerprint(index),
    promotionMode: "workflow-gated",
    lastSuccessfulPromotion: index.promotedAt || lastSuccessfulPromotion,
    lastRollback: index.rolledBackAt || lastRollback,
    lastIncrementalRefresh,
    lastInventoryReconciliation,
    lastForcedReconciliation,
    lastExactRevalidation,
    sourceReview: {
      pendingItemCount: reviewItems.filter((item) => item.status === "pending").length,
      pendingSensitiveReviewCount: reviewItems.filter((item) => item.status === "pending" && item.sensitive).length,
    },
    ...factStatus,
    pendingReview: pendingReview ? {
      checkedAt: pendingReview.checkedAt,
      changedSourceCount: pendingReview.changedSourceIds.length,
      newSourceCount: pendingReview.newSourceIds.length,
      removedSourceCount: pendingReview.removedSourceIds.length,
      candidateFingerprint: pendingReview.candidateFingerprint,
      trustedFingerprint: pendingReview.trustedFingerprint,
    } : null,
  };
}

async function revalidateDueApprovedEvidence(options = {}) {
  const trusted = options.index || getBundledIndex();
  const now = options.now ?? Date.now();
  const result = await revalidateApprovedEvidence(trusted, {
    now,
    staleAfterMs: options.staleAfterMs,
    // A small per-run fan-out avoids overwhelming one CivicPlus host when a
    // cluster of FAQ pages is due together. Exact proof is still required.
    concurrency: options.concurrency || Number(process.env.COMMUNITY_REVALIDATION_CONCURRENCY || 2),
    fetchObservedHashes: options.fetchObservedHashes || ((sourceUrl, approvedSources) => observeCanonicalSource(sourceUrl, approvedSources, {
      fetchImpl: options.fetchImpl,
      extractPdfTextImpl: options.extractPdfText,
      timeoutMs: options.timeoutMs || Number(process.env.COMMUNITY_REVALIDATION_TIMEOUT_MS || 30_000),
    })),
  });
  result.graced = applyDomainOutageGrace(result.temporaryIndex, result.checks, trusted, { now });
  const reviewRequired = result.checks.filter((check) => check.outcome !== "renewed");
  lastExactRevalidation = {
    checkedAt: new Date(now).toISOString(),
    dueUrlCount: result.checks.length,
    renewedUrlCount: result.checks.length - reviewRequired.length,
    reviewRequiredUrlCount: reviewRequired.length,
    graceSourceCount: result.graced.length,
  };
  // This clone differs only in freshness timestamps after complete exact proof.
  // It never imports crawled content, candidates, or review decisions.
  if (!options.index || options.replaceCurrent === true) currentIndex = result.temporaryIndex;
  return result;
}

function sourceLocation(source) {
  const url = new URL(source.sourceUrl);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  const document = url.pathname.match(/^\/DocumentCenter\/View\/(\d+)(?:\/|$)/i);
  if (document) url.pathname = `/DocumentCenter/View/${document[1]}`;
  url.searchParams.sort();
  return url.href;
}

function refreshApprovedSource(source, candidateSources) {
  const matches = candidateSources.filter((item) => sourceLocation(item) === sourceLocation(source) && item.contentHash === source.contentHash);
  const refreshed = matches.length === 1 ? matches[0] : null;
  // Source IDs may change when duplicate titles are disambiguated. Only a
  // matching official location AND exact content hash may renew freshness;
  // retain approved text, actions, facts, and identity unchanged.
  return refreshed ? { ...source, checkedAt: refreshed.checkedAt, staleAfter: refreshed.staleAfter } : source;
}

function refreshApprovedFactLedger(factLedger = [], sources = []) {
  const sourceVersions = new Map(sources.map((source) => [`${source.id}:${source.contentHash}`, source]));
  return factLedger.map((entry) => {
    const source = sourceVersions.get(`${entry.sourceId}:${entry.sourceVersion}`);
    if (!source) return entry;
    return {
      ...entry,
      lastObservedAt: source.checkedAt || entry.lastObservedAt,
      staleAfter: source.staleAfter || entry.staleAfter,
    };
  });
}

function reconcileCommunityIndex(trusted, candidate, options = {}) {
  if (options.promoteChanges === true) return {
    index: {
      ...candidate,
      promotedAt: new Date().toISOString(),
      releaseFingerprint: fingerprint(candidate),
    },
    pendingReview: null,
  };
  const trustedStaticSources = trusted.sources.filter((source) => !isDynamicSource(source));
  const candidateStaticSources = candidate.sources.filter((source) => !isDynamicSource(source));
  const candidateDynamicSources = candidate.sources.filter(isDynamicSource);
  const trustedById = new Map(trustedStaticSources.map((source) => [source.id, source]));
  const candidateById = new Map(candidateStaticSources.map((source) => [source.id, source]));
  const changedSourceIds = trustedStaticSources
    .filter((source) => candidateById.has(source.id) && (candidateById.get(source.id).contentHash !== source.contentHash || sourceLocation(candidateById.get(source.id)) !== sourceLocation(source)))
    .map((source) => source.id);
  const newSourceIds = candidateStaticSources.filter((source) => !trustedById.has(source.id)).map((source) => source.id);
  const removedSourceIds = trustedStaticSources.filter((source) => !candidateById.has(source.id)).map((source) => source.id);
  const refreshedTrustedSources = trustedStaticSources.map((source) => refreshApprovedSource(source, candidateStaticSources));
  // The bundled ledger is the reviewed record, while source.facts also contains
  // extraction candidates that have never been approved. Rebuilding from the
  // raw source facts can silently discard reviewed IDs and replace them with a
  // new interpretation. Preserve every reviewed decision and only renew its
  // freshness when the exact approved source version was observed again.
  const reviewedLedger = Array.isArray(trusted.factLedger)
    ? refreshApprovedFactLedger(trusted.factLedger, refreshedTrustedSources)
    : buildFactLedger({ ...trusted, sources: refreshedTrustedSources }, { trusted: true });
  // Proposed facts remain in the version-bound review queue. They are not
  // part of the active answer index until the owner approves and promotes a
  // reviewed release.
  const factLedger = reviewedLedger;
  const truthResolution = resolveFactLedger(factLedger, getCommunityProfile());
  if (!changedSourceIds.length && !newSourceIds.length && !removedSourceIds.length) {
    return {
      index: {
        ...trusted,
        lastCheckedAt: candidate.generatedAt,
        failureCount: candidate.failureCount,
        failures: candidate.failures,
        inventory: candidate.inventory,
        pages: candidate.pages,
        factLedger,
        truthStatus: {
          ...(trusted.truthStatus || {}),
          generatedAt: candidate.generatedAt,
          unresolvedConflictCount: truthResolution.unresolved.length,
          unresolvedSensitiveConflictCount: truthResolution.unresolvedSensitive.length,
          pendingSensitiveReviewCount: factLedger.filter((entry) => entry.reviewStatus === "candidate").length,
        },
        sources: [...refreshedTrustedSources, ...candidateDynamicSources],
        sourceCount: refreshedTrustedSources.length + candidateDynamicSources.length,
        promotedAt: trusted.promotedAt,
        releaseFingerprint: trusted.releaseFingerprint || fingerprint(trusted),
      },
      pendingReview: null,
    };
  }
  return {
    index: {
      ...trusted,
      lastCheckedAt: candidate.generatedAt,
      failureCount: candidate.failureCount,
      failures: candidate.failures,
      discoveryWarnings: candidate.discoveryWarnings || [],
      inventory: candidate.inventory,
      pages: candidate.pages,
      factAuthority: candidate.factAuthority || getCommunityProfile().factAuthority,
      factLedger,
      truthStatus: {
        ...(trusted.truthStatus || {}),
        generatedAt: candidate.generatedAt,
        unresolvedConflictCount: truthResolution.unresolved.length,
        unresolvedSensitiveConflictCount: truthResolution.unresolvedSensitive.length,
        pendingSensitiveReviewCount: factLedger.filter((entry) => entry.reviewStatus === "candidate").length,
      },
      sources: [...refreshedTrustedSources, ...candidateDynamicSources],
      sourceCount: refreshedTrustedSources.length + candidateDynamicSources.length,
    },
    pendingReview: {
      checkedAt: candidate.generatedAt,
      changedSourceIds,
      newSourceIds,
      removedSourceIds,
      candidateFingerprint: fingerprint({ sources: candidateStaticSources }),
      trustedFingerprint: fingerprint({ sources: trustedStaticSources }),
    },
  };
}

async function refreshCommunitySources(options = {}) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    // An incremental inventory crawl has a page budget. Before it runs, clear
    // every due approved URL that has full exact proof, with bounded parallel
    // requests. This prevents a cold deployment from claiming a completed
    // refresh while an arbitrary remainder of approved evidence stays stale.
    if (options.exactRevalidation !== false && communitySourceStatus(getBundledIndex()).stale) {
      await revalidateDueApprovedEvidence(options);
    }
    return crawlCommunity(getCommunityProfile(), { previousIndex: getBundledIndex(), incrementalRefresh: true, ...options });
  })()
    .then(async (index) => {
      if (index.sources.length < 20) throw new Error(`Refresh returned only ${index.sources.length} source records.`);
      reviewItems = buildReviewItems(getBundledIndex(), index, getCommunityProfile());
      try {
        await syncReviewItems(reviewItems);
        lastReviewSyncError = "";
      } catch (error) {
        lastReviewSyncError = error?.message || String(error);
        console.warn(`Community source review sync failed: ${lastReviewSyncError}`);
      }
      const reconciled = reconcileCommunityIndex(getBundledIndex(), index, options);
      currentIndex = reconciled.index;
      pendingReview = reconciled.pendingReview;
      if (!pendingReview && reconciled.index.promotedAt) lastSuccessfulPromotion = reconciled.index.promotedAt;
      lastRefreshError = "";
      lastIncrementalRefresh = index.generatedAt;
      if (options.fullInventory) lastInventoryReconciliation = index.generatedAt;
      if (options.forceContent) lastForcedReconciliation = index.generatedAt;
      return currentIndex;
    })
    .catch((error) => {
      lastRefreshError = error?.message || String(error);
      throw error;
    })
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function getCommunityIndex(options = {}) {
  const index = getBundledIndex();
  if (options.refreshIfStale !== false && communitySourceStatus(index).stale && !refreshPromise) {
    refreshCommunitySources().catch((error) => console.warn(`Community source refresh failed: ${error.message}`));
  }
  return index;
}

function scheduleCommunityRefresh() {
  if (process.env.COMMUNITY_AUTO_REFRESH === "false") return;
  const first = setTimeout(() => refreshCommunitySources().catch((error) => console.warn(`Community source refresh failed: ${error.message}`)), 30_000);
  first.unref?.();
  const interval = setInterval(() => refreshCommunitySources().catch((error) => console.warn(`Community source refresh failed: ${error.message}`)), REFRESH_INTERVAL_MS);
  interval.unref?.();
  const inventory = setInterval(() => refreshCommunitySources({ maxPages: 500, maxDocuments: 250, fullInventory: true })
    .catch((error) => console.warn(`Community source inventory reconciliation failed: ${error.message}`)), INVENTORY_INTERVAL_MS);
  inventory.unref?.();
  const forced = setInterval(() => refreshCommunitySources({ maxPages: 500, maxDocuments: 250, fullInventory: true, forceContent: true })
    .catch((error) => console.warn(`Community source forced reconciliation failed: ${error.message}`)), FORCED_RECONCILIATION_INTERVAL_MS);
  forced.unref?.();
}

module.exports = { communitySourceStatus, getCommunityIndex, getCommunityProfile, isFreshnessTrackedSource, reconcileCommunityIndex, refreshCommunitySources, revalidateDueApprovedEvidence, scheduleCommunityRefresh };
