# Sterling Ranch Community Assistant source-necessity audit

## Scope

This review is limited to:

1. Current fees, payments, contacts, reservations, and booking actions.
2. DRC, property changes, landscaping, and controlling amendments.
3. Utilities, trash, water quality, and equipment support.
4. Facilities, recreation, events, and live services.

Governance archives, elections, general finance records, maps, historical documents, and technical/navigation pages are deferred and out of scope for this review. This is a review-only classification. It does not approve evidence, change an existing decision, or update the Community Assistant.

## Fresh inventory finding

The read-only crawl completed at `2026-09-12T00:08:09.987Z` and found 1,631 URLs, of which 1,224 were crawl-eligible. It reported 897 pending URLs.

Those 897 pending links all point into CivicPlus DocumentCenter. They collapse to 507 distinct DocumentCenter IDs. Therefore 390 pending rows are alternate URL forms for documents already represented elsewhere in the same pending list. The raw pending-URL count overstates the number of documents by at least 43%.

The crawl's default PDF extractor was unavailable, but the in-scope Category 1 PDFs were subsequently downloaded from their official URLs, extracted with the bundled PDF tools, and visually reviewed page by page. The ledger's older `contentHash` values do not identify their hash method, so they cannot safely be compared with newly calculated raw-file hashes. No source was treated as changed or unchanged from hash comparison alone.

## In-scope denominator

| Category | Documents proposed for first-pass review |
| --- | ---: |
| Current fees, payments, contacts, reservations, and booking actions | 5 |
| DRC, property changes, landscaping, and controlling amendments | 14 |
| Utilities, trash, water quality, and equipment support | 7 |
| Facilities, recreation, events, and live services | 1 |
| **Confirmed in-scope total** | **27** |

This is the confirmed working denominator for the review. It is not a claim that all 507 documents were readable. Seventy-six distinct document IDs had no descriptive title in either the fresh crawl or the retained inventory. A lightweight official-link check returned HTTP 404 for all 76. They are unavailable links, not hidden readable documents, and are excluded from active review unless they are rediscovered at working official URLs.

Twenty additional topic-word matches were deferred because their titles identify them as old rules, old forms, expired schedules, studies, technical standards, or general wildlife/reference material.

## Category 1: five documents

- Document 2434 — 2026 notice of setting water, sewer, and stormwater rates and fees.
- Document 2472 — 2026 tap and facility fees.
- Document 2473 — 2026 water, sanitary sewer, and stormwater fees.
- Document 2474 — 2026 CAB fees.
- Document 2615 — amended delinquent utility-fee collection process.

Documents 2472, 2473, 2474, and 2615 already have narrow exact-version decisions. Preserve those decisions and review only uncovered claims, changed identity, or conflicts. Document 2434 has no recorded approval in the canonical ledger and should be compared with the already scoped controlling fee resolutions.

### Category 1 review result

| Document | Owner-approved disposition | Reason |
| --- | --- | --- |
| 2434 | **Owner-approved historical/superseded exclusion** | This is a one-page October 2025 public notice saying the CAB would consider 2026 rates and fees at its November 21, 2025 meeting. It contains no adopted fee table and adds no current resident-facing fee fact. |
| 2472 | **Retain as necessary** | Adopted November 21, 2025 and effective January 1, 2026. It replaces prior tap and facility fees. Preserve the existing approval boundary: complete, clearly labeled residential rows only. |
| 2473 | **Retain as necessary** | Adopted November 21, 2025 and effective January 1, 2026. It replaces prior water, sewer, and stormwater fees. Preserve the existing residential-only approval boundary and all existing withheld rows. |
| 2474 | **Retain as necessary** | This is the adopted 2026 CAB fee schedule. The source contains conflicting 2025/2026 effective-date wording, so the existing decision to approve clearly labeled 2026 amounts while withholding a standalone effective-date claim remains appropriate. |
| 2615 | **Retain as necessary** | Adopted June 20, 2025. It is the amended collection process and its listed fee schedule. Preserve the existing freshness boundary: do not claim no newer amendment exists without checking. |

Document 2434 does not conflict with documents 2472–2474: it records the earlier notice-and-hearing step, while the later resolutions record the adopted outcome. The owner-approved Category 1 classification is **four retained current controlling sources and one historical exclusion**. The retained documents keep their existing narrow evidence boundaries.

