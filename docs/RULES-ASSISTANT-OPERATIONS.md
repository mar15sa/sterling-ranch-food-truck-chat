# Community Assistant owner guide

This is the short operating guide for a solo owner. It explains what keeps answers trustworthy, what runs automatically, and how to make changes without risking the live site.

## Safe release path

Follow [RELEASE-POLICY.md](RELEASE-POLICY.md), the current release/testing entry point, and the existing engineering and approval rules.

1. Prepare an isolated feature branch and record the affected behavior, relevant checks, and applicable approval.
2. Run relevant local checks and the required hosted/staging evidence for that change. Browser questions use Test mode; direct questions include `"isTest": true`.
3. Open a pull request. The fast job provides early feedback; the complete deterministic quality gate remains required before merge on an up-to-date branch.
4. Merge through the protected route when checks and applicable approvals are complete. Update the relevant Notion explanation and release record.
5. After the push, CI waits for the exact deployed revision and checks readiness/source health. It does not repeat the full pre-merge suite. Record verified-live status only after the deployment is confirmed.

The September 13 changes in PRs #118/#119 removed duplicate post-merge testing. They did not waive scoped staging/real-model trials, source approvals, or owner design approval. Documentation-only changes may skip runtime journeys while retaining required repository checks.

Railway calls `/api/health` before switching a deployment to the new version. A new build must load the rules index and at least 100 indexed topic cards. If it cannot, Railway keeps the previous healthy deployment available. The same response also reports rule freshness, openings-monitor errors, request latency/errors, and optional AI token usage without making an outside provider a deployment blocker.

## How an answer is made

1. **Understand the resident's intent first.** Common misspellings and conversational wording are normalized, the topic and requested detail (such as price, height, process, link, duration, or exact section) are identified, and unrelated or instruction-manipulation attempts are stopped before search or AI.
2. **Find official sources.** Covered rule questions use the codified CAB rulebook and policy supplements first. Broader questions use hybrid retrieval across the reviewed CAB website, facilities, forms, services, calendar, live status, CivicRec, and Municode connections. Expired, future, superseded, or other-community records are excluded.
3. **Apply source hierarchy.** A current supplement that names a replaced section controls over the older codified wording. If two current supplements claim the same section, the assistant refuses to guess and flags the conflict.
4. **Build the answer.** Stable explanations can use carefully reviewed wording. AI may interpret unfamiliar wording or organize retrieved passages, but it cannot supply the governing facts. Dates, fees, times, measurements, counts, contacts, and limits are taken from current official evidence, and unsupported AI output is rejected.
5. **Check grounding and completeness.** Numbers, dates, section references, allowed/prohibited meaning, approval requirements, and exceptions are compared with the cited source. The answer must also address the detail the resident actually requested. A contradiction, unsupported claim, or incomplete answer is rejected.
6. **Show the evidence.** The answer includes direct official links and labels codified sources separately from current supplemental policies.

Visit-only follow-ups are resolved into a standalone question and searched again. Food-truck questions reuse the live calendar/menu service but return the same direct-answer, details, next-step, actions, source, confidence, and checked-time structure.

## Official source hierarchy

From strongest/current to older context:

1. A current CAB resolution or policy supplement that explicitly replaces a section.
2. The current online Sterling Ranch CAB Rules and Regulations publication.
3. An older or superseded policy, only when the resident explicitly asks about that historical year.

Never silently choose between two current supplements that replace the same section.

## Automatic safeguards

