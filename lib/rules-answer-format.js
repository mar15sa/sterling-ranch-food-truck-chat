function capitalizeFirstLetter(text = "") {
  return String(text || "").replace(/^(\s*)([a-z])/, (_, space, letter) => `${space}${letter.toUpperCase()}`);
}

function structuredHelpfulAnswer(shortAnswer, findings, nextStep = "") {
  const lines = [`Short answer: ${shortAnswer}`];
  const usefulFindings = findings.filter(Boolean).slice(0, 3);
  if (usefulFindings.length) lines.push("", "What I found:", ...usefulFindings.map((finding) => `- ${finding}`));
  if (nextStep) lines.push("", `Before you act: ${capitalizeFirstLetter(nextStep)}`);
  return lines.join("\n");
}

function readableList(items) {
  const clean = items.filter(Boolean);
  if (!clean.length) return "the matching sections";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function shortAnswerSummary(answer = "") {
  return String(answer || "")
    .replace(/^Short answer:\s*/i, "")
    .split(/\n\s*\n(?:What I found|Before you act):/i)[0]
    .trim();
}

module.exports = { capitalizeFirstLetter, readableList, shortAnswerSummary, structuredHelpfulAnswer };
