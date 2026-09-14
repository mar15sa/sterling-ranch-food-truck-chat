# Answer-rating calibration proposal

Proposed September 14, 2026; not implemented or calibrated. The September 14 private-log review found that six of ten owner-marked Needs work entries were rated Good or Excellent, while 46 of 48 entries were labeled Resolved. Existing labels and accepted code paths are not ground truth. See the dated task review and the Notion audit; do not copy resident records into fixtures without a separate privacy review.

Judge the resident's outcome before seeing the old automatic score. Give separate 0–2 assessments, with a short concrete reason, for:

- Direct resolution: did the response answer the actual subject and requested task, with all material parts tracked?
- Useful specificity: does it provide the supported details needed to decide or act, preserving conditions and source scope?
- Relevant proactiveness: does it offer a useful next step or clarify a material ambiguity, without unrelated links or extra hurdles?
- Human readability: is it understandable on first reading, without fragments or unexplained terminology?
- Appropriate concision: is the necessary information easy to find, with no repetition or distracting additions?

Separate evidence correctness from these presentation dimensions. A wrong-topic answer or unsupported material claim cannot be Good or Excellent regardless of fluent prose. A citation, verified code path, or nonempty answer cannot establish resolution. An honest, useful partial answer can still be useful; report its unresolved need. An unavailable optional menu must not erase a successfully answered truck/date question. A submission email is not automatically the requested application form. A clarification is successful only when it resolves a real ambiguity that prevents useful progress.

Calibration procedure: use the owner's existing positive and Needs work marks as seed labels, preserving their dates and limited meaning; they do not establish every dimension. Have humans rate a diverse development sample without model names or old scores, discuss disagreements, and freeze examples and decision rules. Then compare candidate automatic raters on separate examples, measuring false-positive Good/Excellent ratings and per-dimension agreement. Keep uncertain ratings visible and subject to review. Do not allow the same uncalibrated model to certify its own answer.

Report useful/excellent rates independently of schema checks, source-health checks and appropriate refusals. Final holdout questions must be frozen before final tuning, distinct from the diagnostic examples. Include paraphrases, follow-ups, multi-part questions, insufficient evidence, source outages and a second community. Provide counts and uncertainty, including per-family results. The goal's proposed thresholds remain 95% useful, 85% excellent and 90% useful per core family; this document does not establish that they have been achieved.

Understanding-stage pilot review is narrower: check subject/task preservation, all requested parts, constraints/negation, contextual follow-ups, and material clarification. A good request plan does not prove a good final answer. Keep model and cost information hidden during qualitative plan review where possible, but disclose that different output schemas can reveal the variant. Developer AI review is diagnostic evidence, not independent human calibration.
