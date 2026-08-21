# Operating-cost snapshot

Last reviewed: August 21, 2026. Values are owner-facing planning estimates, not accounting records.

## Current recurring cost

| Service | Current evidence | Product cost at current setup |
| --- | --- | --- |
| Railway hosting | Hobby workspace. This project used **$0.1940** from August 12 through August 18, including production and staging. Recent total workspace invoices were $5.00, $5.00, $6.69, and $6.82, but that workspace also hosts unrelated projects. | Approximately **$1/month of marginal usage** at the observed pace. The shared workspace has a **$5/month minimum**. |
| Anthropic | AI search planning is enabled where configured, and selective rewriting is reserved for weak grounded drafts. Strong structured answers bypass rewriting. Live health reports request and token totals. | Variable usage. Review the actual request and token totals monthly rather than assuming $0. |
| GitHub | Repository, Actions, source monitoring, and release history. | No product-specific incremental charge identified; verify the owner’s current GitHub plan during transfer. |
| Google Analytics | Existing production usage analytics. | No product-specific incremental charge identified. |
| Gmail, Notion, and Resend/webhooks | Alert intake, question logs, and optional email delivery. | Uses the owner’s existing services; confirm any paid-plan allocation during transfer. |
| Cloudflare and domain | DNS, HTTPS, and the public domain. | Record the actual annual domain renewal from the registrar before a sale; it is not represented in Railway usage. |

## Simple buyer estimate

At today’s traffic, the application itself adds roughly **$1/month in Railway consumption**, while the shared Railway workspace still bills its $5 minimum. Anthropic usage is variable and intentionally limited by caching, deterministic strong-answer preservation, and selective rewriting. A future owner should use live token totals to establish the actual AI budget rather than relying on a fixed estimate.

## Quarterly owner check

1. Copy the latest Railway project usage—not the whole mixed workspace bill—into this file.
2. Compare `/api/health` AI request and token totals with traffic; investigate unexpected increases or repeated rewrite rejections.
3. Record the domain renewal amount and date in the private ownership record.
4. Note any new paid integration or material traffic increase.

Do not place invoices, payment-card details, API keys, or account passwords in the repository.
