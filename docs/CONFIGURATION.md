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
- `COMMUNITY_INTERPRETATION_MODE` controls the shared question interpreter. `legacy` keeps the current production path, `shadow` records a structured interpretation without changing the answer, and `structured` makes the validated interpretation drive every substantive question. Staging defaults to `structured` when the setting is omitted; production defaults to `legacy` for a safe rollout and instant rollback. In every mode, facts still come only from connected official sources.
- `COMMUNITY_REFRESH_INTERVAL_MS` controls background checks (six hours by default); `COMMUNITY_AUTO_REFRESH=false` disables them. Background checks refresh unchanged evidence but quarantine changed, new, or removed material until it is reviewed and released through staging.
- `COMMUNITY_LLM_INPUT_COST_PER_MILLION` and `COMMUNITY_LLM_OUTPUT_COST_PER_MILLION` optionally override the approximate token-cost rates reported in answer traces. Their defaults are estimates, not billing records.
- `COMMUNITY_TRACE_SALT` is the private HMAC salt used to create non-reversible question and subject fingerprints for routing consistency monitoring. Set the same stable secret on each instance in an environment; never commit its real value.
- Follow-up context is not configured server-side: the browser keeps at most three exchanges in session storage and sends them with the next question. Separate private logging saves individual sanitized question/answer records to configured Notion/webhook destinations. See [question records and access](QUESTION-RECORDS.md); the owner retains saved records indefinitely, without routine deletion or cleanup.

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

Set `COMMUNITY_QUESTION_LOG_MODE=staging` in the Railway staging service and `COMMUNITY_QUESTION_LOG_MODE=production` in the production service. This is a server-side boundary: every staging Community Assistant question is marked as a test before it reaches Notion or a logging webhook, even if someone forgets `?test=1`. The normal owner log already hides test-marked questions. Railway's built-in `RAILWAY_ENVIRONMENT_NAME=staging` is a fallback; `COMMUNITY_STAGING_HOSTS` is a narrower emergency fallback and only works when it matches Railway's own `RAILWAY_PUBLIC_DOMAIN`. Do not rely on a browser-provided host or an `isTest` flag to protect production logging.

Railway staging defaults to `COMMUNITY_ANSWER_FLOW=need-first-candidate` when the variable is unset. Production and local environments default to `legacy`. An explicit valid `COMMUNITY_ANSWER_FLOW` value overrides that environment default. `/api/health` reports the selected flow so an exact-revision smoke check can prove which answer path is running before promotion.

Staging may use the same Anthropic credential as production, but its request and token usage should be included in the same owner cost review. Secrets stay in Railway and are never copied into repository files. Set `COMMUNITY_INTERPRETATION_MODE=structured` when running the structured-interpreter rollout's required 24-hour acceptance trial. See [release/testing scope](RELEASE-POLICY.md); this is not a blanket duration for every maintenance change.

The real-model routing evaluation endpoint is enabled automatically only when Railway identifies the environment as `staging`. `COMMUNITY_ROUTING_EVAL_ENABLED=true` can enable it in another controlled test environment. Leave it disabled in production.

## Operational evidence

`/api/health` reports deployment readiness, the active source fingerprint and promotion status, source freshness, answer-trace summaries, AI routing goals and fallback reasons, anonymized routing-drift counts, openings-monitor errors, recent request latency/error counts, and optional LLM request/token totals. It intentionally contains no credentials or resident conversation text. The daily live monitor checks the health response plus representative answer journeys and fails when repeated identical questions drift to different routing outcomes.

`npm run check` runs the complete deterministic release gate, including historical, authored, unseen, source-safety, and comparative evaluations. Since PRs #118/#119, ordinary pull-request CI runs fast checks and then this full gate with model rewriting disabled. Push CI verifies the exact deployment through `npm run check:deployment` rather than repeating the full suite. See [RELEASE-POLICY.md](RELEASE-POLICY.md).

`npm run community:routing:live` is a separate full real-model benchmark: it repeats labeled cases, bypasses the planning cache, and requires one deployment revision. Its thresholds are 98% goal/subject, intent, structured-detail, and repeat consistency, plus 100% prompt-injection rejection. The actual **AI routing checks** workflow defaults to the `smoke` profile and supports explicit full checks and compatible evidence reuse under [COMMUNITY-EVIDENCE-REUSE.md](COMMUNITY-EVIDENCE-REUSE.md). `npm run community:portability:live` checks the configured second CivicPlus community; `npm run eval:rules:unseen` is the smaller rules-only holdout.

The source-publishing workflow still exists and runs only when its `COMMUNITY_AUTO_PROMOTE` condition is true. The earlier statement that Release 2 had replaced it with monitoring-only did not match the inspected workflow. On September 13 the accessible repository variable was absent and the latest inspected run was skipped; automatic source publishing is not verified active. Preserve the existing source approvals and publishing authorization. See [RELEASE-POLICY.md](RELEASE-POLICY.md) before interpreting the one-hour source soak, accelerated checks, or structured-interpreter trial. Optional `STAGING_BASE_URL` and `PRODUCTION_BASE_URL` variables override the workflow defaults.

## Ownership checklist

Keep a private record of the owner and renewal/billing location for Railway, GitHub, the domain/Cloudflare, Google Analytics, Gmail, Notion, Resend, and Anthropic. Also keep the most recent monthly cost snapshot and domain renewal date. Those records should not contain passwords or API keys.
