const ACTION_REQUIREMENTS = [
  {
    id: "submit-or-apply",
    answerPattern: /\b(?:submit|complete|send)\b.{0,80}\b(?:application|form|request|plan|packet)\b|\bapply for\b/i,
    sourcePattern: /\b(?:submit|apply|application|form|document center|design review)\b/i,
  },
  {
    id: "book-or-reserve",
    answerPattern: /\bto (?:book|reserve|rent)\b|\b(?:book|reserve|rent) (?:it|online|the|a|an|your)\b/i,
    sourcePattern: /\b(?:book|booking|reserve|reservation|rent|rental|facility|amenit|civicrec|rec1)\b/i,
  },
  {
    id: "register",
    answerPattern: /\bregister(?:ed|ing|ation)?\b/i,
    sourcePattern: /\b(?:register|registration|calendar|event|program)\b/i,
  },
  {
    id: "download",
    answerPattern: /\bdownload\b/i,
    sourcePattern: /\b(?:download|document|pdf|form|packet)\b/i,
  },
];

function actionLinkIssues(answer = "", sources = []) {
  const linkedText = sources
    .filter((source) => /^https?:\/\//i.test(source?.sourceUrl || ""))
    .map((source) => `${source.title || ""} ${source.sourceUrl || ""} ${source.actionType || ""}`)
    .join(" ");

  return ACTION_REQUIREMENTS
    .filter((requirement) => requirement.answerPattern.test(answer))
    .filter((requirement) => !requirement.sourcePattern.test(linkedText))
    .map((requirement) => requirement.id);
}

module.exports = { ACTION_REQUIREMENTS, actionLinkIssues };
