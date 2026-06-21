function citedCorpus(sources = []) {
  return sources
    .map((source) => [source?.text, source?.excerpt, source?.title].filter(Boolean).join(" "))
    .join(" \n ");
}

// "Sec. 21-22", "Section 13-179", "Sec 5-182" -> ["21-22", "13-179", "5-182"]
function sectionReferences(text) {
  const matches = String(text || "").match(/\bsec(?:tion|\.)?\s*\d+[a-z]?-\d+[a-z]?\b/gi) || [];
  const refs = matches
    .map((match) => (match.match(/\d+[a-z]?-\d+[a-z]?/i) || [""])[0].toLowerCase())
    .filter(Boolean);
  return [...new Set(refs)];
}

// Standalone numbers / money / measurements, with section-number patterns removed.
function numericTokens(text) {
  const withoutSectionNumbers = String(text || "")
    .replace(/\b\d+[a-z]?-\d+[a-z]?\b/gi, " ")
    .replace(/\b(?:sec(?:tion|\.)?|table)\s+\d+[a-z]?\.\d+[a-z]?\b/gi, " ");
  const matches = withoutSectionNumbers.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) || [];
  return matches
    .map((token) => token.replace(/[$,%\s]/g, "").replace(/\.0+$/, ""))
    .filter(Boolean);
}

function normalizeFactText(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dateTimePhrases(text = "") {
  const value = String(text || "");
  const matches = [
    ...value.matchAll(
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*\d{4})?\b/gi
    ),
    ...value.matchAll(/\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)\b/gi),
    ...value.matchAll(/\blast\s+Wednesday\b/gi),
  ];
  return [...new Set(matches.map((match) => normalizeFactText(match[0])))];
}

function properNounPhrases(text = "") {
  const value = String(text || "").replace(/\bShort answer:|\bWhat I found:|\bBefore you act:/gi, "");
  const matches = value.match(
    /\b(?:[A-Z][A-Za-z0-9&/]+|CAB|DRC)(?:\s+(?:[A-Z][A-Za-z0-9&/]+|CAB|DRC))*\b/g
  ) || [];
  const ignored = new Set([
    "Short",
    "What",
    "Before",
    "I",
    "It",
    "The",
    "This",
    "If",
    "For",
    "Use",
    "Open",
    "Check",
    "Confirm",
    "Yes",
    "No",
    "Sec",
    "Section",
    "Table",
  ]);

  return [
    ...new Set(
      matches
        .map((match) => match.trim())
        .filter((match) => {
          if (match.length <= 2 || ignored.has(match)) return false;
          const words = match.split(/\s+/);
          const isKnownSingle = /^(CAB|DRC|Gemstone|Jellyfish)$/i.test(match);
          const isLikelySentenceStartOnly = words.length === 1 && /^[A-Z][a-z]+s?$/.test(match);
          return isKnownSingle || (words.length >= 2 && !isLikelySentenceStartOnly);
        })
        .map(normalizeFactText)
    ),
  ];
}

function phraseSupportedByCorpus(phrase, corpus) {
  const normalizedCorpus = normalizeFactText(corpus);
  const normalizedPhrase = normalizeFactText(phrase);
  if (normalizedCorpus.includes(normalizedPhrase)) return true;

  if (normalizedPhrase === "drc") {
    return /\bdesign review committee\b/i.test(corpus);
  }
  if (normalizedPhrase === "cab") {
    return /\bcommunity authority board\b/i.test(corpus);
  }
  if (normalizedPhrase === "drc/cab") {
    return phraseSupportedByCorpus("drc", corpus) && phraseSupportedByCorpus("cab", corpus);
  }

  return false;
}

const ONES = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function numberWordsToDigits(text) {
  const words = String(text || "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word in TENS) {
      const unit = words[i + 1];
      if (unit && unit in ONES && ONES[unit] >= 1 && ONES[unit] <= 9) {
        out.push(String(TENS[word] + ONES[unit]));
        i += 1;
      } else {
        out.push(String(TENS[word]));
      }
    } else if (word in ONES) {
      out.push(String(ONES[word]));
    }
  }
  return out;
}

function answerFactText(answer) {
  const kept = [];
  let inSourceBullets = false;

  for (const rawLine of String(answer || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      inSourceBullets = false;
      continue;
    }

    if (/^What I found\s*:/i.test(line)) {
      inSourceBullets = true;
      continue;
    }

    if (/^Before you act\s*:/i.test(line)) {
      inSourceBullets = false;
      kept.push(line);
      continue;
    }

    if (inSourceBullets && /^[-*]\s+/.test(line)) continue;
    if (!inSourceBullets) kept.push(line);
  }

  return kept.join(" ");
}

