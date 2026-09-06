const crypto = require("node:crypto");
const { isDynamicSource } = require('./community-source-identity');
const {
  REVIEW_DECISIONS,
  SENSITIVE_FACETS,
  applyReviewDecisions,
  authorityReason,
  buildFactLedger,
  normalizeUrl,
  resolveFactLedger,
} = require("./community-truth");

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const MAX_RICH_TEXT = 2000;
let dataSourcePromise = null;
let schemaPromise = null;
let titlePropertyName = "Name";

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function fingerprint(index = {}) {
  return hash((index.sources || []).filter(source => !isDynamicSource(source)).map((source) => `${source.id}:${source.contentHash}`).sort().join("\n"));
}

function reviewConfig() {
  return {
    token: process.env.COMMUNITY_SOURCE_REVIEW_NOTION_TOKEN || process.env.RULES_QUESTION_NOTION_TOKEN || process.env.NOTION_API_KEY || "",
    databaseId: process.env.COMMUNITY_SOURCE_REVIEW_NOTION_DATABASE_ID || "",
    dataSourceId: process.env.COMMUNITY_SOURCE_REVIEW_NOTION_DATA_SOURCE_ID || "",
    titleProperty: process.env.COMMUNITY_SOURCE_REVIEW_NOTION_TITLE_PROPERTY || "",
  };
}

function sourceVersion(source = {}) {
  return source.contentHash || "missing-version";
}

function sourceMap(index = {}) {
  return new Map((index.sources || []).map((source) => [source.id, source]));
}

function affectedQuestions(facet = "") {
  const examples = {
    "live-status": ["Is it open right now?"],
    "facility-hours": ["What are the facility hours?"],
    "reservation-policy": ["How do I reserve it?", "How long can I reserve it?"],
    fee: ["How much does it cost?"],
    restriction: ["Is this allowed?"],
    contact: ["Who do I contact?"],
    submission: ["Where do I submit the form?"],
    "event-date": ["When is the event?"],
  };
  return examples[facet] || ["What does the CAB say about this?"];
}

function itemId(parts) {
  return hash(parts.filter(Boolean).join("|")).slice(0, 32);
}

function factReviewItem(entry, current, candidateFingerprint, releaseFingerprint, profile, conflict = null) {
  const risk = SENSITIVE_FACETS.has(entry.facet) ? "high" : "medium";
  return {
    id: itemId(["fact", entry.id, entry.sourceVersion]),
    recordType: "review-item",
    kind: conflict ? "fact-conflict" : "fact-change",
    status: "pending",
    topic: entry.subjectKey,
    risk,
    requiresReview: true,
    sensitive: risk === "high",
    conflict: Boolean(conflict),
    factId: entry.id,
    claimKey: entry.claimKey,
    facet: entry.facet,
    scopeKey: entry.scopeKey,
    currentValue: current?.displayValue || "Not currently approved",
    proposedValue: entry.displayValue,
    currentSourceUrl: current?.sourceUrl || "",
    proposedSourceUrl: entry.sourceUrl,
    sourceId: entry.sourceId,
    sourceVersion: entry.sourceVersion,
    publishedAt: entry.publishedAt || "",
    effectiveFrom: entry.effectiveFrom || "",
    effectiveTo: entry.effectiveTo || "",
    firstObservedAt: entry.firstObservedAt,
    lastObservedAt: entry.lastObservedAt,
    staleAfter: entry.staleAfter || "",
    authorityReason: authorityReason(profile, entry.facet, entry),
    relatedConflicts: conflict ? conflict.entries.map((fact) => ({ value: fact.displayValue, sourceUrl: fact.sourceUrl, sourceTitle: fact.sourceTitle })) : [],
    affectedQuestions: affectedQuestions(entry.facet),
    predictedAnswerChange: current
      ? `Resident answers may change from “${current.displayValue}” to “${entry.displayValue}”.`
      : `Resident answers may begin using “${entry.displayValue}”.`,
    supportingText: entry.supportingText,
    candidateFingerprint,
    releaseFingerprint,
    createdAt: new Date().toISOString(),
  };
}

