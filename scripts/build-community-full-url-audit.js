#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const priorPageAudit = require('../data/community-page-dispositions.json');
const documentScope = require('../data/community-document-dispositions.json');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const indexPath = path.resolve(option('--index', path.join(root, 'data', 'community-index.json')));
const outputPath = path.resolve(option('--output', path.join(root, 'data', 'community-full-url-audit.json')));
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

const categories = priorPageAudit.categories;
const categoryIds = new Set(categories.map(category => category.id));
const priorPages = new Map(priorPageAudit.records.map(record => [record.sourceUrl, record]));
const documentCategoryById = new Map();
for (const category of documentScope.categories || []) {
  for (const documentId of category.documentIds || []) documentCategoryById.set(String(documentId), category.id);
}
const documentRecordById = new Map((documentScope.records || []).map(record => [String(record.documentId), record]));
const documentMetadataById = new Map((documentScope.documents || []).map(record => [String(record.documentId), record]));
const readiness = documentScope.answerReadiness || {};
const activeDocumentIds = new Set((readiness.activeEvidenceDocumentIds || []).map(String));
const actionDocumentIds = new Set((readiness.actionOnlyDocumentIds || []).map(String));
const heldDocumentIds = new Set((readiness.heldForReviewDocumentIds || []).map(String));
const excludedDocumentIds = new Set((readiness.excludedDocumentIds || []).map(String));

const pagesByUrl = new Map();
for (const page of index.pages || []) {
  const url = page.canonicalUrl || page.url;
  if (url && !pagesByUrl.has(url)) pagesByUrl.set(url, page);
}
const sourcesById = new Map((index.sources || []).map(source => [source.id, source]));

