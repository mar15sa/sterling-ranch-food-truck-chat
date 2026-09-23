const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const safeUrl = value => {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
};

const textList = values => [...new Set((values || []).map(value => typeof value === 'string' ? value : value?.text).filter(Boolean))];

function actionLink(action, primary = false) {
  const href = safeUrl(action?.url);
  const label = String(action?.label || '').trim();
  if (!href || !label) return '';
  return `<a class="${primary ? 'visit-primary-action' : 'visit-action'}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}${primary ? '<span aria-hidden="true">↗</span>' : ''}</a>`;
}

export function visitCard(place, { parent = null, compact = false } = {}) {
  if (!place || typeof place !== 'object') return '';
  const actions = Array.isArray(place.actions) ? place.actions : place.action ? [place.action] : [];
  const sources = Array.isArray(place.sources) ? place.sources : [];
  const primary = actions.map(action => actionLink(action, true)).filter(Boolean);
  const actionUrls = new Set(actions.map(action => safeUrl(action?.url)).filter(Boolean));
  const evidence = sources.filter(source => !actionUrls.has(safeUrl(source?.url))).map(source => actionLink(source)).filter(Boolean);
  const highlights = textList(place.highlights?.length ? place.highlights : place.visitNotes?.length ? place.visitNotes : place.facts).slice(0, compact ? 3 : 6);
  const parentAddress = !place.address && parent?.address ? parent.address : '';
  const location = place.address
    ? `<p class="visit-address"><span>Address</span>${escapeHtml(place.address)}</p>`
    : parentAddress ? `<p class="visit-address visit-parent-location"><span>Parent location</span><button type="button" data-open="${escapeHtml(parent.id)}">${escapeHtml(parentAddress)}</button></p>`
    : '';
  const status = place.future ? 'Planned' : place.status && !['existing', 'listed'].includes(place.status) ? place.status : '';
  const access = typeof place.access === 'string' && place.access.trim() ? `<p class="visit-access"><strong>Access</strong>${escapeHtml(place.access)}</p>` : '';
  const unknowns = textList(place.unknowns).slice(0, compact ? 2 : 4).map(text=>text
    .replace('Verify restrooms, shade, parking, play ages and accessible route before displaying badges.','Restrooms, shade, parking, play ages and an accessible route are still to be confirmed.')
    .replace('Obtain official segment geometry; distinguish habitat from public trail.','Public trail segments and their exact route are still to be confirmed.')
    .replace('Confirm map label and boundary placement; do not add visitor directions.','The mapped boundary and public visitor access are still to be confirmed.')
    .replace('Is this the same project, or a component of Medley Park? Keep separate until confirmed.','Its relationship to Medley Park is still to be confirmed.'));
  const statusBadge = status ? `<span class="visit-status">${escapeHtml(status)}</span>` : '';
  const highlightsHtml = highlights.length ? `<section class="visit-highlights"><h4>Good to know</h4><ul>${highlights.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>` : '';
  const unknownHtml = unknowns.length ? `<aside class="visit-unknowns"><strong>Still to confirm</strong><ul>${unknowns.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></aside>` : '';
  const sourcesHtml = evidence.length || place.note ? `<details class="visit-sources"><summary>Sources${evidence.length ? ` · ${evidence.length}` : ''}</summary>${evidence.length ? `<div>${evidence.join('')}</div>` : ''}${place.note ? `<p>${escapeHtml(place.note)}</p>` : ''}</details>` : '';
  if (!location && !access && !highlightsHtml && !primary.length && !unknownHtml && !sourcesHtml) return '';
  return `<section class="visit-card${compact ? ' visit-card-compact' : ''}" aria-label="Visit information for ${escapeHtml(place.name || 'this place')}">${statusBadge}${location}${access}${highlightsHtml}${primary.length ? `<div class="visit-primary-actions">${primary.join('')}</div>` : ''}${unknownHtml}${sourcesHtml}</section>`;
}

export { escapeHtml, safeUrl };