function sourceReviewItem(kind, source, current, candidateFingerprint, releaseFingerprint) {
  const removed = kind === "source-removal";
  const sensitiveText = `${source?.title || current?.title || ""} ${source?.text || current?.text || ""}`;
  const sensitive = /\b(?:fee|price|cost|hours?|reservation|contact|phone|email|prohibit|require|must|deadline|refund|cancel)\b/i.test(sensitiveText);
  const proposed = source || {};
  const approved = current || {};
  return {
    id: itemId([kind, proposed.id || approved.id, sourceVersion(proposed.id ? proposed : approved)]),
    recordType: "review-item",
    kind,
    status: "pending",
    topic: proposed.subjectKey || approved.subjectKey || String(proposed.title || approved.title || "source").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    risk: removed || sensitive ? "high" : "medium",
    requiresReview: true,
    sensitive: removed || sensitive,
    conflict: false,
    factId: "",
    claimKey: "",
    facet: "source",
    scopeKey: "page",
    currentValue: approved.text || approved.excerpt || (removed ? "Approved page" : "Not currently approved"),
    proposedValue: removed ? "Page missing from candidate" : proposed.text || proposed.excerpt || "Updated page",
    currentSourceUrl: approved.sourceUrl || "",
    proposedSourceUrl: proposed.sourceUrl || approved.sourceUrl || "",
    sourceId: proposed.id || approved.id,
    sourceVersion: sourceVersion(proposed.id ? proposed : approved),
    publishedAt: proposed.publishedAt || approved.publishedAt || "",
    effectiveFrom: proposed.effectiveFrom || approved.effectiveFrom || "",
    effectiveTo: proposed.effectiveTo || approved.effectiveTo || "",
    firstObservedAt: proposed.checkedAt || approved.checkedAt || "",
    lastObservedAt: proposed.checkedAt || approved.checkedAt || "",
    staleAfter: proposed.staleAfter || approved.staleAfter || "",
    authorityReason: `This ${proposed.sourceType || approved.sourceType || "official"} page is classified as ${proposed.connectorType || approved.connectorType || "an official source"}.`,
    relatedConflicts: [],
    affectedQuestions: ["Any resident question that retrieves this page"],
    predictedAnswerChange: removed ? "Answers may lose this source and its facts." : "Answers may retrieve new or changed page content.",
    supportingText: proposed.text || proposed.excerpt || approved.text || approved.excerpt || "",
    candidateFingerprint,
    releaseFingerprint,
    createdAt: new Date().toISOString(),
  };
}

