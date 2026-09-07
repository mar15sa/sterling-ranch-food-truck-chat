function isDynamicSource(source = {}) {
  if (['civicplus-calendar', 'live-status'].includes(source.connectorType)) return true;
  // Legacy crawled calendar records lack a connector marker. An event topic
  // alone is insufficient: education pages and meeting PDFs are static sources.
  if (source.sourceType !== 'events') return false;
  try {
    const url = new URL(source.sourceUrl);
    return ['https:', 'http:'].includes(url.protocol) && /^\/calendar\.aspx\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}
module.exports = { isDynamicSource };