## Category 2: fourteen documents

- Document 1964 — 2026 landscape submittal packet.
- Document 1965 — approved landscapers list.
- Document 617 — Providence fencing elements.
- Document 618 — standard three-rail fencing.
- Document 619 — solar panels.
- Document 621 — exterior light replacement.
- Document 622 — trash screening.
- Document 623 — rear patio lights.
- Document 624 — landscape screens.
- Document 625 — controlled pet areas.
- Document 626 — backyard utility sheds.
- Document 710 — Code amendment concerning the Overlook facility.
- Document 748 — roll-off containers.
- Document 828 — resolution modifying community-standards/design-review rules and fees.

Document 1964 already has a staging-only review covering four recorded source chunks. That scope must not be enlarged. The current official PDF visibly contains the same reviewed subjects, but the older ledger did not record a comparable raw-file hash scheme, so exact-version continuity was not assumed.

### Category 2 review result

| Document | Owner-approved disposition | Reason and safe boundary |
| --- | --- | --- |
| 1964 | **Retain as necessary process source** | This is the current 2026 landscape application packet. It is useful for the application route, required packet pieces, and narrowly scoped current procedures. It does not replace the governing landscaping rules. Preserve its staging-only status until any resident-facing claims receive owner approval. |
| 1965 | **Retain as action-only directory** | The PDF says it was updated August 2026 and is linked from the current CAB landscaper page. Offer the current directory link, but do not ingest, recommend, or repeat individual companies and contact details as durable facts. The CAB explicitly says the list is not an endorsement. |
| 617 | **Retain as a narrow supporting candidate** | Its first page contains specialized Lennar Elements/Providence fencing specifications not found in the controlling Code search. The generic second-page process text has an outdated meeting cadence. Any future approval should be limited to the first-page product and dimensional specifications; the governing Code and current DRC page must control whether approval is required and how to submit. |
| 618 | **Not necessary as independent evidence** | The controlling Code, Section 21-23, already contains the same standard three-rail fence styles and finish colors. The PDF can remain a visual reference link, but it should not be a separate factual authority and its embedded application page should not be used. |
| 619 | **Retain as a narrow supporting candidate** | Its first page contains installation-appearance specifications not found in the controlling Code search. The Code controls the approval requirement. Exclude the unsourced promotional claims attributed to the Department of Energy and do not use the embedded older application page. |
| 621 | **Exclude as superseded/conflicting** | It says three named exterior fixtures need no DRC approval. The adopted May 17, 2024 exterior-lighting amendment instead requires an exterior-lighting improvement application for fixture replacement. The later adopted rule controls. |
| 622 | **Not necessary as independent evidence** | The controlling Code, Section 21-22(b)(102), already contains the trash-screen conditions. Use the Code for the rule and the current DRC route for submissions; do not use the embedded older application page. |
| 623 | **Exclude as superseded/conflicting** | Its five-lumen approval rule and string-light specifications conflict with the adopted May 17, 2024 exterior-lighting amendment, which supplies the current decorative-lighting categories and conditions. |
| 624 | **Not necessary as independent evidence** | The controlling Code, Section 21-22(b)(54), contains the landscape-screen requirements. The one-sheet is incomplete compared with the Code and its generic process page has an outdated meeting cadence. |
| 625 | **Exclude as conflicting** | It says electric/invisible fences are not allowed. The controlling Code allows invisible fencing when its wiring is buried at least six inches inside the lot line. Do not use the PDF until CAB resolves or replaces it. |
| 626 | **Not necessary as independent evidence** | The controlling Code, Section 21-22(b)(9), already contains the shed approval, size, height, utility, screening, easement, and high-visibility-lot requirements. The embedded process page has an outdated meeting cadence. |
| 710 | **Exclude as historical/superseded** | This January 2022 Overlook amendment is not a safe current source: child-supervision language was amended later in 2022, operating hours are live facts, and current fees come from later adopted sources. Any still-current rental limits are already incorporated into the Code. |
| 748 | **Not necessary as independent evidence** | The substantive roll-off-container rules are already in the controlling Code. The PDF also gives the obsolete `submit@sterlingranchdrc.com` address; the current Code and DRC page use `residentsubmit@sterlingranchcab.com`. |
| 828 | **Exclude as historical/superseded** | The 2021 nuisance-enforcement and fine process was replaced by the adopted November 22, 2024 due-process policy. Its holiday/lighting material was also amended later. It is useful only as legislative history. |

