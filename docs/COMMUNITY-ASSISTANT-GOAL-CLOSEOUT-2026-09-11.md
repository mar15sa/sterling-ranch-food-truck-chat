# Community Assistant goal closeout

**Date:** September 11, 2026  
**Status:** Complete. The broader rule-generalization work is deliberately deferred to a new goal.

## What this goal was for

The goal was to make the Sterling Ranch Community Assistant helpful and accurate without hiding resident facts in hand-written answer templates. It covered:

- answers built from official evidence, with AI used to understand the question and write natural language;
- strict checks that stop AI or old shortcuts from claiming facts the evidence does not prove;
- correct authority boundaries for rules, live operations, actions, and specialist tools;
- source review and approvals for the official CAB site;
- the pool/Labor Day failure, awkward answer fallbacks, and staging-test privacy;
- reporting controls for bugs and feature requests; and
- permanent planning and automation rules so future repairs solve a family of failures instead of one reported question.

The approved Society redesign was included in the final release at the user's direction. It is now live in production alongside the accuracy work.

## What changed and is live

### How answers are made

The Assistant now follows this sequence:

1. It interprets the resident's question and the details they asked for.
2. It finds the applicable official evidence. A rule comes from the controlling rule source; a changing fact comes from its live official source; a form or payment page supplies an action, not a rule or amount.
3. It gives the evidence to AI to write a plain-English answer.
4. A separate safety check compares the wording with the evidence. Unsupported claims, missing dimensions, wrong labels, invented list membership, and unsupported location or approval claims are rejected.
5. If AI cannot produce an acceptable answer, the Assistant gives a safe, evidence-based partial answer and names the precise gap and next official step.

This matches the intended modern-search model in spirit: AI is used for language understanding and writing, while indexing, source identity, approval, freshness, and claim checks are deterministic. It adds an important final safety check after AI generation.

### No new resident-facing canned facts

New resident-facing facts, dates, amounts, contacts, schedules, rules, and fixed answers are prohibited in application code. The resident-literal check blocks newly added factual shortcuts and keeps a reviewed list of older migration debt visible until it is removed or moved to approved evidence. This is a guardrail, not a claim that every historical literal was removed in one release.

### Natural, grounded answers

The answer composer now retries one rejected AI draft using the same evidence and the same validator. If it still cannot safely write the answer, it uses a smaller, natural evidence-boundary response rather than the old mechanical "Short answer / What I found / Before you act" style.

Additional repairs prevent the page wrapper from rebuilding an AI answer and repeating details, and block negative claims that merely add a qualifier after a catalog name (for example, "not on the list for Sterling Ranch").

### Pool and Labor Day

The current CAB pool source is correctly treated as a live operational source. It reports the pool as closed after the seasonal closing. The Assistant can state that current status and the published season, but it will not invent an exact next-summer reopening date.

For historical Labor Day questions, the Assistant now distinguishes three things: the published season, the ordinary Monday schedule, and unverified holiday-specific hours. A historical schedule is usable only when the captured evidence actually covers the requested date. The result is helpful without pretending that ordinary Monday hours are confirmed Labor Day hours.

### Source authority and owner approvals

The release incorporated the owner decisions for the approved water, sewer, stormwater, residential tap/facility, CAB service-fee, payment, billing, delinquency, pool-hours, DRC, rain-barrel, UtilityHawk, trash, facility, contact, Municode, and calendar proposals only within their stated limits. Examples of boundaries preserved:

- 2026 residential rate resolutions control the approved rate rows; payment pages do not.
- A direct payment link is an action link, not a rate source.
- A listed 2.95% card fee is a payment-method charge, not a water rate.
- The fee-resolution effective-date conflict remains withheld.
- Incomplete commercial, school, irrigation, master-meter, large-meter, pool, clipped-footnote, and other excluded rows remain withheld.
- Conflicting facts remain withheld rather than blended into a confident answer.

### Specialist tools and connectors

Food trucks, pool status, waste, and the CivicPlus calendar remain useful where they provide live facts or a richer resident workflow. The Community Assistant answers first and then links out for browsing, menus, maps, reminders, registration, booking, or payment.

The shared community profile and connector boundary now keeps source roles separate: live operations do not prove rules, and a form or action link does not prove a fee, permission, or availability. A second CivicPlus profile is used as a portability proof for the capabilities it declares.

### Source-inventory shortcut resolved

The earlier shortcut that made a smaller reviewed bundle look like complete CAB-site coverage was corrected. The product now separately reports:

- the safety of sources currently approved for resident answers; and
- the remaining work to account for the whole official site.

Official discovery or indexing never automatically makes a fact answerable.

### Staging questions stay out of the owner log

The server now marks all staging Community Assistant questions as tests before logging, even if someone forgot `?test=1`. Production does not trust a browser-provided host or test marker for this boundary. The normal owner view hides test-marked questions. Automated and browser testing also use the explicit test mode.

