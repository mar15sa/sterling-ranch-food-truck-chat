# Information navigation regression repair

## Approved scope and root cause

The owner requested repair of the live trash-information regression and checks for the same failure across other questions. The September 14 planner schema exposed `methods`; a pure navigation question acquired `action` plus `methods`. General retrieval required both, withheld an otherwise current approved source, and emitted an inaccurate review explanation. The existing family test supplied only the ideal `action` plan. Quality scoring ignored structured missing-evidence completion and defaulted to Good/Resolved.

Before: a resident asking where information lives receives an unnecessary review warning. After: a clearly navigation-only request uses the existing approved information-resource response; genuinely requested procedures, amounts, rules, dates and compound tasks retain their evidence obligations. Incomplete answers must not be labeled resolved by the admin scorer.

## Authority and reusable boundary

Use one shared, source-independent information-navigation classifier at interpretation and routing. It supplies no resident facts or destinations. Existing exact approved source identity, claim, freshness and conflict gates remain in force; expired/unapproved evidence cannot become verified. No sources are approved or removed and no connector contracts change. Existing resident presentation is retained; no design change is proposed.

## Verification plan

Replay the captured live planner mistake, multiple alternative model-added facets, service/facility information variants, a second community fixture, explicit methods and compound requests, rules/schedules/transactions, expired and unapproved sources. Verify structured incomplete states cannot receive Resolved and that appropriate safety boundaries are retained. Run the full release gate and test-marked hosted checks before promotion. Production requires the exact verified revision, not merely a local passing test.

## Status

The expanded evaluation also caught a non-AI fallback defect: absent a structured plan, imperative “Open” regained an hours obligation, while generic navigation words could rank an unrelated report above the requested service. A fact-free fallback now preserves navigation semantics; subject-only synonym retrieval and topic matching against reviewed evidence keep generic “page/information” matches out. Navigation may use existing approved action-only projections without approving factual claims, restoring the Internet Service destination. Unmatched navigation cannot fall through to unrelated extractive text. The four correctly spelled waste-navigation variants pass across legacy/structured routing with planning disabled or unavailable (16 replays), in addition to model-driven typo/invented-facet cases, ten adjacent-topic replays and an unknown-topic negative control. This does not claim generic typo correction when AI is unavailable.

Manual review of the initial hosted matrix found that two adjacent navigation answers had completed with an unrelated water-report destination. The old matrix checked completion without checking those destinations; it was insufficient. The matrix now requires completion and topic-correct sources for all ten navigation questions. All ten are also required in the expanded offline release corpus. No initial hosted result is treated as a final pass.

The next staging run at `1f66e750d415c9d1110a87406d31c41a29d9539f` passed 19 of 20 requests, exposing the intentionally unhandled non-AI typo case. Navigation now has a bounded spelling fallback: an alphabetic word of at least six letters can change only when exactly one title word in the same community is one edit away. Short words, numbers, exact names, unknown words and ambiguous alternatives remain unchanged. This supplies search vocabulary only; the same current exact-version approval gates still select the destination. All five waste variants now pass with AI unavailable or disabled in both routing modes (20 replays), plus ambiguous/unknown spelling controls. This is not general typo correction or permission to answer from unapproved titles.

The resident-facing repair is merged in [PR #146](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/146) and verified live at `f7edeaf6178c98462ee3397ac17f672398f04fee` on September 14, 2026 MDT (September 15 UTC). Earlier failed or incomplete checks below are retained as investigation history, not final release evidence.

The first 20-question staging matrix found the reported navigation issue repaired, but also exposed "What day is trash collected?" missing the existing recurring-schedule route. That family now recognizes collected/picked-up wording, while explicit dates and separately requested fees, contacts, methods or other facets cannot be reduced to recurring guidance. The facts still come exclusively from approved evidence.

Scoring separates content safety/usefulness from task completion. The visible rating is capped at Mixed for ordinary incomplete answers, and effort cannot be Resolved. The release evaluator retains all content safeguards and reports unresolved requests separately; the five affected navigation variants have explicit complete-outcome requirements, replaying the actual erroneous planner response. A passing content gate does not mean every source or resident request is complete. Known limitations remain visible rather than receiving cosmetic Good scores, and no new expected source approvals are inferred.

The last-seven-day production audit read all six resident Needs review records: two source-review-required holds, only one pure-navigation hold (the owner's reported question). Only aggregate results were emitted, with no saved question, owner mark or credential changed.

Documentation impact: interpretation boundary, flow diagram and accessible text, and incomplete-score explanation. How the project works, the hub and Owner operations were fetched, updated and fetched again; new diagrams preserve dated historical images. Their status remains implemented/verification-pending until the exact live release is checked. No new source decisions or resident-record edits are authorized by this repair.

## Verified release evidence

- Final application candidate: `79dc871833959d571b5b7e8ed721259298265097`; 39 focused local tests passed.
- [Production CI](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34923404317): 1,087 tests passed. [Staging CI](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34923404644): 1,103 passed, including staging-only work not promoted to production.
- Both full 259-question audits: 47 improved, 207 retained, zero content regressions. Seventeen incomplete requests remain explicit; five exact evidence-boundary cases remain unscored. This is not a claim of universal answer or source completeness.
- Staging `6c988476adc8296393f21a6ca8e9e3dd338a392a`: 20/20 marked hosted checks and [deployment smoke](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34924096892) passed.
- Production `f7edeaf6178c98462ee3397ac17f672398f04fee`: 20/20 marked hosted checks and [deployment smoke](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34924310426) passed. Exact reported question passed three times in each matrix; these are replays, not a claim of independent uncached AI calls.
- Approved-source fingerprint stayed `94c0b7d9ab0b3779fbe4009e01f9639b243ae95688e51da04a8077f2ef041bca` before/after each matrix. No approvals, private records or owner marks changed.

The first production matrix falsely flagged the payment-method control because it expected optional AI-planning metadata. The answer already named the methods and recorded `methods` in both requested and resolved completion details. The verification-only correction checks that shared completion contract, requiring both fields; the repeated matrix then passed 20/20. It changes no resident runtime code. Historical log answers/scores remain saved as originally recorded.
