# Release and testing reference

Reviewed September 13, 2026 against main and production revision `0bb9a4d4856b5389089d350a6c97bdfc9677b4ce`. This is the current release-process entry point. Historical plans retain their original evidence and approval scope.

## What changed this morning

[PR #118](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/118) moved the complete deterministic gate to pull requests and removed the duplicate full run after merge. [PR #119](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/119) taught the deployment check to wait through the new version's initial evidence refresh. The purpose was faster feedback and less repeated work while keeping the full pre-merge protection.

The implementation is in [ci.yml](../.github/workflows/ci.yml), [check-deployment-health.js](../scripts/check-deployment-health.js), and [package.json](../package.json). The [post-merge check for #119 passed](https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34763722652). Test counts in those PRs describe those revisions; use the candidate's actual report for later counts.

## Normal application and documentation changes

| Stage | What runs | What passing establishes |
| --- | --- | --- |
| Local work | Focused checks for the affected behavior, then the complete applicable release evidence | The change and adjacent failure cases have been examined. Local results do not replace required GitHub checks. |
| Pull request to main or staging | `fast` runs `npm run test:fast`; then `quality` revalidates approved evidence into a temporary snapshot and runs `npm run check` | Full deterministic coverage before merge, with early feedback from the fast stage. Both jobs explicitly set model mode off and disable model rewriting. |
| Protected merge | Required `quality` check on an up-to-date branch | The exact combined candidate satisfies branch protection. Main's inspected protection has strict up-to-date checks; `quality` depends on `fast`. |
| Push to main or staging | `deployment-smoke` runs `npm run check:deployment` for that push's exact revision and destination | The expected Railway version is ready and its checked source-health fields pass. No second full test suite runs in this workflow after merge. |
| Scheduled monitoring | Existing live-source and real-model workflows | Ongoing checks under each workflow's scope, separate from ordinary CI. A historical passing run does not establish today's result. |

## Isolated openings releases

Openings catalog updates use a narrow release lane so a changed Community Assistant source cannot delay a verified local opening. The lane applies only when the complete pull-request diff contains one or both of these files and nothing else:

- `data/openings.json`
- `data/openings-sources.json`

The required `quality` check classifies the full diff against the target branch. An openings-only change runs the catalog validation, openings server/browser syntax checks, environment-page regression check, and release-scope tests. Any additional file automatically sends the pull request through the complete Community Assistant evidence revalidation and quality suite. The shared protection name remains `quality`, so there is no unprotected path to `main`.

The shared `staging` branch may contain unrelated work. After an openings commit is verified on staging, production promotion must start from current `origin/main`, apply only the verified openings commit, and confirm the resulting pull-request diff still contains only the two allowlisted files. Never merge the staging branch itself into production for an openings release. After the clean production pull request passes `quality`, merge it normally and verify the exact production revision through `deployment-smoke` and `/api/health`.

This lane does not weaken Community Assistant source review, freshness, answer-quality, or owner-approval requirements. A change to application code, UI, workflow files, monitoring scripts, or any non-allowlisted data remains a normal full-quality release.

The deployment checker reads `/api/health`; it does not ask resident questions or perform a complete browser/answer test. It checks revision, status, readiness, stale rules/community evidence, source failures, and expired approved sources/facts. It polls through older deployments and temporary refresh states for up to ten minutes by default, then fails if the expected healthy version has not appeared.

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
