const test = require("node:test");
const assert = require("node:assert/strict");

const { answerRulesQuestion } = require("../lib/rules-assistant");
const { answerCoverageIssues } = require("../lib/rules-intent");

async function answer(question, options = {}) {
  return answerRulesQuestion(question, { searchMode: "legacy", llmMode: "off", ...options });
}

test("short-term home-rental phrasings are prohibited and never route to amenity rentals", async () => {
  for (const question of [
    "Can I rent my house on Airbnb for the weekend?",
    "Are VRBO vacation rentals allowed?",
    "Could guests book my place for two nights?",
  ]) {
    const result = await answer(question);
    assert.equal(result.answerVerdict, "prohibited", question);
    assert.match(result.answer, /may not|No\./i, question);
    assert.match(result.answer, /short-term|Airbnb|VRBO/i, question);
    assert.doesNotMatch(result.answer, /facility rental|security deposit/i, question);
  }
});

test("AI cannot misroute a home rental to CAB facility cancellation rules", async () => {
  const result = await answerRulesQuestion("Can I rent my home on Airbnb this weekend?", {
    searchMode: "ai-hybrid",
    llmMode: "off",
    planRulesSearch: async () => ({
      inScope: "yes",
      intent: "rental_cancellation",
      normalizedQuestion: "cancel a facility rental",
      searchQueries: ["clubhouse cancellation refund"],
      entities: [],
    }),
    rerankRulesSources: async (_question, sources) => sources,
  });
  assert.equal(result.answerVerdict, "prohibited");
  assert.match(result.answer, /Airbnb|short-term/i);
  assert.doesNotMatch(result.answer, /refund|security deposit/i);
});

test("RV duration answers compare the requested stay with the current source limit", async () => {
  for (const question of [
    "Can I park my RV in my driveway for a week?",
    "Is a four-day camper stay okay in the driveway?",
    "May my trailer stay for seven days?",
  ]) {
    const result = await answer(question);
    assert.equal(result.answerVerdict, "prohibited", question);
    assert.match(result.answer, /No\..*exceeds/i, question);
    assert.match(result.answer, /72 hours/i, question);
  }
});

test("bare pickleball questions answer the community-court interpretation and preserve the private-court distinction", async () => {
  for (const question of ["Pickle ball", "What are the pickleball court rules?", "Can we play pickleball in the neighborhood?"]) {
    const result = await answer(question);
    assert.match(result.answer, /neighborhood pickleball courts|general park and facility rules/i, question);
    assert.match(result.answer, /5:00 a\.m\..*11:00 p\.m\./is, question);
    assert.match(result.answer, /posted/i, question);
    assert.match(result.answer, /private court.*DRC approval/is, question);
    assert.deepEqual(result.qualityChecks?.issues, [], question);
  }

  const privateCourt = await answer("Can I build a pickleball court in my backyard?");
  assert.match(privateCourt.answer, /private pickleball.*DRC approval/i);
  assert.match(privateCourt.answer, /may not be lighted/i);
  assert.doesNotMatch(privateCourt.answer, /rulebook does not publish pickleball-specific play/i);
});

test("flagpole height answers include the connected installation restrictions", async () => {
  for (const question of ["What is the maximum height a freestanding flag pole can be?", "How tall can my flagpole be?"]) {
    const result = await answer(question);
    assert.match(result.answer, /does not set a numeric maximum height/i, question);
    assert.match(result.answer, /four feet by six feet/i, question);
    assert.match(result.answer, /nighttime illumination.*DRC approval/i, question);
    assert.match(result.answer, /commercial-message flags are prohibited/i, question);
    assert.deepEqual(result.qualityChecks?.issues, [], question);
  }
});

test("approved-tree questions provide examples extracted from the current source list", async () => {
  for (const question of ["What trees can I plant", "What trees can we plant?", "Give me examples of approved trees"]) {
    const result = await answer(question);
    assert.match(result.answer, /Low-water examples:/i, question);
    assert.match(result.answer, /Moderate-water examples:/i, question);
    assert.match(result.answer, /Rocky Mountain Juniper|Thornless Cockspur Hawthorn/i, question);
    assert.match(result.answer, /Freeman Maple|Amur Maple/i, question);
    assert.doesNotMatch(result.answer, /Open the linked Sec\. 5-131 source for the current list/i, question);
    assert.deepEqual(result.qualityChecks?.issues, [], question);
  }
});

test("yard-art questions retain a readable summary while using current source limits", async () => {
  for (const question of ["Yard art?", "What are the rules for yard art?", "Can I put ornaments in my front yard?", "What are the rules for garden statues?"]) {
    const result = await answer(question);
    assert.match(result.answer, /Front yard:/i, question);
    assert.match(result.answer, /no more than three ornaments/i, question);
    assert.match(result.answer, /12 inches/i, question);
    assert.match(result.answer, /Rear yard:/i, question);
    assert.match(result.answer, /three feet/i, question);
    assert.doesNotMatch(result.answer, /I pulled the controlling dates, amounts, and limits/i, question);
    assert.doesNotMatch(result.answer, /\.\.\./, question);
    assert.deepEqual(result.qualityChecks?.issues, [], question);
  }
});

