const fs = require("node:fs");
const path = require("node:path");
const { crawlCommunity } = require("./community-ingest");
const { validateCommunityProfile, validateSourceRecord } = require("./community-contracts");
const { fingerprint } = require("./community-release");

const PROFILE_PATH = path.join(__dirname, "..", "data", "communities", "sterling-ranch.json");
const INDEX_PATH = path.join(__dirname, "..", "data", "community-index.json");
const REFRESH_INTERVAL_MS = Number(process.env.COMMUNITY_REFRESH_INTERVAL_MS || 6 * 60 * 60 * 1000);
let profile;
let currentIndex;
let refreshPromise = null;
let lastRefreshError = "";
let pendingReview = null;
let lastSuccessfulPromotion = null;
let lastRollback = null;
const DYNAMIC_CONNECTOR_TYPES = new Set(["civicplus-calendar", "live-status"]);

function isDynamicSource(source = {}) {
  return DYNAMIC_CONNECTOR_TYPES.has(source.connectorType) || source.sourceType === "events";
}

function isFreshnessTrackedSource(source = {}) {
  // Connector records and configured action records are routing pointers, not
  // copied factual content. Their destinations are checked by live connector
  // and link tests; expiring the pointer itself creates a false stale state.
  // Retrieved pages and documents still retain their normal freshness gates.
  return !isDynamicSource(source)
    && !/-connector-/.test(String(source.id || ""))
    && source.connectorType !== "official-action";
}

function loadJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

function getCommunityProfile() {
  if (!profile) profile = validateCommunityProfile(loadJson(PROFILE_PATH));
  return profile;
}

function getBundledIndex() {
  if (!currentIndex) {
    currentIndex = loadJson(INDEX_PATH);
    currentIndex.sources.forEach(validateSourceRecord);
    lastSuccessfulPromotion = currentIndex.promotedAt || lastSuccessfulPromotion;
  }
  return currentIndex;
}

function communitySourceStatus(index = getBundledIndex(), now = Date.now()) {
  const staleSources = index.sources.filter((source) => isFreshnessTrackedSource(source) && source.staleAfter && new Date(source.staleAfter).getTime() < now);
  return {
    communityId: index.communityId,
    generatedAt: index.generatedAt,
    sourceCount: index.sources.length,
    pageCount: Number(index.inventory?.indexedPageCount || index.pageCount || 0),
    discoveredPageCount: Number(index.inventory?.discoveredCount || index.pageCount || 0),
    eligiblePageCount: Number(index.inventory?.eligibleCount || index.pageCount || 0),
    pendingPageCount: Number(index.inventory?.pendingCount || 0),
    excludedPageCount: Number(index.inventory?.excludedCount || 0),
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
  if (!changedSourceIds.length && !newSourceIds.length && !removedSourceIds.length) {
    return {
      index: {
        ...candidate,
        sources: [...trustedStaticSources.map((source) => refreshApprovedSource(source, candidateStaticSources)), ...candidateDynamicSources],
        promotedAt: trusted.promotedAt,
        releaseFingerprint: trusted.releaseFingerprint || fingerprint(trusted),
      },
      pendingReview: null,
    };
  }
  const refreshedTrustedSources = trustedStaticSources.map((source) => {
    return refreshApprovedSource(source, candidateStaticSources);
  });
  return {
    index: {
      ...trusted,
      lastCheckedAt: candidate.generatedAt,
      failureCount: candidate.failureCount,
      failures: candidate.failures,
      discoveryWarnings: candidate.discoveryWarnings || [],
      inventory: candidate.inventory,
      pages: candidate.pages,
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
    .then((index) => {
      if (index.sources.length < 20) throw new Error(`Refresh returned only ${index.sources.length} source records.`);
      const reconciled = reconcileCommunityIndex(getBundledIndex(), index, options);
      currentIndex = reconciled.index;
      pendingReview = reconciled.pendingReview;
      if (!pendingReview && reconciled.index.promotedAt) lastSuccessfulPromotion = reconciled.index.promotedAt;
      lastRefreshError = "";
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
}

module.exports = { communitySourceStatus, getCommunityIndex, getCommunityProfile, isFreshnessTrackedSource, reconcileCommunityIndex, refreshCommunitySources, scheduleCommunityRefresh };
