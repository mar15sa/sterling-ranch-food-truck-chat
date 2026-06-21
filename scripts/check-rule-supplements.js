const fs = require("node:fs/promises");
const path = require("node:path");

const SUPPLEMENTS_PATH = path.join(__dirname, "..", "data", "rules-supplements.json");
const SUPPLEMENT_SECTIONS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "rules-supplement-sections.json"
);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function hasCoveragePhrase(document, sections, phrase) {
  const matchingSections = sections.filter(
    (section) => section.parentSupplementId === document.id
  );
  const haystack = normalize(
    [
      document.title,
      document.chapter,
      document.article,
      document.sourceName,
      document.text,
      ...matchingSections.map((section) => section.text),
    ]
      .filter(Boolean)
      .join(" ")
  );
  return haystack.includes(normalize(phrase));
}

function listIsPopulated(value) {
  return Array.isArray(value) && value.some((item) => String(item || "").trim());
}

async function main() {
  const supplements = await readJson(SUPPLEMENTS_PATH, []);
  const sections = await readJson(SUPPLEMENT_SECTIONS_PATH, []);
  const failures = [];

  if (!Array.isArray(supplements)) {
    throw new Error("data/rules-supplements.json must be an array.");
  }
  if (!Array.isArray(sections)) {
    throw new Error("data/rules-supplement-sections.json must be an array.");
  }

  for (const document of supplements) {
    const label = document.title || document.id || "(untitled supplement)";
    const isCurrent = document.searchable !== false;

    if (!document.id) failures.push(`${label}: missing id.`);
    if (!document.sourceUrl) failures.push(`${label}: missing official sourceUrl.`);
    if (!listIsPopulated(document.documentCenterIds)) {
      failures.push(`${label}: missing documentCenterIds.`);
    }
    if (!document.approvedDate) failures.push(`${label}: missing approvedDate.`);
    if (!document.effectiveDate) failures.push(`${label}: missing effectiveDate.`);

    if (!isCurrent) continue;

    const matchingSections = sections.filter(
      (section) => section.parentSupplementId === document.id && section.searchable !== false
    );
    if (!matchingSections.length) {
      failures.push(`${label}: missing official extracted supplement section chunks.`);
    }

    const officialPdfSections = matchingSections.filter(
      (section) => section.extractionStatus === "official-pdf"
    );
    if (!officialPdfSections.length) {
      failures.push(`${label}: no supplement section chunk has official-pdf extractionStatus.`);
    }

    if (!listIsPopulated(document.replacesSections) && !listIsPopulated(document.currentForTopics)) {
      failures.push(
        `${label}: current supplements must declare replacesSections or currentForTopics.`
      );
    }

    if (!listIsPopulated(document.requiredCoveragePhrases)) {
      failures.push(`${label}: current supplements must declare requiredCoveragePhrases.`);
      continue;
    }

    for (const phrase of document.requiredCoveragePhrases) {
      if (!hasCoveragePhrase(document, sections, phrase)) {
        failures.push(`${label}: missing required coverage phrase "${phrase}".`);
      }
    }
  }

  if (failures.length) {
    console.error(`Rule supplement coverage check failed: ${failures.length} issue(s).`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log(`Rule supplement coverage check passed for ${supplements.length} supplement records.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
