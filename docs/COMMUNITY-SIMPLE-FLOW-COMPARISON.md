# Simpler answer flow: September 14 diagnostic

No candidate is selected for release. Removing the serial AI checker substantially reduced answering costs, and the complete approved community catalog improved application-directory selection. The answers still contain confirmed relevance and source-interpretation failures. All candidate outputs remain explicitly unreviewed.

## Full answering comparison

Eight authored diagnostic questions, twice per arm, interleaved randomly. Exact code revision d88c7bb and verified community/rules snapshots are saved in `artifacts/quality-eval/simple-catalog-flow-20260914`. All 48 trials completed. Both candidates use Haiku interpretation, complete approved community projections, keyword rules retrieval with expanded-section deduplication, and one writing attempt. There is no inline AI acceptance or repair call in these arms. Production-ineligible staging form navigation was disabled.

| Flow | Calls / 16 questions | Answers present | Median / sample p95 | Answering AI / question | Answering AI / 1,000 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Repaired current local runtime | 8 | 16 | 1.402s / 15.019s | Unknown total | Unknown total |
| Haiku writer | 30 | 16 unreviewed | 9.249s / 17.114s | $0.011319 | $11.32 |
| Sonnet writer | 30 | 16 unreviewed | 9.574s / 11.797s | $0.026421 | $26.42 |

The current arm has $0.015887 known cost plus two timed-out rewrite attempts with unknown charges. Its known subtotal scales to $0.993/1,000, but that is not the total price. The earlier completed v7 local baseline cost $1.009/1,000 with no unknown usage; it predates the newest runtime repairs and is a separate measurement. Neither is the production invoice.

Answer presence does not measure usefulness: the control still gives a lighting-rule response to a pergola/form question and unrelated actions to a lighting-process question. The repaired control correctly preserves clarification for the unspecified-cost cases. Candidate improvements and failures below are analyst inspection, not independent human ratings or a frozen holdout.

## Token and stage accounting

| Arm / stage | Calls | Input tokens with known usage | Output tokens with known usage | Known cost |
| --- | ---: | ---: | ---: | ---: |
| Current / understanding | 3 | 6,283 | 774 | $0.010153 |
| Current / composition | 1 | 896 | 177 | $0.001781 |
| Current / rule search planning | 1 | 259 | 106 | $0.000789 |
| Current / rule rewrite | 3 (2 unknown) | 2,719 | 89 | $0.003164 |
| Haiku / understanding | 16 | 24,316 | 3,847 | $0.043551 |
| Haiku / composition | 14 | 120,463 | 3,417 | $0.137548 |
| Sonnet / understanding | 16 | 24,316 | 3,839 | $0.043511 |
| Sonnet / composition | 14 | 162,156 | 5,491 | $0.379222 |

Two clarification trials per candidate need no composition call. Captured cache-read and cache-write usage is zero. Candidate thinking is disabled; no separate reasoning charge is invented. Known usage is priced at the dated rates in `scripts/quality-eval/usage.js`. Different writers can have different billed token counts; use recorded usage rather than assuming equal tokenization. Failed attempts stay in the denominator and accounting.

## Traffic scenarios: answering AI only

| Questions / month | Haiku writer | Sonnet writer |
| ---: | ---: | ---: |
| 1,000 | $11.32 | $26.42 |
| 10,000 | $113.19 | $264.21 |
| 50,000 | $565.93 | $1,321.04 |

These assume the same small question mix and exclude independent later grading, existing hosting/storage, live connector traffic, indexing and any production CPU/RAM increase. Excluded costs are unmeasured, not zero. No subscription, provider setting or deployment changed. This is not the complete proposed operating commitment; that remains required before selecting a final implementation.

Compared with the earlier three-stage trials ($39.16/1,000 Haiku writer and $57.00 Sonnet writer), these answering totals are lower. Multiple things changed, including evidence packaging and the current runtime revision, so this is not an isolated estimate of checker removal alone.

