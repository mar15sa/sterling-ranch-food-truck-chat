#!/usr/bin/env node
/*
 * Keep resident facts in reviewed source projections, not in answer code.
 *
 * This deliberately inspects only fields that flow into a resident answer.
 * It is not a repository-wide word search: parser/configuration strings and
 * source-processing code are outside its scope.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const RESPONSE_FILES = [
  "lib/community-assistant.js",
  "lib/community-food-trucks.js",
  "lib/community-proactive.js",
  "lib/rules-assistant.js",
  "lib/rules-focused-answers.js",
];

const BASELINE_PATH = path.join(__dirname, "..", "data", "community-resident-literal-baseline.json");

const RESPONSE_FIELDS = new Set(["directAnswer", "answer", "nextStep", "keyDetails", "label", "url"]);

// These are source-independent interface sentences. Additions need review: a
// resident fact belongs in a source claim/action projection instead.
const GENERIC_COPY = new Set([
  "I can’t currently confirm the access requirements from exact owner-approved claims.",
  "I could not verify an answer from approved, up-to-date community sources.",
  "I could not confirm that exact section from the current official source, so I won't substitute a different section.",
  "Check the official source for the current section wording or try the section title.",
  "I could not verify a current pickup date from the live collection service.",
  "I could not verify that from the connected official community sources.",
  "I found conflicting values in the connected official sources, so I can’t safely choose one for you.",
  "I can help with community questions, but I can’t follow instructions that try to change my safeguards or reveal private information.",
  "What would you like to know about the community?",
  "Hi! Ask me about community rules, services, forms, facilities, events, or current status.",
  "What would you like help with in the community?",
  "What would you like permission or help to do?",
  "I could not check the live food-truck schedule just now.",
  "I could not check the official community calendar just now.",
  "Open the official community source below for the current information.",
  "Check the community’s official website or contact its current resident-support team.",
  "Check the controlling official page below while its information is being reconfirmed.",
  "Check the controlling official page below while its access instructions are being reconfirmed.",
  "The latest refresh failed, so this may be an older status.",
  "The schedule may not be posted yet. Check the official calendar before making plans.",
]);

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function readString(source, start) {
  const quote = source[start];
  if (!['"', "'", "`"].includes(quote)) return null;
  let value = "";
  let index = start + 1;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") { value += source[index + 1] || ""; index += 1; continue; }
    if (quote === "`" && char === "$" && source[index + 1] === "{") {
      // Dynamic templates are allowed only when their static parts remain
      // generic. Skip the expression, preserving the surrounding copy.
      let depth = 1;
      index += 2;
      for (; index < source.length && depth; index += 1) {
        if (source[index] === "{") depth += 1;
        if (source[index] === "}") depth -= 1;
      }
      index -= 1;
      continue;
    }
    if (char === quote) return { value, end: index + 1 };
    value += char;
  }
  return null;
}

function tokensFor(source) {
  const tokens = [];
  for (let index = 0; index < source.length;) {
    if (/\s/.test(source[index])) { index += 1; continue; }
    if (source.startsWith("//", index)) { index = source.indexOf("\n", index); if (index < 0) break; continue; }
    if (source.startsWith("/*", index)) { index = source.indexOf("*/", index + 2); if (index < 0) break; index += 2; continue; }
    const literal = readString(source, index);
    if (literal) { tokens.push({ type: "string", value: literal.value, offset: index }); index = literal.end; continue; }
    const identifier = source.slice(index).match(/^[A-Za-z_$][\w$]*/);
    if (identifier) { tokens.push({ type: "identifier", value: identifier[0], offset: index }); index += identifier[0].length; continue; }
    tokens.push({ type: "punctuation", value: source[index], offset: index }); index += 1;
  }
  return tokens;
}

