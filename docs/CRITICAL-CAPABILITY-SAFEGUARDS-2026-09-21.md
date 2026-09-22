# Critical capability safeguards

Status: implemented on the isolated safeguard branch; release verification pending. The owner requested automatic safeguards after the writer had been disabled without a visible product-health failure, and explicitly expanded the review to other critical components.

## Review and cause

Deployment health proves version/readiness and source freshness but does not require the resident writer or audited flow. Per-answer writer diagnostics exist after #177–#179, but are not counted in operational health. The scheduled AI workflow checks staging routing, not the complete production answer. Voice diagnostics and coverage are available but not independently checked by a hosted contract. Composition caches have no age limit, which can hide a later provider outage. Pool/calendar monitors report their last result without expiring it or bounding a hung job. Existing GitHub monitoring issues and configured application alert channels can be reused; a GitHub issue is a verified notification record, not proof that an email was delivered.

## Required behavior and implementation boundary

| Capability | Existing authority/control | Safeguard |
| --- | --- | --- |
| Input safety | Existing prompt-injection classifier and boundary | Marked negative canary plus regression proving no writer/source work on a rejected request |
| Approved, current evidence | Existing source manager, approval and claim-source contracts | Retain source-health gate; reject missing/detached/unverified proof in checked answer envelopes |
| Understanding and complete coverage | Existing resident-need contract and final audit | Required production flow; check final assessed needs, missing details and confirmation consistency |
| Resident writer | Existing configured provider, final writer callback | Independently stored operating expectation; observed eligible/attempted/accepted/skipped/rejected counts and explicit reasons |
| Meaning and sources after writing | Existing writing validators | Validation receipt and digest bound to the accepted displayed fields; discarded/unchecked accepted writing fails the monitor |
| Voice | Existing all-field voice validator and owner rubric | Evidence that the check ran; known-good/known-bad independent regression examples; failures visible without claiming calibrated grades |
| Official actions | Existing approved actions and source bindings | Check returned actions are safe URLs with supporting response evidence; retain existing authority/collision tests |
| Live connections | Existing configured adapters and pool/calendar checks | Bound each monitor run; age out last success; exercise calendar, food trucks, waste pickup and pool status through the answer path |
| Private owner log and test labeling | Existing authentication and question-log boundary | Unauthenticated owner endpoint must deny access; every probe uses isTest:true; retain real log-boundary tests |
| Monitoring and alerts | Existing GitHub Actions/issues and application monitoring | Hourly bounded production check, release check, deduplicated incident/recovery records, freshness watchdog and a verified notification drill |

Required behavior is stored separately from observed runtime configuration so disabling a feature cannot redefine success. Temporary-disable records must identify the capability, reason, owner/review reference and expiry; they remain visibly degraded and cannot silently turn a failed release green. Truth, source approval, privacy and test-label controls cannot be waived through this file. No switch automatically re-enables a feature.

Core checks are reusable; community-specific test questions and operating expectations live in configuration. No new resident fact, source approval, rule interpretation, provider, paid hosting or resident UI design is introduced. The current provider remains. Seven marked questions run after full deployments and hourly: two writing/action questions, four live-service questions and one injection boundary. Each request is bounded to 30 seconds within a total two-minute probe budget, with no probe retries. Existing writer correction is bounded to one retry within its existing budget. This adds bounded model usage; it replaces neither the full deterministic suite nor owner judgment. Known failures are not repaired by weakening expectations. Monitoring uses aggregate counts/reason codes and synthetic questions, not resident text or private records. Valid individual fallbacks do not trigger a writer-disabled incident; zero accepted answers across an eligible probe set, or ten eligible answers in the one-hour telemetry window, does. The composition cache expires after 15 minutes for residents and tests alike.

GitHub runs the hourly production monitor independently of the owner's computer. It opens one bot-owned incident for a new failure, reports changed failures, and closes it after a passing current-revision check. Shared concurrency and a current-main guard prevent older runs from closing a newer incident. A separate Codex heartbeat checks workflow enablement, run age, completion and saved evidence; it does not submit more questions or repair the system. It flags no completed successful evidence within three hours, a run stuck beyond 20 minutes, or an explicit failure. The Codex watchdog needs the computer and app running, and cannot report its own complete shutdown. GitHub issue creation/recovery is verifiable; inbox delivery depends on the owner's GitHub notification settings. These limits must remain visible in the operating guide.

## Verification and release

Before release, test writer disabled, route downgrade, accepted text discarded, missing validation receipt, missing/detached proof, partial answer overclaim, poor voice, unsafe/unbound actions, expired exceptions, unavailable/hung/stopped connector monitors, repeated incident deduplication, recovery, and stale watchdog results. Run focused checks, one complete exact-candidate gate with unchanged evidence reused where valid, protected GitHub checks, reserved staging verification, exact production probes, and an explicit notification drill. All browser probes use the test page/banner and every API question includes isTest:true. Keep source approvals, freshness and the immutable resident-literal baseline intact.

Update the owner guide's flow explanation, decisions and operations with the final exact revision, checks, monitoring cadence, alert channel/delivery limits and recovery instructions after verification. Proposed, implemented and verified-live states remain distinct.
