# Calendar range cache-status repair review

Status: implemented and pushed for review on `codex/calendar-range-cache-status-20260914` in [draft PR #136](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/136); not merged, released, or verified live. Prepared September 14, 2026 from GitHub main revision `e5e533896f9553681193b453fa2492a60dadf7a5`.

## Resident problem and root cause

A calendar question covering more than one day could be labeled healthy even when one or every requested day came from retained cache after a failed official-calendar refresh. The daily connector result correctly reported degraded/partial status with no covered date facets, but the range combiner replaced those states with healthy/ok, restored coverage, and used the newest daily check time.

This affects the whole multi-day calendar family, including broad event ranges and named-activity ranges. It is not a wording-specific defect. The September 14 offline audit reproduced the connector metadata problem; it did not establish that a resident received an incorrect answer.

## Resident outcome

- Before: a mixed or all-retained range could look current and fully covered. A retained empty range could also be worded as though the live calendar had just proved there were no events.
- After: a range is healthy only when every requested day is healthy and fully covers the date facets. Mixed or all-retained ranges stay partial/degraded, expose each day's original status and timestamps, use the oldest check and earliest expiry for the range, and do not claim a trustworthy empty result after a failed refresh.
- Useful retained event records remain available as partial evidence inside the configured retention window. No-cache failures and expired retained evidence still fail closed.

## Evidence, authority, and reuse

- Current event dates, times, locations, registration links, and trustworthy empty results remain controlled by the configured official CivicPlus calendar.
- No resident-facing event facts, community names, URLs, refresh durations, or answer wording were added to shared connector logic.
- The range rule is shared core behavior. Refresh/retention policy, labels, official endpoints, allowed hosts, and community identity remain in each community profile and adapter.
- The implementation uses the existing normalized connector envelope and remains usable by the Castle Rock profile without a core-code change.
- No action-link destination or authority boundary changed.

## Preserved behavior

The checks preserve named-activity filters across daily requests, collection across the full supported range, chronological sorting, duplicate removal, the eight-result cap, the 31-day bound, tenant/source isolation, profile-driven labels, and the presentation rule that puts the first named event once in the lead with only extra matches in details.

## Verification

- Focused offline connector and interpretation suite: 51 passed, 0 failed.
- Complete protected local suite after the final implementation: 818 passed, 0 failed.
- Covered mixed fresh/retained days, all-retained days, HTTP failure without cache, expired cache, healthy populated ranges, healthy authoritative empty ranges, per-day evidence timestamps and coverage, range freshness, filtering, sorting, duplicate input, the eight-result cap, and the 31-day bound.
- Existing cross-community, named-filter, full-range collection, source-boundary, and named-event presentation checks passed.
- No browser or API resident questions were submitted. No live source calls, model calls, paid benchmarks, settings changes, source approvals, or resident-record writes were used for this repair.

## Release evidence still required

This task does not authorize production release. Before any promotion, the exact candidate commit must pass the repository's required review and checks. After an authorized release, verify the deployed revision and current source health before marking the repair released or verified live. Any browser check must use `/community-assistant?test=1` with the Test mode banner visible; any direct Assistant request must include `"isTest": true`.

## Documentation impact

The following Notion pages were fetched before editing, updated to show implementation commit `be795dc2c13b0ed7a77ce6544e3b94574619ffd8` on the review branch in draft PR #136, then fetched again to verify the new text and preserved diagrams/images:

- [Documentation audit and follow-ups](https://www.notion.so/3dabf909186d81a2a090c2cb90183e96): finding advanced from repair pending to implemented locally; the original reproduction attachment remains present.
- [Sterling Ranch Society · Project Guide](https://www.notion.so/3dabf909186d81789a09e4648dbb4bbe): current calendar diagram and accessible explanation now show conservative range status, freshness, and empty-result handling.
- [How the project works](https://www.notion.so/3dabf909186d8166b507c2a4e1d1aced): the matching calendar diagram and accessible explanation were updated while preserving the separate facility/vendor route and earlier images.

All three pages keep production at revision `e5e533896f9553681193b453fa2492a60dadf7a5` and explicitly say the repair is not pushed, merged, released, or verified live.
