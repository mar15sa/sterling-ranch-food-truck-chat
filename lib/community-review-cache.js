// A read cache only: decisions must still read the backing store afresh.
function createReviewCache({ ttlMs = 300000, backoffMs = 30000, now = Date.now } = {}) {
  let records = [];
  let loaded = false;
  let checkedAt = '';
  let lastAttemptAt = '';
  let checkedMs = 0;
  let attemptedMs = 0;
  let failedMs = 0;
  let error = null;
  let inflight = null;
  let generation = 0;
  const stale = () => !loaded || Boolean(error) || now() - checkedMs >= ttlMs;

  function refresh(loader, options = {}) {
    if (inflight) return inflight;
    if (error && now() - failedMs < backoffMs) return Promise.reject(error);
    if (!options.refresh && !stale()) return Promise.resolve(records);
    const startedGeneration = generation;
    attemptedMs = now();
    lastAttemptAt = new Date(attemptedMs).toISOString();
    const request = Promise.resolve().then(loader).then(result => {
      if (!Array.isArray(result)) throw new Error('The source-review inventory is incomplete.');
      if (startedGeneration !== generation) return null;
      records = result;
      loaded = true;
      checkedMs = now();
      checkedAt = new Date(checkedMs).toISOString();
      error = null;
      return records;
    }).catch(failure => {
      if (startedGeneration === generation) {
        error = failure instanceof Error ? failure : new Error(String(failure));
        failedMs = now();
      }
      throw failure;
    }).finally(() => { if (inflight === request) inflight = null; });
    inflight = request;
    return request;
  }

  async function load(loader, options = {}) {
    const result = await refresh(loader, options);
    // A concurrent write invalidated the read. Never return that pre-write result.
    return result === null ? load(loader, { refresh: true }) : result;
  }

  function snapshot(loader, options = {}) {
    if (options.refresh || stale()) void load(loader, options).catch(() => {});
    return { records, loaded, loading: Boolean(inflight), stale: stale(), checkedAt, lastAttemptAt,
      error: error ? String(error.message || error) : null };
  }

  function invalidate() {
    generation += 1;
    records = [];
    loaded = false;
    checkedAt = '';
    error = null;
  }

  return { snapshot, load, invalidate, isLoading: () => Boolean(inflight) };
}

module.exports = { createReviewCache };
