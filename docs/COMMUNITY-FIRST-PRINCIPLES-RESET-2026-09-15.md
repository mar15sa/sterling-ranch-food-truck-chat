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

## Verified-detail retention checkpoint

The next bounded slice addressed a shared answer-quality failure: the official source and the deterministic answer already contained useful conditions, but the final composer dropped them when the wording was friendlier than the legal text or when a numbered list carried its obligation in a parent heading.

The evidence mapper now recognizes faithful everyday equivalents such as “5 feet” versus “five-foot,” “ground level” versus “grade,” “outside easements” versus “not allowed in easements,” and “the lot has enough room” versus “lot square footage permits.” Numeric values and permission meanings are still checked separately; this does not allow a changed number or reversed rule to pass. Numbered rule items retain their matching parent obligation, so “Vegetable garden boxes shall:” plus item 5 can safely support “Vegetable garden boxes must be located a minimum of five feet from all property lines.” When a resident asks for a measurement, the final composer now keeps the concrete verified measurement instead of stopping at a generic “it depends” lead.

For example, the privacy-screen answer previously omitted several conditions even though they were present in the selected official source. It now states the DRC approval requirement, 5-foot standard height, conditional 6-foot height, 8-foot width, rear/side-yard placement, easement exclusion, up-to-three limit, 30% transparency, material rules, and vinyl prohibition. All four saved privacy-screen phrasings pass.

The garden answer previously ended after approval and rear/side-yard placement, and its hidden detail was malformed as “shall is be located.” It now says:

> DRC approval is required and will be reviewed on a case-by-case basis with consideration of location, lot conditions, size, materials, and views from neighboring properties. Vegetable gardens and raised beds of reasonable size and height relative to yard size are encouraged and must be located in the rear or side yard. Vegetable garden boxes must be located a minimum of five feet from all property lines.

All five saved garden phrasings pass, including the misspelled “vegtable” version. A focused fence regression caught during validation was also corrected: the answer now retains “Height: 54 inches” alongside the general fence-type caveat and DRC approval.

One capped isolated full run completed at **125/151**, up from the prior **122/151**, with 111 complete answers, 40 safe nonanswers, 0 claim-proof failures, 0 model calls, and $0 added model/API cost. Its fingerprint is `faea5c89e5182a82e2f4887104f8f1d5e457fb4db4eedf95886210fd8664e1b4`. The run was not repeated. It exposed that discarding numeric words during sentence selection could hide concrete measurements; the post-run correction now treats equivalent numeric forms as the same value and was checked on the affected privacy, garden, shed, RV, lighting, trampoline, fee, tree, pet, and parks-pass families. Because of the one-run cap, 125/151 is evidence for the pre-correction checkpoint, not a claimed final total for the post-run correction.

The production-shaped gate remains 19/19 with zero proof failures. The focused need/router/evidence checks pass. Local p95 timing remained heavily contended and is not a production latency measurement. No model, reranker, embedding service, vector database, subscription, deployment, or resident configuration was added. The preserved comparison remains about $1.01 per 1,000 questions for the historical mixed-model diagnostic versus $0 in model/API charges for this tested need-first path. Human-rated question-log acceptance and automatic-rating calibration remain required before a demo-readiness claim.

Implementation revision: local commit `5f95048` on `codex/community-quality-september30`.

## Intent-priority and multi-source proof checkpoint

Two remaining broad failures came from shared contracts rather than missing content. “Are permanent holiday lights allowed?” matched both seasonal-light timing and permanent under-eave systems; the seasonal category won and returned installation dates instead of the requested permission conditions. Permanent-system questions now use the under-eave policy unless the resident explicitly asks when the lights may be energized or whether a hardwired system may remain installed. The resident answer now includes the approved Gemstone/Jellyfish systems, DRC conditions, application detail, and 10:00 p.m. cutoff. The existing year-round follow-up still explains that hardwired systems may remain installed but must return to approved non-holiday settings.

“What fees do residents pay?” also failed for two independent reasons. The request contract treated the descriptive verb “pay” as a request to make a payment, and the fee summary combined values from two schedules into one proof unit. Descriptive fee questions now require prices only, while “How do I pay?” still requires an action. The answer uses separate, source-provable sentences for the water/sewer/stormwater schedule and the CAB service-fee schedule:

> Typical utility fixed monthly charges are water $50.20, sewer $44.95, and stormwater $18.80. Other typical fixed monthly charges are streetlight $9.90 and trash $14.17.

The proof mapper can now assemble the smallest set of rows from one official schedule needed to support a multi-value summary. Every claimed number must still appear exactly in that same source, and topic and permission checks still apply.

One capped isolated broad run reached **130/151**, up from 125/151 and the original 96/151. It recorded 112 complete answers, 39 safe nonanswers, 0 claim-proof failures, 0 model calls, and $0 added model/API cost. Fingerprint: `aac9ebbd6853dc32e06ab0b6ce647f05a323c1584821c2a4b23c1adc8a3d83d1`. Focused validation passed 55/55 need/router/evidence checks, 41/41 interpretation checks, the 37-test rule-family suite, and the 19/19 production-shaped gate. Local p95 in this isolated run was 1.632 seconds; it remains a development measurement.

Release plan: prepare the staging candidate by September 17 after a privacy-reviewed held-out sample from the real question log is scored for directness, specificity, useful proactiveness, complete need coverage, and human-first presentation. Target production by September 19 only if that sample shows a material improvement over the current site, live source health is clean, the exact staging revision passes smoke checks, and full current-versus-candidate operating cost is recorded. This leaves more than a week for demo hardening before month-end. No deployment occurred in this checkpoint.

Implementation revision: local commit `9b57816` on `codex/community-quality-september30`.

## September 16 held-out log and release-gate checkpoint

The private owner log now contains 129 non-test questions since September 1, including 28 owner-marked Needs work examples. Eighteen of the first 27 reviewed failures still carried a historical automatic Good or Excellent rating. This confirms that the old rating was measuring route completion and answer form more reliably than resident usefulness. The current code already prevents that failure for new records: an answer remains `Not rated` unless a versioned grader has been explicitly calibrated against human judgments. The old score remains available only as a development diagnostic.

A privacy-safe shadow runner now accepts private rows in memory, retains nothing on disk, and can emit aggregate results without resident question or answer text. The latest targeted replay covers the question-log failures changed in this slice. It confirms direct, source-proven answers for landscape requirements, landscape application steps, permanent under-eave lighting approval, State Parks pass instructions, porch belongings, and yard completion deadlines. A parks-pass reimbursement request now stays unresolved unless the source actually discusses reimbursement; annual-pass eligibility can no longer stand in for that policy. Live event, pool, holiday-waste, and similar questions still depend on current connectors and are not treated as solved by rulebook text.

The full in-memory replay of all 28 owner-marked Needs work questions at their original question dates produced 17 complete and 11 missing-evidence outcomes, with zero proof failures and zero model calls. The unpublished rubric produced 5 Excellent, 12 Good, and 11 Weak diagnostics: 60.7% were useful, below the 95% useful and 85% Excellent working demo targets. No private question or answer was written to a file. This aggregate predates the targeted Halloween partial-answer repair and has not been silently adjusted.

The server now has an explicit `COMMUNITY_ANSWER_FLOW` switch. Production and local environments default to `legacy`; Railway staging defaults to `need-first-candidate` and reports that selection through `/api/health`. An explicit valid setting can override either default. The candidate runs the already-tested local need-first coordinator with planning and writing model stages disabled. The flag is server-owned and cannot be supplied by a resident request. This creates a reversible staging release without changing production behavior or adding a model, vector database, subscription, or API charge.

Verification after this slice:

