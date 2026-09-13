# SRS purpose and product values

Plain-English reference, September 13, 2026. The engineering requirements remain in [COMMUNITY-ASSISTANT-ENGINEERING-PRINCIPLES.md](COMMUNITY-ASSISTANT-ENGINEERING-PRINCIPLES.md), referenced by [AGENTS.md](../AGENTS.md). This page explains those existing requirements and the owner's direction; it does not replace their approval or release contracts.

## Current owner and future product

Marissa Goldberg confirmed that she is the sole operator and the only person with access today. She is building SRS so she can offer it to other communities in the future. Sterling Ranch is the current community implementation of that broader product direction.

Keep current owner operations simple. Put community-specific details in profiles and connectors so another community can use the shared product without copying a Sterling Ranch implementation. This intended direction does not establish that every connector is already portable or that a future customer's account/access setup has been implemented.

## Three resident outcomes, evaluated together

| Value | Meaning | Example of the standard, not a claim about a particular community |
| --- | --- | --- |
| Helpfulness | Answer the actual question with the detail needed to act or decide. | A reservation question needs the supported process and requested details, not just a facility name. |
| Proactiveness | Give the next useful official step, useful partial information, or one clarification that unlocks the answer. | Offer the exact verified application link when relevant instead of sending the resident to search a website. |
| Accuracy | Support claims with the right current official evidence, preserve conditions, and expose gaps/conflicts. | A booking page can supply an action; it cannot by itself prove permission, a fee, or availability. |

A fluent answer still needs correct evidence. An accurate citation still needs to address the question. Proactiveness helps the resident take the next step; it does not authorize submitting forms, making purchases, approving sources, or inventing missing facts.

## How these values shape the work

- **Fix root causes and question families:** repair the mechanism and test neighboring meanings and phrasings. Avoid a shortcut for one sentence.
- **Use plain, natural language:** give the supported answer first, preserve conditions, and make the next step clear. Follow the documented friendly-neighbor voice.
- **Keep facts in evidence:** amounts, rules, dates, contacts, and fixed resident answers must not become hidden facts in application code. Shared code supplies structure; approved sources supply content.
- **Choose authority per claim:** binding rules, current operations, and action links have different jobs. A convenient source cannot override the controlling one.
- **Build for another community:** community identity, domains, vocabulary, facilities, and vendor details belong in configuration or adapters. Test isolation and behavior; loading a second profile alone does not prove portability.
- **Keep useful specialist tools:** the Assistant answers first. Maps, menus, calendars, status, and official transactions remain useful when they add something the resident needs.
- **Require evidence before claiming success:** preserve approvals and relevant regression/release checks. Distinguish proposed, implemented, and verified-live states.

## Existing sources and conversation history

- [Engineering principles](COMMUNITY-ASSISTANT-ENGINEERING-PRINCIPLES.md): explicitly defines helpfulness, proactiveness, accuracy, root-cause fixes, authority, portability, and review evidence.
- [Connector architecture](COMMUNITY-CONNECTOR-ARCHITECTURE.md): shared core, community profiles, and answer-first specialist handoffs. Dated implementation tables retain their original scope.
- [Answer completion](COMMUNITY-ANSWER-COMPLETION-DESIGN.md): full/partial answers, useful clarification, and withholding.
- [Friendly-neighbor voice](COMMUNITY-FRIENDLY-NEIGHBOR-VOICE-2026-09-11.md) and [September 11 closeout](COMMUNITY-ASSISTANT-GOAL-CLOSEOUT-2026-09-11.md): natural wording and lessons behind whole-family repairs.
- Prior task **Plan durable assistant answer quality** (`01a081cd-eeab-76b0-97aa-f96582cd5ac6`) discussed useful partial answers, recovery of missing evidence, independent grading, and cross-community tests. It was a plan/review, not proof that every proposed feature shipped.
- Owner clarification in **Audit project documentation**, September 13: sole operator/access today; product intended for other communities in the future.

The [Notion project guide](https://www.notion.so/3dabf909186d81789a09e4648dbb4bbe) presents these values for the owner. Future work should apply the project-level requirements without asking Marissa to restate them.
