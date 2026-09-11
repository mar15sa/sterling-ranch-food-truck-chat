const DEGRADATION_POLICIES = new Set(["retain-last-known", "withhold", "fallback"]);
const CAPABILITIES = new Set(["pages", "forms", "services", "events", "rules", "facilities", "availability", "status", "menu", "vendor-profile", "actions"]);
const FACETS = new Set(["permission", "specification", "price", "contact", "hours", "date", "status", "action", "availability", "facility", "restriction", "submission", "event-date", "menu"]);
const CONTROLLING_SOURCE_ROLES = new Set(["governing", "operational", "action"]);
const ACTION_TYPES = new Set(["information", "form", "booking", "account", "download", "list", "payment", "registration"]);

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function uniqueText(values, field) {
  if (!Array.isArray(values) || !values.length) throw new Error(`${field} must be a non-empty array.`);
  return [...new Set(values.map((value) => requiredText(value, field)))];
}

function normalizeVocabulary(vocabulary = {}) {
  if (!vocabulary || typeof vocabulary !== "object" || Array.isArray(vocabulary)) {
    throw new Error("connector.adapter.vocabulary must be an object.");
  }
  return Object.fromEntries(Object.entries(vocabulary).map(([term, aliases]) => [
    requiredText(term, "connector.adapter.vocabulary term").toLowerCase(),
    uniqueText(aliases, `connector.adapter.vocabulary.${term}`).map((alias) => alias.toLowerCase()),
  ]));
}

function normalizeLabels(labels = {}) {
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) {
    throw new Error("connector.adapter.labels must be an object.");
  }
  return Object.fromEntries(Object.entries(labels).map(([key, value]) => [
    requiredText(key, "connector.adapter.labels key"),
    requiredText(value, `connector.adapter.labels.${key}`),
  ]));
}

function parseTimestamp(value, field) {
  const timestamp = new Date(requiredText(value, field));
  if (Number.isNaN(timestamp.getTime())) throw new Error(`${field} must be a valid timestamp.`);
  return timestamp.toISOString();
}

function declaredValues(values, supported, field) {
  const normalized = uniqueText(values, field);
  for (const value of normalized) if (!supported.has(value)) throw new Error(`${field} has unsupported value: ${value}.`);
  return normalized;
}

function normalizeEndpoint(endpoint, connector, allowedHosts) {
  const id = requiredText(endpoint?.id, "connector.adapter.endpoint.id");
  const url = new URL(requiredText(endpoint?.url, `connector.adapter.endpoint ${id} url`));
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error(`Connector ${connector.id} endpoint ${id} must use an allowed official HTTPS host.`);
  }
  return { id, url: url.href, purpose: requiredText(endpoint?.purpose, `connector.adapter.endpoint ${id} purpose`) };
}

