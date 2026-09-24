# Wider planning map correction — September 23, 2026

The owner rejected the 4200 planning view: an empty landscape panel and overlapping name cards. The prior positive visual judgment for that composition was wrong and is withdrawn. This correction is local-only; implementation approval is not launch approval.

New local preview: http://127.0.0.1:4201/?view=future&futureMap=villages. Previous 4200 and 4199 remain unchanged. Fresh worktree from main 9912734; only the Atlas artifact from e8423b6325f69474be06bc547efd764008966436 was imported. The final commit is recorded in the Notion design reference.

## Cause and correction

The main view rendered a decorative empty panel while the actual source map was hidden inside a disclosure. Large absolute-positioned labels collided as the map narrowed. The screenshot-based review incorrectly accepted that loss of geographic usefulness.

The complete original CAB plan is now the always-visible map image, with its original aspect ratio and entire north-to-south extent. No image, boundary or road was generated or edited. The Atlas palette frames the document. Five compact numbered buttons mark approximate areas; corresponding names and long-range-plan labels are outside the geographic image. A full-size source-image link supports reading small source text. Selection keeps the entire map visible, highlights the number and matching name, and exposes the existing sourced detail. Phone selection brings the detail into view; Back to this area returns focus to the matching marker.

## Actual verification

Coordinator visually inspected the original source image and real browser captures at 1440 × 1050, 900 × 1050 and 390 × 844. All five markers are 44 × 44, inside the image and nonoverlapping at these widths. Complete source proportions are preserved. Five names appear separately and no name cards cover the map. No horizontal overflow. See `evidence/plan-repair/layout-checks.json` for browser-measured rectangles, and the adjacent PNGs for actual screenshots. Desktop Paramount selection and phone keyboard selection of Pinnacle opened correct details; return-to-map restored the selected marker. Existing school/project extent remains separate from the wider map.

New checks target the specific failure: source image in the visible map layer; compact numbers rather than large labels; all five readable list names; measured full-image aspect, loaded geography, marker bounds, nonoverlap and touch size. A recorded “pass” without these measurements fails the gate. These assertions still do not judge beauty or guarantee every possible viewport.

The approved neighborhood and landmark baseline assets are unchanged. Prior evidence is reused only for untouched neighborhood, landmark, walk and visit behavior. Wider-planning evidence and the future-villages resident check are replaced with fresh captures. The old rejected review is retained in `rejected-4200-planning-review.json` as history, not an approved visual baseline.

## Scope and limits

This restores geographic usefulness using the source document; it is not a new illustrated landscape. Small printed source labels are easier to inspect through the full-size link; the five interactive names remain readable without zooming. CAB's August 2025 graphic is an illustrative plan and not a current-construction, entrance or access map. Previously recorded source dates and operating uncertainties remain unchanged. No new source refresh, field verification, launch or owner acceptance is claimed.

No Assistant question, source approval, resident log, production setting or shared staging changed. The Notion design reference records the rejection and the correction separately.
