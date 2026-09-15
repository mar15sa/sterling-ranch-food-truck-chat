# September cost evidence — verified calculations

Generated from preserved provider call ledgers. Historical diagnostic samples; no implementation selected. Standard rates were rechecked against [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) on September 15, 2026. This is not an invoice or a fresh production benchmark.

## Three-stage document flow

Source: artifacts/quality-eval/full-document-flow-v7-20260914. Each cost was recomputed from raw usage and checked against the saved total and stage counts.

| Arm | Attempts / calls | Answers present | AI per 1,000 | Median / sample p95 |
| --- | ---: | ---: | ---: | ---: |
| current-local | 16 attempted questions / 6 calls | 16 | $1.01 | 0.63s / 4.92s |
| haiku-compose | 16 attempted questions / 50 calls | 14 | $39.16 | 13.51s / 22.91s |
| sonnet-compose | 16 attempted questions / 50 calls | 14 | $57.00 | 14.09s / 34.70s |

| Arm | 1,000 questions/month | 10,000 | 50,000 |
| --- | ---: | ---: | ---: |
| current-local | $1.01 | $10.09 | $50.44 |
| haiku-compose | $39.16 | $391.60 | $1957.98 |
| sonnet-compose | $57.00 | $569.95 | $2849.76 |

| Arm / stage | Calls | Known input tokens | Known output tokens | Known subtotal | Unknown charges |
| --- | ---: | ---: | ---: | ---: | ---: |
| current-local / composition | 1 | 896 | 172 | $0.001756 | 0 |
| current-local / understanding | 3 | 6283 | 774 | $0.010153 | 0 |
| current-local / rules-search-planning | 1 | 259 | 106 | $0.000789 | 0 |
| current-local / rules-rewrite | 1 | 2719 | 145 | $0.003444 | 0 |
| haiku-compose / understanding | 16 | 24316 | 3856 | $0.043596 | 0 |
| haiku-compose / composition | 16 | 129312 | 3995 | $0.149287 | 0 |
| haiku-compose / answer-acceptance | 18 | 197866 | 3794 | $0.433672 | 0 |
| sonnet-compose / understanding | 16 | 24316 | 3855 | $0.043591 | 0 |
| sonnet-compose / composition | 16 | 178894 | 7093 | $0.428718 | 0 |
| sonnet-compose / answer-acceptance | 18 | 199652 | 4031 | $0.439614 | 0 |

Cache usage and requested thinking modes are recorded in the companion JSON. Missing reasoning-token details remain unknown, with no extra charge invented beyond billed output tokens. Monthly scenarios assume this exact diagnostic question mix and exclude hosting, indexing, separate grading and any new repair policy.

## Two-stage keyword document flow

Source: artifacts/quality-eval/simple-catalog-flow-20260914. Each cost was recomputed from raw usage and checked against the saved total and stage counts.

| Arm | Attempts / calls | Answers present | AI per 1,000 | Median / sample p95 |
| --- | ---: | ---: | ---: | ---: |
| current-local | 16 attempted questions / 8 calls | 16 | Unknown | 1.40s / 15.02s |
| haiku-compose | 16 attempted questions / 30 calls | 16 | $11.32 | 9.25s / 17.11s |
| sonnet-compose | 16 attempted questions / 30 calls | 16 | $26.42 | 9.57s / 11.80s |

| Arm | 1,000 questions/month | 10,000 | 50,000 |
| --- | ---: | ---: | ---: |
| current-local | Unknown | Unknown | Unknown |
| haiku-compose | $11.32 | $113.19 | $565.93 |
| sonnet-compose | $26.42 | $264.21 | $1321.04 |

| Arm / stage | Calls | Known input tokens | Known output tokens | Known subtotal | Unknown charges |
| --- | ---: | ---: | ---: | ---: | ---: |
| current-local / understanding | 3 | 6283 | 774 | $0.010153 | 0 |
| current-local / composition | 1 | 896 | 177 | $0.001781 | 0 |
| current-local / rules-search-planning | 1 | 259 | 106 | $0.000789 | 0 |
| current-local / rules-rewrite | 3 | 2719 | 89 | $0.003164 | 2 |
| haiku-compose / understanding | 16 | 24316 | 3847 | $0.043551 | 0 |
| haiku-compose / composition | 14 | 120463 | 3417 | $0.137548 | 0 |
| sonnet-compose / understanding | 16 | 24316 | 3839 | $0.043511 | 0 |
| sonnet-compose / composition | 14 | 162156 | 5491 | $0.379222 | 0 |

