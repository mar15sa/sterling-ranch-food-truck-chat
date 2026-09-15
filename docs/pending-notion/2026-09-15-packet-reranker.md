# Pending local relevance reranker decision

Target: [Decisions and their reasons](https://www.notion.so/3dabf909186d8139ac52ebdbf77d8bea), September quality/retrieval decision. Fetch before an authorized edit and preserve unrelated content.

Status: completed local development experiment, rejected as a final source filter; no production adoption or release. External synchronization remains pending the previous automatic approval review rejection of internal experiment/status details. No retry was made.

Intended text:

> September 15 UTC / September 14 Denver: a small local MiniLM relevance model was tested on the same complete candidate sets before the evidence limit. Ten scorer runs preserved approved fact/action text and repeated identically. Reranking retained the previously dropped shed form and put the two compound-question rules near the top. All five positive test packets then contained the specific diagnostic sources, compared with four before reranking. This does not establish final-answer quality: the lighting form fell to last place behind unrelated sources, and the shed form remained tenth. A score cutoff cannot retain those useful forms while excluding all higher-scored unrelated sources. The generic reranker is not selected as the final evidence filter.
>
> Model files add about 24 MB of disk usage, with no paid API calls or subscriptions. Added local processing ranged from about 0.27 seconds for the generic application to 4.61 seconds for the compound question. Production hosting and completed-answer costs remain unknown. Thirty focused tests passed; no resident questions or final answer ratings were generated. Next test routing each declared need to the appropriate source category, while checking completeness and useful proactiveness. Paid model comparisons and human rating calibration remain pending.

Evidence: docs/COMMUNITY-PACKET-RERANKER.md; artifacts/quality-eval/packet-reranker-20260915; capture dd2c0e5; model revision a09144355adeed5f58c8ed011d209bf8ee5a1fec. Exact file digests and local preparation results are in artifacts/quality-eval/reranker-runtime/ready.json. No live demo-readiness claim is supported.
