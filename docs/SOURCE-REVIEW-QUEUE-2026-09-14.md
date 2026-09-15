# Current source-review queue plan

## Owner outcome and root cause

The owner asked to separate useful current source changes from saved historical reviews, improve the roughly 43-second first load, and show whether synchronization succeeds. The database is connected, but each dashboard request reads all historical records, pending history is presented as new work, and sync failures are not exposed to the owner.

Before: 8,481 saved pending entries are presented as one new-change backlog. After: independently labeled current in-scope changes, comparisons still needing verification, scope triage, history, and outside-scope entries; readiness appears without waiting for the history download; cached reads have explicit age/loading/error state; source synchronization has its own last-attempt/success/error status.

## Safety and reusable boundaries

- This changes private operations only. Resident UI, source facts, owner decisions, approval scopes and publication requirements remain unchanged.
- Classification is a read-only view, never an invented Notion decision or deletion. Currentness requires exact comparable version evidence; chunk, page and file hashes are not interchangeable.
- Do not infer retirement or resolution from an incremental/cold/failed snapshot's absence. Unknown/new URLs remain visible for scope triage. Changed excluded/link-only versions remain reviewable.
- Shared logic accepts community-specific audit/index records as inputs. Source roles and category membership come from reviewed data, not hard-coded community URLs or labels.
- Loading/unavailable/stale cache or sync states must not claim zero pending work or a successful latest synchronization. Owner decisions require a fresh storage read and preserve exact identity checks; stale/history entries cannot silently become approvals.
- Preserve all existing records and review decisions; deduplicate only truly identical records for display and expose ambiguous duplicates for comparison.

## Verification and release

Test current versus historical versions, completed exact-version reviews, changed exclusions, unknown scope, incremental omissions, cold/failed reads, cached pagination, decision invalidation, overlapping requests, sync failures and unchanged approved answer evidence. Verify private owner behavior and source-safe health in staging, then normally release through protected checks and verify production. All automated assistant questions must be test-marked. Update Notion operations, decision/design references, and the source-review flow diagram with exact implementation and live status.

## Implemented checks

The private handler now returns the completed audit immediately while saved history loads in the background. Complete snapshots have a five-minute cache with explicit age, loading, and errors. Failed reads retain an older snapshot but disable decisions. POST decisions still reread storage and require the exact regenerated proposal, source identity and current version.

The five queue views preserve saved history and exact owner decision statuses. Identical copies are grouped without deleting records; disagreements remain read-only comparisons. Current scope is derived from the reviewed inventory. Missing incremental crawl entries never prove removal. Automatic updates preserve expanded category cards and pause when a reviewer is writing a note.

Source observation and durable synchronization have separate timestamps and errors. A successful sync means the review entries were saved or already present, never that their facts were approved or published. Same-process syncs are serialized; cross-process uniqueness is not promised by the private database.

Focused cache, classification, authenticated-handler, sync-state and display tests pass. Independent review findings about effective decision status, unsaved notes and premature connection wording were fixed and regression tested. Exact-revision comprehensive and hosted checks are pending.

Documentation impact: update the owner operations, design reference, decisions, and How the project works source-review diagram, with matching hub image and accessible text. Notion synchronization and verified-live evidence will be recorded after release; current state is implemented, not released.
