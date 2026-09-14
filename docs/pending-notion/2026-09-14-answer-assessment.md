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
