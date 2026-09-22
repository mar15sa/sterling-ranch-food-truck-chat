# Source upkeep for the first working area

This preview uses saved, reviewable files. It does not silently replace approved facts, automatically promote new source content, or publish to production. Existing review states remain in the copied catalog; September 21 additions are marked `preview-source-review`.

| What to review | Primary source | Suggested review cadence | Local file |
| --- | --- | --- | --- |
| Sterling Center directory and tenant changes | [Developer Sterling Center](https://sterlingranch.com/town-life/sterling-center/), [CAB Sterling Center](https://sterlingranchcab.com/275/Sterling-Center) | Weekly | data/directory.json |
| Coffee, drinks, market and events | [Ranch Social](https://sterlingranch.com/town-life/ranch-social/), linked operator pages | Weekly; check operator before visits | data/visitor-notes.json |
| Overlook access, guest rules, facility use | [CAB Overlook](https://sterlingranchcab.com/Facilities/Facility/Details/Overlook-Clubhouse-1), [rental agreement](https://sterlingranchcab.com/DocumentCenter/View/1938) | Weekly and at seasonal changes | data/area-visit.json |
| Park facilities | [CAB facility directory](https://sterlingranchcab.com/Facilities), the per-place source links | Monthly and after facility notices | data/places.json; data/area-visit.json |
| Existing trail map and route lengths | [CAB Trails](https://www.sterlingranchcab.com/273/Trails), [existing-trail PDF](https://sterlingranchcab.com/DocumentCenter/View/2352) | Monthly; closures need current CAB notices | data/trails.json; assets/cab-trail-map.png |
| New elementary school | [DCSD school project](https://funding.dcsdk12.org/2024-bond/school-construction/elementary-school-in-sterling-ranch) | Weekly while construction/enrollment progresses | data/area-visit.json |
| Library development | [DCL building updates](https://dcl.org/build/) | Weekly during construction | data/area-visit.json |
| Horizontal map geometry | [OpenStreetMap](https://www.openstreetmap.org/copyright) and separately checked official plans | Refresh for the next area expansion and material construction changes | data/geography.json; area.json |

These are proposed review intervals, not scheduled jobs. No automation or hosting was added by this task.

## Updating a saved record

1. Read the current official source and compare the exact relevant facts with the saved record. Do not treat a generic HTML change as a facility-status change.
2. Keep parent relationships, source links, review state, source publication date and the date of review. Update only fields the source supports. A new source claim is not an owner approval.
3. Use the correct scope: clubhouse hours do not establish pool hours; rental access does not include pool use; a trail junction is not an entrance; a project address is not its footprint.
4. Replace a CAB map image and its pixel traces together. The saved trace coordinate space is 1242×2000 source-image units; the PNG is 2483×4000 and is scaled into those units. Do not blend the trace into OSM geography without a documented geographic alignment.
5. For geometry refreshes, retain coordinates and source feature IDs. Recheck that Sterling Center way `675524539` and Overlook way `1285399278` contain the catalog anchors; do not match Primrose to a nearby house. Heights and planting remain illustrative.
6. Run the focused geometry/catalog tests and visually check affected places/routes. Record the new revision and preview status in the design guide. Production promotion requires its separate, explicit launch approval and release checks.

## Current evidence and gaps

- Geometry: saved September 13, 2026. New preview scope and footprint containment reviewed September 21, 2026. No new survey or live whole-area geometry refresh was performed.
- Overlook, Providence Park, CAB trail-map listing, school and library: official sources reviewed September 21, 2026.
- Sterling Center directory and Ranch Social visit notes: inherited September 21 source supplements. Earlier catalog records retain September 13 review dates; the UI does not represent them as freshly audited.
- No route-to-OSM alignment, exact entrances, accessibility/grade verification, real-time closures, surveyed height, Primrose footprint or school/library footprint is supplied.
- CAB's trail image remains its October 13, 2025 map. Its school/future labels are historic; current project status comes from the operator cards, not that background image.
