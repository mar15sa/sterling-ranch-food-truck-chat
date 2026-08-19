# Configuration and handoff reference

This file describes the settings a future owner needs to run the site. Keep real secrets in Railway or the relevant service, never in this repository. `.env.example` contains safe placeholders.

## Minimum production setup

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- Railway supplies `PORT` automatically.
- `RULES_REFRESH_TOKEN` protects the manual rule-source refresh endpoint.
- Set `RULES_LLM_MODE=selective` for AI help only on supported questions that need synthesis. Use `off` to disable AI or `all` for the older rewrite-every-supported-answer behavior. Every mode falls back to the grounded source-built answer when AI is unavailable or rejected.

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

## Operational evidence

`/api/health` reports deployment readiness, source freshness, openings-monitor errors, recent request latency/error counts, and optional LLM request/token totals. It intentionally contains no credentials. The daily live monitor checks the health response plus representative answer journeys.

## Ownership checklist

Keep a private record of the owner and renewal/billing location for Railway, GitHub, the domain/Cloudflare, Google Analytics, Gmail, Notion, Resend, and Anthropic. Also keep the most recent monthly cost snapshot and domain renewal date. Those records should not contain passwords or API keys.
