const fs = require("node:fs");
const path = require("node:path");
const { crawlCommunity } = require("./community-ingest");
const { validateCommunityProfile, validateSourceRecord } = require("./community-contracts");
const { fingerprint } = require("./community-release");
const { buildFactLedger, factLedgerStatus, resolveFactLedger } = require("./community-truth");
const { buildReviewItems, syncReviewItems } = require("./community-source-review");

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

function communitySourceStatus(index = getBundledIndex(), now = Date.now()) {
  const dynamicTypes = new Set(["civicplus-calendar", "live-status"]);
  const staleSources = index.sources.filter((source) => !dynamicTypes.has(source.connectorType) && source.staleAfter && new Date(source.staleAfter).getTime() < now);
  const factStatus = factLedgerStatus(index, now);
  return {
    communityId: index.communityId,
    generatedAt: index.generatedAt,
    sourceCount: index.sources.length,
    pageCount: Number(index.inventory?.indexedPageCount || index.pageCount || 0),
    discoveredPageCount: Number(index.inventory?.discoveredCount || index.pageCount || 0),
    eligiblePageCount: Number(index.inventory?.eligibleCount || index.pageCount || 0),
    pendingPageCount: Number(index.inventory?.pendingCount || 0),
    excludedPageCount: Number(index.inventory?.excludedCount || 0),
    duplicatePageCount: (index.pages || []).filter((page) => Boolean(page.duplicateOf)).length,
    retirementPendingPageCount: (index.pages || []).filter((page) => page.lifecycle === "retirement-pending").length,
    inventoryAvailable: Boolean(index.inventory),
    inventoryComplete: index.inventory?.complete === true,
    failureCount: Number(index.failureCount || 0),
    staleSourceCount: staleSources.length,
    liveConnectorCount: index.sources.filter((source) => dynamicTypes.has(source.connectorType)).length,
    stale: staleSources.length > 0,
    refreshing: Boolean(refreshPromise),
    lastRefreshError,
    activeFingerprint: fingerprint(index),
    promotionMode: "workflow-gated",
    lastSuccessfulPromotion: index.promotedAt || lastSuccessfulPromotion,
    lastRollback: index.rolledBackAt || lastRollback,
    lastIncrementalRefresh,
    lastInventoryReconciliation,
    lastForcedReconciliation,
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

function reconcileCommunityIndex(trusted, candidate, options = {}) {
  if (options.promoteChanges === true) return { index: { ...candidate, promotedAt: new Date().toISOString() }, pendingReview: null };
  const trustedById = new Map(trusted.sources.map((source) => [source.id, source]));
  const candidateById = new Map(candidate.sources.map((source) => [source.id, source]));
  const changedSourceIds = trusted.sources
    .filter((source) => candidateById.has(source.id) && candidateById.get(source.id).contentHash !== source.contentHash)
    .map((source) => source.id);
  const newSourceIds = candidate.sources.filter((source) => !trustedById.has(source.id)).map((source) => source.id);
  const removedSourceIds = trusted.sources.filter((source) => !candidateById.has(source.id)).map((source) => source.id);
  if (!changedSourceIds.length && !newSourceIds.length && !removedSourceIds.length) {
    return { index: candidate, pendingReview: null };
  }
  const refreshedTrustedSources = trusted.sources.map((source) => {
    const refreshed = candidateById.get(source.id);
    return refreshed?.contentHash === source.contentHash ? refreshed : source;
  });
  const trustedVersions = new Set(refreshedTrustedSources.map((source) => `${source.id}:${source.contentHash}`));
  const factLedger = buildFactLedger({ ...candidate, sources: refreshedTrustedSources }, {
    previousLedger: trusted.factLedger || [],
    trustedVersions,
  });
  const truthResolution = resolveFactLedger(factLedger, getCommunityProfile());
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
        generatedAt: candidate.generatedAt,
        unresolvedConflictCount: truthResolution.unresolved.length,
        unresolvedSensitiveConflictCount: truthResolution.unresolvedSensitive.length,
        pendingSensitiveReviewCount: candidate.factLedger?.filter((entry) => entry.reviewStatus === "candidate").length || 0,
      },
      sources: refreshedTrustedSources,
      sourceCount: refreshedTrustedSources.length,
    },
    pendingReview: {
      checkedAt: candidate.generatedAt,
      changedSourceIds,
      newSourceIds,
      removedSourceIds,
      candidateFingerprint: fingerprint(candidate),
      trustedFingerprint: fingerprint(trusted),
    },
  };
}

async function refreshCommunitySources(options = {}) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = crawlCommunity(getCommunityProfile(), { previousIndex: getBundledIndex(), ...options })
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

module.exports = { communitySourceStatus, getCommunityIndex, getCommunityProfile, reconcileCommunityIndex, refreshCommunitySources, scheduleCommunityRefresh };
