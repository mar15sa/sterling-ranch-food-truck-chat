"use strict";
const { sourceLifecycleStatus } = require("./rules-source-lifecycle");
const MAX_CONTEXT_CHARS = 24000;
const ID_FIELDS = ["communityId", "id", "productId", "jobId", "sourceTextHash", "chunkHash", "parentSupplementId"];
function sectionVersionKey(document) {
  return JSON.stringify([document.communityId, document.sourceUrl, document.nodeId,
    document.productId, document.jobId, document.sourceTextHash, document.parentSupplementId,
    Boolean(document.isSupplemental), Boolean(document.isInlineTopic)]);
}
function contextIdentity(document) {
  return Object.fromEntries(ID_FIELDS.filter(k => document[k] !== undefined).map(k => [k, document[k]]));
}
function restricted(document, now) {
  return document.ownerReviewApplied || document.ownerReview?.approvedAnswerEvidence ||
    document.searchable === false || document.supersededBy ||
    ["pending", "pending-review", "withheld", "rejected"].includes(document.reviewStatus) ||
    (document.sourceLifecycle && document.sourceLifecycle !== "current") ||
    sourceLifecycleStatus(document, now) !== "current";
}
function availableSectionContext(source, documents, { eligible = () => true, now = Date.now(), maxChars = MAX_CONTEXT_CHARS } = {}) {
  const unchanged = reason => ({ text: source.text || "", expanded: false, reason, chunkIds: [], coverage: "selected-evidence-only" });
  if (restricted(source, now)) return unchanged("restricted-source");
  if (!source.text || !source.nodeId || !source.sourceUrl) return unchanged("missing-source-identity");
  const originals = documents.filter(d => d.nodeId === source.nodeId && d.sourceUrl === source.sourceUrl &&
    d.text === source.text && ID_FIELDS.every(k => source[k] === undefined || d[k] === source[k]));
  if (originals.length !== 1) return unchanged("no-unique-exact-match");
  const original = originals[0];
  if (restricted(original, now) || !eligible(original)) return unchanged("restricted-original");
  const supplement = Boolean(original.isSupplemental);
  if (supplement ? !original.parentSupplementId || !original.sourceTextHash : original.productId == null || original.jobId == null)
    return unchanged("missing-version-identity");
  const siblings = documents.filter(d => d.sourceUrl === original.sourceUrl &&
    d.communityId === original.communityId && Boolean(d.isInlineTopic) === Boolean(original.isInlineTopic) &&
    (supplement
      ? Boolean(d.isSupplemental) && d.parentSupplementId === original.parentSupplementId && d.sourceTextHash === original.sourceTextHash
      : !d.isSupplemental && d.nodeId === original.nodeId && d.productId === original.productId && d.jobId === original.jobId));
  if (siblings.some(d => restricted(d, now) || !eligible(d))) return unchanged("restricted-sibling");
  if (siblings.length < 2) return unchanged("single-chunk");
  const ordered = siblings.map(d => ({ document: d, ordinal: Number(String(d.id || "").match(/::(\d+)$/)?.[1]) }));
  if (ordered.some(x => !Number.isInteger(x.ordinal) || x.ordinal < 1)) return unchanged("unknown-chunk-order");
  ordered.sort((a,b) => a.ordinal-b.ordinal);
  if (ordered.some((x,i) => x.ordinal !== i+1)) return unchanged("noncontiguous-chunks");
  const text = ordered.map(x => x.document.text).join("\n\n");
  if (!Number.isFinite(maxChars) || maxChars < 1 || text.length > maxChars) return unchanged("context-budget");
  return { text, expanded: true, reason: "same-version-section", coverage: "all-available-matching-chunks",
    chunkIds: ordered.map(x => x.document.id), sourceTextHash: original.sourceTextHash || null,
    productId: original.productId ?? null, jobId: original.jobId ?? null };
}
module.exports = { MAX_CONTEXT_CHARS, contextIdentity, sectionVersionKey, availableSectionContext };
