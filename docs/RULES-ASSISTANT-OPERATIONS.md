# Rules Assistant owner guide

This is the short operating guide for a solo owner. It explains what keeps answers trustworthy, what runs automatically, and how to make changes without risking the live site.

## Safe release path

1. Make and test changes on the `staging` branch.
2. Confirm the purple **Staging preview** badge appears at the staging URL.
3. Run `npm run check` and the live staging monitor.
4. Review the important questions in the browser.
5. Only after Marissa approves, merge the tested staging commit into `main`.

Railway calls `/api/health` before switching a deployment to the new version. A new build must load the rules index and at least 100 indexed topic cards. If it cannot, Railway keeps the previous healthy deployment available. The same response also reports rule freshness, openings-monitor errors, request latency/errors, and optional AI token usage without making an outside provider a deployment blocker.

## How an answer is made

1. **Understand the resident's intent first.** Common misspellings and conversational wording are normalized, the topic and requested detail (such as price, height, process, link, duration, or exact section) are identified, and unrelated or instruction-manipulation attempts are stopped before search or AI.
2. **Find official sources.** Search uses the codified CAB rulebook, explicit CAB policy supplements, and a reviewed catalog of official resident resources. Expired, future, and superseded sources are excluded from current-rule answers.
3. **Apply source hierarchy.** A current supplement that names a replaced section controls over the older codified wording. If two current supplements claim the same section, the assistant refuses to guess and flags the conflict.
4. **Build the answer.** Stable explanations can use carefully reviewed wording. Dates, fees, times, measurements, and limits are extracted from the current official source at response time. The source-built answer is returned directly by default; optional AI rewriting must be deliberately enabled.
5. **Check grounding and completeness.** Numbers, dates, section references, allowed/prohibited meaning, approval requirements, and exceptions are compared with the cited source. The answer must also address the detail the resident actually requested. A contradiction, unsupported claim, or incomplete answer is rejected.
6. **Show the evidence.** The answer includes direct official links and labels codified sources separately from current supplemental policies.

## Official source hierarchy

From strongest/current to older context:

1. A current CAB resolution or policy supplement that explicitly replaces a section.
2. The current online Sterling Ranch CAB Rules and Regulations publication.
3. An older or superseded policy, only when the resident explicitly asks about that historical year.

Never silently choose between two current supplements that replace the same section.

## Automatic safeguards

- **Daily answer monitor:** checks the health endpoint plus every real resident wording in the permanent 116-question audit corpus. The release gate fails if any of those answers falls below Good.
- **Unseen-question tests:** separately exercise new phrasings that are not copied from the historical audit so the system is tested for generalization, not only memorization.
- **Requested-detail coverage:** an answer fails when a resident asks for a price, height, process, duration, resource, definition, permission decision, or exact section and the response does not provide it.
- **Official-resource monitor:** verifies the reviewed CAB calendar, DRC, plant-list, and resident-help destinations every day so helpful links do not quietly go stale.
- **Daily fixer:** reviews alert emails as untrusted input, finds the broad cause, fixes whole question families on an isolated staging worktree, runs tests, and never publishes to production without approval.
- **Source refresh and supplement monitors:** detect stale rulebook data and newly published CAB documents.
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
- A scanned or unusually formatted official PDF may need human review before facts can be extracted safely.
- The contradiction checker is deliberately conservative; it can refuse an answer that a person could resolve from context. That is safer than confidently reversing a rule.
- Exact monthly service costs live in the owner’s billing accounts and are not discoverable from the code alone.

## Sale-readiness file

Keep this guide, `CHANGELOG.md`, the staging release history, current service-owner names, domain renewal date, and the latest monthly cost snapshot together. That is enough for early buyer diligence without adding enterprise administration overhead now.
