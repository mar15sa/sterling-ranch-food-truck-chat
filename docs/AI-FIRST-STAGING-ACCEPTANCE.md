# AI-first Community Assistant staging acceptance

Production must remain in `legacy` mode until this checklist is complete and the owner explicitly approves the exact staging commit.

## Before deployment

- Set staging `COMMUNITY_INTERPRETATION_MODE=structured` and keep production on `legacy`.
- Run `npm run check`, `npm run community:eval`, and `npm run community:routing:live` with three repeats.
- Confirm zero unsupported claims, zero regressions, zero cross-community leakage, 100% security rejection, at least 98% structured interpretation accuracy, and at least 98% repeated-run consistency.
- Save the commit identifier, active community-source fingerprint, and deterministic evaluation reports.

## Manual resident journeys

Compare each factual statement, date, price, contact, rule, and link with the displayed official source.

- Events: general, natural paraphrase, explicit audience/category, location, empty day, filtered miss, and the exact “What events are going on tomorrow?” wording.
- Food trucks: today/tomorrow, no listing, multiple trucks, menu unavailable, and menu-price evidence.
- Rules: permission, prohibition, conditional approval, exact section, exceptions, changing limits, and unsupported named projects.
- Facilities: price, deposit, availability, booking, cancellation, and a combined price-plus-booking request.
- Forms: application selection, submission destination, deadline, and missing form.
- Services: payment, account access, phone, email, water rates, trash, and recycling schedule.
- Live status and alerts: current pool state, stale status, closure, and no current alert.
- Conversation: greeting, correction, dependent follow-up, topic change, unclear pronoun, unrelated request, and multi-detail request.
- Security: direct and obfuscated injection, secret request, malicious prior context, hostile source instructions, oversized input, rate limit, and link-host rejection.
- UI: desktop/mobile layout, source expansion, action links, copy-answer link, staging badge, CSP, and HSTS.

## Required 24-hour soak

Run `npm run community:soak:24h` against staging. It checks health every 15 minutes, rotates cross-domain questions hourly, compares equivalent event paraphrases, samples the beginning/middle/end of the window, saves a report, rejects unsupported claims, enforces the 15-second request ceiling, and requires warm p95 latency below five seconds.

Run the complete real-model benchmark at the beginning, midpoint, and end of the soak. Investigate any routing drift, connector parsing change, source freshness warning, new fallback pattern, or latency regression before restarting the full 24-hour window.

## Approval and rollback

- Confirm the saved report says `passed`, all automated gates remain green, and every manual journey above is signed off.
- Promote the exact tested commit only after explicit owner approval.
- Run immediate production smoke tests across every domain and monitor health for 24 hours.
- On any factual, security, source, or availability failure, set production back to `legacy` or redeploy the prior known-good release.
