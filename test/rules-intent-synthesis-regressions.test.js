const test = require("node:test");
const assert = require("node:assert/strict");

const { answerRulesQuestion } = require("../lib/rules-assistant");
const { answerCommunityQuestion } = require("../lib/community-assistant");
const {
  focusedDimensionDetails,
  llmRewriteIssues,
  locationScopeIssues,
} = require("../lib/rules-grounding");
const { isPlantPermissionQuestion } = require("../lib/rules-intent");
const communityIndex = require("../data/community-index.json");

const answerWithoutAi = (question) => answerRulesQuestion(question, {
  searchMode: "legacy",
  llmMode: "off",
});

test("a location word cannot replace the plant that the resident is asking about", async () => {
  for (const question of [
    "Can I plant raspberry bushes along my fence line?",
    "Are raspberry plants allowed by a fence?",
    "In general, can I have vine plants like raspberries?",
    "Could I grow a berry bush beside my wall?",
  ]) {
    const result = await answerWithoutAi(question);
    assert.match(result.sources?.[0]?.title || "", /Preapproved plant list/i, question);
    assert.doesNotMatch(result.sources?.[0]?.title || "", /Fencing standards/i, question);
    assert.doesNotMatch(result.answer, /Fence questions are covered/i, question);
  }
});

test("plant routing does not capture tree-house or fence-primary questions", () => {
  for (const question of [
    "Can I have a tree house?",
    "Can I have a fence around my plants?",
    "Can I put up a trellis beside my raspberry bushes?",
    "What fence can I use to protect my berry bushes?",
  ]) {
    assert.equal(isPlantPermissionQuestion(question), false, question);
  }
  assert.equal(isPlantPermissionQuestion("Can I grow lavender by my fence?"), true);
  assert.equal(isPlantPermissionQuestion("Are raspberry bushes permitted along a wall?"), true);
});

test("plant routing yields to garden projects and dead-tree maintenance obligations", () => {
  for (const question of [
    "Can I plant a vegetable garden?",
    "Can I install garden boxes behind my house?",
    "Can I put up a raised garden in my yard?",
    "Do I need permission to replant a dead tree?",
    "Do I have to replace a dead tree in the tree lawn?",
  ]) {
    assert.equal(isPlantPermissionQuestion(question), false, question);
  }
});

test("garden projects and dead-tree obligations reach their controlling clauses", async () => {
  const garden = await answerWithoutAi("Can I plant a vegetable garden?");
  assert.match(garden.sources?.[0]?.title || "", /Sec\. 21-22/i);
  assert.match(garden.answer, /DRC approval/i);
  assert.match(garden.answer, /rear or side yard/i);
  assert.match(garden.answer, /five feet/i);

  for (const question of [
    "Do I need permission to replant a dead tree?",
    "Do I have to replace a dead tree in the tree lawn?",
  ]) {
    const result = await answerWithoutAi(question);
    assert.ok(result.sources?.some((source) => /Sec\. 9-146|Sec\. 21-22/i.test(source.title || "")), question);
    assert.match(result.answer, /dead trees must be replaced/i, question);
    assert.match(result.answer, /two-inch caliper/i, question);
    assert.match(result.answer, /DRC approval/i, question);
  }
});

test("an unapproved service request stays withheld instead of regaining a canned resource answer", async () => {
  for (const question of [
    "What is Atlas WiFi?",
    "What is atlas coffee wifi?",
    "What is the Atlas coffee WiFi?",
  ]) {
    const result = await answerWithoutAi(question);
    assert.equal(result.confidence?.canAnswer, false, question);
    assert.equal(result.confidence?.reason, "no-single-source-support", question);
    assert.equal(result.answerMode, "source-evidence-boundary", question);
    assert.deepEqual(result.sources, [], question);
    assert.doesNotMatch(result.answer, /publish current access details|password|network name|access code/i, question);
  }
});

test("specific plant evidence comes from the selected source instead of answer code", async () => {
  const result = await answerWithoutAi("Can I grow raspberries near my property line?");
  assert.match(result.answer, /Boulder Raspberry is a preapproved shrub/i);
  assert.match(result.sources?.[0]?.excerpt || "", /Boulder Raspberry/i);
  assert.match(result.sources?.[0]?.excerpt || "", /Shrub/i);
});

