# Food Truck Chat — September 10, 2026

Owner-approved redesign based on the supplied Food Truck Chat mockup.

The previous page retained a boxed chat layout, repeated introductory headings/messages, icon-only truck links, and inherited layout sizing. The new page uses the Society monogram, an illustrated truck-and-mountains hero, an open conversation layout, readable website/social links, compact menu rows with aligned prices, and teal date/chat controls. A dedicated stylesheet scopes the design to Food Trucks. One footer feedback pair remains.

The initial answer loads without a redundant question or welcome message and leaves the hero visible. Subsequent answers scroll into view in the document rather than an obsolete internal chat scroll area. Reduced-motion preferences are respected. The page retains normal phone scrolling.

All truck names, locations, dates, menu items, descriptions, prices, links, and answer wording still come from the existing API. Missing prices are not filled in. Both single-truck and multiple-truck responses, empty dates, missing menus, and service errors are supported. No backend or Community Assistant behavior changed.

The new illustration was generated with the built-in image tool and saved to `public/society-food-truck-v2.webp`; the original is retained in the generation output directory. The image is decorative and does not represent the truck scheduled on a particular date.

## Verification

Run `node artifacts/food-chat-editorial-20260910/check.cjs` for local candidate overrides against staging. Set `FOOD_LIVE=1` to check the deployed HTML/CSS/JS without overrides.

Checks at 320, 390, 768, and 1448 pixels cover the real initial menu, exact item names and prices, full-width hero, no redundant initial messages, no horizontal overflow, one footer feedback pair, mobile navigation and actual touch scrolling, keyboard access to the composer, quick dates and typed requests, automatic answer scrolling, expanded source links, multiple trucks and locations, missing prices/menus, empty dates, and service errors. WCAG A/AA scans report zero violations. Screenshots distinguish actual live listings from explicitly labeled synthetic test fixtures. Follow-up lookups are intercepted in the browser; no Community Assistant questions are sent.
