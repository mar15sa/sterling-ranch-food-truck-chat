# Sterling Ranch Atlas: staging prototype

## Nested destinations and walking guides: September 13, 2026

Implemented and locally verified; staging release verification pending. The directory now presents 33 destinations containing all 100 searchable records. Related playgrounds, shelters, tenants and future phases expand inside their parent rather than appearing as 100 peer cards. Search and category matches remain discoverable, including grandchildren under Sterling Center. McCormick, Pioneer and Yard 27 gained CAB-reconciled park-center markers: 78 listings share 18 map areas, while 22 listings across 15 places/projects remain directory-only.

The new Trails view includes a browsable official CAB trail map and three source-checked walking guides: Prospect's 0.38-mile inner loop, Providence's 1.04-mile west greenway and the 0.37-mile Titan Road–Overlook link. Each has a highlighted path, distance, walking-time estimate, start/finish, steps and nearby places. These are schematic guides on the published map, not GPS navigation. Current School 51 and Prospect annotations replace older source-image labels. Thirteen focused tests, reproducible catalog checks and actual HTTP staging/production isolation pass; local desktop and phone browser review passed nested navigation and the walk experience.

[Implementation and review](ATLAS-NESTED-PLACES-AND-WALKS.md) · [Three proposed visual directions](ATLAS-NEXT-DESIGN-DIRECTIONS.md). Visual concepts remain proposals. Production launch remains unapproved. Earlier sections below are dated release history, not current counts or current trail behavior.

## Location and trail correction: September 13, 2026

Verified on staging September 13, 2026 at `c0a7d7c0d73e61dd8c3b732240f0d35ec7506f79`, ready at 18:16 UTC. Four operator property markers add Broadstone, Prose, Primrose and John Adams Academy: 70 located listings at 15 shared map areas, with 30 listings across 18 places/projects still directory-only. These are operator property positions with entrance checks outstanding; attached private amenities retain their access labels. The 100-listing catalog is unchanged in scope. The registry now contains 60 sources. The deployed catalog matched the checked build exactly; Atlas page/catalog/script remained 404 on production. The live browser showed 70 located listings and opened Prose's new marker without errors. Release evidence: `artifacts/atlas/location-release-check.json`.

The page now explains that trail coverage is partial and links CAB's dedicated trail page and dated October 2025 map. Background paths include sidewalks; corridors do not establish public walking routes. Connected routes, distances, entrances and open/planned segments remain unfinished. [Evidence and remaining work](ATLAS-LOCATION-AND-TRAIL-AUDIT.md).

Validation: 11 focused Atlas tests, inventory reconciliation and actual staging/production HTTP isolation pass. Local desktop marker selection opened Broadstone with its address, private-access note, operator-location caveat and related amenities. Phone-sized 390 × 844 review found no horizontal overflow; trail links were present and no browser errors were reported. Earlier broad CI evidence below covers the earlier revision only.

## Current expansion: September 13, 2026

Verified on staging September 13, 2026 at `ed1f2c19e3a19b0140dfca9e193d943326a138e7`. Marissa requested a third completeness check, specifically pickleball, and asked that staging reflect the full supported list. Production launch remains unapproved.

- 100 searchable listings: 43 places/projects, 49 child amenities, 6 future phases and 2 recurring uses. All 125 research IDs are accounted for exactly once as a listing or one of 25 held leads. Eight home-business leads remain permission-pending and absent from place cards.
- Sources increased from 56 to 58. Seven additions cover three park shelters, private apartment EV charging, two library features and Willow Creek Wildlife Corridor. Six official baseline lists are fully reconciled, without claiming every unnamed physical feature has been discovered.
- Burns Park Pickleball Courts is first in the directory, with a quick-find button, eight-court description, weekday/weekend hours, parking, equipment reminder and official CourtReserve link. Added school/playground shortcuts, a Schools & services filter, parent-place navigation, useful visit notes and explicit unresolved details.
- 56 listings share 11 sourced or explicitly approximate map areas. Four CAB-described street areas use saved OSM junction geometry; child features share parent markers. Forty-four entries are directory-only. The saved background remains incomplete, with a prominent official full-plan link; it is not a community boundary.
- Rebuild with `node scripts/build-atlas-preview.js`; verify with `--check`. Research facts remain separate from approved Assistant evidence. The staging-only server guard is unchanged.