function groundednessIssues(answer, sources = []) {
  const corpus = citedCorpus(sources);
  const answerFacts = answerFactText(answer);
  const issues = [];

  const corpusNumbers = new Set([...numericTokens(corpus), ...numberWordsToDigits(corpus)]);
  const answerNumbers = new Set([...numericTokens(answerFacts), ...numberWordsToDigits(answerFacts)]);
  const missingNumbers = [...answerNumbers].filter((token) => !corpusNumbers.has(token));
  if (missingNumbers.length) {
    issues.push(`number(s) not in cited sections: ${missingNumbers.join(", ")}`);
  }

  const citedRefs = new Set(sectionReferences(corpus));
  const missingRefs = sectionReferences(answerFacts).filter((ref) => !citedRefs.has(ref));
  if (missingRefs.length) {
    issues.push(`section reference(s) not among cited sources: ${missingRefs.join(", ")}`);
  }

  const missingDateTimes = dateTimePhrases(answerFacts).filter(
    (phrase) => !phraseSupportedByCorpus(phrase, corpus)
  );
  if (missingDateTimes.length) {
    issues.push(`date/time phrase(s) not in cited sections: ${missingDateTimes.join(", ")}`);
  }

  const missingProperNouns = properNounPhrases(answerFacts).filter(
    (phrase) => !phraseSupportedByCorpus(phrase, corpus)
  );
  if (missingProperNouns.length) {
    issues.push(`proper noun(s) not in cited sections: ${missingProperNouns.join(", ")}`);
  }

  return issues;
}

function missingDraftNumberIssues(answer, draftAnswer) {
  const draftFacts = answerFactText(draftAnswer);
  const requiredNumbers = new Set([...numericTokens(draftFacts), ...numberWordsToDigits(draftFacts)]);
  const answerNumbers = new Set([...numericTokens(answer), ...numberWordsToDigits(answer)]);
  const missing = [...requiredNumbers].filter((token) => !answerNumbers.has(token));

  return missing.length ? [`required number(s) dropped from draft answer: ${missing.join(", ")}`] : [];
}

function requiredPhraseIssues(answer, draftAnswer) {
  const answerText = String(answer || "");
  const draftFacts = answerFactText(draftAnswer);
  const issues = [];

  if (/approved non[-\s]?seasonal settings/i.test(draftFacts)) {
    if (!/approved non[-\s]?seasonal settings/i.test(answerText)) {
      issues.push("required phrase dropped: approved non-seasonal settings");
    }

    const hardwiredTurnedOff =
      /\b(hardwired|soffit|eave|track)\b[\s\S]{0,90}\b(switched off|switch off|turned off|turn off|shut off)\b/i.test(
        answerText
      ) ||
      /\b(switched off|switch off|turned off|turn off|shut off)\b[\s\S]{0,90}\b(hardwired|soffit|eave|track)\b/i.test(
        answerText
      );
    if (hardwiredTurnedOff) {
      issues.push("changed hardwired lighting requirement to turning lights off");
    }
  }

  if (/\bDRC approval\b/i.test(draftFacts) && !/\bDRC\b[\s\S]{0,40}\bapproval\b|\bapproval\b[\s\S]{0,40}\bDRC\b/i.test(answerText)) {
    issues.push("required DRC approval wording dropped");
  }

  if (/\$\d/.test(draftFacts) && /\b(around|about|roughly|approximately|approx\.?)\b/i.test(answerText)) {
    issues.push("exact fee answer was softened with approximate language");
  }

  return issues;
}

function missingDraftDateTimeIssues(answer, draftAnswer) {
  const draftFacts = answerFactText(draftAnswer);
  const answerText = normalizeFactText(answer);
  const missing = dateTimePhrases(draftFacts).filter((phrase) => !answerText.includes(phrase));
  return missing.length ? [`required date/time phrase(s) dropped from draft answer: ${missing.join(", ")}`] : [];
}

function missingDraftProperNounIssues(answer, draftAnswer) {
  const draftFacts = answerFactText(draftAnswer);
  const answerText = normalizeFactText(answer);
  const missing = properNounPhrases(draftFacts).filter((phrase) => !answerText.includes(phrase));
  return missing.length ? [`required proper noun(s) dropped from draft answer: ${missing.join(", ")}`] : [];
}

function llmRewriteIssues(answer, draftAnswer, sources = []) {
  const issues = [];
  if (!String(answer || "").trim()) return ["empty rewrite"];

  issues.push(...groundednessIssues(answer, sources));
  issues.push(...missingDraftNumberIssues(answer, draftAnswer));
  issues.push(...missingDraftDateTimeIssues(answer, draftAnswer));
  issues.push(...missingDraftProperNounIssues(answer, draftAnswer));
  issues.push(...requiredPhraseIssues(answer, draftAnswer));

  if (/^Short answer\s*:/i.test(answerFactText(draftAnswer)) && !/^Short answer\s*:/i.test(String(answer || "").trim())) {
    issues.push("missing Short answer label");
  }

  if (/Before you act\s*:/i.test(draftAnswer) && !/Before you act\s*:/i.test(answer)) {
    issues.push("missing Before you act caution");
  }

  if (/What I found\s*:/i.test(draftAnswer) && !/What I found\s*:/i.test(answer)) {
    issues.push("missing What I found section");
  }

  return issues;
}

module.exports = {
  answerFactText,
  dateTimePhrases,
  groundednessIssues,
  llmRewriteIssues,
  numericTokens,
  numberWordsToDigits,
  properNounPhrases,
  sectionReferences,
};
