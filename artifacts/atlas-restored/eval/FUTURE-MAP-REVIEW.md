# Coming Soon map correction — local review, September 22, 2026

Status: implemented and verified locally; owner review pending; no staging or production launch.

The previous future-only fix routed both Coming Soon entry points away from the map to a project list. This correction retains a map-first experience using the existing complete saved-area artwork, with five graphic area guides and project details. Exact project coordinates are not invented: eight project roots have no saved coordinates; the other three inherit approximate parent/street references. Zebulon stays explicitly off-map. School and library remain village-level guides, not plotted construction sites. No saved facts or artwork were changed.

Actual browser checks on a 900 × 1200 desktop and 390 × 1200 phone:
- Coming Soon keeps the full illustrated map visible and all 11 future groups / 16 records reachable; current markers and directory cards have zero visible entries.
- Southwest Prospect stays in the overview. Labels do not overlap and the desktop intro card does not cover Prospect. Phone has no horizontal overflow.
- Main navigation, desktop map filter and phone Explore menu all reach the map-first view.
- Ascent selects four projects and animates area focus. Prospect area and phase details preserve the map; Whole Ranch clears focus.
- Coffee query has no future result; school query opens the school beside/below the map. The library drive-through child query expands its parent and focuses the requested heading.
- Zebulon is not assigned a made-up position; selecting it retains the overview.
- Returning to The neighborhood restores its 25 current destination cards, original illustration and markers. Desktop and phone screenshots inspected.
- Browser console contained no warnings or errors. Reduced-motion CSS inherited for camera motion; real OS preference emulation was not performed.

Astra reviewed the actual captures and final changes. Independent Terra review of desktop.png, mobile.png and school-mobile.png found no blocking overlap, clipping, current-place leaks or misleading exact pins. Terra independently reconciled future inventory and added five data/geometry tests. All 47 focused tests passed. The required visual evidence now includes a dedicated future-map desktop state, in addition to the phone future-only state.

Unchanged detailed models, Unfold layers, walking guide and neighborhood focus reuse the earlier passing evidence, explicitly recorded in visual-review.json. Existing artwork hashes, full coverage registry and approved comparison baselines remain pinned. This gate verifies evidence and scope; it does not automatically judge beauty. The owner's feedback on the list-only view supersedes that earlier UX acceptance.

Evidence: eval/evidence/future-map/{desktop,mobile,school-mobile,neighborhood-desktop,neighborhood-mobile}.png and browser-checks.json. Previous review remains in previous-focus-review.json.
