# Current Atlas UI/UX audit

Reviewed September 22, 2026. Preview: http://127.0.0.1:4193/ . Implementation 3aacb07; documentation closeout 8c719cb. Read-only audit by GPT-6 Astra, with a bounded GPT-5.6 Terra code/content review. No runtime changes or deployment. Recommendations below are proposed, not approved or implemented.

## Scope and overall assessment

Actual browser review at the normal desktop viewport (approximately 1280 by 720) and a 390 by 844 phone viewport: whole neighborhood, Ascent focus, Unfold, current search, Elementary School 51, pickleball details, Pioneer close-up, phone future map, walking guide, and keyboard search. The temporary viewport was reset after review. This is a heuristic/product audit, not a formal accessibility certification or new source-fact audit.

The visual foundation is worth keeping. Its warm landscape, architectural illustrations and typography now distinguish it from a standard map. The product still feels like several good views joined together. Connecting those views and bringing visit decisions forward will add more value than another blanket visual redesign.

## What works

- Full-area illustration includes the southwest; village focus visibly zooms and softens the surroundings while presenting matching area listings.
- Photo-based close-ups give places recognizable identities, and explicit illustration/photo labels and source links explain their basis and limits.
- Nested amenities keep the directory manageable. Searching pickleball reaches the actual court record, including hours, reservations, address, nearby street parking and equipment guidance.
- Coming Soon keeps its map and future-only scope. The school page distinguishes a target opening, enrollment information and the unconfirmed exact site.
- Walking guides offer distance, estimated time, starting point and a route image. The Prospect loop modal is readable on a phone.
- The phone layout did not have horizontal page overflow in the tested states. Earlier model and full-area comparisons are preserved.

## Priority findings

1. **High: the expanded inventory is not integrated into discovery.** The phone overview exposes only four named destinations. Desktop gives smaller destinations generic symbol markers. Unfold still shows the original four landmarks after Ascent is selected; its heading says the whole Ranch while the surrounding control says Ascent. The nearby destination strip also stays on the same four. A visitor can reasonably conclude there are only a few places despite the new 19-model chooser. Make the overview, area list, close-up chooser and Unfold use the same selected area and relevant destinations. Keep unlocated destinations in the area list without inventing pins.

2. **High: Unfold is attractive but insufficiently spatial.** It presents tilted shelves of landmark cards, walking cards and future cards; the selected places are no longer visibly attached to their positions. It does not yet deliver the original exploded-map promise. Keep the ground plane recognizable, lift a useful selected layer, and connect destinations back to confirmed or explicitly approximate positions. Explain what the action reveals. Do not introduce fake exact sites or routing.

3. **High: practical detail quality is uneven.** Pickleball is a strong example. Other records are sparse, and parent visit details sit behind a small Plan your visit & sources disclosure. Saved unknowns are not rendered by visit() in app.js. Define a per-type visit card with verified entrance/directions, access, hours or reservations, parking, restrooms, shade and accessibility where relevant. Show important verified information before sources; clearly identify material unknowns rather than silently implying completeness. Display seasonal/current-schedule cues for food trucks and similar entries.

4. **Medium: the close-up art is not yet an interactive site guide.** Most new views show a single illustration with a separate list. A visitor cannot select the depicted shelter or play structure directly. Add a few photo-grounded hotspots where the location is actually supported; selecting an amenity should highlight the same feature and reveal its information. Partial facade/structure illustrations must retain their explicit scope.

5. **Medium: navigation loses context.** Multiple layers of controls compete: top-level tabs, discovery filters, village controls, four destination shortcuts, the 19-place carousel and a separate directory area filter. URL parameters are read on startup but selecting places/views does not update the URL or browser history. Copying the address will not share the current exploration, and Back cannot retrace it. Use a consistent map/place relationship, synchronize area context, provide shareable selected-place URLs and honor Back/Forward.

6. **Medium: mobile/readability needs a dedicated pass.** The phone map is visually appealing but too small to expose much detail; close-ups push visit information below the illustration and source controls. Long horizontal place browsing, repeated headings, muted small text and repeated directory content add effort. Use a compact selected-place panel with key facts and the primary action readily available, a clearly named area/place selector, and larger/high-contrast utility labels. Preserve the artwork rather than replacing it.

7. **Medium: keyboard basics are incomplete.** Actual ArrowDown then Enter in populated pickleball search left focus in the search field and did not open a result. Results are buttons reachable by Tab, but conventional search navigation is missing. In Walks, the skip link still targets the hidden neighborhood place-note. Add result navigation, suitable result semantics/announcements, and a visible skip target per view. A full keyboard/screen-reader audit remains to be done.

## Recommended sequence

First, finish one complete resident journey on desktop and phone: find a park or court, understand access and facilities, explore the related features, return to the same map, and share the selected place. Use Pioneer and Burns as representative cases. Carry the same detail layout to all destinations with honest missing-data treatment.

Second, connect all area discovery surfaces to the expanded model inventory and add verified feature hotspots. Keep the existing full-area artwork and photo comparison.

Third, rebuild Unfold around visible geographic relationships and useful layer choices. Assess it by whether it reveals something that helps a visitor decide where to go, rather than by tilt or animation alone.

Extend the eval with resident tasks: find pickleball and booking guidance, distinguish resident access, find a smaller park in Ascent, inspect a future school on the map, open a walking guide, return without losing area, and copy a link that restores the destination. Retain existing visual-baseline, inventory and source-review checks. Passing 49 implementation tests does not establish that the interface is intuitive or that the design meets the owner's intended experience.

No user-facing changes were made during this audit. Owner approval of launch remains pending. The Notion design reference (https://www.notion.so/3dabf909186d81b99d91ddd39861536b) was fetched, updated with a dated audit/proposed sequence, and fetched back to confirm the entry and preservation of implementation history. No documentation is pending. No operating diagram changed.
