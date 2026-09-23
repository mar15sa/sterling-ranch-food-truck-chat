const AREAS = [
  ['Providence', 76, 44],
  ['Ascent', 67, 73],
  ['Prospect', 20, 80],
];

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function guidesFor(trails, area) {
  const guides = Array.isArray(trails) ? trails : trails?.routes;
  return (guides || []).filter(guide => guide?.area === area).length;
}

function labelFor(area, count) {
  return `${area}: ${count} walking ${count === 1 ? 'guide' : 'guides'}. Choose this walking area.`;
}

/**
 * A walk-only orientation view. The landscape is an area guide, not a trail map.
 */
export function walkOverview(trails, activeArea = 'all') {
  const selected = AREAS.some(([area]) => area === activeArea) ? activeArea : 'all';
  const total = AREAS.reduce((sum, [area]) => sum + guidesFor(trails, area), 0);
  const choices = AREAS.map(([area, x, y]) => {
    const count = guidesFor(trails, area);
    const active = selected === area;
    return `<button type="button" class="walk-overview__area${active ? ' is-active' : ''}" data-walk-area="${area}" aria-pressed="${active}" aria-label="${esc(labelFor(area, count))}" style="--walk-area-x:${x}%;--walk-area-y:${y}%"><span>${esc(area)}</span><small>${count} ${count === 1 ? 'guide' : 'guides'}</small></button>`;
  }).join('');
  const filters = [['all', 'Whole neighborhood', total], ...AREAS.map(([area]) => [area, area, guidesFor(trails, area)])]
    .map(([area, label, count]) => `<button type="button" data-walk-area="${area}" aria-pressed="${selected === area}">${esc(label)} <span>${count}</span></button>`)
    .join('');
  const focusClass = selected === 'all' ? ' is-whole-neighborhood' : ` is-focused is-focused-${selected.toLowerCase()}`;

  return `<section class="walk-overview${focusClass}" aria-labelledby="walk-overview-title">
    <div class="walk-overview__heading">
      <div><p class="walk-overview__eyebrow">WALKING AREAS</p><h2 id="walk-overview-title">Find a walk around the neighborhood.</h2></div>
      <p class="walk-overview__legend"><span aria-hidden="true"></span>Choose an area, then explore its highlighted walks below.</p>
    </div>
    <div class="walk-overview__scene" aria-label="Full neighborhood overview with walking-area guide selections">
      <img src="assets/full-landscape.png" alt="Full illustrated overview of Sterling Ranch showing the Providence, Ascent, and Prospect walking areas." draggable="false">
      <div class="walk-overview__area-buttons" role="group" aria-label="Choose a walking area">${choices}</div>
      <p class="walk-overview__note">Village overview · detailed routes below</p>
    </div>
    <div class="walk-overview__filters" role="group" aria-label="Filter walking guides by area">${filters}</div>
  </section>`;
}
