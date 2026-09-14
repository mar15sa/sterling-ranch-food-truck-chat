function approvedActionIssues(body = {}, decision) {
  if (!decision) return ['Approved action decision missing'];
  const claims = new Set(decision.approvedClaims || []);
  const matchingSources = (body.sources || []).filter(source => (decision.versions || []).some(version =>
    version.canonicalUrl === source.sourceUrl && version.contentHash === source.contentHash));
  const sourceIds = new Set(matchingSources.map(source => source.id));
  const action = (body.actions || []).find(action => action.reviewStatus === 'approved'
    && action.reviewDecisionId === decision.decisionId && claims.has(action.approvalClaim)
    && matchingSources.some(source => source.contentHash === action.sourceVersion)
    && (decision.approvedActions || []).some(approved => action.url === approved.evidence.url
      && ['label', 'url', 'context'].every(key => action.evidence?.[key] === approved.evidence[key])));
  const supported = action && (body.claims || []).some(claim => claim.verified
    && claim.approvalClaimIds?.includes(action.approvalClaim)
    && claim.evidenceSourceIds?.some(id => sourceIds.has(id)));
  return supported ? [] : ['Required exact approved action and supporting claim absent'];
}

module.exports = { approvedActionIssues };
