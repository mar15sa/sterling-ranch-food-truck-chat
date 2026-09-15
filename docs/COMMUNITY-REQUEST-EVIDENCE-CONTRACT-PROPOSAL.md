# Preserve the resident's request through every answer path

Proposed September 14, 2026. This is implementation planning, not a selected model, implemented runtime change, or verified-live behavior.

## Demonstrated failure mechanism

The current Haiku planner correctly identified an unanchored cost question as ambiguous. The coordinator treated its clarification as provisional because the old input classifier called the wording a rules question. A broad fee match then returned water rates and marked the answer complete. The captured authored test is `artifacts/quality-eval/understanding-pilot-v2-20260914/ambiguity-plan-integration.json` (`isTest: true`). A correct model decision therefore does not reliably survive downstream routing and fallback selection.

Simply honoring every model clarification is also insufficient: existing regression cases show an unnecessary front-versus-back-yard question for a resident who already said backyard, and an unnecessary fee-subtype question when approved evidence can answer the broad resident-fees request. Preserve those clear answers. The family is missing or substituted subject/outcome identity across all routes, not one phrase about price.

## Shared change to evaluate

Carry explicit requested needs from interpretation through retrieval, composition, checking and fallback. Each need retains its subject, requested outcome and required evidence role. A form need remains a form need; evidence describing where to email a completed form does not automatically satisfy it. Multiple improvements keep separate needs even when they share an approval process.

Before retrieval, validate the meaning contract as well as JSON shape. An unidentified subject should produce one clarification and no guessed queries. A clear subject should permit searching current evidence without asking for optional project details. An inconsistent model plan is a failed interpretation, not permission to use an unrelated broad match. Reinterpretation, if tested, must preserve the original resident wording and use a bounded retry with its cost recorded.

Before returning any answer, require a need-by-need evidence decision that checks subject and outcome relevance, source authority, freshness, scope and coverage. Retrieval rank and the old `canAnswer` flag are insufficient proof. A fallback must pass the same decision, including when the first composer or a live connector fails. This gate should consume normalized evidence from existing connectors and section context, retaining their identities and review restrictions.

Give independently supported portions first and identify the remaining need. Ask for a resident detail only when it changes the interpretation or unlocks the evidence. If the actual gap is an unavailable source or missing application, say so and offer the precise approved resolution path. Do not ask the resident to compensate for missing documentation.

## Authority, reuse and failure boundaries

The core owns needs, validation and coverage; profiles own official domains, vocabulary, authorities, connectors and actions; adapters own normalized source data and health. No resident fact, community name, amount or official URL belongs in the shared gate. Test two profiles, including mismatched tenant and source-version evidence.

An approved rule supports a binding requirement. A current operational connector supports a changing event/status fact. An action supports its actual destination and cannot establish a fee or permission. Missing, expired, withheld or conflicting evidence stays limited even when semantically similar text ranks first. Failure to obtain a live fact must not be filled from an old rulebook. Action links retain their existing review and scope checks.

No resident UI layout change is proposed. Existing answer fields and completion statuses can carry the result. Runtime integration will require updating the Notion answer-flow diagram and accessible explanation, separately labeled local candidate until deployment is verified.

## Required before/after evidence

1. Unanchored cost, timing, approval, contact and form questions clarify without selecting a subject from retrieved text; real resident follow-up context resolves the same questions.
2. Clear but broad questions still receive supported answers despite optional model clarifications, including the existing yard-deadline and resident-fee controls.
3. Requested forms, submission steps, contacts and payment actions remain distinct; a nearby outcome cannot satisfy the requested one.
4. Compound and corrected requests retain every subject and condition. One successful part cannot mark another part complete.
5. The same tests cover normal answers, deterministic fallback, model timeout, no eligible evidence, stale/conflicting sources and connector failure.
6. Repeat and blind-review current versus candidate full-flow outputs. Report per-family usefulness, critical mistakes, latency and full cost including retries and checking. Only then select a model for each stage.

The September pilot supports testing a cheaper improved interpretation prompt; it does not yet establish a production winner. The semantic retrieval comparison is independent evidence about source discovery and cannot by itself validate this contract or demo readiness.

## September 15 local capability-inventory experiment

The broader 68-record replay demonstrated that a single primary evidence kind cannot safely exclude another library: nanny membership information needs governing provisions, and booking needs can require process evidence as well as a destination. The per-need routing shortcut is rejected. This result changes the earlier singular “required evidence role” language: one resident need may use multiple roles together. A role describes what evidence can establish, not whether its contents answer this question.

An opt-in `evidenceContract` experiment now attaches the same source-capability inventory to initial composition, repair and acceptance in full-flow-candidate. It keeps every original source and action, the original resident question, scope restrictions and live metadata. It requires broad routing, preserves need identities, validates tenant/version/action bindings and live freshness, and labels each need's semantic coverage explicitly not assessed. Returned evidence is separated into navigation-only, unreviewed factual text and scoped live observations. A need with no candidates differs from one with only navigation; live adapter diagnostics and budget omissions remain visible. Sources found for another need stay available for independent applicability review.

This is not a release gate, successful answer check, new understanding model or selected production implementation. Broad retrieval still returns unrelated factual candidates; a governing rule about water backflow can coexist with an unsupported coffee password. The inventory cannot infer semantic relevance or claim the official site lacks information. It is a common input contract for testing writers/checkers, without another model call. Twenty-four focused tests cover two communities, binding/freshness failures, navigation-versus-fact boundaries, and actual mocked full-flow propagation through both writers and checks. Existing behavior is unchanged when the flag is off.

Freeze an offline transformation of the completed broader capture: all thirty broad-routing valid packets, rejecting all thirty exclusive-routing packets, with validity evaluated at the historical capture end. Preserve original evidence/action payloads exactly; retain invalid yoga and clarification cases in the input record without inventing evidence inventories. Report added request characters, not invented token or cost estimates. No provider calls, live queries, downloads, subscriptions or release. Whether the added context improves actual writing/checking enough to justify token overhead remains untested while paid comparisons are unavailable.
