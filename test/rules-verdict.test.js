const test = require("node:test");
const assert = require("node:assert/strict");

const { deriveAnswerVerdict } = require("../lib/rules-verdict");

const supported = { canAnswer: true };

test("mixed pet answer remains allowed when later restrictions are present", () => {
  assert.equal(
    deriveAnswerVerdict(
      "Short answer: Yes, household pets such as cats and dogs are allowed. Commercial kennels are prohibited.",
      supported
    ),
    "allowed"
  );
});

test("prohibition and approval answers receive explicit verdicts", () => {
  assert.equal(
    deriveAnswerVerdict("Short answer: Backyard chickens are not allowed.", supported),
    "prohibited"
  );
  assert.equal(
    deriveAnswerVerdict("Short answer: Chickens aren't allowed.", supported),
    "prohibited"
  );
  assert.equal(
    deriveAnswerVerdict("Short answer: A greenhouse requires DRC approval.", supported),
    "conditional"
  );
  assert.equal(
    deriveAnswerVerdict(
      "Short answer: Yes, but you need DRC approval before building a backyard shed.",
      supported
    ),
    "conditional"
  );
  assert.equal(
    deriveAnswerVerdict(
      "Short answer: Most landscaping is allowed, but landscape plans need DRC review.",
      supported
    ),
    "conditional"
  );
  assert.equal(deriveAnswerVerdict("Short answer: No. This use is prohibited.", supported), "prohibited");
});

test("unsupported answers are always unverified", () => {
  assert.equal(deriveAnswerVerdict("Yes.", { canAnswer: false }), "unverified");
});
