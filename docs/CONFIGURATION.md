# Configuration and handoff reference

This file describes the settings a future owner needs to run the site. Keep real secrets in Railway or the relevant service, never in this repository. `.env.example` contains safe placeholders.

## Minimum production setup

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- Railway supplies `PORT` automatically.
- `RULES_REFRESH_TOKEN` protects the manual rule-source refresh endpoint.
- Set `RULES_SEARCH_MODE=ai-hybrid` to let Anthropic interpret unfamiliar wording and expand source retrieval. Use `legacy` for deterministic retrieval only. AI search can change the search query, but official indexed sources still control the facts and final grounding checks.
- Set `RULES_LLM_MODE=selective` for AI help only on supported questions that need synthesis. Use `off` to disable AI or `all` for the older rewrite-every-supported-answer behavior. Every mode falls back to the grounded source-built answer when AI is unavailable or rejected.
- `ANTHROPIC_API_KEY` is shared by the rules and broader community paths. `COMMUNITY_LLM_MODEL`, `COMMUNITY_LLM_TIMEOUT_MS`, and `COMMUNITY_LLM_MAX_TOKENS` optionally tune the broader path.
- `COMMUNITY_REFRESH_INTERVAL_MS` controls background checks (six hours by default); `COMMUNITY_AUTO_REFRESH=false` disables them. Background checks refresh unchanged evidence but quarantine changed, new, or removed material until it is reviewed and released through staging.
- `COMMUNITY_LLM_INPUT_COST_PER_MILLION` and `COMMUNITY_LLM_OUTPUT_COST_PER_MILLION` optionally override the approximate token-cost rates reported in answer traces. Their defaults are estimates, not billing records.
- Follow-up context is not configured server-side: the browser keeps at most three exchanges in session storage and sends them with the next question. The server does not persist the full thread.

The application can start without email, Notion, Anthropic, or openings-tip credentials. Those integrations degrade independently instead of preventing the resident site from loading.

## External services

| Service | Required for | Failure behavior |
| --- | --- | --- |
| Railway | Public application hosting | Site is unavailable; redeploy the last healthy release. |
| GitHub | Source control and daily monitors | Live site keeps running; scheduled checks pause. |
| Sterling Ranch CAB and Municode | Current source refreshes | Last verified data remains visible with stale warnings or safe refusals. |
| Anthropic | Selective plain-English synthesis for supported questions | Deterministic grounded answer is returned. |
| Resend/webhooks | Alerts and resident opening tips | Core resident tools continue working. |
| Notion/webhook question log | Existing question analytics | Answers continue working if logging fails. |
| Google Analytics | Product usage analytics | Resident tools continue working. |

## Staging differences

Staging must use the `staging` branch, show the purple test-site banner, avoid live Google Analytics, and use disabled or test-only alert destinations. It may share the official public source URLs because accurate source behavior is part of staging verification.

Staging may use the same Anthropic credential as production, but its request and token usage should be included in the same owner cost review. Secrets stay in Railway and are never copied into repository files.

## Operational evidence

`/api/health` reports deployment readiness, the active source fingerprint and promotion status, source freshness, answer-trace summaries, openings-monitor errors, recent request latency/error counts, and optional LLM request/token totals. It intentionally contains no credentials or resident conversation text. The daily live monitor checks the health response plus representative answer journeys.

`npm run check` runs the complete release gate, including historical, authored, unseen, source-safety, and 228-question comparative evaluations. `npm run community:portability:live` performs a live end-to-end proof against the configured second CivicPlus community. `npm run eval:rules:unseen` remains the smaller rules-only holdout scorecard.

The `Sterling Ranch source release` GitHub workflow is deliberately dormant until the first unified production release is complete. Set the repository variable `COMMUNITY_AUTO_PROMOTE=true` only after that release. Optional `STAGING_BASE_URL` and `PRODUCTION_BASE_URL` variables override the documented defaults. The workflow never promotes application code—only the tested source index and its audit reports.

## Ownership checklist

Keep a private record of the owner and renewal/billing location for Railway, GitHub, the domain/Cloudflare, Google Analytics, Gmail, Notion, Resend, and Anthropic. Also keep the most recent monthly cost snapshot and domain renewal date. Those records should not contain passwords or API keys.
