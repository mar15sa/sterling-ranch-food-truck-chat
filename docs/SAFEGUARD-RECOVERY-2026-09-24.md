# September 24 safeguard repair

Status: implemented and focused regressions passed; protected CI, staging and production verification pending.

The owner authorized repair after production monitor incident [#188](https://github.com/mar15sa/sterling-ranch-food-truck-chat/issues/188). Production revision `8a5401e` still returns an unavailable food-truck answer to an explicitly test-marked question, despite the official calendar listing today's truck.

## Causes and scope

- The official calendar uses HTML-encoded punctuation (`&ndash;`, `&rsquo;`). The connector recognizes literal dashes but does not decode these forms. Repair the calendar parsing family, including named/numeric entities, adjacent dates, and unhealthy responses; do not embed today's truck or schedule in application code.
- Approved-source renewal runs only after expiry. Six-hour intervals can run just before a 24-hour expiry, leaving a six-hour gap. Renewal also shares a lock with discovery and review synchronization. Renew ahead of the next interval and let exact renewal continue while background discovery/review is occupied. Older in-flight observations must not overwrite fresher evidence or a changed approved identity.
- The unavailable food-truck handoff has a configured official URL but no action-source record. Supply navigation-only provenance without inventing schedule evidence or allowing the incomplete answer to become verified. Keep the monitor's binding and live-answer requirements unchanged.

Residents should receive the current calendar listing when it is readable, and an honest unavailable answer with an attributable official handoff otherwise. Exact URL, content, action and document proof remain required to renew approved facts. Changed evidence stays in review. No source approvals, model settings, daily schedule, or private resident records are changed.

The parser and renewal coordination are shared mechanisms. Community endpoints and labels remain profile-owned. Focused regression coverage will include encoded official markup, unavailable calendars, cross-community action isolation, renewal before expiry, occupied background work, concurrent renewal, changed identities, and late stale observations. Protected full CI and exact deployed test-mode checks remain required.

Focused checks passed for the food-truck adapter, runtime renewal, refresh identity, need router, domain-outage continuity, exact-document/page renewal, freshness queues, private source diagnostics, source-review authority, critical-capability monitoring, and resident-literal guard. The saved September 24 public calendar reproduces the former parse failure and yields the correct date-specific listing after the repair. Test-only fixtures now use valid timestamps where ordering is required.

The complete protected GitHub gate will provide the final candidate's full precheck/check/postcheck evidence; this avoids repeating that same full gate locally. Staging and production each retain their exact-deployment checks and marked answer checks.

Notion update pending release verification: [How the project works](https://www.notion.so/3dabf909186d8166b507c2a4e1d1aced) and [Owner operations](https://www.notion.so/3dabf909186d81028da2d4e84f033e77). Add the verified revision and run links, explain renewal before expiry independent of discovery/review, and explain encoded calendar parsing plus navigation-only outage provenance. Existing answer-flow topology, approval boundary and daily monitoring cadence are unchanged; the diagram explanation needs the operational clarification, not a new answering stage.
