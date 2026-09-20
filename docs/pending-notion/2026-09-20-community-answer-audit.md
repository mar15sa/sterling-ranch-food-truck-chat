# Pending September 20 audited-answer and rating update

Targets: [How the project works](https://www.notion.so/3dabf909186d8166b507c2a4e1d1aced), including the Assistant diagram and accessible text; [Decisions and their reasons](https://www.notion.so/3dabf909186d8139ac52ebdbf77d8bea); and [Documentation audit and follow-ups](https://www.notion.so/3dabf909186d81a2a090c2cb90183e96).

Status: implemented and staging-verified at revision `18d0024cb6549e0c2615a1ae951e08eceb8358b8`; production unchanged. The Notion connector is unavailable in this task. Fetch each target before editing, preserve unrelated content, then fetch again to verify the new heading, diagram/text, status, and revision link.

## September 20 audited-answer and rating-candidate update

Revision `ad838ef` implements the next local audited-answer candidate on `codex/community-quality-september30`. It is not yet deployed in this record. Production remains unchanged at this checkpoint.

The shared request contract now carries the resident's subject across dependent clauses and ordinary paraphrases instead of relying on question-specific answer text. Examples include recycling cart storage, short-term residential lodging described as paying guests, conditional pool closing time, pickleball open-play and parking follow-ups, DRC email/form requests, RV duration, and leak-relief response time. Each need is answered and checked independently. The auditor now requires subject-matched evidence for camper/RV claims and rejects method mismatches such as hand-watering evidence for an automatic-irrigation question. The composer adds a direct No when a requested duration exceeds a verified maximum and returns the requested official form without unrelated rule text.

The candidate also changes the draft-selection order. Detailed or qualified questions run the focused need-by-need answer first; the richer established answer is retained for short single-purpose questions only when its evidence audit supports it. This removes duplicate connector work for the normal focused path. All seven richer public examples remain preserved by the audited flow.

The automatic-quality rubric is now `resident-quality-rubric-v2-unpublished`. It scores need coverage, grounding, directness, specificity, useful next steps, human readability, and appropriate concision from the selected answer's evidence assessment. It remains `calibrated: false` and `publishable: false`; owner logs must continue to show **Not rated** until owner-labeled positive and negative examples establish agreement and false-positive performance.

Verification on the exact code revision: 32/32 audited detailed holdouts, 62/62 need-router checks, 38/38 request-contract checks, 11/11 rubric checks, 20/20 public-example checks, and a 19-case structural rubric evaluation with zero false complete ratings. The structural rating distribution was 14 Excellent, 4 Good, and 1 Weak; these are diagnostic labels, not owner-calibrated release scores. The old 30-question post-reveal replay is 24/30. Its six remaining literal failures are not current answer failures: three require the exact words `screened location` while the approved answer says `appropriately screened from view behind the wing fence`, and three require the obsolete claim that no pickup deadline exists while the current approved source says containers return by the end of pickup day. The initial 8/30 first-inspectable frozen baseline remains unchanged and must not be replaced by the development replay.

The complete `npm run check` was stopped and must be recorded as incomplete after several quiet minutes. Before the stall, all displayed Assistant/source/grounding/safety checks passed; the one displayed failure was the known Windows sandbox child-process failure for the Atlas catalog. The exact direct Atlas inventory check passed with 125 records, 60 sources, and 100 staging entries accounted for. Do not label the full repository gate passed from this run.

All candidate comparisons in this update made zero model calls, used zero model tokens, and added $0 in model/API cost. No vector database, embedding service, reranker, subscription, or recurring spend was added. The broader product still supports AI inside the guarded contract, but this candidate did not select a new model because prior bounded comparisons did not produce a meaningful enough end-to-end gain. The next step is exact-revision staging deployment and test-mode answer review, followed by owner calibration of the unpublished rubric. Production remains held until the exact candidate is ready and review evidence supports release.

The exact staging revision and health/source evidence are recorded below. Keep proposed, implemented, staging-verified, and production-live states separate.

## September 20 staging verification and resident-friendly composition

Exact revision `18d0024cb6549e0c2615a1ae951e08eceb8358b8` is verified ready on staging with `audited-legacy-candidate`. Health reported 322 sources, zero source failures, no stale source state, and zero expired approved sources or facts. Production remains unchanged.

The final six-question test-mode gate passed 6/6. Every question returned HTTP 200, a verified complete outcome, and support for every requested need. The reviewed answers covered an exact recycling date plus cart storage, indirect short-term-rental wording, current pool status plus seasonal closing time, a camper duration above the allowed limit, shed height plus the actual DRC submission action, and leak-relief follow-up timing plus email. The shared composer now shortens redundant schedule context, converts verified legal and operational wording into concise resident language, extracts the requested closing time, and ranks the action the resident asked to take. These transformations derive their subject, verified value, and action from the answer contract; they are not stored full-question responses and contain no Sterling Ranch-specific answer key.

The staging gate made zero planner, answer, or rewrite model requests and used zero input or output tokens. The updated 32-question audited gate passes 32/32, the targeted human-first staging families pass 13/13, request/rating checks pass 49/49, and the focused final schedule checks pass 3/3. The full repository run remains recorded as incomplete and was not rerun indefinitely.

The answer candidate is staging-verified. The automatic rating remains unpublished and **Not rated** pending owner-label calibration. Production release still requires a clean isolated change against current main because the staging branch contains broader historical divergence. Keep this pending Notion entry unresolved until all three target pages are fetched, updated, and fetched again.

## September 20 clean production integration

The staging-verified answer flow has been rebuilt as a focused release branch from current production `main` revision `e4a260c`, preserving the newer Lucky Bird link and Uptown menu-label changes already in production. This avoids merging the staging branch's unrelated history.

The isolated integration exposed and fixed one shared contract bug: an `hours` task was being passed into the smaller planning-goal vocabulary. That rejected the recurring-hours plan and could turn “What time does the pool normally close on Wednesday?” into a question about the next calendar Wednesday. The coordinator now translates task-only labels to a valid information goal before planning, and the resident composer preserves the requested weekday in the closing-time answer.

Release-copy verification passes the 32/32 audited holdout, 32/32 owner/source/ledger regression group, 105/105 answer-flow/router/request-contract checks, 20/20 public-example checks, and 32/32 fast release checks. The exact recurring-Wednesday regression also passes. All audited holdouts made zero model calls and added $0 in model/API cost. Whitespace and syntax checks pass. The broader full repository run remains recorded as incomplete because of the known Windows child-process problem and was not restarted indefinitely.

Release-candidate revision `4d0ae64` is implemented and locally verified. It is not production-live evidence. The automatic rating remains unpublished and must continue to show **Not rated** until a sufficiently sized owner-labeled calibration set establishes agreement and false-positive performance.
