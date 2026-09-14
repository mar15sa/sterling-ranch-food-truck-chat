const decisions = require('../data/community-page-dispositions.json');
const { isDynamicSource } = require('./community-source-identity');

function comparableUrl(value = '') {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function decisionForPageSource(source = {}, index = {}) {
  if ((source.communityId || index.communityId) !== decisions.communityId) return null;
  const sourceUrl = comparableUrl(source.sourceUrl || source.canonicalUrl || source.url);
  if (!sourceUrl) return null;
  const decision = (decisions.records || []).find(record => comparableUrl(record.sourceUrl) === sourceUrl);
  if (!decision) return null;
  const page = (index.pages || []).find(candidate => comparableUrl(candidate.canonicalUrl || candidate.url) === sourceUrl);
  return {
    ...decision,
    versionMatches: page
      ? page.contentFingerprint === decision.versionFingerprint
      : source.contentHash === decision.versionFingerprint,
  };
}

function isPageSourceWithheld(source = {}, index = {}) {
  const decision = decisionForPageSource(source, index);
  if (!decision) return false;
  if (decision.disposition === 'excluded') return true;
  if (decision.disposition === 'live-feed') return !isDynamicSource(source);
  return false;
}

module.exports = { comparableUrl, decisionForPageSource, isPageSourceWithheld };
