# Keeping the project guide current

Owner: Marissa Goldberg. The person or assistant making a change owns its documentation update. Added September 13, 2026.

Notion hub: https://www.notion.so/3dabf909186d81789a09e4648dbb4bbe

## Finish each change with a documentation check

1. Identify which explanation changes: product behavior, answer flow, source authority, configuration, design, operations, or a decision. Record a specific no-impact reason when none changes.
2. Fetch the relevant Notion page and verify behavior from the implemented code, current source/release evidence, and live configuration only where observable. Do not assume the local checkout matches production.
3. Make the smallest complete update and preserve owner edits. Keep historical audit findings dated. Record a decision's reason only when a source establishes it; otherwise label it unknown.
4. When Assistant routing, source review, evidence eligibility, composition, validation, or fallbacks change, update the diagram and its accessible text in How the project works. Update the hub image when the diagram changes.
5. For design changes, update the relevant screenshot, tokens, and approval reference after the approved change is verified live. Label previews as previews.
6. Keep proposed, approved, implemented, and verified-live states distinct. Record the checked section's review date, exact implementation revision, live verification status, and evidence links. Advance only the dates for sections actually checked.
7. Fetch the updated page to verify content, links, and image/diagram presence. Include the affected Notion links, or the specific no-impact reason, in the pull request or release record. After release, verify the live revision before changing a section's status to live.

## Page map

- How the project works: https://www.notion.so/3dabf909186d8166b507c2a4e1d1aced
- Decisions and their reasons: https://www.notion.so/3dabf909186d8139ac52ebdbf77d8bea
- Design and experience reference: https://www.notion.so/3dabf909186d81b99d91ddd39861536b
- Owner operations and privacy: https://www.notion.so/3dabf909186d81028da2d4e84f033e77
- Documentation audit and follow-ups: https://www.notion.so/3dabf909186d81a2a090c2cb90183e96
- Reference library: https://www.notion.so/3dabf909186d81a4ac4acdd95c30b71c

## Weekly safety net

The Codex automation **Keep Sterling Ranch guide current** (`keep-sterling-ranch-guide-current`) was enabled September 13, 2026 for Mondays at 9 a.m. in the owner's America/Denver timezone. Its current enabled/paused status is managed in Codex. Local scheduled checks need the computer on and the app running; enabling a schedule is not proof that a check has run.

Each run should:

1. Compare GitHub main and the public production `/api/health` revision with the last documented revisions. Inspect the relevant changes, workflows, references, configuration claims, and design evidence. Preserve unfinished local work; use current repository evidence when the checkout is older.
2. Update only supported factual explanations and references. Keep source approval and historical audit records intact. Never infer deployment from a merge or infer a decision's reason from implementation alone.
3. Check the Assistant diagram and text when the flow changes. Fetch each affected page before editing and afterward to confirm the update.
4. Record the checked scope, date, revisions, evidence links, and unresolved gaps in the affected page or audit follow-ups. Do not refresh a whole guide's verification date after checking only one section.
5. Stay quiet when nothing meaningful changed. Notify the owner only of a material documentation update, a newly discovered contradiction, an upkeep failure, or a required decision, with the affected Notion link.

Routine upkeep must not submit resident questions, run paid model benchmarks, release application code, change settings, approve sources, edit resident records, or message other people.

## Pull-request and release checklist

Every relevant change must use the documentation-impact section in `.github/pull_request_template.md`:

- Identify documentation impact, or give a specific no-impact reason.
- Link updated Notion explanations, diagrams, decisions, or design references, or identify the exact pending update.
- Check that status, review dates, and supporting revision links are accurate.

This is a required working/review checklist, not an automated GitHub gate that verifies Notion content. Documentation-only changes may skip runtime deployment checks under the engineering principles; existing required repository checks still apply.

## If Notion is unavailable

Save the exact intended update in `docs/pending-notion/<date>-<topic>.md` or the release record. Include the target page URL, affected section, proposed text or diagram change, supporting revision/evidence links, status, and why synchronization is pending. Report documentation as pending until the page is updated and fetched to verify it. Resolve the pending record afterward so it cannot be mistaken for unfinished work. Do not block urgent recovery solely on Notion availability.

This rule grants no additional publishing authority, source approval, credential access, or permission to expose private questions.
