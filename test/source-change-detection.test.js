const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { sourceContentHash } = require("../lib/community-ingest");
const { observeCanonicalSource, revalidateApprovedEvidence, sourceHash } = require("../lib/community-approved-revalidation");
const { fingerprint: approvedFingerprint } = require("../lib/community-release");
const { createRulesIndex, sameMunicodeVersion } = require("../lib/rules-assistant");

const PDF_URL = "https://alpha.gov/DocumentCenter/View/100/Policy";

function fingerprint(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function approvedPdf(bytes, text = "Approved policy text") {
  const documentFingerprint = fingerprint(bytes);
  return {
    id: "approved-pdf",
    sourceUrl: PDF_URL,
    connectorType: "official-pdf",
    sourceType: "rules",
    reviewStatus: "approved",
    text,
    actions: [],
    documentFingerprint,
    contentHash: sourceContentHash(text, documentFingerprint, []),
    checkedAt: "2026-09-01T00:00:00.000Z",
    staleAfter: "2026-09-01T00:00:00.000Z",
  };
}

function binaryFetcher(bytes, { status = 200 } = {}) {
  return async (url, { fetchImpl }) => {
    const response = await fetchImpl(url, { redirect: "manual" });
    if (!response.ok) {
      const error = new Error(`The document returned ${response.status}.`);
      error.status = response.status;
      error.retryable = false;
      throw error;
    }
    return bytes;
  };
}

test("an identical approved PDF fingerprint renews evidence without extracting its text again", async () => {
  const bytes = Buffer.from("%PDF-identical-approved-document");
  const source = approvedPdf(bytes);
  let extractionCalls = 0;
  const proof = await observeCanonicalSource(PDF_URL, [source], {
    fetchOfficialDocumentImpl: binaryFetcher(bytes),
    extractPdfBufferTextImpl: async () => { extractionCalls += 1; throw new Error("must not extract unchanged PDF"); },
    fetchImpl: async () => ({ ok: true, status: 200, url: PDF_URL, headers: new Headers() }),
  });

  assert.equal(extractionCalls, 0);
  assert.deepEqual(proof.observedHashes, [source.contentHash]);
  assert.equal(proof.actionMismatch, false);
  assert.equal(proof.documentProof.verificationMode, "binary-fingerprint");
  assert.equal(proof.documentProof.observedFingerprint, source.documentFingerprint);
});

test("a changed PDF fingerprint triggers extraction and produces a new exact content identity", async () => {
  const oldBytes = Buffer.from("%PDF-old-approved-document");
  const newBytes = Buffer.from("%PDF-new-official-document");
  const source = approvedPdf(oldBytes);
  const newText = "Changed official policy text";
  let extractionCalls = 0;
  const proof = await observeCanonicalSource(PDF_URL, [source], {
    fetchOfficialDocumentImpl: binaryFetcher(newBytes),
    extractPdfBufferTextImpl: async (data) => { extractionCalls += 1; assert.deepEqual(data, newBytes); return newText; },
    fetchImpl: async () => ({ ok: true, status: 200, url: PDF_URL, headers: new Headers() }),
  });

  assert.equal(extractionCalls, 1);
  assert.deepEqual(proof.observedHashes, [sourceContentHash(newText, fingerprint(newBytes), [])]);
  assert.equal(proof.documentProof.verificationMode, "binary-fingerprint-changed");
});

test("a successful legacy PDF check records its fingerprint without changing approved content identity", async () => {
  const bytes = Buffer.from("%PDF-legacy-approved-document");
  const documentFingerprint = fingerprint(bytes);
  const text = "Legacy approved PDF text";
  const source = {
    ...approvedPdf(bytes, text),
    documentFingerprint: undefined,
    contentHash: sourceHash(text),
  };
  const original = { sources: [source], factLedger: [] };
  const before = approvedFingerprint(original);
  const result = await revalidateApprovedEvidence(original, {
    now: Date.parse("2026-09-12T12:00:00.000Z"),
    fetchObservedHashes: (url, sources) => observeCanonicalSource(url, sources, {
      extractPdfTextImpl: async (requestedUrl, options) => {
        await options.fetchImpl(requestedUrl, { redirect: "manual" });
        options.onDocumentFingerprint(documentFingerprint);
        return text;
      },
      fetchImpl: async () => ({ ok: true, status: 200, url: PDF_URL, headers: new Headers() }),
    }),
  });

  assert.equal(result.checks[0].outcome, "renewed");
  assert.equal(result.temporaryIndex.sources[0].documentFingerprint, documentFingerprint);
  assert.equal(result.temporaryIndex.sources[0].hashScheme, "page-text-v1");
  assert.equal(approvedFingerprint(result.temporaryIndex), before);
  assert.equal(original.sources[0].documentFingerprint, undefined);
});

test("a legacy text-approved PDF accepts harmless byte changes only after confirming extracted text is unchanged", async () => {
  const oldBytes = Buffer.from("%PDF-old-container");
  const newBytes = Buffer.from("%PDF-new-container-same-visible-text");
  const text = "Approved visible PDF text";
  const source = {
    ...approvedPdf(oldBytes, text),
    hashScheme: "page-text-v1",
    contentHash: sourceHash(text),
  };
  let extractionCalls = 0;
  const result = await revalidateApprovedEvidence({ sources: [source], factLedger: [] }, {
    now: Date.parse("2026-09-12T12:00:00.000Z"),
    fetchObservedHashes: (url, sources) => observeCanonicalSource(url, sources, {
      fetchOfficialDocumentImpl: binaryFetcher(newBytes),
      extractPdfBufferTextImpl: async () => { extractionCalls += 1; return text; },
      fetchImpl: async () => ({ ok: true, status: 200, url: PDF_URL, headers: new Headers() }),
    }),
  });

  assert.equal(extractionCalls, 1);
  assert.equal(result.checks[0].outcome, "renewed");
  assert.equal(result.temporaryIndex.sources[0].contentHash, sourceHash(text));
  assert.equal(result.temporaryIndex.sources[0].documentFingerprint, fingerprint(newBytes));
});

test("a removed CivicPlus document is reported separately from a temporary extraction failure", async () => {
  const bytes = Buffer.from("%PDF-old-approved-document");
  const source = approvedPdf(bytes);
  const result = await revalidateApprovedEvidence({ sources: [source], factLedger: [] }, {
    now: Date.parse("2026-09-12T12:00:00.000Z"),
    fetchObservedHashes: (url, sources) => observeCanonicalSource(url, sources, {
      fetchAttempts: 2,
      fetchOfficialDocumentImpl: binaryFetcher(Buffer.alloc(0)),
      fetchImpl: async () => ({ ok: false, status: 404, url: PDF_URL, headers: new Headers() }),
    }),
  });

  assert.equal(result.checks[0].outcome, "review-required");
  assert.equal(result.checks[0].reason, "source-removed-or-moved");
  assert.equal(result.checks[0].failureKind, "source-removed-or-moved");
  assert.equal(result.checks[0].httpStatus, 404);
});

test("an unchanged Municode publication reuses the saved sections after one version request", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rules-version-check-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const indexPath = path.join(directory, "rules-index.json");
  const source = {
    latestJobId: 435037,
    codifiedThrough: "Resolution No. 2023-07-01, enacted July 19, 2023",
    onlineUpdateDate: "2024-02-21T19:51:01",
    onlinePostDate: "2024-02-23T17:42:35.208894",
    lastFetchedAt: "2026-09-01T00:00:00.000Z",
    sectionCount: 1,
    chunkCount: 1,
  };
  const existingIndex = { schemaVersion: 1, source, documents: [{ id: "rule-1", text: "Existing approved rule" }] };
  const job = {
    Id: 435037,
    BannerText: "Codified through Resolution No. 2023-07-01, enacted July 19, 2023 (Supp. No. 1)",
    OnlineDate: source.onlineUpdateDate,
    OnlinePostDate: source.onlinePostDate,
  };
  let contentRequests = 0;
  const refreshed = await createRulesIndex({
    indexPath,
    existingIndex,
    now: Date.parse("2026-09-12T12:00:00.000Z"),
    fetchLatestJob: async () => job,
    fetchToc: async () => { contentRequests += 1; throw new Error("unchanged publication must not fetch the TOC"); },
  });

  assert.equal(contentRequests, 0);
  assert.deepEqual(refreshed.documents, existingIndex.documents);
  assert.equal(refreshed.source.lastRefreshMode, "municode-version-unchanged");
  assert.equal(refreshed.source.lastFetchedAt, "2026-09-12T12:00:00.000Z");
  assert.equal(sameMunicodeVersion(source, {
    latestJobId: 435037,
    codifiedThrough: source.codifiedThrough,
    onlineUpdateDate: source.onlineUpdateDate,
    onlinePostDate: source.onlinePostDate,
  }), true);
  assert.equal(sameMunicodeVersion(source, {
    latestJobId: 435038,
    codifiedThrough: source.codifiedThrough,
    onlineUpdateDate: source.onlineUpdateDate,
    onlinePostDate: source.onlinePostDate,
  }), false);
});
