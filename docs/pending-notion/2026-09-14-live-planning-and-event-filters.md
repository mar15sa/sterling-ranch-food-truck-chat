# Pending live planning and event-filter update

Status: local experimental planning and local calendar repair, not deployed. Synchronization is pending: the earlier automatic approval review rejected the external Notion write containing internal paths and experiment/status details. Confirmation to retry has not arrived. Fetch the target before any later authorized edit, preserve unrelated content, then fetch again to verify.

Targets: [How the project works](https://www.notion.so/3dabf909186d8166b507c2a4e1d1aced), calendar-filter explanation/accessible flow description; [Decisions](https://www.notion.so/3dabf909186d8139ac52ebdbf77d8bea), model experiment; [Audit](https://www.notion.so/3dabf909186d81a2a090c2cb90183e96), local validation.

Exact proposed explanation addition:

> September 14, 2026 — implemented locally, not verified live: calendar activity and venue matching now keeps substantive whole words together. A shared word such as “class” cannot make swimming match a yoga search, and a shared “Hall” cannot make one named hall match another. Explicit alternatives and existing audience synonym lists remain supported. Official calendar date coverage, community identity, actions and freshness still control the result; text matching does not establish suitability or availability. The unchanged flow is: validate requested scope → fetch the community's official calendar → check source health/currentness → apply activity and venue constraints → return matching listings or an explicitly bounded gap/alternative. The flow diagram nodes and authority order are unchanged; annotate the filtering node as a local repair, without labeling production updated.

Exact proposed experiment/audit addition:

> The local evaluation candidate now selects configured calendar/current-status requests in its existing interpretation call, without another routing model. Software verifies copied resident wording, date range, timezone and capability before executing a connector. Unsupported food-truck/waste capabilities remain explicit gaps in this candidate. Initial strict-output trials returned invalid plans in all 16 attempts. Replaying two requests twice while removing only strict returned four valid plans; this is a narrow diagnostic, not general reliability proof. Both model-selected requests also executed successfully against public calendar/status sources at 22:56 UTC. Those saved observations have limited freshness and are not current resident answers.
>
> These 20 model calls cost $0.069746 at dated token rates. The current development phase totals $1.084165 known cost and $2.985831 conservative reservation against a $3 cap; no subscription or implementation was selected. Complete live/document costs, adjacent intents, human-calibrated ratings and independent demo acceptance remain pending. Initial implementation passed 899 full-suite checks; the final experimental guard passed 25 focused checks and the event repair passed five new checks. Combined final full-suite verification is recorded separately below when terminal. Implementation revisions: 6cc8610, 1225c7c and b6282a2. Nothing was deployed.

Supporting local records: `docs/COMMUNITY-LIVE-PLANNING-COMPARISON.md`, `docs/COMMUNITY-EVENT-FILTER-REPAIR.md`, and their referenced captures. Do not mark synchronization or live release complete from this pending file.

Exact additional verification text:

> At 23:06:17 UTC, the local repaired revision b6282a2 repeated the public-source execution successfully: the matching yoga listing remained present and both calendar/status packets had no diagnostics. No new model call was made. This is a local-source check, not verification of a hosted release.

Exact terminal validation text, superseding the earlier pending combined-suite statement:

> The combined final local revision b6282a25e5a5712f7992aebb6f4e55a749d038b0 passed all 905 tests, with zero failures, skips or cancellations and exit code 0. The run took 545,695.0883 ms. This verifies local regression behavior, not representative model quality or deployed demo readiness. Final log: artifacts/quality-eval/event-filter-suite-20260914.log.
