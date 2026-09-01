# Sterling Ranch Society resident tools

This is the source code and operating documentation for the Sterling Ranch Society resident site. It includes:

- Food-truck and menu lookups from the community calendar.
- A source-grounded Community Assistant for rules, services, forms, facilities, prices, contacts, events, and live status.
- Live Overlook outdoor-pool status.
- An evidence-backed Douglas County-area openings tracker.
- A staging-only community onboarding demo that turns one official website into a reviewed source-connection plan.

Start with [the configuration reference](docs/CONFIGURATION.md), [the architecture map](docs/ARCHITECTURE.md), [the operating-cost snapshot](docs/OPERATING-COSTS.md), and [the Rules Assistant owner guide](docs/RULES-ASSISTANT-OPERATIONS.md) when operating or handing off the project.

## Run it

```powershell
npm start
```

Then open:

```text
http://localhost:3000
```

The reusable community setup demo lives at `/community-demo`. Its product promise is simple: paste the main official website, then let the system find and organize the rules, events, forms, fees, facilities, alerts, and service information needed to create direct, specific, human-readable resident answers. The first scan is preview-only; publication still requires source checks and resident-question testing.

## Live app

Railway is the primary hosted version:

```text
https://sterlingranchsociety.com
```

## Put it online

The app can be hosted by Railway or Render.

Railway:

1. Create a new Railway project.
2. Choose GitHub Repository.
3. Select `mar15sa/sterling-ranch-food-truck-chat`.
4. Railway should detect the Node app and deploy it with `npm start`.

Render:

1. Create a GitHub repo for this folder.
2. Push this project to GitHub.
3. In Render, create a new Web Service from that repo.
4. Render should use:
   - Build command: `npm install`
   - Start command: `npm start`
5. When the deploy finishes, Render gives you a public `onrender.com` link.

This project includes a `render.yaml` file, which is a small hosting recipe Render can read.

## Notes

- No paid API key is needed for the food truck chat. (The rules assistant works without one too, but can optionally use a Claude API key for plain-English answers — see below.)
- The app reads public web pages live, so results depend on what the truck and search pages make available.
- Some menus are on Facebook, Instagram, DoorDash, or other sites that may block automatic reading. In those cases, the app still gives you the best menu links it found.

## Sterling Ranch Pool Status

The pool status page lives at:

```text
/pool
```

It reads the public CAB pool page and translates the active status light into plain text, so residents do not have to rely on color alone. The API endpoint is:

```text
/api/pool/status
```

## Douglas County + 80125-area Openings Tracker

The countywide openings tracker lives at:

```text
/openings
```

It publishes an evidence-backed, filterable catalog of restaurants, stores, coffee shops, entertainment, fitness, and other resident-facing businesses across Douglas County plus nearby locations within a 20-mile straight-line radius of ZIP 80125. There is no fixed listing limit; `data/openings.json` is the growing catalog.

The tracker also includes an automatic source radar. It watches the configured official and local sources in `data/openings-sources.json`, fingerprints the useful page content, and isolates new opening-related signals for review. Run a scan manually with:

```powershell
npm run openings:monitor
```

The production server schedules the radar daily, and the `Douglas County openings radar` GitHub workflow provides a second daily check. When a monitored source changes or fails, the workflow opens or updates one review issue rather than publishing an unverified lead automatically.

Opening tips are accepted at `POST /api/openings/tips`. Set `OPENINGS_TIP_WEBHOOK_URL` in hosting to send them to a durable review inbox, or configure `OPENINGS_TIP_EMAIL_TO`, `OPENINGS_TIP_EMAIL_FROM`, and `OPENINGS_TIP_RESEND_API_KEY` (the shared Resend/rules-alert settings also work) to receive them by email. Local development falls back to the gitignored `data/openings-tips.ndjson` file; production returns a visible error instead of silently saving a tip to temporary storage when no durable inbox is configured. `OPENINGS_AUTO_MONITOR=false` disables the server-side schedule if the GitHub schedule should be the only scanner.

## Sterling Ranch Community Assistant

For the safe staging-to-production release process, source hierarchy, automatic safeguards, rollback steps, dependencies, and known limitations, see [the rules assistant owner guide](docs/RULES-ASSISTANT-OPERATIONS.md).

The resident assistant lives at:

```text
/community-assistant
```

The legacy `/rules-assistant` URL remains available and opens the same assistant. It combines the mature rulebook engine with a community index built from reviewed Sterling Ranch CAB, CivicPlus, CivicRec, Municode, calendar, form, facility, service, and status sources. To refresh the broader community index manually, run:

```powershell
npm run ingest:community
```

To rebuild only the codified rulebook index, run:

```powershell
npm run ingest:rules
```

### Grounded AI answers

