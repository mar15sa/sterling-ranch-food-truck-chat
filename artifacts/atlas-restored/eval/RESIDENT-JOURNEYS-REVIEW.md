# Resident outings comparison preview — September 23, 2026

Status: implemented and locally reviewed; owner review pending. No production launch or shared-staging deployment. New comparison: http://127.0.0.1:4200/. Previous preview remains at http://127.0.0.1:4199/.

Started in an isolated feature worktree from main `9912734`. Imported only `artifacts/atlas-restored` from reviewed candidate `bd3b23607edbd1a7de30cf719c6590a9f9894686`. The exact candidate runtime fingerprint is recorded in `visual-review.json`; the design-guide entry records the final commit.

## Implemented

- Three primary tabs, global grouped search, cross-tab shortcuts and destination details reached from the map/search. Existing IDs, parent links and direct links remain.
- Structured operator/CAB source checks for the complete saved listing inventory. Public, resident, apartment and unconfirmed access labels appear before opening. Reservations are separate. Source dates, retained information and entrance uncertainty are explicit. No “Open now” claim.
- Walk filters use the upper end of the full loop/out-and-back estimate. All eight routes remain on the full map; unmatched routes dim. Start, finish, return, arrival and one-way information are grouped in each guide. No invented connections or extra combined-route times.
- Phone map starts at 297px at 390 × 844. Search stays available, primary controls measure at least 44px, and selected details/return actions are reachable without reopening a separate mode.
- Explore connections reveals the selected village or destination's nested amenities, illustrated walking guides and future additions. Whole Ranch first asks for a village. Ground map stays intact. Dotted membership lines differ from geographic paths; nearby suggestions explicitly do not establish connecting routes.
- Future projects begin on the approved neighborhood artwork. The wider plan shows five future areas in the official plan's approximate arrangement, with active villages as context and the original plan available under a disclosure. One combined future-only directory is ordered by status.
- Source-specific school opening/enrollment targets and current library project information are prominent.

## Review and regression protection

Coordinator reviewed actual desktop and phone screenshots, including the pinned neighborhood, Sterling Center and Overlook references. Original landscape/landmark artwork, source coordinates, full saved bounds, 101 listings, 25 current root destinations, all eight routes and all five future areas remain. The planning overview is an orientation diagram, not new cartography or a new model.

The eight resident journeys have recorded screenshot evidence in `visual-review.json`. The review gate now rejects missing/failed resident journeys in addition to its existing inventory, geometry, visual evidence and stale-runtime checks. Approved baseline files and scores were not changed. This gate validates the recorded review and hashes; it cannot automatically judge beauty or prove source facts.

Browser QA caught and fixed two real problems: future-area clicks selecting the project map instead of the wider plan, and closing a route losing keyboard focus after its controls were redrawn. Further review brought connection content directly into view and added a contextual map-return button. Shared Prospect/30-minute/selected-loop state survived reload, keeping all eight route paths present and muting six nonmatches. Planned-village clicks and direct links were exercised on desktop and phone.

The focused source/data/navigation/visual-gate suite passed after integration; exact output is in `resident-final-results.txt`. Browser checks and limitations are in `evidence/resident/browser-checks.json`. Existing artwork and model/source comparisons remain unchanged.

## Remaining information and device limitations

- A source check is not field verification. Most parking/accessible entrances, stroller suitability and some operating/access details remain explicitly unconfirmed. Property directions are labeled as property directions, never a verified entrance.
- Blocked operator pages retain their last checked date and clearly say the latest details were not reverified. See `SOURCE-PARKS.md` and `SOURCE-BUSINESS.md` for the per-source record. Overlook membership information remains dated September 21; some business notes remain dated September 13.
- Future dates are recorded targets, not guarantees. Future village opening dates and detailed construction phases remain unknown. Existing illustration and route alignments are approximate; original source maps remain available.
- Keyboard search, route-close focus return, empty results, phone control sizes and overflow were checked. Reduced-motion suppression was reviewed in CSS/interaction logic. This IAB did not expose OS preference controls or respond to zoom shortcuts; true reduced-motion-device and 200% enlarged-text checks remain a manual-device follow-up. Physical touch dragging and a full assistive-technology audit are not claimed.

Source facts remain local preview catalog data. Nothing was promoted to Assistant evidence, no resident questions were submitted, and no outreach, production settings or source approvals changed. Implementation approval and owner visual review remain separate from explicit launch permission.
