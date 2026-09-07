const { plainText } = require('./community-onboarding');
const { htmlBlocks, htmlAttribute } = require('./community-staff-directory');

function faqRows(html = '', sourceUrl = '') {
  let page;
  try { page = new URL(sourceUrl); } catch { return null; }
  if (!/\/(?:m\/faq|faq\.aspx)\/?$/i.test(page.pathname)) return null;
  const blocks = htmlBlocks(html, 'li', 'faq-question-item');
  const rows = [], seen = new Set();
  for (const block of blocks) {
    const attributes = block.match(/^<li\b([^>]*)>/i)?.[1] || '';
    const id = htmlAttribute(attributes, 'id').match(/^question-(\d+)$/)?.[1];
    const title = plainText(block.match(/<h3\b[^>]*>[\s\S]*?<button\b[^>]*>([\s\S]*?)<\/button>[\s\S]*?<\/h3>/i)?.[1] || '').trim();
    const answers = htmlBlocks(block, 'div', 'accordion-text');
    if (!id || !title || answers.length !== 1 || !plainText(answers[0]).trim()) return null;
    const text = `Question: ${title} Answer: ${plainText(answers[0]).trim()}`;
    const key = `${id}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ kind:'faq', subjectKey:`faq-question-${id}`, title, text, html:answers[0] });
  }
  return rows.length ? rows : null;
}

module.exports = { faqRows };
