// Scope contacts only when a complete company/email/phone row is available.
// Unclear rows and shared contact details remain unresolved for review.
function contactKey(type, value) {
  return `${type}:${type === 'phone' ? String(value).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '') : String(value).toLowerCase()}`;
}

function directoryContactSubjects(sources = []) {
  const documents = new Map();
  for (const source of sources) {
    const rows = documents.get(source.sourceUrl) || [];
    rows.push(source.text || '');
    documents.set(source.sourceUrl, rows);
  }
  const result = new Map();
  for (const [url, chunks] of documents) {
    const text = chunks.join(' ');
    if (!/Company Landscape Design Irrigation Design Landscape Installation Irrigation Installation Email Phone/.test(text)) continue;
    const contacts = new Map();
    const pattern = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s+(\d{3}[-.\s]\d{3}[-.\s]\d{4})/gi;
    let end = 0;
    for (const match of text.matchAll(pattern)) {
      let prefix = text.slice(end, match.index).trim();
      end = match.index + match[0].length;
      const header = prefix.lastIndexOf('Email Phone');
      if (header >= 0) prefix = prefix.slice(header + 11).trim();
      if (!/\uF050\s*$/u.test(prefix)) continue;
      const company = prefix.replace(/(?:\s*\uF050)+\s*$/u, '').trim();
      if (company.length < 2 || company.length > 120 || /[@\uF050]|\d{3}[-.\s]\d{3}/u.test(company)) continue;
      for (const [type, value] of [['email', match[1]], ['phone', match[2]]]) {
        const key = contactKey(type, value);
        const names = contacts.get(key) || new Set();
        names.add(company);
        contacts.set(key, names);
      }
    }
    result.set(url, new Map([...contacts].filter(([, names]) => names.size === 1).map(([key, names]) => [key, [...names][0]])));
  }
  return result;
}
module.exports = { contactKey, directoryContactSubjects };
