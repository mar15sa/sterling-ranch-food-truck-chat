# Community Assistant first-principles reset — September 15, 2026

Status: local decision and first repair only. No model comparison, paid model call, source approval, setting change, release, or resident question occurred in this phase.

## Resident outcome

A resident should receive the answer to every part of the question, using current authoritative evidence, in plain language, with the most useful next step when one exists. The system must never label an answer complete or excellent merely because its internal route completed successfully.

## What the completed traces establish

The current flow can lose part of the request before retrieval and then evaluate the answer against that smaller request:

- “Which food truck is here today, and what is on its menu?” was represented as only a `date` detail. The answer named the truck, admitted the menu was missing, and still carried a complete verified result.
- “What’s the next recycling pickup for Ascent Village, and where can I keep my bins?” was represented as only an `action` detail. The current answer omitted the pickup date, included unrelated landscaping text, and still carried a complete verified result.
- “Is the pool open right now, and what are the regular hours?” preserved the two goals, but an early connector decision rejected live status because the primary goal was schedule. Both requested parts were withheld even though the status connector could answer one independently.
- A CAB reporting question selected a water-billing contact, showing that a completed contact route does not establish subject relevance.

The shared completion layer runs after many specialized early-return paths. It reconstructs requested details from the original wording or trusts the details attached by the selected path. It has no stable list of the resident’s individual needs and no proof that each need received relevant evidence. The automatic rating then scores presentation and metadata proxies and defaults an answer without a recognized defect to Good. The owner audit found positive automatic ratings on 17 of 25 answers the owner had marked Needs work.

This is one system failure: **the product does not preserve the resident’s complete request as the invariant that every later stage must satisfy.** More model comparisons, a vector database, or more phrase exceptions cannot repair that invariant by themselves.

## Architecture decision

Freeze broad model selection. Replace the route-first contract with a need-first contract:

1. Turn the current question and safe conversation context into a list of distinct resident needs. Each need retains its subject, requested outcome, conditions, date or location, and original wording.
2. Retrieve evidence independently for each need. One source or connector may satisfy several needs, but success on one cannot erase another.
3. Record for each need whether it is supported, missing, ambiguous, conflicting, or blocked by an unavailable live source.
4. Give the writer only the resident needs and the approved evidence assigned to each need. The writer may improve wording; it may not change exact qualifications or mark needs complete.
5. Validate the final answer against the same need list. A verified partial answer must name the unresolved need and preserve every supported one.
6. Derive quality dimensions from this evidence, then calibrate the published rating against owner judgments. Until calibration passes on both positive and negative held-out examples, publish `Not rated` instead of a confident grade.

This structure can use an affordable model to interpret unfamiliar wording, deterministic connectors for live facts, keyword or semantic retrieval for candidate evidence, and a separate writer when it measurably helps. Those are replaceable components inside the contract, not the architecture itself.

## First repair completed locally

New question-log entries no longer publish the uncalibrated legacy score as Excellent, Good, Mixed, Weak, or Poor. They publish `Not rated` with a calibration-required diagnostic unless the caller supplies a valid, explicitly calibrated, versioned assessment. The old scorer remains available for development diagnostics. Owner Needs work marks remain unchanged.

Twenty rating tests and eight question-log tests pass when run directly. The normal multi-file test runner could not start child processes in the current sandbox (`spawn EPERM`); this is an environment limitation, not a test assertion failure. No full release check or deployment has been run.

## Shadow need-contract result

The first shadow slice is now implemented and replayed against all 12 questions in the latest paired capture without model calls. It:

- preserves truck plus menu, recycling date plus storage, pool status plus hours, and shed rules plus form as separate needs;
- represents the CAB water-quality-report request as an information/action need instead of the old contact detail;
- keeps one-part payment, booking, price, access, and out-of-scope questions as one need; and
- attaches the contract only when shadow mode is explicitly enabled, so resident-facing answers remain unchanged.

