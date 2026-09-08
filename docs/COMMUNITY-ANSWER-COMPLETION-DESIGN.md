# Community Assistant answer-completion design

## Purpose and current fit

Residents should leave with the best supported answer available, plus one clear move when the answer cannot yet be complete. This adds a shared completion decision after the existing routing, connector, retrieval, source-review, grounding, and coverage checks. It does not replace those systems or turn an AI interpretation into evidence.

The current application already has the pieces this layer must consume:

- `lib/community-interpretation.js` records intent, subject, requested details, filters, date range, and a proposed clarification.
- `lib/community-assistant.js` selects rules, approved community sources, live connectors, and source-safe fallbacks.
- `lib/community-contracts.js` returns `directAnswer`, `keyDetails`, `nextStep`, claims, sources, conflicts, status, and confidence.
- `lib/community-source-answerability.js` withholds stale or unapproved static evidence. The source-freshness workstream will make that withholding reliable for dated facility answers as well.
- `lib/community-shortcut-eligibility.js` prevents a narrow live source from answering a different question facet.
- `lib/community-observability.js` already records answer IDs, status, confidence, source age, routing data, connector diagnostics, and anonymized question fingerprints.

The completion layer belongs after candidate answers have passed their existing authority, freshness, grounding, and requested-detail checks, and before `buildAnswerContract` makes the resident response. It must be used by the rules route, community route, and specialist connectors so a resident gets the same behavior regardless of route. The existing food-truck presentation may retain its card, but its underlying response must carry the same completion fields.

This is intentionally an extension of the current contract. It does not change the current source hierarchy: adopted controlling rule or policy for binding requirements; current transaction/facility system for prices, availability, and steps; current alert/calendar/status system for time-sensitive facts; then official informational pages.

## Shared completion contract

Add a `completion` object to every substantive response. Keep `answerStatus`, `answerVerdict`, `confidence`, `claims`, sources, and actions for backwards compatibility. `completion.outcome` is the resident-outcome label; it must not be inferred from prose in the browser.

```js
completion: {
  outcome: "complete" | "verified-partial" | "ambiguous" | "missing-evidence" | "conflict",
  requestedDetails: ["permission", "price"],
  resolvedDetails: ["permission"],
  missingDetails: [
    { key: "price", reason: "no-current-authoritative-source", subject: "clubhouse rental" }
  ],
  blockers: [
    {
      type: "stale-source" | "source-conflict" | "connector-unavailable" |
        "missing-evidence" | "ambiguous-request" | "unsafe-input",
      sourceIds: ["..."],
      detailKeys: ["price"]
    }
  ],
  clarification: {
    needed: false,
    question: "",
    detailKey: "",
    rationale: ""
  },
  nextBestMove: {
    type: "none" | "answer-follow-up" | "official-action" | "official-source" |
      "wait-for-live-source" | "owner-review",
    label: "",
    actionId: "",
    url: ""
  }
}
```

Only stable semantic keys belong in this object. UI copy is generated from the contract, so another CivicPlus community can provide its own approved action labels and URLs without changing completion logic. `missingDetails` records a request facet, never private resident facts. Trace only counts, normalized keys, outcome, blocker types, and anonymized fingerprints; do not store a resident's full question or free-text clarification rationale.

### Outcomes and required resident behavior

