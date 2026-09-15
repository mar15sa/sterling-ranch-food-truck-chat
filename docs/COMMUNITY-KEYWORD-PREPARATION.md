# Bound keyword preparation reuse

Planned September 15 UTC / September 14 Denver. Previous turn made progress: evidence-role routing with hybrid rules retained diagnostic sources but was slow; CPU profiling identified repeated preparation. The hybrid adapter creates a new index object per query, so the existing WeakMap statistics cache never reuses its entry.

Test a bounded, single-entry index view keyed by the exact frozen rule corpus, current ordered eligible document IDs and source metadata. Every call verifies the full original corpus hash and exact eligible source objects. Eligibility is rebuilt by the existing question/lifecycle rules before asking for a view. A changed source, version, tenant, order or eligibility cannot reuse an old preparation. This caches preparation, not answers, query scores or final results. Keep only one current view; no accumulating set of question caches. Default experimental ranker behavior remains unchanged until comparison evidence is reviewed.

Compare fresh versus reused keyword-index preparation over the six saved governing-rule queries from the CPU profile, using the exact current 926-document corpus and existing keyword function. Two repetitions, randomized arm/query order, first calls cold. Preserve every result's full hash, IDs, scores and excerpts. Require exact full-output equality per query across arms/repetitions; do not claim equivalence from source recall alone. Measure retrieval call time, including validation and preparation, and record actual cache hits/misses. No reranking weights, retrieval depths, source projections or query wording change.

If successful, test the opt-in adapter through the complete routed hybrid packet path and compare to saved packets. Scope/freshness/withdrawal tests and malformed-eligibility tests must pass. No production optimization, paid model call, new download, subscription or release. CPU/memory savings are local measurements, not hosting prices or full-answer latency. Broader routing, proactiveness, final answers and human rating calibration remain outstanding. Notion synchronization remains pending the prior external-write rejection.

## Isolated result and integration freeze

Capture d57a6ee completed 24/24 searches in keyword-preparation-20260915, process 78153 exited 0. All full returned objects match exactly across both methods and repetitions, including IDs, scores, metadata and excerpts. Cache statistics: one miss and eleven hits, one retained view. Fresh preparation median / sample p95 1,996 / 3,042 ms; reused preparation 1,657.5 / 2,435 ms (twelve attempts per arm). Median reduction about 17%, in a small local run with substantial timing variation. No production or whole-answer improvement is yet established. Nineteen relevant tests passed before the run.

Freeze the complete-packet follow-up: the same five saved plans twice, routed hybrid rules/community semantic control versus the identical path with keyword preparation reuse enabled. One shared model runtime, both arms still perform current eligibility and corpus binding; only the preparation view differs. Compare full source/action payloads to each other and the prior routing capture. No routing, ranking, fact, query or limit changes. Record cache hits/misses and packet timing.

## Complete packet result

Capture **cc313d319f4cf9c74f67c126d2505b2ac846c5fe**, artifacts/quality-eval/prepared-hybrid-packets-20260915. All 20 packets completed; process 44814 exited 0. All source/action payloads match the earlier routed hybrid capture exactly. Sources, actions, omissions and exclusion diagnostics match between current arms and both repetitions. This demonstrates unchanged evidence selection on the tested cases, not improved answer quality.

| Packet | Fresh preparation median | Reused preparation median |
| --- | ---: | ---: |
| Application navigation | 355.5 ms | 333 ms |
| Lighting process | 4,329.5 ms | 3,940.5 ms |
| Shed height and form | 3,583 ms | 3,079.5 ms |
| Hot tub and pergola | 10,626.5 ms | 8,544 ms |
| Pergola permission and form | 2,889 ms | 2,442 ms |

Each case median has two observations. Overall packet median / sample p95: fresh **3,583 / 11,204 ms**, reused **3,079.5 / 8,813 ms**, ten attempts per arm. Median reduction is about 14%. All five paired case medians improved, but desktop load and small samples limit generalization. This run was slower overall than earlier captures; compare randomized arms within this run rather than treating historical absolute times as a stable production baseline.

Preparation had one miss and thirteen hits, retaining one view. The generic application needs no rules, so its small timing difference cannot be attributed to keyword caching. Community initialization took 625 ms, rule initialization/window verification 1,278 ms. Peak harness memory was 428,662,784 bytes (about 409 MiB). The cache contains a bounded index view and lets the existing search cache retain its prepared statistics; it does not store query answers or grow with question count.

The slowest improved packet still takes 8.813 seconds before interpretation/writing/checking are included. This does not satisfy the proposed full-answer p95 target. Do not add independent stage p95 values, infer hosting savings from milliseconds, or claim the complete flow is now fast enough. Paid API calls, new subscriptions and model downloads are zero; production hosting and completed-answer costs remain unmeasured.

Twenty-one focused checks now pass, including actual clock-driven rule expiration and question-specific withholding, plus exact content/tenant/membership/order binding and existing retrieval boundaries. Initial source identity validation remains in the semantic ranker; the helper independently verifies the full corpus before reuse. A changed corpus rejects reuse rather than updating cached evidence implicitly.

**Decision:** retain source-bound preparation reuse as an opt-in experimental performance improvement. Default production behavior and default experimental ranker configuration remain unchanged. Future routed hybrid comparisons can enable it explicitly while preserving the same evidence gates. This is not selection of the overall assistant architecture or model mix.

Next broaden the evidence-routing assessment beyond five architectural examples. Existing mixed-flow cases cover waste plus rules, food/menu, pool status/hours and follow-ups; current community retrieval cases cover billing, reports, caregivers and booking. Preserve live routing, current-source refresh and negative/ambiguous behavior, and explicitly measure useful next-step losses. Do not keep improving only the known five source-presence scores. The remaining keyword preparation/scoring overhead, source relevance, proactiveness, final-answer quality and automatic ratings still need work. Paid comparisons and human calibration remain pending.

Reproduce the complete-packet audit: `node scripts/quality-eval/summarize-prepared-packets.js artifacts/quality-eval/prepared-hybrid-packets-20260915 artifacts/quality-eval/purpose-routing-hybrid-20260915`. The isolated comparison preserves its 24 full outputs and hashes. Historical captures remain untouched, and Notion update is pending locally.
