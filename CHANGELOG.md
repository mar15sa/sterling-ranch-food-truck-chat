# Changelog

## Unreleased — staging

### Trustworthy answers

- Classify rules questions, greetings, unrelated prompts, unclear fragments, and prompt-injection attempts before retrieval or model use.
- Reject instruction manipulation without exposing internal prompts, searching sources, calling the model, or creating noisy fix alerts.
- Detect semantic reversals involving permission, prohibition, approval requirements, and omitted exceptions.
- Extract changing dates, fees, times, measurements, and limits from current official source text at response time.
- Exclude future, expired, and superseded policies from current answers and fail closed when current replacement policies conflict.

### Low maintenance

- Cache the prepared rules index in memory.
- Add a deployment health check and reproducible Railway build settings.
- Expand daily hard-question monitoring and preserve every reported failure as a regression test.
- Move focused responsibilities into input-classification, fact-extraction, and grounding modules.

### Resident experience

- Label answers as prohibited, conditional, verified, or not verified.
- Identify current supplemental policies separately from the codified rulebook.
- Improve safe refusals and remove awkward sentence fragments around source-derived facts.

### Owner readiness

- Add a solo-owner operating, release, rollback, dependency, limitation, and handoff guide.
