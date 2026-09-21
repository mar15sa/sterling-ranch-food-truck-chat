# Pending Notion update: isolated openings release lane

- Target page: Owner operations and privacy — https://www.notion.so/3dabf909186d81028da2d4e84f033e77
- Status: proposed locally; not yet merged or verified live
- Date: September 21, 2026

## Proposed operating-guide update

Verified openings catalog and source-list updates now use an isolated release lane. A release qualifies only when its complete diff contains `data/openings.json` and/or `data/openings-sources.json` and no other files. That narrow change runs openings-specific validation instead of the Community Assistant evidence refresh, so an unrelated changed CAB source cannot block a time-sensitive store or restaurant update.

The shared staging branch contains other work and is never merged wholesale for an openings release. After staging verification, create a clean promotion branch from current production, copy only the verified openings commit, confirm the full diff is still limited to the two allowlisted files, and merge through the protected `quality` check. Production must then report the exact merged revision as ready and return a valid openings catalog before the update is described as live. The post-push check uses the same two-file classifier, so unrelated Community Assistant evidence warnings do not falsely fail an openings-only deployment; any mixed release still receives the complete evidence-health check.

All Community Assistant code, source-evidence, answer, and UI changes continue through the complete evidence revalidation and quality suite. The isolated lane does not approve facts, bypass protected main, or relax source review.

## Verification still required

- Merge revision for the release-lane implementation.
- Passing normal full-quality check for the implementation itself.
- A passing openings-only `quality` run on an isolated catalog update.
- Exact staging and production health revisions for the first promoted update.
- Fetch the Notion page before editing, preserve unrelated content, update this section, and fetch again to verify.
