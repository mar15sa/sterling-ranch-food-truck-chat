# Planned villages and areas — September 23, 2026

Status: implemented and checked in local candidate 4199. Owner review pending. No staging or production deployment; 4198 remains available.

## Why the gap existed
Coming Soon was derived solely from 16 saved future listings / 11 project groups. None represented future villages. A separate planning inventory now adds all five future named areas on the official CAB master graphic, without changing the existing 101-record place catalog.

## Source reconciliation
- CAB master graphic: https://sterlingranchcab.com/DocumentCenter/View/416/Sterling-Ranch-Master-Graphic-PDF. Published graphic dated August 8, 2025; checked September 23, 2026. It says illustrative depiction only, subject to change.
- Current developer FAQ: https://sterlingranch.com/faqs/ — nine villages, four active.
- Current developer village directory: https://sterlingranch.com/villages/ — Providence, Ascent, Prospect and Parkvale are active. Future five are not named there.
- Current June 2026 map labels future development broadly; it does not supply five current village names. The CAB graphic is the explicit source for names and relative positions, not a promise of construction or opening.
- Paramount is labeled Center on the CAB map. It is not renamed Village in this implementation.
- Heritage Village and Heritage Regional Park are separate records. No project is assigned to a future village solely by a matching name.

Inventory: Heirloom Village (north), Paramount Center (north-central), Heritage Village (west-central), Promontory Village (southwest), Pinnacle Village (south/southeast). Opening dates remain null. No new surveyed coordinates, boundaries, buildings or amenities are invented.

Source PDF retained at eval/village-sources/master-plan.pdf, SHA256 3ebd17bc58ea156e9d04d173d6de937c10459dc82e51dec4a6d4440e01468afa.
assets/village-master-plan.jpg is a complete page rendering using PDFium at 0.5 scale, JPEG quality 92. SHA256 71e78415165e4410aa8c5cb2a0dda8c5c12138a465b42d882f6e134284698015. It retains the dated caption and complete extent. Number positions are graphic callouts inside colored planning areas, not coordinates or boundary assertions. No image generation used.

## Behavior
Coming Soon has two map layers: Future villages & areas (initial) and Parks & projects. All five areas have numbered buttons on the official plan and matching named controls. Selection highlights the area and opens sourced details. Phones scroll to the detail card and offer Back to this area on the map. Search finds future areas in both general and Coming Soon search. Selected area, layer, existing project area and project detail are shareable/history-restorable. Existing project nesting remains unchanged. Active villages appear only as orientation context in the official plan, never as coming-soon entries.

## Review and checks
87 tests pass, including the new inventory/search/history tests and rejection of village UI with missing or stale visual evidence.
Astra actual desktop (1440 x 1100) and phone (390 x 844) review: full official extent visible without crop; all five markers present; names readable in companion controls; selecting Paramount and Pinnacle visibly isolates their general area. Phone Heritage selection by Enter reveals full detail and Back to map restores the selected marker. Search for Paramount opens its planning detail; reload preserves selection. Switching an existing Providence project area to villages then reloading retains the village map. Existing project map has all 11 groups, including unlocated Zebulon, and no current destination list. No horizontal overflow or browser errors observed.

The new source map is a functional planning layer, not a claimed improvement to the approved miniature artwork. Its small embedded labels are not individually readable on phones; numbered controls, named list and original-PDF link supply access. Fine-grained future site models are not supplied by the available evidence.

Unchanged core illustration, place models, focus, Walks overview and Unfold evidence are reused within their existing scope. Their artwork hashes and full-saved-area coverage tests pass; no new owner approval, beauty score or baseline replacement is asserted. Fresh future desktop/mobile and selected screenshots are under eval/evidence/planned-villages. The gate additionally requires those three village-map states.

## Keeping the entries current
On the next inventory refresh, compare the developer village directory and FAQ with the CAB Community Maps / Sterling Ranch Development master graphic. Reconcile active vs future status, displayed label, map revision, opening announcements and any source-backed project association. Update checked date only after checking the sources. Retain previous source/review evidence; revise the graphic callouts if a newer plan changes locations. No scheduled monitor is enabled by this change and no facts are approved for the Community Assistant.

Documentation impact: update the existing Notion Design and experience reference Atlas section with local-only implementation, source distinction, exact feature revision and review evidence. Assistant diagrams and production operating guidance are unaffected.