Local checks: 11 Atlas tests, all 125 research records and actual HTTP staging/production isolation pass. Desktop and 390 × 844 browser review confirmed shortcuts, court and school details, planned status, directory-only labeling, parent navigation, held-lead disclosure and no horizontal mobile overflow or browser errors. The complete `npm run check` finished with exit 0: all 793 tests, rules checks/evaluations, 122-question resident corpus, 249-question Assistant evaluation with zero regressions, and source retrieval 20/20. Pre-existing expired evidence used the earlier disposable revalidated snapshot; approved evidence files were unchanged.

At 17:47 UTC, the staging health endpoint reported this exact revision and `deploymentReady: true`. The page, catalog and script returned 200 with no-index headers; production counterparts returned 404. The deployed catalog contains 100 listings, 56 located entries, 11 shared map areas and 25 held leads. A live browser check confirmed the 100-listing banner and opened the new pickleball card, including hours, parking and CourtReserve action. HTTP evidence: `artifacts/atlas/expansion-release-check.json`.

Hosted CI: [34772515545](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34772515545) completed successfully, verified September 13, 2026. Notion inventory and design sections have been updated and fetched back to verify the deployed revision, completed checks and scope. No Assistant diagram change is needed: this is a separate staging page and dataset, with no source-approval or answer-flow changes. No Assistant HTTP questions or messages were submitted.

The sections below retain the first edition and initial research history.

## Authorization and release boundary

On September 13, 2026, Marissa approved starting the illustrated atlas direction: a geographically grounded map with subtle depth, selectable places, categories, and an optional separated-layer view. She explicitly required all work to stay in staging until she approves launching the new page. This is approval to build and stage a prototype, not production design or launch approval.

Route: `/atlas`. All page files, scripts, styles and map data are in `public/atlas/`. `lib/atlas-preview.js` allows these routes only when the server's `RAILWAY_ENVIRONMENT_NAME` equals `staging`. A request header, query parameter, browser hostname, or production hostname cannot enable it. Responses carry `X-Robots-Tag: noindex, nofollow, noarchive`. No existing navigation or homepage links are changed. Do not remove this lock, link from production, or merge the atlas into a production launch without Marissa's explicit approval.

The scheduled source-only release workflow copies only its three named community evidence files to main. It does not promote this page or this server change.

## First edition

- 24 directory entries; 13 entries have sourced map coordinates, grouped into 6 shared locations.
- Illustrated vector geography comes from a bounded OpenStreetMap extract. Roads, paths, water, park shapes, and available building footprints are saved locally. There is no tile service dependency or runtime geocoding charge.
- Atlas and overhead views, optional separated place layers with leaders to their ground locations, zoom/reset, mouse panning, touch panning after zoom, keyboard map controls, category filters, and text search.
- Place cards show source links, review date, amenities, status, and relevant links. Multiple businesses at Sterling Center share a location. Planned work at Burns and Prospect uses the existing facility as an explicitly labeled reference point, never a claimed future boundary.
- Unknown coordinates remain directory-only. Directions are limited to facility records with sourced addresses. Park-center and future reference markers do not generate directions.
- Neighborhood makers has an honest empty state. No businesses, consent, home addresses, or pickup locations were invented. Suggestions open an email draft using the site's existing published feedback address; no automatic message is sent and no new submission storage is introduced.

## Content sources and authority

The inventory is a separate staging-review dataset. It does not approve any source or fact for the Community Assistant, change the reviewed community index, or read resident questions.

- Parks: https://sterlingranch.com/town-life/parks-rec/
- General plan context and June 2026 map: https://sterlingranch.com/whats-next/ and https://sterlingranch.com/wp-content/uploads/2026/06/Sterling-Ranch-Community-Map-June2026.pdf
- CAB facility map coordinates: Prospect Park, Ascent Village Pavilion Park, and Pickleball Courts at Burns Park facility records, linked individually in `public/atlas/places.json`.
- Sterling Center and its coordinates: https://sterlingranch.com/town-life/sterling-center/
- Atlas Coffee, Salta, Agora: https://www.atlascoffees.com/locations
- Zebulon stage of work: https://www.douglasco.gov/zebulon/
- OSM footprints and Pat Gallagher/Overlook positions: https://www.openstreetmap.org/copyright

