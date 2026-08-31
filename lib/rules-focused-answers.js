const { isPlantListQuestion } = require("./rules-intent");

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function combinedSourceText(sources = []) {
  return sources.map((source) => source.text || source.excerpt || "").join("\n");
}

function isPrivateSportCourtQuery(query = "") {
  return /\b(?:build|construct|install|add|put|create|private|backyard|rear yard|on my (?:lot|property)|at my (?:home|house))\b/i.test(query);
}

function titleCasePlantName(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bTm\b/g, "")
    .trim();
}

function treeExamplesFromSection(text = "", headingPattern, nextHeadingPattern, limit = 4) {
  const start = text.search(headingPattern);
  if (start < 0) return [];
  const afterStart = text.slice(start);
  const next = afterStart.slice(1).search(nextHeadingPattern);
  const section = next >= 0 ? afterStart.slice(0, next + 1) : afterStart;
  const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerEnd = lines.findIndex((line) => /^Bird Friendly$/i.test(line));
  const body = headerEnd >= 0 ? lines.slice(headerEnd + 1) : lines;
  const examples = [];
  let row = [];

  for (const line of body) {
    if (/^\d+(?:\.\d+)?(?:'|")\s*x\s*\d/i.test(line)) {
      if (row.length >= 2) {
        // The first line is the botanical name in the Municode table. The
        // remaining line(s) form the resident-friendly common name.
        const commonName = titleCasePlantName(row.slice(1).join(" "));
        if (commonName && commonName.length <= 70 && !examples.includes(commonName)) {
          examples.push(commonName);
        }
      }
      row = [];
      if (examples.length >= limit) break;
      continue;
    }
    if (/^(?:Evergreen|Ornamental|Deciduous|Shrub|Perennial|Grass|Rose|Vine|✓)$/i.test(line)) {
      row = [];
      continue;
    }
    row.push(line);
  }

  return examples;
}

function approvedTreeExamples(text = "") {
  return {
    low: treeExamplesFromSection(text, /\(1\)\s*Low water need trees\./i, /\(2\)\s*Low water need shrubs/i, 5),
    moderate: treeExamplesFromSection(text, /\(3\)\s*Moderate water need trees\./i, /\(4\)\s*Moderate water need shrubs/i, 3),
    high: treeExamplesFromSection(text, /\(5\)\s*High water need trees\./i, /Rules of/i, 2),
  };
}

function focusedTopicAnswer(query, sources, formatAnswer) {
  const text = combinedSourceText(sources);

  if (/\b(?:pickle ?ball|sport court)\b/i.test(query)) {
    if (isPrivateSportCourtQuery(query)) {
      if (!/Sport courts[\s\S]{0,700}?pickleball/i.test(text)) return "";
      return formatAnswer(
        "A private pickleball or other sport court requires DRC approval, and the court may not be lighted.",
        [
          "The submittal must show the court on the lot, setbacks, proposed safety fencing, colors, and materials.",
          "The rule covers pickleball along with basketball, volleyball, tennis, shuffleboard, and similar sport surfaces.",
        ],
        "Submit the complete court plan to the DRC before construction."
      );
    }

    if (!sources.some((source) => /^Sec\. 17-54\./i.test(source.title || ""))) return "";
    const parkHoursMatch = text.match(/Parks and Open Space are open from\s+(\d{1,2}:\d{2}\s*a\.m\.)\s+to\s+(\d{1,2}:\d{2}\s*p\.m\.)/i);
    const parkHours = parkHoursMatch ? `${parkHoursMatch[1]} to ${parkHoursMatch[2]}` : "";
    return formatAnswer(
      "If you mean Sterling Ranch’s neighborhood pickleball courts, the rulebook does not publish pickleball-specific play or reservation rules. The general park and facility rules apply.",
      [
        parkHours ? `Parks and open spaces are generally open from ${cleanText(parkHours)} daily.` : "Use the current general park hours in the linked rule.",
        "Facility hours and temporary closures may change and are posted on the CAB website and at the facility.",
        "If you meant building a private court at your home, that is a separate rule: DRC approval is required and private courts may not be lighted.",
      ],
      "Follow the hours and rules posted at the court; use the CAB’s current facility information for reservations or temporary closures."
    );
  }

  if (/\bflag\s*poles?\b/i.test(query) && sources.some((source) => /flags|flagpoles|cab code amendments/i.test(source.title || ""))) {
    const asksHeight = /\b(?:height|high|tall|maximum|max)\b/i.test(query);
    const flagSize = cleanText(text.match(/No flag shall exceed\s+([^.]+?)\s+in size/i)?.[1] || "");
    return formatAnswer(
      asksHeight
        ? "The current rule does not set a numeric maximum height for a freestanding flagpole. The pole requires DRC approval."
        : "A freestanding flagpole requires DRC approval.",
      [
        flagSize ? `The ${flagSize} limit applies to the flag itself, not the height of the pole.` : "The flag-size rule is separate from the pole-height question.",
        "Separate nighttime illumination of a flag also requires DRC approval.",
        "Flags mounted on the front of a home have additional restrictions in the community standards, and commercial-message flags are prohibited.",
      ],
      "Ask the DRC to confirm the allowable pole height, placement, and any lighting for your lot before purchasing or installing one."
    );
  }

  if (isPlantListQuestion(query) && /preapproved plant list/i.test(`${sources[0]?.title || ""} ${text}`)) {
    const examples = approvedTreeExamples(text);
    const findings = [];
    if (examples.low.length) findings.push(`Low-water examples: ${examples.low.join(", ")}.`);
    if (examples.moderate.length) findings.push(`Moderate-water examples: ${examples.moderate.join(", ")}.`);
    if (examples.high.length) findings.push(`Higher-water examples: ${examples.high.join(", ")}.`);
    findings.push("The rulebook encourages lower-water species, and the DRC may consider plants that are not on the preapproved list.");
    return formatAnswer(
      "Yes. Section 5-131 contains Sterling Ranch’s preapproved and recommended plant list for trees, shrubs, grasses, and perennials, grouped by water need.",
      findings,
      "Use the linked Sec. 5-131 list and the standards for your village and planting location before choosing a tree; mature size and placement still matter."
    );
  }

  if (/\b(?:ornament|ornaments|yard art|lawn decoration|decorative object|decorative objects|garden statue|statue|statues)\b/i.test(query) && /Outdoor Decorative Objects/i.test(text)) {
    const frontCount = cleanText(text.match(/no more than\s+([a-z]+(?:\s*\(\d+\))?)\s+ornaments/i)?.[1] || "");
    const frontSize = cleanText(text.match(/Cannot exceed\s+([0-9]+\s+inches)\s+in height or width/i)?.[1] || "");
    const rearHeight = cleanText(text.match(/rear yard[\s\S]{0,220}?ornamentation does not exceed\s+([a-z]+(?:\s*\(\d+\))?\s+feet)\s+in height/i)?.[1] || "");
    if (!frontCount || !frontSize || !rearHeight) return "";
    return formatAnswer(
      "Yard art is allowed without DRC approval when it stays within the current front- or rear-yard limits.",
      [
        `Front yard: no more than ${frontCount.replace(/\s*\(\d+\)/, "")} ornaments, placed on the ground, each no taller or wider than ${frontSize}, and integrated into the landscape design.`,
        `Rear yard: lawn or yard ornaments up to ${rearHeight.replace(/\s*\(\d+\)/, "")} tall do not require approval.`,
        "DRC approval is required when a front- or rear-yard object exceeds the applicable limits.",
      ],
      "If your proposed object is larger, elevated, or part of a group exceeding these limits, confirm it with the DRC before placing it."
    );
  }

  return "";
}

module.exports = {
  approvedTreeExamples,
  focusedTopicAnswer,
  isPrivateSportCourtQuery,
};
