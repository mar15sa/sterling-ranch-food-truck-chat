const test = require("node:test");
const assert = require("node:assert/strict");

const { answerRulesQuestion } = require("../lib/rules-assistant");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const storedCommunityIndex = require("../data/community-index.json");
// Public-example regression tests verify answer behavior, not wall-clock source
// freshness. The live source monitor covers expiration separately, so keep this
// fixture current instead of letting the test change merely because a day passed.
const communityIndex = {
  ...storedCommunityIndex,
  sources: (storedCommunityIndex.sources || []).map((source) => ({
    ...source,
    staleAfter: "2099-01-01T00:00:00.000Z",
  })),
};

const EXAMPLES = [
  {
    question: "Can I build a shed in my backyard?",
    verdict: "conditional",
    includes: ["DRC approval", "150 square feet", "Utilities must run underground"],
  },
  {
    question: "When can I put up holiday lights?",
    verdict: "allowed",
    includes: ["June 18", "July 7", "October 1", "January 31", "10:00 p.m."],
  },
  {
    question: "What are the landscaping and yard rules?",
    verdict: "conditional",
    includes: ["DRC review", "Yard design", "Ongoing care"],
  },
  {
    question: "What fees do residents pay?",
    verdict: "verified",
    includes: ["fixed charges", "Charges that depend on usage", "home type"],
  },
  {
    question: "How do I reserve the Overlook Clubhouse?",
    verdict: "informational",
    includes: ["live rental catalog", "$100", "$250"],
    requiresAction: true,
    maxLineLength: 320,
  },
  {
    question: "Who do I contact about water billing?",
    verdict: "informational",
    includes: ["American Conservation and Billing Solutions", "AmCoBi", "833", "ClientCare@AmCoBi.com"],
    requiresSections: false,
  },
  {
    question: "Which food truck is here tomorrow?",
    verdict: "informational",
    includes: ["Example Eats", "Prospect Park"],
    requiresSections: false,
    foodTruck: true,
  },
];