| Outcome | When it applies | Required response | Mapping to current fields |
| --- | --- | --- | --- |
| `complete` | Every requested facet has current, authoritative, grounded support and no relevant conflict. | Give the direct answer and useful next step if action is needed. Ask no question. | `answerStatus: verified`; existing verdict may remain allowed, prohibited, conditional, verified, or informational. |
| `verified-partial` | At least one requested facet is verified and at least one is not, or a multi-part answer has a safe verified portion. | State the verified portion first. Name the missing facet plainly, then give one targeted clarification or official action. Never imply the whole request is complete. | `answerStatus: verified-incomplete`; `confidence.canAnswer: true` only for the verified claims; completion fields identify the unresolved facets. |
| `ambiguous` | The resident's wording leaves more than one materially different interpretation, and existing context cannot resolve it safely. | Ask one disambiguating question before searching a broad or unrelated topic. If one interpretation already has a verified answer that applies regardless, give it first. | Preserve `inputClassification: unclear` or structured interpretation metadata; use a new completion outcome rather than a generic conversation response. |
| `missing-evidence` | No current, authoritative evidence supports the requested decision or value. This includes stale/unapproved static evidence where no safe portion remains. | Say what could not be confirmed, identify the exact missing facet, and offer the controlling official source or action when one exists. | Keep `source-unavailable` or `could-not-verify`; `confidence.canAnswer: false`; never show a verified label. |
| `conflict` | Two current authoritative sources disagree on a requested fact, or the fact ledger marks the exact claim unresolved. | Do not choose a value. Explain that official sources disagree and route to the controlling source/owner action. A non-conflicted facet may still be returned as `verified-partial`. | Keep `conflicting-sources` where the whole answer is blocked; record conflict source IDs and fact keys. |

`safety-rejected` and `out-of-scope` remain existing safety/boundary statuses, outside this five-outcome resident-helpfulness model. They must never be converted into a clarification that reveals instructions or creates arbitrary review work.

## Decision policy

1. Resolve safe conversation context using the existing three-turn, resident-input-only mechanism. An explicit new topic always starts a new retrieval.
2. Normalize the request into subject, goal, requested details, date range, filters, and candidate ambiguity. Existing deterministic rules may correct an AI plan; an AI request for clarification cannot suppress a clear controlling-rule answer.
3. Retrieve by authority and run live connectors only when their eligibility contract covers the requested goal and details.
4. Evaluate every requested facet independently: supported and current, unsupported, stale/unapproved, conflicting, connector-dependent but unavailable, or ambiguous.
5. Select the outcome in this precedence order: safety/out-of-scope boundary; conflict; missing evidence; verified partial; complete. For a mixed result, retain every safe facet and choose `verified-partial` unless an unresolved conflict makes even the purported safe claim dependent on the disputed fact.
6. Choose exactly one next best move. Prefer the action that resolves the highest-value unresolved facet; a targeted clarification is preferred only when the resident can provide the missing information and it will alter the answer.
7. Render from structured fields. The answer must explicitly distinguish verified facts from unavailable or disputed details. Validate the final text against cited evidence and completion data.

### One-question clarification policy

A clarification is allowed only when all four conditions hold:

1. Two or more plausible readings lead to materially different authoritative sources, facts, or actions.
2. The missing detail is likely known by the resident (for example, village, date, facility, service type, or which rule/topic they mean).
3. One short question reduces more uncertainty than any other single question.
4. The service does not already have a current official action that is more useful than asking.

Ask one question, not a menu of questions. It must name the decision point and offer compact examples when useful: “Which village are you in: Providence, Ascent, or Prospect?” Do not ask for a detail the system can derive from an explicit date, prior safe context, or official source. Do not ask a clarification merely because an AI classifier is uncertain when controlling evidence already answers the question.

If a resident supplies the clarification, retain it only in browser session context and rerun official retrieval. Do not treat a prior assistant answer as evidence.

## Required behavior by failure mode

| Situation | Completion behavior | Example next best move |
| --- | --- | --- |
| Multi-part question with one supported facet | Return the supported facet first; list the exact unsupported facet in `missingDetails`. | “I can confirm approval is required. I cannot confirm the current fee; open the current application page.” |
| Ambiguous rule question (“Can I?”) with no safe context | `ambiguous`; no broad search or unrelated result. | “What would you like to do or install?” |
| Ambiguous schedule whose village changes the date | `ambiguous` unless the resident gave village/context; do not claim a universal date. | “Which village are you in?” |
| Stale static source | Do not renew it through answer rendering. If a separate current source answers another facet, return that facet as `verified-partial`; otherwise `missing-evidence`. | Link the exact controlling page and say the value is being reconfirmed. |
| Unapproved or changed static source | Same as stale source; candidate content is never exposed as a fact. | Official source/action only, with no candidate value. |
| Live connector unavailable or parser unhealthy | Never claim “none,” “closed,” “no event,” or an empty schedule. Fall back to current static evidence only if it answers the precise requested facet and is eligible; otherwise `missing-evidence`. | Official live schedule/status page, or a retry-safe action label. |
| Live connector has an authoritative empty result | May return `complete` only when the connector and parser succeeded, its filters are covered, and its freshness window is valid. | “No food truck is listed for Tuesday; view the official calendar.” |
| Current official sources conflict | Do not choose a price, hour, contact, or requirement. Preserve unrelated supported facets as `verified-partial` only when independent. | Link the controlling document and a contact/owner action. |
| Controlling rule and process page differ in role | The adopted rule controls permission/requirement; current form/process page controls current submission step. State both without letting a form override the rule. | Rule citation plus official application action. |