const documentGroups = new Map();
for (const page of index.pages || []) {
  const url = page.canonicalUrl || page.url;
  const id = url ? documentId(url) : '';
  if (!id) continue;
  const group = documentGroups.get(id) || { pages: [], sources: [], titles: new Set() };
  group.pages.push(page);
  if (page.title) group.titles.add(page.title);
  for (const sourceId of page.indexedSourceIds || []) {
    const source = sourcesById.get(sourceId);
    if (source && !group.sources.includes(source)) group.sources.push(source);
  }
  documentGroups.set(id, group);
}
for (const [id, group] of documentGroups) {
  const metadata = documentMetadataById.get(id);
  if (metadata?.title) group.titles.add(metadata.title);
  for (const source of group.sources) if (source.title) group.titles.add(source.title);
  const selectedUrl = metadata?.sourceUrl;
  group.preferredUrl = selectedUrl
    || group.pages.find(page => page.indexed && !page.duplicateOf)?.canonicalUrl
    || group.pages.find(page => page.indexed && !page.duplicateOf)?.url
    || group.pages.map(page => page.canonicalUrl || page.url).sort((a, b) => a.length - b.length)[0];
  const meaningfulTitles = [...group.titles].filter(title => !/^Official (?:document \d+|link)$/i.test(title) && !/^\/DocumentCenter\//i.test(title));
  group.displayTitle = metadata?.title || meaningfulTitles.sort((a, b) => a.length - b.length)[0] || `Official document ${id}`;
  const leadingText = group.sources.map(source => String(source.text || '').slice(0, 220)).join(' ');
  group.classificationText = [...meaningfulTitles, ...group.pages.map(page => page.canonicalUrl || page.url), leadingText].join(' ');
}

function slugTitle(url) {
  const parsed = new URL(url);
  const last = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
  return decodeURIComponent(last).replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function documentId(url) {
  return new URL(url).pathname.match(/^\/DocumentCenter\/View\/(\d+)(?:\/|$)/i)?.[1] || '';
}

function pageEvidence(page) {
  const sources = (page?.indexedSourceIds || []).map(id => sourcesById.get(id)).filter(Boolean);
  return [page?.title, ...sources.map(source => source.title), ...sources.map(source => source.text)]
    .filter(Boolean).join(' ');
}

function documentDecision(id) {
  const source = documentRecordById.get(id) || {};
  if (activeDocumentIds.has(id)) return { disposition: 'answer-evidence', reason: source.reason || 'Exact approved document claims are available to answers.' };
  if (actionDocumentIds.has(id)) return { disposition: 'safe-link', reason: source.reason || 'The exact approved document link is available as an action.' };
  if (heldDocumentIds.has(id)) return { disposition: 'review-required', reason: source.reason || 'The document is relevant but its claims remain withheld for review.' };
  if (excludedDocumentIds.has(id)) return { disposition: 'excluded', reason: source.reason || 'The document was explicitly excluded from resident answers.' };
  return null;
}

const explicitPageCategories = new Map();
function pages(categoryId, ids) {
  for (const id of ids) explicitPageCategories.set(String(id), [categoryId]);
}
pages('current-actions', [182, 183, 196, 204, 205, 206, 223, 227, 228, 231, 298, 309, 310, 318, 320, 321, 324, 332, 333, 334, 348, 390, 400]);
pages('property-changes', [168, 171, 174, 175, 192, 193, 198, 200, 201, 202, 237, 271, 338, 339, 357, 370, 402, 414, 415]);
pages('utilities-support', [230, 239, 241, 242, 243, 244, 245, 246, 247, 248, 354, 372, 385, 386, 387, 395, 412]);
pages('facilities-live-services', [31, 186, 187, 188, 238, 257, 258, 259, 260, 262, 265, 269, 270, 272, 273, 275, 276, 279, 280, 281, 283, 284, 311, 335, 368, 376, 417, 418, 419, 420, 422]);

const FAQ_CATEGORIES = {
  15: ['current-actions', 'property-changes', 'utilities-support', 'facilities-live-services'],
  16: ['current-actions', 'utilities-support'],
  18: ['utilities-support'],
  19: ['current-actions', 'property-changes'],
  20: ['property-changes'],
  21: ['current-actions', 'facilities-live-services'],
};
const FAQ_QID_CATEGORY = {
  69: FAQ_CATEGORIES[16], 78: FAQ_CATEGORIES[18], 92: FAQ_CATEGORIES[15],
  93: FAQ_CATEGORIES[20], 106: FAQ_CATEGORIES[19], 117: FAQ_CATEGORIES[21],
};

const OUT_OF_SCOPE_DOCUMENT = /(?:audited? financial|audit exemption|budget(?: amendment)? resolution|mill levy|service plan|\bcabea\b|district map|map transmittal|boundary change|election|disclosure notice|annual administrative resolution|formation of (?:subdistrict|committee)|committee resolution|board and committee meetings|annual meeting presentation|town hall|insurance|rendering|illustrative plan|address map|wildlife|coyot|bear country|mountain lion|traffic routes|charitable contribution|homeowners right task force|general disclosure|snow removal|technology accessibility plan|special districts annual report|property taxes)/i;
const CURRENT_ACTION = /(?:\bfees?\b|\brates?\b|billing|payment|pay your|delinquen|collection (?:process|lien)|assessment|membership|reservation|rental|rent the|caregiver registration|book of fees|tap and facility fee|contact|mailbox key)/i;
const PROPERTY = /(?:design review|\bdrc\b|architect|landscap|fenc|solar panel|utility shed|exterior light|patio light|controlled pet area|trash screening|roll[ -]?off container|storm door|covenant enforcement|code of rules|home improvement|fire mitigation|water wise tree lawn|rear yard establishment|chase drain)/i;
const UTILITIES = /(?:water quality|drinking water|outdoor water|water meter|potable water|sanitary sewer|water demand|recycl|pet waste station|xcel energy|trash|streetlight|internet|technology|steward|smart home|utilities parks and open space|waste connection|water bill)/i;
const FACILITIES = /(?:\bpool\b|\bfacilit(?:y|ies)\b|amenit|\bparks?\b|\btrails?\b|fitness|pickleball|\bcourts?\b|clubhouse|pavilion|recreation|\bevents?\b|\bprograms?\b|food truck)/i;
const HISTORICAL = /(?:\b20(?:1[0-9]|2[0-5])\b|2019[ -]2021|calendar year 2021)/i;
const explicitDocumentCategories = new Map([
  ['105', ['property-changes']],
  ['106', ['utilities-support', 'facilities-live-services']],
  ['107', ['property-changes']],
  ['120', ['utilities-support']],
  ['123', ['property-changes']],
  ['127', ['current-actions']],
  ['128', ['utilities-support']],
  ['1191', ['property-changes']],
  ['1281', ['property-changes']],
  ['1350', ['property-changes']],
  ['1455', ['current-actions']],
  ['1456', ['current-actions']],
  ['149', ['current-actions']],
  ['1574', ['property-changes']],
  ['1648', ['current-actions']],
  ['1792', ['property-changes']],
  ['1870', ['utilities-support']],
  ['1893', ['property-changes']],
  ['1979', ['property-changes']],
  ['1980', ['property-changes']],
  ['2352', ['facilities-live-services']],
  ['2411', ['property-changes']],
  ['2412', ['utilities-support']],
  ['2502', ['current-actions']],
  ['401', ['current-actions']],
  ['475', ['property-changes']],
  ['612', ['property-changes']],
  ['620', ['property-changes']],
  ['628', ['property-changes']],
  ['796', ['current-actions']],
  ['810', ['utilities-support']],
]);
const explicitOutOfScopeDocumentIds = new Set(['126', '153', '1163', '1293', '1566', '1985', '2285', '2401']);
const explicitHistoricalDocumentIds = new Set(['127', '1350', '142', '149', '1648', '2412', '401', '475', '796', '810']);

function unique(values) {
  return [...new Set(values)].filter(value => categoryIds.has(value));
}

function categoriesForDocument(id, text) {
  if (explicitOutOfScopeDocumentIds.has(id)) return [];
  if (explicitDocumentCategories.has(id)) return explicitDocumentCategories.get(id);
  if (OUT_OF_SCOPE_DOCUMENT.test(text)) return [];
  const result = [];
  // Fees and payment questions live in category 1 even when the underlying service is water.
  if (CURRENT_ACTION.test(text)) result.push('current-actions');
  if (PROPERTY.test(text)) result.push('property-changes');
  if (UTILITIES.test(text) && !/water bill/i.test(text)) result.push('utilities-support');
  if (FACILITIES.test(text) && !/tap and facility fee/i.test(text)) result.push('facilities-live-services');
  return unique(result);
}

function categoriesForPage(url, page, evidence) {
  const prior = priorPages.get(url);
  if (prior) return [prior.categoryId];
  const parsed = new URL(url);
  const numbered = parsed.pathname.match(/^\/(\d+)(?:\/|$)/)?.[1];
  if (numbered && explicitPageCategories.has(numbered)) return explicitPageCategories.get(numbered);
  if (/^\/calendar\.aspx$/i.test(parsed.pathname) || /^\/Calendar\.aspx$/i.test(parsed.pathname)) return ['facilities-live-services'];
  if (/^\/Facilities(?:\/|$)/i.test(parsed.pathname) || /^\/Activities$/i.test(parsed.pathname)) return ['facilities-live-services'];
  if (/^\/(?:AlertCenter|CivicAlerts)\.aspx$/i.test(parsed.pathname)) return ['facilities-live-services'];
  if (/^\/Directory\.aspx$/i.test(parsed.pathname) || /^\/m\/directory/i.test(parsed.pathname)) return ['current-actions'];
  if (/^\/BusinessDirectoryii\.aspx$/i.test(parsed.pathname)) return ['facilities-live-services'];
  if (/^\/FormCenter\/Contact-Us/i.test(parsed.pathname)) return ['current-actions'];
  if (/^\/FormCenter\/Membership-Forms/i.test(parsed.pathname)) return ['current-actions', 'facilities-live-services'];
  if (/^\/FormCenter\/Parks-Passes/i.test(parsed.pathname)) return ['facilities-live-services'];
  if (/^\/FormCenter\/Trash/i.test(parsed.pathname) || /^\/FormCenter\/Water/i.test(parsed.pathname)) return ['utilities-support'];
  const faqCategory = Number(parsed.searchParams.get('cat'));
  if (/^\/m\/faq$/i.test(parsed.pathname) && FAQ_CATEGORIES[faqCategory]) return FAQ_CATEGORIES[faqCategory];
  const qid = Number(parsed.searchParams.get('QID'));
  if (/^\/faq\.aspx$/i.test(parsed.pathname) && FAQ_QID_CATEGORY[qid]) return FAQ_QID_CATEGORY[qid];
  if (/^\/(?:m\/)?faq$/i.test(parsed.pathname) || /^\/faq\.aspx$/i.test(parsed.pathname)) {
    const result = [];
    if (CURRENT_ACTION.test(evidence)) result.push('current-actions');
    if (PROPERTY.test(evidence)) result.push('property-changes');
    if (UTILITIES.test(evidence)) result.push('utilities-support');
    if (FACILITIES.test(evidence)) result.push('facilities-live-services');
    return unique(result);
  }
  return [];
}

function defaultInScopeDecision({ url, kind, page, text }) {
  const prior = priorPages.get(url);
  if (prior) return { disposition: prior.disposition, reason: prior.reason };
  const id = documentId(url);
  if (id) {
    const selected = documentDecision(id);
    if (selected && documentMetadataById.get(id)?.sourceUrl === url) return selected;
    const group = documentGroups.get(id);
    if (group?.preferredUrl && group.preferredUrl !== url) {
      return { disposition: 'duplicate', reason: 'Alternate URL for the same audited CAB document.' };
    }
    if (explicitHistoricalDocumentIds.has(id)) {
      return { disposition: 'excluded', reason: 'Historical or superseded material is not used for current resident answers.' };
    }
  }
  if (page?.duplicateOf) return { disposition: 'duplicate', reason: 'Exact duplicate presentation of another audited CAB URL.' };
  if (/calendar\.aspx/i.test(url)) return { disposition: 'duplicate', reason: 'Alternate calendar presentation; dated event facts come from the single audited live connector.' };
  if (!page) return { disposition: 'unavailable-recheck', reason: 'The route was discovered, but this crawl did not retain a versioned content record; no claims are usable until it is rechecked.' };
  if (kind === 'document' && !explicitDocumentCategories.has(id) && HISTORICAL.test(text) && /(?:fee|rate|water quality|drinking water|recycling calendar|landscape submittal packet|application landscape professional|xcel energy town)/i.test(text)) {
    return { disposition: 'excluded', reason: 'Historical or superseded material is not used for current resident answers.' };
  }
  return { disposition: 'review-required', reason: 'Relevant to an approved category, but no new fact is usable until exact claim-level review is completed.' };
}

function auditEligible(url) {
  const page = pagesByUrl.get(url);
  const kind = /\/DocumentCenter\//i.test(new URL(url).pathname) ? 'document' : 'page';
  const id = documentId(url);
  const documentGroup = id ? documentGroups.get(id) : null;
  const selectedCategory = id ? documentCategoryById.get(id) : null;
  const evidence = pageEvidence(page);
  const text = kind === 'document'
    ? documentGroup?.classificationText || [page?.title, slugTitle(url), evidence].filter(Boolean).join(' ')
    : [page?.title, slugTitle(url), evidence].filter(Boolean).join(' ');
  const categoryIdsForUrl = selectedCategory ? [selectedCategory]
    : kind === 'document' ? categoriesForDocument(id, text)
      : categoriesForPage(url, page, evidence);
  const decision = categoryIdsForUrl.length
    ? defaultInScopeDecision({ url, kind, page, text })
    : { disposition: 'out-of-scope', reason: 'The content is outside the four owner-selected answer categories.' };
  return {
    sourceUrl: url,
    title: kind === 'document' ? documentGroup?.displayTitle || page?.title || slugTitle(url) : page?.title || slugTitle(url),
    kind,
    scopeStatus: categoryIdsForUrl.length ? 'in-scope' : 'out-of-scope',
    categoryIds: categoryIdsForUrl,
    ...decision,
    versionFingerprint: page?.contentFingerprint || page?.contentHash || '',
    indexed: page?.indexed === true,
    duplicateOf: page?.duplicateOf || '',
    approvedRole: id && documentMetadataById.get(id)?.sourceUrl === url ? documentDecision(id)?.disposition || '' : '',
  };
}

function auditTechnicalExclusion(exclusion) {
  const url = exclusion.url;
  const page = pagesByUrl.get(url);
  const kind = /\/DocumentCenter\//i.test(new URL(url).pathname) ? 'document' : 'page';
  const id = documentId(url);
  const documentGroup = id ? documentGroups.get(id) : null;
  const selectedCategory = id ? documentCategoryById.get(id) : null;
  const evidence = pageEvidence(page);
  const text = kind === 'document'
    ? documentGroup?.classificationText || [page?.title, slugTitle(url), evidence].filter(Boolean).join(' ')
    : [page?.title, slugTitle(url), evidence].filter(Boolean).join(' ');
  const categoryIdsForUrl = exclusion.reason === 'invalid-facility-route' ? [] : selectedCategory ? [selectedCategory]
    : kind === 'document' ? categoriesForDocument(id, text)
      : categoriesForPage(url, page, evidence);
  return {
    sourceUrl: url,
    title: kind === 'document' ? documentGroup?.displayTitle || page?.title || slugTitle(url) : page?.title || slugTitle(url),
    kind,
    scopeStatus: categoryIdsForUrl.length ? 'in-scope' : 'out-of-scope',
    categoryIds: categoryIdsForUrl,
    disposition: 'technical-exclusion',
    reason: `Crawler exclusion: ${exclusion.reason}.`,
    versionFingerprint: page?.contentFingerprint || page?.contentHash || '',
    indexed: false,
    duplicateOf: page?.duplicateOf || '',
    approvedRole: id && documentMetadataById.get(id)?.sourceUrl === url ? documentDecision(id)?.disposition || '' : '',
  };
}

const eligibleRecords = (index.inventory?.eligibleUrls || []).map(auditEligible);
const excludedRecords = (index.inventory?.exclusions || []).map(auditTechnicalExclusion);
const records = [...eligibleRecords, ...excludedRecords].sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
const completedReviewPath = path.join(root, 'data', 'community-source-review-completion.json');
if (fs.existsSync(completedReviewPath)) {
  const completed = JSON.parse(fs.readFileSync(completedReviewPath, 'utf8'));
  const decisions = new Map(completed.records.map(record => [record.sourceUrl, record]));
  for (const record of records) {
    const decision = decisions.get(record.sourceUrl);
    if (!decision) continue;
    Object.assign(record, { title: decision.title || record.title,
      disposition: decision.disposition, reason: decision.reason,
      reviewedAt: decision.checkedAt, approvedClaimCount: decision.approvedClaimCount,
      approvedActionCount: decision.approvedActionCount,
      approvedClaims: decision.approvedClaims || [],
      withheldClaims: decision.withheldClaims || [], verification: decision.verification,
      reviewedContentHash: decision.contentHash || '',
    });
    if (decision.disposition === 'duplicate') record.duplicateOf = decision.verification?.replacementUrl || record.duplicateOf;
  }
}
const uniqueUrls = new Set(records.map(record => record.sourceUrl));
if (uniqueUrls.size !== records.length) throw new Error('The full CAB audit contains duplicate URL records.');
if (records.length !== Number(index.inventory?.discoveredCount || 0)) {
  throw new Error(`Audit reconciliation failed: ${records.length} records for ${index.inventory?.discoveredCount || 0} discovered URLs.`);
}

const inScope = records.filter(record => record.scopeStatus === 'in-scope');
const primaryInScope = inScope.filter(record => !['duplicate', 'technical-exclusion'].includes(record.disposition));
const byDisposition = Object.fromEntries([...new Set(records.map(record => record.disposition))]
  .sort().map(disposition => [disposition, records.filter(record => record.disposition === disposition).length]));
const categoryTotals = Object.fromEntries(categories.map(category => [category.id, {
  auditedUrls: inScope.filter(record => record.categoryIds.includes(category.id)).length,
  primarySources: primaryInScope.filter(record => record.categoryIds.includes(category.id)).length,
  pages: primaryInScope.filter(record => record.kind === 'page' && record.categoryIds.includes(category.id)).length,
  documents: primaryInScope.filter(record => record.kind === 'document' && record.categoryIds.includes(category.id)).length,
  answerEvidence: inScope.filter(record => record.disposition === 'answer-evidence' && record.categoryIds.includes(category.id)).length,
  safeLink: inScope.filter(record => record.disposition === 'safe-link' && record.categoryIds.includes(category.id)).length,
  liveFeed: inScope.filter(record => record.disposition === 'live-feed' && record.categoryIds.includes(category.id)).length,
  reviewRequired: inScope.filter(record => record.disposition === 'review-required' && record.categoryIds.includes(category.id)).length,
  unavailableRecheck: inScope.filter(record => record.disposition === 'unavailable-recheck' && record.categoryIds.includes(category.id)).length,
  excluded: inScope.filter(record => record.disposition === 'excluded' && record.categoryIds.includes(category.id)).length,
  duplicates: inScope.filter(record => record.disposition === 'duplicate' && record.categoryIds.includes(category.id)).length,
  technicalExclusions: inScope.filter(record => record.disposition === 'technical-exclusion' && record.categoryIds.includes(category.id)).length,
}]));

const payload = {
  schemaVersion: 1,
  communityId: index.communityId,
  auditedAt: index.generatedAt,
  decisionId: 'cab-full-url-audit-four-categories-2026-09-13',
  scope: 'Complete URL-level triage of the CAB crawl inventory into the four owner-selected categories or out of scope. Triage never grants blanket fact approval; exact claim decisions and live connectors still control resident answers.',
  inventory: {
    discovered: Number(index.inventory?.discoveredCount || 0),
    eligible: Number(index.inventory?.eligibleCount || 0),
    indexed: Number(index.inventory?.indexedPageCount || 0),
    pending: Number(index.inventory?.pendingCount || 0),
    technicalExclusions: Number(index.inventory?.excludedCount || 0),
    crawlComplete: index.inventory?.complete === true,
    failureCount: Number(index.failureCount || 0),
    failures: index.failures || [],
  },
  totals: {
    audited: records.length,
    inScope: inScope.length,
    primaryInScope: primaryInScope.length,
    outOfScope: records.filter(record => record.scopeStatus === 'out-of-scope').length,
    pages: records.filter(record => record.kind === 'page').length,
    documents: records.filter(record => record.kind === 'document').length,
    byDisposition,
    categories: categoryTotals,
  },
  categories,
  records,
};

if (fs.existsSync(outputPath)) {
  const previous = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  if (previous.inventory?.pending === 0 && payload.inventory.pending > 0) {
    throw new Error('Refusing to replace the completed inventory with an older incomplete crawl. Apply content decisions with scripts/apply-community-review-dispositions.js.');
  }
}
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, inventory: payload.inventory, totals: payload.totals }, null, 2));
