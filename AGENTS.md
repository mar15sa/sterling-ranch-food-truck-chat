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
- Optimize for a resident's helpful, proactive, and accurate outcome together. Give the supported answer first and make the next useful official move clear.
- Select evidence by authority: controlling adopted rules for binding requirements, official live connectors for current operations, and official forms or actions for verified process steps. Respect freshness and surface conflicts instead of guessing.
- Preserve claim-level source authority, review state, and owner approval. Do not let a supporting page, connector, form, or action upgrade an unapproved or unsupported claim to verified.
- Keep shared logic reusable for other CivicPlus communities. Put community-specific URLs, labels, facilities, vocabulary, routing values, and vendor details in a community profile or connector adapter.
- Do not implement or release resident-facing UI changes without explicit owner design approval.
- Before review or release, record the root cause, question family, resident before/after, authority decision, reuse boundary, family-level tests, live-source safety, and exact release evidence. Use `.github/pull_request_template.md` for pull requests.
