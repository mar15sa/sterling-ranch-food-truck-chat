## Resident problem and root cause

- What resident problem does this solve?
- What system-level root cause produced it?
- What affected question family is fixed? If this only changes one question, why is that genuinely unique?

## Resident outcome

- Before:
- After:
- How does this improve helpfulness, proactiveness, and accuracy?

## Evidence, authority, and reuse

- What source is authoritative for this answer or behavior, and why?
- How are freshness, conflicts, and unavailable live sources handled?
- What belongs in core logic, a community profile, or a connector adapter?
- Can a second CivicPlus community use this without a core-code change? If not, explain the bounded exception.

## Verification and release evidence

- [ ] Tests cover the reported case and its question family.
- [ ] Tests cover authority selection and relevant collision/degradation behavior.
- [ ] Resident-facing facts and fixed answer wording come from current approved evidence, not application code; routing logic supplies no answer content.
- [ ] Automated Community Assistant checks use test mode (`?test=1` in the browser or `"isTest": true` in direct requests).
- [ ] Live-source and action-link safety were checked where applicable.
- [ ] The exact candidate build passed the required local, hosted, and staging checks.
- [ ] Resident-facing before/after behavior and any limitations are documented.
