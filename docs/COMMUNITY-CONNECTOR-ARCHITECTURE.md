# Community connector architecture

Updated September 10, 2026. This document audits the current Sterling Ranch specialist connections and defines the reusable CivicPlus direction. It is an architecture decision record; implementation status is stated explicitly below.

## Decision

Keep specialist connections when they supply current structured facts or a dedicated resident workflow. The Community Assistant answers first from the selected authority and then offers the specialist page when it adds browsing, a map, menu detail, dates, availability, booking, or a transaction. It must not make the resident choose a tool before receiving a direct answer.

The current `data/communities/sterling-ranch.json` and `data/communities/castle-rock.json` profiles already demonstrate the right starting boundary: community identity, allowed official hosts, connectors, authority order, fact authority, and actions are configuration. Castle Rock's passed configuration-only portability proof shows that CivicPlus pages, calendars, and Municode can operate from a second profile without a core-code change. It does not yet prove that every Sterling-specific connector is portable.

## September 10 implementation re-audit

The normalized connector evidence envelope, profile-driven authority, tenant isolation, freshness/degradation rules, and completion checks are now implemented for the active calendar, food-truck, waste, and pool-status paths. Binding rules retain governing-source priority; live connectors cannot prove a rule; forms and action links cannot prove an amount, permission, or current status. The older September 8 table below is retained as migration history where useful, but its statements that the common adapter and central authority boundary are wholly pending are no longer current.

Three separate gaps are being handled in separate worktrees:

| Priority | Connector gap | Current disposition |
| --- | --- | --- |
| P1 | CivicRec is configured and ranked as current facility evidence, but no live CivicRec retrieval adapter exists. | Public review proves only the official catalog destination, not readable availability or prices. Demote it to action-only after the owner approves the exact booking action; keep price and availability withheld. |
| P1 | Waste village dates were derived from one configured private parcel plus offsets. | Fixed separately in `codex/waste-service-area-fix-20260910`: remove the parcel and offsets, support only explicitly public per-area references, and otherwise fail closed with the official resident address lookup. Focused tests pass; separate promotion remains. |
| P1 | Food-truck retrieval accepted only the fixed year 2026 and depended on a brittle text format. | Fixed separately in `codex/foodtruck-horizon-fix-20260910`: use a bounded profile-owned rolling horizon, validate ISO dates and explicit years, and tolerate CivicPlus table/date markup while failing closed. All 628 tests pass; separate promotion remains. |

Pool status and general calendar integration remain useful and correctly bounded. Pool status intentionally withholds when the exact operational label is absent; normal hours stay with an approved facility-hours source. Calendar failures cannot create a verified “no events” answer. The standalone Society tools remain useful for browsing, menus, maps, reminders, and transactions, while the Assistant should continue to answer first from the same governed evidence.

## Current-state audit: implemented versus pending

The table below records behavior verified in the September 8 staging audit. It is a description of the current runtime, not a statement that the target contract is already enforced.

| Connection | Current contribution | Needed after migration? | Current invocation | What it may authoritatively support | Implemented boundary and remaining gap |
| --- | --- | --- | --- | --- | --- |
| Food trucks | Reads the official calendar for confirmed truck dates and locations; may add vendor menu context. | Yes. Keep as event enrichment. | `lib/community-assistant.js` calls `foodTruckAnswer`; server-side food-truck lookup supplies the date result. | The official calendar controls event date, time, and place. A truck's official menu controls only that truck's menu claims. | Calendar-first schedule behavior exists. Menu and schedule evidence are not yet represented as separate claim/facet authorities in final assembly. |
| Waste and recycling | Uses Waste Connections/ReCollect data for pickup dates and holidays, then adds a CAB trash/recycling page. | Yes. Keep for live collection timing. | `lib/community-assistant.js` calls `getWasteSchedule`; `lib/community-waste-schedule.js` resolves the current schedule. | The live provider controls current pickup date and holiday changes. The controlling rulebook controls cart-storage restrictions. An official information page may explain stable collection instructions. | The live-date path exists and excludes obvious storage-rule wording. It still combines live timing with a hand-created static instruction, and its village resolution is a Sterling-specific anchor-address mapping. |
| Pool status | Parses CAB's pool-status page and maps its displayed state to open/closed/limited. | Yes. Keep for current operational status. | `lib/community-assistant.js` calls `getPoolStatus`; parsing and cache logic live in `server.js`. | Live status and official alerts control whether the pool is open now. An official facility page controls normal hours. A rulebook controls restrictions. | The live-status path and stale-result downgrade exist. The page/color interpretation remains hard-coded in the server, and a combined status-plus-hours question is not yet composed by facet. |
| Calendar and events | Fetches and filters the official CivicPlus calendar and exposes parser health. | Yes. Keep for current event facts. | `lib/community-assistant.js` calls `getCommunityEvents`; `lib/community-events.js` parses the calendar. | Official calendar controls event dates, times, locations, and registration links. | The connector safely avoids a verified empty result when parsing fails. It is not yet a normalized adapter with declared, enforceable claim boundaries. |
| Official actions and forms | Provides configured official destinations such as CivicRec, forms, accounts, and contacts. | Yes. Keep as the resident's next step. | Planned and fallback action selection is in `lib/community-assistant.js`. | An official action supports a submission, booking, payment, or contact step only. It cannot establish a binding restriction, fee, availability, or eligibility claim. | Action records and source-version tracking exist. Generic goal matching still treats ordinary prose containing words such as “reserve” or “booking” as potential process support, so a page can displace the correct official action. |
| Facilities and CivicRec | Uses facility/rental pages and a configured CivicRec action; a proactive rental shortcut formats common answers. | Yes. Keep for current rental process, fees, hours, availability, and booking handoff. | Proactive rental logic runs in `lib/community-proactive.js`; operational facility retrieval runs in `lib/community-assistant.js`. | A current facility/transaction system controls rental process, fees, availability, and booking. It cannot control private-improvement or other binding restrictions. | The current shortcut runs before the rules route. Its exact-filter test examines displayed text rather than cited evidence, which caused the verified Overlook Clubhouse reservation failure and fallback to mixed generic retrieval. |

