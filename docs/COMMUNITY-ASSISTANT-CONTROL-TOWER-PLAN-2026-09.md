# Community Assistant control-tower plan

Updated September 9, 2026. This is the source-of-truth work plan for concerns 1–4 and item 6. It supplements the engineering principles, connector architecture, and source-accuracy plan. When documents disagree, the stricter claim-level evidence boundary controls.

## Outcome and non-negotiable rules

The Assistant should answer the resident's actual question as fully as current official evidence allows, state a useful next step, and never fill a gap with canned prose. The implementation must fix failure families rather than add one-question patches, work through community profiles and connector contracts, and remain portable to other CivicPlus communities.

For resident-facing static claims, approval is tied to the community, exact URL, exact SHA-256 content version, and exact claim or action. A crawl, trusted-baseline label, full-page review record, keyword match, AI draft, or specialist connector cannot broaden that approval. Dynamic connectors may control only their declared current operational facets. Binding rules come from controlling rule sources.

## Fixed progress ledger

The current audited score is 69 of 100 points. The denominator stays fixed; newly discovered risks are recorded separately instead of silently lowering completed work. Points increase only after the change is integrated and its required checks pass. This update adds six points to the 63-point baseline: two for removing the reachable fixed pickleball path, three for completing the source-governed food-truck migration, and one for renewing the exact approved source versions without changing approval scope.

| Area | Complete | Closure still required |
| --- | ---: | --- |
| Answer quality and ambiguity | 18/25 | Remove or evidence-gate the remaining reachable static answer paths; pass the family, collision, degradation, and hosted checks. |
| Durable engineering priorities | 14/15 | Keep the permanent rules enforced in every implementation and release review. |
| Reusable connector architecture | 14/20 | Finish pool-status and facility parity without Sterling-only answer logic. |
| Source completeness and decisions | 9/25 | Import only approved exact decisions, resolve or withhold conflicts, and work down the eligible-page disposition backlog. |
| Approved UI and feedback controls | 14/15 | Promote the already approved staging implementation with the accuracy release after its gates pass. |
| **Total** | **69/100** | |

## Workstream 1: answer quality, ambiguity, and incorrect shortcuts

**Resident problem:** A simple or ambiguous question can be misrouted, answered from unrelated text, or receive an incomplete handoff. Older topic templates can bypass the intended grounded-AI path.

**Root cause:** The application historically had several competing answer producers: rule templates, proactive topic shortcuts, live connectors, static search, and AI composition. Some paths decided wording and authority before exact claim approval and completion were checked.

**Target behavior:**

- Interpret the resident's goal and requested details once.
- Return any safe verified part of a multi-part answer.
- Ask one high-value clarification only when it unlocks missing information.
- Compose static answers from exact approved claim projections through the generic grounded composer, with a deterministic projection-only fallback.
- Keep live connector answers narrow to current facts they actually observed.
- Reject unsupported AI language and unsupported template language sentence by sentence.

**Current status:** The exact claim gate, generic grounded composer, adversarial wording checks, current-status boundary, mixed live/static authority tests, and the shared water-usage-versus-billing routing repair are integrated in release candidate PR #65. The reachable fixed pickleball answer has been removed. The Community Assistant food-truck path now ignores historical local event overrides and static menu registries and uses the configured official live calendar instead. The broad combined gate passes 535 tests, 140 rules evaluations, 7 unseen evaluations, and the 122-question resident corpus; the final Community Assistant release check correctly holds on four pending exact source decisions rather than inventing those answers. Fixed pool-color interpretations remain the next release blocker. The exact monitoring source remains withheld pending owner approval, so water-monitoring questions fail closed instead of borrowing payment authority. Production still uses the earlier baseline behavior.

**Completion evidence:** Former shortcut families cannot be unlocked by full-page approval; changed hashes withdraw claims; partial compound answers retain independent verified parts; representative rule, facility, payment, contact, status, event, food-truck, and trash families pass normal and degraded tests; exact staging test traffic passes with AI composition observed where expected.

## Workstream 2: durable engineering priorities

**Resident problem:** Root-cause, helpfulness, proactiveness, accuracy, and CivicPlus portability should not depend on the owner repeating them in every task.

**Target behavior:** Every plan, pull request, implementation, review, and release identifies the failure mechanism, affected question family, authority decision, reusable boundary, degraded behavior, and family-level proof.

**Current status:** The root-cause, resident-outcome, authority, and CivicPlus rules are active in `AGENTS.md`, the pull-request template, and `docs/COMMUNITY-ASSISTANT-ENGINEERING-PRINCIPLES.md`. The release candidate adds an explicit permanent rule that resident-facing facts and fixed answer wording cannot live in application code; routing may recognize intent but cannot supply the answer. The active Daily Community Assistant improvement fixer now repeats this exact boundary in its saved instructions, requires family-level repairs and broad regressions, and cannot publish when evidence or checks are incomplete.

**Ongoing gate:** Reject phrase-specific fixes unless the evidence or interface is genuinely unique. Reject changes that omit a current-vs-proposed resident outcome, authority mapping, failure behavior, or portability explanation.

## Workstream 3: specialist tools, connectors, and source authority

**Resident problem:** Food trucks, events, waste, pool status, facilities, forms, and other specialist tools add current information, but duplicated decision-making can send the resident to the wrong tool or let one source type prove another claim.

**Decision:** Keep a specialist connection when it adds live structured facts or a useful workflow. The Assistant answers first and offers the specialist page for browsing, menus, maps, reminders, registration, booking, or transactions.

**Authority boundaries:**

