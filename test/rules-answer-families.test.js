const test = require("node:test");
const assert = require("node:assert/strict");

const { answerRulesQuestion, currentSourceConflicts } = require("../lib/rules-assistant");
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

test("the rulebook path stays within its evidence and preserves the private-court distinction", async () => {
  const ambiguous = await answer("Pickle ball");
  assert.equal(ambiguous.answerMode, "targeted-clarification");
  assert.match(ambiguous.answer, /community pickleball court/i);
  assert.match(ambiguous.answer, /private pickleball court/i);
  assert.equal(ambiguous.sources.length, 0);

  for (const question of ["What are the pickleball court rules?", "Can we play pickleball in the neighborhood?"]) {
    const result = await answer(question);
    assert.doesNotMatch(result.answer, /5:00 a\.m\..*11:00 p\.m\./is, question);
    assert.match(result.answer, /sport court.*DRC approval|DRC approval.*sport court/is, question);
    assert.match(result.answer, /pickleball/i, question);
    assert.match(result.answer, /not permitted to be lighted|may not be lighted/i, question);
    assert.deepEqual(result.qualityChecks?.issues, [], question);
  }

  const privateCourt = await answer("Can I build a pickleball court in my backyard?");
  assert.match(privateCourt.answer, /DRC approval/i);
  assert.match(privateCourt.answer, /pickleball/i);
  assert.match(privateCourt.answer, /not permitted to be lighted|may not be lighted/i);
  assert.doesNotMatch(privateCourt.answer, /rulebook does not publish pickleball-specific play/i);
});

test("flagpole height answers include the connected installation restrictions", async () => {
  for (const question of ["What is the maximum height a freestanding flag pole can be?", "How tall can my flagpole be?"]) {
    const result = await answer(question);
    assert.match(result.answer, /does not set a numeric maximum height/i, question);
    assert.match(result.answer, /four feet by six feet/i, question);
    assert.match(result.answer, /nighttime illumination.*DRC approval/i, question);
    assert.match(result.answer, /flags bearing commercial messages are prohibited/i, question);
    assert.deepEqual(result.qualityChecks?.issues, [], question);
  }
});

