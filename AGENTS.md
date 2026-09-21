# Community Assistant testing

- Treat every question submitted by Codex, a release check, a monitor, a soak test, or another automated tool as a test question.
- For browser-based testing, always open `/community-assistant?test=1` and confirm the **Test mode** banner is visible before asking a question.
- For direct requests to `/api/community/ask` or `/api/rules/ask`, always include `"isTest": true` in the JSON body.
- Never use the regular Community Assistant page or omit `isTest: true` for testing, because doing so adds test questions to the owner's resident-question list.
- Resident-facing behavior must remain unchanged: the test marker only controls how the question is labeled and filtered in the private log.

# Community Assistant engineering standards

- Read and apply `docs/COMMUNITY-ASSISTANT-ENGINEERING-PRINCIPLES.md` before planning, implementing, reviewing, or releasing Community Assistant work.
- Use `docs/COMMUNITY-CONNECTOR-ARCHITECTURE.md` for the CivicPlus profile/adapter boundary and `docs/COMMUNITY-ANSWER-COMPLETION-DESIGN.md` for answer-completion behavior; do not duplicate their contracts in task-specific code or instructions.
- Fix the system cause and affected question family, not just the reported wording. A one-question patch requires written evidence that the case is genuinely unique.
- Do not embed resident-facing facts, amounts, dates, schedules, contacts, rules, or fixed answer wording in application code. Derive answer content from current approved evidence; shared code may provide source-independent structure and formatting only. Intent recognition may route a question, but it cannot supply the answer.
- Optimize for a resident's helpful, proactive, and accurate outcome together. Give the supported answer first and make the next useful official move clear.
- Select evidence by authority: controlling adopted rules for binding requirements, official live connectors for current operations, and official forms or actions for verified process steps. Respect freshness and surface conflicts instead of guessing.
- Preserve claim-level source authority, review state, and owner approval. Do not let a supporting page, connector, form, or action upgrade an unapproved or unsupported claim to verified.
- Keep shared logic reusable for other CivicPlus communities. Put community-specific URLs, labels, facilities, vocabulary, routing values, and vendor details in a community profile or connector adapter.
- Do not implement or release resident-facing UI changes without explicit owner design approval.
- Before review or release, record the root cause, question family, resident before/after, authority decision, reuse boundary, family-level tests, live-source safety, and exact release evidence. Use `.github/pull_request_template.md` for pull requests.

# Release coordination and bounded fixes

- Read `docs/RELEASE-POLICY.md`. Start production fixes from current `origin/main` in an isolated worktree; promote only the requested fix and necessary dependencies, never the whole shared staging branch.
- Keep experimental design work in its own feature branch and local browser preview. Preserve existing published previews. A shareable staging preview needs a coordinated publishing window; do not provision new paid services automatically.
- Before integrating/pushing shared staging, acquire its reservation with `npm run staging:lease -- acquire TASK_ID`. Run `npm run staging:lease -- assert TASK_ID` immediately before the normal simple staging push. Hold it through exact-revision health and affected test-mode checks, then release with `npm run staging:lease -- release TASK_ID`. If held by another task, continue independent local work and coordinate; do not steal the reservation or repeatedly rebase into a moving target. The reservation is shared across this repository's local worktrees, not across separate clones or machines.
- Run focused checks for all touched behavior first. Then run one complete applicable gate on the final production candidate. `npm run release:check -- --scope full` retains every existing precheck, check, and postcheck. GitHub's required `quality` job selects narrowly allowlisted scopes automatically; unknown/mixed/shared code changes remain full checks.
- Reuse passing evidence for unchanged code within its scope. A changed exact protected-merge candidate still needs its required GitHub checks. Do not repeatedly rerun a successful complete local gate for documentation or unrelated preview changes; isolate the production candidate instead.
- Do not silently expand a small fix into repairing all staging debt. Ship shared blocking fixes as small production-based changes, then unblock dependent releases. If new scope is necessary, state the specific dependency and keep production promotion bounded.
- A staging pass is not completion. For authorized publishing, finish the normal protected production PR and exact live revision plus affected test-mode verification. Preserve branch protection, source decisions, resident test labels, and the immutable literal baseline.

# Keep the Notion project guide current

- The owner guide is https://www.notion.so/3dabf909186d81789a09e4648dbb4bbe. Follow `docs/DOCUMENTATION-MAINTENANCE.md` when changing or releasing this project.
- Before finishing relevant work, update the affected Notion explanation, diagram, decision record, design reference, or operating guide, or record why no documentation change is needed. Fetch each page before editing and preserve unrelated content.
- Separate proposed, approved, implemented, and verified-live states. Confirm the live revision before labeling a change live. Record the verified date and supporting source/release links.
- If Notion is unavailable, save the precise pending update and identify documentation as pending; never silently mark it synchronized. Do not block an urgent recovery solely on Notion availability.
- This documentation rule grants no additional authority to publish code, approve source facts, change settings, or expose resident records.