### Authority enforcement status

**Implemented now:** source review/freshness checks, fact-authority ranking in the Fact Ledger, connector-specific collision guards for several known questions, and safe degradation for calendar parsing and stale pool status.

**Pending runtime enforcement:** the target central authority gate, a normalized adapter contract, per-claim source roles in the final answer, and completion status derived from every required claim.

The important distinction is that current fact authority is sometimes a **ranking preference**, rather than a hard final-answer rule. In particular, community search still permits `facilities` and `forms` sources for a `rules` search. After a rules answer is produced, the dispatcher may retrieve community sources, replace a rule answer it considers incomplete, merge extra sources/actions, and mark the result verified. This can be correct for a separately labeled process detail, but is not yet a safe way to prove a binding requirement.

Until the migration is complete, no facility page, FAQ, calendar, vendor page, form, or action link may be described as authority for a binding rule. If such a source is included, the response must make clear that it supports only its own operational or process claim and must preserve the controlling adopted rule as the source for the requirement.

## Target direction per connector

| Connection | Keep? | Assistant behavior | Specialist-page handoff | Authority boundary |
| --- | --- | --- | --- | --- |
| Food trucks | Keep, but make it a profile-configured event enrichment adapter. | State the requested date's confirmed trucks and supported menu details first. | Offer the Food Truck page for browsing multiple dates, menus, and visual comparison. | Official calendar establishes event logistics; the truck's official menu establishes menu facts. Neither establishes CAB rules or facility restrictions. |
| Waste and recycling | Keep, but move schedule vendor, address/village resolution, and app actions into a profile adapter. | Give the next dated pickup for the resident's resolved service area, then a precise official action. | Offer the live pickup calendar or provider app for address lookup and reminders. | The provider's current schedule controls collection dates. CAB pages explain local service and rules but cannot replace current provider timing. |
| Pool status | Keep as a live-status adapter. | Give current open/closed/limited status, timestamp, and any official alert. | Offer the status page for fuller notices. | Live status and current official alerts control operations; regular facility-hours pages are fallback context only. |
| Calendar and events | Keep as a CivicPlus calendar adapter. | Answer a date/range or matching-event question first. | Offer the calendar for filters, registration, and a wider event list. | The official calendar controls current event dates, times, and registration links. Food-truck enrichment may add a menu, but does not replace the event record. |
| Official actions and forms | Keep as profile-configured action records. | Establish the controlling requirement or verified process, then link the exact form, account, booking, or contact action. | The action itself is the handoff. | Forms and transaction systems control submission and current process steps; they do not control binding restrictions. |
| Facility and pickleball | Keep facility evidence and current public-court information separate. | Identify whether the resident means a private property improvement or public-court use before answering. | Offer the current court/facility page for hours, reservations, fees, and open-play details. | A controlling rule governs a private court or improvement. The public pickleball page governs public-court operations. Never use one to answer the other. |

## What is redundant and what remains useful

The specialist pages are not redundant: they retain richer experiences that an answer cannot replace, including calendars, menus, map/location context, booking flows, live address lookup, reminders, and transaction forms. They should not be the first response when the assistant can safely answer the resident's question.

