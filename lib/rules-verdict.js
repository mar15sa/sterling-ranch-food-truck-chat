function deriveAnswerVerdict(answer, confidence = {}) {
  if (confidence.canAnswer !== true) return "unverified";

  const lead = String(answer || "")
    .split(/\n|(?<=[.!?])\s+/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^Short answer:\s*/i, "");
  if (!lead) return "verified";

  if (
    /\b(?:requires?|required|needs?|need to (?:receive|obtain|submit)|need (?:DRC|CAB|design review) (?:review|approval)|must (?:first )?(?:receive|obtain|submit)|with (?:DRC|CAB|design review) approval|subject to approval|only (?:after|with))\b/i.test(
      lead
    )
  ) {
    return "conditional";
  }

  if (
    /^(?:no\b|not allowed\b)|\b(?:is|are) (?:not allowed|prohibited)\b|\b(?:isn't|aren't) allowed\b|\b(?:may not|cannot|can't)\b/i.test(
      lead
    )
  ) {
    return "prohibited";
  }

  if (/^(?:yes\b|allowed\b|permitted\b)|\b(?:is|are) allowed\b/i.test(lead)) {
    return "allowed";
  }

  return "verified";
}

module.exports = { deriveAnswerVerdict };