## Findings that determine the next test

- Both candidates use the approved Design Review directory in the application examples. The local control instead often sends the resident to the submission/contact page. However, several candidate drafts imply a particular project form is confirmed by the directory when the exact form has not been verified.
- Sonnet flow-014 applies the accessory-building height guidance to a pergola. The same verified rulebook contains the specific pergola standards in Sec. 21-22(b)(44), with different limits; that section is absent from this keyword-selected packet. The earlier semantic packet comparison recovered it.
- Haiku shed drafts flow-026/029 turn qualified height guidance into a strict maximum without the source's case-by-case exception. Extra specificity can reduce accuracy when qualifications are lost.
- Some responses add long lists of requirements or imply optional examples are mandatory. Better retrieval still needs clear applicability and readable, appropriately concise answers.
- Neither candidate's sample p95 meets ten seconds. With sixteen observations per arm, the reported p95 is the sample maximum and is not a stable production estimate.

## Spending and status

This completed capture made 68 provider attempts: $0.619719 known cost plus two unknown charges, with a conservative reservation of $1.808321. The announced phase ceiling is $3. A separate, balanced composition-only replay compares keyword versus local semantic rules retrieval under the remaining reservation. It holds saved interpretations and writing instructions fixed, excludes interpretation/retrieval latency and cost, and cannot stand in for the full answering comparison.

Earlier phases remain in their original reports and are not reset or hidden by this phase. No current candidate is approved for release. Independent human calibration, the frozen unseen benchmark, live adapter integration, complete operating costs, owner decisions where needed, and verified-live readiness remain outstanding. Notion synchronization is pending; the precise update is saved locally.

## Completed retrieval-isolation replay

Two known questions (pergola approval/form, and hot tub plus pergola), one saved interpretation each, two writers, two repetitions, keyword versus local semantic-plus-keyword rule retrieval. The complete approved community catalog and writing instructions stay the same. All sixteen calls completed with known usage at revision 49af2ed; saved evidence and requests are in `artifacts/quality-eval/semantic-composition-replay-20260914`.

All eight hybrid drafts include the specific pergola limits. Keyword packets lack that subsection; keyword drafts either stay generic, apply nearby accessory guidance, or disclose that the specific details were not found. This supports testing semantic retrieval as a cause-level improvement. It does not establish an overall usefulness rate: the test targets previously known failures, exact form guidance remains unresolved, and some drafts add unsupported applicability or unnecessary requirements.

| Writing stage only | Calls | Input / output tokens | Cost / 1,000 compositions | Median / max writing time |
| --- | ---: | ---: | ---: | ---: |
| Haiku + keyword | 4 | 38,662 / 1,188 | $11.15 | 4.766s / 5.831s |
| Haiku + hybrid | 4 | 50,178 / 1,139 | $13.97 | 5.194s / 5.694s |
| Sonnet + keyword | 4 | 51,876 / 1,668 | $30.11 | 6.022s / 6.392s |
| Sonnet + hybrid | 4 | 67,204 / 1,849 | $38.22 | 6.100s / 6.403s |

These are composition-only measurements with precomputed evidence. They omit request understanding, retrieval, hosting, and independent grading. They cannot be used as full-answer prices or added to unrelated sample medians. The semantic model and vectors are local; no paid embedding service or vector database subscription was used.

One Sonnet hybrid response (replay-13) embeds tool-format markup inside its answer string despite valid outer JSON. The original validator missed it. A subsequent source-independent output check rejects that markup; retrospective validation rejects 1/16 drafts and leaves the original capture unchanged. This is another reason not to select a release from successful API calls.

Replay cost: $0.373805, no unknown usage, reserved $0.935140. Combined phase: 84 provider attempts, $0.993524 known plus the two earlier timed-out control charges; conservative reservation $2.743461 against the announced $3 ceiling. Both runs are terminal and no paid request is still running. Further full-answer semantic testing and independent calibration remain required.