- 21/21 request-contract checks;
- 28/28 need-router checks;
- 39/39 rule-family checks;
- 8/8 claim-to-source checks;
- 41/41 interpretation checks;
- 8/8 question-log and rating-publication checks;
- 32/32 fast release checks; and
- 19/19 production-shaped offline cases, including all 7 frozen rule holdouts, with 0 proof failures, 0 model calls, and $0 added model/API cost.

The final September 16 offline gate recorded a 2.374-second p95 on the local machine. It is not a production service-level measurement. The preserved current mixed-model diagnostic estimate remains about $1.01 per 1,000 questions and $10.09 per 10,000. The proposed staging configuration adds $0 in model/API charges; hosting and connector work stay within the existing service footprint.

The broad 1,324-test run completed before the final repairs with 1,318 passes and six failures. Five were affected edge cases exposed by the run: online payment intent, two operational payment-routing checks, landscape overview completeness, and landscape presentation length. All five now pass their direct suites. The remaining failure is the already-known internal label expectation for safely withheld conflicted internet-contact evidence. The full 1,324-test process was deliberately not repeated after those focused repairs, so this checkpoint does not present a synthetic full-suite pass total.

Release status remains local only. Target staging is September 17 after the private aggregate is completed and the exact revision passes test-mode smoke checks. Target production is September 19 only if the held-out review shows a material improvement in directness, specificity, useful proactiveness, complete need coverage, and human-first presentation, with live source health clean. Production retains the legacy flow until that decision.

Implementation revision: local commit `a059c3e` on `codex/community-quality-september30`.

## September 16 proof-based rating and complete owner-log replay

The automatic-rating replacement now starts from the same resident needs and claim-to-source evidence used to build the answer. It scores five explicit dimensions from 0 to 2: directness, complete need coverage, specificity, useful proactiveness, and human-first presentation. A response cannot receive an Excellent diagnostic unless it earns 10/10. A polished partial answer cannot rank above Mixed, and a completed answer with an unresolved need, missing answer, or unverified visible claim receives a hard failure. The separate resident-effort result stays unresolved whenever the resident must keep searching or ask again.

This rubric remains an unpublished diagnostic. It reports `calibrated: false` and `publishable: false`, so the owner log continues to show `Not rated` rather than publishing an unproven replacement score. On the existing 19 production-shaped and frozen fixtures, it produced 10 Excellent, 7 Good, and 2 Weak diagnostics with zero false-positive or false-negative completion judgments. Those fixtures verify structural behavior; they do not establish agreement with owner ratings.

The privacy-safe shadow runner now replays each private question at its original question date when that date is available. This matters for questions about tomorrow, a holiday, or whether something is open. It can also emit aggregate rubric and resident-effort counts while keeping question and answer text out of files.

The complete replay of all 28 owner-marked Needs work questions produced:

| Result | Count | Meaning |
| --- | ---: | --- |
| Complete | 17 | Every preserved need had rendered, relevant proof. |
| Missing evidence | 11 | The candidate refused to fill a gap with unrelated or unapproved material. |
| Excellent diagnostic | 5 | Complete and 10/10 on the five structural dimensions. |
| Good diagnostic | 12 | Complete and useful, with at least one presentation or action-path deduction. |
| Weak diagnostic | 11 | The resident's requested outcome remained unresolved. |
| Proof failures | 0 | No completed response lacked claim-to-source evidence. |
| Model calls | 0 | No paid planning, writing, grading, or reranking call was made. |

This is **17/28 useful, or 60.7%**, and is not demo-ready against the working targets of 95% useful and 85% Excellent. Seven of the eleven unresolved cases ask for current event, food-truck, pool, or holiday-service information. The offline runner intentionally does not pretend it has exercised the deployed live connectors; those seven require test-mode staging checks on the exact release revision. The other four expose static evidence gaps: Halloween decorating language, the approved scope of the 45-day landscape-establishment water treatment, and the official park-pass reimbursement path.

The source review found two exact official paths, but they are not promoted into resident evidence without owner approval. The current CAB water FAQ says that water used during the 45 days after turf and plant installation is billed at the first-tier fee rate and does not count against the water budget. The current official page is `https://sterlingranchcab.com/m/faq?cat=16`. This does not establish free water, a cash discount, a general exemption, a longer period, or current rate amounts. The official reimbursement action is the `Park Pass Car Registration Reimbursement Form` at `https://sterlingranchcab.com/FormCenter/Parks-Passes-9/Park-Pass-Reimbursement-Form-62`. Approving that route would establish the action and link only; it would not establish eligibility, amount, approval, deadline, or other policy.

These failures confirm the first-principles boundary. A different model or vector database cannot authorize an unapproved fact and should not be used to guess around a missing live connector. The historical mixed-model answer-flow estimate remains about **$1.01 per 1,000 questions** and **$10.09 per 10,000**. The deterministic need-first candidate and rubric add **$0 in model/API charges**. For comparison, the existing model-grader harness would cost about **$3.88 per 1,000 targeted answers with Haiku** or **$9.86 per 1,000 with Sonnet**, before establishing better agreement with the owner. No model grader has earned adoption.

Release status remains local only. The September 17 staging target is conditional on the exact revision passing the seven live/date-specific questions in test mode, approved source decisions being incorporated or explicitly deferred, fast and focused checks remaining green, and cost being unchanged. Production remains no earlier than September 19 and still requires a materially improved held-out result, clean live source health, and smoke checks on the exact staging revision. Production continues to use the legacy flow until those gates pass.

## Partial-detail preservation and Halloween scope checkpoint

The complete owner-log replay exposed a smaller version of the original root cause. A single preserved need can itself contain more than one required detail. The router previously kept a useful partial answer only when the details appeared as separate needs; if one need had a supported detail and an unresolved detail, it discarded the supported claim. The router now preserves any rendered, source-proven detail, marks the outcome `verified-partial`, and states the unresolved scope without allowing the partial answer to receive a complete or Excellent diagnostic.

The owner-marked Halloween question demonstrated the boundary. Ordinary “decorate for Halloween” wording now reaches the approved seasonal-lighting policy, but the assistant does not pretend that a lighting rule governs every kind of decoration. The candidate says:

> For Halloween lights, the approved seasonal period starts October 1 and runs through January 31.
>
> This rule sets the dates for seasonal lighting; it does not set a separate start date for every kind of Halloween decoration.

The result is a source-proven `verified-partial` and an unpublished Mixed diagnostic with some resident work remaining. The more precise “When can I put up Halloween lights?” is complete and receives an unpublished Excellent diagnostic. This fixes the useful-answer loss and the false-completion risk together; it does not invent a broader decoration rule.

Verification for this checkpoint is 22/22 request-contract checks, 29/29 need-router checks, 40/40 rule-family checks, and 9/9 rubric guardrails. The complete 28-question private aggregate was not rerun after this targeted correction, so the earlier 17 complete and 11 missing-evidence result remains the last full aggregate rather than being silently adjusted. No model call, new source approval, database, subscription, deployment, or resident question was added.

## September 16 live-family boundary repair and staging-readiness checkpoint

The next slice repairs shared boundaries exposed by the first staging smoke test. Named-event questions now keep their requested subject and search the next 31 days when no date is supplied. If the official calendar has no matching event, the answer states that exact inspected boundary and links to the official calendar instead of substituting an unrelated event. Dependent follow-ups retain the named event rather than replacing it with words such as “tomorrow.”

Pool questions now resolve the requested date before applying regular-hours evidence. Out-of-season dates cannot inherit summer hours, named-holiday questions preserve the exact date even with model planning disabled, and a compound open-status plus hours question can retain a verified season or status fact while plainly identifying missing holiday hours. Garbage and recycling questions can retain a source-proven service date while leaving an unproved delay status unresolved. These are evidence, routing, and completion fixes; no resident facts were added to code.

