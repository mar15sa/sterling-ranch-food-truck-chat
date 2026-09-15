# Evidence brief experiment

Planned September 15, 2026 UTC / September 14 Denver, following the 96-call writer comparison. No resident integration or selection is implied.

Root cause: the writer receives complete evidence but sometimes omits a material qualification, changes a numeric condition, skips a requested form gap, or attributes an adapter limitation to an official page. These affect permission, process, mixed live/static, and multi-part question families. Additional retrieval alone cannot repair a transformation error after the relevant source has arrived.

Proposed behavior: an optional preparation model identifies one evidence brief entry per existing requested need, with an explicitly proposed completion outcome, exact source quotes for the direct answer, qualifications, process steps or conflicts, supplied action IDs, and a description of the remaining requested gap. The writer uses this as a reading aid alongside all original evidence. The existing final acceptance check independently checks both the brief and final answer against the full sources. Invalid preparation stops the experimental candidate without a verified answer; there is no silent extra retry.

The brief is a model hypothesis, not approved evidence or a new completion contract. Exact quotes prove copying, not relevance, completeness or truth. Software checks every need ID, quote, role, action ID and source/packet version, while preserving the full packet, diagnostics and conflicting sources. It does not generate summaries as new source facts or discard unselected sources. Bind the brief to the original question, prior resident questions, interpretation and packet hash. Recheck binding and live freshness before writing, repair and acceptance. Existing retrieval eligibility remains responsible for static approval/currentness.

Live quote validation uses the existing separated fact projection, so assistant timestamps and scope limits cannot be quoted as official source facts. The same community timezone and historical/live clock rules apply. A failed connector remains an explicit evidence gap, never an empty authoritative result. An action-only source cannot prove a governing or operational fact. A directory action may help with a gap, but exact form applicability remains a semantic question.

The shared core owns structure, identity and validation. Profiles and adapters continue owning local names, URLs, source facts, normalized live values, authority and coverage. No community-specific answer text, condition, schedule or special-case branch belongs in this helper. No resident UI or diagram changes.

Before/after target: a multi-part resident request currently receives a fluent answer missing a condition or a requested detail. With preparation, the answer should preserve the supported decision and conditions, explicitly name the missing part and offer the relevant approved next action. This is a testable target, not an observed improvement.

Validation: two-community fixtures; exact/changed quotes and numeric qualifiers; wrong role/need/action; missing and duplicate needs; unavailable live detail; conflicting sources; changed source/action/version/question/context; expiry during preparation and repair; checks retaining all evidence and the same brief. Existing writer-presentation and acceptance regressions must pass. Then compare eligible preparation models and writers on historical development captures, retaining failures and measuring the extra call. Require matched full-flow, representative blind/repeated quality evidence, cost and latency before adoption. Reuse existing acceptance and bounded repair; do not add a second checker or silently select a winner.

