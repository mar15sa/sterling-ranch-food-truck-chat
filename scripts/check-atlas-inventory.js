'use strict';

// Research-only validation/reporting. Never fetches sources or promotes facts.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const inventory = read('data/atlas/inventory.json');
const registry = read('data/atlas/sources.json');
const coverage = read('data/atlas/coverage.json');
const staged = read('public/atlas/places.json');
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--write-report')) throw new Error('Only --write-report is supported');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const index = (items, type) => {
  const result = new Map();
  for (const item of items) {
    assert(item.id && !result.has(item.id), 'Missing or duplicate ' + type + ': ' + item.id);
    result.set(item.id, item);
  }
  return result;
};
const records = index(inventory.records, 'record');
const sources = index(registry.sources, 'source');
assert(inventory.status === 'research-only' && inventory.exhaustive === false && inventory.notServedByAtlas, 'Research state must be explicit');
assert(registry.automaticChecksScheduled === false, 'No schedule is installed by this research tool');
for (const source of sources.values()) {
  assert(new URL(source.url).protocol === 'https:', 'Source must use HTTPS: ' + source.id);
  assert(Number.isInteger(source.reviewEveryDays) && source.reviewEveryDays > 0, 'Missing cadence: ' + source.id);
  if (source.lastReviewedAt) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(source.lastReviewedAt) && Number.isFinite(Date.parse(source.lastReviewedAt)), 'Invalid review date: ' + source.id);
    assert(source.lastReviewedAt <= inventory.asOf, 'Future review date: ' + source.id);
  }
}
for (const record of records.values()) {
  assert(record.publicationState === 'research-only', 'Unapproved promotion: ' + record.id);
  assert(record.sourceIds.length > 0 && record.sourceIds.every((id) => sources.has(id)), 'Missing source: ' + record.id);
  assert(record.questions?.length > 0, 'Missing detail follow-up: ' + record.id);
  assert(!record.parentId || records.has(record.parentId), 'Missing parent: ' + record.id);
  assert((record.relatedIds || []).every((id) => records.has(id)), 'Missing related record: ' + record.id);
  for (const claim of record.claims) assert(claim.text && record.sourceIds.includes(claim.sourceId), 'Unlinked claim: ' + record.id);
  if (record.locationDescription) assert(record.sourceIds.includes(record.locationDescription.sourceId), 'Unlinked location: ' + record.id);
  const seen = new Set([record.id]);
  let current = record;
  while (current.parentId) {
    assert(!seen.has(current.parentId), 'Parent cycle: ' + record.id);
    seen.add(current.parentId);
    current = records.get(current.parentId);
  }
  if (record.category === 'makers') {
    assert(record.kind === 'candidate' && record.ownerConsent === false && record.preciseLocationConsent === false, 'Maker consent must remain pending: ' + record.id);
    assert(record.locationState === 'withheld' && !record.coordinates && !record.publicAddress && !record.locationDescription, 'Residential location exposed: ' + record.id);
    assert(!/\b\d{3,6}\s+[A-Za-z]/.test(record.claims.map((c) => c.text).join(' ')), 'Possible residential address in maker claim: ' + record.id);
  }
}
for (const baseline of coverage.baselines) {
  assert(sources.has(baseline.sourceId), 'Missing baseline source');
  const labels = new Set();
  for (const entry of baseline.entries) {
    assert(entry.label && !labels.has(entry.label), 'Repeated baseline label: ' + entry.label);
    labels.add(entry.label);
    assert(records.has(entry.recordId), 'Unaccounted baseline label: ' + entry.label);
  }
}
for (const issue of coverage.unresolved) {
  assert(issue.records.every((id) => records.has(id)), 'Unknown gap record: ' + issue.id);
  assert(issue.sourceIds.every((id) => sources.has(id)), 'Unknown gap source: ' + issue.id);
}
for (const place of staged.places) assert(records.has(place.id), 'Existing staging entry lost: ' + place.id);
const counts = inventory.records.reduce((all, r) => { all[r.kind] = (all[r.kind] || 0) + 1; return all; }, {});
const due = registry.sources.filter((s) => !s.lastReviewedAt || Date.parse(s.lastReviewedAt) + s.reviewEveryDays * 86400000 <= Date.parse(inventory.asOf));
console.log(JSON.stringify({status:'passed',asOf:inventory.asOf,records:records.size,kinds:counts,sources:sources.size,existingStagingEntriesAccountedFor:staged.places.length,baselines:coverage.baselines.map((b) => ({source:b.sourceId,labels:b.entries.length})),sourcesNeedingInitialFollowUp:due.map((s) => s.id)},null,2));

