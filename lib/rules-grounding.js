function citedCorpus(sources = []) {
  return sources
    .map((source) =>
      [
        source?.text,
        source?.excerpt,
        source?.title,
        ...(Array.isArray(source?.derivedFacts) ? source.derivedFacts : []),
      ]
        .filter(Boolean)
        .join(" ")
    )
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
        // A capitalized action verb at the start of a sentence is not part of
        // an organization name. Keep the acronym so it can still be checked.
        // Example: "Get DRC approval" should validate "DRC", not "Get DRC".
        .map((match) =>
          match.replace(
            /^(?:Ask|Check|Confirm|Contact|Get|Keep|Make|Obtain|Receive|Request|Review|Submit)\s+(?=(?:CAB|DRC)\b)/,
            ""
          )
        )
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
  // Document labels such as "one-sheet" contain a number word but do not make
  // a numerical claim. Remove those labels before checking factual quantities.
  const value = String(text || "").replace(/\bone[-\s]?sheets?\b/gi, " ");
  const words = value.toLowerCase().split(/[^a-z]+/).filter(Boolean);
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

const CLAIM_STOP_WORDS = new Set([
  "about", "after", "allowed", "answer", "before", "being", "cannot", "community",
  "could", "does", "from", "have", "into", "must", "need", "only", "permit",
  "permitted", "prohibited", "require", "required", "rules", "shall", "should",
  "sterling", "that", "their", "there", "these", "they", "this", "those", "with",
  "without", "would", "your",
]);

function sentenceList(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function leadClaimText(answer = "") {
  const facts = answerFactText(answer)
    .replace(/^Short answer\s*:\s*/i, "")
    .split(/\bWhat I found\s*:/i)[0]
    .trim();
  return sentenceList(facts).slice(0, 2).join(" ");
}

function claimKeywords(text = "") {
  return [
    ...new Set(
      normalizeFactText(text)
        .match(/[a-z][a-z0-9-]{3,}/g)
        ?.filter((word) => !CLAIM_STOP_WORDS.has(word)) || []
    ),
  ];
}

function relevantSourceTextForClaim(claim, sources = []) {
  const keywords = claimKeywords(claim);
  const sentences = sources.flatMap((source) =>
    sentenceList([source?.text, source?.excerpt, source?.title].filter(Boolean).join(" "))
  );
  if (!keywords.length || !sentences.length) return citedCorpus(sources);

  const scored = sentences.map((sentence) => {
    const normalized = normalizeFactText(sentence);
    const score = keywords.reduce(
      (total, keyword) => total + (normalized.includes(keyword) ? 1 : 0),
      0
    );
    return { sentence, score };
  });
  const bestScore = Math.max(...scored.map((item) => item.score), 0);
  if (bestScore === 0) return citedCorpus(sources);
  return scored
    .filter((item) => item.score >= Math.max(1, bestScore - 1))
    .slice(0, 8)
    .map((item) => item.sentence)
    .join(" ");
}

function claimModalities(text = "") {
  const value = normalizeFactText(text);
  const prohibition =
    /\b(?:are|is|be|remain)?\s*(?:expressly\s+)?prohibited\b/.test(value) ||
    /\b(?:are|is)\s+not\s+(?:allowed|permitted)\b/.test(value) ||
    /\b(?:cannot|may not|must not|shall not)\b/.test(value) ||
    /\bno\b.{0,80}\b(?:can|may|shall)\s+be\b/.test(value) ||
    /\bno\b.{0,45}\b(?:are|is|may be)\s+(?:allowed|permitted)\b/.test(value);
  const permission =
    !prohibition &&
    (/\b(?:are|is)\s+(?:expressly\s+)?(?:allowed|permitted)\b/.test(value) ||
      /\b(?:owner|resident|homeowner|you)\s+(?:can|may)\b/.test(value) ||
      /\bapproved systems?\b/.test(value));
  const approvalRequired =
    /\b(?:drc|cab|design review committee)\b.{0,45}\bapproval\b/.test(value) ||
    /\bapproval\b.{0,45}\b(?:drc|cab|design review committee)\b/.test(value) ||
    /\brequires?\s+(?:prior\s+)?approval\b/.test(value);
  const approvalNotRequired =
    /\b(?:does|do|is|are)\s+not\s+require(?:d)?\b.{0,30}\bapproval\b/.test(value) ||
    /\b(?:drc|cab|design review committee)?\s*approval\s+is\s+not\s+required\b/.test(value) ||
    /\bno\s+(?:drc|cab|design review committee)?\s*approval\s+(?:is\s+)?required\b/.test(value) ||
    /\bwithout\s+(?:drc|cab|design review committee)?\s*approval\b/.test(value);
  const required =
    !approvalNotRequired &&
    (/\b(?:must|shall|required to|is required to|are required to)\b/.test(value) ||
      approvalRequired);
  const optional =
    approvalNotRequired ||
    /\b(?:optional|may choose|do not have to|does not have to|not required to)\b/.test(value);
  const exception = /\b(?:except|exception|unless|provided that|other than)\b/.test(value);
  return {
    approvalNotRequired,
    approvalRequired,
    exception,
    optional,
    permission,
    prohibition,
    required,
  };
}

function claimPolarityIssues(answer, sources = []) {
  const claim = leadClaimText(answer);
  if (!claim || !sources.length) return [];

  const supportText = relevantSourceTextForClaim(claim, sources);
  const answerModes = claimModalities(claim);
  const sourceModes = claimModalities(supportText);
  const claimTerms = claimKeywords(claim);
  const exceptionTerms = claimTerms.filter(
    (term) => !["animal", "animals", "bred", "kept", "raised", "thing", "things"].includes(term)
  );
  const relevantException = sentenceList(supportText).some((sentence) => {
    if (!/\b(?:except|exception|unless|provided that|other than)\b/i.test(sentence)) return false;
    const exceptionText = sentence.split(/\b(?:except|exception|unless|provided that|other than)\b/i).slice(1).join(" ");
    const normalized = normalizeFactText(exceptionText);
    return exceptionTerms.some(
      (term) => normalized.includes(term) || (term.endsWith("s") && normalized.includes(term.slice(0, -1)))
    );
  });
  const issues = [];

  if (answerModes.permission && sourceModes.prohibition && !sourceModes.permission) {
    issues.push("opening claim says allowed, but the relevant cited text says prohibited");
  }
  if (answerModes.prohibition && sourceModes.permission && !sourceModes.prohibition) {
    issues.push("opening claim says prohibited, but the relevant cited text says allowed");
  }
  if (answerModes.approvalNotRequired && sourceModes.approvalRequired && !sourceModes.approvalNotRequired) {
    issues.push("opening claim removes approval that the relevant cited text requires");
  }
  if (answerModes.approvalRequired && sourceModes.approvalNotRequired && !sourceModes.approvalRequired) {
    issues.push("opening claim requires approval that the relevant cited text says is unnecessary");
  }
  if (answerModes.optional && sourceModes.required && !sourceModes.optional) {
    issues.push("opening claim makes a required action optional");
  }
  if (answerModes.required && sourceModes.optional && !sourceModes.required) {
    issues.push("opening claim makes an optional action mandatory");
  }
  if (
    (answerModes.prohibition || /\b(?:all|always|every|never|no\s+\w+)\b/i.test(claim)) &&
    sourceModes.exception &&
    relevantException &&
    !claimModalities(answerFactText(answer)).exception
  ) {
    issues.push("opening claim omits an exception stated in the relevant cited text");
  }

  return issues;
}

function groundednessIssues(answer, sources = []) {
  const corpus = citedCorpus(sources);
  const answerFacts = answerFactText(answer);
  const issues = [];

  issues.push(...claimPolarityIssues(answer, sources));

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

function isGenericRetrievalDraft(draftAnswer) {
  return /\b(I found the closest matches|closest rulebook sections|appears to discuss this under|Fee-related rules appear|Utility-related rules appear|don't have enough rulebook evidence|don't have enough information|don't have enough detail|sections look relevant|closest starting points|closest matches)\b/i.test(
    answerFactText(draftAnswer)
  );
}

function missingDraftProperNounIssues(answer, draftAnswer) {
  if (isGenericRetrievalDraft(draftAnswer)) return [];
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
  claimModalities,
  claimPolarityIssues,
  dateTimePhrases,
  groundednessIssues,
  llmRewriteIssues,
  numericTokens,
  numberWordsToDigits,
  properNounPhrases,
  sectionReferences,
};