function buildReviewItems(trusted = {}, candidate = {}, profile = {}) {
  // Live feeds have their own accuracy checks and expiry; their routine updates
  // must not produce static fact-approval requests or invalidate decisions.
  trusted = { ...trusted, sources: (trusted.sources || []).filter(source => !isDynamicSource(source)),
    factLedger: (trusted.factLedger || []).filter(entry => !isDynamicSource(entry)) };
  candidate = { ...candidate, sources: (candidate.sources || []).filter(source => !isDynamicSource(source)),
    factLedger: (candidate.factLedger || []).filter(entry => !isDynamicSource(entry)) };
  const before = sourceMap(trusted);
  const after = sourceMap(candidate);
  const candidateFingerprint = fingerprint(candidate);
  const releaseFingerprint = fingerprint(trusted);
  const items = [];
  for (const [id, source] of after) {
    const current = before.get(id);
    if (!current) items.push(sourceReviewItem("source-addition", source, null, candidateFingerprint, releaseFingerprint));
    else if (source.contentHash !== current.contentHash) items.push(sourceReviewItem("source-change", source, current, candidateFingerprint, releaseFingerprint));
  }
  for (const [id, source] of before) {
    if (!after.has(id)) items.push(sourceReviewItem("source-removal", null, source, candidateFingerprint, releaseFingerprint));
  }
  const sourcesByUrl = new Map((candidate.sources || []).map((source) => [normalizeUrl(source.sourceUrl), source]));
  const trustedByUrl = new Map((trusted.sources || []).map((source) => [normalizeUrl(source.sourceUrl), source]));
  for (const page of candidate.pages || []) {
    if (page.lifecycle !== "retirement-pending") continue;
    const url = normalizeUrl(page.canonicalUrl || page.url);
    const proposed = sourcesByUrl.get(url) || trustedByUrl.get(url);
    if (!proposed) continue;
    const item = sourceReviewItem("source-retirement", proposed, trustedByUrl.get(url), candidateFingerprint, releaseFingerprint);
    item.proposedValue = page.retirementConfirmedAt
      ? `The official page returned ${page.lastMissingStatus || "not found"} twice at least 24 hours apart.`
      : `The official page returned ${page.lastMissingStatus || "not found"}; a second check is still required.`;
    item.predictedAnswerChange = "The trusted information remains available only through its freshness deadline. Removal requires review.";
    item.retirementConfirmedAt = page.retirementConfirmedAt || "";
    items.push(item);
  }

  const trustedLedger = trusted.factLedger || [];
  const candidateLedger = candidate.factLedger || [];
  const currentByClaim = new Map(trustedLedger.filter((entry) => entry.reviewStatus === "approved").map((entry) => [entry.claimKey, entry]));
  const resolution = resolveFactLedger(candidateLedger, profile);
  const conflictByClaim = new Map(resolution.unresolved.map((group) => [group.claimKey, group]));
  for (const entry of candidateLedger) {
    const current = currentByClaim.get(entry.claimKey);
    const changed = !current || JSON.stringify(current.normalizedValue) !== JSON.stringify(entry.normalizedValue) || current.sourceVersion !== entry.sourceVersion;
    if (entry.reviewStatus === "candidate" && (changed || conflictByClaim.has(entry.claimKey))) {
      items.push(factReviewItem(entry, current, candidateFingerprint, releaseFingerprint, profile, conflictByClaim.get(entry.claimKey)));
    }
  }
  return items.filter((item, index, all) => all.findIndex((candidateItem) => candidateItem.id === item.id) === index);
}

function decisionForItem(item = {}, decisions = []) {
  return decisions.find((decision) =>
    decision.reviewId === item.id
    && decision.sourceVersion === item.sourceVersion
    && normalizeUrl(decision.sourceUrl) === normalizeUrl(item.proposedSourceUrl || item.currentSourceUrl)
    && (!item.factId || decision.factId === item.factId)
  ) || null;
}

function reviewCoverage(items = [], decisions = []) {
  const required = items.filter((item) => item.requiresReview !== false);
  const matched = required.map((item) => ({ item, decision: decisionForItem(item, decisions) }));
  return {
    required: required.length,
    matched: matched.filter((record) => record.decision).length,
    pending: matched.filter((record) => !record.decision).map((record) => record.item),
    escalated: matched.filter((record) => record.decision?.decision === "escalate"),
  };
}

