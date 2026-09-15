# Bounded community search in the complete evidence packet

Status: planned local development comparison, September 15 UTC / September 14 Denver. Previous turn made progress: action-context semantic retrieval recovered two missing forms and passed its evidence-separation tests.

Connect the community semantic candidate to the existing experimental evidence-packet builder. Change only community ranking; retain current governing-rule keyword search, section expansion, live-operation routing and the existing 12-source / 30,000-character bound. Do not silently increase budgets, skip inconvenient cases or adjust source targets after seeing results. Both arms strip action review context from the model-facing packet. Exact approved projection identity and query-time eligibility are independently checked again at this boundary.

Reuse the current action-context vector capture. Bind model, corpus, representation, exact token windows and tenant before using it; record loaded vector digest. No downloads, API calls, resident-log submissions or production changes. Replay the five existing saved plans from current-keyword-loaded-packets.json (application, lighting, shed, hot-tub/pergola compound, pergola permission) twice each. Their interpretation is held fixed; results cannot establish correct planning or final answers. Compare current keyword community search against semantic community search using identical rule selection. Save current loaded rules with supplements; no new live rule-source attestation is claimed.

Predeclare audit questions: whether actual form 1574 is supplied for relevant form needs; whether the compound packet retains both subjects; whether governing permission is supplied for pergola rather than only lighting; whether rank limits omit requested parts or add irrelevant material. Report per-need source text and actions for manual evidence inspection. Source presence alone is not permission, applicability, final-answer quality or human calibration. Do not generate an automatic Good rating for this experiment.

Test at least two communities, current approval/withdrawal/expiry, forged text/actions/versions, bounded duplicate selection, proof stripping and live-operation routing. Existing packet and retrieval-session tests must continue to pass. Notion update remains locally pending under the previous external-write rejection. Paid writer/checker tests remain paused for the provider credit issue.

## Instrumentation finding before acceptance

Initial capture fd44753 completed 20/20 packets in artifacts/quality-eval/combined-retrieval-20260915. The shared budget helper slices to maxSources before returning units, so the experimental packet's omission list cannot expose sources dropped by that count limit. Fix the experimental wrapper to report those missing units and their associated needs, preserving the same selected source text, order and budgets. Replay the frozen comparison in a new directory and verify source/action payloads are unchanged case by case. Do not interpret the initial empty omission lists as complete retrieval. This instrumentation changes observability, not answer quality.

## Completed results

The accounted replay on **34fbb0771dc27b95deb2b5de97cebde84a59d5a2** completed 20/20 attempts in artifacts/quality-eval/combined-retrieval-accounted-20260915; process 14440 exited 0. Initial process 57202 also exited 0. Every case/method/repetition has exactly the same selected source and action payload as before the instrumentation change. All five case/method pairs repeat identically. Twenty-seven focused tests passed, with no failures/skips/cancellations. Tests cover two communities, approval withdrawal during asynchronous selection, expiry, forged evidence, source limits, proof stripping and unchanged live routing.

| Saved question | Keyword community search | Semantic community search | Outstanding evidence problem |
| --- | --- | --- | --- |
| Design-review application location | Directory/navigation sources | Same selected packet | No improvement for this wording; this generic question does not identify a project type |
| Permanent seasonal lighting approval process | Governing lighting text with noisy community selection | Governing lighting text plus general architectural form | Monthly-fee chart and streetlight reporting still included; useful process coverage is not established |
| Backyard shed height and application | Shed rule, no specific form, unrelated water report | Shed rule plus specific architectural form | Pickleball reservation, tree-lawn and water-calculation links also included |
| Hot tub and pergola permission | Both subjects represented, hot-tub rule present | Both subjects represented, form added | Specific pergola subsection absent; eight sources dropped, including a design-review process source |
| Pergola permission and form | Accessory-building cross-reference, no form | Same governing-rule selection plus specific form | Specific pergola subsection absent; internet support and caregiver pass also included |

The pergola subsection (b)(44) exists in the saved current loaded rules index. The selected accessory-building source references it, but the actual subsection's requirements are not supplied. This is a governing-rule retrieval failure, not missing source content. Current community semantic search does not fix the unchanged rules ranking. Do not use the cross-reference or form title as proof of the omitted requirements.

The compound question produces 20 distinct candidate evidence units in the semantic arm. The unchanged 12-source budget drops eight; the old omission list falsely displayed none. The corrected packet now records every excluded unit and associated need. It leaves selected source content/order and budget unchanged. Dropped sources are not all useful: this is evidence that relevance-aware selection is necessary, not justification to blindly include all 20. The hot-tub governing rule survives; the specific pergola subsection never entered this candidate set, so increasing the packet limit would not recover it.

These five preserved plans include repeated needs and concatenate subject plus request into the search query. Rankings differ from the earlier 22 direct-question test. The earlier 18/20 source-recall result must not be presented as the expected complete-flow success rate. This experiment freezes interpretation and generates no final answers or quality ratings.

## Cost and resource evidence

No paid API calls, subscriptions, new downloads or deployment. The existing 148,992-byte community vector file was reused, with its digest recorded. The accounted replay's initialization took 662 ms and peak process memory was 358,744,064 bytes (about 342 MiB). Production memory/concurrency and hosting cost remain unknown.

Across ten attempts per arm, complete packet retrieval on this computer took median / sample p95 **1,201 / 2,249 ms** for keyword and **1,201.5 / 2,504 ms** for semantic community search. These include unchanged rules search and section expansion; they are not the earlier standalone community-search timing or whole-answer latency. Small-sample desktop timing is not a production performance guarantee.

Selected source character counts (keyword / semantic): application 10,297 / 10,297; lighting 22,705 / 17,196; shed 13,610 / 11,644; compound 14,264 / 9,956; pergola 15,261 / 16,477. Characters are not billed tokens; smaller context does not prove relevance or a cheaper completed answer. No new answer-model cost estimate is justified because no writer/checker was called. Existing paid comparison ledgers remain unchanged.

## Decision and next step

The adapter is implemented only in experimental scripts. No production winner, final-answer quality claim or demo-readiness claim. Preserve the semantic form gains while testing governing-rule retrieval and per-need source selection together. First check the current eligible rules corpus against the earlier semantic cache; reuse only an exact matching corpus or prepare a newly bound index. Do not add topic-specific exceptions or raise source limits to hide unrelated results. Maintain explicit omissions so the downstream outcome checker can see incomplete evidence. Paid writer/checker comparison and human rating calibration remain outstanding.

Reproduce the audit: `node scripts/quality-eval/summarize-combined-retrieval.js artifacts/quality-eval/combined-retrieval-accounted-20260915 artifacts/quality-eval/combined-retrieval-20260915`. Manifests, code, source snapshots, fixed plans, packet payloads and comparison.json are retained. The rules snapshot is current local loaded data with supplements, not a newly verified live publication. Exact Notion update is pending locally.
