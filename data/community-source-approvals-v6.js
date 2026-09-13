const approvals = require('./community-source-approvals-v6.json');

const decisions = new Map(approvals.decisions.map(decision => [decision.decisionId, decision]));

function reviewedFact(id, value, approvalClaim, reviewDecisionId, options = {}) {
  return {
    id,
    type: options.type || 'information',
    value,
    context: options.context || value,
    facet: options.facet,
    scopeKey: options.scopeKey,
    approvalClaim,
    reviewDecisionId,
    reviewStatus: 'approved',
    reviewedBy: 'owner',
    reviewedAt: approvals.decidedAt,
  };
}

function reviewedAction(id, approvalClaim, reviewDecisionId) {
  const decision = decisions.get(reviewDecisionId);
  const proof = (decision?.approvedActions || []).find(item => decision.approvedClaims.includes(approvalClaim));
  if (!proof) throw new Error(`${id} has no reviewed action proof on ${reviewDecisionId}.`);
  return {
    id,
    label: proof.display.label,
    url: proof.evidence.url,
    context: proof.display.label,
    actionType: proof.display.actionType,
    evidence: proof.evidence,
    approvalClaim,
    reviewDecisionId,
    reviewStatus: 'approved',
    reviewedBy: 'owner',
    reviewedAt: approvals.decidedAt,
  };
}

function reviewedSource(id, title, decisionId, text, options = {}) {
  const decision = decisions.get(decisionId);
  const version = decision.versions[0];
  return {
    id,
    communityId: approvals.communityId,
    title,
    sourceUrl: version.canonicalUrl,
    sourceType: options.sourceType || 'rules',
    connectorType: options.connectorType || 'official-pdf',
    authorityClass: options.authorityClass || options.connectorType || 'official-pdf',
    authorityScore: options.authorityScore || 1,
    text,
    excerpt: text,
    facts: options.facts || [],
    actions: options.actions || [],
    contentHash: version.contentHash,
    hashScheme: version.hashScheme,
    checkedAt: approvals.decidedAt,
    staleAfter: approvals.decidedAt,
    lifecycle: 'current',
    reviewStatus: 'candidate',
  };
}