Verification is complete locally: the full repository suite passes **1,358/1,358**, the production-shaped offline gate passes **19/19** with zero proof failures, the fast release gate passes **32/32**, and the affected focused suite passes **166/166**. The candidate made zero model calls and added **$0** in model/API cost. The current 151-phrasing authored diagnostic is **128/151** with 111 complete answers, 38 safe nonanswers, and zero proof failures. A clean checkout of the prior staged revision produced the same 128/151 and the same 23 expectation mismatches on September 16, so this slice introduces no measured broad regression; the older 130/151 record came from an earlier dated run and is retained as historical evidence rather than treated as the current baseline.

Release timing is readiness-based. This exact tested revision is ready for staging and test-mode live verification. It is not yet production-ready or demo-ready. Production remains gated on the exact staged revision passing live source health, representative test-mode questions, latency and zero-model-call checks, plus a material human-rated improvement on the held-out question-log set. No calendar date by itself authorizes release.

The historical mixed-model estimate remains about **$1.01 per 1,000 questions** and **$10.09 per 10,000 questions**. The proposed candidate remains **$0 in added model/API charges**. A different model, reranker, embedding service, or vector database remains deferred until an isolated human-rated failure shows that component can materially improve the answer.

Implementation evidence for this checkpoint: commit `dab9f9e` on `codex/community-quality-september30`.

## September 16 current-status and partial-disclosure repair

Test-mode smoke checks on staged revision `eb8d8c9` confirmed that named events and the next food truck were direct, current, and source-backed. The seven-question check made zero model calls and added $0 in model/API cost. It also exposed two shared contract defects rather than missing model capability. “Is the pool open right now?” incorrectly requested both status and hours, so a fresh live closed status was rejected when regular hours were unavailable. “Was garbage pickup delayed this week?” did not preserve the date facet or visibly explain that the official pickup calendar did not state whether a delay occurred.

The repair now treats an undated yes/no open question as a current-status request. Future and holiday questions remain on the date-specific hours path, so current status cannot answer a Labor Day question. For waste-delay questions, the request contract asks for both date and status. If the live calendar proves only the date, the answer retains that date and explicitly says the calendar does not say whether pickup was delayed. The evidence result remains `verified-partial`; it cannot receive a complete or Excellent diagnostic.

Local validation passes all 42 interpretation checks, 37 shortcut-boundary checks, 32 need-router checks, 22 proactive-answer checks, and the full repository suite: **1,361/1,361**. The full suite was repeated once with terse output only because the first completed run's final summary was truncated; the confirmation run made no paid model calls. No model, vector database, reranker, new subscription, or resident-facing fact was added.

This repair is implemented and verified locally, but it is not yet verified on staging. Production remains unchanged. Staging is ready for the exact-revision health check and three bounded test-mode questions: current pool status, this-week pickup delay, and the dated Labor Day pool-hours boundary. Production release still requires materially better human-rated usefulness across the representative held-out set, clean live source health, acceptable latency, and zero unexpected model use. Release timing is readiness-based rather than calendar-based.

## September 16 date-scope and completion-integrity follow-up

Exact-revision staging checks on `61d760f` proved the current pool-status repair: “Is the pool open right now?” returned the fresh live closed status as a complete answer. The same three-question check exposed two remaining false-completion paths. A “this week” garbage-delay question displayed the next pickup date even though it fell in the following week. A Labor Day pool question said separate holiday hours could not be verified while its internal result still reported complete. These results kept the revision out of production.

The shared date interpreter now converts this, next, and last week into exact Monday-through-Sunday ranges. Waste dates must fall inside the resident's requested period; a connector's query range is no longer treated as proof that its returned service date matches. A separately published holiday-delay note can still support a shifted holiday collection date. Event calendars retain their own exact-range coverage contract.

The need assessor now honors facets that an answer's own completion contract explicitly marks missing. A regular weekday schedule therefore cannot silently complete unverified holiday hours. Related clauses retain their named holiday when routed independently, safe evidence boundaries remain visible instead of being replaced by a generic failure, and duplicate identical boundaries are removed.

Verification passes **1,366/1,366** across the full repository, **19/19** in the production-shaped gate, **34/34** need-router checks, **43/43** interpretation checks, **37/37** shortcut-boundary checks, **36/36** completion checks, **22/22** proactive checks, and **32/32** fast checks. The production-shaped gate has zero proof failures, zero model calls, and $0 added model/API cost. The first full run correctly caught an event-range regression; that shared-contract defect was fixed before the clean 1,366-test confirmation.

This follow-up is implemented and verified locally and is ready for a new exact-revision staging check. Production remains unchanged and is not ready: the latest complete owner-marked aggregate remains 17/28 useful before these live repairs, below the working demo threshold. The next staging check is bounded to current pool status, this-week pickup delay, and Labor Day pool hours, with before/after usage metrics.

Exact staging revision `5701a75` is now verified healthy with current evidence, zero source failures, and `need-first-candidate` active. The refreshed `/community-assistant?test=1` page visibly showed the Test mode banner before testing. The three bounded questions all returned HTTP 200 with zero server errors and no model, rewrite, or token usage:

| Question | Result | Elapsed |
| --- | --- | ---: |
| Is the pool open right now? | Complete: “The pool is closed with no access for homeowners or guests.” | 1.524 s |
| Was garbage pickup delayed this week? | Verified partial: retained Monday, September 14 and said the live calendar does not state whether pickup was delayed. | 1.137 s |
| Is the pool open on Labor Day, and what are the hours? | Verified partial: retained the published season boundary, withheld separate holiday hours, and linked the official pool page. | 0.458 s |

Staging has therefore verified the repaired date and completion boundaries. This does not promote the candidate to production: the private owner-marked aggregate must be rerun and materially improve from its prior 17/28 useful result, and the remaining representative failures must be reviewed for directness, specificity, useful proactiveness, complete need coverage, and human-first presentation.

## Privacy-safe owner-log rerun and readable-detail checkpoint

The complete owner-marked benchmark was rerun locally from the private Notion log without sending resident questions to staging and without retaining question text on disk. The source set was unchanged at 28 non-test, owner-marked Needs work questions. The post-repair candidate produced 16 complete, 2 verified-partial, and 10 missing-evidence outcomes, with zero proof failures and zero model calls. Nine of the 12 unresolved rows are live/date families that this offline runner deliberately cannot query: six schedule, one current status, and two hours cases. Nine unresolved rows returned no source at all. The remaining unresolved rows are the already identified narrow source-approval gaps for landscape-establishment water treatment and the parks-pass reimbursement action, plus the scoped Halloween-decoration partial.

The rerun also exposed a shared presentation defect: independently proved details were being collapsed into one dense line. The composer now preserves the exact evidence-backed wording but gives broad answers a direct opening followed by a compact Key details list; shorter answers use ordinary paragraphs. On the same private set, line-length presentation findings fell from 10 to 3 and the unpublished diagnostic mix moved from 5 Excellent / 11 Good / 2 Mixed / 10 Weak to **12 Excellent / 4 Good / 2 Mixed / 10 Weak**. Completion outcomes did not change, so this is a presentation improvement rather than a relabeled factual result. The strong-answer count remains 16 of 28 in the offline run; production is not demo-ready from this result alone.

The official pages were rechecked on September 16 before requesting owner approval. The CAB water FAQ supports only this narrow statement: water used during the 45 days after turf and plant material are installed is billed at the first-tier fee rate and does not count against the water budget. The official Park Pass Car Registration Reimbursement Form is live and asks the resident to upload a vehicle-registration receipt. Neither page establishes free water, a general exemption, reimbursement amount, eligibility, approval, or a deadline. These claims remain unapproved until the owner decides.