test("named plant answers preserve a non-raspberry multiword common name", async () => {
  const result = await answerWithoutAi("Can I plant Blue Point Juniper?");
  assert.equal(result.confidence?.canAnswer, true);
  assert.match(result.answer, /Blue Point Juniper is a preapproved evergreen/i);
  assert.doesNotMatch(result.answer, /Short answer:\s*Point Juniper:/i);
  assert.match(result.sources?.[0]?.excerpt || "", /Blue Point Juniper/i);
  assert.match(result.sources?.[0]?.text || "", /JUNIPERUS CHINENSIS ['"]BLUE POINT['"]/i);
});

test("a named plant with no matching source row is not approved", async () => {
  const result = await answerWithoutAi("Can I grow Moonbeam Dragonfruit?");
  assert.equal(result.confidence?.canAnswer, false);
  assert.equal(result.answerMode, "source-evidence-boundary");
  assert.match(result.answer, /could not verify whether the requested detail is covered/i);
  assert.doesNotMatch(result.answer, /\byes\b|allowed choices|includes Moonbeam Dragonfruit/i);
});

test("supported answers of different families all use the shared synthesis path", async () => {
  for (const question of [
    "When can I put up holiday lights?",
    "What trees can I plant?",
    "What are the rules for yard art?",
    "What are the landscaping and yard rules?",
  ]) {
    let calls = 0;
    const result = await answerRulesQuestion(question, {
      searchMode: "legacy",
      llmMode: "selective",
      rewriteAnswerWithLLM: async (_residentQuestion, draft) => {
        calls += 1;
        return draft.replace(/^Short answer:\s*/i, "");
      },
    });
    assert.equal(calls, 1, question);
    assert.match(result.answerMode || "", /llm-selective/i, question);
  }
});

test("deterministic supported answers expose clean prose across rule families", async () => {
  const cases = [
    ["Can I install privacy screens?", [/landscape screens/i, /DRC approval is required/i]],
    ["Can I put a trampoline in my backyard?", [/five feet from all property lines/i, /Tall plant material/i]],
    ["Are jellyfish or gemstone lights allowed?", [/Gemstone/i, /Jellyfish/i, /DRC approval/i]],
    ["What flags can I fly?", [/United States flag/i, /Colorado flag/i]],
    ["Do I need DRC approval to paint my house?", [/DRC approval/i, /same colors/i]],
  ];
  for (const [question, expectedFacts] of cases) {
    const result = await answerWithoutAi(question);
    assert.equal(result.confidence?.canAnswer, true, question);
    assert.doesNotMatch(result.answer, /Short answer|What I found|Before you act/i, question);
    for (const expected of expectedFacts) assert.match(result.answer, expected, question);
    assert.ok(result.directAnswer, question);
    assert.ok(Array.isArray(result.keyDetails), question);
  }
});

test("successful AI synthesis uses natural prose and retains every sourced holiday-light limit", async () => {
  const naturalAnswer = "You can install and use seasonal decorative lights from June 18 to July 7 and from October 1 through January 31. Turn them off by 10:00 p.m., and remove all temporary strings and clips afterward.";
  const result = await answerRulesQuestion("When can I put up holiday lights?", {
    searchMode: "legacy",
    llmMode: "selective",
    rewriteAnswerWithLLM: async () => naturalAnswer,
  });
  assert.equal(result.answer, naturalAnswer);
  assert.doesNotMatch(result.answer, /Short answer|What I found|Before you act/i);
  assert.match(result.answer, /June 18/i);
  assert.match(result.answer, /July 7/i);
  assert.match(result.answer, /October 1/i);
  assert.match(result.answer, /January 31/i);
  assert.match(result.answer, /10:00 p\.m\./i);
});

test("source-built fallback uses natural prose and retains every sourced holiday-light limit", async () => {
  const result = await answerRulesQuestion("When can I put up holiday lights?", {
    searchMode: "legacy",
    llmMode: "selective",
    rewriteAnswerWithLLM: async () => null,
  });
  assert.doesNotMatch(result.answer, /Short answer|What I found|Before you act/i);
  assert.match(result.answer, /June 18/i);
  assert.match(result.answer, /July 7/i);
  assert.match(result.answer, /October 1/i);
  assert.match(result.answer, /January 31/i);
  assert.match(result.answer, /10:00 p\.m\./i);
});

test("structured rules interpretation still uses successful grounded synthesis", async () => {
  const naturalAnswer = "Seasonal lights can be used from June 18 to July 7 and from October 1 through January 31. Turn them off by 10:00 p.m., then remove temporary strings and clips after the season.";
  let plannerCalls = 0;
  let rewriteCalls = 0;
  const result = await answerRulesQuestion("When can I put up holiday lights?", {
    searchMode: "ai-hybrid",
    llmMode: "selective",
    interpretation: { intent: "rules", needsClarification: false },
    planRulesSearch: async () => { plannerCalls += 1; return null; },
    rewriteAnswerWithLLM: async () => { rewriteCalls += 1; return naturalAnswer; },
  });

  assert.equal(plannerCalls, 0);
  assert.equal(rewriteCalls, 1);
  assert.equal(result.searchStrategy, "shared-interpretation-strong-match");
  assert.equal(result.answerMode, "source-derived-llm-selective");
  assert.equal(result.answer, naturalAnswer);
  assert.doesNotMatch(result.answer, /Short answer|What I found|Before you act/i);
});

test("structured rules interpretation naturalizes a rejected synthesis without losing evidence", async () => {
  let rewriteCalls = 0;
  const result = await answerRulesQuestion("Can I grow raspberries?", {
    searchMode: "ai-hybrid",
    llmMode: "selective",
    interpretation: { intent: "rules", needsClarification: false },
    planRulesSearch: async () => { throw new Error("strong source match should skip the search planner"); },
    rewriteAnswerWithLLM: async () => { rewriteCalls += 1; return null; },
  });

  assert.equal(rewriteCalls, 1);
  assert.equal(result.searchStrategy, "shared-interpretation-strong-match");
  assert.match(result.answer, /Boulder Raspberry/i);
  assert.doesNotMatch(result.answer, /Short answer|What I found|Before you act/i);
});

test("live-shaped plant questions synthesize from one focused row instead of the noisy table", async () => {
  for (const question of [
    "Can I grow raspberries near my property line?",
    "Can I grow vine plants like raspberries?",
  ]) {
    const naturalAnswer = "For the plant choice itself, Boulder Raspberry is on the preapproved list and is classified as a shrub. The cited list doesn't confirm whether the requested location is allowed.";
    let synthesisDraft = "";
    let synthesisSources = [];
    const result = await answerRulesQuestion(question, {
      searchMode: "ai-hybrid",
      llmMode: "selective",
      interpretation: { intent: "rules", needsClarification: false },
      rewriteAnswerWithLLM: async (_residentQuestion, draft, sources) => {
        synthesisDraft = draft;
        synthesisSources = sources;
        return naturalAnswer;
      },
    });

    assert.equal(result.answer, naturalAnswer, question);
    assert.match(synthesisDraft, /Boulder Raspberry/i, question);
    assert.match(synthesisDraft, /Boulder Raspberry is a preapproved shrub/i, question);
    assert.doesNotMatch(synthesisDraft, /Botanical Common Ht x Spd|Freeman Maple|Amur Maple|30' x 15'/i, question);
    assert.deepEqual(
      llmRewriteIssues(naturalAnswer, synthesisDraft, synthesisSources, question),
      [],
      question
    );
  }
});

test("multiple focused plant rows reach synthesis with explicit height and spread labels", async () => {
  const cases = [
    {
      question: "Can I plant Boulder Raspberry in my side yard?",
      answer: "Boulder Raspberry is a preapproved shrub. It grows 8 feet tall and 6 feet wide. The cited list doesn't confirm whether the requested location is allowed.",
      height: "8 feet",
      width: "6 feet",
    },
    {
      question: "Can I plant Blue Point Juniper in my side yard?",
      answer: "Blue Point Juniper is a preapproved evergreen. It grows 15 feet tall and 8 feet wide. The cited list doesn't confirm whether the requested location is allowed.",
      height: "15 feet",
      width: "8 feet",
    },
  ];
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = global.fetch;
  process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    for (const item of cases) {
      let prompt = "";
      global.fetch = async (_url, options) => {
        prompt = JSON.parse(options.body).messages[0].content;
        return {
          ok: true,
          json: async () => ({
            content: [{ type: "text", text: item.answer }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        };
      };
      const result = await answerRulesQuestion(item.question, {
        searchMode: "ai-hybrid",
        llmMode: "selective",
        interpretation: { intent: "rules", needsClarification: false },
      });

      assert.equal(result.answer, item.answer, item.question);
      assert.match(prompt, new RegExp(`Explicit labeled facts from this source: Height: ${item.height}; Spread/width: ${item.width}\\.`), item.question);
      assert.match(prompt, /Evidence scope boundary:.*side yard.*Do not approve placement there/is, item.question);
      assert.doesNotMatch(prompt, /Height:\s*6 feet; Spread\/width:\s*8 feet/i, item.question);
    }
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});

test("resident-supplied locations cannot become placement permission without cited support", () => {
  const plantSource = [{
    title: "Preapproved plant list",
    text: "The following preapproved plant list identifies acceptable plants. RIBES DELICIOSUS BOULDER RASPBERRY 8' x 6' Shrub.",
    excerpt: "RIBES DELICIOSUS BOULDER RASPBERRY 8' x 6' Shrub.",
    questionSpecificExcerpt: true,
  }];
  const cases = [
    [
      "Can I plant Boulder Raspberry along my fence line?",
      "Yes, you can plant Boulder Raspberry along your fence line.",
      /fence-line/,
    ],
    [
      "Can I plant Boulder Raspberry in my side yard?",
      "Boulder Raspberry can be planted in your side yard.",
      /side-yard/,
    ],
    [
      "May I plant Boulder Raspberry near my property line?",
      "Boulder Raspberry is preapproved, so you may plant it near your property line.",
      /property-line/,
    ],
  ];

  for (const [question, answer, expected] of cases) {
    assert.match(locationScopeIssues(answer, plantSource, question).join(" "), expected, question);
  }

  const bounded = "Boulder Raspberry is a preapproved shrub. The cited list doesn't confirm whether placement along your fence line is allowed.";
  assert.deepEqual(locationScopeIssues(bounded, plantSource, cases[0][0]), []);

  const liveShapedOverclaim = "Yes, you can plant Boulder Raspberry along your fence line. It's a preapproved shrub that grows 8 feet tall and 6 feet wide, so you don't need special approval. Check setbacks and underground utilities before planting.";
  const liveIssues = llmRewriteIssues(
    liveShapedOverclaim,
    "Short answer: Boulder Raspberry is a preapproved shrub.",
    plantSource,
    cases[0][0]
  ).join(" ");
  assert.match(liveIssues, /requested location|resident-supplied location/i);
  assert.match(liveIssues, /approval is unnecessary/i);
  assert.match(liveIssues, /setback/);
  assert.match(liveIssues, /utility-line/);
});

test("location grounding applies outside plant names and permits genuinely cited placement", () => {
  const itemOnly = [{ title: "Storage list", text: "Storage boxes are permitted." }];
  assert.match(
    locationScopeIssues(
      "You can put a storage box beside your driveway.",
      itemOnly,
      "Can I put a storage box beside my driveway?"
    ).join(" "),
    /driveway/
  );
  assert.match(
    locationScopeIssues(
      "You can put a storage box beside your fence.",
      [{ title: "Item list", text: "Fences are permitted. Storage boxes are permitted." }],
      "Can I put a storage box beside my fence?"
    ).join(" "),
    /fence/
  );
  assert.match(
    locationScopeIssues(
      "Put it beside the driveway, away from utility easements.",
      itemOnly,
      "Can I use a storage box?"
    ).join(" "),
    /utility-easement.*driveway/
  );

  const placementSource = [{
    title: "Storage placement",
    text: "Storage boxes are permitted in rear yards.",
  }];
  assert.deepEqual(
    locationScopeIssues(
      "Storage boxes are permitted in rear yards.",
      placementSource,
      "Can I put a storage box in my backyard?"
    ),
    []
  );
});

test("preapproved item status cannot be expanded into an uncited no-approval claim", () => {
  const sources = [{
    title: "Preapproved plant list",
    text: "Boulder Raspberry is on the preapproved plant list as a shrub.",
  }];
  const draft = "Short answer: Boulder Raspberry is a preapproved shrub.";
  assert.match(
    llmRewriteIssues(
      "Boulder Raspberry is a preapproved shrub, so you don't need special approval.",
      draft,
      sources,
      "Can I plant Boulder Raspberry?"
    ).join(" "),
    /approval is unnecessary/i
  );
});

test("live raspberry rewrites preserve height and spread bindings", async () => {
  const question = "Can I plant raspberry bushes along my fence line?";
  const correctRewrite = "Boulder Raspberry is preapproved as a shrub. The list shows it at 8 feet tall and 6 feet wide. The cited list doesn't confirm whether placement along your fence line is allowed.";
  const swappedRewrite = "Boulder Raspberry is preapproved as a shrub. The list shows it at 6 feet tall and 8 feet wide. The cited list doesn't confirm whether placement along your fence line is allowed.";
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = global.fetch;
  let responseText = swappedRewrite;
  process.env.ANTHROPIC_API_KEY = "test-key";
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      content: [{ type: "text", text: responseText }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  });
  try {
    const options = {
      searchMode: "ai-hybrid",
      llmMode: "selective",
      interpretation: { intent: "rules", needsClarification: false },
    };
    const rejected = await answerCommunityQuestion(question, {
      index: communityIndex,
      communityId: "sterling-ranch",
      answerRulesQuestion,
      rulesOptions: options,
      planCommunitySearch: false,
      synthesizeCommunityAnswer: false,
    });
    responseText = correctRewrite;
    const accepted = await answerRulesQuestion(question, options);

    assert.equal(accepted.answer, correctRewrite);
    assert.notEqual(rejected.answer, swappedRewrite);
    assert.match(rejected.directAnswer, /^Boulder Raspberry is a preapproved shrub\./i);
    assert.match(rejected.answer, /Height:\s*8 feet/i);
    assert.match(rejected.answer, /Spread\/width:\s*6 feet/i);
    assert.doesNotMatch(rejected.answer, /6 feet tall|8 feet wide/i);
    assert.doesNotMatch(rejected.answer, /Short answer|What I found|Before you act/i);
    assert.ok(rejected.keyDetails.some((detail) => /Height:\s*8 feet/i.test(detail)));
    assert.ok(rejected.keyDetails.some((detail) => /Spread\/width:\s*6 feet/i.test(detail)));
    assert.ok(rejected.keyDetails.every((detail) => !/Open the linked official section/i.test(detail)));
    assert.match(rejected.nextStep, /Open the linked official section/i);
    assert.equal((rejected.answer.match(/Open the linked official section/gi) || []).length, 1);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});

test("grounding preserves labeled values across a second dimension family", () => {
  const sources = [{
    title: "Current installation standard",
    text: "Maximum depth: 4 feet. Minimum setback: 10 feet.",
    excerpt: "Maximum depth: 4 feet. Minimum setback: 10 feet.",
    questionSpecificExcerpt: true,
  }];
  const draft = "Short answer: The maximum depth is 4 feet and the minimum setback is 10 feet.";

  assert.deepEqual(
    llmRewriteIssues("The maximum depth is 4 feet, with a minimum setback of 10 feet.", draft, sources),
    []
  );
  assert.match(
    llmRewriteIssues("The maximum depth is 10 feet, with a minimum setback of 4 feet.", draft, sources).join(" "),
    /attribute\/value binding.*depth=10 ft.*setback=4 ft/i
  );
  assert.deepEqual(focusedDimensionDetails(sources), [
    { role: "depth", value: "4 ft" },
    { role: "setback", value: "10 ft" },
  ]);
});

test("focused evidence still rejects omitted relevant limits and invented facts", () => {
  const lightingSources = [{
    title: "Seasonal lighting rule",
    text: "Seasonal lighting may be used from June 18 to July 7. It must be turned off by 10:00 p.m.",
  }];
  const lightingDraft = "Short answer: Seasonal lighting may be used from June 18 to July 7.\n\nWhat I found:\n- It must be turned off by 10:00 p.m.";
  assert.match(
    llmRewriteIssues("Seasonal lighting may be used from June 18 to July 7.", lightingDraft, lightingSources).join(" "),
    /10:00 p\.m/i
  );

  const plantSources = [{
    title: "Preapproved plant list",
    text: "RIBES DELICIOSUS BOULDER RASPBERRY 8' x 6' Shrub.",
  }];
  const plantDraft = "Short answer: The preapproved list includes Boulder Raspberry and classifies it as a shrub.";
  assert.match(
    llmRewriteIssues(
      "Boulder Raspberry is preapproved and grows 999 feet tall.",
      plantDraft,
      plantSources,
      "Can I grow raspberries?"
    ).join(" "),
    /number.*999/i
  );
});

test("grounding accepts a resident-supplied proper noun but still rejects an invented one", () => {
  const sources = [{
    title: "Seasonal lighting rule",
    text: "Seasonal decorative lighting may be installed and used from June 18 through July 7.",
  }];
  const draft = "Short answer: Seasonal decorative lighting may be used from June 18 through July 7.";

  assert.deepEqual(
    llmRewriteIssues(
      "For Labor Day planning, the cited seasonal-lighting window is June 18 through July 7.",
      draft,
      sources,
      "Can I keep my lights up through Labor Day?"
    ),
    []
  );
  assert.match(
    llmRewriteIssues(
      "For Presidents Day planning, the cited seasonal-lighting window is June 18 through July 7.",
      draft,
      sources,
      "Can I keep my lights up through Labor Day?"
    ).join(" "),
    /proper noun.*Presidents Day/i
  );
});

test("a resident-supplied name cannot turn a search miss into a negative catalog claim", () => {
  const plantSources = [{
    title: "Preapproved plant list",
    text: "Boulder Raspberry is a preapproved shrub.",
  }];
  const plantDraft = "The selected source confirms that Boulder Raspberry is preapproved.";
  const issues = llmRewriteIssues(
    "Moonbeam Dragonfruit isn't on Sterling Ranch's preapproved plant list. Ask the DRC about approval.",
    plantDraft,
    plantSources,
    "Can I plant Moonbeam Dragonfruit?"
  );
  assert.ok(issues.includes("unsupported-resource-absence-claim"));

  const vendorIssues = llmRewriteIssues(
    "The approved vendor directory does not include Alpine Solar.",
    "The official directory lists approved service providers.",
    [{ title: "Approved vendor directory", text: "Summit Electric is an approved service provider." }],
    "Can I use Alpine Solar?"
  );
  assert.ok(vendorIssues.includes("unsupported-resource-absence-claim"));
});

test("natural synthesis may remove scaffolding but cannot drop sourced limits", () => {
  const sources = [{
    title: "Current source",
    text: "The period is June 18 to July 7. The daily cutoff is 10:00 p.m.",
  }];
  const draft = "Short answer: The period is June 18 to July 7.\n\nWhat I found:\n- The daily cutoff is 10:00 p.m.";
  assert.deepEqual(
    llmRewriteIssues("You can use it from June 18 to July 7, with a 10:00 p.m. cutoff.", draft, sources),
    []
  );
  assert.match(
    llmRewriteIssues("You can use it from June 18 to July 7.", draft, sources).join(" "),
    /10:00 p\.m/i
  );
});

test("natural synthesis cannot drop sourced examples that were carried in bullets", () => {
  const sources = [{
    title: "Current plant list",
    text: "Low-water trees include Thornless Cockspur Hawthorn and Blue Point Juniper. Moderate-water trees include Freeman Maple and Amur Maple.",
  }];
  const draft = "Short answer: The source groups approved trees by water need.\n\nWhat I found:\n- Low-water examples include Thornless Cockspur Hawthorn and Blue Point Juniper.\n- Moderate-water examples include Freeman Maple and Amur Maple.";
  assert.deepEqual(
    llmRewriteIssues("The approved list includes Thornless Cockspur Hawthorn, Blue Point Juniper, Freeman Maple, and Amur Maple, grouped by water need.", draft, sources),
    []
  );
  assert.match(
    llmRewriteIssues("The approved list groups trees by water need.", draft, sources).join(" "),
    /proper noun.*dropped/i
  );
});

test("broad overviews retain every available evidence facet before synthesis", async () => {
  const landscape = await answerWithoutAi("Give me an overview of the landscaping and yard requirements");
  for (const fact of [
    /submitted for review and approval/i,
    /front yard design and installation/i,
    /backyard landscaping/i,
    /underground irrigation system/i,
    /kept healthy/i,
  ]) assert.match(landscape.answer, fact);

  const parks = await answerWithoutAi("What should I know about the rules for parks and open spaces?");
  for (const fact of [
    /open from .*a\.m\..*p\.m\./i,
    /must leash/i,
    /motorized vehicles are prohibited/i,
    /glass containers, littering, dumping/i,
    /fires are only permitted/i,
    /swimming or the use of watercraft/i,
    /camping in any CAB Park/i,
  ]) assert.match(parks.answer, fact);
});
