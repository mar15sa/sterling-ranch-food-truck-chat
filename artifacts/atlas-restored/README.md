# Sterling Ranch Atlas — discovery on the full-area base

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
