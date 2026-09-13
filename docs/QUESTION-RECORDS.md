# Question records and access

Owner decision: Marissa Goldberg, September 13, 2026, in the documentation-audit conversation. Implementation inspected at revision `0bb9a4d4856b5389089d350a6c97bdfc9677b4ce`. [Notion owner guide](https://www.notion.so/3dabf909186d81028da2d4e84f033e77).

## Retention policy

Keep saved question-and-answer records indefinitely. The owner has chosen no routine deletion, no scheduled record cleanup, and no routine export process. No person or automation is assigned to remove old records. Age, a resolved review flag, and test labeling do not authorize deletion.

The policy preserves the recorded question-and-answer history. No more detailed rationale was supplied, so this guide does not invent one. A future change to this policy needs an explicit owner decision.

This is a retention intention for records successfully saved. It is not proof that every request was logged or that an external provider guarantees permanent preservation. The logger allows answers to continue if logging fails; the inspected implementation does not provide a durable local retry queue. This documentation change adds no new storage or deletion behavior.

## Where information goes

| Location | What it holds | Access boundary and verification |
| --- | --- | --- |
| Private Notion question log | Sanitized question/answer text, time, source, verdict, test marker, quality and owner-review metadata | The database exists in the connected workspace. Access depends on Notion page/workspace sharing and connected integrations. The exact member/guest/integration access list was not available in this code review. |
| Website's private question-review page | Displays and updates review flags on those same Notion records | The server checks the configured owner password at login and a signed, expiring session for private requests. It is another view of the Notion log, not a second permanent question database. Who has the password is not recorded in code. |
| Optional question-log webhook | Receives the same sanitized entry if configured | The code supports sending to Notion and a webhook independently. The live webhook's enabled state, destination, retention, and account access were not verified. Do not assume a second archive exists. |
| Resident's browser | At most three exchanges for follow-up context | Kept in that browser tab's session storage. Start over clears this working context. It does not delete saved Notion records. |
| Operational traces and hosting logs | Routing/source/timing summaries and salted fingerprints; no full question wording in the inspected trace record | Bounded in-memory diagnostics also emit to server logs. Hosting account permissions govern those logs; provider retention and exact account members were not verified. This is not the permanent question archive. |

The durable question policy does not turn temporary browser context, caches, diagnostic buffers, or GitHub test artifacts into permanent archives. Their existing lifecycles remain as implemented. No record cleanup task is needed to satisfy the owner's question-retention policy.

## What is saved and what is filtered

The current logger limits the saved question to 500 characters and the saved answer to 12,000 characters. It replaces email-like strings, phone patterns, and long numbers. This reduces some sensitive content but does not guarantee anonymity or a verbatim copy of the full exchange.

The default private website view hides test records. Test markers and review filters affect visibility, not retention. An owner review change updates the existing Notion row. The inspected application offers list/review operations, without a dedicated question-record delete or bulk-export workflow. The owner's choice not to export/delete is a policy; it is not a claim that Notion or another provider lacks those capabilities.

## Access facts still to verify

The remaining access inventory is specific: Notion sharing and connected integrations, people holding the website's owner password, any configured webhook destination, and hosting account/log access. No resident submissions or credentials need to be copied into documentation to establish these facts. Until verified, label those details unknown rather than saying only the owner can access every copy.

## Sources

- [Question logging and Notion queries](../lib/rules-question-log.js)
- [Login and session controls](../lib/community-question-admin.js) and private route handlers in [server.js](../server.js)
- [Browser visit context](../public/rules-assistant.js)
- [Operational trace bounds](../lib/community-observability.js)
- [Configuration reference](CONFIGURATION.md)
