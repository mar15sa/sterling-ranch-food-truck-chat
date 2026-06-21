const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { PDFParse } = require("pdf-parse");

const execFileAsync = promisify(execFile);
const AUDIT_SCRIPT = path.join(__dirname, "audit-rule-supplements.js");
const DEFAULT_OUTPUT_DIR = path.join(__dirname, "..", "data", "rules-supplement-proposals");

function parseArgs(argv) {
  const options = {
    auditArgs: [],
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--output-dir" && next) {
      options.outputDir = path.resolve(next);
      index += 1;
      continue;
    }
    options.auditArgs.push(arg);
    if (/^--(from|to|lookahead|concurrency)$/.test(arg) && next) {
      options.auditArgs.push(next);
      index += 1;
    }
  }

  return options;
}

function cleanText(value = "") {
  return String(value || "").replace(/\r/g, "").replace(/\s+\n/g, "\n").trim();
}

function hashText(value = "") {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function runAudit(auditArgs) {
  const args = [AUDIT_SCRIPT, ...auditArgs.filter((arg) => arg !== "--json"), "--json"];
  const { stdout } = await execFileAsync(process.execPath, args, {
    cwd: path.join(__dirname, ".."),
    maxBuffer: 1024 * 1024 * 8,
  });
  return JSON.parse(stdout);
}

async function extractTextFromCandidate(candidate) {
  try {
    const parser = new PDFParse({ url: candidate.url });
    const result = await parser.getText();
    await parser.destroy();
    return {
      extractionStatus: "official-pdf",
      text: cleanText(result.text || ""),
    };
  } catch (error) {
    return {
      extractionError: error && error.message ? error.message : String(error),
      extractionStatus: "failed",
      text: "",
    };
  }
}

function proposedSectionMappings(candidate, text) {
  const combined = `${candidate.title || ""}\n${text || ""}`;
  const refs = new Set();
  const patterns = [
    /\b(?:Section|Sec\.?|Table)\s+(\d+\s*[-.]\s*\d+[a-z]?(?:\s*\([a-z0-9]+\))*)/gi,
    /\b(\d+\s*[-.]\s*\d+[a-z]?(?:\s*\([a-z0-9]+\))*)\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of combined.matchAll(pattern)) {
      refs.add(match[1].replace(/\s+/g, "").replace(".", "-"));
    }
  }

  return [...refs].slice(0, 25);
}

function proposalForCandidate(candidate, extracted) {
  const text = extracted.text || "";
  return {
    status: "needs-human-review",
    generatedAt: new Date().toISOString(),
    instructions:
      "Review the extracted official text, decide whether this updates current resident-facing answers, then move approved content into data/rules-supplements.json and regenerate data/rules-supplement-sections.json.",
    documentCenterId: String(candidate.id || ""),
    title: candidate.title || "",
    sourceUrl: candidate.url || "",
    approvedDate: candidate.approvedDate || "",
    reasons: candidate.reasons || [],
    extractionStatus: extracted.extractionStatus,
    extractionError: extracted.extractionError || "",
    sourceTextHash: text ? hashText(text) : "",
    proposedReplacesSections: proposedSectionMappings(candidate, text),
    draftSupplementRecord: {
      id: `supplement-${String(candidate.id || "new")}`,
      nodeId: `SUPPLEMENT_${String(candidate.id || "NEW")}`,
      title: candidate.title || "",
      chapter: "Official CAB document supplement",
      article: candidate.approvedDate ? `Approved ${candidate.approvedDate}` : "",
      path: ["Official CAB document supplements", candidate.title || ""],
      sourceUrl: candidate.url || "",
      sourceName: candidate.title || "",
      approvedDate: candidate.approvedDate || "",
      effectiveDate: candidate.approvedDate || "",
      documentCenterIds: [String(candidate.id || "")].filter(Boolean),
      sourcePriority: 240,
      replacesSections: proposedSectionMappings(candidate, text),
      requiredCoveragePhrases: [],
      text: "",
    },
    extractedText: text,
  };
}

async function writeProposals(report, outputDir) {
  const candidates = Array.isArray(report.candidates) ? report.candidates : [];
  if (!candidates.length) {
    console.log("No new supplement candidates found; no proposal files written.");
    return [];
  }

  await fs.mkdir(outputDir, { recursive: true });
  const written = [];
  for (const candidate of candidates) {
    const extracted = await extractTextFromCandidate(candidate);
    const proposal = proposalForCandidate(candidate, extracted);
    const filePath = path.join(outputDir, `document-${candidate.id}.json`);
    await fs.writeFile(filePath, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
    written.push(filePath);
  }

  return written;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runAudit(options.auditArgs);
  const written = await writeProposals(report, options.outputDir);
  if (written.length) {
    console.log(`Wrote ${written.length} rule supplement proposal file(s):`);
    written.forEach((filePath) => console.log(`- ${filePath}`));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  proposalForCandidate,
  proposedSectionMappings,
  runAudit,
  writeProposals,
};
