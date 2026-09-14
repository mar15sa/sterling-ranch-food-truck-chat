# CAB operations source review — September 14, 2026

Reviewed all 46 pending records assigned to operations: any pending record in the full URL audit that has neither the property-changes nor utilities-support category. Every official URL returned a complete readable response in this review. Result: 14 answer-evidence recommendations (53 exact quotations), 13 useful links, and 19 exclusions. No retrieval blocker remains in this assignment.

This is a claim-level recommendation package for coordinator integration under the owner's instruction to complete useful-source ingestion. It does not itself update runtime approval, index, deployment, or resident answers.

## What becomes useful evidence

The package retains bounded facts and useful actions for caregiver passes, resident membership applications and replacement cards, household utility setup responsibility, homeowner orientation, snow-removal responsibilities and dispatch thresholds, clubhouse rentals, the Sterling Center/Ranch Social, SR311 reporting, non-resident membership purchases, guest-pass renewal/purchase process, park-shelter rentals, CAB emergency support, community volunteering, and current staff/department contacts.

Each claim is an exact contiguous quotation of the repository-normalized current official main content. Each version has a SHA-256 `page-text-v1` fingerprint, exact URL, retrieval time, complete text, and specific exclusions. PDF bytes also have fingerprints. Actions retain their observed official anchors and normalized visible context; source self-links have explicit identity evidence.

## Outdated and conflicting material found

- Closing sheet 1456 says Prospect trash is Tuesday and adult membership-residency evidence starts at age 25. The newer guide says Thursday, and the dedicated membership page says 21. The closing sheet is excluded; a resident's actual next collection still requires the live waste connector.
- Water explainer 2419 has old indoor rate tiers ($9.40/$11.35/$18/$29.65). Current 2026 chart 2502 shows updated rates. The old rate example is excluded. The 2026 chart is a useful readable link; controlling adopted resolutions should supply rate claims.
- The 2026 fee chart's PDF extraction puts labels and values in different parts of the output. The entire chart was visually inspected, so no misleading automatic table associations are approved.
- Parks map 2352 is visibly an illustrative map dated October 13, 2025. It labels the school 2026 and Prospect Park under construction. It remains a labeled browsing link only, with no opening-date, current-construction, availability or navigation claims.
- The 28-page homeowner guide mixes useful summaries with outdated/general schedules, inconsistent operating hours, marketing, and future-development descriptions. Narrow current sources replace it for answers. All 28 extracted pages were reviewed; no QR/image-only data is approved.
- Clubhouse Saturday hours differ across current CAB pages: /324 shows 8 pm while /400 and several dedicated pages show 9 pm. All hours from this package are withheld.
- Pool facility detail requires an adult over 18 for children under 11, while the current whole-category pool FAQ allows an authorized supervisor of 15 or older. FAQ content also contains a 2021 public-health-order explanation and static lifeguard schedules. Both legacy/aggregate sources are excluded in favor of the current pool source and controlling rules.
- Guest material mixes a $100 pack of 25 additional passes and a $5 fee for guests above the daily allowance. These may cover different situations, but this package does not equate them or approve an ambiguous price/cap. Renewal and purchase steps remain useful.
- Current rental amounts on /269 match January 19, 2022 adopted Overlook amendment 710: Great Hall $100/hour with a two-hour minimum and $250 deposit; pavilion $25/hour. The coordinator retains later-amendment and controlling-rule precedence.
- CAB business pages disagree on Atlas and RAVE phone numbers. The package retains their verified business-site links, not copied phone numbers, operating hours, menus, appointment availability, or promotional claims.
- The eye-care legacy page points to `www.sterlingrancheye.com`, which fails DNS. The Sterling Center's `sterling-eyecare.com` link returns 200 and shows the current practice. The legacy page is excluded and the working current anchor retained.
- The airplane-noise page's airport link returns 404. The airport's current official noise portal is `https://noise.centennialairport.com/`. The old page/action is excluded; the replacement is recorded without pretending it was anchored on the CAB page.
- The volunteer page contains past March–July event dates and a Microsoft Forms designer URL. Those dates and that unusable action are withheld; evergreen program descriptions and public contacts remain useful.
- Activities and Resource Directory modules have no useful current results. Their empty state is not evidence that no community activities/businesses exist. Active CivicRec and specific source destinations replace them.
- Two same-page-ID slug pairs (/298 and /324) and a News Flash category-filter variant were consolidated.

## Verification and limits

Live HTML used the repository's `pageText` and `stripEmbeddedInstructions` extraction, covering the entire static main content rather than a truncated chunk. All 53 recommended claim quotations were programmatically checked for exact inclusion. The 2502 fee chart and 2352 map were rendered and visually inspected in full. Live business/catalog/action requests verified 200 responses except the two excluded destinations; the county snow-report link redirects to the county's official report-a-problem page.

No action was submitted. No account, booking, payment, appointment, email, service request, or resident question was created. No source is treated as proving live capacity, current emergency absence, future events, booking success, or account-specific status. The package changes no resident UI and requires no diagram topology change: it feeds the existing exact-version evidence and action boundary.

## Files

- `operations.json`: final per-source dispositions and exact claim/action recommendations.
- `operations-retrieval.json`: original live complete text and anchor evidence.
- `scripts/review-operations-fetch-20260914.js`: repeatable retrieval helper.
- `scripts/review-operations-decisions-20260914.js`: exact authored decisions and quote validation.
- `scripts/review-operations-pdfs-20260914.js`: read-only retrieval helper for PDF visual inspection; rendered inspection files are temporary under `tmp/operations-review`.

Notion synchronization and final release status are owned by the coordinating task; these artifacts must not be described as deployed by this subtask.

## Follow-up runtime safety fix

Root cause: exact-version canonical projections reconstructed approved claims outside the fact ledger's freshness predicate. Search penalized old source scores but did not prevent an approved canonical claim or action from remaining eligible after its source expiry. This could affect every current fee, contact, instruction, facility fact, and action using the canonical projection path.

`lib/community-source-answerability.js` now withholds a canonical projection when its source `staleAfter` is absent, invalid, or at/before the evaluation time. It withholds any matching ledger copy too, so a second representation cannot bypass the source expiration. Existing dynamic connector handling stays under its separate contract. No community-specific names, URLs, prices, or wording were added to runtime logic.

The resident consequence is that a stale rental price cannot be presented as verified or expose its unrefreshed booking action; exact-source revalidation can restore the approved version by renewing its expiry. Focused tests cover missing/empty/invalid/expired/boundary timestamps, fresh renewal, fresh-ledger-copy bypass, dynamic eligibility, search evidence, and final resident answer behavior. All 24 focused tests passed. Older approval-package tests revealed that some positive fixtures assumed an immediately-expired newly-approved source was already answerable without revalidation; the coordinator is updating those fixtures to represent an actual renewed source.

Redirected directory/news records preserve their originally assigned URL for audit traceability and record their actual current canonical destinations `/m/directory` and `/m/newsflash` for exact version approval. News self-link proof uses its canonical destination.
