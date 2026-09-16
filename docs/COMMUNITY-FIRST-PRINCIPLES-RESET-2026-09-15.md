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
