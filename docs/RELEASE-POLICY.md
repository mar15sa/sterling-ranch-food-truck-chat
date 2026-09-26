# Release and testing reference

Reviewed September 13, 2026 against main and production revision `0bb9a4d4856b5389089d350a6c97bdfc9677b4ce`. This is the current release-process entry point. Historical plans retain their original evidence and approval scope.

## What changed this morning

[PR #118](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/118) moved the complete deterministic gate to pull requests and removed the duplicate full run after merge. [PR #119](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/119) taught the deployment check to wait through the new version's initial evidence refresh. The purpose was faster feedback and less repeated work while keeping the full pre-merge protection.

The implementation is in [ci.yml](../.github/workflows/ci.yml), [check-deployment-health.js](../scripts/check-deployment-health.js), and [package.json](../package.json). The [post-merge check for #119 passed](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34763722652). Test counts in those PRs describe those revisions; use the candidate's actual report for later counts.

## Bounded releases and shared staging — September 21, 2026

Status: released through [PR #173](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/173) and verified live at revision `74ff3b1` on September 21, 2026. Exact checks, revision and Notion readback are in the [release record](RELEASE-PROCESS-REPAIR-2026-09-21.md). The owner authorized these changes after the September 21 investigation found false source alarms, repeated full gates, and concurrent staging updates holding small fixes for hours.

Start production fixes from current `origin/main` in an isolated worktree. A production pull request contains the requested fix and necessary dependencies only. Do not merge all of `staging` into production. Repair a shared release blocker in a small production-based change, then update dependent pull requests. Do not make a correct production fix absorb unrelated failures from experimental staging work.

Experimental designs use a feature branch and local browser preview by default. Keep previously published comparisons available. A shareable staging preview uses a short coordinated publishing window after urgent production repairs; separate paid hosting is not provisioned automatically.

### Reserve the shared rehearsal environment

Before changing or publishing shared staging, run `npm run staging:lease -- acquire TASK_ID` in the publishing worktree. The reservation is created atomically in the common Git directory, so two local worktrees cannot reserve it together. Run `npm run staging:lease -- assert TASK_ID` immediately before the usual simple staging push. Hold the reservation until the expected deployment revision and affected test-mode checks are verified, then run `npm run staging:lease -- release TASK_ID`.

`npm run staging:lease -- status` identifies the owner. A task that finds an existing reservation continues independent local work and coordinates with its owner. Reservations do not expire silently or authorize overwriting staging; recover an abandoned reservation only after verifying that its task has stopped and identifying the preserved work. This is local coordination across one repository's worktrees, not a hosting lock or a cross-machine lock. Direct Git operations still require agents to follow this rule.

### Check the change once at each required boundary

Run focused checks for all touched behavior and adjacent cases first. Use `npm run release:check -- --scope full` for the final full production candidate; it runs the original `npm run check` exactly once, including precheck and postcheck, and prints elapsed progress. A real failure requires fixing the cause and rerunning affected checks; the final complete candidate still must pass. Reuse evidence for unchanged code within its scope instead of repeating a successful local gate because unrelated preview or documentation work moved. Protected GitHub checks still run for the exact combined merge candidate.

`quality` remains the required protected check. It classifies the full PR diff; post-push health uses the same classifier with the actual before/after revision diff. Renames include both old and new paths. Unknown files, mixed runtime areas, classifier/workflow changes, and empty diffs select the full gate.

| Scope | Eligible changed files | Required checks |
| --- | --- | --- |
| Documentation | Markdown under `docs/`, `README.md`, `AGENTS.md`, and the PR template | Fast repository checks and release-contract tests; exact deployed revision and app readiness |
| Openings | The two openings data files, optionally with documentation | Catalog, syntax, environment boundary and scope checks; exact deployed revision, readiness and valid catalog |
| Food trucks | `data/food-truck-links.json`, optionally with documentation | Catalog, syntax, menu-quality fixture and food-truck behavior checks; exact deployed revision, readiness and live lookup health |
| Owner display | Only `public/community-questions.html`, `.css`, `.js`, optionally their page test and documentation | Owner sessions, privacy, log storage, page, HTTP security and test-label checks; exact revision, assets and unauthenticated API denial |
| Full | All other changes, including `server.js`, question-log storage, authentication, answer logic, sources, dependencies and release infrastructure | Exact approved-evidence revalidation and the entire existing quality gate; complete deployment evidence health and affected test-mode behavior |

The owner-display lane does not cover shared server or storage changes. The September 21 rating-notes PR changes both and therefore still receives the full gate. Narrow lanes do not approve sources, hide source-health warnings in the owner tools, change runtime answer eligibility, or relax protections for Assistant releases.

## Normal application and documentation changes

The critical-capability safeguards add marked production-path questions after a full deployment and a daily production monitor. The complete deterministic gate still runs once before merge. The additional deployed check requires the approved flow, active writer, current evidence, actual final writing/voice/coverage proof, safe actions, four live-service paths, and the private-log/test boundary. A healthy setting alone is insufficient. See [the safeguard review and operating limits](CRITICAL-CAPABILITY-SAFEGUARDS-2026-09-21.md); release verification is recorded there and in the owner guide. Temporary shutdowns remain degraded and require a bounded owner/reason/review/expiry record; do not redefine the operating expectation to suppress an incident.

| Stage | What runs | What passing establishes |
| --- | --- | --- |
| Local work | Focused checks for the affected behavior, then the complete applicable release evidence | The change and adjacent failure cases have been examined. Local results do not replace required GitHub checks. |
| Pull request to main or staging | `fast` runs `npm run test:fast`; then required `quality` selects the bounded scope above. Full changes revalidate approved evidence and run the complete existing gate | Applicable deterministic coverage before merge, with the full suite for shared or Assistant changes. Model rewriting stays disabled. |
| Protected merge | Required `quality` check on an up-to-date branch | The exact combined candidate satisfies branch protection. Main's inspected protection has strict up-to-date checks; `quality` depends on `fast`. |
| Push to main or staging | `deployment-smoke` runs `npm run check:deployment` for that push's exact revision and destination | The expected Railway version is ready and the scope-specific deployment checks pass. Full changes retain source-health checks. No second full suite runs after merge. |
| Scheduled monitoring | Existing live-source and real-model workflows | Ongoing checks under each workflow's scope, separate from ordinary CI. A historical passing run does not establish today's result. |

## Isolated openings releases

Openings catalog updates use a narrow release lane so a changed Community Assistant source cannot delay a verified local opening. The lane applies when the runtime portion of the complete pull-request diff contains one or both of these files; documentation may accompany it:

- `data/openings.json`
- `data/openings-sources.json`

The required `quality` check classifies the full diff against the target branch. An openings-only change runs the catalog validation, openings server/browser syntax checks, environment-page regression check, and release-scope tests. Any additional non-documentation file automatically sends the pull request through the complete Community Assistant evidence revalidation and quality suite. The shared protection name remains `quality`, so there is no unprotected path to `main`.

The shared `staging` branch may contain unrelated work. After an openings commit is verified on staging, production promotion must start from current `origin/main`, apply only the verified openings commit, and confirm the resulting pull-request diff still contains only the two allowlisted files. Never merge the staging branch itself into production for an openings release. After the clean production pull request passes `quality`, merge it normally and verify the exact production revision through `deployment-smoke`, `/api/health`, and `/api/openings`.

The post-push smoke check applies the same exact-file classifier. An openings-only deployment must still match the pushed revision, report that the application is ready, and return a nonempty, dated openings catalog with a valid total. Community Assistant evidence health is intentionally evaluated only for releases that can affect it, so a pre-existing Assistant source warning cannot falsely fail an otherwise healthy catalog deployment. Documentation and owner-display-only pushes use the bounded checks above; all mixed or shared-code pushes retain the complete evidence-health check.

This lane does not weaken Community Assistant source review, freshness, answer-quality, or owner-approval requirements. A change to shared application code, authentication, question storage, resident UI, workflow files, monitoring scripts, or non-allowlisted data remains a normal full-quality release.

The deployment checker reads `/api/health`; it does not ask resident questions or perform a complete browser/answer test. The full mode checks revision, status, readiness, stale rules/community evidence, source failures, and expired approved sources/facts. Openings-only mode checks the exact revision and application readiness, then validates `/api/openings`. Both modes poll through older deployments and temporary refresh states for up to ten minutes by default, then fail if the expected healthy version has not appeared.

## Isolated food-truck releases

Food-truck links and fallback menu items live in `data/food-truck-links.json`. A pull request qualifies for the food-truck lane only when that is its sole runtime file; documentation may accompany it. Any application, workflow, dependency, source-evidence, or other data change sends the complete pull-request diff through the full gate.

The protected `quality` check validates the catalog structure, aliases, URLs, junk-item rules, menu-quality fixtures, food-truck service behavior, Community Assistant adapter boundary, and release classifier. After merge, the deployment check waits for Railway to report the exact revision and readiness, then runs `npm run check:live` against that environment with unreachable-site failures enabled. The update isn't live until both checks pass.

Start each urgent truck fix from current `origin/main` in an isolated worktree. Research the affected truck from current official, social, or ordering sources; change only the dedicated catalog and any necessary documentation; open the normal protected pull request; then merge and verify production. A mixed fix stays on the full release path. Shared staging is optional for a catalog-only correction and must use the staging lease when used.

This lane shortens unrelated Community Assistant checks. It keeps source research, branch protection, exact-revision deployment verification, and the live menu check.

Changes to Assistant behavior still need relevant question-family, source-authority, fallback, and hosted/staging evidence under the [engineering principles](COMMUNITY-ASSISTANT-ENGINEERING-PRINCIPLES.md). Owner design approval and exact source approvals still apply. The morning change does not grant new release permission or remove a specifically required trial. Documentation-only changes may skip runtime journey testing; required repository checks still apply.

All automated browser questions must use `/community-assistant?test=1` with the Test mode banner visible. Direct questions must include `"isTest": true`. Record candidate revision, checks, applicable approval, production verification, and [Notion documentation impact](DOCUMENTATION-MAINTENANCE.md).

## Different kinds of longer checks

| Check | Scope and duration | Authority |
| --- | --- | --- |
| Structured-interpreter rollout | [AI-first staging acceptance](AI-FIRST-STAGING-ACCEPTANCE.md) specifies a 24-hour trial for promoting the structured interpreter | Applies to that mode transition and its explicit acceptance/approval record. It is not the duration of every ordinary documentation or maintenance PR. |
| Hosted trial | `community-hosted-trial.yml` accepts an exact revision and source fingerprint | Use when the release scope calls for the hosted trial. |
| Accelerated check | `community-accelerated-release-check.yml` provides a one-hour staging or production check | A read-only check for an explicitly selected scope. Its existence alone does not waive a required 24-hour acceptance or authorize publication. |
| Conditional source publisher | `community-source-release.yml` contains candidate validation, staging publication, a one-hour source-bundle soak, live monitoring, production publication, and source-only rollback | Runs only when its `COMMUNITY_AUTO_PROMOTE` condition is true and its other gates/permissions permit it. This separate workflow was not removed by #118 or #119. |

## Source publishing: verified state and limits

On September 13, the accessible repository Actions-variable list contained no `COMMUNITY_AUTO_PROMOTE` entry. The [latest inspected source-release run was skipped](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34770317446). These observations do not establish every inherited setting or future run; automatic source publishing is not verified active.

The older statement that Release 2 already replaced the publishing workflow with monitoring-only was inaccurate as a description of the inspected files. The publishing code is still present behind a condition. Background identity-matched renewal, discovery/review, source publication, and application release are separate processes. Refreshing unchanged approved evidence does not approve changed or newly discovered facts.

Keep the existing authorization and review boundary. Do not enable source publishing, broaden an approval, bypass protection, or pick a shorter trial merely to resolve a documentation inconsistency. Record the applicable explicit approval when a source release or mode transition is authorized.

## Scheduled real-model checks

The current workflow is named **AI routing checks**, in `community-routing-quality.yml`. Its scheduled/default profile is `smoke`; the full profile and compatible evidence reuse follow [COMMUNITY-EVIDENCE-REUSE.md](COMMUNITY-EVIDENCE-REUSE.md). The standalone full benchmark can repeat labeled cases three times, but that does not mean the complete benchmark runs on every PR or every scheduled run. #118/#119 left these schedules unchanged.

## Recovery

If a release fails verification, investigate the exact revision and failed evidence. Use the last known-good Railway deployment for an authorized recovery and verify the restored version. Repair on a controlled branch with the relevant regression evidence. Source-publisher rollback applies only within its own executed source-release workflow; the ordinary deployment-health job reports failure and does not itself revert application code.

## Maintenance

Update this page when the workflow, required protection, approval boundary, or check scope changes. Keep historical test counts and timings attached to their release records. Check live configuration through authorized read-only access before describing a conditional workflow as active.
