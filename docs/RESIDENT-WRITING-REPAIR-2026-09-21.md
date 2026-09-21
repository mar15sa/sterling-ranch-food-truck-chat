# Resident writing repair — September 21, 2026

State: owner-requested repair; implementation and release evidence pending.

The owner's September 21 request explicitly authorized fixing both the disabled writer and the ineffective voice check. This is a repair to the existing audited flow and configured provider, not adoption of a new interpreter or model.

## Cause and intended outcome

The September 20 audited-answer release deliberately retained deterministic retrieval/composition after small model comparisons produced no accepted writing improvement. Its server options also disabled the rules writer. The newer need-first writer ran before audited draft selection and was available only in the separate AI candidate mode. Consequently, an accepted factual answer could reach residents without a writing pass. The shared voice check recognized a few historical patterns and incorrectly accepted the rulebook fragments in the Halloween answer. Its regression tests reinforced exact formal wording.

This repair gives the final selected, evidence-audited complete answer one grounded writing pass when the existing writer configuration permits it. It does not enable a different retrieval planner or change the source authority order. The writer receives the proved claims and eligible actions, preserves conditions, limits, dates, permissions and source associations, and cannot change completion or add sources/actions. Failed or unavailable writing retains a source-derived fallback and exposes the failure in diagnostics. The fallback voice rules and quality score must recognize these failures rather than report flawless prose.

Affected family: complete source-derived answers, including timing, permission, constraints and actions across rule and operational topics. Partial, stale, conflicting, ambiguous and safety responses retain their established disclosure and do not gain verified claims through writing. Presentation helpers are source-independent; no fixed Halloween answer or community-specific factual values are introduced.

The resident should receive a direct, natural answer with relevant conditions and a useful next step only when needed. Source citations remain available. A complete timing answer should not create a generic task to reread the source. Existing UI components and source approvals remain unchanged.

## Implemented behavior and focused evidence

The audited flow and explicit AI candidate flow now honor the existing writer mode and configured provider. Deterministic retrieval is still deliberately off for model writing; the selected answer receives one final writing call. A missing key or explicit `off` keeps deterministic behavior. Health reports the effective resident-writer configuration and stage; per-answer diagnostics distinguish attempted, accepted and fallback outcomes, with rejection reasons in the private request contract.

The writer sees verified claims, not uncited facts from the surrounding page. Validation accepts equivalent clock formatting while rejecting altered values, relative windows, reversed clock windows, changed operating states, lost conditions, softened obligations and lost resident needs. Existing source/action objects, completion and confidence remain bound to the audited result. No automatic retry, provider change or additional paid service is introduced.

The end-to-end regression also exposed two supporting issues: rulebook fragments lost evidence bindings after harmless deterministic grammar cleanup, and the request audit did not normalize the ordinary words decorate/decorations/display consistently. The repair recognizes exact source-clause grammar equivalence and preserves time abbreviations as part of their sentences. The existing subject-boundary checks remain in place.

Focused checks: 101 existing need-router/rule-family cases passed; 69 evidence, request-contract, writer and fallback checks passed; 48 voice, writer, configuration, private-log and rubric checks passed. The new end-to-end test proves one writer invocation after a richer baseline is selected and a readable, fact-preserving fallback after a provider error. The resident-literal guard passed with the existing 56 migration-debt nodes unchanged.

Approved-evidence revalidation passed September 21 at 23:23 UTC with the exact approved fingerprint unchanged (`3f59a2bb6a1fbe6f45b65c5dcf1494ea95f3689ae6048405b72901ea426e22f4`). Full gate, real-model staging and production verification are still pending.

Notion impact pending final release evidence: update the answer-flow diagram and explanation in How this project works and the owner hub; record the final-writing decision and effective-config/fallback diagnostics in Decisions and owner operations. Do not label this repair live until the exact deployed revision is verified.

## Verification contract

- Test the real audited selection path, including a preserved richer baseline, and prove writing happens once after selection.
- Exercise successful writing, rejection, provider absence/failure, disabled mode, source changes, and second-community fixtures.
- Reject changed permission, missing qualification, altered relative timing, invented values/links, lost needs, echoed fragments and generic unnecessary handoffs.
- Check displayed fields and combined answer consistently; do not satisfy the tests with a prose field that the UI ignores.
- Replace exact legal-phrase expectations with source meaning/value checks and direct voice regressions across multiple families.
- Run focused checks first, then one final full local gate and required protected checks. Use current approved evidence without changing its identity or approvals.
- Verify actual writer acceptance and manually read test-labeled staging/production answers, including holiday decorations, distinct seasonal lights, another rule family and an operational question. No resident review record is edited.
- Update and read back the owner guide's answer-flow diagram, accessible explanation and decision/release evidence. Mark live only after exact production revision verification.
