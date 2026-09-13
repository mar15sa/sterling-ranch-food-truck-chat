# Atlas location and trail follow-up · September 13, 2026

Historical release record. The later [nested-place and walking-guide release](ATLAS-NESTED-PLACES-AND-WALKS.md) supersedes the location totals and trail behavior below. The comprehensive CI for this earlier revision subsequently passed: [34774072902](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34774072902), verified September 13, 2026.

Verified on staging September 13, 2026 at `c0a7d7c0d73e61dd8c3b732240f0d35ec7506f79`. The health endpoint reported ready at 18:16 UTC and the deployed catalog exactly matched the checked build. Page/catalog/script returned 200 with no-index headers on staging and 404 on production. Evidence: `artifacts/atlas/location-release-check.json`. Production launch remains unapproved.

The earlier pass reconciled directory names but stopped before completing location research. The 44 unlocated listings represented 22 parent places/projects and 22 child amenities. Finding an operator's embedded map was a useful next step that had been missed.

## Confirmed operator property markers

| Place | Longitude, latitude | Evidence and scope |
| --- | --- | --- |
| Broadstone Sterling Ranch | -105.07230747799973, 39.48329654419095 | [Operator amenities page](https://broadstonesr.com/amenities/), property JSON-LD coordinates. Six listings share this marker. |
| Prose at Parkvale | -105.0497721, 39.4819045 | [Operator neighborhood page](https://proseparkvale.com/neighborhood/), own-property marker repeated in five embedded neighborhood maps. Five listings share this marker. Map-center coordinates were not used. |
| Primrose School | -105.037713, 39.506356 | [School page](https://www.primroseschools.com/schools/sterling-ranch), school JSON-LD coordinates. Two listings share this marker. |
| John Adams Academy | -105.037912, 39.4855297 | [School site](https://www.jaadougco.org/), location metadata repeated for August 2026 campus events at the published 7979 Butte Creek Street address. One listing. |

These establish property locations, not verified visitor entrances. They use `operator-area` precision; child features share the parent's position. Directions remain withheld for these markers, and private apartment/school access labels remain intact. No new opening status or public amenity access is inferred.

The build now has 70 located listings at 15 shared map areas, with 30 directory-only listings representing 18 parent places/projects. All 100 listings and 25 held leads remain accounted for. Source registry: 60 references, with no automatic monitoring enabled.

## Remaining location work

Heritage Regional Park, Providence Regional Park, McCormick Park, Pioneer Park, Steve Bloom Park, Yard 27, Trailrock Park, Medley Park, Peekaboo Park, Outcrop Park, Sterling Gulch Wildlife Corridor, Cultural Trail, Elementary School 51, Community Library, Water Treatment Plant, Zebulon Sports Complex, Ascent Village Center and Willow Creek Wildlife Corridor remain unpinned, along with 12 attached amenities.

The October 2025 CAB illustration and June 2026 developer map provide useful orientation. Experimental alignment to known positions produced errors of roughly 20–150 metres, before accounting for text-label and leader-line offsets. No calculated positions from that experiment have been published. Park identities and streets must be reconciled before adopting area markers. Corridors need sourced lines/areas and access distinctions; a single invented pin would not complete trail coverage.

[Outcrop county planning record LE2025-011](https://apps.douglas.co.us/planning/projects/Default.aspx?PosseObjectId=99052311&PossePresentation=LocationAndExtentJob) and its [staff report/site plans](https://douglascounty.legistar.com/View.ashx?GUID=5D9142A5-33CA-49B0-B2CF-DF568B6B4562&ID=14582077&M=F) are promising next location sources, pending detailed site-plan review. A parent parcel or the owner's mailing address must not be treated as the park footprint. Census address lookup returned no matches for the new school/library, which does not prove their locations are unavailable elsewhere.

## Trail coverage is partial

The directory includes Willow Creek Trailhead, planned Cultural Trail, and the Sterling Gulch and Willow Creek wildlife corridors. Habitat corridors do not establish public walking routes. The saved background contains 364 OSM path fragments, including sidewalks; that is not a count of named trails or verified routes.

[CAB's trails page](https://www.sterlingranchcab.com/273/Trails) links an [existing parks and trails illustration](https://sterlingranchcab.com/DocumentCenter/View/2352), dated October 13, 2025. Its 30+ miles figure describes the completed development, not confirmed current mileage. Both links and the coverage limits are now visible below the staging map.

The county outdoors GIS has nearby regional routes but did not supply Sterling Ranch's complete internal CAB trail network in the inspected area. Remaining work: reconcile every illustrated segment to geographically grounded geometry, connect entrances and crossings, distinguish walking paths from sidewalks and habitat, establish current access and open/planned status, and derive distances only from verified connected routes. Do not infer accessibility or closure status from geometry alone.

No Assistant evidence, resident records, production navigation or production settings change. The [inventory guide](https://www.notion.so/3dabf909186d8164930fc37c1865c026) and [design reference](https://www.notion.so/3dabf909186d81b99d91ddd39861536b) were updated and fetched back to verify the counts, revision, sources and remaining gaps. The related Assistant diagrams are unaffected.

Validation: 11 focused Atlas tests, source/coverage reconciliation, deterministic catalog check and actual HTTP isolation passed. Desktop browser selection opened the new Broadstone marker and its access/location notes; 390 × 844 review had no horizontal overflow. The live staging browser showed 70 located listings and opened Prose's new marker with its address, private-access note and related features, with no browser errors. [Hosted comprehensive CI](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34774072902) was still running at this documentation checkpoint; earlier CI success is not attributed to this revision.