function connectorAdapterContract(profile, connector) {
  const adapter = connector?.adapter;
  if (!adapter || typeof adapter !== "object") throw new Error(`Connector ${connector?.id || "unknown"} requires an adapter contract.`);
  const allowedHosts = new Set((profile.allowedHosts || []).map((host) => String(host).toLowerCase()));
  allowedHosts.add(new URL(profile.website).hostname.toLowerCase());
  const endpoints = (adapter.endpoints || []).map((endpoint) => normalizeEndpoint(endpoint, connector, allowedHosts));
  if (!endpoints.length) throw new Error(`Connector ${connector.id} adapter requires at least one endpoint.`);
  if (new Set(endpoints.map((endpoint) => endpoint.id)).size !== endpoints.length) {
    throw new Error(`Connector ${connector.id} adapter has duplicate endpoint ids.`);
  }
  const sourceHosts = uniqueText(adapter.sourceHosts, "connector.adapter.sourceHosts").map((host) => host.toLowerCase());
  for (const host of sourceHosts) if (!allowedHosts.has(host)) throw new Error(`Connector ${connector.id} source host is not an allowed official host.`);
  for (const endpoint of endpoints) if (!sourceHosts.includes(new URL(endpoint.url).hostname.toLowerCase())) {
    throw new Error(`Connector ${connector.id} sourceHosts must declare endpoint hosts.`);
  }
  const refreshMinutes = Number(adapter.freshness?.refreshMinutes);
  const staleAfterMinutes = Number(adapter.freshness?.staleAfterMinutes);
  if (!(refreshMinutes > 0) || !(staleAfterMinutes >= refreshMinutes)) {
    throw new Error(`Connector ${connector.id} adapter freshness must have positive refreshMinutes and staleAfterMinutes.`);
  }
  if (connector.refreshMinutes !== undefined && Number(connector.refreshMinutes) !== refreshMinutes) {
    throw new Error(`Connector ${connector.id} adapter freshness must match the current connector refreshMinutes.`);
  }
  const policy = requiredText(adapter.degradation?.policy, "connector.adapter.degradation.policy");
  if (!DEGRADATION_POLICIES.has(policy)) throw new Error(`Connector ${connector.id} adapter has an unknown degradation policy.`);
  return {
    schemaVersion: 1,
    adapterId: `${requiredText(profile.communityId, "communityId")}:${requiredText(connector.id, "connector.id")}`,
    communityId: profile.communityId,
    connectorId: connector.id,
    family: requiredText(connector.type, "connector.type"),
    capabilities: declaredValues(adapter.capabilities, CAPABILITIES, "connector.adapter.capabilities"),
    facets: declaredValues(adapter.facets, FACETS, "connector.adapter.facets"),
    controllingSourceRoles: declaredValues(adapter.controllingSourceRoles, CONTROLLING_SOURCE_ROLES, "connector.adapter.controllingSourceRoles"),
    actionTypes: declaredValues(adapter.actionTypes, ACTION_TYPES, "connector.adapter.actionTypes"),
    requiresApprovedActionEvidence: adapter.requiresApprovedActionEvidence === true,
    endpoints,
    sourceHosts,
    freshness: { refreshMinutes, staleAfterMinutes },
    degradation: { policy, fallbackAdapterId: adapter.degradation.fallbackAdapterId ? String(adapter.degradation.fallbackAdapterId) : null },
    labels: normalizeLabels(adapter.labels || {}),
    vocabulary: normalizeVocabulary(adapter.vocabulary || {}),
  };
}

function createConnectorAdapters(profile) {
  const adapters = (profile?.connectors || []).map((connector) => connectorAdapterContract(profile, connector));
  if (new Set(adapters.map((adapter) => adapter.adapterId)).size !== adapters.length) {
    throw new Error("Connector adapter ids must be unique within a community.");
  }
  return adapters;
}

function normalizeDegradation(adapter, degradation = {}) {
  const state = String(degradation.state || "healthy");
  if (!new Set(["healthy", "degraded", "unavailable"]).has(state)) throw new Error("Evidence degradation state is invalid.");
  return {
    state,
    reason: degradation.reason ? String(degradation.reason) : null,
    policy: adapter.degradation.policy,
    fallbackAdapterId: adapter.degradation.fallbackAdapterId,
  };
}

function normalizeEvidenceRequest(input = {}) {
  const dateRange = input.dateRange;
  if (!dateRange) return { filters: { ...(input.filters || {}) } };
  const start = requiredText(dateRange.start, "request.dateRange.start");
  const end = requiredText(dateRange.end, "request.dateRange.end");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    throw new Error("request.dateRange must be a valid ordered ISO date range.");
  }
  return { dateRange: { start, end, ...(dateRange.label ? { label: String(dateRange.label) } : {}) }, filters: { ...(input.filters || {}) } };
}

