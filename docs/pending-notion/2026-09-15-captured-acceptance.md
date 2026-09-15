# Pending captured-answer checker comparison

Status: completed local development experiment; neither checker selected or deployed. The prior external Notion write containing internal experiment/status details was rejected by automatic approval review. Confirmation to retry remains pending. Do not retry or label synchronized. Fetch the destination before a later permitted edit, preserve unrelated content, and fetch afterward.

Targets: [Decisions](https://www.notion.so/3dabf909186d8139ac52ebdbf77d8bea), automatic acceptance configuration; [Audit](https://www.notion.so/3dabf909186d81a2a090c2cb90183e96), completed diagnostic and follow-up. No resident diagram/UI change.

Exact proposed text:

> September 15 UTC / September 14 Denver: the existing experimental final-answer checker was tested on fourteen unchanged captured model answers: seven supported and seven with source-checked defects, each twice with Haiku 4.5 and Sonnet 5. Labels and writer identity were hidden from the checkers. This is assistant-reviewed development data, not human calibration or unseen acceptance. Capture revision d34ed8f completed all 56 calls; model usage was $1.035041 with zero unknown usage, and $2.966696 reserved against the $5 cap. The phase is closed.
>
> Both models accepted all fourteen supported-answer attempts. Haiku accepted eight flawed attempts, rejected four for the wrong reasons, and produced two invalid assessments. Sonnet accepted thirteen flawed attempts and identified the intended defect once, then accepted that same answer on its repeat. Neither non-reasoning configuration is suitable as a release gate. Source IDs and fluent assessments did not ensure content verification.
>
> Checking alone cost approximately $9.95 per 1,000 Haiku calls or $27.02 per 1,000 Sonnet calls in this diagnostic mix; at 10,000 checks, about $99.45 or $270.21, excluding every other answer stage and hosting. Median/sample p95 checking time was 3.58/13.09 seconds for Haiku and 7.06/20.23 seconds for Sonnet. All requests explicitly disabled thinking; Sonnet reports zero thinking tokens, while Haiku omits a separate breakdown. No model, subscription or production change is selected.
>
> Next compare bounded adaptive reasoning against disabled reasoning within the same Sonnet checker, with equal output caps and unchanged evidence/prompt. The proposed forty-call, ten-answer repeated design has an offline upper estimate of $4.275776 under a separate $5 ceiling; no follow-up calls have been made. Preserve wrong-reason rejection analysis, complete latency and token accounting. Owner communication calibration, unseen acceptance, full-flow cost and live demo readiness remain outstanding.

Evidence: `docs/COMMUNITY-CAPTURED-ACCEPTANCE.md`; `artifacts/quality-eval/captured-acceptance-20260915/manifest.json`, `comparison.json`, `reason-review.json`, predeclared labels and raw call ledger. No live revision was verified by this experiment.