Verification for the presentation change: focused need-router, unpublished-rubric, and proactive suites pass 66/66; the production-shaped gate passes 19/19 with zero proof failures and zero model calls; and the fast release gate passes 32/32. The full repository run passed 1,366 of 1,367 checks. The sole failure was a Windows sandbox `EPERM` when one test attempted to start the Atlas catalog checker as a child process; running that exact catalog check directly passed with 125 records accounted for. Added model/API cost remains $0. The historical mixed-model comparison remains about $1.01 per 1,000 questions and $10.09 per 10,000.

This checkpoint is implemented, verified locally, and verified on staging revision `f7cc1a4`. The exact staging revision was healthy with current evidence, zero source failures, and `need-first-candidate` active. The test-labeled privacy-screen question returned a complete verified answer with a direct opening and compact Key details list, zero server errors, zero model or rewrite calls, and zero tokens. Production is unchanged. The two exact source decisions must be approved or deferred before their corresponding private failures can be counted as addressed. The affected Notion owner-guide and decision pages were fetched, updated, and re-fetched successfully on September 16, 2026.

## September 16 approved-source and final staging acceptance checkpoint

The owner approved both pending exact-source decisions. The 45-day landscape-establishment water statement and the official Park Pass Car Registration Reimbursement Form are now exact-version, community-scoped evidence. Their boundaries remain explicit: the water source does not establish free water or a numeric rate, and the park form does not establish a reimbursement amount, eligibility, approval, or deadline. A request for an unknown exact amount is therefore useful partial rather than complete.

The same staging cycle repaired four shared interpretation and presentation defects exposed by resident-like wording. “Billed” and “free” now reach the narrow establishment-water treatment without inventing a price. A park form plus its required receipt stays one resident need. Past-tense Labor Day wording resolves the 2026 holiday instead of the next one. “Normally close on Wednesday” is treated as a recurring schedule rather than the next Wednesday, and the answer leads with the requested closing time instead of the full weekly schedule.

Exact staging revision `4171a7d20343c89e6c26b7fbc66be33c3e400edf` is verified healthy with current evidence and zero source failures. Thirteen synthetic, explicitly test-labeled questions all returned useful answers: **10 complete, 3 verified partial, 0 missing-evidence, and 0 unsupported claims**. The partial answers are deliberate boundaries for the unpublished park reimbursement amount, holiday pickup-delay status, and separate Labor Day pool hours. Representative results include:

> Is establishment water free?
>
> Water used during the establishment period (45 days following the installation of turf and plant material) will be billed at the first tier fee rate, and will not count against the water budget.

> What time does the pool normally close on Wednesday?
>
> The pool’s published Wednesday schedule runs until 8:45 p.m. The pool is open Memorial Day weekend through Labor Day.

Local verification passes the 19/19 production-shaped gate with zero proof failures, zero model calls, $0 added model/API cost, and a 1.950-second development-machine p95. Fast checks pass 32/32. The full repository run passes 1,373/1,374 checks; the sole failure is the known Windows sandbox `EPERM` when the Atlas test launches a child process, and the exact Atlas check passes directly with all 125 records accounted for.

The cost decision is unchanged. The historical mixed-model diagnostic remains about **$1.01 per 1,000 questions** and **$10.09 per 10,000**. The staged candidate adds **$0 in model/API charges** and selects no new model, reranker, embedding service, vector database, subscription, or recurring spend.

Production remains unchanged. This staging set is strong evidence that the shared flow is moving in the right direction, but it is not yet the frozen, unseen, human-rated release gate required to claim 95% useful and 85% Excellent. The automatic rubric remains unpublished until it is calibrated against owner judgments. The next release decision requires a bounded visual review of representative staging answers, followed by the privacy-safe held-out score; it must not turn into another open-ended model experiment.

Implementation revisions: `09aad33`, `d5496c8`, `e6efa21`, and `4171a7d` on `codex/community-quality-september30`.

Documentation synchronization completed September 16, 2026. **How the project works** and **Decisions and their reasons** were fetched before editing, updated with the staging-verified flow, exact source decisions, cost record, and production hold, then fetched again to verify both new headings and the exact revision.

## September 16 final private replay and release recommendation

The same 28 non-test, owner-marked Needs work questions were rerun locally against the final staged logic at their original question dates. Resident text was not sent to staging or written to an output file. The candidate produced **18 complete, 2 verified partial, and 8 missing-evidence** outcomes: **20/28 useful (71.4%)**, up from 18/28 useful (64.3%) at the last comparable checkpoint. The unpublished diagnostic produced **14 Excellent, 4 Good, 2 Mixed, and 8 Weak**, with zero proof failures and zero model calls.

The remaining ten unresolved results are concentrated rather than broad. Nine require live schedule, current-status, or hours evidence that this privacy-safe offline runner intentionally does not call: six schedule, one status, and two hours. The tenth is an information request for which the current approved source set still has no answer. Seven of the ten returned no local source. The three lingering line-length findings are presentation diagnostics rather than unsupported completions.

This is material improvement, but it is not enough to claim the 95% useful and 85% Excellent demo targets. The 28-question set is also a selected historical failure set, not a balanced unseen acceptance sample. Synthetic staging checks already prove that the repaired live families can return useful current answers, but they cannot be counted as human ratings of the private questions. Production therefore remains unchanged pending the owner's bounded six-answer review and a frozen unseen human-rated gate. Broad model, vector-database, reranker, and embedding experiments remain deferred; this run identified evidence availability and human calibration as the remaining decision points, not model capability.

The answer-review cards cover four complete staging answers and two honest partial answers. Their decisions provide the first owner labels for directness, specificity, useful proactiveness, complete need coverage, and human-first presentation. No card decision deploys code. The cost decision remains unchanged: **$0 added model/API charges** for the staged candidate versus the preserved historical mixed-model estimate of about **$1.01 per 1,000 questions** and **$10.09 per 10,000**.

## September 16 owner calibration and holiday-answer repair

The owner approved review answers 1, 2, 4, and 5. For answer 3, the owner preferred the richer production food-truck response and explicitly asked that it be preserved. Answer 6 was rejected because it did not meet the human-friendly and proactive standard. These are owner calibration labels, not a completed frozen acceptance score and not permission to release production.

The staged food-truck path now preserves the production-style context when a truck is known but menu details are unavailable. The holiday-pickup repair addresses the shared cause behind answer 6: a connector that proves only pickup dates can no longer be treated as if it also proved holiday-delay status. The response leads with the exact owner-approved holiday policy, keeps the current pickup dates for Providence, Ascent, and Prospect villages, plainly says when the live calendar does not establish a delay, and links the official address calendar. A wrong-period date is still rejected.

Exact staging revision `3b08d0bd7b48ecbc1004a348a0dbb0a8f273982f` was verified healthy with `need-first-candidate`, current approved evidence, zero source failures, and no refresh in progress. Two explicitly test-labeled checks returned HTTP 200. The food-truck answer was complete and retained the schedule-confirmation context. The holiday answer was an honest `verified-partial` with both the live calendar and approved trash policy, every village date, the remaining uncertainty, and the official next step. The two checks made zero planner, rewrite, or answer-model calls.

Final local checks after the holiday repair pass 37/37 focused need-router tests and 19/19 production-shaped cases with zero proof failures, zero model calls, and $0 added model/API cost. The 74-test combined router/shortcut check and 32-test fast release gate also passed during this repair. The full repository suite completed without failures before the final display-only consolidation of the three village dates; the focused and production-shaped gates were rerun after that consolidation.

Production remains unchanged. The private offline benchmark remains 20/28 useful because it deliberately does not call live schedule/status/hours sources; it was not rerun or relabeled from these synthetic checks. The next release gate remains a bounded frozen, unseen, human-rated review against the 95% useful and 85% Excellent targets, with the automatic rubric unpublished until it agrees with owner judgments. No model, reranker, embedding service, vector database, subscription, or recurring spend was added.

