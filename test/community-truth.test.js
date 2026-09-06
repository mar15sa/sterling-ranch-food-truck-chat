const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildFactLedger,
  factIsAnswerable,
  resolveFactLedger,
  reviewDecisionMatches,
} = require("../lib/community-truth");
const { searchCommunityIndex } = require("../lib/community-search");

const profile = {
  factAuthority: {
    "live-status": ["live-status", "civicplus-pages"],
    "facility-hours": ["civicrec", "civicplus-pages", "municode"],
    "reservation-policy": ["civicrec", "civicplus-pages", "municode"],
    fee: ["adopted-document", "civicrec", "civicplus-pages", "municode"],
    restriction: ["municode", "adopted-document", "civicplus-pages"],
    contact: ["civicplus-pages", "municode"],
    submission: ["official-action", "civicplus-pages"],
    "event-date": ["civicplus-calendar", "civicplus-pages"],
  },
};

function entry(overrides = {}) {
  return {
    id: overrides.id || Math.random().toString(36),
    communityId: "alpha",
    subjectKey: "pickleball-courts",
    facet: "facility-hours",
    scopeKey: "weekday",
    claimKey: "alpha:pickleball-courts:facility-hours:weekday",
    displayValue: "7 a.m.",
    normalizedValue: "7 a.m.",
    connectorType: "civicplus-pages",
    sourceUrl: "https://alpha.gov/pickleball",
    sourceVersion: "v1",
    lifecycle: "current",
    reviewStatus: "approved",
    staleAfter: "2099-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("fact ledger backfills trusted facts without changing their approval state", () => {
  const index = {
    communityId: "alpha",
    generatedAt: "2026-09-01T00:00:00.000Z",
    sources: [{
      id: "pickleball",
      communityId: "alpha",
      title: "Pickleball Courts",
      sourceUrl: "https://alpha.gov/pickleball",
      sourceType: "facilities",
      connectorType: "civicplus-pages",
      contentHash: "source-version",
      checkedAt: "2026-09-01T00:00:00.000Z",
      staleAfter: "2026-09-02T00:00:00.000Z",
      facts: [{ factKey: "weekday-hours", type: "time", value: "7 a.m.", context: "Weekday hours are 7 a.m. to dusk." }],
    }],
  };
  const [fact] = buildFactLedger(index, { trusted: true });
  assert.equal(fact.subjectKey, "pickleball-courts");
  assert.equal(fact.facet, "facility-hours");
  assert.equal(fact.scopeKey, "weekday");
  assert.equal(fact.reviewStatus, "approved");
  assert.equal(fact.sourceVersion, "source-version");
});

