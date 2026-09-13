const decisions = require('../data/community-document-dispositions.json');

const NON_EVIDENCE_DISPOSITIONS = new Set(['excluded', 'action-only']);

function documentCenterId(value = '') {
  try {
    return new URL(value).pathname.match(/\/DocumentCenter\/View\/(\d+)(?:\/|$)/i)?.[1] || '';
  } catch {
    return '';
  }
}

function decisionForDocumentSource(source = {}, index = {}) {
  if ((source.communityId || index.communityId) !== decisions.communityId) return null;
  const documentId = documentCenterId(source.sourceUrl || source.canonicalUrl || source.url);
  if (!documentId) return null;
  const decision = decisions.records.find(record => record.documentId === documentId);
  if (!decision) return null;
  if (!decision.contentFingerprint) return null;
  const page = (index.pages || []).find(candidate =>
    documentCenterId(candidate.canonicalUrl || candidate.url) === documentId);
  if (!page || page.contentFingerprint !== decision.contentFingerprint) return null;
  return decision;
}

function isDocumentBodyWithheld(source = {}, index = {}) {
  const decision = decisionForDocumentSource(source, index);
  return Boolean(decision && NON_EVIDENCE_DISPOSITIONS.has(decision.disposition));
}

module.exports = {
  NON_EVIDENCE_DISPOSITIONS,
  decisionForDocumentSource,
  documentCenterId,
  isDocumentBodyWithheld,
};
