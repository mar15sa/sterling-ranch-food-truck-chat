const { sourceHash } = require('./community-approved-revalidation');
const { canonicalUrl } = require('./canonical-source-ledger');
const { extractFacts } = require('./community-ingest');
const { normalizeFactValue } = require('./community-truth');
const { ACTION_TYPES } = require('./community-connector-adapter');
const { SOURCE_TYPES } = require('./community-contracts');

const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function normalizeReviewedClaim(claim) {
  const type = ['process', 'process-step', 'informational'].includes(claim.type)
    ? 'information' : claim.type || 'information';
  const facet = claim.facet === 'calculation-method' ? 'method'
    : ['process', 'service', 'report-scope'].includes(claim.facet) ? 'information' : claim.facet;
  if (['contact', 'phone', 'email'].includes(type) || facet === 'contact') {
    // Extract values only from the already reviewed quote, never the wider
    // page. Keep its complete context so the number retains its purpose.
    const acceptedTypes = ['phone', 'email'].includes(type) ? [type] : ['phone', 'email'];
    const seen = new Set();
    const contacts = extractFacts(claim.text).filter(fact => acceptedTypes.includes(fact.type)).filter(fact => {
      const identity = `${fact.type}:${normalizeFactValue(fact)}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
    if (contacts.length) return contacts.map(fact => ({
      ...claim,
      id: `${claim.id}-${fact.type}-${sourceHash(String(normalizeFactValue(fact))).slice(0, 10)}`,
      type: fact.type,
      facet: 'contact',
      value: fact.value,
      context: claim.text,
      supportingQuote: claim.text,
      scopeKey: `${claim.scopeKey || claim.id}-${fact.type}-${sourceHash(String(normalizeFactValue(fact))).slice(0, 10)}`,
    }));
    // A prose instruction to contact an office cannot imply a phone/email
    // value or claim contact-detail coverage when none was quoted.
    return [{ ...claim, type: 'information', facet: 'information', value: claim.text, context: claim.text, supportingQuote: claim.text }];
  }
  return [{ ...claim, type, facet, value: claim.text, context: claim.text, supportingQuote: claim.text }];
}

function normalizeReviewedAction(action) {
  if (ACTION_TYPES.has(action.actionType)) return action;
  const url = new URL(action.url);
  const download = /\/DocumentCenter\/View\/|\.(?:pdf|docx?|xlsx?|csv)(?:$|\?)/i.test(url.pathname);
  const form = /\/FormCenter\//i.test(url.pathname)
    || /\b(?:form|application|support ticket)\b/i.test(action.label);
  return { ...action, actionType: download ? 'download' : form ? 'form' : 'information' };
}

function validateReviewRecord(record) {
  if (!record.sourceUrl || !record.reason || !record.verification?.currentness || !record.verification?.completeness) {
    throw new Error(`Incomplete review: ${record.sourceUrl || 'missing URL'}`);
  }
  if (!['answer-evidence', 'safe-link', 'excluded', 'live-feed', 'blocked', 'duplicate'].includes(record.disposition)) {
    throw new Error(`Unknown review disposition: ${record.disposition}`);
  }
  if (!['answer-evidence', 'safe-link'].includes(record.disposition)) return record;
  if (!record.fullText || record.hashScheme !== 'page-text-v1' || sourceHash(record.fullText) !== record.contentHash) {
    throw new Error(`Review text/version mismatch: ${record.sourceUrl}`);
  }
  if (!Number.isFinite(Date.parse(record.checkedAt))) throw new Error(`Missing review time: ${record.sourceUrl}`);
  const claims = record.claims || [];
  if (record.disposition === 'answer-evidence' && !claims.length) throw new Error(`No answer claims: ${record.sourceUrl}`);
  if (record.disposition === 'safe-link' && claims.length) throw new Error(`Link-only review contains facts: ${record.sourceUrl}`);
  for (const claim of claims) {
    if (!claim.id || !claim.text || !claim.facet || !normalize(record.fullText).includes(normalize(claim.text))) {
      throw new Error(`Claim has no exact supporting quote: ${record.sourceUrl} ${claim.id}`);
    }
  }
  for (const action of record.actions || []) {
    if (!action.label || !action.url || !action.evidence?.label || action.evidence.url !== action.url) {
      throw new Error(`Incomplete action proof: ${record.sourceUrl}`);
    }
    if (!['https:', 'mailto:', 'tel:'].includes(new URL(action.url).protocol)) throw new Error('Unsupported action protocol');
  }
  if (record.disposition === 'safe-link' && !(record.actions || []).length) throw new Error(`Missing navigation action: ${record.sourceUrl}`);
  return record;
}

function createReviewPackage(records, { communityId, decidedAt, decisionId }) {
  const seen = new Set();
  for (const record of records) {
    validateReviewRecord(record);
    if (seen.has(record.sourceUrl)) throw new Error(`Duplicate review assignment: ${record.sourceUrl}`);
    seen.add(record.sourceUrl);
  }
  const decisions = records.filter(record => ['answer-evidence', 'safe-link'].includes(record.disposition)).map(record => {
    const id = `${decisionId}-${sourceHash(record.sourceUrl).slice(0, 12)}`;
    const facts = (record.claims || []).flatMap(normalizeReviewedClaim)
      .map(claim => ({ ...claim, id: `${id}-${slug(claim.id)}` }));
    const actions = (record.actions || []).map(normalizeReviewedAction)
      .map((action, i) => ({ ...action, id: `${id}-action-${i + 1}` }));
    return {
      decisionId: id,
      scopeKind: 'scoped-claims',
      scope: record.reason,
      approvedClaims: [...facts, ...actions].map(item => item.id),
      withheldClaims: record.withheldClaims || [],
      approvedActions: actions.map(action => ({
        evidence: action.evidence,
        display: { label: action.label, actionType: action.actionType || 'information' },
      })),
      versions: [{ canonicalUrl: record.canonicalSourceUrl || record.sourceUrl, contentHash: record.contentHash, hashScheme: record.hashScheme }],
      title: record.title,
      sourceType: SOURCE_TYPES.has(record.sourceType) ? record.sourceType : 'services',
      authorityClass: record.authorityClass || 'official-page',
      checkedAt: record.checkedAt,
      documentFingerprint: record.documentFingerprint || '',
      facts,
      actions,
      verification: record.verification,
    };
  });
  return { schemaVersion: 1, communityId, decidedAt, decisionId,
    authorization: 'Owner requested completion of necessary helpful source ingestion on September 14, 2026. Claims are limited to reviewed exact official evidence.', decisions };
}

function buildReviewedSources(packageData) {
  return packageData.decisions.map(decision => {
    const version = decision.versions[0];
    const review = { reviewDecisionId: decision.decisionId, reviewedBy: 'owner-authorized-source-review',
      reviewedAt: packageData.decidedAt, reviewStatus: 'approved', sourceVersion: version.contentHash };
    const facts = decision.facts.map(claim => ({
      ...review, id: claim.id, approvalClaim: claim.id, type: claim.type || 'information',
      value: claim.value || claim.text, context: claim.context || claim.text,
      facet: claim.facet,
      scopeKey: claim.scopeKey || claim.id,
      ...(claim.subjectKey ? { subjectKey: claim.subjectKey } : {}),
      ...(claim.applicabilityTerms?.length ? { applicabilityTerms: claim.applicabilityTerms } : {}),
      supportingQuote: claim.supportingQuote || claim.text,
    }));
    const actions = decision.actions.map(action => ({ ...action, ...review, approvalClaim: action.id,
      actionType: action.actionType || 'information', context: action.label }));
    const text = facts.map(fact => fact.context).join(' ') || actions.map(action => action.label).join(' ');
    return {
      id: `approved-${decision.decisionId}`, communityId: packageData.communityId,
      title: decision.title, sourceUrl: version.canonicalUrl, sourceType: decision.sourceType,
      connectorType: /\/DocumentCenter\//i.test(version.canonicalUrl) ? 'official-pdf' : 'civicplus-pages',
      authorityClass: decision.authorityClass, authorityScore: 1, text, excerpt: text, facts, actions,
      contentHash: version.contentHash, hashScheme: version.hashScheme,
      ...(decision.documentFingerprint ? { documentFingerprint: decision.documentFingerprint, requireExactDocumentFingerprint: true } : {}),
      checkedAt: decision.checkedAt, staleAfter: decision.checkedAt, lifecycle: 'current', reviewStatus: 'candidate',
    };
  });
}

function sourceUrlIdentity(url) {
  const parsed = new URL(url);
  const documentId = parsed.pathname.match(/^\/DocumentCenter\/View\/(\d+)(?:\/|$)/i)?.[1];
  return documentId ? `${parsed.origin}/DocumentCenter/View/${documentId}` : canonicalUrl(url);
}

module.exports = { buildReviewedSources, createReviewPackage, sourceUrlIdentity, validateReviewRecord };
