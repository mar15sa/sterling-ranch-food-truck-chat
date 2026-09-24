# Parks source reconciliation — 2026-09-23

This note is a bounded reconciliation of the current parks, CAB pools/clubhouse, pickleball, and trail-access material in the merged catalog. It deliberately excludes businesses, apartments, schools, and future projects.

## Source checks

| Source | Checked | Result | Scope / blocker |
| --- | --- | --- | --- |
| https://sterlingranchcab.com/335/Community-Parks | 2026-09-23 | CAB identifies existing Providence, Ascent, and Prospect parks, and labels a separate future-parks section. | The page lists parks and amenities but does not say that they are open to the general public or identify entrances. Existing catalog facts are retained only as CAB-listed descriptions. |
| https://sterlingranchcab.com/418/Pickleball-Courts | 2026-09-23 | Confirms Burns location, hours, drop-in/reservation availability, and resident/non-resident booking terms. | Current capacity, weather closure, lessons, and tournaments must be checked in CourtReserve. |
| https://sterlingranchcab.com/Facilities/Facility/Details/Pickleball-Courts-at-Burns-Park-11 | 2026-09-23 | CAB facility listing remains the address-level source for Burns courts. | Does not replace the detailed pickleball-rules page. |
| https://sterlingranchcab.com/Facilities/Facility/Details/Overlook-Clubhouse-1 | 2026-09-23 | Confirms Overlook address and displayed facility hours. | The extracted page did not establish walk-in, guest, pool, or fitness eligibility; those stay unknown. |
| https://sterlingranchcab.com/Facilities | 2026-09-23 | CAB facility directory lists Overlook, Great Hall, Burns courts, and Ascent Village Pavilion Park. | Directory is a listing, not an access policy. |
| https://sterlingranchcab.com/DocumentCenter/View/1938 | 2026-09-23 | Rental agreement lists resident and non-resident rates for named Overlook spaces and several park shelters. It says rentals exclude pool use, and parks rentals do not give exclusive use of other outdoor amenities. | This supports reservability for named spaces only; it does not prove ordinary public access or pool access. |
| https://www.sterlingranchcab.com/186/Fitness | 2026-09-23 | CAB has a dedicated fitness page. | Available source text did not verify access credentials, guest policy, class schedule, or current activity hours. |
| https://sterlingranch.com/town-life/parks-rec/ | 2026-09-23 | Developer page remains a current, authoritative description source for parks and trail connections. | It does not verify entrances, operating hours, accessible routes, legal public access, or current conditions. |
| https://sterlingranchcab.com/DocumentCenter/View/2352 | 2026-09-23 | CAB's existing parks and trails map supports the 40 catalogued network segments as map-shown. | A map line is not evidence of a public right of entry, route condition, or a safe/accessible entrance. |

## Coverage

- 44 non-future park and park-feature catalog IDs are accounted for in `parkRoster.placeIds`; their inherited source is explicitly limited to CAB/developer listing facts.
- 7 CAB clubhouse/pool/fitness records have individual visit information: Overlook, pool, fitness, Great Hall, north pavilion, south pavilion, and splash pad.
- Burns pickleball has an individual, fully sourced visit record because CAB publishes facility-specific access and booking rules.
- 6 trail-access listings and the 40 mapped CAB network segments are retained in scoped trail records. No entrance has been claimed as verified.

## Per-ID reconciliation evidence

Every non-future park/feature ID now has its own `places[id]` visit record. The machine-readable `parkRoster.perIdReconciliation` table records the ID, evidence URL, 2026-09-23 check date, result, and any blocker for all 43 roster IDs; Burns courts has its separate direct CAB record. CAB-listed parks use the CAB community-parks page and the CAB 5 a.m.–11 p.m. park-hours page. Developer-only listings retain the developer URL and do not inherit CAB access or hours. Individual records retain their catalog address only as unverified arrival orientation.

The Overlook, pool, and fitness records preserve the pre-existing resident-household membership-card guidance from `data/area-visit.json` with its earlier `checkedAt` date. The live CAB pool URL (`/271/Pool`) was inaccessible to this check, so each record has `freshCheckBlocked: true`; current guest policy and seasonal pool operation are not presented as freshly verified.

## Source blockers and retained claims

The CAB and developer pages give useful listings, but no source checked today establishes general public entry for the community parks, trails, fitness area, pool, or splash pad. Those records use `unknown`, rather than inferring access from CAB ownership or a facility listing. The older homeowner-guide splash-pad reference and the extracted fitness content did not provide a current operating rule; their inherited catalog facts are retained with that limitation.
