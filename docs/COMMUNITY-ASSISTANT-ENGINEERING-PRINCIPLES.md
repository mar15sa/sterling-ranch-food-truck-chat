# Community Assistant engineering principles

These are the durable engineering rules for the Community Assistant. Every implementation plan, code change, review, release, and operational repair must follow them. They exist so that the project does not depend on Marissa repeating the same priorities in each new task.

## The resident outcome

The product must give residents the most helpful accurate answer it can support from official evidence, in plain language, and make the next useful action clear. A response is successful when a resident can act or make a decision without unnecessary research.

Optimize these outcomes together:

- **Helpfulness:** answer the actual question, including the requested detail such as a date, cost, limit, rule, contact, or action.
- **Proactiveness:** identify the next useful step, official action, or one clarification that will unlock the answer. Do not send residents away to broadly search a site when a specific official path is known.
- **Accuracy:** make only claims that the selected official evidence supports, respect freshness, and identify conflicts or gaps rather than guessing.

## Fix causes and question families

1. Start with the failure mechanism, not the wording of the reported question. State the root cause and the family of questions it can affect.
2. Implement the smallest shared behavior that fixes that family safely. A phrase-specific branch is allowed only when the evidence, legal wording, or external interface is genuinely unique; explain why in the plan and review.
3. Treat a route, source-selection, freshness, source-normalization, answer-completion, or action-link defect as a system defect. Test close wording variants and adjacent intents, not just the original report.
4. Preserve working behavior outside the affected family. A repair that helps one resident but weakens a related family is incomplete.

## Evidence and source authority

1. A crawl, discovery result, AI suggestion, prior answer, or convenient website page is not resident evidence by itself. Approved evidence must retain its source identity, content version, review state, and freshness state.
2. Do not store resident-facing facts, amounts, dates, schedules, contacts, rules, or fixed answer wording in application code. Answer content must come from current approved evidence. Shared code may supply source-independent structure and formatting, and routing code may recognize intent, but neither may become a hidden source of truth.
3. Use the controlling adopted code, rule, policy, or amendment for a question about what is required, prohibited, allowed, or enforceable. A process page can explain how to comply; it cannot override the controlling rule.
4. Use the official live system for changing operational facts such as availability, dates, menus, collection schedules, closures, reservations, and current status.
5. Use an official form or action page for the next step only after the governing requirement is established. Label the link by the action it performs.
6. When authoritative sources conflict, report the conflict and offer the safest official resolution path. Do not blend their values into a confident answer.
7. A stale source cannot receive a verified resident-facing label. An unchanged, identity-matched source may renew only through the approved refresh process; changed or new material stays in review.

## Answer completion

1. Give a verified partial answer before asking for a missing detail when doing so is safe.
2. When wording is ambiguous, ask the single question that removes the most uncertainty. When evidence is missing or conflicting, say what is known and name the next best official move.
3. Do not use generic handoffs such as “check the website” when the product knows the relevant official page, action, source conflict, or missing detail.
4. Treat multi-part questions as multiple coverage obligations. The response must make clear which parts are answered and which remain open.

## Reusable CivicPlus product boundary

1. Core routing, evidence, freshness, answer, and connector logic must work from a community profile and adapter contract. Do not add Sterling Ranch URLs, names, facilities, village mappings, labels, or vendor assumptions to shared code.
2. A profile owns official domains, connector instances, authority order, action labels, facility vocabulary, refresh cadence, and launch evaluations. An adapter owns a connector's normalized output and degradation behavior.
3. A feature is not reusable merely because a second profile loads. It must be configurable for a second CivicPlus community without a core-code edit, and its source and authority behavior must be tested for both communities where applicable.
4. Keep a specialist page when it supplies useful browsing, maps, menus, dates, status detail, or a dedicated workflow. The Community Assistant remains answer-first and hands off only for that added value.

## Required planning and review evidence

Before implementation, write down:

- the resident problem, root cause, and affected question family;
- resident behavior before and after the change;
- the authoritative source decision and freshness/conflict handling;
- the reusable boundary: core, profile, and adapter responsibilities;
- live-source failure behavior and any action-link safety impact; and
- family-level tests and release evidence needed to prove the change.

A reviewer rejects a one-question patch unless the author has demonstrated that the problem is genuinely unique and contained.

## Release gates

No change advances when the relevant evidence is missing. The release record must show:

1. automated questions were explicitly marked as test traffic;
2. the tests cover the reported question and its family, including authority and degradation cases where relevant;
3. current live or approved sources support the expected answer, and stale source behavior is safe;
4. the exact candidate build passed the required local, hosted, and staging checks; and
5. resident-facing before/after behavior, authority decision, and remaining limitations are reviewable.

Documentation-only changes may skip runtime deployment checks, but they must still be reviewed for consistency with these rules and the existing test-mode and publishing instructions.
