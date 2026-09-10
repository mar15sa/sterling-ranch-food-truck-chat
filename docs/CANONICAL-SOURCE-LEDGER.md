# Canonical source ledger

This is the durable inventory for the community-source review work. One record means one exact source version:

`canonical URL + SHA-256 content hash`

It fixes the apparent **222 versus 917** disagreement. The old 222 count was a historical snapshot of pending pages in one bundled candidate. The 917 count was a later historical snapshot of a crawl backlog. They are discovery queues from different moments, so neither is a current count, a source-version total, or a change to the other. The ledger reports only unique version keys, grouped by disposition.

Each record has these separate ideas:

- **Observation history:** every check of that exact version, including time, response status, final URL, optional fingerprints, packet that found it, and the community or communities that observed it.
- **Disposition:** `approved-evidence`, `pending-review`, `duplicate-exact-version`, `excluded-with-reason`, `unavailable-recheck-required`, or `retirement-pending`.
- **Approval:** separate from discovery and disposition. Every approval names one community, one exact URL/hash version, and one scope. A decision for one community never applies to another community that references the same version.

Review packets are preparation, never approval. The imported A/B/C/D entries remain pending unless a separate exact-version decision is recorded. Batch D's Contact Us, Great Hall, Overlook Clubhouse, and Homeowner Landscape Class versions are inventory-only pending records. Batch 1 owner decisions are retained as legacy references but do not name a hash, so they are deliberately not applied to a version. The existing form-review evidence does include URLs and hashes, so its five exact versions are retained with their documented `staging sources only` scope. This does not enlarge that scope.

The Decision Swipe approvals for Batch A are stored in `data/canonical-source-ledger-decisions.json`. Each lists its decision ID, community, exact URL/hash version, `scopeKind`, approved claims, withheld claims, and controlling sources. All five are `scoped-claims`, so they do not make a full page approved. `card-processing-fee` is attached separately to both exact payment-page versions. The water-payment direct link cannot establish rates, contacts, or terms; DocumentCenter item 2419 remains deferred; and monthly-fee and water-rate amounts remain controlled only by the listed adopted 2026 resolutions.

`data/canonical-source-ledger-imports.json` is a compact import of packet A, B, and C identity/observation fields. `data/canonical-source-ledger.json` is generated from it plus the two existing decision files. Build or verify it with:

```powershell
node scripts/build-canonical-source-ledger.js --write
node scripts/build-canonical-source-ledger.js --check
```

## Backfill boundary

This change does not pretend the historical 222 or 917 queue rows are complete source records. Their available summaries do not provide a full URL-and-content-hash pair for every row. A future backfill must export every discovered source with its community ID, fetched canonical/final URL, SHA-256 content hash, check time, and source crawl identifier. It can then call `upsertObservation`; an equal key adds history and a new hash creates a new pending version. Until then, those queues remain separately reported historical discovery measurements.

This ledger is not used by the Community Assistant runtime or its resident-facing screens. It is an accounting and review-boundary artifact only.