All entries retain `reviewState: staging-review`, source links, checked date, review cadence, location provenance and location precision. The date means the source was checked, not that the owner approved publication. Future source checks become due after 14 days; other entries after 30 days. A due record is labeled for rechecking in the card. There is no automatic fact publication or refresh in this version.

Building heights are illustrative. Village labels indicate general areas, not exact boundaries. OSM contains older business names, so those names are not imported into the directory. Prospect sports-court descriptions differ between CAB and developer pages; the card calls out that conflict. The outdoor pool is labeled seasonal rather than currently open. No future opening date is treated as guaranteed.

## Before a proposed launch

1. Review the visual prototype with Marissa and refine the model/layer presentation.
2. Confirm the remaining 11 place locations; verify village labels, facility entrance points, and map coverage. Add additional amenities and businesses from reviewed sources.
3. Confirm development footprints from current county/CAB planning documents and separate individual phases. Review the Prospect court conflict and the library/park opening targets.
4. Collect owner permission and preferred public location information for home-business listings.
5. Continue accessibility and device coverage before launch: real touch dragging, reduced-motion interaction and 200% text zoom remain to be checked. The initial desktop and 390px mobile browser review passed search, no-results and makers states, business/future cards, separated layers, overhead view, zoom and Escape focus restoration. Map labels remain an area for further visual refinement.
6. Run the project's release checks on the final candidate and get explicit new-page launch approval. Only then propose production navigation and the removal of the server lock.

## Verification record

Initial implementation: September 13, 2026, on `codex/sterling-atlas-20260913`, based on staging revision `f6358a0861efb854b075d912c61eb3f3f45425e0` in an isolated worktree.

- Eight atlas core tests cover deployment isolation, encoded/direct route variants, inventory validation, future statuses, co-location, direction/link safety, owner consent, and freshness.
- `scripts/check-atlas-http.js` checks the actual server for staging availability and production 404s, including a spoofed staging Host and direct data/asset paths. Existing homepage, pool and openings routes also respond successfully. No questions are submitted.
- The first general quality check stopped at pre-existing expired Assistant evidence. The established revalidation script wrote a disposable test snapshot; approved source content was not changed.
- The broad local gate passed 790 tests, rules evaluations and the resident corpus before the local app session ended during the remaining Community Assistant evaluation. Only the interrupted evaluation and subsequent retrieval check were resumed; both passed. The final evaluation recorded zero regressions across scored questions and controlling-source retrieval passed 20/20. These results cover the complete local quality stages across the initial and resumed runs.
- September 13 browser review used the local staging-only server. Desktop and 390 × 844 layouts were inspected; no horizontal page overflow appeared on mobile. Business and future cards showed source links and the draft-review notice. Escape closed the future card and restored focus to its directory entry. Search's accessible label was corrected and rechecked. No browser errors were logged. Atlas tests and real HTTP isolation checks passed again after that HTML change.

## Verified staging deployment

On September 13, 2026, staging reported revision `a228cd2e8df1db9b35bf25257d99a460b37a6929` and `deploymentReady: true`. The page is available at https://sterling-ranch-food-truck-chat-staging.up.railway.app/atlas . The page, `places.json` and `atlas.js` returned HTTP 200 with `X-Robots-Tag: noindex, nofollow, noarchive`; the corresponding production routes returned 404. A browser visit confirmed the staging banner, loaded map and directory, and clicking the Sterling Center circle opened the Atlas Coffee card without browser errors. No Assistant HTTP questions or emails were submitted.

Release checks: https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34768789499 . The run completed successfully, checked September 13, 2026. Local quality stages and atlas checks passed as recorded above.

## Inventory follow-up, September 13, 2026

Marissa's initial review liked categories, search, the directory and clickable details. Requested follow-up: a more distinctive map, specific and useful place details, full-community coverage and a much more complete inventory with maintainable sources. The next work focused on research: [master inventory](ATLAS-INVENTORY.md) and [source/coverage maintenance plan](ATLAS-SOURCE-MAINTENANCE.md). The research inventory is separate from the 24-entry staging catalog; no runtime or production deployment is part of this follow-up. The map's rectangular background is not the full development boundary. Current CAB now has an explicit Prospect basketball-court listing; omission from a shorter developer description alone does not prove a conflict.

Notion synchronized: Design and experience reference, https://www.notion.so/3dabf909186d81b99d91ddd39861536b . The atlas section records the verified staging revision, preview link, tests, remaining review and explicit production-launch hold; the existing production reference was preserved.