The mature rules engine answers covered rulebook topics first. For unfamiliar wording and broader community questions, hybrid retrieval searches only the configured community's approved official sources. Claude may expand a search or organize retrieved evidence, but it cannot supply facts. Each AI claim is checked against its cited source; unsupported values, prompt-injection content, conflicting sources, errors, and timeouts fall back to a source-built answer or a safe refusal.

Background checks refresh unchanged sources automatically. Changed, new, or removed source material is held for review rather than silently replacing the last tested version. A reviewed index is published through the normal staging release path.

Environment variables:

- `RULES_LLM_MODE` — `selective` is recommended; `off` disables Claude and `all` preserves the older rewrite-every-supported-answer behavior.
- `ANTHROPIC_API_KEY` — required for Claude-written answers. Without it, the source-built fallback is returned.
- `COMMUNITY_LLM_MODEL`, `COMMUNITY_LLM_MAX_TOKENS`, and `COMMUNITY_LLM_TIMEOUT_MS` — optional settings for broader community search and synthesis; they fall back to the matching rules settings where applicable.
- `COMMUNITY_REFRESH_INTERVAL_MS` (default six hours), `COMMUNITY_INVENTORY_INTERVAL_MS` (daily), `COMMUNITY_FORCED_RECONCILIATION_INTERVAL_MS` (weekly), and `COMMUNITY_AUTO_REFRESH=false` — optional background source-check controls. The daily pass reconciles the complete URL inventory with conditional requests; the weekly pass forces content checks to catch incorrect timestamps and parser drift.
- `RULES_LLM_MODEL` — which model to use. Defaults to `claude-haiku-4-5` (lowest cost, well-suited to this). Use `claude-sonnet-4-6` or `claude-opus-4-8` for more nuance.
- `RULES_LLM_MAX_TOKENS` (default `600`) and `RULES_LLM_TIMEOUT_MS` (default `15000`) — optional tuning.
- `RULES_ALERT_WEBHOOK_URL` — optional webhook for runtime alerts. When set, the server alerts when an answer is uncertain, rules questions hit repeated rate-limit blocks, the rulebook refresh fails, or LLM rewrites are rejected often. Without it, those alerts are still written to server logs.
- `RULES_ALERT_RESEND_API_KEY` or `RESEND_API_KEY` — optional Resend API key for sending runtime alerts by email.
- `RULES_ALERT_EMAIL_TO` — optional comma-separated recipient list for email alerts.
- `RULES_ALERT_EMAIL_FROM` — required if email alerts are enabled. Use a verified Resend sender, for example `Sterling Ranch Society <alerts@yourdomain.com>`.
- `RULES_ALERT_EMAIL_SUBJECT_PREFIX` (default `Sterling Ranch Rules Assistant alert`) — optional email subject prefix.
- `RULES_ABUSE_ALERT_THRESHOLD` (default `10`), `RULES_LLM_REJECTION_ALERT_THRESHOLD` (default `5`), `RULES_LOW_CONFIDENCE_ALERT_THRESHOLD` (default `1`), `RULES_LOW_CONFIDENCE_ALERT_COOLDOWN_MS` (default `86400000`, or 24 hours), `RULES_ALERT_WINDOW_MS` (default `300000`), and `RULES_ALERT_COOLDOWN_MS` (default `900000`) — optional alert tuning.
- `RULES_QUESTION_LOG_WEBHOOK_URL` — optional webhook that receives each rules question after the assistant answers.
- `RULES_QUESTION_NOTION_TOKEN` or `NOTION_API_KEY` — optional Notion integration token for logging rules questions directly to a Notion database.
- `RULES_QUESTION_NOTION_DATABASE_ID` — existing Notion database identifier. The app resolves its single data source automatically.
- `RULES_QUESTION_NOTION_DATA_SOURCE_ID` — optional explicit data-source identifier for the current Notion API; use it when the database contains more than one data source.
- `RULES_QUESTION_NOTION_TITLE_PROPERTY` (default `Question`), `RULES_QUESTION_NOTION_ASKED_AT_PROPERTY` (default `Asked at`), `RULES_QUESTION_NOTION_ANSWER_MODE_PROPERTY` (default `Answer mode`), `RULES_QUESTION_NOTION_CAN_ANSWER_PROPERTY` (default `Can answer`), and `RULES_QUESTION_NOTION_SOURCE_COUNT_PROPERTY` (default `Source count`) — optional Notion property-name overrides.
- `RULES_QUESTION_ADMIN_PASSWORD` and `RULES_QUESTION_ADMIN_SESSION_SECRET` — required for the private `/community-assistant/questions` owner page. Use two different strong secrets; the signed login lasts 12 hours.
- `COMMUNITY_SOURCE_REVIEW_NOTION_TOKEN`, `COMMUNITY_SOURCE_REVIEW_NOTION_DATABASE_ID`, and optional `COMMUNITY_SOURCE_REVIEW_NOTION_DATA_SOURCE_ID` — connect a separate Notion database to the private `/community-assistant/sources` review dashboard. `COMMUNITY_SOURCE_REVIEW_NOTION_TITLE_PROPERTY` overrides its title-column name when needed. The existing owner login protects this dashboard; decisions are immutable and bound to the exact source hash.