## September 16 owner clarification: general-purpose AI is the product requirement

The owner clarified that the intended product is not a catalog of known question families. It must approach ChatGPT-quality conversation for previously unseen questions while being specialized to an organization's own approved information. It must be reusable for other neighborhoods and organizations and prioritize accuracy, proactiveness, specificity, and human readability without waiting for residents to expose each failure in production.

This clarification changes how the deterministic candidate should be interpreted. The need-first contract, source-authority boundaries, live connectors, claim proof, and completion checks are the safety and evidence spine. They are not the complete end-state assistant. The zero-model staging candidate is useful for proving those invariants and for establishing a dependable fallback, but it is not selected as the final product architecture and must not be promoted on the basis of the 19 authored cases alone.

The next comparison must put AI back inside the repaired need-first architecture rather than judging models through the earlier route-first architecture that could discard parts of the request before the model or checker saw them. Evaluate models independently for: understanding unfamiliar wording and conversation context; selecting evidence from hybrid keyword and semantic retrieval; composing a proactive, specific, natural answer; and independently assessing completeness and relevance. Exact facts, source eligibility, freshness, community separation, protected values, links, and completion state remain enforced outside the writer model.

The final benchmark must emphasize questions and phrasings not used to build the router, including compound requests, follow-ups, unfamiliar vocabulary, ambiguous requests, missing sources, live-source failures, and cross-community isolation. No question-specific answer template or phrase exception may count as a repair. A failed benchmark can become diagnostic material, but after using it to change the system, final release requires a separate fresh holdout.

The previous model and retrieval experiments remain useful cost and failure evidence, but they do not establish that AI is unnecessary inside the corrected need-first flow. Stronger-model, local hybrid semantic retrieval, and stage-specific model comparisons are reopened within a bounded budget. A paid vector database remains an operating choice rather than a quality requirement; local embeddings can test the retrieval hypothesis first. Production remains held until a generalized AI-assisted flow passes the frozen human quality targets and its complete cost and latency are measured.

## September 16 first AI-inside-the-contract implementation

An optional `need-first-ai-candidate` flow is now implemented locally. It is not the staging default and is not deployed. The AI interpreter may split unfamiliar wording into as many as four standalone resident needs, but its plan is rejected if it drops a need already visible to the deterministic contract, upgrades an ambiguous request to complete, invents a URL or instruction, or returns an invalid shape. A rejected or unavailable interpreter falls back to the deterministic need list.

The AI writer receives only the proved need contract, evidence-bound claims, and eligible actions. Its draft is rejected if it changes the completion outcome, loses supported or missing details, introduces an unsupported protected value, cites an unknown source, or fails sentence-level evidence checks. Rejection falls back to the deterministic answer. This first writing slice accepts only fully proved answers; partial and missing-evidence answers retain the existing deterministic disclosure until the writer receives a separate typed boundary for unavailable evidence.

The server supports the new flow only through an explicit configuration value. Staging continues to default to the deterministic need-first candidate and production continues to default to the legacy resident flow. Model names can be selected independently for interpretation and writing. The existing response cache now includes the selected writer model in its identity so a model comparison cannot reuse another model's draft.

No-cost verification passes 4/4 AI-contract tests, 4/4 answer-flow configuration tests, 38/38 need-router tests, 11/11 owner-regression tests, 9/9 rating tests, and the 19/19 production-shaped gate with zero proof failures. The gate's latest local p95 was 10.481 seconds, above the ten-second target and materially slower than earlier warm runs; this measurement must be repeated under the matched model comparison and cannot be hidden by the earlier result.

A predeclared development comparison now contains four unfamiliar phrasings and four arms: deterministic, Haiku interpreter plus Haiku writer, Sonnet interpreter plus Haiku writer, and Haiku interpreter plus Sonnet writer. It is capped at $1, writes raw usage and blind-review files, uses synthetic test fixtures, and is not a final holdout. The run has not started. Automatic approval review rejected injecting the existing staging Anthropic secret into the local comparison process because the specific source-derived payload and provider destination require explicit owner approval. No provider call or charge occurred. Production and staging remain unchanged.

## September 16 bounded AI comparison result and root-cause correction

The owner explicitly approved the synthetic Anthropic comparison after the automatic approval rejection. Three bounded development captures were used to diagnose and then retest the general handoff. Total measured provider cost across all three captures was **$0.237426**, below the approved $1 ceiling. No resident-log question was sent. Staging and production were not changed.

The last predeclared four-question capture did not establish a model winner. The deterministic arm completed 0/4 unfamiliar phrasings. Haiku planning plus the guarded local composer completed 2/4; Sonnet planning plus the guarded local composer completed 2/4. Haiku understood the recycling/storage phrasing but rejected the colloquial food request. Sonnet understood the food request and the exact-report boundary but returned a weak recycling search that found an unrelated financial “collection process.” The Sonnet writer was slower and produced no accepted final rewrite. The Haiku writer also produced no accepted final rewrite in the last capture. A heavier writing model therefore has not earned adoption.

The comparison exposed a shared architecture defect rather than a prose-model defect. The AI interpreter was handing free-form search wording to older routes, and the proof layer could trust the fact that a source was routed to a need even when the source did not match the resident's subject. The local candidate now derives a transferable capability catalog from each organization's configured connectors, including their published vocabulary, facets, and governing-source roles. The interpreter selects from those declared capabilities. Canonical service vocabulary and the planned subject are preserved in retrieval requests, rule/specification needs prefer a configured governing source, and capability-plan caches include the organization capability catalog so one organization's plan cannot leak into another's.

The evidence contract now requires subject overlap even for a source that was explicitly routed to the need. This rejects the financial collection page for a cart-storage question while preserving valid ordinary synonyms such as Airbnb and short-term rental. Planner-added requirements that the resident did not ask for cannot turn an otherwise complete answer into a false partial. The final composer also removes exact facts repeated by two independently answered needs.

Local verification after these repairs passes 40/40 need-router tests, 26/26 request-contract tests, 11/11 owner-regression tests, 8/8 AI-contract tests, and 4/4 owner-rating audit tests. The production-shaped offline gate passes **19/19**, with zero proof failures, zero model calls, and $0 added model/API cost. Its local p95 was **10.498 seconds**, so the latency target is not yet met and must remain visible in the release decision.

The measured planner-only development projection was about **$3.41 per 1,000 questions for Haiku**, **$8.07 per 1,000 for Sonnet**, or **$5.64 per 1,000** for a hypothetical Haiku-first/Sonnet-on-rejection cascade on this four-question sample. Those are small-sample token estimates, not a production invoice. The preserved historical current-flow estimate is about **$1.01 per 1,000 questions**. No writer, vector database, reranker, embedding subscription, or new recurring service has earned adoption from this comparison.

The recommendation is to keep the capability-aware AI interpreter available behind the explicit local candidate flag, keep the evidence and completion constraints deterministic, and keep the deterministic composer as the accepted fallback. Do not deploy an AI configuration from this four-question development sample. The next quality claim requires a fresh frozen set of unseen phrasings, owner judgments of answer quality, the corrected automatic-rating calibration against those judgments, and a measured latency/cost run on the exact candidate. Production and staging remain unchanged at this checkpoint.

## September 16 frozen-language reset, semantic retrieval result, and architecture decision

The earlier 19-case production-shaped gate was too close to wording already used during development. A new 30-question set was frozen before its first candidate execution, covering ten families with three unfamiliar phrasings each. Its hash is `b1caa419ea1965f6152f2f5d56552ada9c112710cd935c634835880dc89b1891`. The first execution generated answers but its report process failed before results were inspected. The first inspectable report, on the same unchanged candidate revision `8243a388c3f3971fb4b3becc92f38e61a880100e`, found only **8/30 useful (26.7%)** and **4/30 diagnostic Excellent (13.3%)**. This is the honest baseline for unfamiliar wording. Later runs are development replays, not new unseen scores.