function compileReviewedCandidate(trusted = {}, candidate = {}, profile = {}, decisions = []) {
  // Rebuild review requirements from the actual source facts. An omitted or
  // inherited candidate ledger must not turn a page approval into fact approval.
  candidate = { ...candidate, factLedger: buildFactLedger({ ...candidate,
    sources: (candidate.sources || []).filter(source => !isDynamicSource(source)),
  }, { previousLedger: trusted.factLedger || [], requirePriorReview: true }) };
  const items = buildReviewItems(trusted, candidate, profile);
  const coverage = reviewCoverage(items, decisions);
  const trustedSources = sourceMap(trusted);
  const compiledSources = sourceMap(candidate);
  const approvedSourceIds = new Set();
  for (const item of items.filter((record) => record.kind.startsWith("source-"))) {
    const decision = decisionForItem(item, decisions);
    if (!decision) continue;
    const current = trustedSources.get(item.sourceId);
    const proposed = compiledSources.get(item.sourceId);
    if (decision.decision === "approve-proposed" && proposed) {
      compiledSources.set(item.sourceId, {
        ...proposed,
        reviewStatus: "approved",
        reviewedAt: decision.decidedAt,
        reviewedBy: decision.reviewer || "owner",
        reviewNote: decision.note || "",
      });
      approvedSourceIds.add(item.sourceId);
    } else if (decision.decision === "keep-current") {
      if (current) compiledSources.set(item.sourceId, current);
      else compiledSources.delete(item.sourceId);
    } else if (["exclude-page", "mark-current-superseded"].includes(decision.decision)) {
      compiledSources.delete(item.sourceId);
    }
  }
  for (const item of items.filter((record) => record.factId)) {
    const decision = decisionForItem(item, decisions);
    if (!decision || decision.decision === "approve-proposed") continue;
    const current = trustedSources.get(item.sourceId);
    if (decision.decision === "keep-current" && current) compiledSources.set(item.sourceId, current);
    else if (["keep-current", "exclude-page"].includes(decision.decision)) compiledSources.delete(item.sourceId);
  }
  const sources = [...compiledSources.values()];
  const baseLedger = buildFactLedger({ ...candidate, sources: sources.filter(source => !isDynamicSource(source)) }, {
    previousLedger: trusted.factLedger || [], requirePriorReview: true,
  });
  const factDecisionResult = applyReviewDecisions(baseLedger, decisions);
  const resolution = resolveFactLedger(factDecisionResult.ledger.filter((entry) => !["rejected", "excluded"].includes(entry.reviewStatus)), profile);
  return {
    candidate: {
      ...candidate,
      sources,
      sourceCount: sources.length,
      factLedger: factDecisionResult.ledger,
      truthStatus: {
        migrationMode: "reviewed",
        generatedAt: candidate.generatedAt,
        unresolvedConflictCount: resolution.unresolved.length,
        unresolvedSensitiveConflictCount: resolution.unresolvedSensitive.length,
        pendingSensitiveReviewCount: coverage.pending.length + coverage.escalated.length,
      },
      reviewSnapshot: decisions.filter((decision) => items.some((item) => item.id === decision.reviewId)),
    },
    items,
    coverage,
    staleDecisions: decisions.filter((decision) =>
      items.some((item) => item.sourceId && item.sourceId === decision.sourceId)
      && !items.some((item) => item.id === decision.reviewId && item.sourceVersion === decision.sourceVersion)
    ),
    resolution,
    approvedSourceIds: [...approvedSourceIds],
  };
}

function richText(value = "") {
  const text = String(value || "");
  const chunks = [];
  for (let index = 0; index < text.length && chunks.length < 100; index += MAX_RICH_TEXT) {
    chunks.push({ type: "text", text: { content: text.slice(index, index + MAX_RICH_TEXT) } });
  }
  return chunks;
}

function plainProperty(property = {}) {
  if (property.type === "title") return (property.title || []).map((item) => item.plain_text || item.text?.content || "").join("");
  if (property.type === "rich_text") return (property.rich_text || []).map((item) => item.plain_text || item.text?.content || "").join("");
  if (property.type === "select") return property.select?.name || "";
  if (property.type === "url") return property.url || "";
  if (property.type === "date") return property.date?.start || "";
  if (property.type === "checkbox") return Boolean(property.checkbox);
  return "";
}

function requiredSchema() {
  return {
    "Review ID": { rich_text: {} },
    "Record type": { select: { options: [{ name: "review-item" }, { name: "decision" }] } },
    Status: { select: { options: ["pending", "approved", "kept-current", "superseded", "excluded", "escalated"].map((name) => ({ name })) } },
    Topic: { rich_text: {} },
    Risk: { select: { options: ["low", "medium", "high"].map((name) => ({ name })) } },
    Conflict: { checkbox: {} },
    "Source URL": { url: {} },
    "Source version": { rich_text: {} },
    "Fact ID": { rich_text: {} },
    "Candidate fingerprint": { rich_text: {} },
    Decision: { select: { options: [...REVIEW_DECISIONS].map((name) => ({ name })) } },
    Reviewer: { rich_text: {} },
    Note: { rich_text: {} },
    Payload: { rich_text: {} },
    "Created at": { date: {} },
  };
}