for (const example of EXAMPLES) {
  test(`public example stays useful: ${example.question}`, async () => {
    const result = await answerCommunityQuestion(example.question, {
      index: communityIndex,
      communityId: "sterling-ranch",
      answerRulesQuestion,
      synthesizeCommunityAnswer: false,
      getFoodTruckAnswer: example.foodTruck ? async () => ({
        date: "2026-08-29",
        friendlyDate: "tomorrow",
        truck: "Example Eats",
        trucks: [{ name: "Example Eats", location: "Prospect Park" }],
        sourceUrl: "https://sterlingranchcab.com/Calendar.aspx",
        checkedAt: "2026-08-28T00:00:00.000Z",
        menu: { links: [], items: [] },
      }) : undefined,
    });
    assert.equal(result.confidence?.canAnswer, true);
    assert.equal(result.answerVerdict, example.verdict);
    assert.ok(result.answer.length <= 1000, `Answer is ${result.answer.length} characters long.`);
    assert.doesNotMatch(result.answer, /I (?:do not|don't) have enough information/i);
    assert.doesNotMatch(result.answer, /\.\.\.|-- \d+ of \d+ --|WHEREAS|ADOPTED AND APPROVED/i);
    assert.match(result.answer, /^Short answer:/);
    if (example.requiresSections !== false) {
      assert.match(result.answer, /\n\nWhat I found:/);
      assert.match(result.answer, /\n\nBefore you act:/);
    }
    for (const phrase of example.includes) {
      assert.ok(
        result.answer.toLowerCase().includes(phrase.toLowerCase()),
        `Expected answer to include "${phrase}".`
      );
    }
    if (example.requiresAction) {
      assert.ok(result.actions?.some((action) => /^https?:\/\//i.test(action.url || "")));
    }
    const longestLine = Math.max(...result.answer.split("\n").map((line) => line.length));
    assert.ok(
      longestLine <= (example.maxLineLength || 260),
      `A resident-facing line is ${longestLine} characters long.`
    );
  });
}

test("public example questions in the page are covered by the regression suite", async () => {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const html = await fs.readFile(
    path.join(__dirname, "..", "public", "rules-assistant.html"),
    "utf8"
  );
  const buttons = [...html.matchAll(/<button type="button">([^<]+)<\/button>/g)].map(
    (match) => match[1].trim()
  );
  assert.deepEqual(buttons, EXAMPLES.map((example) => example.question));
  assert.match(html, /rules-assistant\.css\?v=20260901-resident-sources/);
  assert.match(html, /rules-assistant\.js\?v=20260901-resident-sources/);
});

test("park and amenity booking questions use the reservation process", async () => {
  for (const question of [
    "How do I book the park?",
    "Can I reserve a park shelter?",
    "How do I rent a pavilion?",
    "Where do I book the clubhouse?",
  ]) {
    const result = await answerRulesQuestion(question);
    assert.equal(result.confidence?.canAnswer, true, question);
    assert.doesNotMatch(result.answer, /I (?:do not|don't) have enough information/i);
    if (/park/i.test(question)) {
      assert.match(result.answer, /Park Shelters page|Facility Rentals catalog/i);
    } else {
      assert.match(result.answer, /Facilities Rental Application and Agreement/i);
    }
    assert.match(result.answer, /first-come, first-served/i);
    assert.match(result.answer, /\$(?:15|25|100)\.00/i, `${question} should include the published rental rate.`);
    assert.ok(
      result.sources.some((source) => /Amenity Rentals/i.test(source.title || "")),
      `${question} should link the official Amenity Rentals page.`
    );
    if (/park/i.test(question)) {
      assert.ok(result.sources.some((source) => /Park Shelters/i.test(source.title || "")));
      assert.ok(result.sources.some((source) => /Facility Rentals Catalog/i.test(source.title || "")));
    }
  }
});

test("unseen everyday wording maps to the reusable facility-reservation concept", async () => {
  for (const question of [
    "I want to hold a birthday party at a park shelter. What paperwork do I need?",
    "What is the process for using a pavilion for an event?",
    "Where do I sign up to use a CAB facility?",
  ]) {
    const result = await answerRulesQuestion(question);
    assert.equal(result.confidence?.canAnswer, true, question);
    assert.match(result.confidence?.reason || "", /semantic-concept-supported:facility-reservations/);
    if (/park shelter/i.test(question)) {
      assert.match(result.answer, /Park Shelters page|Facility Rentals catalog/i);
    } else {
      assert.match(result.answer, /Facilities Rental Application and Agreement/i);
    }
    assert.match(result.answer, /\$(?:15|25|100)\.00/i, `${question} should include the published rental rate.`);
    assert.ok(
      result.sources.some((source) => /17-188|Reservation process/i.test(source.title || "")),
      `${question} should retrieve the reservation process without an exact-question route.`
    );
  }
});

test("the same concept layer distinguishes cancellations from new bookings", async () => {
  const result = await answerRulesQuestion("How do I cancel a clubhouse rental and get a refund?");
  assert.equal(result.confidence?.canAnswer, true);
  assert.match(result.confidence?.reason || "", /semantic-concept-supported:rental-cancellations/);
  assert.match(result.answer, /current Rental Agreement/i);
  assert.match(result.sources[0]?.title || "", /17-196|Cancellation and refund policy/i);
});

test("defensive spray questions do not route to irrigation spray rules", async () => {
  for (const question of [
    "Is bear spray allowed",
    "Can I carry pepper spray?",
    "Is mace spray okay in the park?",
  ]) {
    const result = await answerRulesQuestion(question);
    assert.equal(result.confidence?.canAnswer, false, question);
    assert.equal(result.confidence?.reason, "no-single-source-support", question);
    assert.doesNotMatch(result.sources[0]?.title || "", /Irrigation system design/i);
    assert.ok(
      result.sources.some((source) => /1-36|17-54|17-156|flammable|weapons|general rules/i.test(source.title || "")),
      `${question} should retrieve the official hazardous-materials or weapons rules.`
    );
  }
});

test("AI search recognizes a named facility and an obvious typo without a manual facility route", async () => {
  const planRulesSearch = async (question) => ({
    inScope: "yes",
    intent: "facility_reservation",
    normalizedQuestion: question.replace(/\brend\b/i, "rent"),
    searchQueries: [
      "Overlook facility rental reservation process",
      "Overlook Great Hall pavilion rental application",
    ],
    entities: ["Overlook"],
  });

  for (const question of [
    "How do I rent the Overlook?",
    "How do I rend the overlook?",
    "Where's the Overlook rental form?",
  ]) {
    const result = await answerRulesQuestion(question, {
      searchMode: "ai-hybrid",
      llmMode: "off",
      planRulesSearch,
      rerankRulesSources: async (_question, sources) => sources,
    });
    assert.equal(result.inputClassification, "rules-question", question);
    assert.equal(result.confidence?.canAnswer, true, question);
    assert.match(result.answer, /Facilities Rental Application and Agreement/i);
    assert.match(result.answer, /\$100\.00|\$25\.00/i, question);
    assert.ok(result.sources.some((source) => /Reservation process/i.test(source.title || "")));
    assert.ok(result.sources.some((source) => /Amenity Rentals/i.test(source.title || "")));
    assert.ok(!result.sources.some((source) => /Architectural Improvement|Design Review Documents/i.test(source.title || "")));
  }
});

test("AI search terms do not leak unrelated facility prices into the resident answer", async () => {
  const planRulesSearch = async (question) => ({
    inScope: "yes",
    intent: "facility_reservation",
    normalizedQuestion: question,
    searchQueries: [
      "Overlook Great Hall pavilion park shelter facility rental reservation process",
      "facility amenity rental application",
    ],
    entities: [],
  });
  const cases = [
    {
      question: "Can I reserve the Great Hall for a baby shower?",
      includes: [/\$100\.00/, /\$250\.00/],
      excludes: [/\$25\.00/, /\$15\.00/],
    },
    {
      question: "Where do I pay the deposit for Overlook Pavilion 2?",
      includes: [/\$25\.00/, /no security deposit/i],
      excludes: [/\$100\.00/, /\$15\.00/],
    },
    {
      question: "How do I rent a park shelter?",
      includes: [/\$15\.00/, /no security deposit/i],
      excludes: [/\$100\.00/, /\$25\.00/],
    },
  ];

  for (const item of cases) {
    const result = await answerRulesQuestion(item.question, {
      searchMode: "ai-hybrid",
      llmMode: "off",
      planRulesSearch,
      rerankRulesSources: async (_question, sources) => sources,
    });
    for (const pattern of item.includes) assert.match(result.answer, pattern, item.question);
    for (const pattern of item.excludes) assert.doesNotMatch(result.answer, pattern, item.question);
  }
});

test("AI search still refuses an unrelated question without official-source evidence", async () => {
  const result = await answerRulesQuestion("How do I repair my bicycle?", {
    searchMode: "ai-hybrid",
    llmMode: "off",
    planRulesSearch: async (question) => ({
      inScope: "no",
      intent: "other",
      normalizedQuestion: question,
      searchQueries: [],
      entities: [],
    }),
    rerankRulesSources: async (_question, sources) => sources,
  });
  assert.equal(result.inputClassification, "unrelated");
  assert.equal(result.confidence?.reason, "ai-search-no-source-evidence");
  assert.deepEqual(result.sources, []);
});

test("AI search expansion preserves strong answers the original wording already found", async () => {
  const cases = [
    {
      question: "Can I add a fence and a shed?",
      intent: "design_review",
      searches: ["fencing standards", "backyard shed DRC approval"],
      expected: [/Fence:/i, /Shed:/i],
    },
    {
      question: "What approval and setbacks apply to a backyard spa?",
      intent: "design_review",
      searches: ["hot tub outdoor spa approval", "spa setback screening"],
      expected: [/DRC approval/i, /five feet/i],
    },
    {
      question: "Can my dog be off leash at Prospect Village park?",
      intent: "pets",
      searches: ["dog off leash park rules", "Prospect Village park leash"],
      expected: [/leash/i, /physical control/i],
    },
  ];

  for (const item of cases) {
    const result = await answerRulesQuestion(item.question, {
      searchMode: "ai-hybrid",
      llmMode: "off",
      planRulesSearch: async () => ({
        inScope: "yes",
        intent: item.intent,
        normalizedQuestion: item.question,
        searchQueries: item.searches,
        entities: [],
      }),
      rerankRulesSources: async (_question, sources) => sources,
    });
    assert.equal(result.confidence?.canAnswer, true, item.question);
    for (const pattern of item.expected) assert.match(result.answer, pattern, item.question);
  }
});

test("compound questions keep a grounded source for each requested topic", async () => {
  let rewriteSources = [];
  const result = await answerRulesQuestion("Can I add a fence and a shed?", {
    llmMode: "selective",
    rewriteAnswerWithLLM: async (_question, _draft, sources) => {
      rewriteSources = sources;
      return "Short answer: Both projects have rules.\n\nWhat I found:\n- Fence source included.\n- Shed source included.\n\nBefore you act: Review both linked sections.";
    },
  });
  assert.equal(result.confidence?.canAnswer, true);
  assert.equal(rewriteSources.length, 0);
  assert.ok(result.sources.some((source) => /fenc/i.test(source.title || "")));
  assert.ok(result.sources.some((source) => /shed/i.test(source.title || "")));
  assert.match(result.answerMode || "", /source-derived-extractive/);
});

test("compound questions keep every topic when the AI rewrite is rejected", async () => {
  const result = await answerRulesQuestion("Can I add a fence and a shed?", {
    llmMode: "selective",
    rewriteAnswerWithLLM: async () => null,
  });
  assert.equal(result.confidence?.canAnswer, true);
  assert.match(result.answer, /Fence:/i);
  assert.match(result.answer, /Shed:/i);
  assert.match(result.answer, /eight feet,\s*six inches/i);
  assert.match(result.answer, /150 square feet/i);
  assert.match(result.answer, /underground/i);
  assert.match(result.answer, /three-rail concrete/i);
  assert.match(result.answerMode || "", /source-derived-extractive/);
});
