const assert = require("node:assert/strict");
const test = require("node:test");

const { checkProject, fingerprint, inspectSource } = require("../scripts/check-community-resident-literals");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("resident literal guard permits generic evidence boundaries", () => {
  assert.deepEqual(inspectSource(`
    buildAnswerContract({ directAnswer: "I could not verify an answer from approved, up-to-date community sources." });
  `), []);
});

test("resident literal guard permits generic whole-sentence presentation and safety wrappers", () => {
  assert.deepEqual(inspectSource(`
    return {
      directAnswer: "I found a relevant official section, but I could not extract its current date, amount, or limit safely.",
      keyDetails: ["The official facility page is awaiting a fresh source check."],
      nextStep: "Open the linked official section if you need the complete wording.",
    };
  `), []);
});

test("resident literal guard keeps factual and community-specific fixed copy visible", () => {
  const findings = inspectSource(`
    return {
      directAnswer: "Sterling Ranch pool closes at 9:00 pm.",
      nextStep: "Call the CAB at 720-555-0199 to reserve the pool.",
    };
  `);
  assert.equal(findings.length, 2);
});

test("resident literal guard keeps named services and rule instructions visible", () => {
  const findings = inspectSource(`
    return {
      nextStep: "Use WasteConnect for your service address to see the next dated pickup and set a reminder.",
      directAnswer: "Shed utilities must be underground before approval.",
    };
  `);
  assert.equal(findings.length, 2);
});

test("resident literal guard ignores a ternary branch selector but retains its fixed reply", () => {
  const findings = inspectSource(`
    return { answer: reason === "person-identity" ? "Sterling Ranch staff directory is at https://example.test." : "Ask a question." };
  `);
  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.value !== "person-identity"));
});

test("resident literal guard ignores punctuation split from a dynamic reply", () => {
  assert.deepEqual(inspectSource('return { directAnswer: `${headline}. ${summary}` };'), []);
  const findings = inspectSource('return { directAnswer: "The pool closes at 9:00 pm." };');
  assert.equal(findings.length, 1);
});

test("resident literal guard rejects a new untested fixed answer family", () => {
  const findings = inspectSource(`
    if (intent === "mailbox") return { answer: "Mailboxes must be painted blue before Friday." };
  `);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].field, "answer");
});

test("resident literal guard rejects fixed contact, link, time, and amount values", () => {
  const findings = inspectSource(`
    return buildAnswerContract({ directAnswer: "Call 720-555-0199 or pay $25 at https://example.test by 9:00 am." });
  `);
  assert.equal(findings.length, 1);
});

test("resident literal guard rejects a Sterling-specific answer in a second-community path", () => {
  const findings = inspectSource(`
    if (profile.communityId === "ridgeview") return { directAnswer: "Sterling Ranch quiet hours begin at 10:00 pm." };
  `);
  assert.equal(findings.length, 1);
  assert.match(findings[0].value, /Sterling Ranch/);
});

test("resident literal guard inventories a new rule-focused canned answer", () => {
  const findings = inspectSource(`
    if (isHelipadQuery(query)) return helpfulAnswer("Helipads are prohibited after 8:00 pm.", sources, "Check the rules.");
  `);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].field, "directAnswer");
});

test("resident literal guard reaches helpfulAnswer calls after regular expressions", () => {
  const findings = inspectSource(`
    const matches = /pool\\s+hours/i.test(query);
    if (matches) return helpfulAnswer("The pool closes at 9:00 pm.", sources, "Check the pool page before you go.");
  `);
  assert.equal(findings.length, 2);
  assert.match(findings[0].value, /pool closes/);
});

test("resident literal guard reaches structuredHelpfulAnswer calls", () => {
  const findings = inspectSource(`
    return structuredHelpfulAnswer("The pool closes at 9:00 pm.", details, "Check the pool page before you go.");
  `);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].field, "directAnswer");
  assert.equal(findings[1].field, "nextStep");
});

test("resident literal guard permits generic dynamic presentation but retains factual dynamic replies", () => {
  assert.deepEqual(inspectSource('return { label: `Open ${source.title}` };'), []);
  const findings = inspectSource('return helpfulAnswer(`Parking is allowed after ${closingTime}.`, sources);');
  assert.equal(findings.length, 1);
  assert.match(findings[0].value, /Parking is allowed/);
});

test("resident literal guard permits the reviewed generic resource-navigation boundary", () => {
  assert.deepEqual(inspectSource('return helpfulAnswer("The official material I found does not explicitly confirm whether the requested list exists, so I won\'t treat a search miss as proof that it is unavailable.", sources, "Open the linked official source to confirm the current resource.");'), []);
});

test("per-node baselines allow unrelated edits and removal but reject changed or new copy", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "resident-literal-guard-"));
  const sourcePath = path.join(root, "lib", "fixture.js");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  const fixed = "Mailboxes must be painted blue.";
  const baseline = { findings: [{ filename: "lib/fixture.js", field: "answer", fingerprint: fingerprint({ filename: "lib/fixture.js", field: "answer", value: fixed }) }] };
  fs.mkdirSync(path.join(root, "data"));
  fs.writeFileSync(path.join(root, "data", "community-resident-literal-baseline.json"), JSON.stringify(baseline));
  fs.writeFileSync(sourcePath, `const unused = 1; return { answer: ${JSON.stringify(fixed)} };`);
  const original = require("../scripts/check-community-resident-literals").RESPONSE_FILES.splice(0);
  const files = require("../scripts/check-community-resident-literals").RESPONSE_FILES;
  files.splice(0, files.length, "lib/fixture.js");
  assert.equal(checkProject(root), true, "unrelated code may change");
  fs.writeFileSync(sourcePath, "const unused = 2; return {}; ");
  assert.equal(checkProject(root), true, "debt removal may proceed");
  fs.writeFileSync(sourcePath, 'return { answer: "Mailboxes must be painted green." };');
  assert.equal(checkProject(root), false, "changed debt must fail");
  fs.writeFileSync(sourcePath, 'return { answer: "Helipads are prohibited after 8:00 pm." };');
  assert.equal(checkProject(root), false, "new debt must fail");
  files.splice(0, files.length, ...original);
  fs.rmSync(root, { recursive: true, force: true });
});

test("per-node baselines reject a duplicated existing literal and an indirect answer", () => {
  const fixed = "Mailboxes must be painted blue.";
  const first = inspectSource(`return { answer: ${JSON.stringify(fixed)} };`, "lib/fixture.js")[0];
  const baseline = new Set([fingerprint(first)]);
  const duplicate = inspectSource(`if (intent === "mailbox") return { answer: ${JSON.stringify(fixed)} }; return { answer: ${JSON.stringify(fixed)} };`, "lib/fixture.js");
  assert.equal(duplicate.filter((finding) => baseline.has(fingerprint(finding))).length, 2);
  const indirect = inspectSource(`const answer = ${JSON.stringify(fixed)}; return { answer };`, "lib/fixture.js");
  assert.equal(indirect.length, 1);
  assert.equal(indirect[0].value, fixed);
});