The failures established two separate root causes. First, deterministic request understanding often loses the subject or the second facet in natural phrasing: “what they sell,” “where is the correct application,” “can the bins stay outside,” and indirect short-term-rental wording became generic information requests or the wrong evidence type. Second, the evidence and rating layers could trust internal route labels too strongly. That allowed an unrelated water report or pool-hours source to be treated as relevant and allowed polished wrong-topic answers to receive Good or Excellent diagnostics.

The evidence repair now requires source subject identity even when a source or claim says it was routed to a need. Generic request words such as “allowed” and “limit” cannot establish topic relevance. Ordinary concept variants such as camper, motorhome, recreational vehicle, short-term rental, and fence/fencing retain a shared identity. Claim fragments from the same source may share a proved source subject, while long unrelated document text cannot create accidental relevance. A verified claim about the wrong subject cannot be displayed as a safe partial boundary. This blocks the water-report/menu, pool-hours/trash, hand-watering/sprinkler, and pickleball/motorhome failure classes without adding canned resident answers. Focused routing checks pass **45/45**; request-contract checks pass **26/26**; AI-contract checks pass **8/8**; owner regressions pass **11/11**; the unpublished rubric passes **9/9**; and the owner-rating audit passes **4/4**. The authored production-shaped gate is back to **19/19** with zero proof failures and zero model calls. Its latest clean local p95 was 5.50 seconds; an earlier uncontended run after parallelizing independent needs measured 2.83 seconds, so exact deployment latency still needs matched staging measurement.

Local semantic retrieval materially improves source recall but is not a complete answer architecture. Using the already-downloaded BGE small English model and existing approved source indexes, the relevant source family appeared first for **18/21** static questions and within the top three for **19/21**. The two misses were indirect short-term-rental phrasings. The run made zero API calls and added no subscription, but local initialization took 3.49 seconds and median query time was 1.93 seconds. Production memory and hosting cost remain unknown.

A second local experiment fed semantic source-title hints into the existing deterministic answer flow. It produced only **3/30 useful**, with 4.12-second median and 7.26-second p95 answer time. Better source recall did not repair a wrong request classification; one motorhome request was still sent down an ordinary-information lane. The result rejects “add a vector database” as a standalone fix. Semantic retrieval remains a promising bounded fallback after request understanding identifies each need and its evidence role. A paid vector database is unnecessary for proving that design and has not earned adoption.

The automatic rating is contained but not calibrated. Uncalibrated diagnostics cannot be written to the owner log as Excellent, Good, Mixed, Weak, or Poor; the saved value is **Not rated** with `automatic-rating-calibration-required`. That prevents the current false confidence from becoming an owner-facing grade. It is not yet a finished rating system. Prior independent model-checker tests also failed: Haiku and Sonnet accepted most known flawed answers, and the Sonnet checker alone cost roughly $28.6–$28.8 per 1,000 checks with sample p95 above 21 seconds. Do not adopt an AI grader merely to replace the heuristic. The rating system needs a larger owner-labeled calibration set and must report agreement, false positives, and false negatives before publishing grades.

The recommended product architecture is now specific:

1. Use a small AI interpreter for unfamiliar wording, conversation context, need splitting, subject identity, and evidence-role selection. Keep the capability catalog organization-specific and reject plans that drop resident needs.
2. Retrieve approved information with hybrid keyword plus local semantic search inside the selected evidence lane. Keep live status, event, food-truck, and waste connectors explicit.
3. Enforce community isolation, source approval, freshness, claim-to-source proof, protected-value checks, and complete-versus-partial outcomes outside the model.
4. Use the deterministic composer as the safe fallback. A writing model is optional only if a blinded human comparison shows a significant gain; the completed Haiku and Sonnet writing tests did not.
5. Keep ratings unpublished until calibrated against owner judgments. Use human review for the release gate rather than a failed AI checker.

The current historical mixed-model estimate remains about **$1.01 per 1,000 questions**. The measured small-sample Haiku interpreter projection is about **$3.41 per 1,000 questions**; Sonnet is about **$8.07 per 1,000**, and a hypothetical Haiku-first/Sonnet-on-rejection cascade is about **$5.64 per 1,000**. The recommendation is Haiku interpretation plus guarded deterministic composition and local semantic retrieval, subject to a 30-question corrected-flow comparison. This would put model API cost near $3.41 per 1,000 on the measured sample, or about $34.10 at 10,000 questions, plus an unknown hosting increment for local embeddings. No writer or automatic AI grader is included in that recommendation.

The exact bounded Haiku comparison has not run. Automatic approval review rejected sending the 30 synthetic frozen questions and the Sterling Ranch organization capability catalog to Anthropic because that exact payload and destination were not explicitly authorized. No data was sent and no charge occurred. Production and staging remain unchanged. The candidate is not demo-ready, and no release is recommended from the authored 19/19 result.

## September 17 bounded planner result and shared root fixes

The owner approved the exact external payload and a $0.20 ceiling. The completed comparison sent 30 synthetic questions and the Sterling Ranch capability catalog to Anthropic Haiku. It sent no resident-log questions and no source-document contents. The planner accepted 20/30 contracts. The unchanged answer flow then met the frozen strict expectation on 13/30 questions, with 4 diagnostic Excellent results. The 30 calls cost **$0.092486** in total (54,801 input tokens and 7,537 output tokens), equivalent to about **$3.08 per 1,000 questions** for this planner stage. This is roughly three times the historical mixed-flow estimate of **$1.01 per 1,000** and did not produce enough quality improvement to justify a model swap by itself.

Post-result analysis found transferable failures in the shared request, evidence, and completion layers. The candidate now grounds requested details in the resident's actual words, keeps canonical connector queries for payment and live services, recognizes dependent menu wording, maps ordinary variants such as bin/container, motorhome/RV, and paying guest/short-term rental, accepts an exact official action as action proof, and treats exact durations as specification proof. If the final evidence check downgrades an answer, the visible response is rebuilt from that final result so earlier wrong-topic text, sources, claims, and actions cannot survive. A regression captures the severe version of this defect: a paying-guest question briefly displayed unrelated Chase Drain/CAB inspection text even though the final result said evidence was missing. The repaired flow withholds that text and its sources.

A zero-call, post-reveal development replay of the captured plans plus the deterministic fallback now meets **29/30 strict expectations (96.7%)**, accepts all 30 request contracts, and produces 12 diagnostic Excellent results. The remaining result is complete and rated Good; it uses the official phrase “appropriately screened from view behind the wing fence” instead of the frozen shorthand “screened location.” This is an exact-wording mismatch, not an unsupported or incomplete answer. Because these fixes were made after the frozen results were revealed, 29/30 is development evidence rather than a fresh blind or owner-rated release score.

Verification for revision `2cb451e` passes 114/114 focused request, routing, owner-regression, rubric, and question-log checks. The production-shaped authored gate passes 19/19 with zero proof failures and zero model calls. The full repository run passes 1,398/1,399 checks; the sole reported failure is the Windows sandbox blocking the Atlas test from starting a child Node process. Running that exact Atlas catalog check directly passes with all 125 records accounted for. No additional paid calls were made after the bounded planner comparison.

The architecture decision is to keep AI available for interpreting unfamiliar language, while requiring deterministic source approval, freshness, relevance, proof, and completion checks. The measured Haiku planner has not earned default production use yet. No vector database, reranker, writer model, checker model, or new subscription was added. Those options remain available only if a matched test proves a meaningful finished-answer gain. The automatic owner-log rating remains **Not rated** unless a versioned rubric is calibrated against owner labels; the diagnostic ratings above are not published grades.