- Controlling rulebook: permissions, prohibitions, required approvals, restrictions, and enforceable standards.
- Live operational connector: current event dates, service dates, availability, menu association, closures, and status.
- Current transaction or process source: booking, payment, registration, submission, and current operational fees.
- Action link: where to complete the already established step; it cannot prove the underlying rule or amount.

**Current status:** A reusable connector adapter contract is integrated locally for community identity, endpoints, hosts, capabilities, facets, source roles, freshness, degradation, labels, and vocabulary. Castle Rock proves a second CivicPlus profile. The calendar path now preserves tenant and date-range evidence and cannot validate a static booking claim. Waste scheduling uses the same contract: Sterling-specific endpoints, locations, offsets, labels, actions, and degradation behavior live in the community profile; every displayed area date requires fresh operational evidence; unsupported holiday wording and the uncited fixed bin instruction are withheld. The Community Assistant food-truck path now uses its community profile and exact configured official calendar, rejects alternate same-host pages, unsupported years, and malformed schedule layouts, and withholds menus and prices until exact vendor identities and URLs are reviewed. The standalone food-truck page retains its existing service. Pool status and facilities still need full envelope parity and held-out degradation tests.

**Completion evidence:** Each active connector emits the common evidence envelope; every final claim retains its controlling source role; source/action data cannot cross communities; mixed-claim tests preserve separate authorities; specialist handoffs remain useful; no Sterling Ranch URL, label, village mapping, or facility assumption is required in shared core logic.

## Workstream 4: source completeness and accuracy-plan reconciliation

**Resident problem:** The earlier production bundle was described too broadly even though it represented a reviewed shortcut baseline rather than full official-site, exact-claim coverage.

**Decision:** Preserve safe approved answers while completing the larger source inventory in small evidence-bound batches. Captured, indexed, or official does not mean approved. Do not combine counts from different crawl snapshots.

**Current status:** The reviewed release bundle has 267 source records, 1,140 discovered URLs, 757 eligible URLs, and a 222-page pending inventory. A separate later live inventory found 1,510 discovered URLs, 1,079 eligible URLs, and an 894-page backlog; those snapshot counts are tracked separately. The strict approval layer contains 18 explicitly approved fact projections. Another 624 trusted-baseline facts remain candidates rather than owner approvals. Seventeen conflicts remain. Full coverage is not achieved. The strict branch imports the owner's water, fee, payment, billing, and delinquency decisions only within their stated boundaries. The exact-version verifier revalidated all 46 approved URLs and renewed 164 due source records with no changed or held source, no broken action, and no change to the approved fingerprint.

**Review order:**

1. Current money, contacts, payment, and reservations.
2. DRC, landscaping, and property changes.
3. Utilities, trash, water quality, and equipment support.
4. Facilities, recreation, events, and current services.
5. Governance, historical material, maps, and long-tail documents.

**Completion evidence:** Every eligible official URL has one disposition; every resident-facing material claim has an exact owner decision and controlling-source role; changed hashes automatically withhold old approvals; conflicts are resolved or explicitly withheld; unreadable and historical sources cannot appear as current authority; backlog and approved-bundle health are reported separately.

## Workstream 6: report a bug and request a feature

**Resident problem:** Community Assistant users need the same clear feedback path available in Food Truck Chat.

**Target behavior:** Add accessible “Report a bug” and “Request a feature” controls to the shared approved page shell and the Assistant conversation area. Use the existing email-draft behavior with page-specific context; nothing sends automatically.

**Current status:** The owner approved the new editorial design and Society palette. The shared navigation, main page and subpage design, Community Assistant shell, and “Report a bug” / “Request a feature” controls are implemented in PR #65 and deployed to staging. Their email-draft behavior does not send automatically. Production still uses the previous interface.

**Verification:** Desktop, mobile, interaction, loading, error, source-detail, and feedback states are included in the reviewed implementation evidence. Final production promotion remains tied to the same accuracy and source gates as the Assistant release.

## Integration and release order

1. Finish and review the static-shortcut/root-routing repair; keep missing-evidence cases withheld.
2. Integrate connector envelopes and the shortcut repair into one strict candidate; resolve the four real routing regressions.
3. Run the broad local family suite. Classify every remaining failure as a deliberate evidence hold, a true regression, or an obsolete test; no unexplained failures advance.
4. Present only evidence-complete source cards for owner decision. Import each approval exactly as stated; treat skips as deferred and keep the four not-ready records withheld.
5. Re-run source, authority, grounding, ambiguity, connector, and resident-effort suites against the exact candidate.
6. Push the feature branch and open a reviewable pull request. Deploy the exact commit to staging and test only through `/community-assistant?test=1` or API requests containing `"isTest": true`.
7. Verify hosted source fingerprints, current-source freshness, AI-composer use, specialist degradation, and representative question families. Promote only the reviewed exact candidate through the protected release route.
8. Promote the already approved and validated shared shell and feedback controls with the same exact candidate once the accuracy and source gates pass.

## Approval register

Already authorized for exact import: the stated 2026 water/rate/fee decisions, delinquency policy, water-payment pages, card-processing fee, water-bill explanation, and monthly-fee payment page. Their exclusions remain binding.

Still requires owner action for this release: the exact current pool-hours page, current DRC contact/general submission method, conditional rain-barrel submission route, and exact UtilityHawk water-monitoring FAQ. Other evidence-ready continuity proposals remain future source-review batches.

Still withheld outside the four immediate decisions: amenity-form action, CivicRec facility booking/action evidence, the controlling trash-screening rule, and every other pending or conflicted record. These require their own exact evidence before approval.