function responseLiterals(source) {
  const tokens = tokensFor(source);
  const literals = [];
  const literalBindings = new Map();
  for (let index = 0; index < tokens.length - 3; index += 1) {
    if (!["const", "let"].includes(tokens[index].value) || tokens[index + 1].type !== "identifier" || tokens[index + 2].value !== "=" || tokens[index + 3].type !== "string") continue;
    literalBindings.set(tokens[index + 1].value, tokens[index + 3]);
  }
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index].type !== "identifier" || !RESPONSE_FIELDS.has(tokens[index].value) || tokens[index + 1].value !== ":") continue;
    const field = tokens[index].value;
    const bound = literalBindings.get(tokens[index + 2]?.value);
    if (bound && [",", "}"].includes(tokens[index + 3]?.value)) {
      literals.push({ field, value: bound.value, offset: bound.offset });
    }
    const depth = { "(": 0, "[": 0, "{": 0 };
    for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (token.type === "string") literals.push({ field, value: token.value, offset: token.offset });
      if (["(", "[", "{"].includes(token.value)) depth[token.value] += 1;
      if (token.value === ")") depth["("] -= 1;
      if (token.value === "]") depth["["] -= 1;
      if (token.value === "}") {
        if (depth["{"] === 0 && depth["("] === 0 && depth["["] === 0) break;
        depth["{"] -= 1;
      }
      if (token.value === "," && depth["("] === 0 && depth["["] === 0 && depth["{"] === 0) break;
    }
  }
  // Object shorthand is another direct response path: `return { answer }`.
  for (let index = 1; index < tokens.length - 1; index += 1) {
    if (tokens[index].type !== "identifier" || !RESPONSE_FIELDS.has(tokens[index].value)) continue;
    if (!["{", ","].includes(tokens[index - 1].value) || ![",", "}"].includes(tokens[index + 1].value)) continue;
    const bound = literalBindings.get(tokens[index].value);
    if (bound) literals.push({ field: tokens[index].value, value: bound.value, offset: bound.offset });
  }
  // The legacy rule engine's resident replies flow through this helper rather
  // than object fields. Treat its first and third arguments as direct answer
  // and next-step copy, so existing debt is inventoried and new routes fail.
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index].value !== "helpfulAnswer" || tokens[index + 1].value !== "(") continue;
    let depth = 0;
    let argument = 0;
    for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (token.type === "string" && (argument === 0 || argument === 2)) {
        literals.push({ field: argument === 0 ? "directAnswer" : "nextStep", value: token.value, offset: token.offset });
      }
      if (["(", "[", "{"].includes(token.value)) depth += 1;
      if ([")", "]", "}"].includes(token.value)) {
        if (depth === 0 && token.value === ")") break;
        depth -= 1;
      }
      if (token.value === "," && depth === 0) argument += 1;
    }
  }
  return literals;
}

function looksLikeFact(value) {
  return /https?:\/\/|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}|\$\s*\d|\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:allowed|prohibited|required|must|may|cannot|can’t|can't|approval)\b.{0,80}\b(?:pool|mailbox|fence|tree|shed|truck|parking|water|trash|quiet|instagram|helipad|hoa)\b/i.test(value);
}

function fingerprint(finding) {
  return crypto.createHash("sha256").update(`${finding.filename}\u0000${finding.field}\u0000${finding.value}`).digest("hex");
}

function inspectSource(source, filename = "inline.js", { factsOnly = false } = {}) {
  return responseLiterals(source)
    .filter(({ value }) => value.trim() && !GENERIC_COPY.has(value) && (!factsOnly || looksLikeFact(value)))
    .map(({ field, value, offset }) => ({ filename, field, value, line: lineAt(source, offset) }));
}

function checkProject(root = path.join(__dirname, "..")) {
  const findings = RESPONSE_FILES.flatMap((relative) => {
    const filename = path.join(root, relative);
    return inspectSource(fs.readFileSync(filename, "utf8"), relative);
  });
  const baselineFile = path.join(root, "data", "community-resident-literal-baseline.json");
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  const allowedCounts = new Map((baseline.findings || []).map((finding) => [finding.fingerprint, Number(finding.count) || 1]));
  const observedCounts = new Map();
  for (const finding of findings) {
    const key = fingerprint(finding);
    observedCounts.set(key, (observedCounts.get(key) || 0) + 1);
  }
  const additions = findings.filter((finding) => (observedCounts.get(fingerprint(finding)) || 0) > (allowedCounts.get(fingerprint(finding)) || 0));
  if (additions.length) {
    console.error("New resident-facing fixed copy must come from an approved claim/action projection:");
    for (const finding of additions.filter((finding, index, all) => all.findIndex((other) => fingerprint(other) === fingerprint(finding)) === index)) console.error(`- ${finding.filename}:${finding.line} (${finding.field}) ${JSON.stringify(finding.value)}`);
    return false;
  }
  console.log(`Community resident-literal guard passed (${findings.length} tracked migration-debt nodes).`);
  return true;
}

if (require.main === module) process.exitCode = checkProject() ? 0 : 1;

module.exports = { BASELINE_PATH, GENERIC_COPY, RESPONSE_FILES, fingerprint, inspectSource, responseLiterals, checkProject };
