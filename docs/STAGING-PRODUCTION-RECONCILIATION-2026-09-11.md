# Staging production reconciliation — September 11, 2026

## Scope and root cause

Staging had diverged from the approved production revision `f2e51849a237b3ccfcc6a073776acbc893623da6`.  Its homepage and shared Society UI therefore did not necessarily contain the production-approved engraving assets and layout.  The same divergence left two staging expectations behind the live production implementation: the Community Assistant feedback email drafts and the Rules Assistant script cache version.

## Resident impact

Before this reconciliation, a staging reviewer could see a stale Society presentation and stale feedback wording/cache expectation.  After it, staging inherits the approved production UI and weather engraving, shows the approved Community Assistant feedback drafts, and checks the matching Rules Assistant script version.  This release changes no Assistant answer-selection or answer-quality behavior.

## Authority and reuse boundary

The approved production commit is the authority for shared Society UI and weather presentation.  Community Assistant email controls retain their approved, feature-specific wording in the page footer; the shared UI CSS remains reusable across Society pages.  No resident facts, rules, schedules, contacts, or answer copy were added to application logic.

## Reconciliation decision

Merge production revision `f2e51849a237b3ccfcc6a073776acbc893623da6` into staging revision `82e97c4140066d6b08cc9283be6b3a0f624134c5`.  Preserve every non-conflicting staging commit.  Where the three UI files conflicted (`public/openings-editorial.css`, `public/rules-assistant.html`, and `public/society-footer.css`), use the production-approved versions.

## Verification plan

- Run the focused feedback-control and public Rules Assistant regression tests.
- Run the full local quality gate; report any unrelated evidence-freshness blocker without changing answer-quality behavior.
- Confirm the production commit is an ancestor of the resulting staging commit and that its homepage/weather files match exactly.
- Deploy the resulting commit to staging, verify the deployed revision, and review the homepage at desktop and mobile widths.
- Any Community Assistant browser/API test must use `/community-assistant?test=1` or `isTest: true`; this UI-only validation submits no Assistant question.
