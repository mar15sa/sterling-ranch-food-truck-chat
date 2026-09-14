const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = require('../data/community-index.json');

const categories = [
  { id: 'current-actions', title: 'Fees, payments, contacts, reservations, and booking' },
  { id: 'property-changes', title: 'DRC, property changes, landscaping, and amendments' },
  { id: 'utilities-support', title: 'Utilities, trash, water quality, and equipment support' },
  { id: 'facilities-live-services', title: 'Facilities, recreation, events, and live services' },
];

const P = 'https://sterlingranchcab.com';
const records = [];

function add(categoryId, disposition, reason, paths) {
  for (const pathname of paths) records.push({ categoryId, disposition, reason, sourceUrl: `${P}${pathname}` });
}

add('current-actions', 'answer-evidence', 'Useful current billing or payment page with exact-version claim approvals.', [
  '/332/View-and-Pay-Your-Water-Bill',
  '/333/Understanding-Your-Water-Bill',
  '/334/Water-Billing-Payment-Options',
  '/390/Monthly-Fee-Billing-Payment-Options',
]);
add('current-actions', 'safe-link', 'Useful official navigation or booking route; only its exact approved link is available to answers.', [
  '/227/Mailbox-Keys',
  '/400/Contact-Us',
  '/420/Court-Reserve',
  '/Facilities/Facility/Details/Great-Hall-3',
  '/Facilities/Facility/Details/Overlook-Clubhouse-1',
]);
add('current-actions', 'review-required', 'Useful current page, but unapproved claims remain withheld until exact claim review.', [
  '/182/Annual-Caregiver-Pass',
  '/183/Memberships',
  '/204/Billing',
  '/206/Water-Billing',
  '/257/Amenity-Rentals',
  '/269/Rent-the-Facility',
  '/309/Non-Resident-Memberships',
  '/310/Guest-Passes',
  '/311/Park-Shelters',
  '/324/Important-Contact-Information',
  '/Directory.aspx',
]);

add('property-changes', 'answer-evidence', 'Useful DRC page with exact-version approvals for limited process or contact claims.', [
  '/175/Design-Review',
  '/201/Design-Review-Documents',
]);
add('property-changes', 'safe-link', 'Useful official navigation route; page text does not independently establish a rule.', [
  '/168/Rules-Regulations',
  '/338/Homeowner-Landscape-Class',
  '/414/Approved-Landscapers-List',
]);
add('property-changes', 'review-required', 'Useful property-change page, but controlling requirements must remain claim-reviewed.', [
  '/198/Architectural-Community-Standards',
  '/202/Enforcement',
  '/237/Common-Area-Maintenance',
  '/357/Rules-and-Regulations',
  '/402/Chase-Drain-Information',
  '/415/Fire-Mitigation-Strategies',
]);

add('utilities-support', 'answer-evidence', 'Useful current service page with exact-version approvals for limited operational claims.', [
  '/247/Trash-Recycling',
  '/m/faq?cat=16',
]);
add('utilities-support', 'safe-link', 'Useful official support or report route; only the reviewed action is available to answers.', [
  '/239/Streetlights',
  '/395/Water-Reports',
]);
add('utilities-support', 'review-required', 'Useful utility or equipment-support page whose factual claims still require exact review.', [
  '/242/Internet-Service',
  '/243/Rachio-Irrigation-Controller',
  '/244/Smart-Home-Upgrades',
  '/245/STEWARD-Home-Automation-System',
  '/246/Utilities',
  '/248/Water-Sewer',
  '/385/Toubleshooting-Your-Water-Meter',
  '/386/SedimentDebris-in-Water',
  '/387/Water-Pressure',
  '/412/Leak-Forgiveness-Policy',
]);

