# Bounded release-process repair — September 21, 2026

Status: owner-approved, released through protected PR #173, and verified live September 21, 2026 at 20:15 UTC / 2:15 p.m. MDT.

## Problem and scope

The September 21 investigation found unrelated source renewal blocking small changes, repeated full local checks, and two tasks advancing shared staging during validation. The repair changes release tooling and task coordination. It does not change resident answers, source approvals, authentication, storage, credentials, subscriptions, hosting configuration, or the resident-literal baseline.

The required `quality` job now selects exact-file scopes for documentation, openings data and owner-display assets. Shared server/storage/security, Assistant/source changes, dependencies, workflow changes and mixed runtime areas retain the complete gate. The same classifier selects post-deployment checks. Owner-display verification checks assets and unauthenticated API denial without retrieving private records or writing questions. Scope tests cover unknown paths, mixed changes, renames and empty diffs.

The complete gate itself is preserved. Its wrapper adds timing, periodic progress and immediate failure propagation. A local atomic staging reservation coordinates repository worktrees; it is not a server-enforced or cross-machine lock. The operating rules require production-based fix branches, scoped promotion, focused tests before the final complete check, and local experimental previews. Existing staging/approval requirements remain applicable.

## Verification before release

- Fast repository checks: 44 passed.
- Owner-display path: 17 release/deployment contract checks and 33 privacy/session/storage/page/test-label checks passed, plus JavaScript syntax.
- Openings path: 17 release/deployment contract checks, valid 134-entry catalog/62 source channels, syntax, and eight openings/environment checks passed.
- Documentation path: 17 release/deployment contract checks passed.
- Reservation regression proves a second task cannot acquire or release another task's reservation.
- Production release requires the full protected gate because this patch changes CI and shared release tooling. A narrow scope cannot exempt its own classifier or workflow change.

## Protected release and live result

[PR #173](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/173) merged normally as [`74ff3b120b2b3316149d2ee1ccef97bff36bab71`](https://github.com/mar15sa/sterling-ranch-food-truck-chat/commit/74ff3b120b2b3316149d2ee1ccef97bff36bab71). The [final combined protected check](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/35648655126) passed 1,288 tests, 140 rule variants, seven unseen cases, the 122-question resident corpus, the 259-question Assistant audit and 20/20 controlling-source retrieval checks. The full command completed in 421 seconds. The initial local full gate passed all 1,287 tests in 817 seconds before the separately released rating-note test joined the final candidate. Counts and timings describe those runs, not a performance guarantee.

The [exact production deployment check](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/35649574891) passed. Public health independently reported the exact `74ff3b1` revision ready, with current approved evidence, zero source failures, zero expired approved sources/facts and zero expired owner observations at 20:15:45 UTC. The active answer flow remained `audited-legacy-candidate`.

This release retains the independently verified [Halloween/lighting correction, PR #172](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/172), and [owner ratings/notes, PR #171](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/171). The Halloween release was verified with test-labeled production questions: decorations use the 30-days-before/after rule, while seasonal lights use the separate October 1–January 31 policy. The private rating page was inspected without changing resident records. A separately discovered UtilityHawk alert-routing issue remains separate follow-up work; it does not revoke these observed release results.

## Task coordination and automation

The Atlas task confirmed an independent loopback preview and stopped shared-staging pushes while the Assistant release proceeds. The existing daily fixer automation was updated through Codex's automation tool to start from current production and coordinate staging. Its original publication authority, schedule, model, complete checks, and staging/approval requirements were preserved verbatim; only preparation guidance was appended.

## Documentation impact

The [Owner operations and privacy guide](https://www.notion.so/3dabf909186d81028da2d4e84f033e77) was fetched, updated and read back on September 21 after exact production verification. It records the narrow scopes, full-check boundaries, production-based fixes, staging reservation, local previews, verified revision and release links. The current source-health snapshot was updated from the morning alarm to the verified healthy state, preserving historical context and the independently updated rating-note explanation. The Assistant routing diagram is unchanged by this process patch. The separate Halloween task updated and read back its affected diagram and explanation in [How the project works](https://www.notion.so/3dabf909186d8166b507c2a4e1d1aced) and the [guide hub](https://www.notion.so/3dabf909186d81789a09e4648dbb4bbe).