test("duplicates and non-overlapping historical facts are not unresolved conflicts", () => {
  const duplicate = resolveFactLedger([entry(), entry({ id: "two", sourceUrl: "https://alpha.gov/hours", sourceVersion: "v2" })], profile);
  assert.equal(duplicate.groups[0].classification, "duplicate");
  const temporal = resolveFactLedger([
    entry({ id: "old", normalizedValue: "6 a.m.", effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31", lifecycle: "retired" }),
    entry({ id: "new", effectiveFrom: "2026-01-01" }),
  ], profile);
  assert.equal(temporal.groups[0].classification, "temporal-succession");
  assert.equal(temporal.unresolvedSensitive.length, 0);
});

test("facet authority resolves a generic rulebook disagreement but equal authorities block", () => {
  const resolved = resolveFactLedger([
    entry({ id: "facility", connectorType: "civicplus-pages" }),
    entry({ id: "rule", normalizedValue: "5 a.m.", connectorType: "municode", sourceUrl: "https://rules.example/hours" }),
  ], profile);
  assert.equal(resolved.groups[0].classification, "authority-resolved");
  assert.equal(resolved.groups[0].winner.id, "facility");
  const blocked = resolveFactLedger([
    entry({ id: "one" }),
    entry({ id: "two", normalizedValue: "8 a.m.", sourceUrl: "https://alpha.gov/other" }),
  ], profile);
  assert.equal(blocked.groups[0].classification, "unresolved-conflict");
  assert.equal(blocked.unresolvedSensitive.length, 1);
});

test("only approved, current, fresh facts can answer residents", () => {
  assert.equal(factIsAnswerable(entry(), Date.parse("2026-09-01")), true);
  assert.equal(factIsAnswerable(entry({ reviewStatus: "candidate" }), Date.parse("2026-09-01")), false);
  assert.equal(factIsAnswerable(entry({ lifecycle: "future" }), Date.parse("2026-09-01")), false);
  assert.equal(factIsAnswerable(entry({ lifecycle: "superseded" }), Date.parse("2026-09-01")), false);
  assert.equal(factIsAnswerable(entry({ lifecycle: "retired" }), Date.parse("2026-09-01")), false);
  assert.equal(factIsAnswerable(entry({ staleAfter: "2026-08-31T00:00:00.000Z" }), Date.parse("2026-09-01")), false);
});

test("review decisions are bound to the exact source version", () => {
  const fact = entry({ id: "fact-id", sourceVersion: "hash-one" });
  const decision = { decision: "approve-proposed", factId: "fact-id", sourceVersion: "hash-one", sourceUrl: fact.sourceUrl };
  assert.equal(reviewDecisionMatches(decision, fact), true);
  assert.equal(reviewDecisionMatches({ ...decision, sourceVersion: "hash-two" }, fact), false);
});

test("expired sensitive facts withhold the source text instead of leaking an old value", () => {
  const source = {
    id: "pickleball", communityId: "alpha", title: "Pickleball Courts", sourceUrl: "https://alpha.gov/pickleball",
    sourceType: "facilities", connectorType: "civicplus-pages", authorityScore: 1,
    text: "Pickleball court hours are 7 a.m. to dusk.", excerpt: "Hours are 7 a.m. to dusk.", actions: [],
    facts: [{ id: "hours", type: "time", value: "7 a.m.", context: "Pickleball court hours are 7 a.m. to dusk." }],
    contentHash: "v1", checkedAt: "2026-08-01T00:00:00Z", staleAfter: "2026-08-02T00:00:00Z",
  };
  const index = { communityId: "alpha", sources: [source], factAuthority: profile.factAuthority, factLedger: [entry({ sourceId: "pickleball", sourceVersion: "v1", staleAfter: "2026-08-02T00:00:00Z" })], truthStatus: {} };
  const result = searchCommunityIndex("What are the pickleball court hours?", { index, communityId: "alpha" });
  assert.equal(result.sources.length, 0);
  assert.equal(result.withheldSources[0].id, "pickleball");
});

test("contact comparisons distinguish channels and normalize phone formatting without hiding changed numbers", () => {
  const source = { id: 'office', title: 'Office', sourceUrl: 'https://alpha.gov/contact', contentHash: 'v1', connectorType: 'civicplus-pages', facts: [
    {type:'phone',value:'303-555-0100',normalizedValue:'303-555-0100',context:'Call the office or email office@example.gov.'},
    {type:'phone',value:'+1 (303) 555-0100',normalizedValue:'+1 (303) 555-0100',context:'Call the office or email office@example.gov.'},
    {type:'email',value:'office@example.gov',context:'Call the office or email office@example.gov.'}
  ]};
  const index={communityId:'alpha',sources:[source]};
  const ledger=buildFactLedger(index,{trusted:true});
  const result=resolveFactLedger(ledger,profile);
  assert.equal(result.groups.length,2);
  assert.equal(result.unresolvedSensitive.length,0);
  source.facts.push({type:'phone',value:'303-555-0101',normalizedValue:'303-555-0101',context:'Call the office or email office@example.gov.'});
  assert.equal(resolveFactLedger(buildFactLedger(index,{trusted:true}),profile).unresolvedSensitive.length,1);
});

test("time comparisons separate labeled days and interval endpoints but preserve same-day contradictions", () => {
  const source={id:'courts',title:'Courts',sourceUrl:'https://alpha.gov/courts',contentHash:'v1',facts:[
    {type:'time',value:'7 am',context:'Hours: Weekdays 7 am-dusk; Weekends 8 am-dusk.'},
    {type:'time',value:'8 am',context:'Hours: Weekdays 7 am-dusk; Weekends 8 am-dusk.'},
    {type:'time',value:'8:00 AM',context:'Monday - Friday: 8:00 AM - 5:00 PM'},
    {type:'time',value:'5:00 PM',context:'Monday - Friday: 8:00 AM - 5:00 PM'}
  ]};
  const facts=buildFactLedger({communityId:'alpha',sources:[source]},{trusted:true});
  assert.equal(facts[0].scopeKey,'weekday-opening');
  assert.equal(facts[1].scopeKey,'weekend-opening');
  assert.equal(facts[2].scopeKey,'weekday-opening');
  assert.equal(facts[3].scopeKey,'weekday-closing');
  const conflicts=resolveFactLedger(facts,profile).unresolvedSensitive;
  assert.equal(conflicts.length,1);
  assert.equal(conflicts[0].claimKey,'alpha:courts:facility-hours:weekday-opening');
});

test("separate reservation actions coexist but different targets for the same action remain conflicting",()=>{
 const source={id:'court',title:'Court Reservations',sourceUrl:'https://alpha.gov/courts',contentHash:'v1',facts:[
  {type:'link',value:'https://alpha.gov/book',context:'Reserve a court: https://alpha.gov/book'},
  {type:'link',value:'https://alpha.gov/account',context:'Create reservation account: https://alpha.gov/account'}
 ]};
 const index={communityId:'alpha',sources:[source]};
 assert.equal(resolveFactLedger(buildFactLedger(index,{trusted:true}),profile).unresolvedSensitive.length,0);
 source.facts.push({type:'link',value:'https://alpha.gov/other-booking',context:'Reserve a court: https://alpha.gov/other-booking'});
 const conflicts=resolveFactLedger(buildFactLedger(index,{trusted:true}),profile).unresolvedSensitive;
 assert.equal(conflicts.length,1);
 assert.equal(conflicts[0].entries.length,2);
});

test("a later named-day schedule does not inherit an earlier weekday label",()=>{
 const source={id:'pool',title:'Pool hours',sourceUrl:'https://alpha.gov/pool',contentHash:'v1',facts:[
  {type:'time',value:'5:00 am',context:'Monday-Friday: 5:00 am - 9:00 am: Lap Swim Tuesday & Thursday - 7:00 am - 8:45 am: Pool cleaning and maintenance.'},
  {type:'time',value:'7:00 am',context:'Monday-Friday: 5:00 am - 9:00 am: Lap Swim Tuesday & Thursday - 7:00 am - 8:45 am: Pool cleaning and maintenance.'}
 ]};
 const facts=buildFactLedger({communityId:'alpha',sources:[source]},{trusted:true});
 assert.equal(facts[0].scopeKey,'weekday-opening');
 assert.equal(facts[1].scopeKey,'tuesday-thursday-opening');
 assert.equal(resolveFactLedger(facts,profile).unresolvedSensitive.length,0);
});

test('company directory rows distinguish contacts while retaining same-company contradictions',()=>{
 const header='Company Landscape Design Irrigation Design Landscape Installation Irrigation Installation Email Phone ';
 const source={id:'directory',title:'Directory',sourceUrl:'https://alpha.gov/directory.pdf',contentHash:'v1',text:header+'Alpha Gardens  alpha@example.com 303-555-0100 Beta Gardens  beta@example.com 303-555-0200 Alpha Gardens  alpha@example.com 303-555-0300',facts:[{type:'phone',value:'303-555-0100'},{type:'phone',value:'303-555-0200'},{type:'phone',value:'303-555-0300'}]};
 const facts=buildFactLedger({communityId:'alpha',sources:[source]},{trusted:true});
 assert.equal(facts[0].subjectKey,'directory-alpha-gardens');
 assert.equal(facts[1].subjectKey,'directory-beta-gardens');
 const conflicts=resolveFactLedger(facts,profile).unresolvedSensitive;
 assert.equal(conflicts.length,1);
 assert.equal(conflicts[0].entries.length,2);
 source.text=header+'Alpha Gardens  alpha@example.com 303-555-0100 Beta Gardens  beta@example.com 303-555-0100';
 const ambiguous=buildFactLedger({communityId:'alpha',sources:[source]},{trusted:true});
 assert.equal(ambiguous[0].subjectKey,'directory');
});
