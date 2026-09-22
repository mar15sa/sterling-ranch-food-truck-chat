const crypto = require('node:crypto');
const contracts = require('../config/community-critical-capabilities.json');
const { displayedVoiceIssues } = require('./resident-writing-contract');
const VERSION = 'critical-capabilities-v1';
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SAMPLES = 200;

function operatingContract(communityId) { return contracts.communities[communityId] || null; }
function displayedAnswerDigest(answer = {}) {
  return crypto.createHash('sha256').update(JSON.stringify([
    answer.answer || '', answer.directAnswer || '', answer.keyDetails || [], answer.nextStep || '',
  ])).digest('hex');
}
function temporaryDisableIssues(records = [], now = Date.now()) {
  if (!Array.isArray(records)) return ['temporary-disable-record-invalid'];
  return records.flatMap(record => {
    const issues = [`temporarily-disabled:${String(record.capability || 'unknown').slice(0, 60)}`];
    const created = Date.parse(record.createdAt), expiry = Date.parse(record.expiresAt);
    if (record.capability !== 'resident-writer' || !record.reason || !record.owner || !record.reviewUrl
      || !Number.isFinite(created) || !Number.isFinite(expiry) || created > now
      || expiry <= created || expiry - created > 24 * 60 * 60 * 1000) issues.push('temporary-disable-record-invalid');
    if (!Number.isFinite(expiry) || expiry <= now) issues.push('temporary-disable-expired');
    return issues;
  });
}
function configurationIssues({ contract, flow, writer, refresh, liveMonitoring, now = Date.now() }) {
  if (!contract) return ['operating-contract-missing'];
  const issues = temporaryDisableIssues(contract.temporaryDisables, now);
  if (!contract.approvedAnswerFlows?.includes(flow)) issues.push('answer-flow-differs-from-approved-contract');
  if (contract.writerRequired && writer?.enabled !== true) issues.push('resident-writer-disabled');
  if (contract.writerRequired && writer?.stage !== contract.writerStage) issues.push('resident-writer-stage-changed');
  if (contract.sourceRefreshRequired && (refresh?.rules !== true || refresh?.community !== true)) issues.push('source-refresh-disabled');
  for (const name of contract.requiredLiveMonitors || []) {
    const state = liveMonitoring?.[name];
    if (!state || state.status !== 'passed' || state.stale === true || state.scheduled !== true) issues.push(`live-monitor-${name}-${state?.status || 'missing'}`);
  }
  return [...new Set(issues)];
}
function sourceIds(source = {}) { return [source.id, source.nodeId, source.sourceUrl].filter(Boolean).map(String); }
function configuredActionBinding(action, sources, profile) {
  // Adapter-owned actions are only valid alongside evidence from that adapter.
  return (profile?.connectors || []).some(connector => {
    const prefix = `${profile.communityId}:${connector.id}:`;
    if (!sources.some(source => sourceIds(source).some(id => id.startsWith(prefix)))) return false;
    const settings = connector.adapter || {};
    if ((settings.wasteSchedule?.actionLinks || []).some(bound => bound.url === action.url)) return true;
    const handoff = settings.foodTruck?.fullAnswerPath;
    if (!handoff || !String(action.url).startsWith('/') || String(action.url).startsWith('//')) return false;
    const url = new URL(action.url, 'https://local.invalid');
    return url.origin === 'https://local.invalid' && url.pathname === handoff && !url.hash
      && [...url.searchParams].every(([key, value]) => key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value))
      && url.searchParams.getAll('date').length <= 1;
  });
}
function answerCapabilityIssues(answer = {}, { writerRequired = true, safety = false, profile } = {}) {
  const issues = [];
  const assessment = answer._requestContract?.assessment;
  const writing = answer.residentWriting;
  const sources = answer.sources || [], claims = answer.claims || [], actions = answer.actions || [];
  if (safety) {
    if (answer.answerStatus !== 'safety-rejected' || sources.length || claims.length || actions.length
      || writing?.attempted === true) issues.push('input-safety-boundary-failed');
    return issues;
  }
  if (!assessment || !Array.isArray(assessment.needs) || !assessment.needs.length
    || assessment.needs.length !== answer._requestContract?.needs?.length) issues.push('final-need-audit-missing');
  const complete = assessment?.outcome === 'complete';
  const boundary = ['out-of-scope', 'safety-rejected'].includes(answer.answerStatus);
  if (boundary) return writing?.attempted === true ? ['writer-ran-on-boundary'] : [];
  if (complete && (!Array.isArray(assessment.needs) || assessment.needs.some(need => need.status !== 'supported' || need.missingDetails?.length))) issues.push('complete-answer-has-unmet-needs');
  if (!complete && !boundary && answer.confidence?.canAnswer === true) issues.push('incomplete-answer-marked-confirmed');
  if (complete && answer.confidence?.canAnswer !== true) issues.push('complete-answer-confirmation-missing');
  const ids = new Set(sources.flatMap(sourceIds));
  if (complete && (!sources.length || !claims.length)) issues.push('complete-answer-proof-missing');
  if (claims.some(claim => claim.verified !== true || !claim.evidenceSourceIds?.length
    || claim.evidenceSourceIds.some(id => !ids.has(String(id))))) issues.push('claim-proof-missing-or-detached');
  if (sources.some(source => source.withheldByFreshness || source.stale === true
    || ['pending', 'rejected', 'superseded'].includes(source.reviewStatus))) issues.push('ineligible-source-presented');
  for (const action of actions) {
    const configured = configuredActionBinding(action, sources, profile);
    let url;
    try { url = new URL(action.url, configured ? 'https://local.invalid' : undefined); } catch { issues.push('unsafe-action-url'); continue; }
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) || url.username || url.password) issues.push('unsafe-action-url');
    if (!configured && !sources.some(source => source.sourceUrl === action.url
      || (source.actions || []).some(bound => bound.url === action.url))) issues.push('action-source-binding-missing');
  }
  if (!boundary && writing?.voiceChecked !== true) issues.push('final-voice-check-missing');
  if (writing?.voiceIssues?.length) issues.push('final-voice-check-failed');
  if (displayedVoiceIssues(answer).length) issues.push('delivered-answer-voice-failed');
  if (writerRequired && complete && writing?.attempted !== true) issues.push('eligible-answer-skipped-writer');
  if (!complete && writing?.attempted === true) issues.push('writer-ran-on-incomplete-evidence');
  if (writing?.accepted) {
    if (!writing.attempted || writing.usedTextDigest !== displayedAnswerDigest(answer)) issues.push('accepted-writing-not-delivered');
    const receipt = answer.aiComposition?.validation;
    if (receipt?.version !== VERSION || receipt.textDigest !== displayedAnswerDigest(answer)
      || !['meaning', 'coverage', 'sources', 'voice'].every(key => receipt[key] === true)) issues.push('accepted-writing-validation-missing');
  }
  return [...new Set(issues)];
}
function createCapabilityTelemetry({ now = Date.now } = {}) {
  const samples = [];
  function record(answer, { isTest = false, writerRequired = true, profile } = {}) {
    const assessment = answer._requestContract?.assessment;
    const writer = answer.residentWriting || {};
    const safety = answer.answerStatus === 'safety-rejected';
    const sample = { at: now(), isTest, eligible: assessment?.outcome === 'complete',
      attempted: writer.attempted === true, accepted: writer.accepted === true,
      providerCalled: writer.providerCalled === true, cacheHit: writer.cacheHit === true,
      reason: writer.fallbackReason || writer.skipReason || '',
      issues: answerCapabilityIssues(answer, { writerRequired, safety, profile }) };
    samples.push(sample);
    while (samples.length > MAX_SAMPLES) samples.shift();
    return { ...sample, at: new Date(sample.at).toISOString() };
  }
  function snapshot() {
    const recent = samples.filter(sample => now() - sample.at <= WINDOW_MS);
    const eligible = recent.filter(sample => sample.eligible);
    const accepted = eligible.filter(sample => sample.accepted);
    const issueCounts = {}, fallbackReasons = {};
    for (const sample of recent) {
      for (const issue of sample.issues) issueCounts[issue] = (issueCounts[issue] || 0) + 1;
      if (sample.reason) fallbackReasons[sample.reason] = (fallbackReasons[sample.reason] || 0) + 1;
    }
    if (eligible.length >= 10 && accepted.length === 0) issueCounts['writer-no-accepted-output-in-ten-eligible-answers'] = eligible.length;
    return { windowMs: WINDOW_MS, sampleLimit: MAX_SAMPLES, sampleCount: recent.length,
      observation: recent.length ? 'observed' : 'no-recent-traffic', testCount: recent.filter(s => s.isTest).length,
      eligible: eligible.length, attempted: eligible.filter(s => s.attempted).length, accepted: accepted.length,
      providerCalls: recent.filter(s => s.providerCalled).length, cacheHits: recent.filter(s => s.cacheHit).length,
      lastObservedAt: recent.length ? new Date(recent.at(-1).at).toISOString() : null,
      fallbackReasons, issueCounts };
  }
  return { record, snapshot };
}
function criticalCapabilityStatus({ communityId, flow, writer, refresh, liveMonitoring, telemetry, now = Date.now() }) {
  const contract = operatingContract(communityId);
  const issues = configurationIssues({ contract, flow, writer, refresh, liveMonitoring, now });
  const observations = telemetry || { observation: 'no-recent-traffic', issueCounts: {} };
  issues.push(...Object.keys(observations.issueCounts || {}));
  return { version: VERSION, status: issues.length ? 'degraded' : 'configured',
    checkedAt: new Date(now).toISOString(), expected: contract ? {
      answerFlows: contract.approvedAnswerFlows, writerRequired: contract.writerRequired,
      writerStage: contract.writerStage, sourceRefreshRequired: contract.sourceRefreshRequired,
      liveMonitors: contract.requiredLiveMonitors, temporaryDisables: contract.temporaryDisables,
    } : null, issues: [...new Set(issues)], observations };
}
module.exports = { VERSION, operatingContract, displayedAnswerDigest, temporaryDisableIssues,
  configurationIssues, answerCapabilityIssues, createCapabilityTelemetry, criticalCapabilityStatus };
