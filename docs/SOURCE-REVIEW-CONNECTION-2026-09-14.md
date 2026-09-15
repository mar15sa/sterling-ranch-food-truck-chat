# Private source-review connection recovery

## Requested outcome and root cause

The owner requested that the missing ongoing private source-change queue be connected. Production already has the review implementation and its existing Notion integration credential, but lacks the three non-secret database, data-source and title-property settings. The existing Sterling Ranch Source Review database has the expected schema, including title `Name`; the production credential successfully read that schema on September 14, 2026. No new integration, credential, database or access grant is needed.

Before: the owner sees Unknown because no queue destination is configured. Intended after: the owner can read the existing durable source-review records, and normal background synchronization can append pending changes to that same database. This is an operations-only configuration repair, not an answer or resident-interface change.

## Authority, reuse and safety

- Reuse the existing `reviewConfig` and schema-validation contract. Only set the source-review database ID, data-source ID and title-property name on the identified production service.
- Preserve all existing credentials, source approvals, reviewed versions, exclusions, resident records, model settings and deployment source.
- A saved review decision is not automatic publication. New or changed source proposals stay outside the approved answer index; normal reviewed release requirements remain.
- Do not create synthetic resident questions or make a source approval to test the connection. Validate schema, read existing review records, inspect live owner queue and deployment health, and verify synchronization without modifying an owner's decision.
- An unreachable/misconfigured database must still show unavailable/Unknown, not a false empty queue. Routine reads and sync must not modify schema.

## Existing backlog limitation

This database predates the completed four-category audit. The current implementation retains historical review items and decisions rather than deleting them. Its pending count is not the count of unfinished assignments from the 104-item audit. Simply connecting the queue must not be represented as reconciling this historical backlog.

No history will be silently approved, excluded or deleted as cleanup. A future current-versus-history view needs comparable exact-version proof: crawler chunk hashes, full-page hashes and PDF fingerprints are not interchangeable. An incremental crawl's absence is not proof of source retirement. Unknown/new URLs must stay available for scope triage. These boundaries were independently inspected before configuration.

## Configuration target

- Railway project: `324d5adc-20ee-4688-98a4-082e3ca9554f` (natural-acceptance).
- Production environment: `cb546bc9-51b3-43fe-adaf-d88503732751`.
- Service: `f89503d3-5ecf-4868-9701-d6412a189580` (sterling-ranch-food-truck-chat).
- Existing database: `392e1276-8508-469e-ac3b-27305fd9d5a3`.
- Existing data source: `6254e913-f2d4-4b02-a388-a19e1e9a9132`.
- Title property: `Name`.

## Verification status

Configuration repair verified live September 14, 2026 at 23:41 UTC. Only the three non-secret settings above were added. Railway configuration deployment `5e900e62-7823-4940-8034-f8a84cbdc248` succeeded on unchanged application revision `79f6540bcebf1c3875ed72f0e81d32783c21eb5c`.

- All 27 existing queue/configuration/display tests passed. No application code changed, so the prior exact application release gates remain applicable; this operation did not publish a new build candidate.
- Authenticated production API returned `reviewAvailable: true`, no review error, and 25 cards on page 1. Chrome independently displayed “The private review queue is connected.”
- Observed saved pending history: 8,481 entries, including 5,079 sensitive entries and 626 conflicts. These are entries, not documents or unfinished assignments from the completed four-category audit. The full database read took 43.2 seconds.
- Exact production health passed: ready, current approved evidence, zero source failures. Approved fingerprint remained `94c0b7d9ab0b3779fbe4009e01f9639b243ae95688e51da04a8077f2ef041bca`.
- The post-deployment background refresh completed at 23:39:01.593 UTC; targeted deployment logs contained no source-review synchronization error. The latest saved review item predates this deployment, so this is not claimed as a newly inserted-record test. No synthetic record or approval was created, and no resident question was submitted.
- Existing integration access was reused. Credentials and session cookies were kept in process memory and not copied into this record, the guide, or tool output.
- The owner operations guide, project hub, How it works, design reference, and second-community roadmap were updated with the connection repair and remaining backlog/performance limits. The source-to-answer diagram is unchanged because this config repair activates an already-documented storage path without changing approval or publication behavior.

## Remaining follow-ups (not implemented here)

1. Separate current in-scope work from historical versions, completed exact-version audits, and outside-scope discovery. Keep unknown/new URLs visible for triage. Do not use an incremental crawl's absence or incomparable hashes to hide an item.
2. Improve the full-history read and initial loading presentation; 25 rendered cards currently still require reading all saved records first.
3. Surface last successful synchronization and its errors separately from database readability. Connected currently means the queue can be read, not proof of every future write.

Owner guide: https://www.notion.so/3dabf909186d81028da2d4e84f033e77

Live queue: https://sterlingranchsociety.com/community-assistant/sources

Configuration evidence: https://railway.com/project/324d5adc-20ee-4688-98a4-082e3ca9554f/service/f89503d3-5ecf-4868-9701-d6412a189580/variables?environmentId=cb546bc9-51b3-43fe-adaf-d88503732751
