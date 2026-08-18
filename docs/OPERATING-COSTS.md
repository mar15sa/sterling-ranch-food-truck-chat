# Operating-cost snapshot

Last reviewed: August 18, 2026. Values are owner-facing planning estimates, not accounting records.

## Current recurring cost

| Service | Current evidence | Product cost at current setup |
| --- | --- | --- |
| Railway hosting | Hobby workspace. This project used **$0.1940** from August 12 through August 18, including production and staging. Recent total workspace invoices were $5.00, $5.00, $6.69, and $6.82, but that workspace also hosts unrelated projects. | Approximately **$1/month of marginal usage** at the observed pace. The shared workspace has a **$5/month minimum**. |
| Anthropic | Optional rewriting is disabled by default in release `1.1.0`; live health reports request and token totals. | **$0 expected** while disabled. Variable usage only if an owner enables it. |
| GitHub | Repository, Actions, source monitoring, and release history. | No product-specific incremental charge identified; verify the owner’s current GitHub plan during transfer. |
| Google Analytics | Existing production usage analytics. | No product-specific incremental charge identified. |
| Gmail, Notion, and Resend/webhooks | Alert intake, question logs, and optional email delivery. | Uses the owner’s existing services; confirm any paid-plan allocation during transfer. |
| Cloudflare and domain | DNS, HTTPS, and the public domain. | Record the actual annual domain renewal from the registrar before a sale; it is not represented in Railway usage. |

## Simple buyer estimate

At today’s traffic and with optional AI rewriting disabled, the application itself adds roughly **$1/month in Railway consumption**, while the shared Railway workspace still bills its $5 minimum. A standalone buyer account should budget approximately **$5–$10/month plus the annual domain renewal** until actual transferred usage establishes a new baseline.

## Quarterly owner check

1. Copy the latest Railway project usage—not the whole mixed workspace bill—into this file.
2. Confirm `/api/health` shows zero unexpected AI requests and no persistent server errors.
3. Record the domain renewal amount and date in the private ownership record.
4. Note any new paid integration or material traffic increase.

Do not place invoices, payment-card details, API keys, or account passwords in the repository.
