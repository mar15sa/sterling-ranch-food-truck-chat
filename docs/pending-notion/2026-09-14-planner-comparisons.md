# Pending planner-comparison update

Status: locally captured development evidence, not selected or deployed. Automatic approval review previously rejected an external Notion write containing internal experiment/status details; confirmation to retry has not arrived. Fetch the target before a later permitted edit and afterward to verify, preserving unrelated content.

Targets: [Decisions](https://www.notion.so/3dabf909186d8139ac52ebdbf77d8bea), answer-quality/model decision; [Audit](https://www.notion.so/3dabf909186d81a2a090c2cb90183e96), dated experiment follow-ups. No resident flow/UI or diagram changes.

Exact proposed text:

> September 14, 2026: two controlled interpretation diagnostics completed 48 calls on six authored mixed questions, two repetitions per model. The first changed only Haiku versus Sonnet on the captured planning instructions; the second removed duplicate output fields and advertised only supported connector capabilities. The latter is a bundled contract change, not an isolated test of each field. Full raw provider output is retained; nothing was deployed.
>
> Model-only replay: Haiku 10/12 structurally valid with no rejected bindings; Sonnet 12/12 structurally valid but 9/12 without rejected bindings. Compact contract: both 12/12 structurally valid; Haiku 8/12 and Sonnet 12/12 without rejected bindings. Semantic inspection still found missing requested outcomes, incorrect evidence roles, and a Sonnet lighting follow-up that added year-round operation to a question about remaining installed. Binding success is not an answer-quality rating. Neither model nor contract is selected.
>
> Combined replay cost was $0.351258 using provider token counts at dated rates; all usage was captured. Compact interpretation-only costs per 1,000 calls were $4.05 Haiku and $10.29 Sonnet, with median/sample-p95 times of 2.45/2.59 seconds and 3.20/3.89 seconds. These exclude answer writing, checking and hosting. The current mixed experiment phase has $1.441015 known cost and $3.841712 conservatively reserved of $5; earlier phases remain separate. No new subscription was created.
>
> Compact experiment revision 9a31a62a8b03ad4fd44fdb984c3eaf3854da51b0; completed September 14 at 23:57:20 UTC. Twenty focused checks passed. The contract remains a local diagnostic, not integrated into resident answering. Full-answer quality/cost, source relevance, human-calibrated ratings and unseen acceptance remain pending. These results reinforce that more expensive models alone do not resolve the underlying issue.

Supporting report: `docs/COMMUNITY-PLANNER-REPLAY.md`. Local captures: `artifacts/quality-eval/planner-model-replay-20260914/manifest.json`, `artifacts/quality-eval/compact-planner-replay-20260914/manifest.json` and `comparison.json`. Historical interpretation context is not current source evidence or verified-live behavior.