Cache usage and requested thinking modes are recorded in the companion JSON. Missing reasoning-token details remain unknown, with no extra charge invented beyond billed output tokens. Monthly scenarios assume this exact diagnostic question mix and exclude hosting, indexing, separate grading and any new repair policy.

## Two-stage semantic document flow

Source: artifacts/quality-eval/semantic-full-flow-20260914. Each cost was recomputed from raw usage and checked against the saved total and stage counts.

| Arm | Attempts / calls | Answers present | AI per 1,000 | Median / sample p95 |
| --- | ---: | ---: | ---: | ---: |
| current-local | 16 attempted questions / 6 calls | 16 | $1.01 | 1.57s / 5.90s |
| haiku-compose | 16 attempted questions / 30 calls | 16 | $11.92 | 7.71s / 14.40s |
| sonnet-compose | 16 attempted questions / 30 calls | 16 | $28.17 | 9.76s / 14.05s |

| Arm | 1,000 questions/month | 10,000 | 50,000 |
| --- | ---: | ---: | ---: |
| current-local | $1.01 | $10.06 | $50.29 |
| haiku-compose | $11.92 | $119.25 | $596.23 |
| sonnet-compose | $28.17 | $281.65 | $1408.27 |

| Arm / stage | Calls | Known input tokens | Known output tokens | Known subtotal | Unknown charges |
| --- | ---: | ---: | ---: | ---: | ---: |
| current-local / understanding | 3 | 6283 | 774 | $0.010153 | 0 |
| current-local / composition | 1 | 896 | 170 | $0.001746 | 0 |
| current-local / rules-search-planning | 1 | 259 | 106 | $0.000789 | 0 |
| current-local / rules-rewrite | 1 | 2719 | 137 | $0.003404 | 0 |
| haiku-compose / understanding | 16 | 24316 | 3839 | $0.043511 | 0 |
| haiku-compose / composition | 14 | 130374 | 3382 | $0.147284 | 0 |
| sonnet-compose / understanding | 16 | 24316 | 3842 | $0.043526 | 0 |
| sonnet-compose / composition | 14 | 175276 | 5657 | $0.407122 | 0 |

Cache usage and requested thinking modes are recorded in the companion JSON. Missing reasoning-token details remain unknown, with no extra charge invented beyond billed output tokens. Monthly scenarios assume this exact diagnostic question mix and exclude hosting, indexing, separate grading and any new repair policy.

## Mixed live and document flow

Source: artifacts/quality-eval/mixed-live-flow-20260914. Each cost was recomputed from raw usage and checked against the saved total and stage counts.

| Arm | Attempts / calls | Answers present | AI per 1,000 | Median / sample p95 |
| --- | ---: | ---: | ---: | ---: |
| current-local | 12 attempted questions / 6 calls | 12 | $1.56 | 3.27s / 7.66s |
| sonnet-compose | 12 attempted questions / 22 calls | 10 | $27.53 | 12.66s / 18.34s |
| opus-compose | 12 attempted questions / 22 calls | 10 | $61.73 | 13.26s / 17.86s |

| Arm | 1,000 questions/month | 10,000 | 50,000 |
| --- | ---: | ---: | ---: |
| current-local | $1.56 | $15.60 | $78.01 |
| sonnet-compose | $27.53 | $275.28 | $1376.38 |
| opus-compose | $61.73 | $617.25 | $3086.26 |

| Arm / stage | Calls | Known input tokens | Known output tokens | Known subtotal | Unknown charges |
| --- | ---: | ---: | ---: | ---: | ---: |
| current-local / understanding | 5 | 10507 | 1422 | $0.017617 | 0 |
| current-local / rules-search-planning | 1 | 255 | 170 | $0.001105 | 0 |
| sonnet-compose / understanding | 12 | 30278 | 4186 | $0.051208 | 0 |
| sonnet-compose / composition | 10 | 118782 | 4156 | $0.279124 | 0 |
| opus-compose / understanding | 12 | 30278 | 4186 | $0.051208 | 0 |
| opus-compose / composition | 10 | 118159 | 3948 | $0.689495 | 0 |

