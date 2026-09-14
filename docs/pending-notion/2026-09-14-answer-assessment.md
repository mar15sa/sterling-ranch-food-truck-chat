# Pending Notion assessment experiment update

Status: prepared September 14, 2026; NOT sent. The earlier automatic approval review rejected an external Notion update containing internal paths, benchmark details, costs and implementation status. Owner confirmation remains pending. Broader local filesystem permission is not confirmation for that payload.

Target: Community Assistant audit page, https://www.notion.so/3dabf909186d81a2a090c2cb90183e96 . Fetch before applying; append while preserving unrelated content, then fetch to verify. No runtime diagram change is needed for this experimental tooling checkpoint. Earlier search-identity/runtime diagram updates remain separately pending.

Exact proposed addition:

## Independent answer rating experiment — September 14, 2026

**State: local experiment completed; not selected, deployed or verified live.**

On ten deliberately constructed examples, the existing automatic rating called five of six flawed answers Good or Excellent, while an exact requested form action was Weak. These diagnostic examples are invented and do not estimate the resident failure rate.

We compared Haiku 4.5 and Sonnet 5 twice per example. Haiku caught all twelve flawed-answer trials but unfairly penalized two necessary clarifications. Sonnet produced seventeen usable assessments out of twenty; three malformed outputs remained unassessed. A narrower follow-up clarified the grading instructions and required a fixed output format: both models then passed all six targeted trials apiece. This is promising diagnostic evidence, not human calibration or proof of a model winner.

The detailed checker usually added four to six seconds, with one follow-up call taking over fourteen seconds. Before putting any checker in the resident's waiting time, we will compare a shorter correctness check. Detailed log grading may fit a background step instead; that architecture is still proposed.

The current rating adds no model API cost. On the broader pilot, a separate AI assessment adds approximately $4.18 per 1,000 answers with Haiku or $9.46 with Sonnet. At 10,000 assessed answers monthly, that is about $41.82 or $94.56. These are grading-only additions based on test token use, excluding the rest of answering, retries and hosting. They are not the full implementation cost commitment. The two completed experiments totaled 52 calls and $0.355214 in standard-rate token estimates; no subscription was added.

No live ratings, source permissions or resident answer behavior changed. Ten focused experiment-tool tests pass. The remaining work includes complete answer quality/cost comparisons, a shorter acceptance check across every fallback, unseen examples and human rating calibration. Local supporting record: `docs/COMMUNITY-ANSWER-ASSESSMENT-EXPERIMENT.md`.

### Follow-up: shorter answer check completed locally

We ran sixty further synthetic trials with a shorter check that examines correctness and coverage without writing-quality scores. It usually took about two seconds. Sonnet accepted all twelve useful-answer trials; Haiku incorrectly rejected four trials involving an honest partial answer or clearly disclosed source gap. Neither allowed a deliberately flawed answer through, but seven contradictory assessments remained unassessed under local validation. Those cannot authorize an answer or an unchecked fallback.

This makes Sonnet a candidate for comparing the complete answer path, not a selected production model. Its measured additional check cost was about $5.45 per 1,000 answers, versus $2.15 for Haiku. At 10,000 checks monthly that is about $54.51 or $21.50. These figures exclude answering, repairs, any separate detailed grading and hosting. If both kinds of checks are used, both charges apply. No such implementation has been chosen.

The compact experiment cost an estimated $0.228032 across sixty calls; all had provider usage records and no new subscription was added. Twelve focused tool tests pass. Resident behavior and live ratings remain unchanged. Full-answer quality, costs, latency, source-failure handling and human calibration remain required. Local record: `docs/COMMUNITY-COMPACT-ACCEPTANCE-EXPERIMENT.md`.
