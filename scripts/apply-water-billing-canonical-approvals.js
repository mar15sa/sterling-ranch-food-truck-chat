#!/usr/bin/env node
// Rebuilds the four reviewed water-billing source records from the captured
// exact source text. Only the claim-scoped facts/actions below enter search.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const artifact = require('../data/community-water-billing-approved-sources.json');
const communityProfile = require('../data/communities/sterling-ranch.json');
const canonicalLedger = require('../data/canonical-source-ledger.json');
const { buildFactLedger, resolveFactLedger } = require('../lib/community-truth');
const { scopedApprovalsForVersion } = require('../lib/canonical-source-ledger');

const root = path.join(__dirname, '..');
const defaultIndexPath = path.join(root, 'data', 'community-index.json');

const PRIMARY_PAYMENT_FACTS = [
  {
    id: 'water-payment-334-process-register', type: 'information', value: 'register-through-utility-hawk',
    context: 'Payment Options: Please register your account through Utility Hawk ( https://srcab.utilityhawk.us )',
  },
  {
    id: 'water-payment-334-process-pay-online', type: 'information', value: 'select-pay-online-and-follow-instructions',
    context: 'Select the "Pay Online" link on the home page. Follow the instructions.',
  },
  {
    id: 'water-payment-334-method-ach', type: 'information', facet: 'method', value: 'ach-checking-or-savings',
    context: "AmCoBi's ePay service allows you to pay your bill online with an automatic withdrawal from your checking/savings account (ACH) free of charge.",
  },
  {
    id: 'water-payment-334-method-card', type: 'information', facet: 'method', value: 'debit-or-credit-card',
    context: 'You can also use a debit or credit card',
  },
  {
    id: 'water-payment-334-method-mail', type: 'information', facet: 'method', value: 'check-or-money-order-by-mail',
    context: 'USPS Mail Pay by Check or Money Order - Send a check to the billing mailing address.',
  },
  {
    id: 'water-payment-334-method-bank-bill-pay', type: 'information', facet: 'method', value: 'bank-bill-pay',
    context: 'Bank Bill Pay - please make sure to update your bank bill pay with your new AMCoBi account number and remittance address to ensure proper delivery.',
  },
  {
    id: 'water-payment-334-method-phone', type: 'information', facet: 'method', value: 'pay-by-phone',
    context: 'Pay by Phone at 1-833-SRCAB-40 or (833) 772-2240',
  },
  {
    id: 'water-payment-334-method-email-text', type: 'information', facet: 'method', value: 'pay-by-email-or-text',
    context: 'Pay by Email or Text by replying to the received message from the Payment Portal.',
  },
].map((fact) => ({
  ...fact,
  approvalClaim: 'primary-current-water-payment-page',
  decisionId: 'water-payment-primary-page',
}));

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function reviewedItem(item, page) {
  return {
    ...item,
    sourceVersion: page.contentHash,
    contentHash: page.contentHash,
    reviewStatus: 'approved',
    reviewDecisionId: item.decisionId,
    reviewedBy: artifact.reviewer.identity,
    reviewedAt: artifact.reviewer.reviewedAt,
    checkedAt: artifact.capturedAt,
  };
}

function actionAllowedByCommunityPolicy(action = {}) {
  try {
    const url = new URL(action.url);
    const allowedHosts = new Set([
      new URL(communityProfile.website).hostname.toLowerCase(),
      ...(communityProfile.allowedHosts || []).map((host) => String(host).toLowerCase()),
    ]);
    return url.protocol === 'https:' && allowedHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function buildWaterBillingSources() {
  return artifact.pages.map((page) => {
    if (hash(page.text) !== page.contentHash) throw new Error(`Captured text does not match ${page.id} hash.`);
    const approvals = scopedApprovalsForVersion(canonicalLedger, page, artifact.communityId);
    const decisionClaims = new Map(approvals.flatMap((approval) =>
      (approval.approvedClaims || []).map((claim) => [claim, approval.decisionId])));
    const facts = [
      ...(page.facts || []),
      ...(page.id === 'sterling-ranch-water-billing-payment-options-334' ? PRIMARY_PAYMENT_FACTS : []),
    ];
    for (const item of [...facts, ...(page.actions || [])]) {
      if (!page.text.includes(item.context || '')) throw new Error(`${page.id}:${item.id} is not an exact source excerpt.`);
      if (decisionClaims.get(item.approvalClaim) !== item.decisionId) {
        throw new Error(`${page.id}:${item.id} is not allowed by its exact canonical decision.`);
      }
    }
    return {
      id: page.id,
      communityId: artifact.communityId,
      title: page.title,
      sourceUrl: page.sourceUrl,
      sourceType: 'services',
      connectorType: 'civicplus-pages',
      authorityScore: 1,
      text: page.text,
      excerpt: '',
      facts: facts.map((item) => reviewedItem(item, page)),
      // A canonical claim decision does not override the community action
      // policy. Keep an action only when its stored destination is already a
      // permitted HTTPS destination; never guess an HTTP-to-HTTPS rewrite.
      actions: (page.actions || []).filter(actionAllowedByCommunityPolicy).map((item) => reviewedItem(item, page)),
      contentHash: page.contentHash,
      checkedAt: artifact.capturedAt,
      staleAfter: artifact.staleAfter,
      lifecycle: 'current',
      // The captured page body is deliberately not approved. Runtime may use
      // only the exact claim/action projection above.
      reviewStatus: 'candidate',
    };
  });
}

function applyWaterBillingCanonicalApprovals(index) {
  const additions = buildWaterBillingSources();
  const ids = new Set(additions.map((source) => source.id));
  const next = { ...index, sources: [...(index.sources || []).filter((source) => !ids.has(source.id)), ...additions] };
  next.sourceCount = next.sources.length;
  const reviewedFacts = buildFactLedger({ ...next, sources: additions }, { trusted: true, observedAt: artifact.capturedAt });
  next.factLedger = [...(index.factLedger || []).filter((fact) => !ids.has(fact.sourceId)), ...reviewedFacts];
  const resolved = resolveFactLedger(next.factLedger, { factAuthority: next.factAuthority });
  next.truthStatus = {
    ...next.truthStatus,
    generatedAt: artifact.capturedAt,
    totalFactCount: next.factLedger.length,
    approvedFactCount: next.factLedger.filter((fact) => fact.reviewStatus === 'approved').length,
    unresolvedConflictCount: resolved.unresolved.length,
    unresolvedSensitiveConflictCount: resolved.unresolvedSensitive.length,
  };
  return next;
}

if (require.main === module) {
  const baseFlag = process.argv.indexOf('--base');
  const basePath = path.resolve(baseFlag >= 0 && process.argv[baseFlag + 1] ? process.argv[baseFlag + 1] : defaultIndexPath);
  const outputFlag = process.argv.indexOf('--output');
  const outputPath = path.resolve(outputFlag >= 0 && process.argv[outputFlag + 1] ? process.argv[outputFlag + 1] : defaultIndexPath);
  const next = applyWaterBillingCanonicalApprovals(JSON.parse(fs.readFileSync(basePath, 'utf8')));
  fs.writeFileSync(outputPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, sourcesImported: artifact.pages.length, approvedFacts: next.factLedger.filter((fact) => fact.reviewStatus === 'approved').length }, null, 2));
}

module.exports = { actionAllowedByCommunityPolicy, applyWaterBillingCanonicalApprovals, buildWaterBillingSources };
