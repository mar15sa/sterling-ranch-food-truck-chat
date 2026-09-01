# Community Source Accuracy Operations Plan

## Goal

Keep resident answers current without allowing a new crawl, temporary website failure, duplicate page, or AI judgment to silently replace trusted information.

The simple model is:

1. Watch every eligible official page.
2. Put detected changes in quarantine.
3. Compare changing facts against the controlling source for that exact topic.
4. Require owner review for material changes.
5. Test the exact approved bundle in staging.
6. Release through the protected production branch and verify the live fingerprint.

## Automation schedule

| Automation | Frequency | Purpose | Safe failure behavior |
| --- | --- | --- | --- |
| Live facility status | Every minute | Refresh open/closed status from the live status source. | Keep the last confirmed status only inside its short freshness window; otherwise say it could not be confirmed. |
| Calendar and events | Hourly | Refresh dates, cancellations, and event links. | Quarantine changed dates and preserve the last approved event only while fresh. |
| Sensitive page check | Daily | Check hours, fees, contacts, forms, reservation policies, restrictions, billing, and payment pages with conditional requests. | Unchanged pages remain trusted; changed facts become review items. |
| Complete URL inventory | Nightly | Confirm that every discoverable CAB page is indexed, pending, duplicated, excluded with a reason, or retirement-pending. | Block release and alert if any eligible page is unaccounted for or coverage decreases. |
| Forced content reconciliation | Weekly | Download content even when the server claims it has not changed; catch broken timestamps, orphan pages, and parser drift. | Quarantine differences and require the normal review process. |
| Critical-question retrieval test | Daily and on every release | Confirm the controlling source ranks first for the critical resident questions. | Require 100%; retain production on any miss. |
| Full answer-quality regression | Daily and on every release | Compare resident answers with the approved baseline and test links, grounding, freshness, and unsupported absence claims. | Retain production on any regression, unsupported claim, or broken action link. |
| Review-queue age check | Daily | Find material review items waiting longer than seven days. | Open or update one owner alert; never auto-approve the item. |
| Trusted-fact expiry check | Daily | Find approved facts approaching or passing their freshness deadline. | Alert before expiry; after expiry, withhold the value and link to the official source. |
| Missing controlling-page check | Daily, then again after at least 24 hours | Confirm 404/410 retirement candidates independently. | Never remove information after one failure; create a review item after the first and confirm only after the second. |
| Staging soak | Every proposed release | Exercise the exact candidate fingerprint in staging for the existing soak period. | Do not open the production merge until all checks pass. |
| Production verification | Immediately after release | Verify the fingerprint, critical questions, links, freshness, and source counts against production. | Automatically prepare the prior trusted bundle for protected rollback and alert the owner. |
| Monthly accuracy report | Monthly | Summarize coverage, conflicts, stale facts, review time, retrieval accuracy, broken links, and rollbacks. | Highlight trends and required owner actions; it cannot publish sources. |

## Alert rules

Create one deduplicated owner alert when any of these occurs:

- An eligible official page is unaccounted for.
- Eligible-page coverage decreases.
- A sensitive conflict is unresolved.
- A trusted fact expires or will expire within 24 hours.
- A controlling page disappears or redirects unexpectedly.
- An official resident-action link fails.
- A review waits longer than seven days.
- A critical question ranks a non-controlling source first.
- Staging or production does not serve the expected release fingerprint.

Repeated checks should update the existing alert rather than create alert spam. Recovery should add a final note and close the alert.

## Publishing rules

- AI may extract, compare, and summarize evidence, but it may not approve a fact or resolve an ambiguous sensitive conflict.
- Material page or fact changes require a decision tied to the exact URL, fact key, source version, and content hash.
- Old decisions automatically become invalid when the source hash changes.
- The review dashboard writes immutable decisions to the separate Notion review database; it never writes to production.
- Automatic promotion is limited to unchanged approved facts, exact duplicates, and normalization or metadata-only changes.
- Production promotion uses a protected pull request, never a direct push.
- The released Git report contains the accepted decision snapshot and exact fingerprint.

## Rollout order

### Phase 1: Connect and observe

1. Create the separate Notion source-review database.
2. Configure its token and database identifiers in staging.
3. Deploy the feature branch to staging.
4. Run a complete candidate inventory without promotion.
5. Confirm review cards, filters, links, dates, authority explanations, and hash invalidation.

### Phase 2: First controlled subject release

1. Review facilities, hours, reservations, and fees.
2. Resolve every sensitive conflict with official evidence or CAB confirmation.
3. Require complete page accounting and 100% critical retrieval accuracy.
4. Soak and release only that approved subject batch.
5. Verify production and retain the previous fingerprint for rollback.

### Phase 3: Remaining subject batches

Release in this order:

1. Utilities, trash, contacts, billing, and payments.
2. DRC, landscaping, forms, rules, and restrictions.
3. Events, alerts, and remaining community services.

Each batch must pass the same gates independently. A safe batch should not wait for an unrelated disputed subject.

### Phase 4: Normal operations

1. Enable the daily, nightly, weekly, and monthly schedules above.
2. Review the monthly accuracy report.
3. Expand the critical-question set whenever a resident catches a wrong or incomplete answer.
4. Revisit authority policies whenever the CAB introduces a new controlling system or document type.

## Success measures

- 100% of eligible pages have a recorded classification.
- 100% of critical questions rank the controlling source first.
- Zero unresolved sensitive conflicts in a release.
- Zero expired or unapproved facts used in current resident answers.
- Zero broken resident-action links in a release.
- Zero answer-quality regressions.
- Median sensitive-review time under two business days.
- Every production bundle has a matching review snapshot, release fingerprint, staging result, and rollback target.

## Ownership

- The owner approves sensitive changes and reviews alerts.
- GitHub Actions performs inventory, validation, staging, protected release, and verification work.
- Railway runs the application and short-interval live checks.
- Notion stores the durable review queue and immutable owner decisions.
- Git stores the released source bundle and release report.
