# Shared footer, Today navigation, and contained chat scrolling

Owner-approved scope: all six public Society pages use the same footer without footer logos; the top home link says Today; Food Truck Chat restores last week's contained scrolling behavior with the composer below the messages and above the footer.

Before implementation: the prior redesign used a fixed overlay tied to the browser viewport, while the earlier UI used a bounded chat panel with an internally scrolling message region. This mismatch affected all food-truck date lookups. The new layout will restore the message region as the scroll owner and keep date buttons/composer as normal non-scrolling rows within the panel. The document can still scroll to the hero and footer on small screens.

Community Assistant changes are limited to the owner-approved shared footer and navigation label. No questions, answers, sources, freshness/authority choices, profiles, adapters, or failure behavior change. All evidence/data remains under the existing controls. Browser tests must block Community Assistant ask endpoints, and any Assistant inspection uses test=1.

Reference: `b42cdb6` (September 4), `public/styles.css`: bounded grid-based chat panel with `overflow-y: auto` on `.messages` and separate composer/footer rows. The current hero and shaded chat design remain; the scroll ownership and control placement return to that earlier structure.

Validation: `node artifacts/shared-footer-chat-window-20260910/check.cjs`; set `SHARED_LIVE=1` for deployed verification without local asset overrides. All 18 page/viewport cases passed at 1448, 390, and 320 pixels. Footer HTML is compared across all six public pages, with no footer logos or draft-email note, exactly one feedback pair, and Today in every navigation. Food Truck Chat checks actual wheel/touch movement inside the message window, unchanged document/composer position, visible input, sources reachable above the controls, typed/quick date responses, and footer below the composer. Browser errors, overflow, and relevant WCAG A/AA violations are absent. Zero Community Assistant questions were submitted.
