const crypto = require("node:crypto");
const { detectFactConflicts, validateSourceRecord } = require("./community-contracts");
const { containsEmbeddedInstructions } = require("./community-ingest");

const CHANGING_FACT_TYPES = new Set(["money", "phone", "email", "time", "date", "limit", "link"]);

function fingerprint(index = {}) {
  return crypto.createHash("sha256").update((index.sources || [])
    .map((source) => `${source.id}:${source.contentHash}`)
    .sort()
    .join("\n")).digest("hex");
}

function sourceMap(index = {}) {
  return new Map((index.sources || []).map((source) => [source.id, source]));
}

function factsByKey(source = {}) {
  return new Map((source.facts || []).map((fact) => [`${fact.factKey || fact.id}:${fact.type}`, fact]));
}

function diffCommunityIndexes(trusted = {}, candidate = {}) {
  const before = sourceMap(trusted);
  const after = sourceMap(candidate);
  const changed = [];
  const added = [];
  const removed = [];
  const factChanges = [];
  const actionChanges = [];
  for (const [id, source] of after) {
    if (!before.has(id)) { added.push(id); continue; }
    const old = before.get(id);
    let sourceChanged = old.contentHash !== source.contentHash;
    const oldFacts = factsByKey(old);
    const newFacts = factsByKey(source);
    for (const [key, fact] of newFacts) {
      const previous = oldFacts.get(key);
      if (!previous || previous.value !== fact.value) {
        factChanges.push({ sourceId: id, factKey: key, before: previous?.value || null, after: fact.value });
        sourceChanged = true;
      }
    }
    const beforeActions = new Set((old.actions || []).map((action) => action.url));
    const afterActions = new Set((source.actions || []).map((action) => action.url));
    const addedActions = [...afterActions].filter((url) => !beforeActions.has(url));
    const removedActions = [...beforeActions].filter((url) => !afterActions.has(url));
    if (addedActions.length || removedActions.length) {
      actionChanges.push({ sourceId: id, added: addedActions, removed: removedActions });
      sourceChanged = true;
    }
    if (sourceChanged) changed.push(id);
  }
  for (const id of before.keys()) if (!after.has(id)) removed.push(id);
  return {
    trustedFingerprint: fingerprint(trusted),
    candidateFingerprint: fingerprint(candidate),
    changedSourceIds: changed,
    addedSourceIds: added,
    removedSourceIds: removed,
    factChanges,
    actionChanges,
  };
}

function validateCommunityCandidate(trusted, candidate, profile) {
  const errors = [];
  const warnings = [];
  if (candidate.communityId !== trusted.communityId || candidate.communityId !== profile.communityId) errors.push("Community identity changed.");
  if (!Array.isArray(candidate.sources) || !candidate.sources.length) errors.push("Candidate has no sources.");
  const minimumCount = Math.ceil((trusted.sources || []).length * 0.95);
  if ((candidate.sources || []).length < minimumCount) errors.push(`Source count fell below the 95% floor (${minimumCount}).`);
  if (Number(candidate.failureCount || 0) > Number(trusted.failureCount || 0)) errors.push("Collection failures increased.");
  const allowedHosts = new Set((profile.allowedHosts || []).map((host) => host.toLowerCase()));
  for (const source of candidate.sources || []) {
    try { validateSourceRecord(source); } catch (error) { errors.push(error.message); continue; }
    let sourceHost = "";
    try { sourceHost = new URL(source.sourceUrl).hostname.toLowerCase(); } catch { errors.push(`Source ${source.id} has an invalid URL.`); }
    if (sourceHost && !allowedHosts.has(sourceHost)) errors.push(`Source ${source.id} redirected outside approved hosts.`);
    if (containsEmbeddedInstructions(source.text)) errors.push(`Source ${source.id} contains embedded instructions.`);
    for (const action of source.actions || []) {
      try {
        const url = new URL(action.url);
        if (url.protocol !== "https:") errors.push(`Action ${action.id || action.label} is not a secure link.`);
      } catch { errors.push(`Action ${action.id || action.label} has an invalid URL.`); }
    }
    for (const fact of source.facts || []) {
      if (!CHANGING_FACT_TYPES.has(fact.type)) continue;
      if (!String(fact.context || "").toLowerCase().includes(String(fact.value || "").toLowerCase())) {
        errors.push(`Changing fact ${fact.id || fact.factKey} is missing exact supporting context.`);
      }
    }
  }
  const conflicts = detectFactConflicts(candidate.sources || [], ["price", "contact", "date", "hours"]);
  if (conflicts.length) warnings.push(`${conflicts.length} possible fact groups require answer-time authority resolution.`);
  const diff = diffCommunityIndexes(trusted, candidate);
  if (!diff.changedSourceIds.length && !diff.addedSourceIds.length && !diff.removedSourceIds.length) warnings.push("No material source changes were found.");
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings, diff };
}

function sourceReleaseDecision({ candidateValid, regressionCount = 0, unsupportedClaimCount = 0, belowGoodCount = 0, stagingChecksPassed = false, productionChecksPassed = null } = {}) {
  if (!candidateValid || regressionCount || unsupportedClaimCount || belowGoodCount) return "retain-trusted";
  if (!stagingChecksPassed) return "hold-staging";
  if (productionChecksPassed === false) return "rollback-production";
  if (productionChecksPassed === true) return "release-complete";
  return "promote-production";
}

module.exports = { CHANGING_FACT_TYPES, diffCommunityIndexes, fingerprint, sourceReleaseDecision, validateCommunityCandidate };