The redundant behavior to remove is duplicated decision-making: a specialist shortcut must not independently choose an authority, claim a current fact from an old static page, or override a rule answer merely because its keywords match. A shared connector response contract should carry the selected source, authority role, freshness, answer coverage, handoff reason, and degradation state into the Assistant.

## Authority selection rules

1. **Binding rules:** use the controlling adopted rule, code, policy, or amendment. A facility page, calendar, vendor, FAQ, or form is supporting context only.
2. **Current operations:** use the matching official live connector for schedules, status, availability, event dates, registration, menus, or collections.
3. **Process and actions:** use the current official action after the controlling rule or verified process is established. A process page cannot silently answer a binding rule question.
4. **Conflicts:** preserve both source identities, decline to merge incompatible claims, and give the official resolution path.
5. **Staleness and failure:** stale evidence cannot produce a verified claim. An unavailable live connector gives a clear limited answer only if independently verified static evidence covers it; otherwise it says that current status could not be verified and links the official live source.

### Required claim/facet authority model

Every answer must separate the resident's requested details into claims before it decides whether the answer is complete. A source is authoritative only for the claim type it owns:

| Requested claim/facet | Controlling source | Allowed supporting source | Must never control the claim |
| --- | --- | --- | --- |
| Binding permission, prohibition, approval, or restriction | Adopted rule, code, policy, amendment, or other controlling rulebook source | Official form or contact for the next step | Facility page, FAQ, calendar, vendor, live-status page, or action link |
| Current pickup, pool, alert, availability, event date/time/place | Matching current official connector or current official operational record | Official information page for stable instructions | Old static schedule, unrelated facility page, or rulebook used as a substitute for a current state |
| Rental fee, booking availability, reservation steps | Current official facility or transaction system, including CivicRec where configured | Official action record pointing to that system | FAQ or rulebook used as a substitute for current transaction information |
| Submission, payment, registration, or contact next step | Configured official action/form/account/contact | Controlling rule or verified process statement explaining why it applies | Search-result prose merely containing an action-like word |
| Vendor menu | Vendor's official menu | Official calendar only for the event connection | Calendar, facility page, or resident discussion used as the menu authority |

The final response must retain this mapping internally and expose it in its source presentation. A response becomes `verified` only when every required claim has a current, reviewed controlling source. A process/action source may complete a process claim; it must never upgrade an unsupported binding-rule claim to verified.

## Current Sterling-specific assumptions that must move out of shared code

The profiles already hold many community-specific values, including CAB and Municode URLs, CivicRec catalog, pool page, seed pages, authority orders, action labels, and the WasteConnect app links. Shared code still contains assumptions that must become profile or adapter configuration:

- Sterling Ranch names, CAB URLs, fallback contact directory, and Sterling-specific no-answer text.
- Food-truck detection, resident-facing card behavior, known truck aliases, and the event-to-menu relationship.
- Waste Connections URLs, village parsing, WasteConnect filtering and actions, and Sterling trash/recycling fallback labels.
- Pool headline labels and the direct mapping from the CAB pool page to live status.
- Sterling calendar wording and facility keyword lists.
- Pickleball's exact operating hours and the public-versus-private court wording.
- Rule-engine prompts, resource constants, and facility/rental fallbacks that name Sterling Ranch or assume its rulebook structure.

These assumptions are evidence of incomplete generalization, not a reason to remove useful features. They belong in a community profile, a connector-specific adapter, or a community-specific content pack after the contract below exists.

## Target profile and adapter contract

The existing profile schema is the base. Extend it without making generic code know community names:

```text
CommunityProfile
  identity: communityId, display names, timezone, official hosts
  authority: source-type and fact-type precedence
  connectors: instances with id, adapter type, official endpoint, cadence,
              capabilities, freshness expectation, and degradation policy
  actions: official action id, label, URL, eligibility/keyword metadata
  vocabulary: optional facilities, resident areas, aliases, and question facets
  evaluations: launch and regression question families for this community

ConnectorAdapter
  canHandle(question, profile) -> declared capability match
  fetch(query context, profile) -> normalized official evidence
  normalize(raw) -> facts, actions, source identity, timestamp, freshness
  answerContext(...) -> coverage and safe answer ingredients, never final authority
  degrade(error, profile) -> explicit unavailable/partial state and official link
  collisionKey(...) -> fact scope used to detect incompatible connector claims
```

The core selects an adapter only from declared profile capabilities, applies profile authority before formatting, and combines its normalized evidence with the common answer contract. A connector cannot write a final verified answer, bypass freshness, or cross community boundaries by itself.

## Phased migration order

The order is deliberately bounded: it first makes the source role visible, then moves specialized behavior without changing resident-facing claims, and only then removes duplicate shortcuts.