async function notionRequest(path, options = {}, fetchImpl = globalThis.fetch) {
  const config = reviewConfig();
  if (!config.token || typeof fetchImpl !== "function") throw new Error("The source-review Notion connection is not configured.");
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchImpl(`${NOTION_API_URL}${path}`, {
        ...options,
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
          "notion-version": NOTION_VERSION,
          ...(options.headers || {}),
        },
      });
      if (response.ok) return response.status === 204 ? {} : response.json();
      const message = `Notion source review request failed: HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) throw new Error(message);
      lastError = new Error(message);
    } catch (error) {
      lastError = error;
      if (/HTTP 4\d\d/.test(error.message || "") && !/429/.test(error.message || "")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw lastError || new Error("Notion source review request failed.");
}

async function resolveDataSourceId(fetchImpl = globalThis.fetch) {
  const config = reviewConfig();
  if (config.dataSourceId) return config.dataSourceId;
  if (!config.databaseId) throw new Error("COMMUNITY_SOURCE_REVIEW_NOTION_DATABASE_ID is not configured.");
  if (!dataSourcePromise) {
    dataSourcePromise = notionRequest(`/databases/${encodeURIComponent(config.databaseId)}`, {}, fetchImpl).then((database) => {
      const sources = Array.isArray(database?.data_sources) ? database.data_sources : [];
      if (sources.length !== 1 || !sources[0]?.id) throw new Error("The source-review Notion database must contain exactly one data source, or configure its data-source ID.");
      return sources[0].id;
    }).catch((error) => { dataSourcePromise = null; throw error; });
  }
  return dataSourcePromise;
}

async function ensureSchema(dataSourceId, fetchImpl = globalThis.fetch) {
  if (!schemaPromise) {
    schemaPromise = notionRequest(`/data_sources/${encodeURIComponent(dataSourceId)}`, {}, fetchImpl).then(async (source) => {
      const existing = source?.properties || {};
      titlePropertyName = reviewConfig().titleProperty || Object.entries(existing).find(([, property]) => property.type === "title")?.[0] || "Name";
      const missing = Object.fromEntries(Object.entries(requiredSchema()).filter(([name]) => !existing[name]));
      if (Object.keys(missing).length) {
        await notionRequest(`/data_sources/${encodeURIComponent(dataSourceId)}`, { method: "PATCH", body: JSON.stringify({ properties: missing }) }, fetchImpl);
      }
    }).catch((error) => { schemaPromise = null; throw error; });
  }
  return schemaPromise;
}

function notionProperties(record = {}) {
  const title = record.recordType === "decision" ? `${record.decision}: ${record.reviewId}` : `${record.topic}: ${record.kind}`;
  return {
    [titlePropertyName]: { title: richText(title.slice(0, 500)) },
    "Review ID": { rich_text: richText(record.reviewId || record.id) },
    "Record type": { select: { name: record.recordType || "review-item" } },
    Status: { select: { name: record.status || "pending" } },
    Topic: { rich_text: richText(record.topic || "") },
    Risk: { select: { name: record.risk || "medium" } },
    Conflict: { checkbox: Boolean(record.conflict) },
    "Source URL": { url: record.proposedSourceUrl || record.sourceUrl || null },
    "Source version": { rich_text: richText(record.sourceVersion || "") },
    "Fact ID": { rich_text: richText(record.factId || "") },
    "Candidate fingerprint": { rich_text: richText(record.candidateFingerprint || "") },
    Decision: record.decision ? { select: { name: record.decision } } : { select: null },
    Reviewer: { rich_text: richText(record.reviewer || "") },
    Note: { rich_text: richText(record.note || "") },
    Payload: { rich_text: richText(JSON.stringify(record)) },
    "Created at": { date: { start: record.createdAt || record.decidedAt || new Date().toISOString() } },
  };
}

async function createReviewRecord(record, fetchImpl = globalThis.fetch) {
  const dataSourceId = await resolveDataSourceId(fetchImpl);
  await ensureSchema(dataSourceId, fetchImpl);
  return notionRequest("/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: dataSourceId }, properties: notionProperties(record) }),
  }, fetchImpl);
}

function recordFromNotion(page = {}) {
  const properties = page.properties || {};
  const payload = plainProperty(properties.Payload);
  try { return { notionPageId: page.id, ...JSON.parse(payload) }; } catch { /* return the minimal record */ }
  return {
    notionPageId: page.id,
    id: plainProperty(properties["Review ID"]),
    recordType: plainProperty(properties["Record type"]),
    status: plainProperty(properties.Status),
    topic: plainProperty(properties.Topic),
    risk: plainProperty(properties.Risk),
    conflict: plainProperty(properties.Conflict),
    sourceUrl: plainProperty(properties["Source URL"]),
    sourceVersion: plainProperty(properties["Source version"]),
    factId: plainProperty(properties["Fact ID"]),
    candidateFingerprint: plainProperty(properties["Candidate fingerprint"]),
    decision: plainProperty(properties.Decision),
    reviewer: plainProperty(properties.Reviewer),
    note: plainProperty(properties.Note),
    createdAt: plainProperty(properties["Created at"]),
  };
}

async function listReviewRecords(filters = {}, fetchImpl = globalThis.fetch) {
  const dataSourceId = await resolveDataSourceId(fetchImpl);
  await ensureSchema(dataSourceId, fetchImpl);
  const records = [];
  const seenCursors = new Set();
  let cursor = "";
  do {
    const response = await notionRequest(`/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    }, fetchImpl);
    records.push(...(response.results || []).map(recordFromNotion));
    cursor = response.has_more ? response.next_cursor : "";
    if (cursor && seenCursors.has(cursor)) throw new Error("Notion repeated a review-page cursor; review inventory is incomplete.");
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return records.filter((record) => {
    if (filters.recordType && record.recordType !== filters.recordType) return false;
    if (filters.status && record.status !== filters.status) return false;
    if (filters.topic && record.topic !== filters.topic) return false;
    if (filters.risk && record.risk !== filters.risk) return false;
    if (filters.conflict !== undefined && Boolean(record.conflict) !== Boolean(filters.conflict)) return false;
    return true;
  });
}

