# Pending semantic retrieval experiment update

Target: [Decisions and their reasons](https://www.notion.so/3dabf909186d8139ac52ebdbf77d8bea), September quality/retrieval decision. Fetch before any authorized edit and preserve unrelated updates.

Status: local experiment, completed diagnostic, no runtime adoption or deployment. External synchronization remains pending the previous automatic approval review rejection of internal experiment/status details. No retry was made.

Intended text:

> September 15 UTC / September 14 Denver: the local semantic search comparison completed 44 attempts using the current 88 approved community projections. It found every predeclared useful source group among the first four results on 16 of 20 positive development questions, compared with 12 for keyword search and 14 for equal-weight fusion. Both repetitions produced the same ranking. These are source-recall results, not final-answer usefulness or human ratings. The model still missed important project forms and a caregiver paraphrase, and returned neighbors for questions without an answerable subject/detail. No retrieval method was selected for production.
>
> The existing local BGE model required 12.53 seconds to build the index; vectors occupy 142.5 KiB. Median semantic query embedding, scan and freshness checking took 57.5 ms on this computer. Peak process memory was approximately 471 MiB. No paid API calls, subscription or deployment occurred; production hosting impact and all-in answer costs remain unmeasured. A vector service is not justified by this result alone. The next controlled comparison concerns retrieval-only descriptions from exact approved action proof, while keeping withheld claims out of answer facts. Paid answer/model tests remain stopped for the provider credit issue.

Evidence: docs/COMMUNITY-SEMANTIC-RETRIEVAL.md; artifacts/quality-eval/community-semantic-20260915; capture revision da578db; six focused tests passing. This experimental module does not alter the deployed source-to-answer diagram or production quality ratings.
