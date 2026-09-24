# Atlas visit journey — September 22, 2026

## Status

This is the local 4194 Atlas revision. It is implemented in the local preview at http://127.0.0.1:4194/ and is **not launched, deployed, or owner-approved**. The prior 4193 local model-expansion preview remains preserved for comparison; earlier 4190 and baseline comparisons remain preserved as recorded elsewhere.

Final coordinator browser and visual checks are pending. This document records implementation and source review only; it does not claim a visual-gate pass, final browser verification, or live verification.

## Purpose and implemented changes

The revision makes the trip-planning path more direct without changing saved source facts. The full-area discovery view now keeps a selected place, its nearby/related choices, and the path into place details connected. Search, map labels, discovery controls, directory cards, and nested amenities use the same place-opening path.

Selected places can return to the map context from which they were opened. The close-up view uses existing photo-based raster models where present. It adds limited, source-bounded feature buttons for selected illustrated places; a button opens the existing nested amenity detail rather than asserting a surveyed feature location. The full-area map continues to distinguish its illustration anchors from saved source geography.

The new visit card puts saved address and access wording first when present, then sourced highlights or visit notes and official actions. Official actions are prominent; sources and caveats remain expandable. Material saved unknowns appear under “Still to confirm.” Child listings only show a parent address when the parent has one, labeled “Parent location,” with a control that opens that parent. The card does not construct directions, entrances, hours, parking, accessibility, or other details from coordinates, images, or nearby records.

The card treats event and schedule-dependent entries cautiously: it preserves the existing source note and directs visitors to the relevant official action rather than presenting a static schedule as current. It accepts only HTTP(S) action URLs and escapes saved text before rendering.

## What remains limited

- The Atlas retains **19 photo-based raster models**. They are illustrated views, not rotatable models, site plans, surveys, or current-condition guarantees.
- Only **5 models and 8 feature buttons** have the limited illustrated-feature interaction in this revision. Other places still use their normal detail and directory paths.
- Map anchors remain approximate visual orientation aids. They are separate from source coordinates, do not establish entrances or navigation points, and unlocated roots remain unpinned.
- Visitor facts are incomplete across many records. The UI shows saved unknowns where present, but absence of a label never proves parking, restrooms, shade, age guidance, accessibility, reservations, or access conditions.
- This revision adds no source facts or coordinates. It uses the existing merged catalog, visitor notes, area-visit records, and official source links already associated with a listing.

## Focused official fact audit

### Pioneer Park

Current official CAB wording places Pioneer Park among residences on **Arapahoe Peak Street**, with a large grassy area and playground structure. CAB says neighbors gather at the park shelter in warm weather. The developer’s parks page independently describes a large grassy area, a sun shelter, and a play structure for children.

The CAB Parks & Trails page gives the general park/open-space schedule of **5 a.m.–11 p.m. daily**. That is a general rule, rather than a Pioneer-specific facility schedule.

The reviewed official pages do **not** give a street-number address, entrance, parking details, restroom listing, age range, ADA/accessibility designation, or a Pioneer-specific reservation action. “Sun shelter” supports the feature label only; it does not establish general shade coverage or accessibility.

Sources: [CAB Community Parks](https://sterlingranchcab.com/335/Community-Parks), [Sterling Ranch Parks & Rec](https://sterlingranch.com/town-life/parks-rec/), and [CAB Parks & Trails](https://www.sterlingranchcab.com/270/Parks-Trails).

### Burns Park pickleball courts

The CAB facility listing gives **9020 Middle Frk St, Sterling Ranch, CO 80125** (using CAB’s abbreviated street spelling) and identifies pickleball courts. CAB’s current facility guidelines place them at Sterling Ranch Avenue and Middle Fork Street, say free street parking is available near the courts, and give facility hours of weekdays 7 a.m.–dusk and weekends 8 a.m.–dusk.

CAB explicitly supports reservations and drop-in play. It publishes a two-hour maximum reservation per day; advance windows for residents and non-residents; fees; daily open-play blocks of 7–11 a.m. and 5–8 p.m.; reservation blocks of 11 a.m.–5 p.m.; and the notice that CAB tournaments and lessons take precedence. Visitors must bring paddles and balls and wear tennis or court shoes. Children under 13 need a resident aged 16 or older. CAB says snow-covered courts are locked.

The official action is [Sterling Ranch CAB CourtReserve](https://app.courtreserve.com/Online/Portal/Index/15838), used for booking and open-play registration. CourtReserve’s displayed availability can differ slightly from CAB’s guideline wording, so the card should direct users to the portal for current availability rather than restate a schedule as guaranteed.

The reviewed facility and guidelines pages do **not** state restrooms, shade, ADA/accessibility, or a specific entrance. Those stay unclaimed.

Sources: [CAB Pickleball Courts guidelines](https://sterlingranchcab.com/418/Pickleball-Courts) and [CAB Burns facility listing](https://sterlingranchcab.com/Facilities/Facility/Details/Pickleball-Courts-at-Burns-Park-11).

## Local verification — September 22, 2026

Completed 65 tests and actual desktop/phone browser review, including all five supported feature models, keyboard search, parent/child details, return context across refresh, Back/Forward, copy link, future-only map, walking-guide Escape, and visible skip-link target. Five fresh core screenshots were compared with the preserved owner-selected baseline. See eval/JOURNEY-REVIEW.md and eval/evidence/journey/browser-checks.json. This is local verification only; owner design and launch approval remain pending.
