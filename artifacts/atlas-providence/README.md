# Providence working miniature

Status: **implemented local preview**, September 21, 2026. The owner authorized building the first geographically credible working area after the visual study. This is not final design approval or a launch. No shared staging or production deployment was performed.

## Open and compare

- This version: http://127.0.0.1:4187/
- Preserved visual study: http://127.0.0.1:4186/
- Preserved neighborhood/full directory: http://127.0.0.1:4185/atlas/opened/index.html
- Preserved earlier models: http://127.0.0.1:4184/atlas/opened/index.html

Run `node artifacts/atlas-providence/start-preview.cjs`. The helper is loopback-only, serves an explicit allowlist of static assets and never starts application jobs, API endpoints or resident-question logging. No package installation or build step is needed. Vendored Three.js retains its MIT license and provenance.

## What works

- One coordinate-based neighborhood scene with 409 saved building footprints, 118 distinct mapped path features, streets, park polygons and the Overlook pool within the chosen crop.
- Seven destinations and 38 nested listings: Sterling Center, The Overlook, The Lawn/Providence Park, Primrose, Pioneer, Pat Gallagher and McCormick.
- Sterling Center and Overlook model footprints use the matched OSM source polygons. Opening them moves the camera into the scene, lifts the roof and reveals selectable directory groups. Parent and child listings stay attached to their actual destination, not a guessed room.
- Search finds nested businesses/services/amenities, opens their parent model when available, and shows sourced visit information and operator actions.
- Rotation, zoom, north-facing view and whole-area reset. Labels follow the source anchors and shift for legibility. Keyboard controls: left/right arrows, +/- and Home on the map.
- Walks & paths highlights OSM linework and offers two CAB route guides with printed distances, estimated times, start/end descriptions, source-map diagrams and nearby places. The CAB traces are intentionally not presented as surveyed OSM routes.
- School/library project cards are separate from currently open destinations. Their dates and status come from official operator sources; future buildings are not positioned without verified geometry.
- Phone layout, keyboard-accessible place controls, reduced-motion behavior and a directory fallback when the 3D view cannot initialize.

## Geographic and visual boundary

`area.json` specifies the crop: west −105.0410, east −105.0300, south 39.4995, north 39.5082. The board edge is a view window, not a neighborhood or property boundary. All root coordinates are unchanged from the saved catalog. Context geometry is the September 13 OSM snapshot; clipping introduces only intersections with the crop boundary.

Source footprints fix horizontal location and shape. Heights, gables, facades, colors, shadows and decorative planting are illustrative. No surveyed terrain elevation, entrance coordinates, interior floor plan or true planting inventory is claimed. The source contains no matched Primrose building: it remains an anchored listing, rather than being assigned a nearby house.

The current step is the first working area, not the full Sterling Ranch rollout. Remaining geographic areas, complete route alignment, verified building/site details and final art-direction refinement remain ahead. The existing 101-record directory remains available in the preserved earlier comparison.

## Sources and validation

Copied data and vendor files originate from the preserved Atlas preview (`4e6c83f7b32143b340398d142a4f1573da700bdb`). New official-source notes are in `data/area-visit.json`. [SOURCE-UPKEEP.md](SOURCE-UPKEEP.md) records which sources control each type of claim and the review process. It does not enable automated fact publication.

Focused check:

`node --test --test-isolation=none artifacts/atlas-providence/spatial.test.mjs artifacts/atlas-providence/catalog.test.mjs`

The twelve tests cover coordinate projection and roundtrip, crop clipping including actual out-of-window source polygons, malformed/degenerate geometry, footprint containment, unchanged destination coordinates, nested hierarchy/search, source-supplement merging, and route/future-location boundaries.

Final browser, local HTTP and documentation evidence is in `VERIFICATION.md`. No production candidate exists, so the production full-release gate is not applicable to this isolated artifact. Source review does not upgrade catalog approval status.

Design reference: https://www.notion.so/3dabf909186d81b99d91ddd39861536b
