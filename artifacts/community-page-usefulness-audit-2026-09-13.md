# Full CAB content audit — four owner-selected categories

**Audit date:** September 13, 2026  
**Status:** Implemented and locally verified; release verification pending  
**Scope:** Every URL discovered on the Sterling Ranch CAB website, classified against the four owner-selected answer categories or marked out of scope.

## Bottom line

This supersedes the earlier 88-page review. The complete crawl discovered **1,631 unique CAB URLs**, and every one now has a recorded scope decision. There are **0 unclassified URLs**.

The audit found **463 URLs** that touch the four categories. After consolidating duplicate URLs and technical presentations, those represent **197 primary sources**. Inventory triage is complete, but answer approval is not: **101 primary sources need exact claim review**, and **4 need a retrieval retry**. They remain withheld from supplying unapproved facts.

## Full inventory reconciliation

| Measure | Count | Meaning |
| --- | ---: | --- |
| Discovered URLs | 1,631 | Every URL found across the complete CAB crawl inventory |
| Eligible content URLs | 1,007 | Routes capable of representing normal content |
| Technical exclusions | 624 | Printer/mobile aliases, invalid facility routes, and other technical presentations retained in the audit trail |
| URLs with a scope decision | 1,631 | In scope or out of scope; nothing is left unclassified |
| In-scope URLs | 463 | URLs touching at least one of the four categories, including aliases |
| Primary in-scope sources | 197 | The consolidated pages and documents shown to the owner |
| Out-of-scope URLs | 1,168 | Governance, archives, maps, news, and other material outside the requested categories |

The crawler recorded one access error: `/364/Sign-Up-for-E-News` returned HTTP 403. The route is outside the four selected categories, is explicitly present in the audit, and does not hide an in-scope coverage gap. Because of that error, the raw crawler flag remains technically false even though the discovered inventory is fully reconciled with zero pending URLs.

## Primary-source decisions

| Source role | Count | What it means |
| --- | ---: | --- |
| Approved answer evidence | 16 | Exact previously approved claims may support answers; this is not blanket page approval |
| Safe link | 31 | Useful official next action or navigation only |
| Live feed | 1 | Current calendar facts come from the live connector, not cached page text |
| Review required | 101 | Useful source identified; claims remain withheld pending exact review |
| Retrieval retry | 4 | Relevant route found, but a versioned content record must be retrieved before review |
| Intentionally excluded | 44 | Historical, superseded, duplicate-purpose, or otherwise unsuitable as current evidence |

The four retrieval retries are DRC Applications, Trash, Submit Your Feedback, and Get Help.

## Category results

Category totals overlap when one source legitimately supports more than one category.

| Category | URLs assessed | Primary sources | Pages | Documents | Need review | Need retry |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fees, payments, contacts, reservations, and booking | 164 | 50 | 36 | 14 | 29 | 2 |
| DRC, property changes, landscaping, and amendments | 135 | 54 | 23 | 31 | 33 | 1 |
| Utilities, trash, water quality, and equipment support | 106 | 36 | 21 | 15 | 25 | 1 |
| Facilities, recreation, events, and live services | 223 | 67 | 64 | 3 | 24 | 0 |

## How the audit was performed

1. Four complete live crawl passes were run to exhaust the discovered queue. The final pass had zero pending URLs.
2. Every discovered URL was reconciled exactly once as eligible content or a technical exclusion.
3. Page IDs, FAQ categories, form centers, facility/calendar routes, document identity, titles, and retrieved content were used to classify each URL into the four categories or out of scope.
4. Multiple URLs for the same document and alternate page presentations were consolidated so the owner sees primary sources rather than inflated URL counts.
5. The earlier 88 page decisions and 27 selected-document decisions were preserved exactly.
6. Potential false negatives were checked by scanning out-of-scope titles for category language. The three matches were already explicit governance exclusions: the Design Advisory Committee formation resolution and two URLs for a water-supply appeal resolution.
7. Newly discovered content was never promoted to answer evidence automatically. It defaults to claim review, retry, safe-link, or exclusion according to its audited role.

## Authority and safety decisions

- Adopted controlling rules outrank supporting webpages for binding requirements.
- A usefulness classification does not approve every statement on a source.
- Official operational pages support only exact approved current claims.
- Current event dates and other live facts come from live connectors.
- Historical and superseded material cannot establish current facts.
- A changed fingerprint does not inherit prior claim approval.
- The resident retrieval filter remains limited to previously approved evidence; the full audit expands owner visibility, not resident-facing authority.

## Resident before and after

**Before:** An 88-page sample and broad index totals could look like a complete CAB audit even though hundreds of discovered routes had no explicit owner-facing scope decision.

**After:** The owner sees that all 1,631 discovered URLs were assessed, how they consolidate to primary sources in each category, and which sources are approved, link-only, live, excluded, waiting for claim review, or awaiting retry. Every primary document and page is clickable in its category.

## Verification

- The audit file proves exact count reconciliation, unique URLs, valid category IDs, prior-decision preservation, and no automatic promotion of new content.
- All **815 automated tests pass** locally.
- Authenticated browser checks pass at 1,440 × 1,000 and 390 × 844. Both show the 1,631/1,631 reconciliation, 197 primary-source total, 105 review/retry count, four expandable categories, and no horizontal overflow.
- The four category cards contain 207 displayed source rows because 10 of the 197 unique primary sources legitimately appear in two categories.

## Release evidence

- Implementation branch: `codex/admin-source-transparency`
- Pull request: pending
- Production revision: not yet verified
- Notion operating/design guide: pending update to this full-audit result
- Visual evidence: `artifacts/community-page-audit-ui/desktop.png`, `desktop-pages.png`, `mobile.png`, `mobile-pages.png`, and `results.json`
