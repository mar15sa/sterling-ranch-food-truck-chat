// Walk artwork is deliberately separate from CAB's source-map geometry.
// These crops provide atmosphere and area recognition, not route navigation.
const ART = 'assets/full-landscape.png';
const ART_SIZE = [1536, 1024];

const areaCrops = {
  Providence: [640, 90, 760, 560],
  Prospect: [80, 570, 700, 430],
  Ascent: [720, 490, 750, 510],
  Parkvale: [370, 290, 700, 500],
  all: [0, 0, ...ART_SIZE]
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function cropFor(area) {
  return areaCrops[area] || areaCrops.all;
}

function routeShape(paths, crop) {
  const points = (paths || []).flat().filter(point => Array.isArray(point) && point.length >= 2);
  if (points.length < 2) return '';

  const xs = points.map(point => Number(point[0]));
  const ys = points.map(point => Number(point[1]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1), height = Math.max(maxY - minY, 1);
  const insetWidth = crop[2] * .27, insetHeight = crop[3] * .29;
  const insetX = crop[0] + crop[2] - insetWidth - crop[2] * .045;
  const insetY = crop[1] + crop[3] - insetHeight - crop[3] * .06;
  const pad = Math.min(insetWidth, insetHeight) * .2;
  const scale = Math.min((insetWidth - pad * 2) / width, (insetHeight - pad * 2 - 28) / height);
  const drawnWidth = width * scale, drawnHeight = height * scale;
  const offsetX = insetX + (insetWidth - drawnWidth) / 2 - minX * scale;
  const offsetY = insetY + 28 + (insetHeight - 28 - drawnHeight) / 2 - minY * scale;
  const lines = paths.map(path => `<polyline points="${path.map(point => `${Number(point[0])},${Number(point[1])}`).join(' ')}"/>`).join('');

  return `<g class="route-shape" aria-hidden="true"><rect x="${insetX}" y="${insetY}" width="${insetWidth}" height="${insetHeight}" rx="8"/><text x="${insetX + pad}" y="${insetY + 25}">Route shape</text><g transform="translate(${offsetX} ${offsetY}) scale(${scale})">${lines}</g></g>`;
}

/**
 * An illustrated area crop for a walk card or guide.
 * The optional outline is a separate, schematic route-shape inset; it is never
 * registered over the painted artwork.
 */
export function illustratedWalk(route = {}) {
  const crop = cropFor(route.area);
  const name = esc(route.name || 'Walking guide');
  const area = esc(route.area || 'the neighborhood');
  const shape = routeShape(route.paths, crop);
  return `<svg class="route-sketch" viewBox="${crop.join(' ')}" role="img" aria-label="${name}: illustrated area${shape ? ' and separate route shape' : ''}" preserveAspectRatio="xMidYMid slice"><title>Illustrated area in ${area}; open the guide for the sourced route for ${name}.</title><image href="${ART}" width="${ART_SIZE[0]}" height="${ART_SIZE[1]}" preserveAspectRatio="none"/>${shape}</svg>`;
}

/** A whole-atlas walk entry point. Buttons only filter the guide list. */
export function walkAtlasHero(trails = {}) {
  const routes = Array.isArray(trails.routes) ? trails.routes : [];
  const available = new Set(routes.map(route => route.area));
  const filters = [['all', 'Every area'], ['Providence', 'Providence'], ['Prospect', 'Prospect'], ['Ascent', 'Ascent']];
  return `<section class="walk-atlas-hero" aria-labelledby="walk-atlas-title"><div class="walk-art"><img src="${ART}" alt="Illustrated landscape of Sterling Ranch; it provides area context rather than walking directions."><div class="walk-art-wash" aria-hidden="true"></div><div class="walk-atlas-copy"><p class="eyebrow">WALKS &amp; PATHS</p><h2 id="walk-atlas-title">A little further, a little slower.</h2><p>Choose a guide, then use its sourced start and route details.</p></div><p class="walk-art-note">Illustrated area · open a guide for the route</p></div><div class="walk-area-filters" role="group" aria-label="Filter walking guides by area">${filters.map(([area, label]) => `<button type="button" data-walk-area="${area}" aria-pressed="${area === 'all'}"${area !== 'all' && !available.has(area) ? ' disabled' : ''}>${label}</button>`).join('')}</div></section>`;
}