The shadow representation is an improvement, not an accepted answer router. Short dependent follow-ups still need the safely resolved prior subject attached to the contract. Some broad goals also need validation against the preserved need text before evidence can be assigned. Do not enable this contract for resident answers until those boundaries and per-need evidence assignments pass held-out tests.

Across the new and affected compatibility areas, 130 direct tests pass: 6 request-contract tests, 8 question-log tests, 20 rating tests, 35 assistant/completion tests, 20 completion-resolver tests, and 41 interpretation tests. No paid model calls occurred.

## Second shadow slice completed locally

The contract now carries safe resident-authored context into dependent follow-ups without using the previous assistant answer. Each need has the same canonical `request`, `task`, and `evidenceKind` shape already used by the experimental per-need retrieval flow. Returned sources are assigned as candidates per need, while verified claims must separately prove semantic relevance, cover the requested detail, map to an eligible source, and appear in the rendered answer. The shadow result labels each need `supported`, `missing-evidence`, `conflict`, `ambiguous`, or `unassessed`.

`unassessed` is deliberate. Several legacy rule answers do not record claim-to-source mappings, so the new check refuses to infer support merely because a plausible source was retrieved. Candidate retrieval and answer support are separate facts.

The no-model replay of the same 12 captured cases produced:

| Shadow outcome | Cases | What it means |
| --- | ---: | --- |
| Complete | 2 | Water payment and Great Hall booking have rendered verified claims supporting the requested need. |
| Missing evidence | 5 | Food truck/menu, pool status/hours, yoga follow-up, CAB water-quality report, and nanny access have at least one need without relevant rendered proof. |
| Unassessed | 4 | Recycling/storage, shed/form, lighting follow-up, and the out-of-scope coffee case cannot receive a supported quality claim from the available legacy evidence map. |
| Ambiguous | 1 | “How much does it cost?” lacks the subject required to retrieve or judge the answer. |

The replay catches the known serious failures. It supports the food-truck identification but flags the missing menu; rejects the water-billing contact as proof for the CAB water-quality report; preserves pool status and regular hours as separate missing needs; and retains the resident-authored lighting and yoga subject in dependent follow-ups. It also routes bin placement to governing-rule evidence and an application-form need to official-action evidence rather than treating both as a generic route success.

Two hundred direct compatibility checks pass across the new contract, the assistant, completion, conversation resolution, interpretation, question logging, and assessment diagnostics. The normal multi-file launcher still cannot create child processes in this sandbox (`spawn EPERM`), so the affected files were invoked directly. Syntax and whitespace checks pass. No paid model call, resident question, source approval, vector database, subscription, configuration change, release, or live behavior change occurred. This slice adds no model or database charge and makes no new recurring cost commitment.

## Next bounded implementation slice

Make the answer router retrieve and preserve evidence by need behind a test-only or shadow gate, beginning with the four compound/follow-up failures in this capture. A partial answer should keep every supported need, state the unresolved need plainly, and offer only a relevant next step. Then replay the frozen capture and add negative controls for sibling-need leakage, wrong-subject official pages, unavailable live connectors, and claim paraphrases.

Do not enable resident rendering or resume broad model comparisons yet. Model choice, vector storage, and fine-tuning remain deferred until the need-first flow isolates a failure that one of those components can solve and a bounded comparison demonstrates a meaningful quality gain with complete operating cost.

## Test-only need router completed locally

The assistant now has an explicit `shadow-route` mode that is rejected unless the request is marked as a test and supplies a per-need answer function. It runs no more than four needs, executes each need independently, applies the same evidence assessment to each result, contains an individual failure, and assembles a shadow candidate while returning the existing resident answer unchanged. This mode is not configured on the server or available to residents.

The candidate keeps every supported direct answer, identifies each unresolved part, and selects next-step actions from unresolved needs before already-supported ones. It drops actions whose subject does not match the need. Candidate sources carry the need IDs for which they were retrieved. An ambiguous standalone request stops before retrieval.

Ten focused router checks cover:

- full truck plus menu support with separate sources;
- a verified truck with a missing menu;
- a useful official menu link that does not pretend the menu was answered;
- a live pool-status result surviving an hours-connector failure;
- separate live recycling and governing bin-storage evidence;
- safe resident context plus governing evidence for a lighting follow-up;
- rejection of wrong-subject official evidence and actions;
- rejection of a verified claim that was not rendered;
- no retrieval for a subjectless price question; and
- the test-only and four-need execution boundaries.

The saved 12-case legacy replay now produces 2 complete, 1 verified partial, 4 missing-evidence, 4 unassessed, and 1 ambiguous shadow result. The food-truck case changes from the old global `verified` label to a useful partial answer: it keeps the verified truck and names the missing menu. The CAB-report billing action remains excluded. The pool answer keeps its relevant official hours page while still identifying both unsupported needs.

That replay deliberately presents the same saved legacy response to each need. It proves isolation, evidence rejection, partial composition, and action selection; it does not measure new retrieval or new answer quality. Independent per-need execution is proven with synthetic, source-bound fixtures. The next slice must connect the real existing source adapters to the per-need callback in a local test harness before any resident-facing claim.

The complete affected set is now 210 passing direct checks. No paid model call, resident question, source approval, deployment, configuration change, hosted vector database, subscription, or recurring cost was added.

## Next bounded implementation slice after the router

Connect the current local rules, community-source, and live-connector paths to the per-need callback under test mode. Start with truck/menu, recycling/storage, pool status/hours, shed/form, yoga, and lighting. Capture which need each adapter receives, which eligible sources return, whether the rendered claims pass the evidence contract, and the exact partial candidate.

Use deterministic routing and existing approved sources first. If a remaining failure is interpretation, retrieval recall, evidence applicability, or writing, test only the component responsible. A different model or vector database should enter only a bounded comparison for that isolated failure, with current versus proposed per-answer and monthly cost.

## Current local source paths connected under test mode

The shadow router can now call the assistant's existing local community index, rules engine, and live connector adapters separately for each need. This path requires `isTest: true`, rejects enabled planning or writing model stages, caps the request at four needs, and is not configured on the server. The existing resident answer still returns unchanged beside the shadow candidate.

Five real-path fixtures now establish:

- food truck plus menu completes using the existing schedule and vendor-menu adapter, with the truck and menu proved independently;
- recycling pickup plus bin storage completes using the live calendar for the date and the approved community projection for the screened-storage instruction;
- pool status remains a useful verified partial when regular hours are missing;
- water payment completes from the approved community navigation source; and
- a lighting follow-up remains unassessed because the legacy rules route does not expose a claim-to-source map. The new verifier does not guess around that gap.

The work also fixes shared defects found by those paths. Multi-part clauses retain enough resident context to stand alone while evidence is judged against only the requested clause. Schedule wording such as “next pickup” can no longer inherit a generic goal from the combined question. Live waste answers now retain claim-to-source proof instead of dropping it. ISO dates and the same dates written in resident-friendly form compare as the same fact. The composer selects the sentence that answers a specific need instead of repeating an entire multi-topic source passage. Sources returned for one need carry that route identity, but a generic information claim still needs subject overlap so a wrong official page cannot pass.

Twenty-eight focused request-contract and need-router checks pass. Broader direct checks add 70 assistant, 34 completion, and 41 interpretation passes. One unrelated completion test expects an older contact-boundary mode but receives the newer freshness-withheld mode; this slice did not alter that contact path. Syntax and whitespace checks pass.

No model call, resident question, external source request, vector database, subscription, deployment, or setting change occurred. This slice adds **$0 in model API charges**. The preserved historical benchmark prices the current mixed model flow at about **$1.01 per 1,000 questions** for that 16-question diagnostic mix, or about **$10.09 at 10,000 questions**; it is not an invoice or current production measurement. The local need-first candidate deliberately disables every model stage, so it does not add model spend in the tested configuration.

The shadow comparison currently runs the existing combined answer once plus once per need: a two-part question made three connector-path attempts in the food and pool fixtures. A production candidate should replace the combined pass rather than add to it, route only the capability each need requires, and reuse identical connector results. Until that deduplication and a production-shaped benchmark exist, server work, connector latency, and total monthly operating cost remain unmeasured. No higher-cost model or hosted vector service has earned adoption.