if (args.includes('--write-report')) {
  const clean = (text) => String(text || '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
  const links = (ids) => ids.map((id) => '[' + sources.get(id).title + '](' + sources.get(id).url + ')').join(' · ');
  const out = [
    '# Sterling Ranch Atlas: master inventory',
    '',
    'Research reviewed September 13, 2026. Everything remains in research/staging; production launch is not approved.',
    '',
    'This inventory accounts for the named destinations in the audited lists below. It does not establish that every physical place has been found. Unnamed sites, home businesses and exact boundaries still need work.',
    '',
    '**' + counts.place + ' place/project records, ' + counts.feature + ' features inside those places, ' + counts.phase + ' future phases, ' + counts['recurring-use'] + ' recurring uses, and ' + counts.candidate + ' leads.** These are not ' + records.size + ' separate map pins. ' + sources.size + ' source references are registered.',
    '',
    'The staging page still uses its original ' + staged.places.length + '-entry catalog. This research inventory is separate, is not served by the page, and has not been promoted into Community Assistant evidence.',
    '',
    '## What is accounted for',
    '',
    '| Audited source | Labels accounted for | Scope |',
    '| --- | ---: | --- |',
    ...coverage.baselines.map((b) => '| ' + links([b.sourceId]) + ' | ' + b.entries.length + ' | ' + clean(b.scope) + ' |'),
    '',
    '## Places and projects',
    '',
    'Source-listed means a source describes the place. It does not promise that every feature is open today. Planned and incomplete projects remain visible as research entries.',
    '',
    '| Place / project | Area | Source-reported state | What we know / source |',
    '| --- | --- | --- | --- |',
    ...inventory.records.filter((r) => r.kind === 'place').map((r) => '| **' + clean(r.name) + '**' + (r.aliases.length ? ' (also ' + clean(r.aliases.join(', ')) + ')' : '') + ' | ' + clean(r.village) + ' | ' + clean(r.status) + ' | ' + clean(r.claims.map((c) => c.text).join(' ')) + ' ' + links(r.sourceIds) + ' |'),
    '',
    '## Features, future phases and recurring uses',
    '',
    'Keep these attached to their parent place. Private apartment and school amenities need clear access labels; a nearby resident is not automatically entitled to use them.',
    '',
    '| Parent | Discoverable feature / use | State | Source |',
    '| --- | --- | --- | --- |',
    ...inventory.records.filter((r) => ['feature','phase','recurring-use'].includes(r.kind)).map((r) => '| ' + clean(records.get(r.parentId).name) + ' | ' + clean(r.name) + ' | ' + clean(r.status) + ' | ' + links(r.sourceIds) + ' |'),
    '',
    '## Leads needing confirmation',
    '',
    'These are research leads, not publishable listings. Home-business addresses are omitted. The owner has not authorized outreach to these businesses.',
    '',
    '| Lead | Current evidence / uncertainty | Source |',
    '| --- | --- | --- |',
    ...inventory.records.filter((r) => r.kind === 'candidate').map((r) => '| ' + clean(r.name) + ' | ' + clean(r.claims.map((c) => c.text).join(' ') || r.questions[0]) + ' | ' + links(r.sourceIds) + ' |'),
    '',
    '## Gaps to close',
    '',
    ...coverage.unresolved.map((x) => '- **' + x.id + ':** ' + x.task),
    '',
    '## Nearby and background labels',
    '',
    ...coverage.contextDispositions.map((x) => '- **' + x.labels.join(', ') + ':** ' + x.disposition),
    '',
    '## Source conflicts and stale labels',
    '',
    ...coverage.staleOrConflictingEvidence.map((x) => '- ' + x.resolution + ' ' + links(x.sourceIds)),
    '',
    '## Maintaining this inventory',
    '',
    'See [source maintenance and useful place cards](ATLAS-SOURCE-MAINTENANCE.md) for field authority, recheck cadence and the launch holds. Each record also carries its unanswered visitor questions and source references in data/atlas/inventory.json.',
    '',
    'Rebuild this report with node scripts/check-atlas-inventory.js --write-report. Validation only: node scripts/check-atlas-inventory.js. These commands do not access the network, refresh evidence dates, publish facts, submit questions, or schedule future runs.',
    ''
  ];
  fs.writeFileSync(path.join(root, 'docs/ATLAS-INVENTORY.md'), out.join('\n'));
}
