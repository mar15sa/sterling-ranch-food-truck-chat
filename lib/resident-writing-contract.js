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
    // Prepositions introduce names and dates; they are not part of the name.
    .replace(/(^|[.!?]\s+|\n)(For|After|Before|During|Until) (?=[A-Z])/g, (_, boundary, word) => `${boundary}${word.toLowerCase()} `)
    .replace(/\b(Payment Options|Opening Hours|Business Hours|Contact Information|Next Step):/gi, label => label.toLowerCase())
    // An instruction such as "Use TownPay below" names TownPay, not a
    // fictional organization named "Use TownPay". Keep the proper name exact.
    .replace(/\b(Use|Open|Review|Submit|Select|Register) (?=[A-Z][A-Za-z0-9'-]*(?: [A-Z][A-Za-z0-9'-]*)* (?:to|for|below|and)\b)/g,
      verb => verb.toLowerCase())
    .replace(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/gi,
      (_, hour, minutes, meridiem) => `${Number(hour)}:${minutes || "00"} ${meridiem.toLowerCase()}m`)
    .replace(/\bprior to\b/gi, "before")
    .replace(/\bsubsequent to\b/gi, "after")
    .replace(/\bfrom (?:the )?ground\b(?! level)/gi, "from ground level")
    .replace(/\b(in|on|at|within|outside|from) (?:the )?(front|rear|side) or (front|rear|side) (yards?)\b/gi,
      "$1 the $2 $4 or $1 the $3 $4");
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
    text: canonicalWritingText([source.text || source.excerpt || "", ...(source.actions || []).map(action => `${action.label} ${action.url}`)].join("\n")),
    excerpt: canonicalWritingText(source.excerpt || ""),
    questionSpecificExcerpt: false,
  }));
  const issues = llmRewriteIssues(normalizedAnswer, normalizedOriginal, normalizedSources, question);
  const measurementOrigins = [...normalizedOriginal.matchAll(/\bmeasured\s+((?:from|above|below|at)\s+[^,.;\n]+)/gi)].map(match => match[1].toLowerCase());
  if (measurementOrigins.some(origin => !normalizedAnswer.toLowerCase().includes(origin))) issues.push("measurement-origin-dropped");
  const urls = text => (String(text).match(/https?:\/\/[^\s<>"”')\]]+/gi) || []).map(url => url.replace(/[.,;]+$/, "").replace(/\/$/, ""));
  const allowedUrls = new Set(sources.flatMap(source => [source.sourceUrl, ...(source.actions || []).map(action => action.url)]).filter(Boolean).map(url => url.replace(/\/$/, "")));
  if (urls(answer).some(url => !allowedUrls.has(url))) issues.push("unsupported-link");
  const originalBindings = relativeTimeBindings(original);
  const writtenBindings = relativeTimeBindings(answer);
  if (originalBindings.some(binding => !writtenBindings.includes(binding))
    || writtenBindings.some(binding => !originalBindings.includes(binding))) issues.push("relative-time-meaning-changed");
  const condition = /\b(?:unless|except|only if|provided that|subject to)\b/i;
  if (condition.test(original) && !condition.test(answer)) issues.push("source-qualification-dropped");
  const originalWindows = clockWindows(original);
  const writtenWindows = clockWindows(answer);
  if (originalWindows.some(window => !writtenWindows.includes(window))) issues.push("clock-window-changed");
  for (const sentence of normalizedOriginal.split(/(?<=[.!?])\s+(?=[A-Z])|\n+/)) {
    const decision = sentence.match(/^(.+?) decides? whether\b/i);
    if (!decision) continue;
    const actor = decision[1].replace(/^the\s+/i, "").toLowerCase();
    const matching = normalizedAnswer.split(/(?<=[.!?])\s+(?=[A-Z])|\n+/).filter(part => part.toLowerCase().includes(actor));
    if (!matching.some(part => /\b(?:decides? whether|discretion|may|can)\b/i.test(part))) issues.push("decision-became-promise");
  }
  if (/\b(?:must|required|need to)\b/i.test(original)
    && /\bshould\b/i.test(answer) && !/\bshould\b/i.test(original)) issues.push("obligation-weakened");
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