Community sources now have two layers: the canonical page library and a versioned fact ledger for changing details such as hours, fees, contacts, dates, reservations, and restrictions. New material is candidate-only until authority, conflict, freshness, link, answer-quality, and owner-review gates pass. The dashboard cannot publish directly; the protected release workflow deploys the exact tested fingerprint.

The private owner page shows the exact sanitized answer, highlights questions that need review, and refreshes every five seconds. Every incoming answer also receives the same 1–5 quality and resident-effort grading used by the release audit; confidence status and answer quality remain separate so a source-backed but unhelpful response can appear as **Answered · Weak**. Use `/community-assistant?test=1` as the bookmarked testing version of the assistant; those questions are hidden from the normal owner view unless **Include my tests** is selected.

Set these in your hosting provider's environment-variable settings (see "Put it online"). Never commit the key; `.env` is already gitignored.

The scheduled `Rules answer quality monitor` GitHub workflow runs the full local evaluation and live production journeys every day. It checks the homepage and security headers, pool status, openings catalog, food-truck dates, representative rule answers, prompt injection, and source health. If a check fails, it opens or updates a GitHub issue with a review checklist. When the checks pass again, the workflow comments on and closes that issue automatically. Every uncertain production answer is also written to the server log with the sanitized question, reason, and closest source so it can be researched and added as a permanent regression case. The first occurrence of each distinct uncertain question can alert immediately; repeats of that same question are quiet for 24 hours.

`npm run check` is the release gate. It includes the 122 historical resident questions, authored and unseen rule tests, source/link safety checks, and a 238-question old-versus-upgraded Community Assistant comparison. A smaller corpus, any regression, a lower overall score, or any very-low upgraded answer blocks release. `npm run community:portability:live` separately proves the same engine can crawl and answer end-to-end questions for a second CivicPlus community without community-specific code changes.

The server also has an admin refresh endpoint:

```text
POST /api/rules/refresh?token=YOUR_TOKEN
```

Set `RULES_REFRESH_TOKEN` in hosting before using that endpoint. If the official online source is unavailable, the importer can use a manually exported text or HTML file:

```powershell
node scripts/ingest-rules.js --source-file path\to\exported-rules.txt
```

### Checking for rule supplements

The assistant also tracks official CAB documents that may update the codified rulebook. To do a broad manual check, run:

```powershell
npm run supplements:audit
```

That prints possible rule, policy, fine, fee, lighting, design, violation, and utility-fee supplements that are newer than the local rulebook. To run the future-facing alarm, run:

```powershell
npm run supplements:monitor
```

The monitor starts after the last reviewed Document Center ID in `data/rules-supplement-audit-baseline.json`. GitHub also runs this monitor daily and fails the workflow if a new candidate appears.

Known supplements live in `data/rules-supplements.json`. Each current supplement should list the sections or topics it replaces, its effective date, and the required coverage phrases that must be present in the official text.

The full extracted text for those supplements lives in `data/rules-supplement-sections.json`. To rebuild it from the official PDFs, run:

```powershell
npm run supplements:build-sections
```

Those extracted records are split into searchable chunks and keep structured metadata like `effectiveDate`, `approvedDate`, `replacesSections`, `parentSupplementId`, and text hashes. The assistant searches those official chunks before falling back to the shorter human-maintained summaries, so newer supplement language can override older codified rulebook text.

The search now combines keyword matching, date-aware supplement priority, and local semantic matching for wording variations. For example, a resident can ask about "permanent roofline lights" or "trim lights" and still reach the under-eave/eave-rake lighting supplement without us needing to hand-code every possible phrase.

The LLM rewrite step treats the resident question as untrusted text, only receives the selected source excerpts, and is checked before display. The grounding check verifies section references, numbers, dates/times, and key proper nouns against the cited sources; if the rewrite drops required facts or adds unsupported details, the server falls back to the deterministic answer.

For new official documents, run:

```powershell
npm run supplements:propose
```

That command checks the Document Center for newer candidates, downloads/extracts likely PDFs, proposes section mappings, and writes review files under `data/rules-supplement-proposals/`. GitHub also runs `.github/workflows/rules-supplement-proposals.yml` daily; when it finds proposal files, it opens a review PR instead of silently changing the live answer logic. `npm run check` runs `scripts/check-rule-supplements.js`, so a supplement that lacks extracted official text or omits an important topic will fail the build instead of silently shipping.