async function saveReviewDecision(input = {}, fetchImpl = globalThis.fetch) {
  if (!REVIEW_DECISIONS.has(input.decision)) throw new Error("Unknown source-review decision.");
  if (!input.reviewId || !input.sourceVersion || !input.sourceUrl) throw new Error("The review ID, source URL, and source version are required.");
  if (["approve-proposed", "mark-current-superseded"].includes(input.decision) && !String(input.note || "").trim()) {
    throw new Error("A reviewer explanation is required for this decision.");
  }
  const decision = {
    id: itemId(["decision", input.reviewId, input.sourceVersion, new Date().toISOString()]),
    recordType: "decision",
    reviewId: input.reviewId,
    status: input.decision === "approve-proposed" ? "approved"
      : input.decision === "keep-current" ? "kept-current"
        : input.decision === "mark-current-superseded" ? "superseded"
          : input.decision === "exclude-page" ? "excluded" : "escalated",
    decision: input.decision,
    reviewer: input.reviewer || "owner",
    note: String(input.note || "").trim(),
    factId: input.factId || "",
    sourceId: input.sourceId || "",
    sourceUrl: normalizeUrl(input.sourceUrl),
    sourceVersion: input.sourceVersion,
    candidateFingerprint: input.candidateFingerprint || "",
    decidedAt: new Date().toISOString(),
  };
  await createReviewRecord(decision, fetchImpl);
  return decision;
}

async function syncReviewItems(items = [], fetchImpl = globalThis.fetch) {
  if (!sourceReviewStatus().configured) return { configured: false, existing: 0, created: 0 };
  const existing = await listReviewRecords({ recordType: "review-item" }, fetchImpl);
  const existingIds = new Set(existing.map((record) => record.id || record.reviewId));
  const pending = items.filter((item) => !existingIds.has(item.id));
  let created = 0;
  for (let index = 0; index < pending.length; index += 3) {
    const batch = pending.slice(index, index + 3);
    await Promise.all(batch.map((item) => createReviewRecord(item, fetchImpl)));
    created += batch.length;
    if (index + 3 < pending.length) await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  return { configured: true, existing: existing.length, created };
}

function sourceReviewStatus(config = reviewConfig()) {
  return {
    configured: Boolean(config.token && (config.dataSourceId || config.databaseId)),
    storage: "notion",
  };
}

module.exports = {
  buildReviewItems,
  compileReviewedCandidate,
  createReviewRecord,
  fingerprint,
  listReviewRecords,
  notionProperties,
  recordFromNotion,
  reviewCoverage,
  reviewConfig,
  saveReviewDecision,
  sourceReviewStatus,
  syncReviewItems,
};
