const crypto = require("node:crypto");
const { contactKey, directoryContactSubjects } = require('./community-directory-scopes');

const REQUIRED_AUTHORITY_FACETS = [
  "live-status",
  "facility-hours",
  "reservation-policy",
  "fee",
  "restriction",
  "contact",
  "submission",
  "event-date",
];

const SENSITIVE_FACETS = new Set(REQUIRED_AUTHORITY_FACETS);
const APPROVED_REVIEW_STATUSES = new Set(["approved", "kept-current"]);
const ANSWERABLE_LIFECYCLES = new Set(["current"]);
const REVIEW_DECISIONS = new Set([
  "approve-proposed",
  "keep-current",
  "mark-current-superseded",
  "exclude-page",
  "escalate",
]);

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "unknown";
}

function dateValue(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUrl(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    url.searchParams.sort();
    return url.href;
  } catch {
    return String(value || "").trim();
  }
}

function normalizeFactValue(fact = {}) {
  if (fact.type === 'money') {
    const amount = String(fact.value || '').match(/^\$?\s*(\d[\d,]*(?:\.\d+)?)/);
    if (amount) return Number(amount[1].replace(/,/g, ''));
  }
  // Ingested facts carry normalizedValue too. Contact formatting must still
  // normalize before that generic shortcut, otherwise identical phone numbers
  // with different punctuation appear to contradict one another.
  if (fact.type === "phone") return String(fact.value || fact.normalizedValue || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (fact.normalizedValue !== undefined && fact.normalizedValue !== null && fact.normalizedValue !== "") {
    return typeof fact.normalizedValue === "number"
      ? fact.normalizedValue
      : String(fact.normalizedValue).trim().toLowerCase();
  }
  const value = String(fact.value || "").trim();
  if (fact.type === "link") return normalizeUrl(value);
  if (fact.type === "phone") return value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (fact.type === "email") return value.toLowerCase();
  if (["money", "limit"].includes(fact.type)) {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(numeric)) return numeric;
  }
  return value.toLowerCase().replace(/\s+/g, " ");
}

