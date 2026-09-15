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
