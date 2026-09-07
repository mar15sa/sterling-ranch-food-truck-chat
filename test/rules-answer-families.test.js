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

test("the rulebook path does not misstate public pickleball operations and preserves the private-court distinction", async () => {
  for (const question of ["Pickle ball", "What are the pickleball court rules?", "Can we play pickleball in the neighborhood?"]) {
    const result = await answer(question);
    assert.match(result.answer, /public pickleball courts|public-court/i, question);
    assert.match(result.answer, /Pickleball Courts page/i, question);
    assert.doesNotMatch(result.answer, /5:00 a\.m\..*11:00 p\.m\./is, question);
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

test("plant-list wording variants all retrieve Section 5-131 first", async () => {
  for (const question of [
    "Is there a list of preapproved plants?",
    "Is there a pre-approved plant list?",
    "Is there an approved plant list?",
    "Is there a recommended plant list?",
    "Do you have a list of approved plants?",
    "Where can I find recommended plants?",
    "Which plants are recommended?",
  ]) {
    const result = await answer(question);
    assert.match(result.answer, /Yes\. Section 5-131 contains Sterling Ranch’s preapproved and recommended plant list/i, question);
    assert.match(result.answer, /Low-water examples:/i, question);
    assert.doesNotMatch(result.answer, /there (?:is|are)(?:n't| not).*list|no .*list/i, question);
    assert.match(result.sources?.[0]?.title || "", /^Sec\. 5-131\. - Preapproved plant list/i, question);
    assert.deepEqual(result.qualityChecks?.issues, [], question);
  }
});

test("missing retrieval cannot be presented as proof that an official list does not exist", () => {
  const unsupported = answerCoverageIssues(
    "Is there a list of preapproved plants?",
    "No, there is no preapproved plant list.",
    [{ title: "Landscape guidance", text: "Plants are grouped by their relative water need." }]
  );
  assert.ok(unsupported.includes("unsupported-resource-absence-claim"));

  const explicitlySupported = answerCoverageIssues(
    "Is there an approved contractor list?",
    "The official rule says there is no approved contractor list.",
    [{ title: "Contractor policy", text: "There is no approved contractor list maintained by the CAB." }]
  );
  assert.doesNotMatch(explicitlySupported.join(" "), /unsupported-resource-absence-claim/);
});

test("everyday wording for movable outdoor belongings routes to the household-items rule", async () => {
  for (const question of [
    "How far can my stuff go off my porch?",
    "Can I leave chairs just past my front porch?",
    "Where can I keep my bike by the patio?",
    "Can I leave my furnture by the porhc?",
  ]) {
    const result = await answer(question);
    assert.equal(result.answerMode, "source-derived-structured", question);
    assert.match(result.sources?.[0]?.title || "", /^Sec\. 1-38\. - Household items/i, question);
    assert.match(result.answer, /does not use a set distance from the porch/i, question);
    assert.match(result.answer, /stay on your lot/i, question);
    assert.match(result.answer, /roadway or walkway/i, question);
    assert.doesNotMatch(result.answer, /could not verify|could not find/i, question);
  }
});

test("outdoor belongings do not swallow permanent projects, decorations, or lighting", async () => {
  const permanent = await answer("How far can I extend my porch?");
  assert.doesNotMatch(permanent.sources?.[0]?.title || "", /^Sec\. 1-38\./i);

  const decoration = await answer("What size decorations can I place in my front yard?");
  assert.match(decoration.sources?.[0]?.title || "", /2024 CAB Code amendments|Sec\. 21-22/i);
  assert.match(decoration.answer, /12 inches/i);

  const lighting = await answer("Can I hang lights from my porch?");
  assert.match(lighting.sources?.[0]?.title || "", /Updated exterior lighting policy/i);
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
    ["Pickle ball", /public pickleball courts[\s\S]*CAB.*Pickleball Courts page[\s\S]*private court[\s\S]*DRC approval/i],
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

test("yard completion deadlines use the controlling installation-date rule", async () => {
  for (const question of [
    "How many months do I have to finish my backyard?",
    "How many months after our house is done being built do we have to finish the yard",
    "How long do I have to complete rear-yard landscaping after closing?",
    "When must my back yard be finshed after the CO?",
  ]) {
    const result = await answer(question);
    assert.equal(result.confidence?.canAnswer, true, `${question}\n${JSON.stringify(result, null, 2)}`);
    assert.match(result.answer, /120 days/i, question);
    assert.match(result.answer, /closing|CO|TCO/i, question);
    assert.match(result.answer, /November 1.*April 30|winter deferral/is, question);
    assert.match(result.sources?.[0]?.title || "", /^Sec\. 9-145\. - Completion\/installation dates/i, question);
    assert.doesNotMatch(result.answer, /rules (?:do not|don't) set a deadline/i, question);
  }

  const front = await answer("How long does the builder have to finish the front yard after the certificate of occupancy?");
  assert.match(front.answer, /30 days/i);
  assert.doesNotMatch(front.answer, /homeowner has 120 days/i);

  const unrelated = await answer("How long do I have to finish painting my garage door?");
  assert.doesNotMatch(unrelated.answer, /rear yard landscaping must be completed within 120 days/i);
});
