# Pending source-bound search preparation result

Target: [Decisions and their reasons](https://www.notion.so/3dabf909186d8139ac52ebdbf77d8bea), September quality/performance decision. Fetch before an authorized edit and preserve unrelated content.

Status: implemented and measured only as an opt-in local experiment; no production adoption or deployment. External synchronization remains pending the earlier automatic approval review rejection of internal experiment/status details. No retry was made.

Intended text:

> September 15 UTC / September 14 Denver: the experimental hybrid rules search can reuse query-independent preparation instead of rebuilding an index view for each query. Reuse is bound to the full unchanged source corpus, current ordered eligible sources and community; it does not cache answers. Changes in content, eligibility, expiry or question-specific withholding prevent inappropriate reuse. Only one preparation view is retained.
>
> A 24-search comparison produced exactly identical full results across methods. A subsequent 20-packet comparison preserved every source, action, omission and exclusion diagnostic, and matched the previous routed hybrid source payloads. Median packet retrieval improved about 14% in this small randomized desktop test, from 3.583 to 3.080 seconds. The sample p95 improved from 11.204 to 8.813 seconds, which is still too slow to establish the full-answer ten-second target once the other stages are included. Twenty-one focused checks pass.
>
> No paid API calls, new subscriptions, downloads or release occurred. Hosting savings and completed-answer cost remain unmeasured. Keep preparation reuse opt-in for further experiments; it does not resolve source relevance, compound proactiveness or rating quality. Next broaden testing beyond the five architectural examples, including live/mixed questions, information and ambiguous requests. Paid model comparisons and human calibration remain pending.

Evidence: docs/COMMUNITY-KEYWORD-PREPARATION.md; isolated capture d57a6ee in artifacts/quality-eval/keyword-preparation-20260915; full packet capture cc313d3 in artifacts/quality-eval/prepared-hybrid-packets-20260915. No verified-live speed or demo-readiness claim.
