const fs = require("node:fs");
const path = require("node:path");
const { crawlCommunity } = require("./community-ingest");
const { validateCommunityProfile, validateSourceRecord } = require("./community-contracts");
const { fingerprint } = require("./community-release");
const { buildFactLedger, factLedgerStatus, resolveFactLedger } = require("./community-truth");
const { buildReviewItems, syncReviewItems } = require("./community-source-review");
const { isDynamicSource } = require('./community-source-identity');

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
function isFreshnessTrackedSource(source = {}) {
  // Connector records and configured action records are routing pointers, not
  // copied factual content. Their destinations are checked by live connector
  // and link tests; expiring the pointer itself creates a false stale state.
  // Retrieved pages and documents still retain their normal freshness gates.
  return !isDynamicSource(source)
    && !/-connector-/.test(String(source.id || ""))
    && source.connectorType !== "official-action";
}
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
  const staleSources = index.sources.filter((source) => isFreshnessTrackedSource(source) && source.staleAfter && new Date(source.staleAfter).getTime() < now);
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
    liveConnectorCount: index.sources.filter((source) => isDynamicSource(source) || /-connector-/.test(String(source.id || ""))).length,
    stale: staleSources.length > 0,
    refreshing: Boolean(refreshPromise),
    lastRefreshError,
    // A release fingerprint identifies the reviewed snapshot. Live calendar
    // and status records rotate normally and must not change this identifier.
    activeFingerprint: index.releaseFingerprint || fingerprint(index),
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

function sourceLocation(source) {
  const url = new URL(source.sourceUrl);
  url.hash = "";
  const document = url.pathname.match(/^\/DocumentCenter\/View\/(\d+)(?:\/|$)/i);
  if (document) url.pathname = `/DocumentCenter/View/${document[1]}`;
  url.searchParams.sort();
  return url.href;
}

function refreshApprovedSource(source, candidateSources) {
  const refreshed = candidateSources.find((item) => sourceLocation(item) === sourceLocation(source) && item.contentHash === source.contentHash);
  // Source IDs may change when duplicate titles are disambiguated. Only a
  // matching official location AND exact content hash may renew freshness;
  // retain approved text, actions, facts, and identity unchanged.
  return refreshed ? { ...source, checkedAt: refreshed.checkedAt, staleAfter: refreshed.staleAfter } : source;
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
  const trustedVersions = new Set(refreshedTrustedSources.map((source) => `${source.id}:${source.contentHash}`));
  const factLedger = buildFactLedger({ ...trusted, sources: refreshedTrustedSources }, {
    previousLedger: trusted.factLedger || [],
    trustedVersions,
  });
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
        generatedAt: candidate.generatedAt,
        unresolvedConflictCount: truthResolution.unresolved.length,
        unresolvedSensitiveConflictCount: truthResolution.unresolvedSensitive.length,
        pendingSensitiveReviewCount: candidate.factLedger?.filter((entry) => entry.reviewStatus === "candidate").length || 0,
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

module.exports = { communitySourceStatus, getCommunityIndex, getCommunityProfile, isFreshnessTrackedSource, reconcileCommunityIndex, refreshCommunitySources, scheduleCommunityRefresh };
