# Neighborhood Atlas rebuild — September 21, 2026

## State and review boundaries

Implemented as a local design preview on `codex/atlas-neighborhood-rebuild-20260921`. The owner explicitly requested the neighborhood composition rebuild after reviewing the previous version. Production launch remains unapproved. Neither shared staging nor production was changed.

- New local preview: http://127.0.0.1:4185/atlas/opened/index.html
- Previous local comparison, preserved: http://127.0.0.1:4184/atlas/opened/index.html
- Existing published `/atlas`, `/atlas/concepts.html`, and `/atlas/opened/index.html` comparisons remain unchanged.
- Clean base: `origin/main` at `113f25d`. Necessary Atlas data, pages, assets, helpers and tests were imported from the earlier feature snapshot `45d3ed6`. No experimental staging merge or previous server implementation was imported.
- The only server change is the Atlas staging-environment guard. It prevents the imported static files from becoming public if this branch is ever deployed with production configuration.

## Experience

The neighborhood uses the full page width. Mapped roads, buildings, parks, paths and water share one rendering style. The four detailed destinations have small geometric landmark symbols anchored at their catalog locations, replacing the unrelated image cutouts in the neighborhood scene. Full photo-informed destination studies remain available through “Explore up close.”

“Open the layers” separates outdoor geometry, places and amenities, and future reference areas. Category controls emphasize a layer and change the guide below the map. Village labels supply orientation; they are not drawn as invented boundaries. Selecting a place retains the map and opens its children in an inline inspector. Search still reaches nested businesses and amenities.

The neighborhood guide includes all 25 current destinations, grouped into Providence, Ascent, Parkvale, Prospect, and Around the Ranch. Eighteen have mapped references; seven remain available without a position. The merged directory still contains 101 listings under 33 destinations, including 17 descendants of Sterling Center.

Outside shows the three existing CAB walking guides, route shapes, published distances, estimated walking times and nearby places. Future browsing preserves 16 future records in 11 groups. Only Burns' later phases, Prospect's later phases and Willow Creek's repair station have map reference areas. Every other future project stays discoverable in the guide without a guessed location.

## Source limits retained

- Geometry is the saved OSM window, not the whole development boundary. It has no measured elevation data. The official full community plan remains linked.
- Geometry contains 805 building footprints, 509 road features, 364 path features, 124 stream features, 14 park features, seven pitches, one pool and eight water areas. Features crossing the mapped window are clipped. Counts describe mapped features, not verified amenities.
- Buildings' heights and the enlarged landmark symbols are illustrative. The model does not establish entrances, room locations or physical amenity positions.
- Background paths include sidewalks and are not all verified walks. The three guides use shapes traced on CAB's October 13, 2025 source map; they are not GPS navigation. Nearby places are not verified route entrances or guaranteed stops.
- Routes remain Prospect's 0.38-mile loop (8–12 minutes), Providence's 1.04-mile one-way greenway (21–32 minutes), and the 0.37-mile one-way Overlook link (8–12 minutes). Walking times assume two to three mph and exclude stops.
- Existing source dates and project statuses remain intact. This design work is not a fresh source audit, does not enable monitoring, and does not promote Atlas records into Assistant evidence.

## Verification

- All 28 focused Atlas tests pass, including five new reconciliation tests for destination coverage, future groups, exact route membership/distances, invalid nearby references and Sterling Center descendants.
- Actual loopback HTTP checks: all 28 opened-preview files return 200/noindex in staging configuration and 404 in production configuration, including when the request spoofs the staging hostname. No deployed staging environment was used by this test.
- Desktop browser checks cover layer switching, current-place selection with the map retained, Sterling Center's grouped directory, McCormick's playground/shelter and full details, the Providence walking guide, 11 future groups, and “pickle ball” search.
- Phone review at 390 × 844 confirms no horizontal page overflow, readable inline Prospect details with eight amenities, route cards, and transition into the retained detailed Prospect model.
- No resident questions were submitted. Assistant runtime behavior and production settings were not changed. A full Assistant release gate is outside this isolated local design preview's scope.

## Documentation impact

The design and experience reference needs a dated local-preview entry with the final implementation revision: https://www.notion.so/3dabf909186d81b99d91ddd39861536b. Synchronization will be recorded after the implementation commit and readback. The Assistant flow, source-authority diagram and operating permissions are unaffected.

Broader source verification, whole-development geometry, additional verified walks and owner visual approval remain prerequisites to proposing a public launch.