function inferSubjectKey(source = {}, fact = {}) {
  if (fact.subjectKey) return slug(fact.subjectKey);
  if (source.subjectKey) return slug(source.subjectKey);
  const title = String(source.title || "")
    .replace(/\b(?:official|information|guidelines?|details?|page|current)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (title) return slug(title);
  try {
    const parts = new URL(source.sourceUrl).pathname.split("/").filter(Boolean);
    return slug(parts.at(-1) || parts.at(-2) || source.id);
  } catch {
    return slug(source.id);
  }
}

function inferScopeKey(fact = {}, source = {}) {
  if (fact.scopeKey) return slug(fact.scopeKey);
  if (fact.type === 'date') {
    const context = String(fact.context || '');
    const date = '(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2}(?:,\\s+20\\d{2})?';
    const ranges = [...context.matchAll(new RegExp(`\\bfrom\\s+(${date})\\s+(?:to|through|until)\\s+(${date})`, 'gi'))];
    const value = String(fact.value || '').trim().toLowerCase();
    if (ranges.length === 1) {
      const range = ranges[0];
      const start = range[1].toLowerCase() === value;
      const end = range[2].toLowerCase() === value;
      // Endpoints describe different claims. Remove both dates from the
      // identity so a changed starting or ending date still conflicts.
      if (start !== end) {
        const purpose = context.slice(0, range.index) + ' date range ' + context.slice(range.index + range[0].length);
        return `range-${start ? 'start' : 'end'}-${slug(purpose)}`;
      }
    }
  }
  if (fact.type === "link") {
    const context = String(fact.context || "");
    const suffix = `: ${fact.value || ""}`;
    const label = fact.actionLabel || (fact.value && context.endsWith(suffix) ? context.slice(0, -suffix.length) : "");
    // Scope an action by its label, never its target URL: a changed target for
    // the same action must still conflict, while account setup can coexist
    // with a reservation action on the same page.
    if (label) return `action-${slug(label)}`;
  }
  if (fact.type === "time") {
    const context = String(fact.context || "").toLowerCase();
    const value = String(fact.value || "").toLowerCase();
    const position = value ? context.indexOf(value) : -1;
    // Use a labeled clause only when this occurrence is unambiguous. A page
    // can list weekday and weekend hours in the same sentence; those are
    // separate claims, while two different weekday openings still conflict.
    if (position >= 0 && context.indexOf(value, position + value.length) < 0) {
      const prefix = context.slice(0, position);
      const dayLabels = [...prefix.matchAll(/\b(?:mon(?:day)?\s*(?:[-–]|to)\s*fri(?:day)?|weekdays?|weekends?|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s*(?:&|and)\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))?|daily)\b/g)];
      const label = dayLabels.at(-1);
      const day = label && (/weekday|fri/.test(label[0]) && /weekday|mon/.test(label[0]) ? "weekday" : /weekend/.test(label[0]) ? "weekend" : slug(label[0].replace(/\band\b/g, " ")));
      const suffix = context.slice(position + value.length);
      const closing = /\d(?:\s*[ap]\.?m\.?)?\s*[-–]\s*$/.test(prefix);
      const opening = /^\s*[-–]\s*(?:\d|dusk)/.test(suffix);
      if (day && (opening || closing)) {
        const openPlay = /open play/.test(prefix.slice(0, label.index)) ? "open-play-" : "";
        // Multiple open-play windows use distinct morning/evening endpoints.
        const period = openPlay ? (/a\.?m/.test(value) ? "morning-" : "evening-") : "";
        return `${openPlay}${day}-${period}${closing ? "closing" : "opening"}`;
      }
    }
  }
  const text = `${fact.context || ""} ${source.title || ""}`.toLowerCase();
  const scopes = [];
  if (fact.type === 'phone') {
    const context = String(fact.context || '').toLowerCase();
    const value = String(fact.value || '').toLowerCase();
    const position = value ? context.indexOf(value) : -1;
    if (position >= 0 && context.indexOf(value, position + value.length) < 0
      && /\b(?<!non[- ])emergency(?:\s+(?:phone|line|contact))?\s*:\s*\(?$/.test(context.slice(0, position))) {
      scopes.push('emergency');
    }
  }
  if (fact.type === 'email') {
    const context = String(fact.context || '').toLowerCase();
    const value = String(fact.value || '').toLowerCase();
    const position = value ? context.indexOf(value) : -1;
    if (position >= 0 && context.indexOf(value, position + value.length) < 0) {
      const prefix = context.slice(0, position);
      // An explicit instruction identifies the contact's purpose. Merely
      // mentioning inspections elsewhere in a paragraph does not do so.
      if (/\bto schedule an inspection\b[^.!?]*\bcontact\s*$/.test(prefix)) {
        scopes.push('inspection-scheduling');
      }
    }
  }
  if (fact.type === 'money') {
    let unit = String(fact.unit || '').trim();
    const context = String(fact.context || '');
    const value = String(fact.value || '');
    const position = value ? context.indexOf(value) : -1;
    if (position >= 0 && context.indexOf(value, position + value.length) < 0) {
      const tier = context.slice(0, position).match(/\btier\s+(\d+)\b[^.!?]{0,160}$/i);
      if (tier) scopes.push(`tier-${tier[1]}`);
    }
    if (!unit && position >= 0 && context.indexOf(value, position + value.length) < 0) {
      unit = context.slice(position + value.length).match(/^\s*(?:\/|per\s+)(court|person|player|hour|day|month|event)\b/i)?.[1] || '';
    }
    if (unit) scopes.push(`per-${slug(unit)}`);
  }
  if (/\b(?:mon(?:day)?\s*[-–]\s*fri(?:day)?|weekdays?)\b/.test(text)) scopes.push("weekday");
  if (/\b(?:sat(?:urday)?\s*[-–]\s*sun(?:day)?|weekends?)\b/.test(text)) scopes.push("weekend");
  if (/\bopen play\b/.test(text)) scopes.push("open-play");
  if (/\b(?:reservation|reserve|booking)\b/.test(text)) scopes.push("reservation");
  if (/\bnon[- ]?residents?\b/.test(text)) scopes.push("non-resident");
  else if (/\bresidents?\b/.test(text)) scopes.push("resident");
  if (/\bdeadline\b|\bdue\b/.test(text)) scopes.push("deadline");
  if (fact.type === "phone") scopes.push("phone");
  else if (fact.type === "email") scopes.push("email");
  else {
    if (/\bphone\b|\bcall\b/.test(text)) scopes.push("phone");
    if (/\bemail\b/.test(text)) scopes.push("email");
  }
  if (scopes.length) return [...new Set(scopes)].sort().join("-");
  return slug(fact.factKey || fact.id || fact.type);
}

