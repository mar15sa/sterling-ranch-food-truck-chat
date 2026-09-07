const { factIsAnswerable, resolveFactLedger } = require('./community-truth');
const { isDynamicSource } = require('./community-source-identity');

function sourceReviewGate(index = {}, now = Date.now()) {
  const hasLedger = Array.isArray(index.factLedger);
  const enforce = hasLedger && index.truthStatus?.migrationMode !== 'trusted-baseline';
  const byVersion = new Map();
  const knownSourceIds = new Set();
  const blockedVersions = new Set();
  if (hasLedger) {
    for (const entry of index.factLedger) {
      const key = `${entry.sourceId}:${entry.sourceVersion}`;
      if (!byVersion.has(key)) byVersion.set(key, []);
      byVersion.get(key).push(entry);
      knownSourceIds.add(entry.sourceId);
    }
    for (const group of resolveFactLedger(index.factLedger, { factAuthority: index.factAuthority }).unresolvedSensitive) {
      for (const entry of group.entries) blockedVersions.add(`${entry.sourceId}:${entry.sourceVersion}`);
    }
  }
  return source => {
    if (isDynamicSource(source)) return true;
    const key = `${source.id}:${source.contentHash}`;
    // The migration baseline keeps its reviewed source set usable, but a known
    // sensitive conflict is never safe to expose from either participating source.
    if (!enforce) return !blockedVersions.has(key);
    if (!factIsAnswerable({ ...source, reviewStatus: source.reviewStatus || 'approved' }, now)) return false;
    const entries = byVersion.get(key) || [];
    if (!entries.length) return !knownSourceIds.has(source.id) && !(source.facts || []).length
      && ['approved', 'kept-current'].includes(source.reviewStatus);
    // Prose can contain any of these facts even when a query requests another
    // facet. Do not pass the whole body to a generator with hidden pending facts.
    return !blockedVersions.has(key) && entries.every(entry => factIsAnswerable(entry, now));
  };
}

module.exports = { sourceReviewGate };
