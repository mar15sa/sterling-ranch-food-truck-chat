const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFParse } = require("pdf-parse");

const DEFAULT_SUPPLEMENTS_PATH = path.join(__dirname, "..", "data", "rules-supplements.json");
const DEFAULT_OUTPUT_PATH = path.join(__dirname, "..", "data", "rules-supplement-sections.json");
const MAX_CHUNK_CHARS = 5200;

function parseArgs(argv) {
  const options = {
    outputPath: DEFAULT_OUTPUT_PATH,
    supplementsPath: DEFAULT_SUPPLEMENTS_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--supplements" && next) {
      options.supplementsPath = path.resolve(next);
      index += 1;
    } else if (arg === "--output" && next) {
      options.outputPath = path.resolve(next);
      index += 1;
    }
  }

  return options;
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collapseWhitespace(value = "") {
  return cleanText(value).replace(/\s+/g, " ").trim();
}

function slug(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "section";
}

function hashText(value = "") {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function sourceUrlForSupplement(document) {
  if (document.sourceUrl) return document.sourceUrl;
  const id = Array.isArray(document.documentCenterIds) ? document.documentCenterIds[0] : "";
  return id ? `https://sterlingranchcab.com/DocumentCenter/View/${id}` : "";
}

async function extractOfficialText(document) {
  const sourceUrl = sourceUrlForSupplement(document);
  if (!sourceUrl) {
    return {
      extractionStatus: "missing-source-url",
      text: document.text || "",
    };
  }

  try {
    const parser = new PDFParse({ url: sourceUrl });
    const result = await parser.getText();
    await parser.destroy();
    const text = cleanText(result.text || "");
    if (text.length >= 200) {
      return {
        extractionStatus: "official-pdf",
        text,
      };
    }
  } catch (error) {
    return {
      extractionError: error && error.message ? error.message : String(error),
      extractionStatus: "fallback-summary",
      text: document.text || "",
    };
  }

  return {
    extractionStatus: "fallback-summary",
    text: document.text || "",
  };
}

function makeTextChunks(text, maxChars = MAX_CHUNK_CHARS) {
  const paragraphs = cleanText(text)
    .split(/\n{2,}|\n(?=(?:Section|Sec\.|Table|Exhibit|ARTICLE|Article)\b)/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs.length ? paragraphs : [cleanText(text)]) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if (`${current}\n\n${paragraph}`.length <= maxChars) {
      current = `${current}\n\n${paragraph}`;
      continue;
    }

    chunks.push(current);
    current = paragraph;
  }

  if (current) chunks.push(current);

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk];
    const parts = [];
    for (let index = 0; index < chunk.length; index += maxChars) {
      parts.push(chunk.slice(index, index + maxChars));
    }
    return parts;
  });
}

function sectionPatternFor(reference) {
  const match = String(reference || "").match(/\b(\d+)\s*[-.]\s*(\d+[a-z]?)(.*)$/i);
  if (!match) return null;
  const base = `${match[1]}[-.]${match[2]}`;
  const rest = match[3] || "";
  const parts = [...rest.matchAll(/\(([a-z0-9]+)\)/gi)].map((part) => part[1]);
  const subsection = parts.map((part) => `\\s*\\(\\s*${part}\\s*\\)`).join("");
  return new RegExp(`\\b(?:Section|Sec\\.?|Table)?\\s*${base}${subsection}`, "i");
}

function chunkMentionsReference(chunk, reference) {
  const pattern = sectionPatternFor(reference);
  if (!pattern) return false;
  return pattern.test(chunk);
}

function sectionLabelFor(document, reference, chunkIndex, matchingReferences) {
  if (matchingReferences.length) return matchingReferences.join(", ");
  if (reference) return reference;
  return `official text part ${chunkIndex + 1}`;
}

function sectionRecordsForSupplement(document, extracted) {
  const fullText = cleanText(extracted.text || document.text || "");
  const references = [
    ...new Set(
      [
        ...(Array.isArray(document.replacesSections) ? document.replacesSections : []),
        document.replacesSection,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ),
  ];
  const chunks = makeTextChunks(fullText);
  const fullHash = hashText(fullText);

  return chunks.map((chunk, chunkIndex) => {
    const matchingReferences = references.filter((reference) =>
      chunkMentionsReference(chunk, reference)
    );
    const sectionLabel = sectionLabelFor(document, "", chunkIndex, matchingReferences);
    const chunkId = `${document.id || document.nodeId}::official-text::${chunkIndex + 1}`;

    return {
      id: chunkId,
      nodeId: `${document.nodeId || slug(document.id)}__OFFICIAL_TEXT_${chunkIndex + 1}`,
      parentSupplementId: document.id || "",
      title: document.title || "Official CAB supplement",
      chapter: document.chapter || "Official CAB document supplement",
      article: [document.article, sectionLabel].filter(Boolean).join(" - "),
      path: [
        ...(Array.isArray(document.path) ? document.path : ["Official CAB document supplements"]),
        sectionLabel,
      ],
      sourceUrl: sourceUrlForSupplement(document),
      sourceName: document.sourceName || document.title || "",
      approvedDate: document.approvedDate || "",
      effectiveDate: document.effectiveDate || document.approvedDate || "",
      effectiveYear: document.effectiveYear || "",
      documentCenterIds: Array.isArray(document.documentCenterIds) ? document.documentCenterIds : [],
      sourcePriority: Number(document.sourcePriority) || 120,
      replacesSection: document.replacesSection || "",
      replacesSections: references,
      currentForTopics: Array.isArray(document.currentForTopics) ? document.currentForTopics : [],
      requiredCoveragePhrases: Array.isArray(document.requiredCoveragePhrases)
        ? document.requiredCoveragePhrases
        : [],
      supersedesConflictingPhrases: Array.isArray(document.supersedesConflictingPhrases)
        ? document.supersedesConflictingPhrases
        : [],
      autoSupersedeSections: document.autoSupersedeSections,
      searchable: document.searchable,
      supersededBy: document.supersededBy || "",
      isSupplementSection: true,
      extractionStatus: extracted.extractionStatus,
      extractionError: extracted.extractionError || "",
      sourceTextHash: fullHash,
      chunkHash: hashText(chunk),
      text: collapseWhitespace(chunk),
      summaryText: document.text || "",
    };
  });
}

async function buildSupplementSections(options) {
  const supplements = JSON.parse(await fs.readFile(options.supplementsPath, "utf8"));
  if (!Array.isArray(supplements)) {
    throw new Error("rules supplements file must be an array.");
  }

  const records = [];
  for (const document of supplements) {
    if (!document?.id) continue;
    const extracted = await extractOfficialText(document);
    records.push(...sectionRecordsForSupplement(document, extracted));
  }

  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(options.outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  return records;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const records = await buildSupplementSections(options);
  console.log(`Wrote ${records.length} official supplement section chunk(s) to ${options.outputPath}.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildSupplementSections,
  cleanText,
  hashText,
  makeTextChunks,
  sectionRecordsForSupplement,
};
