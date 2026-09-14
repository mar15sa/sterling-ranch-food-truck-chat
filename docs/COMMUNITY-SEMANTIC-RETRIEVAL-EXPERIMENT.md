# Semantic retrieval comparison

Planned September 14, 2026; experimental only. No resident route or paid database is being enabled.

Question: does learned semantic retrieval recover relevant evidence that current keyword retrieval misses, and does a keyword/semantic combination preserve both? This tests retrieval separately from the demonstrated coordinator problem where a correct clarification is ignored. No retrieval method may make a missing fact true or select unapproved evidence.

Use the already loaded, owner-projected rules snapshot with its original source/version identities. Limit the experiment to one configured community and current eligible documents. Apply the existing question-specific owner-withholding predicate equally to keyword and semantic candidates before ranking. Split embedding input into bounded overlapping windows while retaining exact source offsets and full original evidence; verify every window fits the model's token limit rather than silently dropping a section's tail. Preserve partial approvals and inherited metadata. Scope/version failures withhold evidence; semantic similarity never grants source approval.

Compare the existing keyword ranking, local pinned BGE embeddings, and reciprocal-rank fusion of the two under the same candidate corpus and question. Rank document identities using the strongest matching window; retain its exact excerpt. Recover bounded same-version context only through the shared section assembler after retrieval. A later relevance/completeness reranker may select among these candidates, but cannot use this experiment to bypass approval, source freshness or subject constraints.

Use the existing diagnostic questions. Current operational questions without appropriate live-connector evidence remain evidence gaps in this rules-only corpus, not failures that embeddings may fill from old policies. Follow-ups need the same explicit context in both retrieval variants. These development cases are not a frozen holdout and raw retrieval metrics cannot certify useful/excellent answer rates.

Record model/runtime revision, corpus and question hashes, token-window coverage, index time, index size, local query latency and ranked evidence. No per-embedding API fee is expected for local inference; actual hosting CPU/memory/storage impact is still an unmeasured commitment. Compare full-section context, hybrid retrieval and optional reranking before recommending any database subscription. Require scope-isolation and coverage tests before running the corpus comparison.

## Local execution checkpoint

The comparison uses Transformers.js 4.2.0 installed only under `artifacts/quality-eval/semantic-runtime`; no application dependency changed. Run `prepare-semantic.mjs` once to populate the pinned local model cache, then `compare-semantic.mjs` with a fresh output directory. The comparison explicitly loads the cached model and tokenizer from the revision directory with remote model access disabled. This avoids a runtime file-discovery issue when operating entirely offline.

Three initial attempts failed before embeddings were produced: local-cache configuration, missing tokenizer discovery, and explicit-component cache discovery. Their separate manifests retain failed status. The corrected `semantic-comparison-v4-20260914` run began with 955 loaded documents, 926 eligible documents and 1,569 bounded embedding windows. It is still running at this checkpoint; its manifest is the authority for progress and completion. Do not infer completion from this document. Use `analyze-semantic.js` only after the capture reports `captured`; it refuses incomplete runs and produces descriptive rankings and resource timings, not quality scores.

Three focused checks pass: community/lifecycle/owner withholding, complete source-window coverage within token budgets, and rank fusion preserving source versions. The normal test-runner subprocess was denied by the local sandbox, so the same test module was executed directly and all three tests passed. This is local tool validation, not a release gate.

Resident retrieval behavior remains unchanged; the only runtime-module edit exposes three existing source-eligibility helpers for the experiment. The shared request/evidence repair is planned separately in `COMMUNITY-REQUEST-EVIDENCE-CONTRACT-PROPOSAL.md`. No current-flow diagram update is needed for these experimental tools and proposal; runtime integration will require one.
