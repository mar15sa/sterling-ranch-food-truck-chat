# Community connector architecture

Updated September 8, 2026. This document audits the current Sterling Ranch specialist connections and defines the reusable CivicPlus direction. It is an architecture decision record, not runtime implementation.

## Decision

Keep specialist connections when they supply current structured facts or a dedicated resident workflow. The Community Assistant answers first from the selected authority and then offers the specialist page when it adds browsing, a map, menu detail, dates, availability, booking, or a transaction. It must not make the resident choose a tool before receiving a direct answer.

The current `data/communities/sterling-ranch.json` and `data/communities/castle-rock.json` profiles already demonstrate the right starting boundary: community identity, allowed official hosts, connectors, authority order, fact authority, and actions are configuration. Castle Rock's passed configuration-only portability proof shows that CivicPlus pages, calendars, and Municode can operate from a second profile without a core-code change. It does not yet prove that every Sterling-specific connector is portable.

## Current connector audit

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

## Staged migration

1. **Inventory and freeze behavior.** List every hard-coded Sterling decision, map it to profile, adapter, or core, and add characterization tests before moving it.
2. **Normalize existing connections.** Wrap food trucks, waste, pool status, calendar/events, and actions behind one adapter response contract while preserving current resident behavior.
3. **Move configuration.** Transfer endpoints, labels, vocabulary, service-area mappings, menus, facility facts, and fallback language into the Sterling profile or content pack. Keep secrets out of profiles.
4. **Enforce authority centrally.** Route rule, operational, and process questions through the same authority/freshness/conflict gate before any connector response is formatted.
5. **Prove portability.** Configure a second CivicPlus community with only profile and adapter-supported values. Expand the existing Castle Rock proof from pages/calendar/rules to the capabilities that community actually supports; do not invent unsupported equivalents.
6. **Retire duplicated shortcuts.** Remove old connector-specific answer formatting only after the shared contract has family-level parity evidence.

## Required collision and degradation tests

Each connector migration must add tests for the following, using test-marked assistant requests for any hosted verification:

- A waste schedule question versus a waste-storage rule: current pickup timing comes from the schedule; storage restrictions come from the controlling rule.
- A current pool-status question versus regular facility hours: current live status wins and stale hours cannot show as verified.
- A food-truck menu question versus event logistics: the official calendar controls when and where; the official truck menu controls menu claims.
- A public pickleball use question versus a private-court construction question: public operations and binding improvement rules remain separate.
- An unavailable connector: no invented current answer, clear status, and an official handoff that still works.
- Conflicting rule and process sources: the controlling rule is identified and the conflict is not silently blended.
- Cross-community isolation: two profiles with different connectors, hosts, vocabulary, and authority orders cannot leak source records, actions, or labels into each other.
- Configuration-only portability: a supported second CivicPlus profile can pass its declared evaluation set without changing core routing code.

## Next implementation worktrees

1. **Connector contract extraction:** introduce the normalized adapter response contract and characterization tests, with no feature additions.
2. **Waste and food-truck migration:** move vendor-specific routing, service-area mapping, menus, and handoffs into configured adapters; run collision and degradation tests.
3. **Pool/calendar/facility migration:** separate live status, calendar facts, public facility operations, and private-rule answers under the central authority gate.
4. **Portability verification:** extend the Castle Rock profile evaluation only for connectors it supports and report any missing adapter capability explicitly.
