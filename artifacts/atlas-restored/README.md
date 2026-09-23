# Sterling Ranch Atlas — walks in the landscape

## Walking coverage — September 23, 2026

Separate local preview: http://127.0.0.1:4195/?view=walks. The previous 4194 preview remains unchanged. No staging or production deployment.

Walking cards now share the main landscape artwork. Eight walking guides retain a separate route-shape inset and an optional official map. Forty recorded CAB mileage labels are browsable by village, with their printed mileages; these are sections, not forty named trails or a claim of complete current access. Six park/trail access entries and regional connection notes broaden discovery. The new guide names are descriptive editorial labels. See docs/TRAIL-COVERAGE-2026-09-23.md for evidence and limits.

# Sterling Ranch Atlas — connected visit journey

## Connected visit journey — September 22, 2026

Current separate local preview: http://127.0.0.1:4194/. Port 4193 remains preserved for comparison, and the earlier 4190 preview is also unchanged. No shared-staging or production deployment.

The 4194 local revision connects the full-area discovery view, selected-place navigation, limited photo-grounded feature buttons, and a clearer visit-information card. It is a local candidate for review, not a launch or owner-approved release. See [docs/VISIT-JOURNEY-2026-09-22.md](docs/VISIT-JOURNEY-2026-09-22.md) for its source limits and verification status.

The atlas now has 19 illustrated place models, up from four. Fifteen new assets depict thirteen neighborhood parks/trailhead sites, the Primrose facade and a Prose at Parkvale exterior detail, using specific official photographs. The model chooser includes every modeled place; selecting a place on the map or in the directory uses the same model. Official-photo toggles and short scope notes identify the visible part represented. These are dimensional raster illustrations, not rotatable meshes, measured reconstructions or current-condition guarantees. Playground details and partial facades are not presented as full site plans. Sterling Center retains its opening layers and nested business directory. Six current roots remain without a model, with exact evidence gaps tracked in data/models.json; all remain in the directory. No new map coordinates or source facts were invented.

Photo/model comparisons: /eval/model-references.html. New assets and reference files are pinned by the reviewed SHA-256 pairs in data/model-review.json. Tests prevent a required model disappearing, a source/model changing without a new review, or a future/child listing becoming a standalone model. The earlier full-area artwork and four model hashes remain pinned. Models preserve the identifying built features; planting, lighting and ground edges are illustrative. Unseen features stay in the sourced directory rather than being invented in the artwork.

The inherited dated notes below record earlier work. Their port numbers describe those preserved previews.

## Coming Soon map correction — September 22, 2026

The current local preview remains http://127.0.0.1:4190/. Its prior list-only version is preserved at http://127.0.0.1:4192/ and in the atlas-focus-worktree. Production and shared staging are unchanged.

Coming Soon now opens the same full-area artwork with five area guide buttons, a future-project detail card, and an index of all 11 project groups / 16 future records. Both navigation entry points and future search use this view. Choosing an area or project animates the camera toward its village or approximate existing parent; the map stays visible. These graphic area labels are not new project coordinates or construction footprints. Eight project roots have no saved coordinates. The three with coordinates inherit approximate parent/street-area references. Zebulon remains in a clearly labeled off-map row. Sources and future children are preserved, and a nested search result expands its parent plan. Current-place markers and directory are hidden only in Coming Soon; returning restores the existing map.

The fix changes no artwork or saved place facts. Map-first desktop and phone screenshots supplement the prior review, and untouched visual evidence is explicitly reused. See eval/FUTURE-MAP-REVIEW.md.

The dated section below records the previous iteration; its list-only Coming Soon design is superseded by this correction.

## Focus and separated layers — September 21, 2026

The newest separate local preview is http://127.0.0.1:4190/. Port 4189 remains unchanged for comparison. No staging or production deployment.

Selecting a village moves the camera to the extent of its positioned destinations and softly blurs the surrounding illustration. Selecting a map place moves closer to that destination. Labels retain a readable size. Whole Ranch clears focus and restores the full map; switching to saved source geometry preserves the selected target. Unlocated entries remain unpinned. The soft focus is a visual treatment around saved anchors, not a surveyed village boundary.

