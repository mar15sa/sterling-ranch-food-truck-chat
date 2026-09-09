# Approved Society editorial UI implementation

Local worktree: `.worktrees/society-editorial-ui-implementation-20260909`
Branch: `codex/society-editorial-ui-implementation-20260909`
Base: fetched `origin/main` at `884de8c` on September 9, 2026.
Approved reference: `design-mockups/editorial-v4/review.html` in the original workspace.

## Delivered

- Shared editorial masthead, desktop/mobile navigation, page titles, typography, spacing, footer and all nine approved Society colors.
- Daily Briefing populated from existing food-truck, schedule and openings endpoints; Denver-local date. Empty/loading/service-failure states use plain text and useful destination links.
- Community Assistant appears in the lead row and first on mobile. The mobile question field appears before the existing examples.
- Existing Food Truck Chat, Assistant sources and conversation behavior, openings map/filter/pagination/tip controls, and pool status/refresh controls retain their existing bindings.
- `Report a bug` and `Request a feature` are visible mailto links below the Assistant and in all six shared footers. Subject/body prompts adapt the useful email behavior from `codex/community-feedback-buttons-20260908` and Food Truck Chat; no stale page structure or popup is reused. Nothing sends automatically.
- A new Calendar presentation route shows the next seven food-truck dates and links prominently to the existing combined Google Calendar.
- Assistant error retry preserves history and avoids adding the same resident question twice. IME composition does not accidentally submit with Enter. The request body and `isTest` behavior remain unchanged.

## Validation

- Existing complete test suite: **473 passed, 0 failed** (`node scripts/run-tests.js`).
- Syntax checks passed for `server.js`, `public/rules-assistant.js`, `public/briefing.js`, and `public/society.js`. This plain Node/static HTML project has no separate build script.
- All six page types captured at 1440×1100 and 390×844. No horizontal overflow, JavaScript page errors, duplicate main landmarks or duplicate H1s. Six destinations and appropriately sized email-draft feedback links verified.
- Assistant loading, conversation history, expanded sources, Enter, Shift+Enter, retry, source-panel Escape/focus restoration, session history, mobile menu, no-JavaScript navigation/feedback markup and reduced motion checked.
- Openings search/clear filters and tip-dialog open/close checked; no tip was submitted.
- Homepage test marker forwarding checked without submitting a question from the homepage.
- **16 axe-core WCAG 2 A/AA and WCAG 2.1 AA scans passed with zero violations**: all six pages at both widths, plus populated Assistant source/error states at both widths.
- Browser Assistant requests were intercepted with clearly labeled test responses. Each submitted body was asserted to contain `isTest: true`, and the visible Test mode banner was confirmed first. No Community Assistant test request reached the owner log.
- Email links were inspected, not sent. No push, pull request or deployment was performed.

Machine-readable evidence: `render-results.json` and `interaction-results.json`.
Screenshot review: `review.html`. 23 PNG captures cover all page types and Assistant/control states.

## Material differences from the illustrative mockup

- Actual dates, trucks, menu snippets and opening names replace illustrative listings. No invented food-truck serving hours or locations are shown when absent from the existing response.
- There was no internal general-event Calendar page or general-event listing API on main. The new route surfaces the existing food-truck schedule and prominently opens the existing combined calendar for all other events, times and details. It does not invent a general-event feed or imply food-truck dates are all community events.
- Food Trucks remains the functional chat, including menus, dates and external links; Openings retains the map and complete filterable/paginated catalog. These live tools are richer and longer than the preview's sample cards.
- The current main pool endpoint returns `Closed for the day`. This UI preserves that live wording instead of overriding it with the preview's `Closed for the season`. The homepage pool column uses secondary, seasonal-neutral copy. The separate seasonal accuracy work can update this through the existing API later.
- Existing CAB pool signal colors remain in the color key because their colors carry official meaning. Brand colors elsewhere follow the approved palette.
- Source-status and answer-source controls retain their real content, rather than the preview's simulated source shelf. The existing independent-resource disclaimer is retained.

## Reproducing UI checks

Start this worktree's Node server on port 3187 (or set `UI_TEST_URL` for the interaction script). `render.cjs` uses that local port. The scripts use the available bundled Playwright and installed Chrome. The local checker tools were installed only under ignored `tools/node_modules`; they are not application dependencies. Install `axe-core` there to repeat accessibility checks. Ordinary renders use the real read-only data endpoints; Assistant interactions use intercepted test responses.

The public Clubhouse-reservation starter was replaced with the approved water-payment question, and its matching regression fixture now checks the existing UtilityHawk payment action. No rental facts or booking links were added. The public-example regression file passes all 19 tests.
