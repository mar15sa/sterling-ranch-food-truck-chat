# Community Assistant control-tower plan

Updated September 10, 2026. This is the source-of-truth work plan for concerns 1–4 and item 6. It supplements the engineering principles, connector architecture, and source-accuracy plan. When documents disagree, the stricter claim-level evidence boundary controls. The Society redesign and other general UI work are explicitly outside this goal and will continue separately after the accuracy goal is complete.

## Outcome and non-negotiable rules

The Assistant should answer the resident's actual question as fully as current official evidence allows, state a useful next step, and never fill a gap with canned prose. The implementation must fix failure families rather than add one-question patches, work through community profiles and connector contracts, and remain portable to other CivicPlus communities.

For resident-facing static claims, approval is tied to the community, exact URL, exact SHA-256 content version, and exact claim or action. A crawl, trusted-baseline label, full-page review record, keyword match, AI draft, or specialist connector cannot broaden that approval. Dynamic connectors may control only their declared current operational facets. Binding rules come from controlling rule sources.

## Fixed progress ledger

The current audited score is **88 of 100 points** for the non-redesign goal. The denominator stays fixed; newly discovered risks are recorded in the matching area instead of silently lowering completed work. Points increase only after a change is integrated and its required checks pass. The remaining 12 points are the three connector corrections listed below, the long-tail source disposition/conflict work, the last tracked resident-copy migration debt, and production promotion/verification.

| Area | Complete | Closure still required |
| --- | ---: | --- |
| Answer quality and ambiguity | 24/25 | Remove or evidence-gate the remaining 60 scanner-tracked migration-debt nodes. |
| Durable engineering priorities | 15/15 | Keep the permanent rules enforced in every implementation, automation, and release review. |
| Reusable connector architecture | 15/20 | Implement or retire CivicRec as a factual authority, verify waste schedules per service area, and remove the food-truck connector's fixed 2026 horizon/brittle parsing. |
| Current approved-source safety | 20/20 | Preserve exact claim/action approval, fail-closed renewal, authority, freshness, and conflict gates. |
| Full source coverage and decisions | 6/10 | Resolve or explicitly withhold remaining exact versions and work down the separately reported inventory backlog. |
| Feedback controls | 5/5 | Preserve the working report-a-bug and feature-request email-draft behavior through production promotion. |
| Release verification | 3/5 | Create and merge the protected production PR, then verify the exact production revision and resident-critical Test-mode questions. |
| **Total** | **88/100** | The redesign is excluded from both numerator and denominator. |

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

**Current status:** The exact claim gate, generic grounded composer, adversarial wording checks, current-status boundary, mixed live/static authority tests, and shared routing repairs are integrated in branch `codex/literal-guard-correctness-20260910`. Reachable fixed-answer shortcuts have been removed or moved behind exact approved projections, and the resident-literal guard blocks new factual or community-specific canned wording. Pool holiday questions now separate the known season and regular weekday schedule from unverified holiday-specific hours. Fence questions select the applicable source clause and include Sherwin-Williams #3002 “Belvedere Tan” for three-rail/cedar fencing or Solomon #338 “Earthen” for concrete fencing without mixing the two. AI-proposed detail requirements are discarded unless the resident actually requested that detail. The candidate passes 626 implementation tests, the 122-question resident corpus, the 249-question comparison with zero weak answers or regressions, and the 20/20 controlling-source retrieval gate. Hosted staging on revision `6e92036891dbbf98348d64afa6dcfd6c36ffd014` passed the resident-critical Test-mode questions. Production still uses the earlier behavior until the protected PR is created and merged.

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

**Current status:** A reusable connector adapter contract is integrated for community identity, endpoints, hosts, capabilities, facets, source roles, freshness, degradation, labels, and vocabulary. Castle Rock proves a second CivicPlus profile for the capabilities it declares. Calendar, waste, food-truck, and pool-status paths use profile-driven evidence and keep their authority narrow. The standalone food-truck and pool pages retain useful browsing/detail experiences, while the Community Assistant answers from the same governed evidence. Facility requests preserve rule, freshness, and withheld-source precedence across booking, access, cost, pool, and residential-rental collisions.

