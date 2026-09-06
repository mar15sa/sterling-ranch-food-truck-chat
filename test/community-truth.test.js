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

test('date range endpoints coexist while changed endpoints remain conflicts', () => {
  const context = 'A Winter Deferral Period for completion of rear yard planting is granted for closings from November 1 to April 30.';
  const source = { id: 'winter', title: 'Winter deferral', sourceUrl: 'https://alpha.gov/winter', contentHash: 'v1',
    connectorType: 'civicplus-pages', facts: ['November 1', 'April 30'].map(value => ({ type: 'date', value, context })) };
  const index = { communityId: 'alpha', sources: [source] };
  const original = buildFactLedger(index, { trusted: true });
  assert.notEqual(original[0].claimKey, original[1].claimKey);
  assert.equal(resolveFactLedger(original, profile).unresolved.length, 0);
  const changed = { ...source, id: 'winter-other', contentHash: 'v2', facts: [
    { type: 'date', value: 'November 15', context: context.replace('November 1', 'November 15') },
    { type: 'date', value: 'May 15', context: context.replace('April 30', 'May 15') },
  ] };
  const combined = buildFactLedger({ ...index, sources: [source, changed] }, { trusted: true });
  assert.equal(resolveFactLedger(combined, profile).unresolved.length, 2);
});

test('inspection scheduling contacts coexist with submission contacts without hiding competing inspection addresses', () => {
  const source = { id: 'packet', title: 'Landscaping packet', sourceUrl: 'https://alpha.gov/packet', contentHash: 'v1', connectorType: 'civicplus-pages', facts: [
    { type: 'email', value: 'submit@alpha.gov', context: 'Application for property owners. Email: submit@alpha.gov' },
    { type: 'email', value: 'inspection@alpha.gov', context: 'TO SCHEDULE AN INSPECTION (MINIMUM 48 HOURS NOTICE, MONDAY THROUGH FRIDAY ONLY): Contact inspection@alpha.gov Provide your name.' },
  ] };
  const build = () => buildFactLedger({ communityId: 'alpha', sources: [source] }, { trusted: true });
  assert.equal(resolveFactLedger(build(), profile).unresolvedSensitive.length, 0);
  source.facts.push({ type: 'email', value: 'other@alpha.gov', context: 'To schedule an inspection: Contact other@alpha.gov' });
  assert.equal(resolveFactLedger(build(), profile).unresolvedSensitive.length, 1);
  source.facts.push({ type: 'email', value: 'general@alpha.gov', context: 'Questions about inspections? Email general@alpha.gov' });
  assert.equal(resolveFactLedger(build(), profile).unresolvedSensitive.length, 2);
});

test('explicit emergency contacts coexist with general phones while competing emergency numbers conflict', () => {
  const source = { id: 'clubhouse', title: 'Clubhouse', sourceUrl: 'https://alpha.gov/clubhouse', contentHash: 'v1', connectorType: 'civicplus-pages', facts: [
    { type: 'phone', value: '303-555-0100', context: 'Phone: 303-555-0100. Emergency Phone: 303-555-0101' },
    { type: 'phone', value: '303-555-0101', context: 'Phone: 303-555-0100. Emergency Phone: 303-555-0101' },
  ] };
  const build = () => buildFactLedger({ communityId: 'alpha', sources: [source] }, { trusted: true });
  assert.equal(resolveFactLedger(build(), profile).unresolvedSensitive.length, 0);
  source.facts.push({ type: 'phone', value: '303-555-0102', context: '24/7 Emergency Phone: 303-555-0102' });
  assert.equal(resolveFactLedger(build(), profile).unresolvedSensitive.length, 1);
  source.facts.push({ type: 'phone', value: '303-555-0103', context: 'Non-Emergency Phone: 303-555-0103' });
  const facts = build();
  assert.equal(facts.at(-1).scopeKey, 'phone');
  assert.equal(resolveFactLedger(facts, profile).unresolvedSensitive.length, 2);
});

test('explicit billing tiers coexist while different prices in the same tier conflict', () => {
  const { extractFacts } = require('../lib/community-ingest');
  const [extracted] = extractFacts('Tier 1 is $9.40/1,000 gallons.');
  assert.equal(extracted.normalizedValue, 9.4);
  const source = { id: 'rates', title: 'Water billing', sourceUrl: 'https://alpha.gov/rates', contentHash: 'v1', connectorType: 'civicplus-pages', facts: [
    { type: 'money', value: '$9.40/1,000 gallons', unit: '1,000 gallons', context: 'Tier 1 0-100% of budget: 5000 gallons charged at a rate of $9.40/1,000 gallons' },
    { type: 'money', value: '$11.35/1,000 gallons', unit: '1,000 gallons', context: 'Tier 2 101-120% of budget: 1000 gallons charged at a rate of $11.35/1,000 gallons' },
  ] };
  const build = () => buildFactLedger({ communityId: 'alpha', sources: [source] }, { trusted: true });
  source.facts[0].normalizedValue = 9.401;
  assert.equal(build()[0].normalizedValue, 9.4, 'old amount normalization must not include the unit quantity');
  assert.equal(resolveFactLedger(build(), profile).unresolvedSensitive.length, 0);
  source.facts.push({ type: 'money', value: '$10.00/1,000 gallons', unit: '1,000 gallons', context: 'Tier 1 0-100% of budget: 5000 gallons charged at a rate of $10.00/1,000 gallons' });
  const conflicts = resolveFactLedger(build(), profile).unresolvedSensitive;
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].claimKey, /tier-1/);
});

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

test('fee comparisons preserve explicit pricing units and still flag different per-court prices',()=>{
 const source={id:'court',title:'Pickleball Courts',sourceUrl:'https://alpha.gov/courts',contentHash:'v1',facts:[
  {type:'money',value:'$40',context:'Non-residents: $40/court for four players. Open play for non-residents: $20 for two players.'},
  {type:'money',value:'$20',context:'Non-residents: $40/court for four players. Open play for non-residents: $20 for two players.'}
 ]};
 const index={communityId:'alpha',sources:[source]};
 assert.equal(resolveFactLedger(buildFactLedger(index,{trusted:true}),profile).unresolvedSensitive.length,0);
 source.facts.push({type:'money',value:'$50',context:'Non-residents: $50/court for four players. Open play for non-residents: $20 for two players.'});
 assert.equal(resolveFactLedger(buildFactLedger(index,{trusted:true}),profile).unresolvedSensitive.length,1);
});

test('directory scope handles a blank email field and a following row without mixing companies',()=>{
 const {directoryContactSubjects,contactKey}=require('../lib/community-directory-scopes');
 const url='https://alpha.gov/directory.pdf';
 const maps=directoryContactSubjects([{sourceUrl:url,text:'Company Landscape Design Irrigation Design Landscape Installation Irrigation Installation Email Phone CSI Construction   303-888-5748 D&D Landscaping  d&d.landscaping@gmail.com 303-332-7602 JS Enterprises  jsenterprise10@msn.com 720-254 -8148'}]);
 assert.equal(maps.get(url).get(contactKey('phone','303-888-5748')),'CSI Construction');
 assert.equal(maps.get(url).get(contactKey('email','d&d.landscaping@gmail.com')),'D&D Landscaping');
 assert.equal(maps.get(url).get(contactKey('phone','720-254-8148')),'JS Enterprises');
});
