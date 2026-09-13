# Atlas sources, coverage and useful place cards

Research plan and expanded staging build implemented September 13, 2026. No production launch, automatic publishing, subscriptions, outreach or recurring Atlas monitor is enabled. The staging build contains 100 supported listings and separately accounts for 25 held leads. See ATLAS-STAGING-PREVIEW.md for exact deployment verification.

## Why this pass was needed

Marissa liked categories, search, the directory and clickable details, but found the map too familiar, the detail cards too generic, the geographic coverage uncertain and many places missing. This pass addresses inventory coverage and future upkeep. Visual refinement remains a separate staging task.

The first catalog was assembled from a small set of high-level pages. It mixed buildings, tenants and future phases, did not reconcile CAB names with developer names, and did not inventory features such as individual playgrounds. Its background was fetched for a rectangle rather than the full planned community.

The new master inventory gives every discovered item a source, a parent when appropriate, a status and unanswered visitor questions. A working alias is explicitly marked as a match needing confirmation. Nothing in the research inventory automatically becomes an approved fact.

## What “every place” will mean

Cover visitor-facing destinations, neighborhood amenities, public gathering spaces, local businesses, owner-approved home businesses, and named future projects within the reconciled community boundary. Count parent places separately from courts, playgrounds, rooms, phases and recurring uses.

Include apartment and school amenities only with clear access restrictions. Keep regional destinations in a separate nearby layer. Water infrastructure can provide context without visitor directions. Individual occupied homes, every model floor plan, businesses merely serving the area, and a map's repeated “Future Development” text are not separate confirmed destinations.

The current baseline accounts for all 19 developer park names, 16 CAB park/corridor entries, 12 CAB facility results and 34 named community destinations/features on the June 2026 map. Those sets overlap. Nine builder records are leads for a later sales/model-office audit. Eight home-business leads remain permission-pending. See [the full inventory](ATLAS-INVENTORY.md) and the explicit dispositions in data/atlas/coverage.json.

No official list establishes that every unnamed playground, small trail facility or home business has been found. We can claim complete coverage of these named baselines, while the larger completeness goal remains open.

## Boundary check

The current geography rectangle is west -105.077, east -105.020, south 39.477 and north 39.518. It is an extraction window, not a Sterling Ranch boundary.

