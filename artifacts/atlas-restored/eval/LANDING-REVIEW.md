# Landing experience review — September 23, 2026

Implemented local comparison: http://127.0.0.1:4203/. Previous 4202 preserved. No staging or production deployment; owner visual/launch approval not claimed.

## Problem and result

The initial screen started halfway down a large neighborhood image, preselected Sterling Center, and obscured most phone village labels. The Whole Ranch connection chooser also placed its text/buttons over the map. Earlier checks recorded that state existed but did not verify the chooser was readable and tappable.

The new landing is a neutral full-neighborhood composition. The complete unchanged miniature fits within the tested 1280×720 desktop viewport (map top 268px, bottom 682px). Phone at 390×844 shows all four village labels and derived place counts on the complete map (top 274px, bottom 509px). No destination is arbitrarily selected. One invitation asks residents to choose a village; search/activity shortcuts remain available. The welcome panel explains the depth of the catalog, shows 25 destinations/eight guides, and links directly to the full directory. Counts include unlocated listings; no new pins or coordinates were invented. Burns remains discoverable through search, shortcuts and the complete directory as a between-villages destination.

Village selection preserves the focus transition and reveals its places and connection action. Whole Ranch reset restores neutral entry and a clean URL. Existing place, future and route links remain. The Whole Ranch connection chooser uses normal document flow with all four choices above the ground image; actual center-point hit tests passed on desktop and phone. Selecting Prospect opens its real connection scene.

Phone 200% text also exposed two related problems: tab labels could run across each other, and a saved text setting captured the pre-view heading size during reload. Tabs now have adequate room; font baselines remeasure when view styles change. Browser evidence confirms a 24px heading becomes 48px and remains so after reload, with no horizontal page overflow.

## Verification

- 121 focused tests pass, including inventory, saved geometry, source/action information, deep links, navigation, model assets, display preferences and visual gates.
- New measurement tests reject below-fold/cropped landing maps, arbitrary selection, missing/overlapping village labels, obscured chooser controls and incorrect doubled text.
- Real desktop/phone initial screens and both Whole Ranch choosers captured in eval/evidence/landing-*.png. Measurements are in landing-measurements.json.
- Clicked Prospect village; checked its four-place card and focused map. Whole Ranch reset returned neutral.
- Phone chooser → Prospect connections worked. Atlas Coffee nested detail returned to the exact unfolded map and keyboard opener.
- Pool search retained access labels. Overlook deep link opened its loaded model. All eight overview walking routes remained, none muted initially.
- Compared the new opening with the actual 4202 first-screen audit and the unchanged approved neighborhood artwork/reference. Full illustration aspect and original source bounds are retained.
- Existing approved baseline files/scores were not changed. New neighborhood candidates and landing-specific evidence replace only affected candidate proof. Other 4202 journey/landmark/future screenshots are reused within their unchanged scope, explicitly recorded in visual-review.json.

## Boundaries

No facts, eligibility, routes, source positions or approved artwork changed. The full directory still includes entries without verified map positions. Existing operating/access/arrival unknowns remain explicit. This is browser QA, not physical-device or full assistive-technology certification. All geography remains illustrative; source maps remain available.

The previous full-plan acceptance record is historical for 4202. Its claim that the whole-Ranch prompt had been adequately reviewed is superseded by this defect and repair. A gate validates recorded evidence and measured conditions, not beauty or owner approval.

