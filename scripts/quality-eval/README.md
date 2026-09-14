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