## Next bounded implementation slice after current-path connection

Add structured claim-to-source mappings to the legacy rules boundary, beginning with the lighting and shed families, without allowing a model to approve or strengthen a rule. Then make capability routing reuse connector results so pool hours do not cause another live-status request. Re-run the same real-path fixtures plus wrong-subject controls. Only after those pass should the candidate replace the baseline in an offline end-to-end comparison with total calls, latency, useful-complete rate, useful-partial rate, and the current-versus-candidate monthly cost scenarios.

## Rule proof and connector reuse completed locally

The deterministic rules boundary now emits conservative claim-to-source proof for sentences it can match to the governing source. A claim must keep the source's subject, permission language, dates, and numbers; an official link is credited only to its own source. Negative controls reject a changed permission, a changed measurement, and a fence statement mapped to an unrelated source.

This closes two concrete answer gaps in the test-only need route:

- A hardwired permanent seasonal-lighting system may stay installed year-round, but outside the approved seasonal periods it must use the non-holiday settings. Temporary seasonal lights still need removal. The previous route confused permanent fixtures with the rule for temporary decorations.
- A shed height question now returns the eight-foot-six-inch limit without copying unrelated screening details, while the separate form need returns the official Backyard Utility Sheds One-Sheet.

The dependent yoga follow-up also completes from the current event path. “What about tomorrow?” retains the prior yoga subject and returns the matching event, time, and location. Its claim maps to that event's displayed source rather than to the generic calendar, and the verifier checks the exact date and time even when the answer says “tomorrow.”

Repeated checks inside one shadow request now share identical live connector results. The food-truck and pool fixtures each make three internal requests but only one actual connector call, with two cache hits. The yoga fixture makes two internal requests but only one actual calendar call, with one cache hit. This removes duplicate external work inside the test harness; it does not yet remove the baseline-plus-per-need coordinator duplication.

The focused regression set passes **200 of 200 checks** across assistant behavior, request contracts, need routing, rule families, public examples, rule synthesis, section context, and the new evidence controls. No paid model call, resident question, external source request, source approval, vector database, subscription, configuration change, deployment, or live behavior change occurred. Added model/API cost remains **$0**. The historical current-flow estimate remains about **$1.01 per 1,000 questions** and **$10.09 per 10,000 questions** for the recorded diagnostic mix; the new local path has not created a recurring cost commitment.

This is implemented and verified locally only. It is not released or verified live. The current shadow design still executes the old combined coordinator plus one coordinator pass per need, so its local fixture time is not a valid production latency measurement.

Implementation revision: local commit `80d775c` on `codex/community-quality-september30`.

## Next bounded slice after rule proof

Build a production-shaped offline candidate that runs the need-first coordinator once, shares raw retrieval and connector evidence across needs, and does not run the old combined answer as a baseline inside the same request. Replay a frozen unseen benchmark and report useful-complete, useful-partial, wrong-topic/unsupported answers, follow-up behavior, source-failure behavior, p95 latency, every model and connector call, and current-versus-candidate monthly cost. Test a model, semantic retrieval, reranker, or vector store only for a remaining measured failure that the simpler flow cannot solve.

## Production-shaped offline candidate completed locally

The test-only candidate now runs one need-first coordinator and returns that composed answer directly. It does not run the old combined answer first. Each sibling need receives a minimal routing request with only the subject context it requires, so a pool-hours lookup cannot inherit “open right now” and a menu lookup cannot lose the named truck. Identical connector work is memoized within the request.

The final validation now checks the exact resident-visible answer after composition. Only claims actually shown can prove completion. Helpful extra facts that remain visible keep their own source IDs, while omitted facts cannot silently count. Ordinary permission language such as “Could I…” and “Is this okay?” is preserved as a permission need. A typed `source-scope-boundary` can prove the narrow statement that the inspected controlling source does not publish an exact clock time, and that proof is rejected if the source contains a clock time.