## Resident examples

| Question | Before | After |
| --- | --- | --- |
| “Can I build a shed, and what does approval cost?” | A rule answer may say approval is required while sounding complete. | “A shed requires DRC approval. I could not verify a current approval fee. Open the current DRC application page to confirm fees before submitting.” (`verified-partial`) |
| “When is recycling week?” | A generic schedule handoff or an unsafe village-wide date. | “Recycling is every other week, but the exact date depends on your village. Which village are you in: Providence, Ascent, or Prospect?” (`ambiguous`) |
| “Is the pool open right now and what are holiday hours?” | Current pool status could be incorrectly used as hours. | “The live status says the pool is currently open. I could not confirm holiday hours from a current official schedule; open the facility page before you go.” (`verified-partial`) |
| “What is the clubhouse rental fee?” after a changed/expired page | A stale amount can receive a verified badge. | “I could not safely confirm the current clubhouse rental fee from approved, up-to-date information. Open the current rental page or contact the CAB before relying on a price.” (`missing-evidence`) |
| “What number do I call about internet?” when official contact pages conflict | One number may be selected from the older page. | “I can’t safely give a number because current official contact pages disagree. Use the CAB contact page below while the information is reconciled.” (`conflict`) |
| “Can I?” after “Can I install a shed?” | A generic clarification ignores usable session context. | Re-resolve as the shed question and answer from the controlling rule; ask no new question. |

## Evaluation and release design

Add a held-out completion suite separate from existing resident, authored, routing, and unseen rule corpora. A case declares its requested facets, evidence state, expected completion outcome, allowed actions/clarification, prohibited claims, and whether a verified partial must precede the next move. It must not use the exact wording of implementation or routing fixtures.

| Family | Held-out variations | Required assertion |
| --- | --- | --- |
| Ambiguity | “Can I?”, “What is the rule?”, date/village/facility ambiguity, safe and unsafe prior context | Exactly one highest-information clarification; no unrelated retrieval; no clarification when controlling evidence answers. |
| Multi-part coverage | permission + fee, status + hours, date + registration, rule + process | Every requested facet classified; supported facet shown first; missing facet named; no false completion. |
| Authority and conflict | adopted rule versus form, conflicting current facility prices/contacts, old versus current source | Correct authority by facet; no disputed value; independent facet remains available only when truly independent. |
| Freshness | approved current, stale, changed-pending, and current live source beside stale static source | Stale/candidate values never surface; no verified label for stale-only answers; safe current facet may remain partial. |
| Connector degradation | timeout, parser failure, partial feed, valid empty feed, filters that yield an empty result | No unsupported “none”; exact fallback/action; successful empty result only when all connector conditions hold. |
| Specialist collisions | trash schedule versus cart storage; pool status versus operating hours; food-truck menu versus event logistics | Connector cannot answer an adjacent facet; completion identifies what remains rather than inventing it. |
| CivicPlus portability | second profile with different villages, facility names, action URLs, authority order | No Sterling-only label, URL, source ID, or routing keyword is required by completion logic. |

The test suite must include at least five variants per family, with at least one negative control and one cross-route case. Add outcome assertions to the current `scripts/eval-community-assistant.js` output and a separate deterministic test module for the completion resolver. Keep current mature rule-family, resident corpus, routing, source-safety, and shortcut-eligibility suites as regression gates.

