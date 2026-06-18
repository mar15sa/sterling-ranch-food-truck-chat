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
  const withoutSectionNumbers = String(text || "").replace(/\b\d+[a-z]?-\d+[a-z]?\b/gi, " ");
  const matches = withoutSectionNumbers.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) || [];
  return matches
    .map((token) => token.replace(/[$,%\s]/g, "").replace(/\.0+$/, ""))
    .filter(Boolean);
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
  const issues = [];

  const corpusNumbers = new Set([...numericTokens(corpus), ...numberWordsToDigits(corpus)]);
  const answerNumbers = new Set([...numericTokens(answer), ...numberWordsToDigits(answer)]);
  const missingNumbers = [...answerNumbers].filter((token) => !corpusNumbers.has(token));
  if (missingNumbers.length) {
    issues.push(`number(s) not in cited sections: ${missingNumbers.join(", ")}`);
  }

  const citedRefs = new Set(sectionReferences(corpus));
  const missingRefs = sectionReferences(answer).filter((ref) => !citedRefs.has(ref));
  if (missingRefs.length) {
    issues.push(`section reference(s) not among cited sources: ${missingRefs.join(", ")}`);
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

function llmRewriteIssues(answer, draftAnswer, sources = []) {
  const issues = [];
  if (!String(answer || "").trim()) return ["empty rewrite"];

  issues.push(...groundednessIssues(answer, sources));
  issues.push(...missingDraftNumberIssues(answer, draftAnswer));
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
  groundednessIssues,
  llmRewriteIssues,
  numericTokens,
  numberWordsToDigits,
  sectionReferences,
};