The [June 2026 community map](https://sterlingranch.com/wp-content/uploads/2026/06/Sterling-Ranch-Community-Map-June2026.pdf) and [county 15th-amendment staff map, page 39](https://douglascounty.legistar.com/View.ashx?M=F&ID=15131384&GUID=5DA37C87-1054-46A8-BB33-3DE3CAACD685) show a substantially wider planning area. The county map was visually inspected. The [amendment action record](https://douglascounty.legistar.com/LegislationDetail.aspx?From=RSS&GUID=E007AD91-6399-4B8C-AFDC-A0480BB0C4AE&ID=7827902) records adoption on February 10, 2026.

The staff report describes approximately 595 additional acres, including Burgess and Chemours land. It is a pre-decision staff report; the final recorded exhibit and its conditions must be reconciled before presenting a precise legal outline. The CAB development page's December 2024 district map is also an older snapshot. District service boundaries, development boundaries and census boundaries are not interchangeable.

Next: retrieve the final recorded exhibit or a current county GIS layer; establish its date and boundary type; overlay the current extraction window; audit western Prospect and southern Parkvale; distinguish the Zebulon project area and adjacent communities. Only then enlarge the background and fit the map to the reconciled shape. Exact southwestern omissions and acreage are still unverified.

## Which source controls which detail

| Detail | Primary source | Supporting source / limit |
| --- | --- | --- |
| Park identity, facilities, closures and managed access | CAB facility record, current parks page, operational notice | Developer pages help discover marketing names; current adopted rules govern restrictions. |
| Park plans and phase status | CAB project update plus applicable adopted county/park plan | A concept rendering or past planned date doesn't prove approval, construction or completion. |
| School 51 name, opening, enrollment and boundary | DCSD School 51 project, attendance-boundary decision and enrollment pages | Developer/CAB maps supply context. Use DCSD for household assignment; don't infer from village. |
| Library construction, services and transition | Douglas County Libraries build page and library operator notices | Developer's target year is supporting context. |
| Business menu, hours, booking, pickup and closure | Operator's exact Sterling Ranch location | Tenant directories help find businesses; building hours are not tenant hours. |
| Home business | Public operator source plus explicit listing permission and chosen public location | Community posts and directories are leads. Retain no home address in this inventory. |
| Apartment or school amenities | Operator's amenities and access policy | Never turn a private dog park or school playground into a public destination. |
| Market dates / vendors | Market operator and date-specific event notice | Vendors and temporary truck stops remain recurring uses, linked to the existing schedule. |
| Legal boundary / adopted development | Final county record and current authoritative GIS geometry | Developer illustrations, OSM and census areas cannot establish a legal boundary. |
| Background roads/building shapes | Dated map geometry with attribution | Geometry cannot prove business identity, opening status or public access. |

For Community Assistant questions, existing adopted-rule authority and approval gates remain in force. This inventory is not ingested into the Assistant and grants no source approval.

## Proposed upkeep routine

Each of the 56 sources has a named owner, exact URL, purpose, limitation, review interval and scope-specific review date in data/atlas/sources.json. Two references need an initial scope follow-up: the exact county GIS boundary layer and School 51 attendance-boundary update. CAB's rental landing page and September calendar were reviewed for discovery; individual bookings/events still need their own checks. The homeowners guide was reviewed only for the Overlook excerpt, not end to end.

| Check | Proposed cadence | What should happen |
| --- | --- | --- |
| Discover added/renamed parks, tenants, venues and projects | Weekly | Compare complete CAB facilities/parks, developer parks/Center/future pages, events and county decisions against baseline labels. Put new or removed names in review. |
| Construction, school and library milestones | Weekly; again before publishing a time-sensitive card | Compare dated project updates. Keep separate proposed, approved, under construction, partly open and open states. |
| Storefront operations and ordering | Weekly source review; follow live operator link for same-day availability | Capture exact location and exceptions. Remove an unsupported “open now” claim rather than assume normal hours. |
| Event / food-truck / pool status | Reuse the existing date-specific project feeds | Show feed timestamps and failures. Do not create a second manually maintained schedule. |
| Stable amenities, entrances and access | At least quarterly, plus when change is reported | Check operator details and targeted field observations. Photograph/document what a specific observation establishes. |
| Home businesses and model/sales offices | Monthly while listed; immediately on closure or owner correction | Recheck public identity, operating links and permission. Seasonal or sold-out pages need active review. |
| Full coverage audit | Quarterly and whenever a new filing/park opens | Repeat baseline reconciliation and check all unresolved labels, edge areas and new facilities. |

This is a prepared routine, not an installed schedule. The current offline checker validates data relationships and baseline coverage only. It does not crawl pages or advance review dates.

For an eventual automated watcher, fetch public approved source URLs, retain a dated content fingerprint and material change summary, and queue review. A successful HTTP request means a page loaded; it does not mean its contents are current or approved. An empty parsed list, changed identity, blocked page or timeout must produce a failure/review item. It must never delete all places, claim no change or advance evidence freshness.

Reuse the existing CivicPlus connector/profile boundaries where applicable. Keep Atlas source definitions separate from approved Assistant evidence. New/changed content needs an explicit reviewed claim with source version, scope and date. Staging remains the destination for page changes; production needs Marissa's explicit launch approval.

## What each place card should help someone decide

| Place type | Useful, specific details | If not verified |
| --- | --- | --- |
| Park / playground | Equipment and play type, age suitability when sourced, shade, toilets, water, stroller/wheelchair route, parking/entrance, tables/grills, reservation link and who may use it | Say “not confirmed” internally; don't convert missing information into “no restrooms” or accessibility badges. |
| Pool / court / clubhouse | Resident/guest access, season, current status, relevant hours, reservations, fees, equipment and age rules | Link the precise current operator action/status, not a generic community homepage. |
| Coffee / restaurant / market | Exact-location menu, ordering, seating, pickup/delivery, hours and exceptions, food-truck co-location, practical parking | Don't promise Wi-Fi, outlets, dietary safety or availability without evidence. |
| Home bakery / maker | How and when to order, minimum notice, pickup versus delivery, delivery area, publicly chosen location, current menu, custom requests | Keep permission-pending leads out of the public catalog. Never publish a home pin by default. |
| Health / personal service | Correct clinic/service, suite, appointment action, walk-in policy, hours and closures, accessibility | Link the provider for insurance/clinical questions. Avoid unsupported medical claims. |
| School | Current grade offering, opening/enrollment stage, official naming/boundary update, tour/registration action, before/after care and visitor access | Distinguish a target from a confirmed date and a school campus from a public playground. |
| Library | Opening stage, current nearby service, study/event rooms, children's space, outdoor areas, booking and access | Planned rooms are not available to reserve until operator confirms. |
| Future development | What it is, where the documented site is, approval stage, funded/current phase, latest dated update and next milestone | Use a broad orientation label until the footprint is sourced. Never turn proposed amenities into open-place filters. |

## Findings that need careful handling

- Horsebrush/Horseshoe Bend, Yard 27/Animas River, High Top/Basketball Park, Trailrock/Climbing Park, Gathering Green/Pavilion Park, Zippity/Swan River Zipline, The Lawn/Providence Park and Willow Creek/Trailhead Park are working matches based on location/features. Keep both search names and verify the matches before moving or merging pins.
- Providence Regional Park and Providence Park/The Lawn are different named places. Cultural Trail and Medley Park may overlap; they remain separate research records until confirmed.
- The old CAB map has four unnamed park markers. Their approximate locations were visually inspected. They may correspond to newer named parks; they are not four confirmed additions.
- DCSD currently targets August 2027 for School 51; the older CAB map's 2026 date should not be used. Enrollment is anticipated in November 2026; current naming and final boundaries remain follow-ups.
- CAB now lists a distinct Prospect basketball court. The developer omitting it from a shorter description does not establish a conflict. Current court availability still requires confirmation.
- Outcrop's summer 2026 target and Prospect's intended summer 2026 Phase 2 start need current status checks.
- Resident Resource Center appears in the older map and March 2026 meeting calendar. It must be reconciled as an existing/historical venue, not automatically labeled a new future building. The older address is now the school's project address.
- Indigo and Rye, Sourdough Haus, Lemon Zest Bakery, Pup Pilot, Mountain View Photo, BLR Photography, Stephanie Renae Hall Photography and Golden Cowgirl Spray Tans are leads. Lemon Zest has a temporary closure notice; Sourdough Haus's visible order schedule is old.

## Remaining staging refinement

1. Close location, alias and phase-status gaps for the records being added.
2. Add useful sourced card fields and preserve unknowns. Offer a directory entry without a pin where exact location is unknown.
3. Reconcile and widen the geography; distinguish nearby context from community destinations.
4. Rebuild the staging catalog with `node scripts/build-atlas-preview.js` after reviewing inventory, location or visitor-detail changes. Check synchronization with `--check`. Keep makers held until permission and location choices are documented.
5. Validate source links, search aliases, parent/feature counts, phase filters, privacy, geography and stale/failure behavior. Review the revised page with Marissa before any production proposal.

## Validation and documentation

The offline checker passes for 125 research records, 58 registered references, six audited label sets and all 100 staging-build IDs. It checks missing sources, parent cycles, claim/source linkage, lost baseline entries and accidental home-location or publication promotion. The runtime catalog is a deterministic projection of non-candidate records; the raw research file and makers remain unserved. Runtime changes are staging-only and require the normal release checks.

The third audit added the Pat Gallagher, McCormick and Pioneer shelters, Broadstone EV charging, the library children's area and drive-through return, and Willow Creek Wildlife Corridor. CAB's dedicated pickleball and park-shelter pages are now registered sources. Pickleball has a prominent shortcut, eight-court detail and official CourtReserve action. Current operating facts require the same scheduled manual review discipline; successful page loads never silently renew their review date.

Fifty-six listings share eleven map locations. Four locations use CAB-described street areas matched to saved OSM junction geometry; they are explicitly approximate and do not offer entrance directions. Forty-four listings remain directory-only. A wider OSM refresh failed with service errors, so the earlier background is retained and labeled incomplete, with a link to the full official planning map. Older Elk River / Cultural Trail Park OSM labels remain unresolved background names, not new confirmed destinations.

The previous staging CI run [34768789499](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34768789499) completed successfully; that result covers the earlier prototype revision, not a production launch.

Documentation synchronized and fetched to verify September 13, 2026: [Atlas places and sources](https://www.notion.so/3dabf909186d8164930fc37c1865c026) contains the 125-record inventory, 58-source plan, seven third-audit additions and unresolved gaps, linked to implementation revision ed1f2c1. The [Design and experience reference](https://www.notion.so/3dabf909186d81b99d91ddd39861536b) records Marissa's feedback, the expanded page verified on staging, its device checks and the production-launch hold. Unrelated guide content was preserved. No Assistant flow or source-approval diagram changes were needed because this work does not alter those systems.
