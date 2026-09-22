const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const overview = $('#neighborhood-panel');
const inside = $('#inside-panel');
const building = $('#building');
let activePlace = 'sterling-center';
let activeGroup = 'food';
let records = new Map();
let directory;

const landmarks = {
  'sterling-center': { kicker: '01 / FOOD, HEALTH & COMMUNITY', title: 'Sterling Center', description: 'Coffee, a market, health services and community help, all at one address.', details: ['8155 Piney River Avenue', 'Explore the places inside'], url: 'https://sterlingranch.com/town-life/sterling-center/' },
  overlook: { kicker: '02 / SWIM, MOVE & GATHER', title: 'The Overlook', description: 'The clubhouse brings the pool, fitness and community gathering spaces together.', details: ['7853 Piney River Avenue', 'Pool access is seasonal', 'Resident, guest and rental rules vary by activity'], url: 'https://sterlingranchcab.com/Facilities/Facility/Details/Overlook-Clubhouse-1', action: 'Check access & amenities' },
  burns: { kicker: '03 / BRING YOUR PADDLE', title: 'Burns Park', description: 'Eight outdoor pickleball courts are the first completed part of the regional park.', details: ['9020 Middle Fork Street', 'Bring paddles and balls', 'Check reservations, open play and weather closures'], url: 'https://sterlingranchcab.com/418/Pickleball-Courts', action: 'Check courts & reservations' },
  'prospect-park': { kicker: '04 / A LITTLE ADVENTURE', title: 'Prospect Park', description: 'An all-abilities playground, lawn and event shell are the starting point for an afternoon outside.', details: ['8158 Monte Vista Circle', 'Check current facility availability', 'Later park phases are planned separately'], url: 'https://sterlingranchcab.com/Facilities/Facility/Details/Prospect-Park-9', action: 'Explore the park amenities' }
};

function announce(message) { $('#announcer').textContent = message; }
function setRoof(open) {
  building.classList.toggle('open', open);
  $('#roof-toggle').setAttribute('aria-pressed', String(open));
  $('#roof-toggle').replaceChildren(document.createTextNode(open ? 'Close the model ' : 'Open the model '));
  const arrow = document.createElement('span'); arrow.textContent = open ? '↓' : '↑'; $('#roof-toggle').append(arrow);
}
function showView(view, focus = false) {
  const opening = view === 'inside';
  overview.hidden = opening; inside.hidden = !opening;
  for (const [id, active] of [['#neighborhood-toggle', !opening], ['#inside-toggle', opening]]) {
    $(id).classList.toggle('active', active); $(id).setAttribute('aria-pressed', String(active));
  }
  if (opening) { setRoof(false); requestAnimationFrame(() => requestAnimationFrame(() => setRoof(true))); }
  if (focus) (opening ? $('#back-to-map') : $('#neighborhood-toggle')).focus({ preventScroll: true });
  announce(opening ? 'Sterling Center opened. Explore food and drink, health, and community services.' : 'The neighborhood overview is visible.');
}
function selectPlace(id) {
  if (!landmarks[id]) return;
  activePlace = id;
  const place = landmarks[id];
  $('#note-kicker').textContent = place.kicker;
  $('#note-title').textContent = place.title;
  $('#note-description').textContent = place.description;
  $('#note-details').replaceChildren(...place.details.map(text => { const item = document.createElement('span'); item.textContent = text; return item; }));
  $('#open-selected').hidden = id !== 'sterling-center';
  $('#place-source').hidden = id === 'sterling-center';
  $('#place-source').href = place.url;
  $('#place-source').textContent = (place.action || 'Plan your visit') + ' ↗';
  $$('[data-place]').forEach(button => { const active = button.dataset.place === id; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active)); });
  announce(place.title + '. ' + place.description);
}

const groups = {
  food: { name: 'Food & gathering', summary: 'Coffee. A bite. Stay awhile.', intro: 'Ranch Social', description: 'The shared gathering place inside Sterling Center.', ids: ['atlas-coffee', 'salta', 'living-dream', 'agora'], descriptions: { 'atlas-coffee': 'Coffee and a place to meet', salta: 'Wine, cocktails and food', 'living-dream': 'Sterling Ranch taproom', agora: 'The neighborhood market' }, initials: ['A', 'S', 'L', 'a'], extras: ['Log playground', 'Patio & fire pit'], advice: 'Food trucks and events change through the week. Check the community calendar for what’s on.', adviceLink: 'https://sterlingranch.com/happenings/events/', adviceLabel: 'View the event calendar' },
  health: { name: 'Health & wellness', summary: 'Everyday care, close to home.', intro: 'Health & wellness', description: 'Separate providers within the building.', referenceGroup: 'health-wellness', descriptions: { uchealth: 'Primary care · urgent care · physical therapy', 'lake-family-dental': 'Dental care · Suite 220', 'sterling-eyecare': 'Eye care · Suite 120', rave: 'RAVE Clinics · Suite 230' }, initials: ['U', 'L', 'E', 'R'], advice: 'Use each provider’s website for appointments, hours and arrival details. Services listed together here may use different check-in desks.' },
  community: { name: 'Community help', summary: 'A good place to start.', intro: 'Community help', description: 'Information and resident-service contacts.', referenceGroup: 'community-help', descriptions: { 'info-center': 'Community and home-search information · Suite 110', 'cab-office': 'Resident services · call before visiting' }, initials: ['i', 'C'], advice: 'CAB and the Info Center share a published on-site contact. Call 720-661-9694 for CAB help before making a trip; a separate public CAB counter is not confirmed.', adviceLink: 'tel:7206619694', adviceLabel: 'Call the community contact' }
};

