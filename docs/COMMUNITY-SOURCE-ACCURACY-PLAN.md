# Community Source Accuracy and Coverage Plan

**Status: audited operating plan as of September 10, 2026.** This replaces the earlier plan's single release gate with two separate goals: keeping the exactly approved resident-answer bundle safe, and eventually accounting for the full official CAB/CivicPlus site. The exact claim-level answerability calculation is the reporting authority when it disagrees with a legacy trusted-baseline label.

## The rule that does not change

New, changed, conflicting, stale, unreadable, or unavailable source material must not become resident-answer evidence just because it came from an official website. The owner decides whether a material fact may be used. A source decision is tied to its exact URL, source version, content hash, fact key, and scope. A changed hash needs a new decision.

The assistant can collect, compare, group, and explain evidence. It cannot approve a fact, choose between conflicting values, or convert a missing page into proof that a rule or service no longer exists.

## Two separate finish lines

| Finish line | What it protects | May production keep serving the current approved bundle? | What blocks it |
| --- | --- | --- | --- |
| **Approved-bundle safety** | Current resident answers | Yes. This is the normal safe state while new material waits for review. | Any expired approved source/fact, failed approved-source refresh, changed approved identity, broken required action, failed grounding/retrieval/answer regression, or a production fingerprint different from the reviewed bundle. |
| **Full coverage** | Completeness of future answers | Yes, provided approved-bundle safety remains green. | Any official URL without a disposition, unresolved source scope needed for a proposed answer, unprocessed crawl backlog, unresolved required conflict, or a completeness target missed for the active batch. |

This distinction is intentional. It prevents a large discovery backlog from forcing unreviewed material into answers, while also preventing the backlog from being quietly called complete.

## Verified current position

The earlier September 8 table described a transitional trusted-baseline bundle as if every extracted fact had explicit owner approval. That was inaccurate. The strict release candidate keeps the legacy labels for migration history, but the runtime answerability gate recognizes only exact claim decisions with reviewer, decision, URL, version, and scope metadata.

| Area | Current evidence | Classification |
| --- | --- | --- |
| Exact resident evidence | 649 extracted ledger rows exist. The strict staging runtime counts 25 as explicitly approved and treats the other 624 trusted-baseline rows as candidates. Any older `truthStatus.approvedFactCount` field that counts the transitional baseline is migration metadata and must not be used as the resident-answer approval count. | **Implemented, migration cleanup remaining** |
| Canonical exact source ledger | 30 unique source versions are tracked: 5 whole-source `approved-evidence` versions and 25 `pending-review` versions. Separately, 22 claim-scoped approvals are represented by 17 exact decision applications. These are different units and must not be added together. | **Partially implemented** |
| Approved-source freshness | Current staging revision `b99312e42946a9addd4f0ef89bf2193d0547a613` renewed all 47 due exact approved URL groups without changing the approved fingerprint: zero review failures, zero expired approved sources, zero expired approved facts, and zero crawl failures. Current production revision `1cd21d664df90e089e19898c54772e49374db380` still reports five expired approved sources and five expired approved facts; those facts are withheld until the tested integration release is promoted. The new verifier handles ordinary chunks, section-scoped approvals, and full-page approvals on the same unchanged CivicPlus URL. | **Implemented and staging-proven; production promotion pending** |
| Safe refresh behavior | Approved URLs receive priority; only exact URL-plus-hash matches renew; changed/new/removed identities stay quarantined | **Implemented** |
| Resident freshness behavior | Stale approved sources and dated hours are withheld rather than shown as verified | **Implemented** |
| Candidate isolation | The latest staging refresh quarantined 18 changed, 356 new, and 57 removed source identities instead of promoting them. | **Implemented** |
| Inventory accounting | The latest staging snapshot reports 274 source records, 1,529 discovered URLs, 1,099 eligible URLs, and a 910-page backlog. Older bundled and live-candidate totals remain historical snapshots and must not be combined with this one. | **Partially implemented** |
| Private review queue | The authenticated screen has pagination and shows pending evidence without changing answers. The current long-tail queue is 1,925 candidate review items; this is not the count of approved or answerable facts. Deployment of its external review synchronization and queue-age alerts is not yet proven. | **Partially implemented** |
| Material conflict resolution | Current live health reports 17 conflicted facts. This is a fact count, not a count of source groups; older reconciliation artifacts use different snapshots and scopes. Every disputed claim stays withheld until its active review batch reconciles it. | **Missing** |
| Full official-site coverage | Not yet claimed; pending sources include current operational pages, forms, rules, historic files, duplicate candidates, and unavailable documents | **Missing** |

