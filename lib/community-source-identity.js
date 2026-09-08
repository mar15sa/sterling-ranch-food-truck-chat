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

function isFreshnessTrackedSource(source = {}) {
  // Connector and configured-action records point to live destinations; they
  // are not the factual evidence used in a resident answer. Their own stale
  // timestamp must not downgrade a cited, current page.
  return !isDynamicSource(source)
    && !/-connector-/.test(String(source.id || ""))
    && source.connectorType !== "official-action";
}

module.exports = { isDynamicSource, isFreshnessTrackedSource };