function emitEvidenceEnvelope(adapter, input = {}) {
  if (!adapter?.adapterId || !adapter?.communityId) throw new Error("A normalized connector adapter is required.");
  const observedAt = parseTimestamp(input.observedAt || new Date().toISOString(), "observedAt");
  const allowedSourceHosts = new Set(adapter.sourceHosts || []);
  const sources = (input.sources || []).map((source, index) => {
    if (source?.communityId && source.communityId !== adapter.communityId) {
      throw new Error(`Adapter ${adapter.adapterId} cannot emit evidence for another community.`);
    }
    const localId = requiredText(source?.id || `evidence-${index + 1}`, "evidence source id");
    const sourceUrl = new URL(requiredText(source?.sourceUrl, "evidence sourceUrl"));
    if (sourceUrl.protocol !== "https:" || !allowedSourceHosts.has(sourceUrl.hostname.toLowerCase())) {
      throw new Error(`Adapter ${adapter.adapterId} emitted a source outside its declared hosts.`);
    }
    const role = requiredText(source?.controllingSourceRole || "operational", "evidence controllingSourceRole");
    if (!adapter.controllingSourceRoles.includes(role)) throw new Error(`Adapter ${adapter.adapterId} emitted an unsupported controlling source role.`);
    const checkedAt = parseTimestamp(source?.checkedAt || observedAt, "evidence checkedAt");
    const staleAfter = parseTimestamp(source?.staleAfter || new Date(new Date(checkedAt).getTime() + adapter.freshness.staleAfterMinutes * 60_000).toISOString(), "evidence staleAfter");
    if (new Date(staleAfter).getTime() < new Date(checkedAt).getTime()) throw new Error("Evidence staleAfter must not be before checkedAt.");
    return { ...source, sourceUrl: sourceUrl.href, controllingSourceRole: role, checkedAt, staleAfter, communityId: adapter.communityId, evidenceId: `${adapter.adapterId}:${localId}` };
  });
  if (new Set(sources.map((source) => source.evidenceId)).size !== sources.length) {
    throw new Error(`Adapter ${adapter.adapterId} emitted colliding evidence ids.`);
  }
  const requested = [...new Set((input.coverage?.requested || []).map((detail) => requiredText(detail, "coverage requested detail")))];
  const covered = [...new Set((input.coverage?.covered || []).map((detail) => requiredText(detail, "coverage covered detail")))];
  const missing = [...new Set((input.coverage?.missing || requested.filter((detail) => !covered.includes(detail))).map((detail) => requiredText(detail, "coverage missing detail")))];
  for (const detail of [...requested, ...covered, ...missing]) {
    if (!adapter.facets.includes(detail)) throw new Error(`Adapter ${adapter.adapterId} emitted an unsupported coverage facet.`);
  }
  if (covered.some((detail) => !requested.includes(detail)) || missing.some((detail) => !requested.includes(detail))) {
    throw new Error("Coverage covered and missing facets must be requested.");
  }
  if (covered.some((detail) => missing.includes(detail))) throw new Error("Coverage facets cannot be both covered and missing.");
  const evidenceIds = new Set(sources.map((source) => source.evidenceId));
  const claims = (input.claims || []).map((claim, index) => {
    const id = requiredText(claim?.id || `claim-${index + 1}`, "claim id");
    const facet = requiredText(claim?.facet, "claim facet");
    if (!adapter.facets.includes(facet)) throw new Error(`Adapter ${adapter.adapterId} emitted an unsupported claim facet.`);
    const controllingEvidenceId = requiredText(claim?.controllingEvidenceId, "claim controllingEvidenceId");
    if (!evidenceIds.has(controllingEvidenceId)) throw new Error(`Claim ${id} must reference emitted controlling evidence.`);
    const role = requiredText(claim?.controllingSourceRole, "claim controllingSourceRole");
    const source = sources.find((item) => item.evidenceId === controllingEvidenceId);
    if (role !== source.controllingSourceRole) throw new Error(`Claim ${id} controlling source role must match its evidence.`);
    return { id, facet, text: String(claim?.text || ""), controllingEvidenceId, controllingSourceRole: role };
  });
  const actions = (input.actions || []).map((action, index) => {
    const id = requiredText(action?.id || `action-${index + 1}`, "action id");
    const type = requiredText(action?.type, "action type");
    if (!adapter.actionTypes.includes(type)) throw new Error(`Adapter ${adapter.adapterId} emitted an unsupported action.`);
    const url = new URL(requiredText(action?.url, "action url"));
    if (url.protocol !== "https:" || !allowedSourceHosts.has(url.hostname.toLowerCase())) throw new Error(`Adapter ${adapter.adapterId} emitted an action outside its declared hosts.`);
    return { id, type, label: requiredText(action?.label, "action label"), url: url.href };
  });
  if (new Set(actions.map((action) => action.id)).size !== actions.length) throw new Error(`Adapter ${adapter.adapterId} emitted colliding action ids.`);
  return {
    schemaVersion: 1,
    communityId: adapter.communityId,
    adapterId: adapter.adapterId,
    connectorFamily: adapter.family,
    observedAt,
    request: normalizeEvidenceRequest(input.request),
    capabilities: adapter.capabilities,
    actionTypes: adapter.actionTypes,
    evidence: sources,
    claims,
    actions,
    freshness: { checkedAt: observedAt, staleAfter: new Date(new Date(observedAt).getTime() + adapter.freshness.staleAfterMinutes * 60_000).toISOString() },
    coverage: { requested, covered, missing },
    degradation: normalizeDegradation(adapter, input.degradation),
  };
}

module.exports = { ACTION_TYPES, CAPABILITIES, CONTROLLING_SOURCE_ROLES, DEGRADATION_POLICIES, FACETS, connectorAdapterContract, createConnectorAdapters, emitEvidenceEnvelope };
