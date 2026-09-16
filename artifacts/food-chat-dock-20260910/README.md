# Food Truck Chat surfaces and pinned composer

Owner-requested follow-up to the September 10 redesign: restore the soft chat shading and make the composer accessible without scrolling to the end.

Answers now sit inside lightly bordered chat cards, with soft sage backgrounds behind the answer, truck/date fields, and website links. User messages and date buttons have rounded chat shapes.

The date buttons and composer share a fixed bottom dock. A ResizeObserver reserves its actual height below the document so the final menu item, source links, and footer remain reachable. Safe-area padding accommodates phone home indicators. VisualViewport resize/scroll events adjust the dock above keyboards when only the visual viewport shrinks. Normal document scrolling remains enabled. The staging badge is positioned above the dock so it cannot cover the send control.

`node artifacts/food-chat-dock-20260910/check.cjs` verifies candidate assets over staging's live initial menu. `FOOD_DOCK_LIVE=1` verifies the deployed assets. At widths 320, 390, 768, and 1448: dock visibility at page top/middle/bottom, uncovered send button, reachable final menu item/footer, real touch scrolling, short 420px viewport resizing and input focus, typed and quick-date submissions, no horizontal overflow, no browser errors, and zero WCAG A/AA violations. Follow-up responses are browser fixtures; no Community Assistant questions are submitted. The short-viewport check simulates available keyboard space rather than operating a physical phone keyboard.
