// Identify explicit, labeled hours ranges before fact extraction deduplicates
// repeated clock values. Keep the values out of claim identity.
function hoursScopes(text = '') {
  const result = new Map();
  const day = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Weekdays|Weekends|Daily|M\\s*[-–]\\s*F)';
  const clock = '\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m\\.?';
  const pattern = new RegExp(`\\b(${day}(?:\\s*(?:[-–]|to|through|and|&)\\s*${day})?)\\s*:?\\s*(${clock})\\s*(?:[-–]|to)\\s*(${clock})`, 'dgi');
  const headings = [...text.matchAll(/\b(?:(summer|winter|spring|fall|autumn)\s+)?hours(?:\s+of\s+operation)?\b/gi)];
  for (const match of text.matchAll(pattern)) {
    const heading = headings.filter(h => h.index < match.index).at(-1);
    if (!heading || match.index - heading.index > 500) continue;
    let label = match[1].toLowerCase().replace(/\s+/g, ' ').trim();
    if (/^(?:m\s*[-–]\s*f|mon(?:day)?\s*(?:[-–]|to|through)\s*fri(?:day)?|weekdays)$/.test(label)) label = 'weekday';
    else label = label.replace(/\bmon\b/g, 'monday').replace(/\btue\b/g, 'tuesday').replace(/\bwed\b/g, 'wednesday')
      .replace(/\bthu\b/g, 'thursday').replace(/\bfri\b/g, 'friday').replace(/\bsat\b/g, 'saturday').replace(/\bsun\b/g, 'sunday');
    label = label.replace(/[^a-z]+/g, '-');
    const season = heading[1]?.toLowerCase() || 'regular';
    const context = `${heading[0]}: ${match[0]}`;
    for (const [capture, endpoint] of [[2, 'opening'], [3, 'closing']]) {
      result.set(match.indices[capture][0], { scopeKey: `${season}-${label}-${endpoint}`, facet: 'facility-hours', context });
    }
  }
  return result;
}
module.exports = { hoursScopes };
