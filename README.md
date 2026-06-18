# Sterling Ranch Food Truck Chat

This is a tiny local web app for asking questions like:

- "What food truck is here today?"
- "What food truck is here tomorrow?"
- "What food truck is here May 20?"

It checks the Sterling Ranch CAB calendar event, finds the food truck listed for that date, then searches for likely public menu links. When a truck has a readable online menu, the app shows menu items directly.

## Run it

```powershell
npm start
```

Then open:

```text
http://localhost:3000
```

## Live app

Railway is the primary hosted version:

```text
https://sterling-ranch-food-truck-chat-production.up.railway.app
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

## Sterling Ranch Rules Assistant

The separate rules page lives at:

```text
/rules-assistant
```

It uses a local searchable index built from the public Sterling Ranch CAB Rules and Regulations. To refresh that source index manually, run:

```powershell
npm run ingest:rules
```

### Plain-English answers (optional)

By default, answers are assembled directly from the matching rule sections. If an `ANTHROPIC_API_KEY` is set, the assistant uses Claude to rewrite those same sections into a plain-English answer. Claude only rephrases the sections the search already found — it is instructed to use nothing else and never to invent rules, numbers, or fees — and every answer still links the exact source sections. If the key is missing, or a request errors, times out, or is declined, the assistant automatically falls back to the built-in answer, so it never hard-fails.

Environment variables:

- `ANTHROPIC_API_KEY` — enables Claude-written answers. Without it, the built-in answers are used.
- `RULES_LLM_MODEL` — which model to use. Defaults to `claude-haiku-4-5` (lowest cost, well-suited to this). Use `claude-sonnet-4-6` or `claude-opus-4-8` for more nuance.
- `RULES_LLM_MAX_TOKENS` (default `600`) and `RULES_LLM_TIMEOUT_MS` (default `15000`) — optional tuning.
- `RULES_ALERT_WEBHOOK_URL` — optional webhook for runtime alerts. When set, the server alerts if rules questions hit repeated rate-limit blocks, the rulebook refresh fails, or LLM rewrites are rejected often. Without it, those alerts are still written to server logs.
- `RULES_ALERT_RESEND_API_KEY` or `RESEND_API_KEY` — optional Resend API key for sending runtime alerts by email.
- `RULES_ALERT_EMAIL_TO` — optional comma-separated recipient list for email alerts.
- `RULES_ALERT_EMAIL_FROM` — required if email alerts are enabled. Use a verified Resend sender, for example `Sterling Ranch Society <alerts@yourdomain.com>`.
- `RULES_ALERT_EMAIL_SUBJECT_PREFIX` (default `Sterling Ranch Rules Assistant alert`) — optional email subject prefix.
- `RULES_ABUSE_ALERT_THRESHOLD` (default `10`), `RULES_LLM_REJECTION_ALERT_THRESHOLD` (default `5`), `RULES_ALERT_WINDOW_MS` (default `300000`), and `RULES_ALERT_COOLDOWN_MS` (default `900000`) — optional alert tuning.
- `RULES_QUESTION_LOG_WEBHOOK_URL` — optional webhook that receives each rules question after the assistant answers.
- `RULES_QUESTION_NOTION_TOKEN` or `NOTION_API_KEY` — optional Notion integration token for logging rules questions directly to a Notion database.
- `RULES_QUESTION_NOTION_DATABASE_ID` — required when using direct Notion logging.
- `RULES_QUESTION_NOTION_TITLE_PROPERTY` (default `Question`), `RULES_QUESTION_NOTION_ASKED_AT_PROPERTY` (default `Asked at`), `RULES_QUESTION_NOTION_ANSWER_MODE_PROPERTY` (default `Answer mode`), `RULES_QUESTION_NOTION_CAN_ANSWER_PROPERTY` (default `Can answer`), and `RULES_QUESTION_NOTION_SOURCE_COUNT_PROPERTY` (default `Source count`) — optional Notion property-name overrides.

Set these in your hosting provider's environment-variable settings (see "Put it online"). Never commit the key; `.env` is already gitignored.

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