The practical Category 2 result is **three necessary evidence candidates, one action-only directory, five duplicate/reference-only documents, and five superseded or conflicting documents**. This reduces the active detailed evidence-review set from 14 documents to 3: documents 1964, 617, and 619. Document 1965 remains available as a current outbound directory, not as indexed resident-answer evidence.

The owner approved this Category 2 classification on September 12, 2026. This approval classifies the documents; it does not approve any new resident-facing claims.

The affected resident question family includes landscaping applications, fencing, solar panels, exterior lighting, trash screens, patio lights, landscape screens, pet areas, sheds, roll-off containers, and DRC submission steps. For binding requirements, the adopted Code and later amendments control. The retained PDFs may support only current process steps or unique specifications within an expressly approved scope.

## Category 3: seven documents

- Document 1384 — Chase Drain installation resolution.
- Documents 146 and 168 — Waste Connections recycling tips; likely duplicate material, but exact identity must be verified.
- Document 2398 — 2026 water quality report.
- Document 520 — Waste Connections recycling presentation.
- Document 686 — improperly connected outdoor-use water meters policy.
- Document 770 — calculating outdoor water usage.

### Category 3 review result

| Document | Owner-approved disposition | Reason and safety boundary |
| --- | --- | --- |
| 1384 | Retain as a necessary controlling source | Resolution 2023-06-02 was adopted June 21, 2023 and expressly repeals the earlier 2021 Chase Drain resolution. It supplies the governing eligibility, easement, indemnity, construction, maintenance, and payment terms. The current Chase Drain page confirms the live request path and the present $3,500 fee, but that page should remain the freshness check because the resolution says the fee may be amended. |
| 146 | Exclude as an exact duplicate | Its file hash is identical to document 168. The current CAB trash page links document 168, so retaining 146 would add no evidence. |
| 168 | Retain as an action-only visual reference | This is an undated Waste Connections recycling handout. It can remain an outbound visual aid, but current accepted-material rules, service details, and contact information must come from the current CAB page or live provider source because those details can change. |
| 2398 | Retain as a necessary, specialist-reviewed source | This is the current 2026 annual drinking-water report, using 2025 data. It bundles separate sections for Sterling Ranch CAB, Dominion Water & Sanitation District, Roxborough Water & Sanitation District, and Castle Rock Water. Evidence must be segmented by the named system and PWS ID; figures, violations, contacts, health statements, and conclusions must never be blended across systems. Numerical, health, and compliance claims remain pending CAB or water-specialist review. |
| 520 | Exclude as unnecessary general education | This undated recycling presentation largely repeats the recycling handout and adds general educational material, not current service or operational authority. It does not need active resident-answer evidence review. |
| 686 | Exclude as historical and incomplete | This 2021 policy addresses a limited group of Filing No. 1 homes with improperly connected outdoor meters. It contains a blank reimbursement amount and says CAB would contact affected owners. There is no current evidence that the remediation program remains open, so its credit, eligibility, and reimbursement statements must not be surfaced as current promises. |
| 770 | Retain as a narrow supporting candidate | The current DRC document directory still links it, and it contains a potentially unique outdoor-water design methodology. However, it also contains an old $8.85 rate and an obsolete submission email. Rates and contact details must be excluded, and the remaining 30/70 allocation and 20/10/6 calculation method require CAB or water-specialist confirmation before approval. |

The practical Category 3 result is **two necessary authoritative sources, one narrow supporting candidate, one action-only visual reference, and three exclusions**. This reduces the active detailed evidence-review set from seven documents to three: documents 1384, 2398, and 770. Document 168 may remain available only as an outbound visual reference.

The owner approved this Category 3 classification on September 12, 2026. The system-specific numerical, health, and compliance claims in document 2398 and the calculation method in document 770 remain unapproved pending specialist review.

The affected resident question family includes Chase Drain requests and fees, recycling guidance, annual water-quality questions, system-specific water notices, outdoor-meter remediation, and landscape water-budget calculations. Current operations continue to come from live official pages or connectors. Adopted policy controls Chase Drain obligations, while the annual water report must be handled section by section for the correct water system.