test("approved-tree questions provide examples extracted from the current source list", async () => {
  for (const question of ["What trees can I plant", "What trees can we plant?", "Give me examples of approved trees"]) {
    const result = await answer(question);
    assert.match(result.answer, /preapproved plant list/i, question);
    assert.match(result.answer, /acceptable tree, shrub, grass and perennial species/i, question);
    assert.match(result.answer, /relative water need|lower-water/i, question);
    assert.match(result.sources?.[0]?.title || "", /^Sec\. 5-131\. - Preapproved plant list/i, question);
    assert.doesNotMatch(result.answer, /don't have enough|could not verify/i, question);
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
    assert.match(result.answer, /preapproved plant list/i, question);
    assert.match(result.answer, /acceptable tree, shrub, grass and perennial species/i, question);
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
    assert.match(result.sources?.[0]?.title || "", /^Sec\. 1-38\. - Household items/i, question);
    assert.match(result.answer, /Owner's Lot/i, question);
    assert.match(result.answer, /roadway,? (?:or )?walkway/i, question);
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
    assert.match(result.answer, /front yard/i, question);
    assert.match(result.answer, /no more than three(?: \(3\))? ornaments/i, question);
    assert.match(result.answer, /12 inches/i, question);
    assert.match(result.answer, /rear yard/i, question);
    assert.match(result.answer, /three(?: \(3\))? feet/i, question);
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
    ["Rain barrels", /two 55-gallon rain barrels|two barrels[\s\S]*55 gallons/i],
    ["Air conditioner", /DRC approval is not required[\s\S]*screen/i],
    ["Fireworks", /^Short answer:\s*(?:No\.|No fireworks|Residents.*not.*fireworks)/i],
    ["Gazebo", /requires DRC approval/i],
    ["Jellyfish", /Gemstone and Jellyfish/i],
  ];
  for (const [question, expected] of expectations) {
    const result = await answer(question);
    assert.match(result.answer, expected, question);
    assert.equal(result.qualityChecks?.requestedFacetCoverage, true, question);
  }
});

test("special-source rule families receive useful clause-composed answers without static profiles", async () => {
  const cases = [
    ["Can I hang stuff in my fence?", /household items.*may not be hung/i, "source-derived-extractive"],
    ["Can I turf my front lawn?", /artificial turf.*individual basis.*front yards/i, "source-derived-extractive"],
    ["What is a tree lawn", /between their property edge and the street/i, "source-derived-extractive"],
    ["What is needed to redo backyard", /submitted for review and approval by the DRC/i, "source-derived-extractive"],
    ["Fence stain color", /approved color.*concrete perimeter fence/i, "source-evidence-boundary"],
  ];
  for (const [question, expected, answerMode] of cases) {
    const result = await answer(question);
    assert.equal(result.answerMode, answerMode, question);
    assert.match(result.answer, expected, question);
    assert.doesNotMatch(result.answer, /I don't have enough|closest starting points/i, question);
    assert.ok(result.sources.length > 0, question);
  }
});

test("an illustrative source mention is presented as a boundary, not project permission", async () => {
  const result = await answer("Can I build a pergola in my front yard?");
  assert.match(result.answer, /mentions the requested project only as an example in a different rule/i);
  assert.match(result.answer, /lighting must be strung.*such as pergolas/i);
  assert.doesNotMatch(result.answer, /pergola.*(?:is allowed|requires DRC approval)/i);
});

test("a named construction project needs object-specific evidence, not a broad yard rule", async () => {
  for (const question of [
    "Can I build a helipad in my yard?",
    "Can I construct a helicopter landing pad in my yard?",
    "Can I erect a landing strip on my property?",
  ]) {
    const result = await answer(question);
    assert.equal(result.answerMode, "source-evidence-boundary", question);
    assert.equal(result.confidence.canAnswer, false, question);
    assert.equal(result.confidence.reason, "named-project-not-supported-by-cited-evidence", question);
    assert.match(result.answer, /don't have enough rulebook evidence/i, question);
    assert.deepEqual(result.sources, [], question);
    assert.doesNotMatch(result.answer, /landscap(?:ing|e).*DRC approval|most landscaping is allowed/i, question);
  }
});

test("named-project authority guard preserves supported objects, synonyms, and cautious boundaries", async () => {
  const gazebo = await answer("Can I build a gazebo in my yard?");
  assert.equal(gazebo.answerMode, "source-evidence-boundary");
  assert.match(gazebo.answer, /mentions the requested project only as an example/i);
  assert.ok(gazebo.sources.length > 0);

  const rainBarrel = await answer("Can I install a rain barrel in my yard?");
  assert.equal(rainBarrel.confidence.canAnswer, true);
  assert.match(rainBarrel.answer, /two 55-gallon rain barrels/i);

  const airConditioner = await answer("Can I install an AC unit by my home?");
  assert.equal(airConditioner.confidence.canAnswer, true);
  assert.match(airConditioner.answer, /DRC approval is not required/i);

  const landscapeScreens = await answer("Can I add landscape screens for backyard privacy?");
  assert.equal(landscapeScreens.confidence.canAnswer, true);
  assert.match(landscapeScreens.answer, /landscape screens and require DRC approval/i);

  const rooflineLights = await answer("Can I install permanent roofline lights?");
  assert.equal(rooflineLights.confidence.canAnswer, true);
  assert.match(rooflineLights.answer, /requires DRC approval/i);

  const compoundFence = await answer("Can I build a fence and what color does it need to be?");
  assert.equal(compoundFence.confidence.reason, "fencing-standards");
  assert.match(compoundFence.answer, /fencing standards/i);

  const privacyFence = await answer("Can I build a privacy fence");
  assert.equal(privacyFence.confidence.canAnswer, true);
  assert.match(privacyFence.answer, /privacy fence/i);

  const privacyScreens = await answer("Can I install privacy screens");
  assert.equal(privacyScreens.confidence.canAnswer, true);
  assert.match(privacyScreens.answer, /landscape screens and require DRC approval/i);

  const catio = await answer("Can I put up a catio. Not attached to the house");
  assert.match(catio.answer, /does not name catios specifically/i);
  assert.match(catio.answer, /accessory buildings|outdoor pet areas/i);
  assert.doesNotMatch(catio.answer, /catio.*(?:is allowed|is prohibited)/i);

  const religiousFlag = await answer("Can my neighbor put up a religious flag?");
  assert.equal(religiousFlag.confidence.canAnswer, true);
  assert.match(religiousFlag.answer, /Owners may display flags/i);
});

test("a related property clause cannot answer a different removal request", async () => {
  const result = await answer("Can I remove a tree?");
  assert.equal(result.confidence.canAnswer, false);
  assert.match(result.answer, /do not state whether the requested removal is allowed/i);
  assert.doesNotMatch(result.answer, /^Short answer:.*(?:yes|DRC approval is required)/i);
});

test("an access question recognizes exact support evidence instead of a generic refusal", async () => {
  const result = await answer("I lost access to home seer steward system. How do I restore it?");
  assert.equal(result.confidence.canAnswer, true);
  assert.match(result.answer, /Lumiere\.technology\/help/i);
  assert.match(result.answer, /help@lumierefiber\.com/i);
  assert.ok(result.sources.length > 0);
});

test("wording variants and collisions preserve the resident's actual intent", async () => {
  const leash = await answer("Are leashes required on dogs?");
  assert.match(leash.answer, /must.*leash|leashed.*physical control/i);

  const rain = await answer("I need to submit for a rainwater harvesting barrels");
  assert.match(rain.answer, /55[- ]gallon/i);
  assert.doesNotMatch(rain.answer, /delinquent|water bill/i);

  const enclosure = await answer("how to reinforce the chicken wire fence to insulate dogs");
  assert.match(enclosure.answer, /fencing material.*lot-line fencing|black powder-coated steel/i);
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
  assert.match(turf.answer, /evaluated on an individual basis for front yards/i);

  const lease = await answer("Long term rental");
  assert.match(lease.answer, /less than 30 consecutive days is prohibited/i);

  const rear = await answer("What plants are required in the rear landscaping?");
  assert.match(rear.answer, /two trees[\s\S]*one deciduous tree[\s\S]*one evergreen tree/i);
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

test("generic fallback families use the shared evidence boundary without replacing supported answers", async () => {
  for (const question of [
    "What utility requirement applies?",
    "Can I do that?",
    "Do I need official approval?",
    "Tell me about community rules",
  ]) {
    const result = await answer(question);
    assert.equal(result.answerMode, "source-evidence-boundary", question);
    assert.equal(result.confidence.canAnswer, false, question);
    assert.match(result.answer, /don't have enough rulebook evidence to answer that confidently/i, question);
    assert.doesNotMatch(result.answer, /these sections look|closest (?:matches|starting points)|definite utility answer/i, question);
    assert.ok(result.sources.length > 0, question);
  }

  const supportedFee = await answer("How much is my water service fee?");
  assert.equal(supportedFee.confidence.canAnswer, true);
  assert.match(supportedFee.answer, /\$50\.20|\$9\.70|\$44\.95/i);
  assert.notEqual(supportedFee.answerMode, "source-evidence-boundary");

  const noEvidence = await answer("Can I build a helicopter landing pad in my yard?");
  assert.equal(noEvidence.answerMode, "source-evidence-boundary");
  assert.deepEqual(noEvidence.sources, []);

  const exactSection = await answer("Can you find section 5-219?");
  assert.equal(exactSection.answerMode, "exact-section-not-found");

  const conflicts = currentSourceConflicts([
    { title: "Current policy A", sourceUrl: "https://cab.example/a", isSupplemental: true, replacesSections: ["Sec. 1-1"] },
    { title: "Current policy B", sourceUrl: "https://cab.example/b", isSupplemental: true, replacesSections: ["Sec. 1-1"] },
  ]);
  assert.deepEqual(conflicts, [{ section: "sec.1-1", sources: ["Current policy A", "Current policy B"] }]);

  const collision = await answer("Can I build a shed in my backyard?");
  assert.match(collision.answer, /DRC approval/i);
  assert.doesNotMatch(collision.answer, /don't have enough rulebook evidence/i);
});

test("resident-specific variants use current clauses and official resource projections", async () => {
  for (const question of ["Can I hang lights from my porch?", "Can I add patio lighting?"]) {
    const result = await answer(question);
    assert.match(result.sources?.[0]?.title || "", /Updated exterior lighting policy/i, question);
    assert.doesNotMatch(result.answer, /Porch, patio, and deck lighting is allowed within the exterior-lighting rules/i, question);
  }

  const access = await answer("I lost HomeSeer access");
  assert.match(access.answer, /Lumiere\.technology\/help/i);
  assert.match(access.answer, /help@lumierefiber\.com/i);

  const drc = await answer("How do I submit to the DRC?");
  assert.equal(drc.answer, drc.sources.map((source) => source.excerpt).join(" "));

  const clubs = await answer("Resident Clubs calendar");
  assert.equal(clubs.answer, clubs.sources.map((source) => source.excerpt).join(" "));
});