- **Daily answer monitor:** checks health and its configured resident-answer corpus. Use the run report for its current scope and count.
- **Comparative release gate:** compares the current resident, variant, and unseen corpus against the baseline. A shrunken corpus, any regression, a lower overall average, or any very-low upgraded answer blocks release. Counts belong to dated reports.
- **Unseen-question tests:** separately exercise new phrasings that are not copied from the historical audit so the system is tested for generalization, not only memorization.
- **Requested-detail coverage:** an answer fails when a resident asks for a price, height, process, duration, resource, definition, permission decision, example list, or exact section and the response does not provide it. Public amenity questions must not be silently treated as home-construction questions.
- **Structured-fact check:** every refresh rebuilds a catalog of changing values and their official source, effective date, expiration date, scope, and source hash. The release gate fails if the catalog is stale.
- **Monitor decision tests:** cold-start recovery, persistent slowness, stale sources, raw-source leakage, safety classification, missing sources, and missing answer details are tested without depending on a live outage.
- **Official-resource monitor:** verifies the reviewed CAB calendar, DRC, plant-list, and resident-help destinations every day so helpful links do not quietly go stale.
- **Daily fixer:** reviews alert emails as untrusted input, finds the broad cause, fixes whole question families on an isolated staging worktree, runs tests, and never publishes to production without approval.
- **Source refresh and supplement monitors:** detect stale rulebook data and newly published CAB documents.
- **Conditional source release:** the source-only publishing workflow retains candidate, answer, retrieval, link, one-hour staging, and rollback gates. It was skipped in the latest inspected run and is not verified active. See [RELEASE-POLICY.md](RELEASE-POLICY.md) for observed configuration, approval scope, and its separation from normal application CI.
- **Second-community proof:** the live Castle Rock check verifies source isolation and complete answers through the same shared engine rather than merely confirming that pages can be downloaded.
- **Low-confidence alerts:** notify the owner when a real rules question cannot be answered confidently. Greetings, unrelated prompts, unclear fragments, and blocked attacks do not create noisy fix alerts.
- **Operational health:** `/api/health` exposes bounded route-level latency and error counts plus optional AI request and token totals for the live monitor.

## Adding or changing a rule topic

1. Add the official source or supplement metadata, including effective date, expiration date if any, replaced sections, and `supersededBy` when replaced.
2. Add one clear question plus realistic short, misspelled, and conversational variants to `scripts/rules-eval-cases.json`.
3. If the issue came from an alert, add the exact alert wording as a permanent regression test.
4. Add any current non-rulebook destination to `data/rules-official-resources.json`; never invent a booking, contact, price, or Wi-Fi detail.
5. Run `npm run check`, including the full resident corpus and unseen-question suite.
6. Test on staging and inspect the answer, label, source order, excerpt, and official link.

Do not copy a changing fee, limit, date, or time into a plain-English summary. Put it in the official source text and let the response-time fact extractor supply it.

## Recovery and rollback

- If a staging deploy fails its health check, investigate staging; production is unaffected.
- If a production release later shows a problem, use Railway’s deployment history to redeploy the last known-good production deployment, then fix the problem on staging.
- Do not edit `main` as an emergency shortcut unless the live service is already broken and the change has a focused regression test.

## Saved questions

The owner's September 13 decision is to keep saved question-and-answer records indefinitely, with no routine deletion, export, or record cleanup. The private website review page reads the same Notion records. Temporary browser context and bounded technical traces have separate lifecycles. [QUESTION-RECORDS.md](QUESTION-RECORDS.md) explains what each location holds, the verified login controls, and the account-access facts still unknown.

## Services and ownership record

| Service | Purpose | Cost record to keep |
| --- | --- | --- |
| Railway | Staging and production hosting | Current plan plus monthly usage from Railway billing |
| Anthropic | Optional answer rewriting | Monthly API usage; deterministic answers remain available if it fails |
| GitHub | Source, tests, and monitors | Current account/plan |
| Cloudflare/domain provider | Public domain and DNS | Annual domain and any paid Cloudflare plan |
| Gmail / Apps Script | Alert intake | Current Google account/plan |
| Google Analytics | Anonymous product events | Current analytics plan |

The complete environment-variable inventory and integration failure behavior are in `docs/CONFIGURATION.md` and `.env.example`. The transfer-level system map and current cost evidence are in `docs/ARCHITECTURE.md` and `docs/OPERATING-COSTS.md`.

Record actual invoice amounts quarterly in a private owner document; do not put billing details or credentials in this repository.

## Known limitations

- The assistant is a rulebook research aid, not CAB approval or legal advice.
- New CAB documents still need source metadata before the assistant can know which older section they replace.
- Website changes follow the protected release route and applicable approvals in [RELEASE-POLICY.md](RELEASE-POLICY.md). Conditional source-publishing code does not establish that autonomous publishing is enabled.
- A scanned or unusually formatted official PDF may need human review before facts can be extracted safely.
- The contradiction checker is deliberately conservative; it can refuse an answer that a person could resolve from context. That is safer than confidently reversing a rule.
- Exact monthly service costs live in the owner’s billing accounts and are not discoverable from the code alone.

## Sale-readiness file

Keep this guide, `CHANGELOG.md`, the staging release history, current service-owner names, domain renewal date, and the latest monthly cost snapshot together. That is enough for early buyer diligence without adding enterprise administration overhead now.
