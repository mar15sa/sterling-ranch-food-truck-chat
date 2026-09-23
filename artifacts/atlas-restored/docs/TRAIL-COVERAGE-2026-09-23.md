# Walking coverage and visual consistency — September 23, 2026

Status: separate local candidate at http://127.0.0.1:4198/?view=walks. Previous 4197 preserved. Owner review pending; no staging or production deployment.

## Current overview behavior

All eight walking routes appear on the full approved 3:2 neighborhood illustration as soon as Walks opens. The colored lines and numbered map markers directly open their matching guides. The route key repeats those actions for readability and accessibility. Village filters only change the list below; all routes and the entire neighborhood stay in view.

Overview traces register the saved CAB shapes to three graphic landmark anchors (Sterling Center, Overlook and Prospect Park) on the approved illustration. This is approximate graphic alignment, not surveyed route positioning or navigation certification. Original source geometry is unchanged. Each guide retains its illustrated close-up and official-map comparison. Forty mileage-label sections keep the official locator rather than an invented whole walk. The general destination directory remains absent from Walks. Source and inventory audit below remains applicable.

## Source audit

- [CAB Trails](https://sterlingranchcab.com/273/Trails), checked September 23, 2026, links the parks/trails map. Its 30-plus miles describes the completed development, not today's open mileage.
- [CAB parks/trails map](https://sterlingranchcab.com/DocumentCenter/View/2352), footer dated October 13, 2025. Saved original: assets/cab-trail-map.png. Map text extraction misses graphic mileages; the inventory was transcribed from the actual map image. Its dashed navy legend means existing trail. The 0.27-mile diagonal north of Sterling Ranch Avenue was confirmed with the enlarged eval/mileage-detail.png crop. The map's approximate mileages are not GPS measurements or live closure information.
- [Developer parks directory](https://sterlingranch.com/town-life/parks-rec/), checked September 23, 2026, supports Willow Creek Trailhead, Providence Regional Park's trail network, Trailrock's trail, Horsebrush's trail access, Pat Gallagher walking and The Lawn's walking/biking. Regional map arrows point toward Chatfield and Roxborough; they do not establish an uninterrupted visitor route.
- [CAB Community Parks](https://sterlingranchcab.com/335/Community-Parks) identifies future planning. Cultural Trail, Sterling Gulch and future park trails remain outside current guides. A target season passing is not evidence of opening.

## Eight editorial walking guides

Guide names describe the map rather than claiming official trail names. Original guide IDs and source paths are retained; five additions trace individual printed links. Junctions are map references, not verified entrances. Nearby-place links do not assert a connecting entrance.

| Guide | Area | Approx. miles |
|---|---|---|
| A lap around Prospect | Prospect | 0.38 |
| Providence’s west greenway | Providence | 1.04 |
| Titan Road to the Overlook | Providence | 0.37 |
| Along Titan Road | Providence | 0.51 |
| Prospect’s northern greenway | Prospect | 0.53 |
| Prospect Park’s eastward link | Prospect | 0.31 |
| Through central Ascent | Ascent | 0.50 |
| Ascent’s winding greenway | Ascent | 0.55 |

## Recorded mileage labels

40 section labels: 14 Providence, 18 Ascent/easement corridor, 8 Prospect. Repeated values belong to separate labels and are not deduplicated. Sections overlap the guides; their counts and mileages must not be added to the guides. Unlabelled extensions stay visible on the official source map without invented distances. This is a complete record of the 40 labels transcribed in this audit, not a claim of exhaustive current routes or field-verified access. Relative section names are editorial. Each row opens its source-image crop; coordinates reference the 1242 × 2000 source image frame, not latitude/longitude.

| Area | Descriptive section | Printed miles |
|---|---|---|
| Providence | Titan Road, western-to-eastern junction | 0.51 |
| Providence | Titan Road toward Moore Road | 0.20 |
| Providence | Northern open-space branch | 0.18 |
| Providence | Northern diagonal greenway | 0.31 |
| Providence | Titan Road–Overlook link | 0.37 |
| Providence | Blue River Avenue connector | 0.28 |
| Providence | Western greenway, upper section | 0.69 |
| Providence | Central diagonal greenway | 0.48 |
| Providence | Western greenway, lower section | 0.35 |
| Providence | Interior southwest connector | 0.52 |
| Providence | Southeastern open-space branch | 0.59 |
| Providence | Eastern bend below the Overlook | 0.26 |
| Providence | Short link toward the easement | 0.16 |
| Providence | Parallel easement connector | 0.15 |
| Ascent | Easement connector, western section | 0.19 |
| Ascent | Easement connector, short central section | 0.07 |
| Ascent | Easement connector toward Horsebrush | 0.45 |
| Ascent | Easement connector, eastern section | 0.23 |
| Ascent | West side below the easement | 0.20 |
| Ascent | Diagonal link north of Sterling Ranch Avenue | 0.27 |
| Ascent | Short upper diagonal link | 0.11 |
| Ascent | Upper central branch | 0.17 |
| Ascent | Short diagonal at Sterling Ranch Avenue | 0.10 |
| Ascent | Sterling Ranch Avenue cross-link | 0.11 |
| Ascent | West side beside the courts | 0.15 |
| Ascent | Connector south of Sterling Ranch Avenue | 0.11 |
| Ascent | Short curved western link | 0.15 |
| Ascent | Winding central greenway | 0.55 |
| Ascent | Central north–south section | 0.50 |
| Ascent | Southern cross-link | 0.14 |
| Ascent | Southern curved connector | 0.16 |
| Ascent | Eastern neighborhood connector | 0.19 |
| Prospect | Northwest approach | 0.14 |
| Prospect | Northern greenway | 0.53 |
| Prospect | Upper interior diagonal | 0.45 |
| Prospect | Lower interior diagonal | 0.55 |
| Prospect | Park inner loop | 0.38 |
| Prospect | Park eastward link | 0.31 |
| Prospect | Southern neighborhood edge | 0.76 |
| Prospect | Western neighborhood edge | 0.53 |

## Keeping the inventory current

Source URLs, checkedAt dates, map date and source geometry remain in data/trails.json. On the next source refresh, compare the Trails page's linked PDF and its footer date against this saved image, then reconcile added/removed labels and topology visually. Refresh the parks directory's access descriptions separately; do not interpret a newer marketing map or construction date as trail opening. Review reported closures on CAB's current page before promoting a guide as currently accessible. No recurring monitor was enabled in this change.

## Verification and limits

See eval/TRAILS-REVIEW.md and eval/evidence/trails for actual desktop/phone checks. Existing landscape and model/photo hashes remain pinned. The 101-listing catalog, all 25 current roots, 16 future records, 19 illustrated models and original three walking guides remain intact. Walking durations estimate 2–3 mph before stops and do not include the return on one-way guides. Surface, grade, accessible entrances and current closures have not been field verified.