### Success metrics and observability

Publish aggregate, privacy-safe completion metrics through the existing health/trace path:

- outcome counts and rates by route, connector type, and requested-detail count;
- complete one-turn resolution rate, inferred only when the resident does not ask a same-subject follow-up within the current browser session;
- clarification resolution rate: a clarification followed by a complete answer within two turns;
- verified-partial rate and the most common unresolved detail keys;
- missing-evidence and conflict rates, aging of unresolved source blockers, and stale-source contribution;
- generic-handoff rate, where a response says to use a website without an exact action, source, or targeted clarification;
- unsupported-claim rate, completion/text mismatch rate, connector-degradation fallback rate, and outcome drift for the same anonymized fingerprint.

Initial release thresholds: zero unsupported completion claims; zero stale/unapproved facts presented as verified; zero generic handoffs when the request has an identifiable clarification or official action; 100% pass of held-out critical completion cases; no regression in current verified schedule/rule answers. Establish resident outcome baselines in shadow mode before setting improvement targets for one-turn and clarification resolution. Do not treat an absent browser follow-up as proof that a resident succeeded; it is an operational signal, not a survey result.

## Rollout and migration order

1. Finish and integrate Workstream A first. Completion must receive reliable stale-source and dated-facility signals; it must not paper over the current expiry issue.
2. Introduce `completion` in shadow mode. Calculate it beside existing answers, log only aggregate diagnostics, and compare it with current answer status, coverage issues, source freshness, conflicts, and connector diagnostics.
3. Add deterministic held-out tests and run them with the existing full local release gate. Fix resolver or contract failures before changing resident presentation.
4. Enable structured completion in staging. Test browser questions only at `/community-assistant?test=1` and direct API calls only with `isTest: true`. Soak against the existing historical, unseen, routing, and completion cases.
5. Enable resident rendering in staging: show a verified-partial label only for the verified portion, render the one clarification as a reply prompt, and display the exact official action/source. Maintain the existing food-truck card and current rules presentation.
6. Verify staging health, trace metrics, source freshness, current schedule/rule answers, action links, and no outcome drift. Production rollout remains a reviewed application-code release under the existing protected-branch process.

## CivicPlus-generic boundary

The completion resolver may know universal concepts such as requested detail, authority, freshness, conflict, action, live connector health, and question ambiguity. It must not contain Sterling Ranch names, source URLs, village names, facility names, pool seasons, food-truck labels, or topic-specific phrases. Those belong in the existing community profile, source records, action catalog, connector adapters, and launch evaluation data.

Each CivicPlus profile needs: official domains; authority order by source type and fact type; connector capabilities and freshness windows; action destinations; supported clarification dimensions (for example, district, facility, address area, or village); and a local held-out launch suite. A connector reports normalized capability and health data; completion decides what it can safely satisfy. The same core resolver must support a second profile without a routing-code edit.

## Implementation acceptance criteria

The implementation is ready for coordinator review only when all of the following are true:

1. Every substantive route returns the structured completion object, and `answerStatus`/`confidence` remain compatible with existing clients.
2. The resolver classifies every requested facet and produces only the five defined outcomes for in-scope resident answers.
3. A verified partial always has at least one grounded, current verified claim and at least one explicit unresolved detail; it never carries a whole-answer verified badge.
4. An ambiguous answer asks exactly one resident-answerable, high-information question and does not suppress a clear controlling-rule answer.
5. Stale, changed-pending, unapproved, conflicting, partial, or unavailable connector evidence cannot produce unsupported completion or a verified absence claim.
6. Multi-part answers preserve independently supported facets and identify each unresolved facet without guessing.
7. The held-out family matrix, existing full gate, routing checks, source checks, and browser/API test-mode requirements pass; action links are validated.
8. Traces expose only privacy-safe outcome/blocker metrics, and health reports show completion outcomes without resident text.
9. A second CivicPlus profile passes the completion suite using configuration alone; no Sterling-specific constants enter the resolver.
