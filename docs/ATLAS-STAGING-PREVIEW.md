# Sterling Ranch Atlas: staging prototype

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

Release checks: https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34768789499 . CI result is pending as this record is prepared; local quality stages and atlas checks passed as recorded above.

Notion synchronized: Design and experience reference, https://www.notion.so/3dabf909186d81b99d91ddd39861536b . The atlas section records the verified staging revision, preview link, tests, remaining review and explicit production-launch hold; the existing production reference was preserved.