1. **Freeze the current behavior and source roles.** Add characterization tests for every active specialist path, including its source list, completion status, applied filters, and degradation outcome. Record every hard-coded Sterling decision as profile, adapter, or core ownership.
2. **Introduce a normalized evidence envelope.** Make food trucks, waste, pool status, events, official actions, and facilities/CivicRec return the same evidence fields: capability, claim/facet, controlling-source role, freshness, coverage, action, and degradation state. This is an internal contract; it does not itself change the answer wording.
3. **Centralize claim/facet authority and completion.** Select a controlling source separately for rule, operational, transaction, and action claims. Disallow facility/forms/calendar/action evidence from controlling a binding-rule claim. Derive final completion and `verified` status from all required claims; remove any unconditional verified upgrade after merging sources.
4. **Migrate specialist configuration.** Move Waste Connections address/village handling, CAB pool parsing metadata, food-truck aliases/menu links, facility vocabulary, CivicRec action metadata, labels, and fallback wording into the Sterling profile or connector configuration. Keep secrets out of profiles.
5. **Replace shortcuts only after parity.** Rewrite proactive rental and other specialty formatting to consume the evidence envelope. Do not remove a current specialist path until its held-out family passes both normal and degraded cases.
6. **Prove portability.** Expand the Castle Rock configuration-only proof only for capabilities the profile declares. Verify that hosts, vocabulary, actions, source records, and authority order cannot leak between profiles.

Implementation ownership is expected to begin in `lib/community-assistant.js`, `lib/community-search.js`, `lib/community-proactive.js`, `lib/community-source-identity.js`, and the specialist connector modules. The server-side pool and food-truck integrations must move behind the same contract. This document does not authorize or claim any runtime change.

## Required held-out collision and degradation tests

Each connector migration must add tests for the following, using test-marked assistant requests for any hosted verification:

- **Waste date plus rule:** “When is pickup, and where may I store my carts?” The live connector controls the date; the adopted rule controls storage. The answer must show two claim/source roles and may not let a static schedule answer the rule.
- **Pool status plus hours:** “Is the pool open today, and what are the normal hours?” Live status controls today; the official facility page controls normal hours. A stale status or stale-hours record cannot make the complete answer verified.
- **Food truck logistics plus menu:** “Which truck is here Friday, where is it, and what does it serve?” The official calendar controls truck/date/place; the vendor's official menu controls menu claims. An absent menu does not invalidate a confirmed calendar event.
- **Public operations versus private rule:** Compare “Can we play pickleball in the neighborhood?” with “Can I build a pickleball court in my yard?” Public-facility operations and binding private-improvement rules remain separate.
- **Facility reservation family:** Test “How do I reserve the Overlook Clubhouse?”, “Can I book the Overlook clubhouse?”, “What does it cost to rent the Overlook Clubhouse?”, and “Can I reserve the Overlook clubhouse pool for a party?” The answer must preserve the named facility, distinguish clubhouse rental from pool-party FAQ material, use current facility evidence for process/fee, and provide the configured CivicRec action.
- **Mixed event and reservation request:** “Is there a food truck Friday, and can I reserve the clubhouse?” Calendar evidence controls the event claim; facility/CivicRec evidence controls the reservation claim. Neither source may be presented as authority for the other.
- **Unavailable connector:** For each of waste, pool, calendar, and food trucks, simulate provider failure or unhealthy parsing. The answer must not invent a current fact, must mark only the affected claim incomplete/unavailable, and must offer the official handoff.
- **Conflicting rule and process source:** Give a controlling rule and a conflicting facility/form statement. The controlling rule must be identified; the process source may provide a next step but cannot silently change the requirement or upgrade completion.
- **Action-source boundary:** A page that says “reserve” or “booking” but has no configured official action must not displace the official CivicRec/form action for a booking request.
- **Rule-source boundary:** A rules query whose keywords also match a facility, FAQ, form, or calendar page must not cite that non-rule source as support for the binding conclusion.
- Cross-community isolation: two profiles with different connectors, hosts, vocabulary, and authority orders cannot leak source records, actions, or labels into each other.
- Configuration-only portability: a supported second CivicPlus profile can pass its declared evaluation set without changing core routing code.

For hosted checks, every request must use the existing test marker (`isTest: true` for direct API requests or the Test mode page) so evaluation traffic never enters the resident question list.

## Next implementation worktrees

1. **Connector contract extraction:** introduce the normalized adapter response contract and characterization tests, with no feature additions.
2. **Waste and food-truck migration:** move vendor-specific routing, service-area mapping, menus, and handoffs into configured adapters; run collision and degradation tests.
3. **Pool/calendar/facility migration:** separate live status, calendar facts, public facility operations, and private-rule answers under the central authority gate.
4. **Portability verification:** extend the Castle Rock profile evaluation only for connectors it supports and report any missing adapter capability explicitly.