add('facilities-live-services', 'answer-evidence', 'Useful facility page with exact-version approvals for limited seasonal hours.', [
  '/187/Pool',
]);
add('facilities-live-services', 'live-feed', 'Useful current calendar route; dated answers must come from the live connector rather than cached page text.', [
  '/calendar.aspx?CID=0&view=list',
]);
add('facilities-live-services', 'safe-link', 'Useful official facility or recreation route; it is retained primarily for navigation.', [
  '/31/Amenities',
  '/186/Fitness',
  '/188/Indoor-Facilities',
  '/258/The-Overlook-Clubhouse',
  '/260/Clubs-Groups',
  '/262/Food-Trucks',
  '/265/Programs',
  '/270/Parks-Trails',
  '/272/State-Parks-Pass',
  '/273/Trails',
  '/335/Community-Parks',
  '/376/Parks-Trails-and-Open-Spaces',
  '/417/Parks-Updates',
  '/Facilities',
  '/Facilities/FeatureOverview',
  '/Facilities/Facility/Details/Ascent-Village-Pavilion-Park-10',
  '/Facilities/Facility/Details/Overlook-Virtual-8',
  '/Facilities/Facility/Details/Pickleball-Courts-at-Burns-Park-11',
  '/Facilities/Facility/Details/Providence-Park-4',
  '/Facilities/Facility/Details/Sterling-Center-6',
]);
add('facilities-live-services', 'review-required', 'Useful recreation page, but its operating facts are not yet fully claim-reviewed.', [
  '/418/Pickleball-Courts',
]);
add('facilities-live-services', 'excluded', 'Duplicate calendar presentation; the single audited live calendar feed controls dated event answers.', [
  '/Calendar.aspx',
  '/calendar.aspx?CID=0&view=week',
  '/calendar.aspx?CID=24',
  '/calendar.aspx?CID=24&view=list',
  '/calendar.aspx?CID=24&view=week',
  '/calendar.aspx?CID=27',
  '/calendar.aspx?CID=27&view=list',
  '/calendar.aspx?CID=27&view=week',
  '/calendar.aspx?CID=28',
  '/calendar.aspx?CID=28&view=list',
  '/calendar.aspx?CID=28&view=week',
  '/calendar.aspx?CID=29',
  '/calendar.aspx?CID=29&view=list',
  '/calendar.aspx?CID=29&view=week',
  '/calendar.aspx?CID=30',
  '/calendar.aspx?CID=30&view=list',
  '/calendar.aspx?CID=30&view=week',
  '/calendar.aspx?CID=32',
  '/calendar.aspx?CID=32&view=list',
  '/calendar.aspx?CID=32&view=week',
]);

const pagesByUrl = new Map((index.pages || []).map(page => [page.canonicalUrl || page.url, page]));
const sourcesByUrl = new Map();
for (const source of index.sources || []) {
  const list = sourcesByUrl.get(source.sourceUrl) || [];
  list.push(source);
  sourcesByUrl.set(source.sourceUrl, list);
}

const outputRecords = records.map(record => {
  const page = pagesByUrl.get(record.sourceUrl);
  const sources = sourcesByUrl.get(record.sourceUrl) || [];
  if (!page && !sources.length) throw new Error(`Audited page is missing from the current source bundle: ${record.sourceUrl}`);
  const versionFingerprint = page?.contentFingerprint || sources[0]?.contentHash || '';
  return {
    ...record,
    title: page?.title || sources[0]?.title || record.sourceUrl,
    versionFingerprint,
  };
});

const duplicate = outputRecords.find((record, indexAt) => outputRecords.findIndex(item => item.sourceUrl === record.sourceUrl) !== indexAt);
if (duplicate) throw new Error(`Duplicate audit URL: ${duplicate.sourceUrl}`);

const payload = {
  schemaVersion: 1,
  communityId: 'sterling-ranch',
  decidedAt: '2026-09-13',
  decisionId: 'cab-page-usefulness-audit-four-categories-2026-09-13',
  scope: 'Page-level usefulness classification for the four owner-selected categories. A useful page does not gain blanket claim approval. Exact claim approvals and live-connector freshness still control resident answers.',
  categories,
  records: outputRecords,
};

fs.writeFileSync(path.join(root, 'data', 'community-page-dispositions.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${outputRecords.length} audited CAB page dispositions.`);
