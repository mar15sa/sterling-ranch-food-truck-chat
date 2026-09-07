// These two official rental pages list several venues in one document.
// Keep their named sections and fee purposes separate when proposing facts.
function scopeFacilityFees(sources = []) {
  const groups = new Map();
  for (const source of sources) {
    let url;
    try { url = new URL(source.sourceUrl); } catch { continue; }
    if (url.hostname !== 'sterlingranchcab.com' || !/^\/(?:188\/Indoor-Facilities|269\/Rent-the-Facility)\/?$/i.test(url.pathname)) continue;
    if (!groups.has(source.sourceUrl)) groups.set(source.sourceUrl, []);
    groups.get(source.sourceUrl).push(source);
  }
  const replacements = new Map();
  for (const records of groups.values()) {
    const text = records.map(source => source.text).join(' ');
    const headings = [...text.matchAll(/\b(Great Hall)(?= The (?:Overlook Clubhouse|clubhouse))|\b(Outdoor Pavilions)(?= The clubhouse)|\b(Sterling Center)(?= The Sterling Center exhibit hall)/g)];
    const scoped = [];
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const end = headings[i + 1]?.index ?? text.indexOf('Contact Us', heading.index);
      const section = text.slice(heading.index, end < 0 ? text.length : end);
      const subjectKey = heading[1] ? 'overlook-great-hall' : heading[2] ? 'overlook-outdoor-pavilions' : 'sterling-center-exhibit-hall';
      const pattern = /(?:Resident\s+)?Hourly (?:Pricing\s*:?|Fee\s*:)\s*\$([\d,]+(?:\.\d{2})?)|(?:Resident\s+)?(?:refundable\s+)?security deposit\s*(?:of|:)?\s*\$?([\d,]+\.\d{2})/gi;
      for (const match of section.matchAll(pattern)) {
        const rawAmount = match[1] || match[2];
        const amount = Number(rawAmount.replaceAll(',', ''));
        const scopeKey = match[1] ? 'hourly-rental-fee' : 'security-deposit';
        const position = heading.index + match.index;
        scoped.push({ position, amount, fact: {
          id: `${subjectKey}-${scopeKey}-${amount}`, factKey: `${subjectKey}-${scopeKey}`, type: 'money',
          value: `${match[0].endsWith(`$${rawAmount}`) ? '$' : ''}${rawAmount}`, normalizedValue: amount,
          currency: 'USD', unit: match[1] ? 'hour' : '', effectiveDate: '', subjectKey, scopeKey,
          context: text.slice(position, position + match[0].length), reviewStatus: 'candidate',
          reviewedAt: '', reviewedBy: '',
        } });
      }
    }
    let start = 0;
    for (const source of records) {
      const matches = scoped.filter(item => item.position >= start && item.position < start + source.text.length);
      start += source.text.length + 1;
      if (!matches.length) continue;
      const facts = (source.facts || []).filter(fact => !(fact.type === 'money'
        && /hourly|pricing|deposit/i.test(fact.context || '')
        && matches.some(item => Number(fact.normalizedValue) === item.amount)));
      replacements.set(source.id, { ...source, facts: [...facts, ...matches.map(item => ({ ...item.fact,
        sourceId: source.id, sourceUrl: source.sourceUrl, contentHash: source.contentHash, checkedAt: source.checkedAt }))] });
    }
  }
  return sources.map(source => replacements.get(source.id) || source);
}

module.exports = { scopeFacilityFees };