Cache usage and requested thinking modes are recorded in the companion JSON. Missing reasoning-token details remain unknown, with no extra charge invented beyond billed output tokens. Monthly scenarios assume this exact diagnostic question mix and exclude hosting, indexing, separate grading and any new repair policy.

## Writer-only presentation comparison

Source: artifacts/quality-eval/writer-presentation-comparison-20260915. Each cost was recomputed from raw usage and checked against the saved total and stage counts.

| Arm | Attempts / calls | Answers present | AI per 1,000 | Median / sample p95 |
| --- | ---: | ---: | ---: | ---: |
| claude-haiku-4-5:control | 16 stage calls / 16 calls | Not applicable | $10.65 | 4.24s / 23.87s |
| claude-haiku-4-5:stable | 16 stage calls / 16 calls | Not applicable | $10.21 | 3.78s / 5.70s |
| claude-haiku-4-5:combined | 16 stage calls / 16 calls | Not applicable | $10.53 | 3.75s / 5.80s |
| claude-sonnet-5:control | 16 stage calls / 16 calls | Not applicable | $29.21 | 5.72s / 8.00s |
| claude-sonnet-5:stable | 16 stage calls / 16 calls | Not applicable | $28.64 | 5.99s / 10.47s |
| claude-sonnet-5:combined | 16 stage calls / 16 calls | Not applicable | $29.42 | 6.07s / 7.92s |

| Arm / stage | Calls | Known input tokens | Known output tokens | Known subtotal | Unknown charges |
| --- | ---: | ---: | ---: | ---: | ---: |
| claude-haiku-4-5:control / composition | 16 | 150500 | 3985 | $0.170425 | 0 |
| claude-haiku-4-5:stable / composition | 16 | 144336 | 3801 | $0.163341 | 0 |
| claude-haiku-4-5:combined / composition | 16 | 148694 | 3959 | $0.168489 | 0 |
| claude-sonnet-5:control / composition | 16 | 202220 | 6292 | $0.467360 | 0 |
| claude-sonnet-5:stable / composition | 16 | 195560 | 6709 | $0.458210 | 0 |
| claude-sonnet-5:combined / composition | 16 | 201786 | 6708 | $0.470652 | 0 |

Cache usage and requested thinking modes are recorded in the companion JSON. Missing reasoning-token details remain unknown, with no extra charge invented beyond billed output tokens. Monthly scenarios assume this exact diagnostic question mix and exclude hosting, indexing, separate grading and any new repair policy.

## Checker-only captured-answer comparison

Source: artifacts/quality-eval/captured-acceptance-20260915. Each cost was recomputed from raw usage and checked against the saved total and stage counts.

| Arm | Attempts / calls | Answers present | AI per 1,000 | Median / sample p95 |
| --- | ---: | ---: | ---: | ---: |
| claude-haiku-4-5 | 28 stage calls / 28 calls | Not applicable | $9.95 | 3.58s / 13.09s |
| claude-sonnet-5 | 28 stage calls / 28 calls | Not applicable | $27.02 | 7.06s / 20.23s |

| Arm / stage | Calls | Known input tokens | Known output tokens | Known subtotal | Unknown charges |
| --- | ---: | ---: | ---: | ---: | ---: |
| claude-haiku-4-5 / answer-acceptance | 28 | 237122 | 8269 | $0.278467 | 0 |
| claude-sonnet-5 / answer-acceptance | 28 | 327302 | 10197 | $0.756574 | 0 |

Cache usage and requested thinking modes are recorded in the companion JSON. Missing reasoning-token details remain unknown, with no extra charge invented beyond billed output tokens. Monthly scenarios assume this exact diagnostic question mix and exclude hosting, indexing, separate grading and any new repair policy.

## Accounting limits

- Each dataset uses a different known development sample. Do not combine stage-only costs into a measured full-flow total.
- Unknown charges remain unknown; failed attempts stay in denominators. All costs are token-priced estimates, not invoice totals.
- No frozen unseen or human-calibrated winner, current production cost measurement, or current project hosting bill is supplied.
- Output tokens are billed once. Missing explicit reasoning-token detail is not a measured zero.
