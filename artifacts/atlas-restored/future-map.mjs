import { futureGroups, villages } from './discovery.mjs';
import { inVillage } from './focus.mjs';

export function futureAreas(places) {
  const projects = futureGroups(places.filter(p => p.future === true));
  const areas = [...new Set(projects.map(p => p.village || 'Location to confirm'))];
  return areas.map(name => ({ name, projects: projects.filter(p => (p.village || 'Location to confirm') === name), anchor: villages.find(v => v.name === name) || null }));
}
export function futureRoot(id, places) {
  const byId = new Map(places.map(p => [p.id,p]));
  let p = byId.get(id);
  if (p?.future !== true) return null;
  const seen = new Set();
  while (byId.get(p.parentId)?.future === true && !seen.has(p.id)) { seen.add(p.id); p = byId.get(p.parentId); }
  return p;
}
// An existing parent identifies an area, never the footprint of a planned phase.
export function futureFocus(project, roots, point) {
  const parent = roots.find(p => p.id === project.parentId);
  if (parent && point(parent.id)) return { points: [point(parent.id)], label: parent.name, note: 'Approximate parent area · planned footprint unconfirmed' };
  const points = roots.filter(p => inVillage(p,project.village)).map(p => point(p.id)).filter(Boolean);
  return points.length ? { points, label: project.village, note: 'Village area · exact project site unconfirmed' } : null;
}
