# Community Assistant testing

- Treat every question submitted by Codex, a release check, a monitor, a soak test, or another automated tool as a test question.
- For browser-based testing, always open `/community-assistant?test=1` and confirm the **Test mode** banner is visible before asking a question.
- For direct requests to `/api/community/ask` or `/api/rules/ask`, always include `"isTest": true` in the JSON body.
- Never use the regular Community Assistant page or omit `isTest: true` for testing, because doing so adds test questions to the owner's resident-question list.
- Resident-facing behavior must remain unchanged: the test marker only controls how the question is labeled and filtered in the private log.
