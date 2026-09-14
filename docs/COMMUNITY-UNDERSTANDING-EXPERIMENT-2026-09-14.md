# Understanding-stage comparison

Experimental scripts only, September 14, 2026. No resident route uses the candidate.

Root cause being tested: the current plan represents one subject with a small set of detail labels, and the conversation resolver can drop dependent requests. Process steps, exact form requests, multiple subjects and conditions need explicit representation. The candidate records a standalone question, individual subject/task/evidence needs, resident constraints and material ambiguity. Prior generated answers are excluded. This changes representation and prompting; it is not a model-only test.

Authority and reuse: planning can request a governing rule, official process/action or live operational source, but never approves evidence or supplies a community fact. Community profiles, source approval, current connector evidence and final verification remain authoritative. The candidate is not connected to retrieval or resident answers, so current live-source failure behavior is unchanged. No resident UI, configuration or service subscription changes.

Comparison: 16 existing diagnostic questions, two repetitions, current Haiku planner plus candidate Haiku/Sonnet/Opus. All are authored test records, not exported resident conversations. Current comparison includes existing conversation resolution and normalization; both variants use a 12-second characterization deadline, explicitly distinct from production's timeout and the ten-second full-answer target. Existing planner invocation on every question is a stage characterization, not production routing frequency. Provider usage and every request body (without credentials) are captured under a shared $5 conservative reservation limit. Raw and normalized current plans are retained. Plans are written separately without model labels for review, though schema differences can reveal the variant.

Validation: contract checks, exclusion of generated conversation text, fake-provider usage capture, credential exclusion and complete output preservation precede paid calls. Examine actual plans for subject/condition drift, missed goals, incorrect clarification, lost context and invented assumptions. Model self-assessment and schema validity are not usefulness ratings. This development set is not a frozen holdout, and independent human calibration remains required.

References checked September 14: [OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices) and [Anthropic tool definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools). Full current-versus-candidate answer costs, representative answer-quality gains, retrieval comparison and final model selection remain separate goal requirements.

## Measured results and root cause

The corrected comparison completed 128 calls: 16 questions, two repetitions, four configurations. All 128 produced structurally valid plans. This is not a quality pass rate. Candidate thinking was explicitly disabled; Haiku uses temperature zero, while newer models omit unsupported sampling controls.

| Understanding configuration | Calls | Input/output tokens | Estimated cost per 1,000 plans | Median / sample p95 |
|---|---:|---:|---:|---:|
| Existing Haiku plan and conversation resolver | 32 | 67,068 / 8,276 | $3.389 | 2.515 / 2.732 sec |
| Initial candidate Haiku | 32 | 41,754 / 8,382 | $2.6145 | 2.566 / 3.691 sec |
| Initial candidate Sonnet | 32 | 47,134 / 10,834 | $6.3315 | 3.396 / 4.845 sec |
| Initial candidate Opus | 32 | 44,958 / 10,878 | $15.5231 | 3.752 / 6.798 sec |
| Refined candidate Haiku, separate run | 32 | 48,602 / 7,445 | $2.6821 | 2.217 / 3.494 sec |

At an illustrative 10,000 understanding calls per month, these stage-only amounts would be $33.89, $26.15, $63.32, $155.23 and $26.82 respectively. Production can skip planning; proposed full-flow frequency, writing, checking, retries, embeddings, storage and hosting are not included. These are provider token counts priced at the September 14 standard rates, not invoices or a final commitment.

The existing planner itself correctly recognizes the unanchored cost question as ambiguous. A separate local integration replay supplied that actual plan to the current coordinator and still received water rates, with completion labeled complete. The coordinator treats a clarification as provisional for broadly classified rule questions and accepts a downstream source-built answer. The integration evidence is `understanding-pilot-v2-20260914/ambiguity-plan-integration.json`. This demonstrates that a better planner alone cannot fix the whole flow. The relevant coordinator boundaries are near lines 3299 and 3971; shared request-to-evidence checking must control fallback acceptance.

The current conversation resolver loses the lighting application follow-up in both repetitions. All six initial candidate plans retain the lighting subject and identify a form request. However, the initial candidate sometimes treats obtaining a form and submitting it as interchangeable. Its Haiku variant fills clarification text on 28 of 32 calls, often asking residents to restate clear requests. Sonnet and Opus each propose clarification on four calls, including optional project details. These observations are developer diagnostic review of saved plans, not independent human ratings.

The refined shared instructions explicitly separate a form from a submission destination, keep clarifications empty for searchable requests, require no guessed search for an unknown subject, and distinguish a live next occurrence from a recurring schedule. A further 32 Haiku calls produced three clarification requests: both genuinely unanchored cost questions and one of the two front-lawn submission questions. The other front-lawn repetition interpreted the request. Lighting follow-ups retain their topic and request the actual form in both repetitions. The remaining unnecessary clarification means this is not a selected or release-ready implementation. The same development examples were used for refinement, so this is not holdout evidence or proof of model superiority.

## Spending and interrupted run

The completed 128-call comparison cost an estimated $0.89146; the 32-call refinement cost $0.085827. Before those, an interrupted compatibility run saved 34 calls, 16 with usage totaling $0.046487 and 18 rejected requests without usage. A possible in-flight request at interruption is also unknown. Known usage across this turn therefore totals $1.023774; the exact total including unknown requests is not established. The combined conservative reservation, allowing $0.06 for the possible in-flight call, was $3.968164, below the stated $5 boundary. Failed runs remain separate and are not counted as completed model comparisons.

The failure exposed unsupported non-default sampling controls on newer models. Official [Sonnet migration documentation](https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5) and [Opus documentation](https://platform.claude.com/docs/en/models/opus-5/whats-new-opus-5) were checked before correction. The runner now stops at a provider rejection and saves its error message.

## Local semantic search readiness

An isolated artifact-only install of Transformers.js 4.2.0 runs the q8 BGE-small-en-v1.5 model locally. Model revision is `ea104dacec62c0de699686887e3f920caeb4f3e3`, with 384-dimensional normalized CLS embeddings and the model author's query instruction. A two-document synthetic execution check succeeded; setup/model-load time was 7.156 seconds and the small document/query encoding check took 329 ms. These figures are not production latency or a retrieval comparison. A shorter cache path resolved a Windows native filename-length issue.

The loaded rules snapshot has 955 documents and roughly 1.16 million text characters, including 15 owner-projected records. Indexing, scope-preserving chunking, hybrid retrieval/reranking, corpus coverage and comparative answer quality still need evaluation. No paid vector database, inference subscription, hosting change or application dependency was added. The package lock and readiness record stay in the local experiment artifacts; the reusable preparation script is under `scripts/quality-eval/`. References: [model author's instructions](https://huggingface.co/BAAI/bge-small-en-v1.5), [ONNX model](https://huggingface.co/Xenova/bge-small-en-v1.5), and [semantic-search guidance](https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html).

The proposed independent human calibration procedure is in `docs/COMMUNITY-QUALITY-RATING-CALIBRATION.md`. No automatic score or historical resident mark was changed. No resident runtime file changed in this experiment checkpoint, so the live-flow diagram remains unchanged; Notion records the experiment separately from the local evidence repair and live behavior.