The older plan's instruction to block every release until every eligible URL is accounted for is **obsolete as a production-safety gate**. It remains the standard for claiming full coverage or releasing a coverage-expansion batch. The older subject order is also incomplete: current fees, contacts, reservations, and rule amendments have to be sorted by resident harm and authority, not by one large all-or-nothing phase.

## Approved-bundle safety gate

Run this gate for every code or approved-evidence release. It does not approve candidate material.

1. Confirm every approved source and fact is current, or safely withheld.
2. Revalidate only approved URLs that are due. Renew freshness only when URL, content hash, identity, actions, and approved fact version match exactly.
3. Send new, changed, removed, conflicting, unreadable, or unavailable material to the private queue. Do not modify the approved fingerprint.
4. Check required resident action links, controlling-source retrieval, claim grounding, and the resident answer regression suite.
5. Test the exact staging fingerprint, then the exact production fingerprint after normal protected release.
6. Stop the release if an approved source is expired, a required action is broken, a resident answer regresses, or production serves a different fingerprint.

**Measurable pass condition:** zero expired approved sources; zero expired approved facts; zero source-refresh failures; zero candidate facts in the active approved bundle; all required source/retrieval/grounding/link/answer checks pass; staging and production fingerprints match the reviewed bundle.

## Coverage and review workflow

Every discovered official URL receives one disposition: `approved evidence`, `pending review`, `duplicate of exact source/version`, `excluded with reason`, `unavailable—recheck required`, or `retirement-pending after two independent checks`.

For a review item, the preparer records the exact URL, title, source hash/version, resident topic, authority type, affected facts, comparable approved evidence, freshness risk, conflicts, and proposed owner action. The owner may approve, reject, defer, mark historical/reference-only, request a specialist source, or identify the controlling document. No bulk approval is allowed.

### Authority order

1. Adopted code, resolution, or controlling rule for what residents must or may do.
2. Current official operational system or official form for payment, booking, availability, current price, or required steps.
3. Current official calendar, alert, or live-status source for date-sensitive operations.
4. Official informational page for explanation and contacts.
5. Historical studies, audits, maps, superseded forms, and scanned documents as reference only unless the owner identifies a current use.

When sources disagree, the assistant withholds the disputed value. A newer informational page does not silently override a controlling adopted rule; an old rule does not silently override a current official operational system for availability or payment mechanics.

## Staged coverage backlog

The latest staging backlog is 910 pages from a snapshot with 1,529 discovered and 1,099 eligible URLs. Older 222-page and 894-page totals represent earlier crawl boundaries and remain historical evidence only. Every backlog is a queue rather than resident-answer approval. Work one small batch at a time; a batch can be complete even while the next batch is waiting.

| Batch | Scope and first owner-review set | Why first | Completion criteria |
| --- | --- | --- | --- |
| **1. Current money, contacts, and reservations** | 2026 CAB/water/tap-facility fee resolutions; monthly fee sheet; water payment and billing pages; Great Hall/Overlook/Sterling Center booking pages; Court Reserve; Contact Us and Important Contact Information | A wrong amount, payment route, deposit, or emergency contact causes immediate resident harm. | Every URL has a disposition; controlling fee/process source is named; every high-risk fact has an exact-version owner decision; required action links work; no unresolved conflict is used in answers. |
| **2. DRC, landscaping, and property changes** | 2026 architectural-improvements form; 2026 landscape packet; Design Review; current rules/amendments; approved landscaper list; fences, sheds, lights, solar, screens, and inspections | Residents need correct permissions, fees, submission steps, and deadlines before starting costly work. | Every current form is matched to its controlling rule; 2023/2024/2026 versions are explicitly superseded, retained, or excluded; every rule/process conflict is resolved or withheld; specialist escalation is recorded where county/state requirements control. |
| **3. Utilities, trash, water quality, and equipment support** | Water reports/quality report, trash and recycling pages, holiday schedule sources, meter troubleshooting, Rachio, water-concern route, and unavailable documents | Service timing, health information, and billing routes change often. | Current operations have a live/controller source; historical calendars and studies are marked reference-only; every unavailable page has a recheck date; Rachio and household-water routes have CAB/specialist confirmation before resident use. |
| **4. Facilities, recreation, events, and current services** | Pool, park shelters, amenities, pickleball, facility detail pages, calendars, clubs, passes, current services, and event pages | These change frequently but can be handled safely after the fee/contact/booking foundation. | Each facility has a current booking/status/controller source; date-sensitive facts have refresh rules; duplicates/aliases are consolidated by exact content/version; no event date or availability is promoted without a current source. |
| **5. Governance, historical records, maps, and long-tail documents** | Board/district pages, elections, agreements, audits, budget documents, formation documents, maps, scanned PDFs, and remaining DocumentCenter links | Most are reference material; some need specialist interpretation or an explicit historical-only decision. | Every remaining official URL has a disposition; scans have visual/OCR evidence or are excluded from answer evidence; missing exhibit tables and date conflicts are resolved or withheld; historical content is not presented as current policy. |

