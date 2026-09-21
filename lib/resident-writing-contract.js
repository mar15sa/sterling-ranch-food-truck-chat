const { residentVoiceIssues } = require("./resident-answer-voice");
const { llmRewriteIssues } = require("./rules-grounding");

const GENERIC_SOURCE_HANDOFF = /^(?:Open|Review|Check) (?:the )?(?:linked )?official (?:source|section|page)(?: if you need| for)? (?:the )?complete wording\.?$/i;

function withoutUnnecessaryHandoff(answer, contract, assessment) {
  if (assessment?.outcome !== "complete" || !GENERIC_SOURCE_HANDOFF.test(answer?.nextStep || "")) return answer;
  const needsAction = (contract?.needs || []).some(need => need.task === "action"
    || (need.requestedDetails || []).some(detail => ["action", "contact"].includes(detail)));
  if (needsAction) return answer;
  const handoff = answer.nextStep.trim();
  return {
    ...answer,
    nextStep: "",
    answer: String(answer.answer || "").split(/\n\s*\n/).filter(part => part.trim() !== handoff).join("\n\n"),
    claims: (answer.claims || []).filter(claim => String(claim.text || "").trim() !== handoff),
    completion: { ...answer.completion, nextBestMove: { type: "none", label: "", actionId: "", url: "" } },
  };
}

function displayedVoiceIssues(answer = {}) {
  const fields = [answer.answer, answer.directAnswer, ...(answer.keyDetails || []), answer.nextStep].filter(Boolean);
  const issues = fields.flatMap(residentVoiceIssues);
  if (answer.completion?.outcome === "complete" && GENERIC_SOURCE_HANDOFF.test(answer.nextStep || "")) {
    issues.push("unnecessary-source-handoff");
  }
  return [...new Set(issues)];
}

// Formatting equivalence, not value relaxation: 10 p.m. and 10:00 PM denote
// the same clock time. This representation is only used for validation.
function canonicalWritingText(text = "") {
  return String(text)
    .replace(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/gi,
      (_, hour, minutes, meridiem) => `${Number(hour)}:${minutes || "00"} ${meridiem.toLowerCase()}m`)
    .replace(/\bprior to\b/gi, "before")
    .replace(/\bsubsequent to\b/gi, "after");
}

function relativeTimeBindings(text) {
  return [...canonicalWritingText(text).matchAll(/\b(\d+)\s+(business\s+|consecutive\s+)?(days?|hours?|weeks?|months?)\s+(before|after)\b/gi)]
    .map(match => `${match[1]}:${(match[2] || "").trim().toLowerCase()}:${match[3].toLowerCase().replace(/s$/, "")}:${match[4].toLowerCase()}`);
}

function clockWindows(text) {
  return [...canonicalWritingText(text).matchAll(/\b(?:between|from)\s+(\d{1,2}:\d{2}\s+[ap]m)\s+(?:and|to|until|through)\s+(\d{1,2}:\d{2}\s+[ap]m)\b/gi)]
    .map(match => `${match[1]}>${match[2]}`.toLowerCase());
}

function writingMeaningIssues(answer, original, sources, question) {
  const normalizedAnswer = canonicalWritingText(answer);
  const normalizedOriginal = canonicalWritingText(original);
  const normalizedSources = sources.map(source => ({ ...source,
    text: canonicalWritingText(source.text || source.excerpt || ""),
    excerpt: canonicalWritingText(source.excerpt || ""),
  }));
  const issues = llmRewriteIssues(normalizedAnswer, normalizedOriginal, normalizedSources, question);
  const originalBindings = relativeTimeBindings(original);
  const writtenBindings = relativeTimeBindings(answer);
  if (originalBindings.some(binding => !writtenBindings.includes(binding))
    || writtenBindings.some(binding => !originalBindings.includes(binding))) issues.push("relative-time-meaning-changed");
  const condition = /\b(?:unless|except|only if|provided that|subject to)\b/i;
  if (condition.test(original) && !condition.test(answer)) issues.push("source-qualification-dropped");
  const originalWindows = clockWindows(original);
  const writtenWindows = clockWindows(answer);
  if (originalWindows.some(window => !writtenWindows.includes(window))) issues.push("clock-window-changed");
  if (/\b(?:decides? whether|discretion)\b/i.test(original)
    && !/\b(?:decides? whether|discretion|may|can)\b/i.test(answer)) issues.push("decision-became-promise");
  if (/\b(?:must|required|need to)\b/i.test(original)
    && /\b(?:optional|not required|don't (?:have|need) to|do not (?:have|need) to)\b/i.test(answer)
    && !/\b(?:optional|not required|don't (?:have|need) to|do not (?:have|need) to)\b/i.test(original)) issues.push("obligation-weakened");
  if (/\b(?:within|up to|maximum|no more than|at most)\b/i.test(original)
    && /\b(?:at least|minimum|no less than)\b/i.test(answer)
    && !/\b(?:at least|minimum|no less than)\b/i.test(original)) issues.push("limit-direction-changed");
  const sourceSwitch = [...normalizedOriginal.matchAll(/\bturn(?:ed)?\s+(on|off)\b/gi)].map(match => match[1].toLowerCase());
  const writtenSwitch = [...normalizedAnswer.matchAll(/\bturn(?:ed)?\s+(on|off)\b/gi)].map(match => match[1].toLowerCase());
  if (sourceSwitch.some(value => !writtenSwitch.includes(value))
    || writtenSwitch.some(value => !sourceSwitch.includes(value))) issues.push("operating-state-changed");
  return [...new Set(issues)];
}

module.exports = { canonicalWritingText, displayedVoiceIssues, relativeTimeBindings, withoutUnnecessaryHandoff, writingMeaningIssues };
