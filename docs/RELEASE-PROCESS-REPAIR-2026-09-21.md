# Bounded release-process repair — September 21, 2026

Status: owner-approved, implemented and focused checks passed; protected production release pending.

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

## Task coordination and automation

The Atlas task confirmed an independent loopback preview and stopped shared-staging pushes while the Assistant release proceeds. The existing daily fixer automation was updated through Codex's automation tool to start from current production and coordinate staging. Its original publication authority, schedule, model, complete checks, and staging/approval requirements were preserved verbatim; only preparation guidance was appended.

## Documentation impact

Update the release section of [Owner operations and privacy](https://www.notion.so/3dabf909186d81028da2d4e84f033e77) after protected release, preserving unrelated historical material. Explain the narrow scopes, full-check boundaries, production-based fixes, staging reservation, and separate local previews; record this PR, the exact merged revision, deployment result and verified date. The Assistant routing diagram does not change because this patch changes release operations only. Until readback verifies the Notion update, synchronization remains pending.
