# Automatic live planning diagnostic — September 14, 2026

Status: experimental implementation and developer diagnostics only. No model selected, resident activation, subscription or release.

The candidate now uses the existing interpretation call to choose a profile-configured calendar or current pool-status connector. It copies the resident's date/activity/place wording; software validates the connector capability, community, copied text, date range and timezone before retrieval. It retains explicit gaps for unsupported capabilities. This avoids a second routing call. It does not yet integrate the food-truck or waste adapters.

## Controlled formatting result

The first Haiku experiment used eight authored cases, each twice. All 16 returned invalid empty plans with intended arguments serialized inside clarification text. None was accepted or repaired by extracting that text.

The follow-up replay used the exact captured pool-now and yoga requests, each twice, removing only the provider strict option. All four returned structurally valid plans with the appropriate configured connector. All other request fields, including the model, prompt and token limit, stayed unchanged. The experimental default now omits strict; software still validates the complete response and rejects unexpected or serialized clarification text.

| Diagnostic | Calls | Valid plans | Input / output tokens | Token-priced cost | Median / maximum time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original strict option | 16 | 0 | 36,496 / 3,946 | $0.056226 | 3.440 / 23.198 seconds |
| Option removed, two repeated cases | 4 | 4 | 9,120 / 880 | $0.013520 | 2.150 / 2.309 seconds |

These are provider token counts priced at the dated standard Haiku rates ($1 input / $5 output per million tokens), not invoice amounts. See [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), checked September 14. The successful interpretation-only sample scales to $3.38 per 1,000 calls. It excludes retrieval, writing, assessment, retries, hosting and indexing, so it must not be compared as a full-answer price. Four calls do not support a p95 or broad quality estimate; the other six cases have not yet been repeated without strict. This isolates an output-format interaction in these requests, not a general provider defect.

The latest $3 development phase now totals $1.084165 in known token-priced spending with no unknown-usage calls. Conservative reservations total $2.985831, leaving $0.014169 reserved headroom. These totals include the earlier semantic full-flow and paired-writer trials in the same phase; historical phases remain separate. No further material paid comparison fits this reservation. No recurring financial commitment has been made.

Current versus proposed full-answer costs remain in [the semantic full-flow comparison](COMMUNITY-SEMANTIC-FULL-FLOW-COMPARISON.md) and [paired writer results](COMMUNITY-WRITER-REPLAY.md). Their samples and included stages differ from this interpretation-only test. A complete live/document candidate must be measured before recommending a monthly commitment.

## Public-source execution and remaining matching defect

At 22:56:14 UTC, software executed one captured model-selected calendar request and one captured current-status request against the configured public sources without manual connector bindings. Both produced valid operational evidence and no diagnostics. The calendar request returned a matching Yoga w/Laura listing; the status connector returned its mapped current state. This incurred no additional model calls and submitted no resident-log questions. Captured status evidence expires within minutes and is historical test evidence, not a reusable current answer.

A nearby-event control then exposed a shared calendar defect: `yoga class` also matched `Swimming class` through the word `class`. The local repair in revision `b6282a2` requires whole substantive topic/venue terms, with explicit alternatives and preserved audience synonyms. It also rejects substring and venue-only topic collisions. See [repair scope and verification](COMMUNITY-EVENT-FILTER-REPAIR.md). The public-source execution preceded this repair; do not claim it as a post-repair live check.

A separate post-repair public-source check at 23:06:17 UTC, revision `b6282a25e5a5712f7992aebb6f4e55a749d038b0`, executed the same captured model plans after resolving their dates against the current clock. Both sources produced valid packets with no diagnostics; the yoga listing remained present. Capture: `public-execution-after-filter.json` in the non-strict directory. No model calls or resident questions were submitted. This verifies actual source parsing and matching for those two requests, not hosted application deployment or general answer quality.

## Evidence and acceptance status

- Initial automatic-planning implementation: `6cc8610`; strict-only diagnostic runner: `1225c7c`; final non-strict validator and calendar repair: `b6282a2`.
- Final combined full suite: **905/905 passed**, zero failures/skips/cancellations, exit code 0, 545,695.0883 ms, exact revision `b6282a25e5a5712f7992aebb6f4e55a749d038b0`. Terminal log: `artifacts/quality-eval/event-filter-suite-20260914.log`. This supersedes the earlier suite for local implementation validation, without establishing model answer quality or live release.
- Earlier full suite: 899/899 passed against the initial implementation, before the final non-strict/clarification changes and event-filter repair. Final experimental planning/evidence/full-flow focused checks passed 25/25 before the event repair. New event precision checks passed 5/5 after fixing the short venue-name case.
- Captures: `artifacts/quality-eval/live-planning-20260914`, `artifacts/quality-eval/live-planning-nonstrict-20260914`; the latter includes `public-execution.json` and the original `filter-collision.json`.
- These authored development cases are not a frozen unseen benchmark or independent human calibration. No claim of 95% usefulness, 85% excellence, whole-product reliability or demo readiness is supported yet.
- Food trucks, waste, non-strict adjacent-intent coverage, mixed live/document answer composition, full costs and latency, human rating calibration, independent acceptance and release remain outstanding.

Notion synchronization is pending under the earlier automatic approval rejection. Exact pending update: `docs/pending-notion/2026-09-14-live-planning-and-event-filters.md`.
