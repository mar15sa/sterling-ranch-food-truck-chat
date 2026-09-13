const { isDocumentBodyWithheld } = require('./community-document-dispositions');

function quarantinedSourceIds(index = {}) {
  return new Set((index.revalidationQuarantine?.sources || [])
    .map((source) => String(source.id || ""))
    .filter(Boolean));
}

function isRuntimeEvidenceWithheld(source = {}, index = {}) {
  return quarantinedSourceIds(index).has(String(source.id || ""))
    || isDocumentBodyWithheld(source, index);
}

module.exports = { isRuntimeEvidenceWithheld, quarantinedSourceIds };
