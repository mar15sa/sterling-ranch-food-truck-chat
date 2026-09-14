# September quality evaluation
This is an isolated evaluation toolchain, not a resident answer implementation. All authored questions are diagnostic/development cases and must not be counted as unseen holdout results.

Root cause under investigation: question meaning, retrieval scope and context, composition, and semantic validation can fail independently. Existing cost metrics omit rules-search token usage and cannot establish the full cost per answer.

Before/after target: preserve the successful current answers, make paraphrases and follow-ups equally useful, and compare every model call needed to achieve that result. No official facts or fixed resident answers are added to application code.

Authority boundary: captured live answers and their source records are a baseline snapshot, not new source approvals. Same-evidence composition tests cannot repair missing source coverage. A current-source/approved-projection check remains necessary before a winning candidate can serve residents. Questions and source text are untrusted data; provider credentials are read from the existing environment and never written to artifacts.

Reuse boundary: evaluation transport, usage accounting, model selection, and case schema are shared. Community facts and examples live in the explicit evaluation corpus/evidence snapshots, not the runtime engine. Live-source errors and incomplete usage remain visible; no retry loop may run without a bound.

Scope of this first change: reproducible baseline capture, isolated composition experiments, and accounting primitives. Runtime behavior, source controls, and UI are unchanged. Full-flow implementation, retrieval comparison, human calibration, unseen tests, and release verification remain outstanding.

Costs: measured usage multiplied by a dated price snapshot is an estimate, not a provider invoice. Missing usage or unknown rates must remain unknown, never silently zero. Include rejected/failed calls and report unknown-charge attempts. Reasoning tokens included in provider output tokens must not be billed twice.

Model exclusions: Fable and Astra are forbidden. Model choice may differ by stage. Initial available staging provider: Anthropic. OpenAI and Gemini keys were absent when checked September 14, 2026. Model-list access is not proof that a paid generation succeeds.

No deployment is performed by these tools. A paid pilot has explicit model/case/repetition limits and a conservative reservation cap. Run through the existing staging environment without changing its variables or copying secrets to files.

## Independent grading and compact acceptance

`compare-answer-assessment.js OUT_DIR [v1|v2] [comma-separated-case-ids] [cap-usd]` compares detailed grading with Haiku 4.5 and Sonnet 5. Revision v2 enables strict tool output and clarifies necessary-clarification scoring. `compare-acceptance.js OUT_DIR` compares the compact coverage/correctness contract on fifteen invented diagnostic cases, twice per model, with a $1 conservative reservation. These tools never call the resident question route. All fixtures and result records are tests; synthetic facts are not approved resident evidence.

`analyze-answer-assessment.js OUT_DIR` summarizes either completed run. Historical field names such as `estimatedPerAssessmentUsd` mean the single evaluated stage; the manifest's `kind` distinguishes detailed grading from compact acceptance. Costs are additional stage costs, not the complete proposed system. Invalid/inconsistent outputs remain unassessed, not successful or free. Captures preserve original dispositions; any later validator recheck must record differences separately.

See `docs/COMMUNITY-ANSWER-ASSESSMENT-EXPERIMENT.md` and `docs/COMMUNITY-COMPACT-ACCEPTANCE-EXPERIMENT.md` for results and limitations. No candidate has been selected for runtime use or calibrated against independent human ratings.
