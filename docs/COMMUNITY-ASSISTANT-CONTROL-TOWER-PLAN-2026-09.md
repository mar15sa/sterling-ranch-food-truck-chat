# Community Assistant control-tower plan

Updated September 9, 2026. This is the source-of-truth work plan for concerns 1–4 and item 6. It supplements the engineering principles, connector architecture, and source-accuracy plan. When documents disagree, the stricter claim-level evidence boundary controls.

## Outcome and non-negotiable rules

The Assistant should answer the resident's actual question as fully as current official evidence allows, state a useful next step, and never fill a gap with canned prose. The implementation must fix failure families rather than add one-question patches, work through community profiles and connector contracts, and remain portable to other CivicPlus communities.

For resident-facing static claims, approval is tied to the community, exact URL, exact SHA-256 content version, and exact claim or action. A crawl, trusted-baseline label, full-page review record, keyword match, AI draft, or specialist connector cannot broaden that approval. Dynamic connectors may control only their declared current operational facets. Binding rules come from controlling rule sources.

## Fixed progress ledger

The current audited score is 79 of 100 points. The denominator stays fixed; newly discovered risks are recorded separately instead of silently lowering completed work. Points increase only after a change is integrated and its required checks pass. This update records the exact owner-approved operational sources, the family-level shortcut and collision repairs, the permanent resident-literal guard, profile-driven event and pool behavior, and the approved UI. The remaining 21 points are mostly source-inventory disposition and the removal or evidence-gating of older migration debt.

| Area | Complete | Closure still required |
| --- | ---: | --- |
| Answer quality and ambiguity | 21/25 | Remove or evidence-gate the remaining 87 scanner-tracked migration-debt nodes and repeat the hosted family checks. |
| Durable engineering priorities | 15/15 | Keep the permanent rules enforced in every implementation, automation, and release review. |
| Reusable connector architecture | 17/20 | Finish facility operations through approved profile-driven claims and actions. |
| Source completeness and decisions | 11/25 | Resolve or withhold remaining exact versions and work down the 222-page eligible inventory backlog. |
| Approved UI and feedback controls | 15/15 | Promote the approved implementation with the exact accuracy release after hosted staging passes. |
| **Total** | **79/100** | |

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

**Current status:** The exact claim gate, generic grounded composer, adversarial wording checks, current-status boundary, mixed live/static authority tests, and the shared water-usage-versus-billing routing repair are integrated in the local PR #65 candidate. Reachable fixed pickleball, pool-color, fee, delinquency, contact, calendar, tree-removal, quiet-hours, mailbox, Instagram, helipad, and HOA-contact answer shortcuts have been removed or moved behind exact approved projections. Pool holiday hours, DRC contact and submission, conditional rain-barrel routing, UtilityHawk monitoring, water payment, current fees, and delinquency answers now retain their separate controlling-source roles. Facility booking remains safely withheld because its current booking facts and action are not approved; collision tests keep it separate from pool pages and residential rental rules. The exact candidate passes 594 implementation checks, 140 rule variants, 7 unseen variants, the 122-question resident corpus, and the 249-question comparison with 229 Excellent, 20 Good, zero Weak, zero regressions, and zero high-effort answers. The controlling-source retrieval gate passes 20/20. Production still uses the earlier baseline behavior until hosted staging passes and PR #65 is merged.

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

**Current status:** A reusable connector adapter contract is integrated locally for community identity, endpoints, hosts, capabilities, facets, source roles, freshness, degradation, labels, and vocabulary. Castle Rock proves a second CivicPlus profile. Calendar, waste, food-truck, and pool-status paths use profile-driven evidence and keep their authority narrow. The approved Society UI also reads general events through the profile-driven calendar path. The standalone food-truck and pool pages retain their existing services, while the Community Assistant answers from the same governed evidence instead of copying their wording. Facility requests now preserve rule, freshness, and withheld-source precedence across booking, access, cost, pool, and residential-rental collisions. General facility facts and transaction actions still need exact owner approvals before full operational parity.

**Completion evidence:** Each active connector emits the common evidence envelope; every final claim retains its controlling source role; source/action data cannot cross communities; mixed-claim tests preserve separate authorities; specialist handoffs remain useful; no Sterling Ranch URL, label, village mapping, or facility assumption is required in shared core logic.

## Workstream 4: source completeness and accuracy-plan reconciliation

**Resident problem:** The earlier production bundle was described too broadly even though it represented a reviewed shortcut baseline rather than full official-site, exact-claim coverage.

**Decision:** Preserve safe approved answers while completing the larger source inventory in small evidence-bound batches. Captured, indexed, or official does not mean approved. Do not combine counts from different crawl snapshots.

**Current status:** The exact release index has 273 source records and a 222-page eligible inventory backlog. Its decision ledger has 30 unique source versions: 5 approved-evidence versions, 25 pending-review versions, and 22 narrow claim/action approvals across the approved versions. Source and action checks report zero failures, zero expired approved sources or facts, and current approved evidence. The branch imports the owner's water, fee, payment, billing, delinquency, pool-hours, DRC, conditional rain-barrel, and UtilityHawk decisions only within their stated boundaries. A separate later live inventory snapshot remains larger and is tracked separately; captured or eligible pages are still not approved evidence. Full source disposition is not complete.

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

**Current status:** The owner approved the new editorial design and Society palette. The shared navigation, main page and subpage design, profile-driven event cards, Community Assistant shell, and “Report a bug” / “Request a feature” controls are included in the PR #65 candidate. Their email-draft behavior does not send automatically. Staging still needs the exact final candidate revision; production still uses the previous interface.

**Verification:** Desktop, mobile, interaction, loading, error, source-detail, and feedback states are included in the reviewed implementation evidence. Final production promotion remains tied to the same accuracy and source gates as the Assistant release.

## Integration and release order

1. Push the exact locally green candidate to PR #65 and the staging branch.
2. Wait for GitHub and Railway to build that exact revision.
3. Verify hosted source fingerprints, source freshness, the approved UI, feedback controls, AI composition, specialist degradation, and representative question families. Use only `/community-assistant?test=1` or API requests containing `"isTest": true`.
4. Merge PR #65 through the protected route only after hosted staging and required checks pass.
5. Verify the exact production revision and repeat the resident-critical test questions with test labeling.
6. Continue source disposition and migration-debt removal as separate workstreams after this release.

## Approval register

Already authorized and imported exactly: the stated 2026 water/rate/fee decisions, delinquency policy, water-payment pages, card-processing fee, water-bill explanation, monthly-fee payment page, current pool-hours page, current DRC contact/general submission method, conditional rain-barrel submission route, and current UtilityHawk water-monitoring FAQ. Every stated exclusion remains binding.

No further owner approval is required to stage and release this exact candidate; standing push and protected-merge approval is already recorded. A separate CAB Resource Center phone proposal and other evidence-ready continuity proposals remain future source-review decisions.

Still withheld: amenity-form action, CivicRec facility booking/action evidence, the controlling trash-screening rule, the CAB Resource Center phone, and every other pending or conflicted record. These require their own exact decisions before use.
