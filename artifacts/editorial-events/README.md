# General-events UI parity

The homepage and calendar previously reused only food-truck dates. This omitted general events already available from the profile's CivicPlus connector. The approved editorial list now consumes a shared public calendar projection, with three homepage rows and seven calendar rows. The specialist Food Trucks page retains its complete schedule, linked from Calendar; one official event stream avoids showing the same truck/date twice.

The profile and validated adapter own endpoints, hosts, labels, and time zone. The existing live connector owns event facts and evidence. The projection checks a seven-day window, requesting each date through the day-scoped connector, including month boundaries, removes repeated identities, and withholds unavailable or degraded results rather than presenting them as current. Healthy partial results remain visible with an incomplete-list notice. A local redirect resolves the configured official calendar even without JavaScript. No event facts, community URLs, source approvals, Assistant answers, or pool claims are added to application code.

Validation will cover both community profiles, month boundaries, deduplication, capacity, empty/error/partial outcomes, unsafe connector endpoints, and desktop/mobile render and interaction states. Automated browser checks will submit no Assistant questions.

## Visual and interaction evidence

Twenty captures: both pages at 1440 and 390 pixels, each with ready/loading/empty/error fixtures and an actual live connector render. All sixteen fixture states passed WCAG 2 A/AA and 2.1 AA scans with no violations, mobile-menu Escape behavior, row capacity, and overflow checks. The official redirect matched the active profile endpoint with JavaScript disabled. Browser checks made no Assistant-question requests. The unchanged Food Trucks page retains its full schedule; Calendar links directly to it.

Live evidence exposed the connector's day-scoped query, so the projection requests every day rather than sampling a month. Some daily official responses were unavailable or did not meet the existing parser's health requirements during capture; healthy listings remain visible with a partial-list notice and configured official-calendar fallback. No degraded event evidence is displayed as current. This slice does not change the connector parser or Assistant behavior.

## Check results

- Focused calendar tests: 5 passed, covering both community profiles and safe degradation.
- Full automated test suite: 567 passed, 0 failures.
- Resident-literal guard: passed, with the same 99 existing migration-debt nodes.
- Existing openings, truck parsing, rule input/grounding/resources/supplements/source-derived, and menu-fixture checks passed.
- Full command transcript, including final rule evaluations: `npm-final-check.txt`.
- Application files: `lib/community-calendar-view.js`, `server.js`, `public/briefing.js`, `public/index.html`, `public/calendar.html`.
- Test file: `test/community-calendar-view.test.js`.
- No push or deployment.

### Full command outcome

`npm run check` exited 1 in its existing postcheck Assistant release gate. Before that, 567 tests, all listed guards, 140/140 rule variants, 7/7 unseen rule cases, and the 122-question resident corpus passed. The 249-question Assistant audit failed with exactly: “7 answer regressions; 6 upgraded answers scored below Good; 3 answers still leave high resident effort.” The chained retrieval check did not run after that failure. The calendar projection is not part of that answer engine; no unrelated answer/source files were changed to address this gate. See the complete transcript for affected questions and scoring.
