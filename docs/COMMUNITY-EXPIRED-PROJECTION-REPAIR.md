# Expired exact approvals must not become current evidence

Diagnosed and implemented locally September 14, 2026 during the end-to-end experiment. No live release implied.

## Root cause and affected family

`sourceReviewState` filters explicit fact-ledger entries with `factIsAnswerable`, but then adds canonical exact-version claim/action projections without checking the parent source's expiry or lifecycle. A source can retain `lifecycle: current` after `staleAfter` passes. Canonical approval proves scope and version, not continued freshness. Search therefore returns expired approved facts and actions, even when other answer paths correctly withhold them.

The stopped v5 document-flow capture included ten distinct static community source records whose declared expiry preceded the run. Examples included recurring waste guidance, the design-review application directory and approved navigation links. The local current-control arm also returned answers using this snapshot. This is not evidence about today's deployed refreshed data. Neither arm may be used to claim safe answer-quality improvement. The process was explicitly stopped after this audit; a possible in-flight model request remains unknown cost.

## Shared repair

Apply the parent static source's effective lifecycle and declared freshness deadline before either canonical or explicit projections enter the runtime evidence set. Preserve the canonical inventory/approval function as an inventory view: an expired approval is still a recorded approval, but its text/action cannot answer until the existing exact-version refresh process renews freshness. A longer-lived fact entry cannot make an expired source current. Invalid declared expiry is not a fresh timestamp. Missing expiry retains the existing contract and fact-level checks; this repair does not introduce new freshness periods or renew any source.

Dynamic connectors remain behind their existing live evidence contracts and are not changed by this static projection repair. No source is approved, altered, refreshed or made current by a model. No resident-facing fixed facts or new UI. The gate is shared and independent of community/topic; test two communities with distinct exact-version approvals.

Before: a retired/expired canonical source can supply an approved price or action. After: the same source remains inventoried but its runtime projections are withheld. An unchanged source renewed through the approved process can become eligible again. Preserve approved scope, source version, requested facets and existing quarantine behavior.

Required checks: canonical fact/action positives; expiry, invalid expiry, explicit non-current lifecycle, changed version and cross-community negatives; a newer source version/renewed timestamp is not assumed; explicit fact-ledger entries cannot bypass parent expiry; live connector gate behavior unchanged. Run relevant source review/search/renewal/completion tests, then the required full suite. Update the pending Notion flow explanation and diagram before release; no verified-live claim without an actual deployed revision check.

## Verification and clock consistency

The three new regression tests failed before the gate change and passed afterward. They cover two communities and both fact/action approvals. The initial focused run passed 39 tests. The first full run passed 848/860 and exposed seven existing retrieval call sites that omitted the request's `now` value, causing dated scenarios to use the machine clock instead. All community search and fallback calls now receive the same supplied request clock. The dated pool, domain-outage grace and water-billing subset then passed 62/62.

Five positive test scenarios also relied on the machine clock while loading stored source snapshots with fixed expiry dates. Their positive calls now specify a date within the fixture's validity period; source timestamps and expected resident behavior were not extended or weakened. Expired-source behavior is independently asserted in the new negative tests. The 97-test affected fixture run reached 96/97, then the remaining payment fallback calls received the same explicit fixture clock and that case passed. The final full run passed **860/860** in 147,633 ms: `artifacts/quality-eval/expired-projection-suite-final-20260914.log`. The earlier 848/860 run remains recorded as a failure.

The resident-literal guard passes. No new AI request or service is needed for this runtime repair. Exact expiry does not disappear from the approval inventory, and existing dynamic connector freshness contracts remain separate. Remaining candidate work includes current scoped evidence preparation, fact-role support for process contacts, action identity, complete end-to-end quality/cost measurement and independent human calibration.

## Current approved test snapshot

The first read-only official-source revalidation renewed 57/60 URL groups. All three PDF failures were caused by the isolated worktree missing its already-declared `pdf-parse` dependency, not evidence that the official documents changed. After installing the existing lockfile dependencies, the second run passed all 60 groups. Its approved fingerprint remains `c3b7ae9235450ce3afbb39e52b4a02b10c274c149992e0178d755f798c3a5b86`. Evidence: `artifacts/quality-eval/current-source-snapshot-v2-20260914/{attestation,review,community-index}.json`. The first failed attempt is retained. Only the separate temporary snapshot was renewed; repository data, owner approvals, and production were not changed. The snapshot remains subject to its recorded deadlines.
