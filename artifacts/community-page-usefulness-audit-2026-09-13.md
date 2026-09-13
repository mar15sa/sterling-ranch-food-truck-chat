# CAB webpage usefulness audit — four owner-selected categories

**Audit date:** September 13, 2026  
**Status:** Implemented and locally verified; release verification pending  
**Scope:** CAB webpages relevant to the four owner-selected categories only. Governance, historical records, maps, general news, commercial listings, and other long-tail material remain outside this audit.

## Why this audit was needed

The source dashboard previously combined three different ideas: discovering a URL, indexing webpage text, and approving specific claims for resident answers. That made broad CAB website coverage look more complete than it was. The 27-document audit had explicit usefulness decisions, but regular CAB webpages did not.

The correction keeps broad discovery so new official pages are not missed, while giving each in-scope webpage version one explicit role. A page-level usefulness decision never approves every sentence on the page.

## Current audited result

| Page role | Count | What it means |
| --- | ---: | --- |
| Exact approved answer evidence | 9 | The page contains one or more separately approved claims. Only those exact claims may answer residents. |
| Safe link only | 30 | The official route is useful for a next action or navigation. Page text does not become general answer evidence. |
| Live feed | 1 | The live calendar connector controls dated answers; cached calendar text is not authoritative. |
| Review required | 28 | The page is useful, but unapproved claims remain withheld until exact claim review. |
| Excluded duplicate views | 20 | Duplicate calendar presentations are not independent evidence. |
| **Total page routes audited** | **88** | Every listed route has an exact saved version fingerprint and category disposition. |

Category totals are:

- Fees, payments, contacts, reservations, and booking: 20 pages.
- DRC, property changes, landscaping, and amendments: 11 pages.
- Utilities, trash, water quality, and equipment support: 14 pages.
- Facilities, recreation, events, and live services: 43 pages.

## Authority and safety decisions

- Adopted controlling rules still outrank supporting webpages for binding requirements.
- Official operational pages can support only exact approved current claims.
- Current event dates and pool status must come from live connectors.
- Navigation-only pages can provide an official next step without promoting surrounding page text.
- Duplicate calendar views are excluded from resident retrieval.
- If an audited page fingerprint changes, its old page disposition is not treated as current.
- The existing exact claim/version approval gate remains in force. `answer-evidence` means “some exact claims are approved,” not “the whole page is approved.”

## Resident before and after

**Before:** A broad indexed-page count could suggest that a page was fully useful and answer-ready. Duplicate calendar views and unreviewed operational pages were not visible as separate states.

**After:** The owner can expand each category and see the official documents and CAB webpages separately, including whether each page supplies approved claims, a safe link, a live feed, needs claim review, or is excluded. The source-change queue remains separate so an empty queue cannot hide first-time review work.

## Reuse boundary

The webpage-disposition behavior is generic: exact-version matching, live-feed handling, excluded-page withholding, and dashboard presentation can apply to another CivicPlus community. Sterling Ranch URLs, titles, category membership, and audit decisions stay in the community-specific data file.

## Verification plan

- Validate all 88 audited records have unique URLs, a category, disposition, reason, and exact version fingerprint.
- Confirm duplicate calendar pages are withheld from retrieval.
- Confirm the canonical calendar route permits the dynamic connector but withholds cached static page text.
- Confirm a changed audited page fingerprint is withheld pending re-review.
- Confirm the private dashboard exposes all documents and pages in each category and separately reports 28 useful pages needing claim review.
- Run the full automated test suite and visually check desktop and mobile owner views before release.

## Release evidence

- Implementation revision: `3868808`.
- Pull request: pending.
- Production revision: not yet verified.
- Notion operating/design guide: pending update until the implementation revision is known.
- Automated verification: 810 tests passed on September 13, 2026.
- Browser verification: authenticated owner view checked in Chrome at 1440 × 1000 and 390 × 844. All 88 audited page rows rendered, the 28-page review count matched, and neither viewport had horizontal overflow.
- Visual evidence: `artifacts/community-page-audit-ui/desktop.png`, `desktop-pages.png`, `mobile.png`, `mobile-pages.png`, and `results.json`.
