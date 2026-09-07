const { plainText } = require('./community-onboarding');

function attribute(attributes, name) {
  return attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '';
}

// Track nested tags so a department list inside a person row cannot end that
// person's record early. Unknown layouts fall back to ordinary page handling.
function blocks(html, tag, className) {
  const pattern = new RegExp(`<(/?)${tag}\\b([^>]*)>`, 'gi');
  const stack = [], result = [];
  for (const match of html.matchAll(pattern)) {
    if (!match[1]) stack.push({ start:match.index, selected:attribute(match[2], 'class').split(/\s+/).includes(className) });
    else {
      const start = stack.pop();
      if (start?.selected) result.push(html.slice(start.start, match.index + match[0].length));
    }
  }
  return result;
}

function staffDirectoryRows(html = '', sourceUrl = '') {
  let page;
  try { page = new URL(sourceUrl); } catch { return null; }
  if (!/\/(?:m\/directory|directory\.aspx)\/?$/i.test(page.pathname)) return null;
  const groups = [
    ...blocks(html, 'div', 'directory-table-row').map(html => ({ kind:'department', html })),
    ...blocks(html, 'li', 'list-group-item').map(html => ({ kind:'person', html })),
  ];
  const rows = [], seen = new Set();
  for (const group of groups) {
    const anchors = [...group.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(match => ({ href:attribute(match[1], 'href').replace(/&amp;/gi, '&'), label:plainText(match[2]).trim() }));
    const identity = anchors.filter(link => {
      try {
        const url = new URL(link.href, page);
        return url.origin === page.origin && url.pathname === `/m/directory/${group.kind === 'person' ? 'employee' : 'department'}` && /^\d+$/.test(url.searchParams.get(group.kind === 'person' ? 'eid' : 'did') || '');
      } catch { return false; }
    });
    if (identity.length !== 1 || !identity[0].label) {
      if (anchors.some(link => /^(?:mailto|tel):/i.test(link.href))) return null;
      continue;
    }
    const link = identity[0], url = new URL(link.href, page);
    const id = url.searchParams.get(group.kind === 'person' ? 'eid' : 'did');
    const contacts = anchors.filter(link => /^(?:mailto|tel):/i.test(link.href)).map(link => {
      if (/^mailto:/i.test(link.href)) {
        const value = link.href.slice(7).split('?')[0];
        return /^[A-Z0-9._%+&'-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value) ? `Email: ${value}` : null;
      }
      return /^\+?[\d\s().-]+(?:\s*(?:ext\.?|extension)\s*:?\s*\d+)?$/i.test(link.label) ? `Phone: ${link.label}` : null;
    });
    if (contacts.some(value => !value)) return null;
    const departments = group.kind === 'person' ? anchors.filter(link => /\/m\/directory\/department\?/.test(link.href)).map(link => link.label) : [];
    const text = `Staff directory ${group.kind}: ${link.label}. Details: ${plainText(group.html)}. ${departments.length ? `Departments: ${[...new Set(departments)].join('; ')}. ` : ''}${[...new Set(contacts)].join('. ')}${contacts.length ? '.' : ''}`;
    const subjectKey = `directory-${group.kind}-${id}`;
    const key = `${subjectKey}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ subjectKey, title:link.label, text });
  }
  return rows.length ? rows : null;
}

module.exports = { staffDirectoryRows };
