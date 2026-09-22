# Providence working miniature — verification

Verified locally September 21, 2026 (America/Denver). Status: implemented local preview, not approved final design, shared-staging deployment or production launch.

## Scope and isolation

- Feature branch: codex/atlas-providence-working-20260921.
- Fresh main base: ffe0850e3cc8766b9774259ed85489138e210fca.
- All changes are contained in artifacts/atlas-providence; production application code and deployment configuration are unchanged.
- Preview: http://127.0.0.1:4187/.
- Previous local comparisons on ports 4184, 4185 and 4186 remain available and returned HTTP 200.
- No resident questions were submitted; this helper does not implement application API routes.

## Focused automated evidence

Twelve tests passed, zero failed:

`node --test --test-isolation=none artifacts/atlas-providence/spatial.test.mjs artifacts/atlas-providence/catalog.test.mjs`

Coverage: coordinate projection and roundtrip, finite validation, source clipping and fully outside polygons, disconnected path boundaries, source coordinate preservation for seven destinations, Sterling Center/Overlook footprint containment, Primrose without invented footprint, nested hierarchy/search, source supplement merging, and explicit CAB pixel-route/future-location boundaries.

Syntax checks passed for app.js, scene.js and start-preview.cjs. The final scene-only adjustment replaces removed PCFSoftShadowMap with supported PCFShadowMap; a fresh rendered session had no captured browser console warnings or errors.

An initial out-of-window polygon crash was corrected and covered by a regression with the actual saved geometry. Earlier failed runs are not counted as passing evidence. No complete production release gate was run: this is an isolated static artifact, not a production candidate.

## Browser evidence

Desktop at the browser's normal 1265px width:
- Rendered 409 building footprints, 118 distinct mapped path features and seven destination labels.
- Reviewed the complete overview, settled Sterling Center opening and settled Overlook opening.
- Sterling Center's three selectable reveal groups work, including expansion of Health & wellness with the four providers.
- Search for coffee finds Ranch Social and Atlas Coffee; selecting Atlas Coffee opens its parent and displays the nested visit information.
- Overlook displays six nested amenities and current source-backed entry/membership guidance.
- McCormick Park keeps its playground and shelter within one parent listing.
- Both CAB guides open with correct source diagrams, endpoints, distances, estimated walking times and nearby-place controls. West route is 1.04 miles one way; Overlook route is 0.37 miles one way.
- Both future project cards display official-source status and links without invented map footprints.
- Whole-area reset restores the neighborhood; roof opening and return controls were exercised.

Narrow layout:
- The browser viewport override did not change this IAB surface's actual width. Instead, the same unmodified page was loaded into a temporary 390px iframe (375px content width after its scrollbar).
- Read-only DOM measurement confirmed scrollWidth 375 = clientWidth 375; screenshot review confirmed all seven destination labels fit the map, the two primary labels remain named and smaller labels become numbered circles. Controls and the stacked place guide fit below.
- Narrow-frame pointer actions were unavailable through the browser tool, so this verifies responsive rendering, not physical-device touch behavior. Desktop interactions were exercised separately.
- The temporary helper/tab were removed; the viewport override was reset.
- Reduced-motion and WebGL directory fallback are implemented and reviewed in code, but were not separately simulated in this browser.

## Local server evidence

All 16 allowlisted assets returned HTTP 200 with noindex/nofollow. POST returned 405, .git/config and /api/community/ask returned 404, and an unrelated Host returned 403. The server binds only 127.0.0.1.

## Source authority and limits

Saved catalog/geometry snapshot: September 13. Copied asset origin: 4e6c83f7b32143b340398d142a4f1573da700bdb.

New official-source reviews: September 21. See data/area-visit.json and SOURCE-UPKEEP.md. The reviewed CAB, DCSD and DCL pages supply visitor guidance, route publication, school and library status. These reviews do not confer owner approval or automatically publish changed facts.

The area is a crop of northern Providence, not full Sterling Ranch coverage. Heights, roof details and planting are illustrative. No surveyed elevations, entrances, interior floor plans, complete geographic trail alignment, accessibility assessment or live closure state is claimed. Source-shaped opening models reveal directory groups rather than room or suite locations.

## Documentation closeout

The design reference was updated and fetched to confirm implementation revision b77bde867bb77f2484f55c108b7f1184b3fb6ef0, this local verification scope, remaining limits and preserved comparisons:
https://www.notion.so/3dabf909186d81b99d91ddd39861536b

Notion synchronization verified September 21, 2026. The feature branch was pushed only as a backup; neither shared staging nor production was deployed. This closeout changes documentation only.

Authored-file whitespace checks passed. The unmodified upstream Three.js core retains one existing whitespace warning at its source line 49957; the vendor is preserved as supplied and licensed.
