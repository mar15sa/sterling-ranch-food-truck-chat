# Nested places and walking guides · September 13, 2026

Verified on staging September 13, 2026 at `4b2ac57d1dde197f984023b544a7ab320b3723b7`. The health endpoint reported this exact revision ready at 19:20 UTC. The deployed place/trail catalogs and source image matched the checked local build. All eight checked Atlas page/data/script/style/image paths remained 404 on production. [Release evidence](../artifacts/atlas/walks-release-check.json). Production launch remains unapproved.

## Resident problem and change

The directory treated every parent, playground, shelter and phase as a peer. Trail information was primarily a disclaimer and outbound links. This affected all multi-amenity destinations and residents trying to plan a walk.

The new default directory has 33 parent destinations. All 100 records remain reachable through nested disclosures, inline amenity details and search. Search/category results put matched descendants under the correct parent, including grandchildren such as Atlas Coffee under Sterling Center. Parents and marker numbers stay consistent. Future matching does not promote existing amenities into planned items.

McCormick, Pioneer and Yard 27 now use park polygon centroids reconciled against CAB street descriptions. This locates 78 records at 18 shared map areas; 22 records across 15 places/projects remain unlocated. CAB's reused map links were checked: Pioneer incorrectly points at McCormick and Climbing Park points at Basketball Park. Those links were not used as evidence for the wrong park. Trailrock remains unresolved.

## Walking guide

A separate Trails view contains three selected walks, each with a highlight on the official map, approximate published mileage, start/finish descriptions, steps, walking-time estimates and links to nearby parent places. The full CAB trail map is browsable inside the same explorer.

| Walk | CAB distance | Guide treatment |
| --- | --- | --- |
| A lap around Prospect | 0.38 mi | Closed inner loop. Roughly 8–12 minutes at 2–3 mph, before stops. |
| Providence’s west greenway | 0.69 + 0.35 = 1.04 mi | Titan Road west-edge junction to Xcel corridor. Approximately 2.08 mi if retracing. |
| Titan Road to the Overlook | 0.37 mi | Eastern curved trail to the clubhouse-side junction, not a confirmed clubhouse entrance. Approximately 0.74 mi if retracing. |

The existing-trail depiction and mileages come from [CAB's map](https://sterlingranchcab.com/DocumentCenter/View/2352), which [CAB's trail page](https://www.sterlingranchcab.com/273/Trails) currently links. Source map date is October 13, 2025. The map's older school/Prospect labels are replaced by explicitly sourced current annotations. Other original plan labels retain the source-map date context.

The drawing is a schematic in source-image coordinates, not a GPS dataset or turn-by-turn navigation. No mileage is measured from the illustration. The route names are descriptive guide labels. Public access, gradients, surfaces, current closures and accessible entrances are not inferred from a line on a map. Existing access notes for private facilities stay with their cards. Nearby places are offered as separate activities, not assumed trail entrances.

Research found that the official PDF's entire map is a raster image; its vectors are label/callout overlays. No exact trail centerlines can be extracted from that PDF. The earlier experimental OSM graph found disconnected paths; it was not used to invent road crossings. The source image is rendered at 4000 pixels high for readable zooming and is loaded only when Trails is opened.

## Boundaries and failure behavior

Place grouping is source-independent shared logic driven by parent IDs. Trail content lives in `data/atlas/trails.json`; the deterministic preview builder produces the served copy. The separate trail view has its own loading/error/retry state, so a trail-source failure does not remove the place directory. It offers no GPS download or unsupported directions. Atlas source/review state is separate from approved Assistant evidence.

Thirteen focused tests pass, covering parent grouping, descendant search, planned filtering, record conservation, source provenance, distances, connected segments, closed loops and directions limits. Real HTTP isolation checks pass, including the new trail data, scripts, stylesheet and image. Local desktop and 390 × 844 browser review verified all three walks, nearby-place navigation, McCormick's nested amenities, playground search and the deeper Sterling Center → Ranch Social → business hierarchy. Phone walk choices use full-width rows and have no horizontal overflow. Review caught and corrected hidden grandchildren, unbounded trail panning and stale browser assets. Trail data now validates required display fields, and the map stays within the image when panned. Exact deployment evidence is recorded above. No resident questions or messages were submitted.

## UI brainstorming and documentation

[Three proposed directions](ATLAS-NEXT-DESIGN-DIRECTIONS.md): illustrated places that open into their amenities (recommended), walks with useful stops, and a Now / What's coming landscape. These concepts have not been approved for production or presented as completed visual redesigns.

Owner guide update targets: [Atlas inventory](https://www.notion.so/3dabf909186d8164930fc37c1865c026) and [Design reference](https://www.notion.so/3dabf909186d81b99d91ddd39861536b). Both pages were updated and fetched back to verify the exact staging revision, counts, trail behavior, proposed visual directions and production-launch hold. Unrelated owner content was preserved. The Assistant flow and source-approval diagrams are unaffected.

Deployed browser review confirmed the new Trails view, the highlighted 1.04-mile Providence route, and a transition from that walk to McCormick's parent card and expandable playground/shelter. No browser errors were reported. [Browser review record](../artifacts/atlas/walks-browser-review.json). [Comprehensive CI](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34777335328) completed successfully, verified September 13, 2026; [saved result](../artifacts/atlas/walks-ci-result.json). Both Notion pages were fetched again after recording the completed checks.