The offline gate contains 12 authored production-shape fixtures and the repository's 7 pre-existing frozen rules holdouts. It passes **19 of 19**:

| Result | Cases |
| --- | ---: |
| Complete, with every requested need proved | 13 |
| Correctly withheld or asked for clarification | 3 |
| Correct safety or out-of-scope boundary | 3 |
| Claim-to-source proof failures | 0 |

Execution totals are 19 coordinator runs, 0 old baseline runs, 21 per-need runs, and 2 early safety-boundary runs. Connector reuse reduced four food-truck requests across the suite to two actual fixture calls plus two cache hits. The final recorded p95 local elapsed time was **1.952 seconds**; this is a development-machine fixture measurement, not a production service-level claim.

The wider regression set passes **207 of 207** checks across assistant behavior, source ingestion and safety, retrieval, contacts, facilities, rules families, public examples, need routing, claim evidence, synthesis guards, and section context. Syntax and whitespace checks also pass.

No resident questions, network requests, paid model calls, source approvals, vector database, subscription, deployment, or configuration changes occurred. The candidate made **0 model calls** and added **$0 in model/API cost**. For comparison, the preserved historical diagnostic estimate for the current mixed-model flow is about **$1.01 per 1,000 questions** and **$10.09 per 10,000 questions**. That comparison covers model/API charges only; hosting and production connector costs still require measurement after integration.

This is a stronger architecture checkpoint, not final acceptance and not a live release. The current September 15 pool-hours source is stale, so the current-date path correctly keeps live pool status and withholds regular hours. A September 14 historical fixture proves the routing and composition behavior while the source was within its approved freshness window; it is not proof that today's hours are current.

Implementation revision: local commit `28590e5` on `codex/community-quality-september30`.

## Remaining work before resident release

1. Refresh or review source gaps, beginning with current pool hours and the CAB water-report source, without approving facts automatically.
2. Run a broader frozen, human-rated acceptance set sampled across real resident wording. The 19-case gate is deliberately small and cannot establish “consistently impressive” by itself.
3. Calibrate the automatic rating against owner judgments for proactiveness, specificity, directness, complete need coverage, and human-first usefulness.
4. Integrate the need-first candidate behind a release gate, measure real latency and connector work, and compare full current-versus-candidate operating cost before enabling it for residents.
5. Test a small model, semantic reranker, or vector store only if the broader set isolates an interpretation or retrieval-recall failure that the deterministic flow cannot solve. No such component has earned adoption in this checkpoint.


## Broad diagnostic coverage checkpoint

The production-shaped need-first candidate was exercised against the repository's full existing authored coverage collection: 140 rule phrasings plus 11 community-information phrasings. This is a broad development diagnostic, not an unseen or human-rated acceptance set.

The first run exposed 55 failures in 151 phrasings. This slice addressed shared causes rather than topic-by-topic exceptions:

- concrete resident fragments such as "Chickens" and "State Parks pass" now count as searchable requests, while generic prompts such as "Please help" and "How much does it cost?" still ask for clarification;
- direct rule sentences retain proof across section headings, source formatting, safe presentation wrappers, seasonal dates, and fee-schedule headings;
- useful verified qualifications can remain in the answer without allowing a neighboring claim from a broad document to prove the wrong need;
- action-only requests are represented as actions;
- a relevant one-sheet or application can appear as a proactive next step while staying tied to its own official source; and
- permission language such as "you can," access instructions, and numeric setback statements can satisfy their actual need when rendered.

The earlier shared-process diagnostic produced a 116–120 range. The harness now gives every question a separate worker isolate, preventing one question's module caches or mutable process state from affecting another. The benchmark also treats any visible ellipsis inside a source claim as a clipped presentation failure. The candidate discards those fragments and safely withholds that part when no complete claim is available. Two complete isolated runs of the prior checkpoint produced the same 119/151 fingerprint, `62202de281ec2a787e527359e72b8c658a17c25887215defb209b925f1fd1b25`.