Evaluation follows the distinction between task-specific automated tests and human calibration in [OpenAI's evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices). A passing structural test is not a usefulness rating.

Documentation impact: local experimental flow and decision/audit only. Save exact Notion text locally while the prior external-write rejection is unresolved. No source approval, publication, subscription or paid call is authorized by this design document itself.

## Bounded model comparison

Within the owner's authorized model-comparison work, compare Haiku 4.5 and Sonnet 5 preparation across the same eight historical inputs, twice each (32 calls). Freeze input hashes, request hashes and the randomized order before calling. Maximum phase cap $5; the complete design preflight reserves $1.989356. The previous writer-presentation phase is closed at $1.898477 priced usage, with no reuse of its reservation. No subscription. This run measures preparation only, not complete answers. Retain invalid quotes and missing-condition cases; stop on provider failure/incomplete output or unknown usage without silently retrying. Software rejections remain in the denominator and do not stop the remaining diagnostic cases. Review coverage against full original sources before any writer comparison or selection.

## Implementation and observed result

Local implementation `4a07996` adds optional `evidenceBriefModel` to the experimental candidate; the resident/default flow is unchanged. One preparation call is shared by writer, checker and at most the existing single repair. Cost observation records `evidence-preparation` separately. No resident UI change.

The first attempt was rejected by the provider because strict tool schemas do not support the supplied `maxItems` setting. Revision `7d77659` moves those limits to descriptions and retains software enforcement, consistent with [Anthropic's guidance on unsupported schema constraints](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). The first attempted request remains recorded with unknown usage and a $0.037350 reservation. The corrected design reserves $1.995596 against the remaining $4.962650 phase allowance. This is a corrected request, not a retry of an unobserved running process.

The corrected run stopped at **21 of 32 planned calls**, when Sonnet's compound-case response reached the 1,800-output-token limit. The provider reported `stop_reason: max_tokens`; there was no usable brief. Process 5328 then exited 0 because the harness recorded the stopped state. The manifest, not the process exit code, establishes that the comparison is incomplete. There are no running calls to resume and no silent retries. The missing 11 jobs were not run.

| Preparation model | Observed calls | Input / output tokens | Priced usage | Median / sample p95 |
| --- | ---: | ---: | ---: | ---: |
| Haiku 4.5 | 13 | 129,706 / 6,336 | $0.161386 | 6.24 / 17.13 s |
| Sonnet 5 | 8 | 99,473 / 7,927 | $0.278216 | 10.88 / 16.68 s |

These groups have different case mixes and cannot rank the models. Total corrected-run usage is **$0.439602**, 229,179 input and 14,263 output tokens, all usage known. The earlier rejected request still has unknown usage, so the exact phase total is unknown. There were 22 total provider attempts, $0.439602 known priced usage, and $1.235961 reserved across both captures. This phase is closed; the unspent reservation is not reused. No new subscription. The observed preparation-only extrapolations ($12.41 per 1,000 Haiku attempts and $34.78 per 1,000 Sonnet attempts) are not matched workload comparisons or proposed recurring costs. They exclude writing, planning, retrieval, checking, repair, refresh and hosting.

### Checker corrections and semantic findings

The original validator accepted 8/21 captured attempts. Review found 27 quoted passages with whitespace-only differences and one with a different text sequence. Two overly strict rules also rejected legitimate navigation answers and governing qualifications based on their model-assigned purpose label.

The corrected validator restores the actual continuous source span when only whitespace differs, retaining offsets explicitly relative to the presented evidence text. Punctuation, numbers, case, negation and comparison wording are not normalized. A navigation source may directly support an official-action need; it still cannot support a binding or live factual need. Governing support can occur in a qualification, consistent with the existing flow's authority check. Full sources and original capture outputs are unchanged.

Offline revalidation accepts 18/21 structurally. The remaining cases are an overlong/invalid lighting entry, a changed recycling quote, and the truncated compound response. This is a correction to our validator, not new model output or improved accuracy. Original results and corrected dispositions are separate files. Fifty-nine focused tests pass with zero failures, skips or cancellations, covering exact spans, altered conditions, action/authority distinctions, community/source binding, expiry, cost reservation, the writer/checker/repair integration and existing live adapters.

Material limitations remain after structural correction:

- Haiku shed briefs 002 and 010 copy the height condition but omit the restricted-lot exclusion. Sonnet 003 includes that exclusion.
- Both captured Haiku lighting briefs (006, 019) include cut sheets and the submission route but omit under-eave elevations/termination points. The Sonnet lighting brief also omits that requirement and proposes an unsupported already-installed-lighting interpretation in its gap description.
- Sonnet pool brief 001 adds uncertainty about the seasonal schedule despite supplied historical date and regular hours. Both captured Haiku pool briefs preserve the schedule without that additional gap.
- Both Haiku menu briefs (014, 017) call the menu unavailable in official schedule/community sources, repeating the broader source-absence claim the original writer experiment exposed.
- The generic application request can be answered with the approved directory. Sonnet 011 and 015 instead demand an exact downloadable file as a missing requirement. Haiku 018 treats the directory as sufficient. Specific project-form questions still need exact applicability or an honest gap.
- Recycling brief 020 retains the 4 a.m. setout and approved-storage qualifications, but changes a separate holiday sentence rather than copying a continuous passage. That quote remains rejected.

Decision: **do not make this preparation step the default, do not select a preparation model, and do not claim improved resident answers.** It adds substantial latency and still misses or invents obligations. Keep the optional implementation for controlled comparison only. The next evaluation should test the existing final-answer acceptance check against the captured writer failures and supported answers, using source-checked diagnostic labels. Establish whether that existing step detects and repairs the defects before adding more model stages. Human communication calibration and a separate unseen release benchmark remain necessary; these cases are development data.

Reproduce: `node scripts/quality-eval/summarize-evidence-brief.js artifacts/quality-eval/evidence-brief-compatible-20260915`. This preserves the original comparison and writes a separately labeled offline revalidation with a validator hash. Evidence: both `evidence-brief-20260915` and `evidence-brief-compatible-20260915` capture directories, their manifests/call ledgers, `comparison.json`, `offline-revalidation.json`, and `focused-tests.log`. No deployment or live verification. Exact documentation update: `docs/pending-notion/2026-09-15-evidence-brief.md`.