## Category 4: one document

- Document 159 — caregiver registration form.

Most current facility, recreation, event, and live-service authority is already represented by web pages or live connectors rather than by the pending DocumentCenter backlog. Those incorporated sources remain governed by their existing decisions and are not reopened here.

### Category 4 review result

| Document | Owner-approved disposition | Reason and safety boundary |
| --- | --- | --- |
| 159 | Exclude as a stale and conflicting action route | The two-page fillable PDF was created and last modified in August 2020. It tells residents to submit a check at registration. The current dedicated Annual Caregiver Pass page instead directs residents to the live online form, allows 48 hours for processing, and says payment is due at pickup by credit/debit card, check, or cash. Although the general Memberships page still lists the PDF as a helpful document, the newer dedicated page and online form are the safer current process. Use those live sources for the fee, eligibility, steps, contact details, and submission action; do not index or offer the PDF as the current registration route. |

The owner-approved Category 4 classification is **zero pending PDFs requiring detailed evidence review and one exclusion**. The current Annual Caregiver Pass page should supply changing facts and process instructions, and its online form should be the resident's action destination.

## Overall result for the four requested categories

Of the 27 in-scope DocumentCenter documents, the owner approved the classification of **10 for the detailed evidence-review set, 2 as action-only or outbound-reference sources, and 15 as exclusions or unnecessary duplicate/reference sources** on September 12, 2026. This classification does not approve individual claims.

## Applied state

The approved classifications are now enforced in the Community Assistant code for the exact document versions reviewed here:

- The 15 excluded or unnecessary document bodies cannot enter resident-answer retrieval.
- The 2 action-only document bodies also cannot enter resident-answer retrieval, so their contents cannot be repeated as facts. Their exact official destinations now have separately approved action/link routes: the current approved-landscapers directory and the recycling-tips visual.
- The 10 retained documents stay eligible for the appropriate next review stage. Retained does not automatically mean every sentence in the document is active evidence.
- Existing narrow claim approvals for documents 2472, 2473, 2474, 2615, and 1964 remain unchanged; this package neither expands nor revokes them.
- Documents 617, 619, and 1384 now have exact-version, claim-level approvals limited to the safe boundaries recorded above. Document 617 contributes only the unique Lennar Elements Providence fence product and dimensions; document 619 contributes only the solar-panel appearance specifications; document 1384 contributes only the adopted Chase Drain definition, case-specific inspection standard, CAB construction and maintenance responsibilities, and homeowner cost/access/indemnity responsibilities.
- Documents 2398 and 770 remain withheld and still require CAB or water-specialist review for the sensitive scopes identified above.
- A later document version does not inherit these classifications automatically. Its changed fingerprint sends it back through review.

This is a local project change and has not, by itself, been released to the live resident-facing service. No resident test question was submitted while applying it.

### Verification after application

- The exact-version classification, action-only, claim-projection, changed-version, and retrieval tests pass for all five completed routes.
- The full project suite completed 767 tests. It initially passed 764 and identified three stale test expectations caused by the newly recorded decisions. Those three expectations were corrected, and all 35 tests in the affected files then passed.
- The canonical source ledger rebuild and consistency check pass with 37 unique versions and 37 scoped approvals.
- The broader release precheck remains held because the existing project snapshot reports 189 expired approved source records and 38 expired facts. That is a release-wide freshness dependency, not permission to weaken the exact-source safeguards or treat the new water documents as approved.

## Next review order

1. Route document 2398's system-specific numerical, health, and compliance claims—and document 770's calculation method—to a CAB or water specialist before any claim approval.
2. Review the narrowly retained Category 2 candidates (documents 1964, 617, and 619) claim by claim, preserving the controlling Code and current process-page boundaries.
3. Review the retained Category 3 Chase Drain source (document 1384) claim by claim, using the current page as the fee and action freshness check.
4. Record any later claim-level approval separately, with exact source identity, scope, review state, and freshness boundaries.

## Owner approval record

On September 12, 2026, the owner responded **“Approve all”** to the four-category classification package. This accepted the document-level dispositions recorded above. It did not approve new facts, amounts, dates, schedules, contacts, rules, or fixed answer wording, and it did not modify existing claim-level ledger boundaries. The classifications were subsequently wired into retrieval as described in **Applied state**; no resident-facing design was changed.
