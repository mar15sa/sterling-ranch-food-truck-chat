function deriveAnswerVerdict(answer, confidence = {}) {
  if (confidence.canAnswer !== true) return "unverified";

  const normalizedAnswer = String(answer || "").replace(/\s+/g, " ").trim();
  const opening = String(answer || "")
    .split(/\n/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^Short answer:\s*/i, "");
  const lead = opening.split(/(?<=[.!?])\s+/)[0];
  if (!lead) return "verified";

  if (/\b(?:DRC|CAB|design review)?\s*approval is required\b/i.test(opening)) {
    return "conditional";
  }

  if (/\b(?:must be submitted(?: for (?:DRC|design review))?|(?:DRC|CAB|design review) approval is required|approval must be (?:obtained|received))\b/i.test(normalizedAnswer)) {
    return "conditional";
  }

  if (
    /\b(?:requires?|required|needs?|need to (?:receive|obtain|submit)|need (?:DRC|CAB|design review) (?:review|approval)|must (?:first )?(?:receive|obtain|submit)|must be (?:submitted|reviewed|approved)|approval (?:must be (?:obtained|received)|is required)|with (?:DRC|CAB|design review) approval|subject to approval|only (?:after|with)|evaluated on an individual basis)\b/i.test(
      lead
    )
  ) {
    return "conditional";
  }

  if (
    /^(?:no\b|not allowed\b|prohibited\b)|\b(?:is|are) (?:not allowed|prohibited)\b|\b(?:isn't|aren't) allowed\b|\b(?:may not|cannot|can't)\b/i.test(
      lead
    )
  ) {
    return "prohibited";
  }

  if (
    /^(?:yes\b|allowed\b|permitted\b)|\b(?:is|are) allowed\b|^(?:you|residents?|homeowners?|owners?)\s+(?:can|may)\b/i.test(
      lead
    )
  ) {
    return "allowed";
  }

  return "verified";
}

module.exports = { deriveAnswerVerdict };