This checkpoint is implemented on the feature branch and is not yet verified on staging or production. The next release evidence is a fresh, explicitly test-labeled staging review of unfamiliar questions, followed by bounded owner judgment. Production remains unchanged.

## September 17 staging finding, payment repair, and source hold

Revision `9c93c21` reached staging with the `need-first-candidate` flow. Three synthetic questions were submitted with `isTest: true`. The paying-guest question safely returned missing evidence with no unrelated source, and the trash-timing question returned the complete official storage rule. The water-payment question exposed a remaining shared defect: “I need to pay” was interpreted partly as permission, and the generic word “use” in a water-rate claim was allowed to masquerade as an action. With the exact payment source temporarily unavailable during refresh, the assistant displayed unrelated rate details instead of the requested payment destination.

Revision `b023fb376b0d06cc5d443da21c80263ef57ee8c9` fixes both causes. First-person action intent now stays an action, deterministic water-payment requests use the connector-safe `pay water bill online` route, and generic “water use” prose cannot prove a payment step. A missing payment action now withholds unrelated rates and sources. Focused request/routing/rubric/question-log checks pass **117/117**; the production-shaped gate remains **19/19** with zero proof failures, zero model calls, and a 1.941-second local p95; and the post-reveal replay remains **29/30** with zero additional provider calls.

The exact fixed revision is active on staging. Its explicitly test-labeled payment check returned HTTP 200 in 2.252 seconds with the complete answer **“Use ‘Utility Hawk’ below to continue.”**, the approved Water Billing & Payment Options source, and the Utility Hawk action. It made no model call.

Staging is not release-ready because approved-source freshness is not clean. Startup revalidated 105 of 107 due official URLs; two require review. The public health result reports five expired approved source records and five expired approved facts, zero fetch failures, no refresh in progress, and the exact fixed revision. Production remains unchanged. The next step is bounded owner review of the changed exact source versions, followed by the exact-revision health check and fresh human answer review. No production deployment is recommended while this hold remains.

## September 18 first-principles release-candidate checkpoint

The current local candidate fixes the shared request/evidence problem rather than adding answers for individual questions. It preserves each resident need before routing, retrieves and proves each need independently, keeps binding rules authoritative, and composes only rendered claims with eligible evidence. Exact requested objects now constrain fact selection: for example, “Do I need to pay to park?” cannot be answered with the price to play pickleball merely because both facts contain “free” or a dollar value. Natural caregiver wording, reimbursement wording, measured durations, official PDF specifications, service navigation, and source-unavailable rule boundaries use the same reusable subject-and-facet gates.

Four held-out wording groups contain 32 resident-like cases across rules, services, facilities, contacts, prices, restrictions, schedules, and compound questions. The first revealed run produced 30 direct expectation matches, one deliberate approved-source refusal that the original expected text had treated as an answer, and one real parking-price subject collision. The shared price-object gate repaired that collision. The final run passes **32/32 expected behaviors**, including the explicit refusal to explain the fixed water fee from an unapproved source. This is post-repair development evidence, not a new blind score.

The complete repository run passes **1,426/1,427** checks. The only red check is the known Windows sandbox `EPERM` when the Atlas test attempts to start Node as a child process. Running that exact Atlas build check directly succeeds with all **125** records accounted for. Focused checks pass 59/59 need-router, 70/70 assistant, 36/36 completion, 36/36 request-contract, 13/13 owner-regression, 10/10 source-answerability, 7/7 process-retrieval, 5/5 controlling-retrieval, and 5/5 approved-composer checks. `git diff --check` is clean apart from line-ending notices.

Implementation revisions: `b4319ad` plus staging-discovered completion repair `06624d5` on `codex/community-quality-september30`. The corrected candidate is verified on staging revision `ee4345c22953a453b6057fa33734a08835687900`. It is not released to production.

The cost decision is unchanged. This implementation adds no model call, paid embedding, vector database, reranker, subscription, or recurring service. It adds **$0 in model/API cost per question** relative to the current configuration; existing model behavior and its historical cost remain unchanged. The most comparable preserved historical selective-AI estimate is about **$1.01 per 1,000 questions** and **$10.09 per 10,000 questions**. The rejected Haiku planner-only comparison measured **$3.08 per 1,000** and did not improve the unchanged end-to-end result enough to earn adoption.

AI remains part of the product architecture as an optional interpretation and writing component inside the need-first evidence contract. This checkpoint does not enable a new model stage because the bounded comparison did not show a meaningful quality gain. Exact facts, authority, source eligibility, community separation, and completion remain outside the model.

The rating work is only partly complete. New logs no longer publish the known-bad automatic grade; they remain **Not rated** unless a versioned calibrated assessment is supplied. The final calibrated rating system still requires enough owner-labeled strong and weak answers to measure agreement and false-positive rates. Passing structural or evidence checks alone cannot produce an Excellent rating.

The first September 18 staging revision `876247b` became healthy with `need-first-candidate`, current evidence, and zero source failures. Six explicitly test-labeled questions made zero model calls and used zero tokens. Five answers behaved correctly. The sixth asked for both the park-pass reimbursement amount and the required receipt; staging returned the receipt and incorrectly marked the answer complete without disclosing that the amount was unavailable. Production remained held.

Revision `06624d5` repairs the shared natural-language amount detection. “What amount will CAB reimburse?” now carries both reimbursement and price obligations, so the answer becomes a verified partial: it leads with the unavailable amount and keeps the approved form and receipt requirement. The added request-contract and end-to-end regressions pass, as do all 32 held-out behaviors and the complete repository result above.

Corrected exact staging revision `ee4345c22953a453b6057fa33734a08835687900` is healthy with `need-first-candidate`, current approved evidence, zero expired approved sources or facts, and zero source failures. Repeating the same six explicitly test-labeled questions produced five complete answers, one deliberate verified partial, and zero unsupported claims. The park-pass response now leads with “I couldn’t verify a reimbursement amount from the current official source,” then provides the approved form and vehicle-registration receipt requirement. The six requests made zero model or planner calls and used zero input or output tokens. Observed response times ranged from 199 to 861 milliseconds.

The next bounded step is the frozen human-rated gate and owner review of the displayed staging answers. Production remains held until that evidence is strong enough. The old calendar dates do not control release timing; readiness does.

## September 18 public-example regression and staging containment

Owner review found the corrected candidate materially worse on the public example questions. A bounded comparison submitted all seven examples to staging and production with `isTest: true`. The staging revision was stable at `ee4345c22953a453b6057fa33734a08835687900`, and the comparison made zero staging model calls. Five of seven staging answers were materially less useful than production. The shed response omitted the yes/no conclusion, DRC approval, the 150-square-foot limit, and application links while its completion checker still labeled the answer complete. The fees response omitted the $138.02 typical fixed total, usage charges, home-specific charges, and the home-type qualification. The holiday-lights response omitted removal requirements and the 10:00 p.m. shutoff. The billing-contact answer omitted AmCoBi's identity, hours, and account-assistance context. The food-truck answer removed the direct link to the fuller food-truck experience.

This disproves the prior staging acceptance. The structural checks measured source proof and minimal requested-detail coverage but did not measure whether the final answer preserved the strongest useful information. The immediate containment changes every environment's default back to `legacy`; a candidate flow now requires an explicit bounded-test setting. Production was never changed.

The architectural correction is to keep the strong current answer as the resident-facing base and use the need contract as an audit: identify missing needs, retrieve only those gaps, and augment or withhold specific unsupported claims. The need-first system must not replace a richer grounded answer merely because one small claim satisfies a coarse detail label. Release tests must compare complete displayed answers against the current site and require owner-rated improvement; source proof, latency, and internal completion labels remain necessary but cannot establish answer quality by themselves.

