// Owner-only operational state. This never supplies or approves answer evidence.
function createReviewSyncState({ now = () => Date.now() } = {}) {
  let observed = { initialized: false, checkedAt: null, items: [], candidateSources: [], candidatePages: [], error: '', refreshing: false };
  let sync = { status: 'not-started', lastAttemptAt: null, lastSuccessAt: null, lastError: '', createdCount: null, existingCount: null };
  const stamp = () => new Date(now()).toISOString();
  return {
    beginObservation() { observed = { ...observed, refreshing: true }; },
    observe(candidate, items) {
      observed = { ...observed, initialized: true, checkedAt: candidate.generatedAt || stamp(),
        items, candidateSources: candidate.sources || [], candidatePages: candidate.pages || [], error: '' };
    },
    failObservation(error) { observed = { ...observed, error: error?.message || String(error) }; },
    endObservation() { observed = { ...observed, refreshing: false }; },
    beginSync() { sync = { ...sync, status: 'syncing', lastAttemptAt: stamp(), lastError: '' }; },
    finishSync(result) {
      sync = { ...sync, status: result.configured ? 'succeeded' : 'unconfigured',
        lastSuccessAt: result.configured ? stamp() : sync.lastSuccessAt,
        createdCount: result.configured ? result.created : null,
        existingCount: result.configured ? result.existing : null, lastError: '' };
    },
    failSync(error) { sync = { ...sync, status: 'failed', lastError: error?.message || String(error) }; },
    snapshot() { return { ...observed, sync: { ...sync } }; },
  };
}

module.exports = { createReviewSyncState };
