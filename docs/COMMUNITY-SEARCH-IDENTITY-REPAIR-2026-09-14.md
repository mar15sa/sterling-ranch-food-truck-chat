# Preserve the selected passage's identity

Planned September 14, 2026, before implementation. Local candidate only.

The shared keyword search groups chunks under a section. When a later chunk scores higher, it replaces the returned text and excerpt but retains the first chunk's ID, hashes and other metadata. A local reproduction with a backyard-shed question returns general-standards chunk 5 text labeled as chunk 1. This affects any multi-chunk section where the strongest passage is not first. The exact-identity section assembler correctly refuses that mismatch, leaving incomplete evidence for writing.

The semantic comparison has a related measurement error: serialization looked up the returned ID in the original corpus and therefore saved the first chunk instead of the actual winning keyword passage. Section titles and ranking positions remain descriptive evidence, but keyword/hybrid passage text and expansion fields need recapture. Preserve the old capture and record the defect; do not silently rewrite experimental history.

Repair the shared search aggregation to carry the entire winning document while retaining only explicitly accumulated ranking statistics. Group and deduplicate by section plus community/source/version identity, rather than a bare node name, so identical node names cannot blend different sources or versions. Add an experiment assertion that returned ID and text match before serializing evidence.

Before: a relevant later paragraph may carry an earlier paragraph's identity, preventing safe expansion or confusing consumers. After: the selected paragraph and its identity agree, allowing the existing bounded same-version assembler to recover available context. No new local facts, amount, authority, action URL, source approval or freshness exception is introduced.

The core owns ranking and identity preservation. Profiles/adapters continue to supply community/source metadata. Current eligibility, owner restrictions, supersession and source-failure behavior are unchanged. Unidentifiable, restricted or incomplete context still fails closed. No UI layout change or live-connector change is proposed.

Required proof: a stronger later chunk returns its own ID/hash/text; same-named sections with different source/community/version identities do not merge; selected identity enables full same-version section assembly; adjacent source-family and section-context tests pass. Capture before/after cases under test labeling. No release or demo-readiness claim follows from these checks.

## Implemented and verified locally

The repair now carries the complete winning document and preserves only accumulated match/score statistics. Grouping and source deduplication use community, source URL, node, product, publishing job, source hash, supplement parent and inline/supplement flags. The experiment refuses to serialize mismatched IDs and text.

The authored 32-question audit found 49 mismatched results across 24 questions before the repair, considering each question's top ten keyword results. The same audit found zero afterward. Two synthetic tests failed before and passed after; 18 related identity/context/prompt checks passed. The final full local test suite passed **846/846** in `artifacts/quality-eval/search-identity-suite-final.log`, and the resident-literal guard passed. An earlier full-suite run lost its process handle and had no terminal summary; it is not counted as a pass. The final run exited successfully.

The corrected 32-question capture is `artifacts/quality-eval/semantic-identity-recapture-20260914`. It verifies exact corpus/model/window identities before reusing existing vectors and retains the original capture. The old capture's keyword/hybrid passage text and expansion fields are superseded for analysis; old title/rank observations are limited accordingly. The reuse run performed no new document embedding calls and no paid API calls. Local resource timing is not production cost or latency evidence.

## Request-specific retrieval experiments

The 32 cached refined-Haiku plans represent 16 questions twice. Twenty-nine plans generated 42 distinct need queries; three produced clarification without search (two appropriate unanchored-cost cases and the already-known unnecessary lawn clarification). No additional understanding-model calls were made.

Two offline comparisons completed all 42 queries: `semantic-per-need-20260914` uses subject plus requested outcome; `semantic-task-query-20260914` additionally includes a generic task description. Both preserve the original question, standalone meaning and constraints for owner-withholding checks. All search modes use the same eligible corpus and same query in each comparison. Two query-construction tests pass; these are not human judgments about interpretation accuracy.

Separating needs preserves the hot-tub and pergola obligations but does not automatically improve form retrieval. The naive form query retrieves architectural roof shapes; the task description improves the pergola form's semantic first hit to the architectural forms section, while fusion still promotes unrelated applications. The direct design-review application question still misses titled forms in its first ten results. No retrieval variant is selected. Candidate queries, understanding and reranking must be assessed together without allowing a nearby topic to count as evidence for the requested outcome.

## Form-source approval diagnosis

The repository community index already contains the architectural application and landscaping packet, outside the rules-only corpus. Its current local approval gate returns no answer or action projection for those PDF sources. The forms directory has an approved navigation-link projection only. Thus neither embeddings nor ordinary ingestion can by itself authorize a direct application action or the facts printed on the form.

A fresh direct official-site request on September 14 returned the 2026 application/packet links matching the repository titles. The search engine's cached page and PDFs instead returned older 2023/2024 labels. Preserve this distinction: cached search results are not current-version approval evidence. The fresh directory HTML and exact local gate results are saved in `artifacts/quality-eval/form-source-gap-20260914`; this is not a live production approval audit.

Next source work should prepare exact-version, narrowly scoped form/action review candidates using the approved source workflow. Do not approve a whole PDF or infer fee/permission authority from an action link. The shared runtime must select actions by the requested outcome after establishing the governing requirement. No source approval or resident record changed in these experiments.

Notion synchronization remains pending after the earlier automatic approval rejection. The local pending update contains the revised explanation and candidate-flow diagram text. No release has been pushed or deployed.