test("watering answers apply method, time, and season instead of leading with an exception", async () => {
  for (const question of [
    "Can I water my lawn at noon in July?",
    "May my sprinklers run at 12:30 p.m. in August?",
  ]) {
    const result = await answer(question);
    assert.equal(result.answerVerdict, "prohibited", question);
    assert.match(result.answer, /No\..*inside/i, question);
    assert.match(result.answer, /10:00 a\.m.*6:00 p\.m/i, question);
  }
  const handWatering = await answer("Can I hand water my garden at noon in July?");
  assert.equal(handWatering.answerVerdict, "allowed");
  assert.match(handWatering.answer, /Yes\..*Hand watering/i);
});

test("raised garden phrasings route to the vegetable garden rule family", async () => {
  for (const question of [
    "Can I put up a raised garden in my yard?",
    "Can raised vegetable beds go in a side yard?",
    "Can I install garden boxes behind my house?",
    "Are vegtable garden beds allowed in the side yard?",
  ]) {
    const result = await answer(question);
    assert.equal(result.answerVerdict, "conditional", question);
    assert.match(result.answer, /DRC approval/i, question);
    assert.match(result.answer, /rear or side yard/i, question);
    assert.match(result.answer, /five feet/i, question);
  }

  const result = await answer("Can I dump garden soil behind the fence in open space?");
  assert.notEqual(result.answerVerdict, "allowed");
  assert.doesNotMatch(result.answer, /Vegetable gardens and raised beds may go/i);
});

test("fence-height answers explain the type distinction and give the sourced standard", async () => {
  for (const question of ["How tall can my fence be?", "What is the maximum fence height?"]) {
    const result = await answer(question);
    assert.match(result.answer, /depends on the fence type and lot/i, question);
    assert.match(result.answer, /54 inches/i, question);
    assert.match(result.answer, /DRC/i, question);
  }
});

test("compound project questions answer every named project", async () => {
  const result = await answer("Can I build a fence or shed in my backyard?");
  assert.match(result.answer, /Fence:/i);
  assert.match(result.answer, /Shed:/i);
  assert.match(result.answer, /two separate DRC projects/i);
  assert.deepEqual(answerCoverageIssues("Can I build a fence or shed in my backyard?", result.answer, result.sources), []);

  const incomplete = answerCoverageIssues(
    "Can I build a fence or shed in my backyard?",
    "Yes, a backyard shed requires DRC approval.",
    []
  );
  assert.ok(incomplete.includes("requested-topic-missing:fence"));
});

test("trash timing questions directly state what the current rule does and does not specify", async () => {
  for (const question of [
    "Can I leave my trash cans out overnight?",
    "Can the bins stay at the curb until tomorrow morning?",
    "When do I need to bring my recycling cans in?",
  ]) {
    const result = await answer(question);
    assert.match(result.answer, /does not give a specific curb-placement or removal time/i, question);
    assert.match(result.answer, /garage|wing fence/i, question);
    assert.doesNotMatch(result.answer, /4:00 a\.m/i, question);
  }
});

test("recognizable topic fragments receive source-grounded answers", async () => {
  const expectations = [
    ["Rain barrels", /two barrels[\s\S]*55 gallons/i],
    ["Air conditioner", /DRC approval is not required[\s\S]*screen/i],
    ["Fireworks", /^Short answer:\s*No\./i],
    ["Gazebo", /requires DRC approval/i],
    ["Pickle ball", /neighborhood pickleball courts[\s\S]*private court[\s\S]*DRC approval/i],
    ["Jellyfish", /Gemstone and Jellyfish/i],
  ];
  for (const [question, expected] of expectations) {
    const result = await answer(question);
    assert.match(result.answer, expected, question);
    assert.equal(result.qualityChecks?.requestedFacetCoverage, true, question);
  }
});

test("wording variants and collisions preserve the resident's actual intent", async () => {
  const leash = await answer("Are leashes required on dogs?");
  assert.match(leash.answer, /must be leashed/i);

  const rain = await answer("I need to submit for a rainwater harvesting barrels");
  assert.match(rain.answer, /55 gallons/i);
  assert.doesNotMatch(rain.answer, /delinquent|water bill/i);

  const enclosure = await answer("how to reinforce the chicken wire fence to insulate dogs");
  assert.match(enclosure.answer, /dog-run enclosure material/i);
  assert.doesNotMatch(enclosure.answer, /backyard chickens|poultry/i);
});

test("requested facets are answered directly or explicitly identified as absent", async () => {
  const duration = await answer("Parking RV for longer than 72 hours");
  assert.match(duration.answer, /^Short answer:\s*No\./i);

  const poleHeight = await answer("What is the maximum height a freestanding flag pole can be?");
  assert.match(poleHeight.answer, /does not set a numeric maximum height/i);
  assert.match(poleHeight.answer, /flag itself, not the height of the pole/i);

  const missingSection = await answer("Can you find section 5-219");
  assert.match(missingSection.answer, /won't substitute a different section/i);
  assert.doesNotMatch(missingSection.answer, /Sec\. 25-45.*closest/i);
});

test("current source text controls changing landscaping and rental requirements", async () => {
  const turf = await answer("Can I use artificial turf in my front yard");
  assert.match(turf.answer, /DRC evaluates each front-yard proposal/i);

  const lease = await answer("Long term rental");
  assert.match(lease.answer, /at least 30 consecutive days/i);

  const rear = await answer("What plants are required in the rear landscaping?");
  assert.match(rear.answer, /2 trees: 1 deciduous tree and 1 evergreen tree/i);
  assert.match(rear.answer, /30 percent live plant material/i);
});