The first local implementation of that correction adds an explicit `audited-legacy-candidate` mode. Its initial “preserve any verified answer” rule failed the broader gate: only 13/32 detailed holdouts passed because the old verified label sometimes covered a nearby fact rather than the resident's requested details. The corrected mode routes by request complexity. One concise need with no conditional or comparison marker can retain the richer grounded answer; detailed, qualified, and multi-part requests use the need-by-need path even when the older answer is labeled verified. Safety and out-of-scope boundaries remain preserved.

All seven public examples remain byte-for-byte identical to their richer baseline answers, including action links. The corrected 32-question detailed holdout gate passes 32/32, up from 13/32 under the over-preserving rule. All 32 selected the need-by-need path; the public examples selected the established path. Both runs made zero model calls and added $0 in model/API cost. These holdouts are post-reveal development evidence rather than a new blind human score. The mode is implemented and verified locally only; staging stays on `legacy` after containment.

Containment revision `df6339986abdc78b9863e047b67a8ac6f04144ff` is active on staging with `legacy` reported by health, current approved evidence, and zero source failures. Five explicitly test-labeled rechecks restored the richer shed, holiday-lighting, resident-fee, water-billing-contact, and food-truck answers. The responses reported no answer-model usage. Production remains unchanged.

Local root-repair revision `299251a` passes 60/60 need-router checks, 70/70 community-assistant checks, 9/9 rating checks, 4/4 flow-selection checks, the seven-answer exact-preservation comparison, and the no-support fallback-recovery regression. One full offline repository pass was stopped after the Windows runner produced no new output for several minutes; it had reported only the already-known Atlas child-process failure before stalling. Do not report that interrupted run as a full-suite pass. The candidate remains off staging until a broader full-answer comparison and human review demonstrate an improvement.

## September 19 source-refresh integration

The completed current-source refresh from main is now combined locally with the audited candidate. The newer September 19 trash, recycling-link, and Architectural & Community Standards decisions remain the active projections. The separate September 16 water-establishment and park-pass approvals remain preserved as their own exact-version audit package, and the older September 17 trash approval remains historical. All 107 due approved official URLs renewed successfully, with zero review failures and zero stale approved facts.

The integration gate initially caught three answer regressions because the newer source package omitted stable search labels and changed internal fact identifiers. The repair adds the missing subject labels and resolves holiday guidance by its durable scope instead of a version-specific identifier. No canned resident response was added. The combined revision passes all 32 detailed holdouts, preserves all seven richer public examples exactly, and passes the focused source-ledger and source-approval checks. The run made zero model calls and adds $0 in model/API cost. Production remains unchanged; staging deployment and exact-revision review are the next steps.

Exact combined revision `d6c3fa87d316464c36bd3800c870ac742a82842d` was deployed to staging and reported ready with 322 sources, zero source failures, zero expired approved sources or facts, and `audited-legacy-candidate`. A fixed six-question test-mode check exposed one shared intent error: “text, email, or phone” in a UtilityHawk notification question was treated as a request for a staff contact and appended an unrelated clubhouse phone number. The shared request contract now classifies UtilityHawk alert channels as product information. The corrected local answer keeps only the relevant alert guidance. The six-question run made zero model or planner requests and used zero input or output tokens. Production remains unchanged.

## September 19 corrected staging gate

The UtilityHawk repair reached staging in revision `e137910f9accd88c521fac85e56c5137cba9a758`. Full-answer review then exposed two additional shared composition issues that the earlier keyword checks had missed. A request for “each village” kept only the first equally relevant sentence, and “What time do the bins need to be out?” was treated as both a deadline and a permission request. Revisions `a88825436c00b51a2502b0dc7c8435fff4da0a2b` and `8497e08a443a0e4fda2faf78f8923cb2d0914fef` repair those general behaviors: explicitly exhaustive group requests retain every equally relevant approved sentence, and “What time/when do I need to…” deadline wording no longer creates an unrelated permission obligation. No canned trash, village, or UtilityHawk response was added.

Exact revision `8497e08a443a0e4fda2faf78f8923cb2d0914fef` is verified on staging with `audited-legacy-candidate`, 322 sources, zero source failures, zero stale evidence, and zero expired approved sources or facts. The final fixed six-question test-mode gate passed 6/6. It preserved the rich shed and monthly-fee answers, returned both trash-bin deadlines without an irrelevant caveat, listed Providence, Ascent, Prospect, and Parkvale schedules, kept UtilityHawk notification channels free of unrelated contact details, and returned $20 for two nonresident pickleball players. The run made zero planner, answer, or rewrite model requests and used zero input or output tokens.

Local verification passes 100/100 request-contract and need-router checks, 32/32 detailed holdouts, and exact preservation of all seven richer public examples. This evidence is a bounded post-repair gate rather than a new blind human score. Production remains unchanged. The Notion owner guide update is still pending because the Notion connector is unavailable in this task.

## September 20 audited-answer and rating-candidate update

Revision `ad838ef` implements the next local audited-answer candidate on `codex/community-quality-september30`. It is not yet deployed in this record. Production remains unchanged at this checkpoint.

The shared request contract now carries the resident's subject across dependent clauses and ordinary paraphrases instead of relying on question-specific answer text. Examples include recycling cart storage, short-term residential lodging described as paying guests, conditional pool closing time, pickleball open-play and parking follow-ups, DRC email/form requests, RV duration, and leak-relief response time. Each need is answered and checked independently. The auditor now requires subject-matched evidence for camper/RV claims and rejects method mismatches such as hand-watering evidence for an automatic-irrigation question. The composer adds a direct No when a requested duration exceeds a verified maximum and returns the requested official form without unrelated rule text.

The candidate also changes the draft-selection order. Detailed or qualified questions run the focused need-by-need answer first; the richer established answer is retained for short single-purpose questions only when its evidence audit supports it. This removes duplicate connector work for the normal focused path. All seven richer public examples remain preserved by the audited flow.

The automatic-quality rubric is now `resident-quality-rubric-v2-unpublished`. It scores need coverage, grounding, directness, specificity, useful next steps, human readability, and appropriate concision from the selected answer's evidence assessment. It remains `calibrated: false` and `publishable: false`; owner logs must continue to show **Not rated** until owner-labeled positive and negative examples establish agreement and false-positive performance.

Verification on the exact code revision: 32/32 audited detailed holdouts, 62/62 need-router checks, 38/38 request-contract checks, 11/11 rubric checks, 20/20 public-example checks, and a 19-case structural rubric evaluation with zero false complete ratings. The structural rating distribution was 14 Excellent, 4 Good, and 1 Weak; these are diagnostic labels, not owner-calibrated release scores. The old 30-question post-reveal replay is 24/30. Its six remaining literal failures are not current answer failures: three require the exact words `screened location` while the approved answer says `appropriately screened from view behind the wing fence`, and three require the obsolete claim that no pickup deadline exists while the current approved source says containers return by the end of pickup day. The initial 8/30 first-inspectable frozen baseline remains unchanged and must not be replaced by the development replay.

The complete `npm run check` was stopped and must be recorded as incomplete after several quiet minutes. Before the stall, all displayed Assistant/source/grounding/safety checks passed; the one displayed failure was the known Windows sandbox child-process failure for the Atlas catalog. The exact direct Atlas inventory check passed with 125 records, 60 sources, and 100 staging entries accounted for. Do not label the full repository gate passed from this run.

All candidate comparisons in this update made zero model calls, used zero model tokens, and added $0 in model/API cost. No vector database, embedding service, reranker, subscription, or recurring spend was added. The broader product still supports AI inside the guarded contract, but this candidate did not select a new model because prior bounded comparisons did not produce a meaningful enough end-to-end gain. The next step is exact-revision staging deployment and test-mode answer review, followed by owner calibration of the unpublished rubric. Production remains held until the exact candidate is ready and review evidence supports release.
