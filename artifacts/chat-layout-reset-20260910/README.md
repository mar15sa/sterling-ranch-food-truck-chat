# Restore the chat workspace

Owner approval: return both chats to the usable desktop layout from last week and share Openings navigation across subpages.

Root cause: layered editorial styles introduced oversized mastheads, large serif text inside interactive chat controls, nested shaded blocks, and inconsistent sizing/scroll containers. The affected family is every Food Truck and Community Assistant conversation, not an answer-specific case.

Before: much of the viewport is consumed by headers and chat messages/inputs move differently between tools. After: compact navigation and tool headers, readable sans-serif conversation text, restrained message surfaces, and a flexible message area with the composer below it and above the shared footer. Compare against September 4 reference `b42cdb6` (screenshots saved here). The current source-backed answers and actions are retained.

Scope: presentation and scroll behavior only. Core evidence, authority, freshness/conflict handling, community profiles, connectors, and action URLs are unchanged. Existing failed/unavailable source states remain visible. No unverified facts or new source claims are introduced.

Validation: inspect desktop screenshots at multiple heights; prove long conversations scroll independently while composer/footer remain visible; verify shared navigation dimensions and mobile fallback; check keyboard access, disclosures and automated WCAG A/AA. Browser Assistant questions use `?test=1` with visible Test mode; mock responses intercept requests and require `isTest: true`, so no test questions reach resident logs. Verify the exact staging revision before repeating checks live.

Candidate results: all 25 page/viewport cases passed (five subpages at 1440×900, 1366×768, 1920×1080, 390×844, and 320×740). Both chats passed short/long response layout checks, independent wheel scrolling, composer/footer clearance on desktop, source disclosures, and WCAG A/AA automated checks. Assistant errors remain usable with retry available. All five navigation bars measure 80px on desktop; mobile navigation opens/closes and no page overflows horizontally. Fifteen Assistant requests were intercepted with `isTest: true`; zero reached the server.

Implementation: the shared `chat-workspace.css` owns both chat layouts; Food Truck no longer loads the superseded editorial chat stylesheet, and Assistant-specific overrides were removed from `community-editorial.css`. Editorial branding remains in the compact masthead. On shorter desktop windows, example questions open on demand to preserve reading space. The disclaimer is a native disclosure, initially collapsed. Desktop windows at least 1001px wide and 700px tall fit the workspace to the viewport; smaller windows retain document scrolling and a bounded conversation.

Release evidence: run `CHAT_LIVE=1 node artifacts/chat-layout-reset-20260910/check.cjs` only after health reports the exact staging revision. This produces `staging-results.json` and deployed screenshots without HTML/CSS/JS overrides; question responses remain browser-only fixtures.