Unfold separates three independently animated planes over the terrain: four detailed destination models with nested-place actions, the three original CAB walking guides, and future project links. The previous single tilted backdrop with small cards is retained on 4189. Phone layers are stacked and scroll normally. Reduced-motion CSS removes transitions and layer animation.

Coming soon now opens a dedicated future-only view from either entry point. The current-place map, destination strip and full current directory are hidden. Search in that view uses future records only, including future children. All 11 future groups and 16 future records remain. Switching back restores the existing directory. No source facts or artwork assets were changed.

The evidence gate additionally requires desktop village/place focus, phone village focus and phone future-only captures. See eval/FOCUS-VISUAL-REVIEW.md for actual review and limitations. Earlier review records and screenshots remain unchanged; the owner-selected 4188 baseline remains pinned.

Separate local preview: http://127.0.0.1:4189/. The owner selected the 4188 artwork as the base on September 21, 2026 and authorized the agreed discovery improvements. That base, the older comparisons, shared staging and production remain unchanged. This is not a launch.

## What changed

The same full-area painting now has village orientation labels, meaningful amenity symbols, and filters for play, everyday stops, walks and future plans. A compact place card on the map opens nested amenities directly and offers relevant CAB walks. On phones this card sits beneath the complete image, so it cannot hide southwest Prospect. Phone filters use two labeled menus; the default view has four primary landmarks, with smaller places revealed by filters. Zoom and source controls sit below the artwork. At narrow desktop widths the place card stays above the southwest cluster. Parent places remain single markers; their playgrounds, shelters and businesses are nested.

Unfold the Ranch lifts three interactive information sheets above the illustrated neighborhood: places within the selected destination, a sourced nearby walking guide, and upcoming projects. Each sheet opens useful content. These are information layers, not surveyed physical layers or building floors. Browsers supporting same-document View Transitions connect a selected landmark portrait to its detailed model. Reduced-motion users get immediate changes; other browsers keep the existing fallback.

Walks opens a map-side choice of all three CAB guides. Each guide highlights its source-image trace and includes mileage, starting point, route steps, nearby places, and official links. Those traces are never projected onto the painting. Coming next shows grouped project cards; unconfirmed school, library and other sites remain unpinned. The separate full directory and existing detailed models are retained.

## Coverage and source limits

The complete saved map window is unchanged: west -105.077, east -105.02, south 39.477, north 39.518. It is not a surveyed development boundary. All 101 listings, 25 current roots (18 positioned, 7 unlocated), 16 future entries under 11 groups, and 3 CAB guides remain. School and apartment amenities are not presented as public playgrounds; private access is inherited by child listings. The Overlook card states its membership condition.

Check map placement retains the saved source geometry and actual marker coordinates. Village text is orientation only, not boundaries. Artwork and source geometry use distinct placement. CAB image coordinates remain separate from both. CAB's trails page still links the saved October 2025 map, verified September 21. This work is not a fresh certification of the entire inventory or current trail conditions.

CAB's specific Prospect facility listing describes the park and its amenities; the broader parks overview retains older construction wording. The visit notes disclose this conflict. A pool is not promoted into current Prospect features. References: https://sterlingranchcab.com/facilities/facility/details/Prospect-Park-9 and https://sterlingranchcab.com/335/Community-Parks.

## Run and review

- `npm test`: inventory, full-area geometry, nested discovery/access classification, preserved artwork hashes, and visual-gate failure cases.
- `npm run preview:review`: local development candidate on port 4189.
- `npm run check:visual`: validates fresh recorded visual review, screenshot hashes, exact runtime and full coverage.
- `npm run preview`: refuses startup unless the recorded gate passes.
- `/review.html`: current review status and before/after screenshots.

The owner's selection of the 4188 base is recorded in eval/baselines.json. Earlier 4186/4184 baseline evidence remains under eval/legacy-baselines.json. New interaction evidence is reviewed separately from those baseline states. A review pass means the preserved-base comparison and listed behaviors passed, not that the original broader ambition is complete or that the owner approved the new version.

Runtime changes invalidate the review. The landscape and four detailed model asset hashes are pinned in discovery.test.mjs; replacing them requires new owner direction. The older geometry/reference builder is retained for provenance but is not needed to run the preview. No new dependencies were installed. No Assistant evidence, resident logs, staging deployment or production settings were changed.

Implementation reference for progressive view transitions: https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition.
