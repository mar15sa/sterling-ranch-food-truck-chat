"use strict";
// Keep complete evidence units within a total prompt budget. Never silently cut a clause or table row.
function budgetEvidenceText(sources, { maxSources = 6, maxChars = 30000, project = source => source.text || source.excerpt || "" } = {}) {
  let remaining = maxChars;
  const providedContexts = new Set();
  return sources.slice(0, maxSources).map(source => {
    const full = String(project(source)).trim();
    const context = source.evidenceContext;
    const contextKey = context?.expanded && context.chunkIds?.length
      ? JSON.stringify([source.communityId, source.sourceUrl, context.sourceTextHash,
        context.productId, context.jobId, context.chunkIds, full]) : null;
    if (contextKey && providedContexts.has(contextKey))
      return { source, text: "", contextCoverage: "duplicate-evidence-already-provided" };
    if (full.length <= remaining) {
      remaining -= full.length;
      if (contextKey) providedContexts.add(contextKey);
      return { source, text: full, contextCoverage: source.evidenceContext?.coverage || "provided-evidence" };
    }
    const excerpt = String(source.excerpt || "").trim();
    const normalized = value => value.replace(/\s+/g, " ");
    if (excerpt && excerpt.length <= remaining && normalized(full).includes(normalized(excerpt))) {
      remaining -= excerpt.length;
      return { source, text: excerpt, contextCoverage: "excerpt-only-budget" };
    }
    return { source, text: "", contextCoverage: "omitted-budget" };
  });
}
module.exports = { budgetEvidenceText };