function inferFacet(fact = {}, source = {}) {
  if (fact.facet) return slug(fact.facet);
  const text = `${fact.context || ""} ${source.title || ""}`.toLowerCase();
  if (source.sourceType === "status" || /\b(?:open|closed|capacity|status)\b/.test(text) && source.connectorType === "live-status") return "live-status";
  if (fact.type === "money") return "fee";
  if (["phone", "email"].includes(fact.type)) return "contact";
  if (fact.type === "date" && source.sourceType === "events") return "event-date";
  if (fact.type === "date" && /\b(?:event|meeting|class|program|calendar)\b/.test(text)) return "event-date";
  if (fact.type === "time" && /\b(?:reservation|reserve|booking)\b/.test(text)) return "reservation-policy";
  if (fact.type === "time" && /\b(?:hours?|open|close|dusk|weekdays?|weekends?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(text)) return "facility-hours";
  if (fact.type === "link" && /\b(?:submit|application|form|apply)\b/.test(text)) return "submission";
  if (fact.type === "link" && /\b(?:reservation|reserve|book|register)\b/.test(text)) return "reservation-policy";
  if (fact.type === "limit" && /\b(?:reservation|reserve|booking)\b/.test(text)) return "reservation-policy";
  if (fact.type === "limit" || /\b(?:prohibit|restriction|must|may not|required|maximum|minimum)\b/.test(text)) return "restriction";
  if (fact.type === "schedule") return source.sourceType === "events" ? "event-date" : "facility-hours";
  return slug(fact.type || "information");
}

function authorityOrder(profile = {}, facet = "") {
  return profile.factAuthority?.[facet] || [];
}

function factAuthorityRank(profile = {}, facet = "", source = {}) {
  const order = authorityOrder(profile, facet);
  const candidates = [source.authorityClass, source.connectorType, source.sourceType].filter(Boolean);
  const positions = candidates.map((candidate) => order.indexOf(candidate)).filter((position) => position >= 0);
  return positions.length ? Math.min(...positions) : Number.MAX_SAFE_INTEGER;
}

function authorityReason(profile = {}, facet = "", source = {}) {
  const rank = factAuthorityRank(profile, facet, source);
  if (!Number.isFinite(rank) || rank === Number.MAX_SAFE_INTEGER) return `No ${facet} authority rule matches this source.`;
  const authority = authorityOrder(profile, facet)[rank];
  return `${authority} is ranked ${rank + 1} for ${facet}.`;
}

function lifecycleFor(entry = {}, now = Date.now()) {
  if (entry.supersededBy) return "superseded";
  if (entry.retiredAt) return "retired";
  const starts = dateValue(entry.effectiveFrom || entry.effectiveDate);
  const ends = dateValue(entry.effectiveTo);
  if (starts && starts > now) return "future";
  if (ends && ends < now) return "retired";
  if (entry.lifecycle && !["candidate", "current"].includes(entry.lifecycle)) return entry.lifecycle;
  if (entry.reviewStatus === "candidate" && SENSITIVE_FACETS.has(entry.facet) && !starts) return "uncertain";
  return "current";
}

function buildFactLedger(index = {}, options = {}) {
  const trusted = options.trusted === true;
  const trustedVersions = options.trustedVersions instanceof Set ? options.trustedVersions : new Set();
  const previous = new Map((options.previousLedger || index.factLedger || []).map((entry) => [entry.id, entry]));
  const observedAt = index.generatedAt || options.observedAt || new Date().toISOString();
  const ledger = [];
  const directorySubjects = directoryContactSubjects(index.sources || []);
  for (const source of index.sources || []) {
    for (const fact of source.facts || []) {
      const company = ['phone', 'email'].includes(fact.type)
        ? directorySubjects.get(source.sourceUrl)?.get(contactKey(fact.type, fact.value)) : null;
      const subjectKey = inferSubjectKey(source, !fact.subjectKey && company ? { ...fact, subjectKey: `directory-${company}` } : fact);
      const facet = inferFacet(fact, source);
      const scopeKey = inferScopeKey(fact, source);
      const normalizedValue = normalizeFactValue(fact);
      const sourceUrl = normalizeUrl(fact.sourceUrl || source.sourceUrl);
      const sourceVersion = fact.contentHash || source.contentHash;
      const id = hash(`${index.communityId || source.communityId}|${subjectKey}|${facet}|${scopeKey}|${sourceUrl}|${sourceVersion}|${JSON.stringify(normalizedValue)}`).slice(0, 32);
      const prior = previous.get(id);
      const versionWasTrusted = trustedVersions.has(`${source.id}:${sourceVersion}`);
      const reviewStatus = prior?.reviewStatus || fact.reviewStatus || source.reviewStatus || (trusted || versionWasTrusted || source.reviewedAt ? "approved" : "candidate");
      const entry = {
        id,
        communityId: index.communityId || source.communityId,
        subjectKey,
        facet,
        scopeKey,
        factType: fact.type,
        displayValue: String(fact.value || ""),
        normalizedValue,
        unit: fact.unit || "",
        currency: fact.currency || "",
        supportingText: fact.context || "",
        sourceId: source.id,
        sourceUrl,
        sourceTitle: source.title,
        sourceType: source.sourceType,
        connectorType: source.connectorType,
        authorityClass: source.authorityClass || source.connectorType,
        sourceVersion,
        firstObservedAt: prior?.firstObservedAt || fact.firstObservedAt || fact.checkedAt || source.checkedAt || observedAt,
        lastObservedAt: fact.checkedAt || source.checkedAt || observedAt,
        publishedAt: fact.publishedAt || source.publishedAt || "",
        effectiveFrom: fact.effectiveFrom || fact.effectiveDate || source.effectiveFrom || source.effectiveDate || "",
        effectiveTo: fact.effectiveTo || source.effectiveTo || "",
        supersededBy: fact.supersededBy || source.supersededBy || "",
        retiredAt: fact.retiredAt || source.retiredAt || "",
        staleAfter: source.staleAfter || "",
        reviewStatus,
        reviewedAt: prior?.reviewedAt || fact.reviewedAt || source.reviewedAt || "",
        reviewedBy: prior?.reviewedBy || fact.reviewedBy || source.reviewedBy || "",
        reviewNote: prior?.reviewNote || fact.reviewNote || source.reviewNote || "",
      };
      entry.lifecycle = lifecycleFor(entry, options.now);
      entry.claimKey = `${entry.communityId}:${subjectKey}:${facet}:${scopeKey}`;
      ledger.push(entry);
    }
  }
  return ledger;
}

function periodsOverlap(left = {}, right = {}) {
  const leftStart = dateValue(left.effectiveFrom) ?? Number.NEGATIVE_INFINITY;
  const rightStart = dateValue(right.effectiveFrom) ?? Number.NEGATIVE_INFINITY;
  const leftEnd = dateValue(left.effectiveTo) ?? Number.POSITIVE_INFINITY;
  const rightEnd = dateValue(right.effectiveTo) ?? Number.POSITIVE_INFINITY;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function resolutionForGroup(entries = [], profile = {}) {
  const values = new Map();
  for (const entry of entries) {
    const key = JSON.stringify(entry.normalizedValue);
    const group = values.get(key) || [];
    group.push(entry);
    values.set(key, group);
  }
  if (values.size <= 1) return { classification: "duplicate", winner: entries[0] || null };
  const current = entries.filter((entry) => ["current", "uncertain"].includes(entry.lifecycle));
  if (current.length <= 1) return { classification: "temporal-succession", winner: current[0] || null };
  if (current.every((entry, index) => current.slice(index + 1).every((other) => !periodsOverlap(entry, other)))) {
    return { classification: "temporal-succession", winner: current.sort((a, b) => (dateValue(b.effectiveFrom) || 0) - (dateValue(a.effectiveFrom) || 0))[0] };
  }
  const unsuperseded = current.filter((entry) => !entry.supersededBy);
  if (unsuperseded.length === 1) return { classification: "explicit-replacement", winner: unsuperseded[0] };
  const ranked = unsuperseded.map((entry) => ({ entry, rank: factAuthorityRank(profile, entry.facet, entry) }))
    .sort((a, b) => a.rank - b.rank);
  if (ranked.length && ranked[0].rank < (ranked[1]?.rank ?? Number.MAX_SAFE_INTEGER)) {
    return { classification: "authority-resolved", winner: ranked[0].entry };
  }
  return { classification: "unresolved-conflict", winner: null };
}

function resolveFactLedger(ledger = [], profile = {}) {
  const grouped = new Map();
  for (const entry of ledger) {
    const group = grouped.get(entry.claimKey) || [];
    group.push(entry);
    grouped.set(entry.claimKey, group);
  }
  const groups = [...grouped.entries()].map(([claimKey, entries]) => ({
    claimKey,
    entries,
    sensitive: entries.some((entry) => SENSITIVE_FACETS.has(entry.facet)),
    ...resolutionForGroup(entries, profile),
  }));
  return {
    groups,
    unresolved: groups.filter((group) => group.classification === "unresolved-conflict"),
    unresolvedSensitive: groups.filter((group) => group.sensitive && group.classification === "unresolved-conflict"),
  };
}

function factIsAnswerable(entry = {}, now = Date.now()) {
  const lifecycle = lifecycleFor(entry, now);
  if (!ANSWERABLE_LIFECYCLES.has(lifecycle)) return false;
  if (!APPROVED_REVIEW_STATUSES.has(entry.reviewStatus)) return false;
  const staleAt = dateValue(entry.staleAfter);
  return !staleAt || staleAt >= now;
}

function factLedgerStatus(index = {}, now = Date.now()) {
  const ledger = index.factLedger || [];
  return {
    totalFactCount: ledger.length,
    approvedFactCount: ledger.filter((entry) => APPROVED_REVIEW_STATUSES.has(entry.reviewStatus)).length,
    candidateFactCount: ledger.filter((entry) => entry.reviewStatus === "candidate").length,
    staleFactCount: ledger.filter((entry) => APPROVED_REVIEW_STATUSES.has(entry.reviewStatus) && !factIsAnswerable(entry, now)).length,
    conflictedFactCount: Number(index.truthStatus?.unresolvedSensitiveConflictCount || 0),
    retirementPendingCount: (index.pages || []).filter((page) => page.lifecycle === "retirement-pending").length,
    pendingSensitiveReviewCount: Number(index.truthStatus?.pendingSensitiveReviewCount || 0),
  };
}

function validateFactAuthority(profile = {}) {
  const missing = REQUIRED_AUTHORITY_FACETS.filter((facet) => !Array.isArray(profile.factAuthority?.[facet]) || !profile.factAuthority[facet].length);
  if (missing.length) throw new Error(`Fact authority order is required for: ${missing.join(", ")}.`);
  return profile;
}

function reviewDecisionMatches(decision = {}, entry = {}) {
  return Boolean(
    REVIEW_DECISIONS.has(decision.decision)
    && decision.factId === entry.id
    && decision.sourceVersion === entry.sourceVersion
    && normalizeUrl(decision.sourceUrl) === normalizeUrl(entry.sourceUrl)
  );
}

function applyReviewDecisions(ledger = [], decisions = []) {
  const applied = [];
  const stale = [];
  const byFact = new Map(decisions.map((decision) => [decision.factId, decision]));
  const updated = ledger.map((entry) => {
    const decision = byFact.get(entry.id);
    if (!decision) return entry;
    if (!reviewDecisionMatches(decision, entry)) {
      stale.push({ decision, entry });
      return entry;
    }
    const reviewedAt = decision.decidedAt || new Date().toISOString();
    const base = {
      ...entry,
      reviewedAt,
      reviewedBy: decision.reviewer || "owner",
      reviewNote: decision.note || "",
      reviewDecisionId: decision.id || hash(`${entry.id}:${reviewedAt}`).slice(0, 24),
    };
    let resolved = base;
    if (decision.decision === "approve-proposed" || decision.decision === "mark-current-superseded") {
      resolved = { ...base, reviewStatus: "approved", lifecycle: lifecycleFor({ ...base, reviewStatus: "approved" }) };
    } else if (decision.decision === "keep-current") {
      resolved = { ...base, reviewStatus: "rejected", lifecycle: "candidate" };
    } else if (decision.decision === "exclude-page") {
      resolved = { ...base, reviewStatus: "excluded", lifecycle: "retired" };
    } else if (decision.decision === "escalate") {
      resolved = { ...base, reviewStatus: "escalated", lifecycle: "uncertain" };
    }
    applied.push({ decision, entry: resolved });
    return resolved;
  });
  return { ledger: updated, applied, stale };
}

module.exports = {
  ANSWERABLE_LIFECYCLES,
  APPROVED_REVIEW_STATUSES,
  REQUIRED_AUTHORITY_FACETS,
  REVIEW_DECISIONS,
  SENSITIVE_FACETS,
  authorityReason,
  applyReviewDecisions,
  buildFactLedger,
  factAuthorityRank,
  factIsAnswerable,
  factLedgerStatus,
  inferFacet,
  inferScopeKey,
  inferSubjectKey,
  lifecycleFor,
  normalizeFactValue,
  normalizeUrl,
  periodsOverlap,
  resolveFactLedger,
  reviewDecisionMatches,
  validateFactAuthority,
};