function buildApprovedV6Sources() {
  return [
    reviewedSource(
      'approved-landscapers-directory-link',
      'Current approved landscapers directory',
      'approved-landscapers-directory-link',
      'Open the current official approved landscapers directory. The directory is navigation only and does not authorize repeating company details.',
      {
        sourceType: 'services', connectorType: 'civicplus-pages', authorityClass: 'official-page',
        actions: [reviewedAction('open-approved-landscapers-directory', 'approved-landscapers-directory-route', 'approved-landscapers-directory-link')],
      },
    ),
    reviewedSource(
      'approved-recycling-tips-visual-link',
      'Recycling tips visual',
      'recycling-tips-visual-link',
      'Open the official recycling tips visual. Current recycling facts must come from live official sources.',
      {
        sourceType: 'services', connectorType: 'civicplus-pages', authorityClass: 'official-page',
        actions: [reviewedAction('open-recycling-tips-visual', 'recycling-tips-visual-route', 'recycling-tips-visual-link')],
      },
    ),
    reviewedSource(
      'approved-providence-elements-fence-specifications',
      'Lennar Elements Providence fence specifications',
      'providence-elements-fence-specifications',
      'For Lennar Elements homes in Providence Village, the reviewed fence specification identifies a Fortress Fence Versai Assurance Residential Rackable Welded Ornamental Steel Fence, Flat Top system, 46 inches high, with a 4-foot-wide gate.',
      { facts: [
        reviewedFact('providence-elements-fence-product', 'Fortress Fence Versai Assurance Residential Rackable Welded Ornamental Steel Fence, Flat Top system', 'providence-elements-fence-product', 'providence-elements-fence-specifications', { facet: 'specification', scopeKey: 'providence-elements-fence-product', context: 'For Lennar Elements homes in Providence Village, the specified fence product is the Fortress Fence Versai Assurance Residential Rackable Welded Ornamental Steel Fence, Flat Top system.' }),
        reviewedFact('providence-elements-fence-height', '46 inches', 'providence-elements-fence-height', 'providence-elements-fence-specifications', { type: 'limit', facet: 'specification', scopeKey: 'providence-elements-fence-height', context: 'For Lennar Elements homes in Providence Village, the specified fence height is 46 inches.' }),
        reviewedFact('providence-elements-gate-width', '4 feet', 'providence-elements-gate-width', 'providence-elements-fence-specifications', { type: 'limit', facet: 'specification', scopeKey: 'providence-elements-gate-width', context: 'The reviewed Lennar Elements Providence fence drawing specifies a 4-foot-wide gate.' }),
      ] },
    ),
    reviewedSource(
      'approved-solar-panel-appearance-specifications',
      'Solar panel appearance specifications',
      'solar-panel-appearance-specifications',
      'The reviewed solar appearance specifications require panels to be roof mounted, black, and placed in a uniform gridded pattern.',
      { facts: [
        reviewedFact('solar-panels-roof-mounted', 'Solar panels must be roof mounted.', 'solar-panels-roof-mounted', 'solar-panel-appearance-specifications', { facet: 'specification', scopeKey: 'solar-panel-mounting' }),
        reviewedFact('solar-panels-black', 'Solar panels must be black.', 'solar-panels-black', 'solar-panel-appearance-specifications', { facet: 'specification', scopeKey: 'solar-panel-color' }),
        reviewedFact('solar-panels-uniform-grid', 'Solar panels must be placed in a uniform, gridded pattern.', 'solar-panels-uniform-grid', 'solar-panel-appearance-specifications', { facet: 'specification', scopeKey: 'solar-panel-layout' }),
      ] },
    ),
    reviewedSource(
      'approved-chase-drain-adopted-policy',
      'Adopted Chase Drain policy',
      'chase-drain-adopted-policy',
      'The adopted Chase Drain policy defines the installation, permits residents to request an inspection, leaves approval to CAB engineering based on each site, assigns construction and ongoing maintenance to CAB after approval, and assigns initial installation cost, temporary access, and indemnity obligations to the requesting homeowner.',
      { authorityClass: 'adopted-document', facts: [
        reviewedFact('chase-drain-definition', 'A Chase Drain collects runoff or flows from a private lot and conveys them across CAB infrastructure to a recessed gutter or storm sewer.', 'chase-drain-definition', 'chase-drain-adopted-policy', { facet: 'information', scopeKey: 'chase-drain-definition' }),
        reviewedFact('chase-drain-inspection-and-discretion', 'A homeowner may request a CAB inspection. CAB engineering decides case by case whether a Chase Drain is necessary for unusual or excessive flows and protection of CAB improvements; the policy creates no right to an installation.', 'chase-drain-inspection-and-discretion', 'chase-drain-adopted-policy', { facet: 'submission', scopeKey: 'chase-drain-inspection' }),
        reviewedFact('chase-drain-cab-construction-and-maintenance', 'If CAB engineering approves a Chase Drain, CAB contracts for and manages its design, permitting, and installation, and CAB remains responsible for maintenance and repair.', 'chase-drain-cab-construction-and-maintenance', 'chase-drain-adopted-policy', { facet: 'information', scopeKey: 'chase-drain-cab-responsibility' }),
        reviewedFact('chase-drain-homeowner-access-and-indemnity', 'Before work begins, the requesting homeowner must grant CAB and its contractor temporary construction access and execute a waiver and indemnification for claims related to the installation.', 'chase-drain-homeowner-access-and-indemnity', 'chase-drain-adopted-policy', { facet: 'restriction', scopeKey: 'chase-drain-homeowner-duty' }),
        reviewedFact('chase-drain-homeowner-initial-cost-responsibility', 'The requesting homeowner is responsible for the initial installation cost. The current amount must be verified from the live CAB page because the Board may amend it.', 'chase-drain-homeowner-initial-cost-responsibility', 'chase-drain-adopted-policy', { facet: 'fee', scopeKey: 'chase-drain-cost-responsibility' }),
      ] },
    ),
  ];
}

const approvedActionProofs = Object.fromEntries(approvals.decisions.map(decision => [decision.decisionId, decision.approvedActions || []]));

module.exports = { approvals, approvedActionProofs, buildApprovedV6Sources };
