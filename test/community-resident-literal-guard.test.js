const assert = require("node:assert/strict");
const test = require("node:test");

const { inspectSource } = require("../scripts/check-community-resident-literals");

test("resident literal guard permits generic evidence boundaries", () => {
  assert.deepEqual(inspectSource(`
    buildAnswerContract({ directAnswer: "I could not verify an answer from approved, up-to-date community sources." });
  `), []);
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