The September 10 audit found three separate remaining architecture gaps. CivicRec is ranked as a current facility authority but has no live retrieval adapter, so it must either gain a real evidence envelope or be treated only as a booking destination. Waste village dates are derived from one configured reference address and offsets; they need provider proof per service area or a resident-address lookup. Food-truck retrieval accepts only 2026 and relies on a brittle text format; it needs a rolling validated date policy and structural CivicPlus parsing. These are separate implementations and must not be mixed into the current reliability release.

**Completion evidence:** Each active connector emits the common evidence envelope; every final claim retains its controlling source role; source/action data cannot cross communities; mixed-claim tests preserve separate authorities; specialist handoffs remain useful; no Sterling Ranch URL, label, village mapping, or facility assumption is required in shared core logic.

## Workstream 4: source completeness and accuracy-plan reconciliation

**Resident problem:** The earlier production bundle was described too broadly even though it represented a reviewed shortcut baseline rather than full official-site, exact-claim coverage.

**Decision:** Preserve safe approved answers while completing the larger source inventory in small evidence-bound batches. Captured, indexed, or official does not mean approved. Do not combine counts from different crawl snapshots.

**Current status:** The deployed staging snapshot has 274 source records. Its exact-version startup check renewed all 47 due official page groups, with zero review failures, zero expired approved sources or facts, and zero crawl failures. The branch imports the owner's water, fee, payment, billing, delinquency, pool-hours, DRC, conditional rain-barrel, and UtilityHawk decisions only within their stated boundaries. The broader inventory crawl is tracked separately and currently reports 910 eligible URLs still awaiting processing; the review system also contains a much larger long-tail candidate queue. Captured, eligible, or candidate material is not approved evidence. Full source disposition and resolution of the 17 recorded conflicts are not complete. The older `approvedFactCount: 649` snapshot field is migration metadata and must not be presented as the count of exact owner-approved facts.

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

**Current status:** “Report a bug” and “Request a feature” controls are present in the Community Assistant conversation area and shared footer. They open contextual email drafts and explicitly state that nothing sends automatically. They are present in staging. General page redesign work and its visual approval are outside this goal. Production still needs the feedback controls promoted with the protected reliability release.

**Verification:** Add a small static interaction check for the two accessible links, their Community Assistant-specific email subjects/body prompts, and the disclosure that nothing sends automatically. Final production promotion remains tied to the same accuracy and source gates as the Assistant release.

## Integration and release order

1. The exact locally green candidate is pushed to `codex/literal-guard-correctness-20260910`; staging revision `6e92036891dbbf98348d64afa6dcfd6c36ffd014` is healthy and verified.
2. Create a protected production PR containing only the reliability/source-accuracy branch. Do not include the separate redesign work.
3. Wait for required GitHub checks, review the exact diff, and merge through the protected route.
4. Verify the exact production revision and repeat the resident-critical questions with `/community-assistant?test=1` or API requests containing `"isTest": true`.
5. Continue the three connector corrections, source disposition, conflict resolution, and migration-debt removal as separate worktrees.

## Approval register

Already authorized and imported exactly: the stated 2026 water/rate/fee decisions, delinquency policy, water-payment pages, card-processing fee, water-bill explanation, monthly-fee payment page, current pool-hours page, current DRC contact/general submission method, conditional rain-barrel submission route, and current UtilityHawk water-monitoring FAQ. Every stated exclusion remains binding.

No further source-content decision is required to stage and release this exact candidate. Standing push approval is recorded. The Codex automatic approval reviewer separately requires an explicit authorization to create the GitHub production PR because it treats the PR and its description as a new external disclosure. A separate CAB Resource Center phone proposal and other evidence-ready continuity proposals remain future source-review decisions.

Still withheld: amenity-form action, CivicRec facility booking/action evidence, the controlling trash-screening rule, the CAB Resource Center phone, and every other pending or conflicted record. These require their own exact decisions before use.
