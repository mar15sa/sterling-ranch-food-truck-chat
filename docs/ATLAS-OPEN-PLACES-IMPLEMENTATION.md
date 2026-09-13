# Open places, walks and future layers

September 13, 2026. Marissa approved implementing the proposed visual directions with “Make it happen.” Authorization covers staging only; production launch remains unapproved.

The existing map treats destinations as numbered pins and opens a generic detail panel. This limits all multi-amenity places, nested businesses and future phases. The new experience will use illustrative landmarks, a place view that unfolds into its real children, and an optional future layer with clear status and location limits. Walking guides gain a time picker and a more visible start-to-finish sequence with separate nearby activities.

Existing reviewed catalog relationships, descriptions, actions and dates supply every place fact. Decorative illustrations and connecting lines explain membership, not exact architecture or amenity positions. Planned items stay distinct; unlocated projects receive cards without invented geographic pins. Existing source dates and official actions remain available. No new source approval, Assistant evidence, resident-question data, automated messages or production settings are involved.

Shared rendering belongs in Atlas UI modules; selected showcase IDs and illustration kinds belong in a separate display configuration. Catalog or illustration failure must preserve the existing directory. Review must cover parent/child navigation, future visibility, keyboard/focus behavior, mobile layout, reduced motion, action links and staging-only routes. Exact release and documentation verification will be recorded after implementation.

## Implemented locally

- Cream/forest illustrated landmarks for McCormick, Burns and Sterling Center on the map and in a three-place discovery row. A shared SVG symbol library supplies the decorative art; it uses no image-generation or tile API.
- Selecting a place opens its illustration and real child amenities. Multi-level places can be explored through their nested businesses and services, with a parent breadcrumb and Neighborhood return. Leaf details retain source dates, access limits, visit notes and official actions. On wide desktop screens those details sit beside the illustration; on phones they appear inline and selecting an amenity moves directly to them.
- Now / With what's coming controls the future map layer and child cards. Existing facilities remain visible. Future additions at an existing facility use a mauve halo and planned-addition label. Unlocated School 51 and library projects appear as source-based project cards without invented pins. Switching back to Now closes a future-only project or returns a future phase to its existing parent.
- The walking guide filters by approximate time bands. About 15 minutes contains the two 8–12 minute walks; About 30 minutes contains Providence's 21–32 minute walk. Selection, highlight and details change together. The start-to-finish summary includes one-way/loop status and return mileage, with nearby activities explicitly separate from the walking route.

All 100 place records, 33 parent destinations, 78 located records, 18 map areas and three walking routes remain intact. This release changes presentation and navigation; it does not assert broader geographic or operational completeness.

## Review and verification

Sixteen Atlas tests pass, including multi-level family navigation, future visibility, phase directions restrictions, display-configuration references, existing source/coverage tests and deterministic rebuilding. Actual HTTP checks pass for the new experience data, script, CSS and art library, including production isolation. All changed scripts pass syntax checks.

Local browser review covered McCormick, Sterling Center → Ranch Social → Atlas Coffee, future School 51 and Burns phases, switching back to Now, time-band route selection, and a correct return to the landmark opener. Desktop 1440 × 1000 and phone 390 × 844 had no horizontal overflow. Selecting a child on a phone put its detail heading at the top of the viewport. No browser warnings/errors were reported. Reduced-motion CSS disables unfold animations and transitions; an OS-level reduced-motion session and real touch dragging are not claimed as tested.

Review fixed future content remaining visible under Now, stale return-focus targets, hidden child detail after scrolling, duplicate SVG title IDs, and a time filter that could leave an unrelated route selected. Source-image schematic geometry and reviewed operating facts remain unchanged.

Staging deployment, comprehensive hosted checks and owner-guide synchronization are pending at this checkpoint. Relevant Notion targets: [Atlas places and sources](https://www.notion.so/3dabf909186d8164930fc37c1865c026) and [Design reference](https://www.notion.so/3dabf909186d81b99d91ddd39861536b). The Assistant flow and source-approval diagrams are unaffected.
