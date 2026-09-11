# Community page style update

Owner request: match Pool, Calendar, and Community Assistant to the new Today page.

Before implementation: these three pages still use the older plain wordmark, small headers, and utility styling. The affected family is the complete Assistant interface, across all question topics. The new presentation uses the same serif typography, illustrated mastheads, navy/teal palette, and shared footer as Today; existing questions, source disclosures, and actions remain available. Calendar listings and pool status retain their current live data.

This change is confined to page markup and presentation CSS. Source authority, evidence, freshness, conflicts, core routing, community profiles, and adapters are unchanged. Existing source-failure messages and official action URLs remain intact; no new authority or verification claims are introduced.

Validation: desktop and phone screenshots, navigation and overflow checks, calendar populated/empty/failure states, pool refresh/failure state, Assistant source details and conversation layout, and accessibility checks. Assistant browser visits use `?test=1` and confirm the Test mode banner; automated ask requests are blocked. No resident questions will be submitted. Verify the exact deployed staging revision and repeat the page checks before reporting completion.

Candidate validation passed for all three pages at 1448, 820, 390, and 320 pixels: 12 cases, no horizontal overflow, no browser errors, and no WCAG A/AA violations in the automated checks. The mobile navigation opens and closes; the Assistant source disclosure stays on-screen; a long browser-only mock conversation scrolls without moving the composer. No Assistant questions were submitted. Pool refresh was checked with both a successful browser-only source fixture and an unavailable fixture; calendar empty and failed requests preserve the official calendar link. The live pool source currently returns unavailable, and the calendar returns partial listings; those existing source states remain visible.

Screenshots and `preview-results.json` record the candidate. The same script with `COMMUNITY_LIVE=1` checks the deployed staging version with no page or style overrides. Runtime answer/evidence code was not changed.
