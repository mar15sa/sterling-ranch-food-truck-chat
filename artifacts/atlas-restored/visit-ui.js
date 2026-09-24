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
const visitFor = place => place?.visit && typeof place.visit === 'object' ? place.visit : {};
const sourceLink = (url, label = 'Source') => {
  const href = safeUrl(url);
  return href ? `<a class="visit-fact-source" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>` : '';
};

function actionLink(action, primary = false) {
  const href = safeUrl(action?.url);
  const label = String(action?.label || '').trim();
  if (!href || !label) return '';
  return `<a class="${primary ? 'visit-primary-action' : 'visit-action'}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}${primary ? '<span aria-hidden="true">↗</span>' : ''}</a>`;
}

/** Compact, noninteractive labels for map pins, search results, and directory buttons. */
export function accessBadges(place, { detailed = false } = {}) {
  const access = visitFor(place).access;
  const kind = access?.kind;
  const labels = { public: 'Public access', resident: 'Resident access', apartment: 'Apartment amenity', unknown: 'Access unconfirmed' };
  const label = labels[kind] || (typeof place?.access === 'string' && place.access.trim() ? 'Access details' : 'Access unconfirmed');
  const detail = typeof access?.text === 'string' && access.text.trim() ? access.text.trim() : typeof place?.access === 'string' ? place.access.trim() : '';
  const reservation = visitFor(place).reservation;
  const reservationLabel = reservation?.supported === true && (reservation.required === true || reservation.status === 'required') ? 'Reservation required'
    : reservation?.supported === true && (reservation.available === true || reservation.status === 'available') ? 'Reservations available' : '';
  const future = place?.future === true || visitFor(place).future === true;
  const badges = `${future ? '<span class="visit-access-badge visit-future-badge">Future</span>' : ''}<span class="visit-access-badge visit-access-${escapeHtml(labels[kind] ? kind : 'unknown')}">${escapeHtml(label)}</span>${reservationLabel ? `<span class="visit-access-badge visit-reservation-badge">${reservationLabel}</span>` : ''}`;
  if (!detailed) return badges;
  return `${badges}${detail ? `<span class="visit-access-detail">${escapeHtml(detail)}</span>` : ''}${sourceLink(access?.sourceUrl, 'Access source')}`;
}

const factRow = (label, text, sourceUrl) => text
  ? `<section class="visit-fact"><h4>${escapeHtml(label)}</h4><p>${escapeHtml(text)}${sourceLink(sourceUrl)}</p></section>` : '';

const practicalItems = place => textList(place.suitability?.length ? place.suitability : place.visitNotes?.length ? place.visitNotes : place.facts);

export function visitCard(place, { parent = null, compact = false } = {}) {
  if (!place || typeof place !== 'object') return '';
  const visit = visitFor(place);
  const actions = Array.isArray(place.actions) ? place.actions : place.action ? [place.action] : [];
  const sources = Array.isArray(place.sources) ? place.sources : [];
  const primary = actions.map(action => actionLink(action, true)).filter(Boolean);
  const actionUrls = new Set(actions.map(action => safeUrl(action?.url)).filter(Boolean));
  const linkedVisitSources = textList(visit.sourceUrls).map(url => ({ label: 'Visit source', url }));
  const evidence = [...sources, ...linkedVisitSources].filter(source => !actionUrls.has(safeUrl(source?.url))).map(source => actionLink(source)).filter(Boolean);
  const highlights = textList(place.highlights).slice(0, compact ? 3 : 6);
  const practical = practicalItems(visit).concat(practicalItems(visit).length ? [] : practicalItems(place)).slice(0, compact ? 3 : 6);
  const parentAddress = !place.address && parent?.address ? parent.address : '';
  const location = place.address
    ? `<p class="visit-address"><span>Property address</span>${escapeHtml(place.address)}</p>`
    : parentAddress ? `<p class="visit-address visit-parent-location"><span>Parent location</span><button type="button" data-open="${escapeHtml(parent.id)}">${escapeHtml(parentAddress)}</button></p>` : '';
  const isFuture = place.future || visit.future;
  const status = isFuture ? 'Future' : place.status && !['existing', 'listed'].includes(place.status) ? place.status : '';
  const statusBadge = status ? `<span class="visit-status${isFuture ? ' visit-status-future' : ''}">${escapeHtml(status)}</span>` : '';
  const reservation = /not published|not verified|no .*reservation|no .*booking|no .*process|not established/i.test(visit.reservation?.text||'') ? '' : factRow('Reservation', visit.reservation?.text, visit.reservation?.sourceUrl);
  const hours = factRow('Hours', visit.hours?.text, visit.hours?.sourceUrl);
  const arrivalText = visit.arrival?.text;
  const propertyAddress=place.address||parentAddress;
  const directions = safeUrl(visit.arrival?.directionsUrl) || (!isFuture && propertyAddress && place.category!=='infrastructure' ? 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(propertyAddress) : '');
  const arrival = arrivalText || directions ? `<section class="visit-fact visit-arrival"><h4>Arrival</h4>${arrivalText ? `<p>${escapeHtml(arrivalText)}${sourceLink(visit.arrival?.sourceUrl)}</p>` : ''}${visit.arrival?.verifiedEntrance === false ? '<p class="visit-caution">The entrance location has not been confirmed.</p>' : ''}${directions ? `<a class="visit-directions" href="${escapeHtml(directions)}" target="_blank" rel="noopener noreferrer">${visit.arrival?.verifiedEntrance === true ? 'Directions to entrance' : 'Open directions to property (entrance unconfirmed)'} <span aria-hidden="true">↗</span></a>` : ''}</section>` : '';
  const highlightsHtml = highlights.length ? `<section class="visit-highlights"><h4>Highlights</h4><ul>${highlights.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>` : '';
  const practicalHtml = practical.length ? `<section class="visit-highlights visit-practical"><h4>Practical notes</h4><ul>${practical.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>` : '';
  const unknowns = textList(place.unknowns).slice(0, compact ? 2 : 4);
  const unknownHtml = unknowns.length ? `<aside class="visit-unknowns"><strong>Still to confirm</strong><ul>${unknowns.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></aside>` : '';
  const freshnessDate = visit.checkedAt || visit.lastVerified;
  const freshness = freshnessDate ? `<p class="visit-freshness">${visit.checkedAt && visit.verificationState!=='retained' ? 'Checked' : 'Saved information'}: ${escapeHtml(freshnessDate)}${visit.verificationState==='retained'?' · latest details not reverified':''}</p>` : '';
  const sourcesHtml = evidence.length || place.note ? `<details class="visit-sources"><summary>Sources${evidence.length ? ` · ${evidence.length}` : ''}</summary>${evidence.length ? `<div>${evidence.join('')}</div>` : ''}${place.note ? `<p>${escapeHtml(place.note)}</p>` : ''}</details>` : '';
  const access = `<section class="visit-access"><h4>Access</h4><p>${accessBadges(place, { detailed: true })}</p></section>`;
  return `<section class="visit-card${compact ? ' visit-card-compact' : ''}" aria-label="Visit information for ${escapeHtml(place.name || 'this place')}">${statusBadge}${highlightsHtml}${access}${reservation}${hours}${freshness}${location}${arrival}${practicalHtml}${primary.length ? `<div class="visit-primary-actions">${primary.join('')}</div>` : ''}${unknownHtml}${sourcesHtml}</section>`;
}

export { escapeHtml, safeUrl };