This prevents new staging/test questions from appearing as resident questions. The four known screenshot records (two raspberry and two holiday-light questions) were corrected to `Testing = yes`. This does not claim that every historical record was bulk-cleaned.

### Feedback controls

The Community Assistant has live "Report a bug" and "Request a feature" controls with contextual email drafts. They do not send anything automatically.

### Automation guardrails

The Daily Community Assistant improvement fixer, food-truck check, and openings review are enabled, and the publishing hold has been removed. The Assistant fixer has permanent instructions to fix a root cause and its related question family, compose facts from current approved evidence, avoid resident-facing canned facts in code, run broad regressions, and stop publishing if evidence or checks are incomplete. The guardrail is now explicit; its future runs still require release review and monitoring. The 58 existing literal-debt nodes remain a frozen baseline: they cannot grow and still need deliberate cleanup.

## Release record

These are the main accuracy/reliability pull requests merged into `main` during this work:

| Pull request | Result |
| --- | --- |
| [#86](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/86) | Hosted synthesis repair. |
| [#87](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/87) | Pool reopening-answer safety. |
| [#88](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/88) | Grounded synthesis evidence projection. |
| [#89](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/89) | Attribute binding checks for rewrites. |
| [#90](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/90) | Grounded details retained after rewrite fallback. |
| [#91](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/91) | Labeled source facts for AI synthesis. |
| [#92](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/92) | Current pool-status date coverage. |
| [#93](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/93) | Negative-claim evidence guard. |
| [#94](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/94) | Unsupported placement-claim guard. |
| [#95](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/95) | Semantic catalog-absence guard. |
| [#96](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/96) | Pool recurring-season and Labor Day evidence boundary. |
| [#97](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/97) | Grounded natural-answer retry. |
| [#98](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/98) | Scoped negative catalog-claim guard and no duplicate AI composition. |
| [#99](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/99) | Trailing negative catalog-claim guard. |
| [#100](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/100) | Natural structured fallback and explicit separation of deferred catalog work. |
| [#101](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/101) | Aspen Grove seasonal-opening update. |
| [#102](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/102) | Final approved editorial UI and release integration. Merged to `main` at 2026-09-11T14:24:22Z as `dcf4f0e170e5cdedd86d7dcbf7693e089c998761`. |

The approved nine-color editorial UI is now live in production for Home, Community Assistant, Food Trucks, Calendar, Openings, and Pool. Production checks confirmed the redesigned homepage loaded its data; the Assistant showed its Test mode banner; holiday lights returned a natural, grounded answer; Boulder Raspberry was correctly described as a preapproved shrub with placement not established and dimensions of 8 ft by 6 ft; Labor Day correctly stated that the pool season runs through Labor Day while separate holiday hours are not published; pool status showed Closed/Red; the Food Trucks page showed Lucky Bird and its menu; Calendar loaded official events; Openings showed 125 listings; and Pool showed Closed.

Release evidence: the gate passed 752/752 checks, 140/140 rule checks, 7/7 unseen cases, and the 122-question resident corpus. Responsive/accessibility checks passed 24/24; footer/composer checks passed 36/36; the post-update openings check passed 125/125; and UI examples passed 19/19.

## Source status: do not mix these counts

These are different measuring sticks from the current live production crawl and review state. They must not be added together or collapsed into one completion percentage.

| Measure | Current count | What it means |
| --- | ---: | --- |
| Discovered official URLs | 1,508 | URLs found by the live crawl. Discovery is not approval. |
| Eligible URLs | 1,078 | URLs that need a disposition under the current scope. |
| Incorporated URLs | 182 (16.9% of eligible) | URLs incorporated into the crawl process. This is coverage progress, not answer approval. |
| Pending URLs | 879 | Eligible URLs awaiting disposition. |
| Excluded URLs | 430 | URLs excluded from the eligible set. |
| Duplicate URLs | 97 | Duplicate crawl findings; not extra review work. |
| Source review items | 1,810 | Private review items, not source groups or approved facts. |
| Sensitive review items | 1,054 | A review-queue subset, not an additional total. |
| Extracted facts | 651 | Fact inventory, not the number of owner-approved answer facts. |
| Approved extracted facts | 27 | Exact fact approvals in the current review state. |
| Candidate extracted facts | 624 | Not approved for resident answers. |
| Conflicted facts | 17 | Withheld until their review batch resolves them. |
| Exact-source ledger versions | 33 | A separate canonical inventory: 5 whole-source approved versions and 28 pending versions. |
| Narrow claim approvals | 32 | Exact claim/action decisions; do not add them to source versions or facts. |
| Current source revalidation | 59/59, zero review required | Revalidation result for the approved current bundle. It is not full-site coverage. |

The 16.9% figure is only live crawl incorporation: 182 of 1,078 eligible URLs. It is not the share of facts approved for resident answers, the share of review items handled, or the safety score. The review process is intentionally strict, but it is still too granular for fast throughput. The next goal should group exact unchanged pages into bounded approval packages, surface only meaningful diffs, renew only identity-matched unchanged evidence, and prioritize high-harm topics and conflicts first.

## What remains or is deferred

1. **Broader semantic catalog-absence rule:** deferred to the next goal. Known gaps are: a lowercase wording bypass; a mixed uncertainty-plus-unsafe-absence bypass; and a false positive on the valid statement "cannot be included without DRC approval." The next goal must solve all three without suppressing legitimate source-backed absence statements.
2. **Full source disposition:** 879 eligible URLs remain pending in the live crawl, with 1,810 source-review items (1,054 sensitive). Work in small batches: payments/fees/contacts/reservations first, then DRC/property changes, utilities/trash, facilities/events, and long-tail history.
3. **Conflicts:** 17 conflicted facts remain safely withheld. Resolve or explicitly withhold each in its appropriate owner-review batch.
4. **Pool reopening:** the official source does not publish an exact 2027 opening date. The Assistant should say the pool is closed for the season and use the published seasonal window without inventing a date.
5. **Connector follow-ups:** CivicRec should be action-only until a real live adapter proves availability and prices. The separately scoped waste service-area and food-truck horizon work should be promoted and verified if it is not already included in the final production revision. Continue moving remaining Sterling-specific connector behavior into profile/adapter configuration.
6. **Historical admin records:** the four known screenshot rows were corrected. Review any other older records only through an owner-authorized private-log workflow; do not claim a bulk cleanup occurred.
7. **Automation review:** periodically sample the Daily fixer’s changes against its no-canned-facts and family-level-proof rules. This is an operational check, not a reason to auto-publish.

## Ongoing risks

- AI can still produce a fluent answer that is not sufficiently supported. The answer validator and test suite reduce this risk; they do not make it zero. New failure shapes require a family-level repair and regression.
- Source content can change without notice. Exact URL/hash/freshness checking keeps changed content from silently becoming evidence, but it can temporarily make an answer more cautious until reviewed.
- Some current questions need an official live system. If a connector is unhealthy, the Assistant must say current status cannot be verified rather than guess.
- Full official-site coverage is incomplete. The Assistant may correctly withhold a useful answer while an official page is waiting for review.
- The resident-literal baseline still has 58 tracked historical debt nodes. It cannot grow, but it should be reduced in deliberate, tested batches.
- The user interface can make a safe partial answer feel less helpful if it overemphasizes limitations. Continue testing natural language and action clarity with real resident question families.

## Candid postmortem: why this took too long

The work started as a large set of visible answer problems, but its scope mixed architecture, source inventory, an active incident, UI, release work, and automation. Those pieces moved at different speeds and on a moving `main` branch. Treating each screenshot as a separate defect initially caused repeated repairs and retesting of neighboring behavior.

The biggest delay was discovering hidden interactions only after a fix had moved forward. For example, fixing a natural AI response exposed duplicate rendering in the page wrapper; blocking one negative catalog phrase exposed a qualified version of the same unsupported claim; fixing seasonal pool data required separating current status, normal hours, historical evidence, and holiday-specific hours. Narrow tests created false confidence until broader resident questions exposed the next bypass. Those were real root-cause discoveries, but they should have been mapped as one answer-pipeline problem sooner.

Source work also looked slower than it was because different reports counted URLs, source records, facts, approvals, candidates, and review items as if they were comparable. That created misleading percentage changes and made completed safety work hard to see. The old shortcut baseline added confusion by looking more complete than it was. Work was also hidden across chats and worktrees, while sequential CI and deployment gates made small releases look idle from the outside.

The process changes are:

1. Fix one failure family at a time and write its authority, evidence, degraded behavior, and adjacent-question tests before coding.
2. Keep a fixed goal scorecard with separate tracks for product safety, source coverage, connector migration, UI, and operations. Do not lower completed work merely because new inventory was found.
3. Require every release to have a short before/after resident example plus exact production smoke tests before moving to the next branch.
4. Use separate worktrees for independent fixes, but keep one visible release board and one final reviewer. Explicitly decide whether UI, data, and accuracy work share a release before testing begins.
5. Report source counts with names and denominators every time. Never use a single “percent complete” without saying whether it is safety, coverage, or review throughput.
6. Use bounded, diff-based approval packages for sources. The owner should review meaningful changed facts and source roles, not repeatedly inspect unchanged boilerplate.
7. Treat staging as a protected testing environment from the server side, then audit the owner log after each release for boundary regressions.
8. Keep the daily automation focused on evidence-backed family repairs, and require human release review for any change that affects resident answers.

## Recommended next goal

Start a new, narrowly scoped goal for the broader semantic catalog-absence rule and the next high-priority source-review batch. Its success criteria should be: no unsupported negative catalog claims across a new held-out phrasing set; no loss of supported positive catalog answers; exact approval packages for the selected source batch; and a short production verification record.