The next checkpoint found that the deterministic rules answer already contained good plain-language guidance, but the need-first composer was throwing it away and rebuilding an answer from raw legal fragments. The composer now preserves a verified direct answer when a permission result otherwise contains clipped source claims or when the answer accurately explains that the governing source does not specify the requested detail. Conversational permission wording such as “Do I have to…” and “Can you cover…” is also recognized without misclassifying requests such as “Can you find…”.

For example, “Can you cover your car with a tarp in the street?” changed from this legal fragment:

> (b)(18) - Car covers: (18) Car covers. DRC approval is required. Garages are intended to house vehicles...

to this verified resident answer:

> A general tarp does not meet the rulebook's car-cover standard. Car covers require DRC approval and, in general, must be neutral-colored, well maintained, and specifically manufactured for the vehicle. Covering a vehicle does not override the separate street-parking rules.

| Result | Count |
| --- | ---: |
| Authored phrasings | 151 |
| Passed the saved expectation | 122 |
| Completed with rendered proof | 113 |
| Safely withheld | 38 |
| Claim-to-source proof failures | 0 |
| Paid model calls | 0 |
| Added model/API cost | $0 |

The isolated diagnostic has now improved from **96/151 to 122/151**. The focused production-shaped gate remains **19/19**, including all seven frozen rule checks, with zero proof failures. The new 122/151 result has one completed isolated run with fingerprint `ac7ae3f621bbf60ebff6ee82e43204d61ffce9a628ea7516466647c354c599a2`; it was not repeated because the local machine was contended and the work was deliberately capped.

Twenty-nine saved expectations still fail. Twenty-six answers complete with proof but differ from the old expected wording, breadth, or source order. They require human review rather than automatic relaxation. The main groups are incomplete overviews, missing proactive next steps, and saved checks that demand details the resident did not ask for. Clipped excerpts are no longer allowed into a completed candidate answer. Three are safe nonanswers or expectation mismatches: the clubhouse source version is awaiting review, current Labor Day pool hours are not separately published, and the trash timing/location case asks for timing while its saved expectation requires storage location.

The earlier stable isolated runs recorded p95 elapsed times of **1.148 seconds** and **1.146 seconds**. The later 122/151 run recorded **11.097 seconds** while the local machine was heavily contended; focused checks were also several times slower. This is a development-machine diagnostic and is not evidence of production latency. The harness now explicitly terminates each worker after receiving its result.

The rating harness also exposed a real false negative: it rejected the correct phrase “72-hour limit” because a frozen check required the exact string “72 hours.” Frozen literal checks now tolerate harmless hyphen and singular/plural differences while preserving the same factual requirement. This restored the production-shaped gate to 19/19 without changing the resident answer.

The architectural conclusion remains unchanged: a more expensive model is not the current bottleneck. The candidate used deterministic interpretation, current local retrieval, official connectors, and evidence checks for **$0 added model cost**. The preserved historical mixed-model diagnostic estimate remains about **$1.01 per 1,000 questions** and **$10.09 per 10,000 questions**. A model, reranker, embedding service, or vector database should be tested only against a privacy-reviewed, human-rated failure group that specifically shows an interpretation, retrieval-recall, or writing gap.

Before resident release, the next work is to review the 29 completed mismatches for human usefulness, replace overly legalistic presentation with direct resident guidance, improve missing overview details and proactive next steps, revalidate the three safe nonanswer/expectation cases, profile production-shaped latency, and run a privacy-reviewed human-rated acceptance set from the real question log. The automatic rating must stay uncalibrated until its rubric agrees with owner judgments on that held-out set.

Regression verification: all 50 focused need/router/evidence checks pass, and the 19-case production-shaped gate passes. The latest full repository suite passes 1,307 of 1,308 checks. The sole failure is the pre-existing label mismatch for a conflicted internet-contact case (`community-freshness-withheld` versus `community-contact-boundary`); the old phone number remains withheld. The three regressions initially introduced by the earlier slice were fixed before its checkpoint.

This checkpoint is implemented and verified locally only. It is not deployed or verified live. The Notion owner-guide update remains pending because the earlier external write was rejected; this local record is the precise text to synchronize once Notion write access is available.
