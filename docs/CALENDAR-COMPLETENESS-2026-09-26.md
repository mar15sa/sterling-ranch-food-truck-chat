# Calendar completeness repair — September 26, 2026

## Incident and bounded plan

Owner requested an immediate production repair for missing calendar events, including today's Oktoberfest. Baseline production revision: `7ab5d0c016d8016ac5a5323cde790ad8e38df1e6`.

The live CAB day listings for September 26–October 2 contain 15 dated events. Production returns only the first seven. Its browser then hides today's entries when their start time passes, even though the source does not provide a structured end time. At midday, Oktoberfest (11 a.m.–7 p.m. on CAB) is hidden in a collapsed disclosure and absent from the homepage. Trivia Night, both Wednesday run clubs, Thursday's three events, Friday Pilates and Chili Cook off are cut off by the weekly cap. CAB's year-long Food Truck Schedule directory entry is separate from these dated events; the dedicated food-truck page remains its browsing route.

Repair the shared family: same-day events and busy calendar weeks. Preserve today's dated events for the full local day; a start time is not proof an event has ended. Return all dated events in the seven-day calendar view and remove the full calendar's display cap. Keep the homepage's compact three-item preview and the Assistant's default eight-event answer limit. Preserve existing page layout, official event links, duplicate removal, source freshness, partial/unavailable states and cross-community configuration.

Authority remains the configured official live CivicPlus calendar. No event-specific facts or dates are added to application code. The connector owns retrieval and optional result limits, the calendar projection requests the complete daily records, and the browser shows the requested dated listings. The Assistant's answer flow and source-approval decisions do not change. Existing diagram stages remain accurate; only the calendar explanation needs an update.

## Verification plan and status

- Compare every requested CAB day with the repaired response, including the month boundary.
- Regress midday visibility, local-day boundaries, more than eight events in one day, more than fourteen in a week, duplicates, cached reads, source failures and the unchanged Assistant limit.
- Run focused tests, then the complete applicable release gate and required protected GitHub checks.
- Reserve shared staging, preserve its existing work, verify the deployed candidate and affected behavior, and release the reservation.
- Merge only this production-based fix through the normal protected route, then verify the exact production revision, visible Oktoberfest listing, complete week, and deployment checks.
- Update the calendar section in [How the project works](https://www.notion.so/3dabf909186d8166b507c2a4e1d1aced), fetched before editing. Record release evidence there after live verification.

State at authoring: root cause verified; implementation and release checks pending. All automated Assistant requests must include `isTest: true`.