function element(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }
function renderGroup(id) {
  activeGroup = id; const group = groups[id];
  $$('[data-group]').forEach(tab => { const active = tab.dataset.group === id; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  const content = $('#directory-content'); content.setAttribute('aria-labelledby', 'tab-' + id);
  $('#model-group').textContent = group.name.toUpperCase(); $('#model-summary').textContent = group.summary;
  content.replaceChildren();
  if (!directory) { content.append(element('p', 'group-advice', 'Loading the place directory…')); return; }
  const intro = element('p', 'directory-group-note'); intro.append(element('strong', '', group.intro), document.createElement('br'), document.createTextNode(group.description)); content.append(intro);
  const ids = group.ids || directory.groups.find(g => g.id === group.referenceGroup)?.placeIds || [];
  ids.forEach((placeId, index) => {
    const place = records.get(placeId); if (!place) return;
    const link = element('a', 'tenant-card');
    link.href = place.actions?.[0]?.url || place.action?.url || place.sources?.[0]?.url || landmarks['sterling-center'].url;
    link.target = '_blank'; link.rel = 'noopener';
    link.append(element('span', 'tenant-icon', group.initials[index] || '·'));
    const label = element('span', 'tenant-text');
    label.append(element('strong', '', place.name), element('small', '', group.descriptions[placeId] || place.description));
    link.append(label, element('b', '', '↗')); content.append(link);
  });
  if (group.extras) { const extras = element('div', 'group-extra'); group.extras.forEach(text => extras.append(element('span', '', text))); content.append(extras); }
  const advice = element('p', 'group-advice', group.advice);
  if (group.adviceLink) { const link = element('a', '', group.adviceLabel + ' ↗'); link.href = group.adviceLink; if (!group.adviceLink.startsWith('tel:')) { link.target = '_blank'; link.rel = 'noopener'; } advice.append(document.createElement('br'), link); }
  content.append(advice);
}

$('#neighborhood-toggle').addEventListener('click', () => showView('neighborhood'));
$('#inside-toggle').addEventListener('click', () => showView('inside'));
$('#open-selected').addEventListener('click', () => showView('inside', true));
$('#back-to-map').addEventListener('click', () => showView('neighborhood', true));
$('#context-map').addEventListener('click', () => showView('neighborhood', true));
$('#roof-toggle').addEventListener('click', () => { const open = !building.classList.contains('open'); setRoof(open); announce(open ? 'Sterling Center model opened.' : 'Sterling Center model closed. The directory remains available.'); });
$$('[data-place]').forEach(button => button.addEventListener('click', () => selectPlace(button.dataset.place)));
$$('[data-group]').forEach(tab => {
  tab.addEventListener('click', () => { renderGroup(tab.dataset.group); setRoof(true); });
  tab.addEventListener('keydown', event => {
    const tabs = $$('[data-group]'); const current = tabs.indexOf(tab); let next;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0; if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); tabs[next].focus(); renderGroup(tabs[next].dataset.group); setRoof(true); }
  });
});
for (const [selector, view] of [['#compare-neighborhood', 'neighborhood'], ['#compare-inside', 'inside']]) $(selector).addEventListener('click', () => { showView(view, true); $('.intro').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); });
renderGroup('food');
Promise.all(['catalog-reference.json', 'directory-reference.json'].map(url => fetch(url).then(response => { if (!response.ok) throw new Error('Directory unavailable'); return response.json(); })))
  .then(([catalog, supplement]) => { records = new Map(catalog.places.map(place => [place.id, place])); for (const item of [...supplement.additions, ...supplement.updates]) records.set(item.id, { ...records.get(item.id), ...item }); directory = supplement; renderGroup(activeGroup); })
  .catch(() => { const content = $('#directory-content'); content.replaceChildren(element('p', 'group-advice', 'The study directory could not load. Refresh the page, or use the official directory below.')); const link = element('a', 'primary-action', 'Official Sterling Center directory ↗'); link.href = landmarks['sterling-center'].url; link.target = '_blank'; link.rel = 'noopener'; content.append(link); });
