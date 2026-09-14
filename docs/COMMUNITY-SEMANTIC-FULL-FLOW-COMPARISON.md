# Full-flow semantic comparison — September 14, 2026

Later evidence: [Controlled writer replay](COMMUNITY-WRITER-REPLAY.md) compares Haiku, Sonnet and Opus on identical evidence for two known failures. Opus shows targeted promise at higher composition cost; its full-answer price and representative quality remain unmeasured.

**Decision: retain semantic retrieval as a promising development candidate; select neither writer for release.** All eight candidate pergola trials retrieved and used the specific governing subsection that the earlier keyword packets missed. Both candidates still have material evidence-use failures and miss the proposed 10-second p95 target. No representative useful/excellent rate or human agreement has been established.

## What was measured

Completed at 22:27:04 UTC, local revision `f126d6ef91666f7dea095c8e3b16e14a9e19547c`. Eight authored document questions, two repetitions, three arms: 48 trials, 66 provider calls, zero unknown-usage calls. Candidates use fresh Haiku interpretation, local semantic-plus-keyword rule retrieval, the complete approved static action/process catalog, then Haiku or Sonnet composition. Same composition prompt as the previous simpler-flow capture. No inline AI grading or repairs; candidate answers explicitly remain unreviewed. The current-local control runs the existing local application flow, including previously implemented fixes.

The exact scoped corpus and model cache are checked before use. Current-clock eligibility and per-trial snapshot verification remain active. Source approvals are unchanged; staging-only form documents are excluded. Live adapters are not executed in this document-only comparison.

| Measured answer flow | Current local | Haiku interpretation + Haiku writer | Haiku interpretation + Sonnet writer |
| --- | ---: | ---: | ---: |
| Questions | 16 | 16 | 16 |
| Provider calls | 6 | 30 | 30 |
| Answers present | 16 | 16 | 16 |
| Independently established excellent answers | Unknown | Unknown | Unknown |
| Median completion | 1.57 s | 7.71 s | 9.76 s |
| Sample p95 completion | 5.90 s | 14.40 s | 14.05 s |
| Answering API cost per question | $0.001006 | $0.011925 | $0.028166 |
| Answering API cost per 1,000 | **$1.01** | **$11.92** | **$28.17** |
| At 10,000 questions/month | $10.06 | $119.25 | $281.66 |
| At 50,000 questions/month | $50.29 | $596.23 | $1,408.28 |

These scenarios repeat the measured question mix. They are not a production invoice or a commitment. The trials share one process and existing application caches; this is not a controlled cold-versus-warm traffic study. The earlier current-local capture had two timed-out calls with unknown charges and remains unknown in full, even though this new capture has complete usage. Do not replace its missing bills with this run's price.

## Calls and tokens

All figures below cover the whole 16-question arm, including its captured attempts. No provider prompt-cache tokens were reported. Candidates explicitly disable thinking. The control has some requests without a thinking setting; no separate reasoning-token count is supplied, so none is invented.

| Arm / stage | Calls | Input tokens | Output tokens | Token-priced cost |
| --- | ---: | ---: | ---: | ---: |
| Current / understanding | 3 | 6,283 | 774 | $0.010153 |
| Current / composition | 1 | 896 | 170 | $0.001746 |
| Current / rules search planning | 1 | 259 | 106 | $0.000789 |
| Current / rewrite | 1 | 2,719 | 137 | $0.003404 |
| Haiku candidate / interpretation | 16 | 24,316 | 3,839 | $0.043511 |
| Haiku candidate / composition | 14 | 130,374 | 3,382 | $0.147284 |
| Sonnet candidate / interpretation | 16 | 24,316 | 3,842 | $0.043526 |
| Sonnet candidate / composition | 14 | 175,276 | 5,657 | $0.407122 |

Total test cost: **$0.657535**, using dated standard rates already documented in the [earlier cost comparison](COMMUNITY-SIMPLE-FLOW-COMPARISON.md), not invoice reconciliation. Conservative reservation: **$1.819969 of the new $3 ceiling**, leaving $1.180031 of reservation capacity in this phase. Earlier phases remain separately accounted; no subscription was created.

Local semantic initialization took 1,146 ms before trials. Per-question retrieval is included in candidate completion times. Reused vectors mean no paid embedding call or new indexing build in this run. The earlier local build took about 475 seconds, with approximately 34 MB model storage and 2.30 MiB vector data; those are historical local measurements, not recurring Railway charges. Hosting, memory allocation, refresh/reindexing operations, source maintenance and background human/AI grading remain unpriced for the proposed production configuration. Their exclusion is not a claim of zero cost.

Compared with the previous keyword-based simpler candidates, measured answering cost rose from $11.32 to $11.92 per 1,000 for Haiku and from $26.42 to $28.17 for Sonnet. These are separate sequential captures with fresh model outputs, not a randomized retrieval-only causal estimate. The earlier fixed-interpretation 16-call replay supplies the more controlled evidence that retrieval recovers the missing subsection.

## What improved and what still fails

- All eight pergola-related candidate drafts contained the specific rule's height limits, with the corresponding subsection present in their evidence packets. This reproduces the targeted retrieval improvement through fresh interpretation and full answering. It does not establish eight excellent answers.
- The lighting follow-up retains its prior subject. But examples flow-012, flow-021 and flow-024 still imply a verified project-specific form from directory-only evidence. Flow-016 contradicts itself about whether a standalone lighting form exists. A known official directory does not establish which exact form applies.
- Haiku shed answers flow-019 and flow-031 turn a qualified general height guideline into an absolute maximum, although the packet includes the express case-by-case exception. Sonnet flow-041 and flow-045 preserve that height qualification better. The improvement on this one rule does not justify choosing Sonnet across all stages.
- Six of 32 candidate outputs exceed the requested 180-word prompt limit. More consequentially, some process answers add conditions or requirements beyond the scope established for that project. Flow-007 generalizes a front-installation elevation requirement; flow-048 mixes warm-white requirements with seasonal color allowances without clearly separating when each applies.
- Flow-042 admits the exact-form gap, but sends the resident through extra contact options despite a known forms directory. Missing evidence should not produce a maze of next steps.

These are primary-agent development observations, not blind human scores or an exhaustive factual audit. Model-anonymous review material is saved, but creating that file is not evidence that an independent person reviewed it. The original captures and dispositions remain unchanged. Saved local evidence: `artifacts/quality-eval/semantic-full-flow-20260914/{manifest.json,comparison.json,blind-review.jsonl,development-review.json}` and individual trials.

## Consequence for the goal

Semantic retrieval addresses a real missing-evidence cause. The remaining bottleneck is faithful use of evidence: preserving exceptions, distinguishing a directory from an exact form, and answering the requested task without unrelated obligations. A vector database alone would not fix those failures. The next writer comparison should explicitly test these conditions, include another eligible model only within a bounded measured design, and then extend the candidate through live adapters and a broader representative benchmark. Human calibration and the unseen acceptance set remain required before selection or release.

Eighteen focused integration/source tests plus the comparison-summary test pass. The prior 874-test full runtime suite is unchanged evidence for prior runtime work; this experiment is not imported by resident routes. No release or live-readiness claim. Notion synchronization is pending under the earlier automatic approval rejection; exact proposed text is saved in `docs/pending-notion/2026-09-14-semantic-full-flow.md`.