### Batch sizing and prioritization

- Prepare at most 25 high-value URLs for an owner session, grouped by resident topic.
- Put binding/current fees, payment paths, emergency contacts, reservations, required forms, restrictions, and live service schedules ahead of reference material.
- Treat aliases and exact duplicates as a single review question only after verifying the exact version/hash relationship.
- Send legal applicability, water-quality interpretation, maps, county requirements, and vendor/device replacement questions to the appropriate CAB or subject specialist.
- Do not count raw pages, source chunks, or extracted facts as completed review items. The unit of completion is an exact source version with a recorded disposition.

## Conflict plan

The 17 currently flagged conflicted facts must be handled in small decision queues within their active source batches. Do not relabel them as 17 source groups, do not combine them with counts from older reconciliation snapshots, and never treat a discrepancy as permission to choose the most convenient value.

1. Group each conflict by the resident claim it would change: fee/deposit, contact, hours, rule/permission, date, payment method, or service route.
2. Identify the authority level and effective date for each competing value.
3. Present the exact excerpts, URLs, hashes, and likely resident consequence to the owner.
4. Resolve with an owner decision, defer while withholding the value, or request a specialist/controller source.
5. Re-run affected question-family retrieval and grounding checks after a decision. A decision never transfers to a changed source version.

**Measurable completion criteria:** every conflict in the active batch has an owner disposition; zero unresolved conflict feeds a resident answer; every resolved group has a controlling-source explanation and exact-version evidence; affected regression questions pass; the reported count names the exact snapshot and scope it came from.

## Operating measures

Report these separately each week and month:

| Measure | Safe-bundle target | Coverage target |
| --- | --- | --- |
| Approved source/fact freshness | 0 expired | N/A |
| Candidate facts in resident evidence | 0 | N/A |
| Required action links broken | 0 | 0 in completed batches |
| Open material conflicts used in answers | 0 | 0 |
| Backlog disposition | N/A | Each labeled snapshot decreases only through recorded dispositions; do not merge totals across crawl boundaries. |
| Completed batch quality | N/A | 100% URL dispositions, exact-version decisions for material facts, family checks pass |
| Critical retrieval and answer regression | 100% / zero regressions | Same for every approved coverage batch |

The owner receives one deduplicated alert for each expired approved source, approved-bundle fingerprint mismatch, broken required action, overdue material review, controlling-source disappearance, or stalled active batch. Inventory growth is reported separately from approved-bundle health so a safe resident service is never described as full coverage.

**Scheduling gap:** startup and in-process refreshes, CI exact-version verification, daily source-release checks, and routing checks exist. The complete nightly/weekly/monthly operating schedule described by the earlier plan is not yet proven: inventory reconciliation, queue-age escalation, expiry reporting, retirement confirmation, and a monthly accuracy report still need one versioned schedule and evidence that it runs successfully.

## Roles and release boundaries

- **Owner:** approves material facts, resolves conflicts, designates controlling sources, and authorizes any coverage batch promotion.
- **Preparation work:** gathers evidence, checks links and hashes, creates review packets, and runs tests. It cannot approve or publish sources.
- **Application and automation:** keep the approved bundle current, quarantine candidate material, and report health. They cannot convert a pending record into resident evidence.
- **Specialists/CAB:** provide current authority where public pages are ambiguous, historical, scanned, missing, or outside CAB control.

This plan permits normal protected releases of a safe, unchanged approved bundle. A coverage-expansion release additionally requires the active batch's completion criteria, owner decisions for its material facts and conflicts, the approved-bundle safety gate, and the normal staging/production fingerprint checks.
