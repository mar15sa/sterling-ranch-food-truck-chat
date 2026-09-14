const test = require('node:test');
const assert = require('node:assert/strict');
const {eventMatchesFilter, getCommunityEvents, clearCommunityEventsCache} = require('../lib/community-events');
const {createConnectorAdapters} = require('../lib/community-connector-adapter');
const profiles = [require('../data/communities/sterling-ranch.json'), require('../data/communities/castle-rock.json')];
const event = (title, location = 'Town Hall', category = 'Community Events') => ({title, location, category});
const matches = (entry, value, field = 'category') => eventMatchesFilter(entry, {field, value});

test('activity filters reject generic-word, substring and venue-only collisions', () => {
  for (const value of ['yoga class', 'Yoga classes', 'yoga events']) {
    assert.equal(matches(event('Yoga w/Laura'), value), true);
    assert.equal(matches(event('Swimming class'), value), false);
    assert.equal(matches(event('Swimming class', 'Yoga Studio'), value), false);
  }
  assert.equal(matches(event('Party Night'), 'art'), false);
  assert.equal(matches(event('Art Workshop'), 'art'), true);
  assert.equal(matches(event('Table Tennis'), 'table tennis'), true);
  assert.equal(matches(event('Tennis'), 'table tennis'), false);
  assert.equal(matches(event('Craft Sale'), 'arts and crafts'), false);
});

test('venue filters require the requested venue words, including short and accented names', () => {
  for (const field of ['location', 'facility']) {
    assert.equal(matches(event('Movie', 'Town Hall'), 'the Town Hall', field), true);
    assert.equal(matches(event('Movie', 'Great Hall'), 'Town Hall', field), false);
    assert.equal(matches(event('Town Hall Movie', 'Great Hall'), 'Town Hall', field), false);
    assert.equal(matches(event('Movie', 'Room 2'), 'Room 1', field), false);
    assert.equal(matches(event('Movie', 'Café A'), 'Café A', field), true);
    assert.equal(matches(event('Movie', 'Café B'), 'Café A', field), false);
  }
});

test('explicit alternatives, broad categories and existing audience synonyms remain usable', () => {
  assert.equal(matches(event('Swimming class'), 'yoga or swimming'), true);
  assert.equal(matches(event('Tennis class'), 'yoga or swimming'), false);
  assert.equal(matches(event('Movie', 'Great Hall'), 'Town Hall or Great Hall', 'location'), true);
  assert.equal(matches(event('Swimming Class'), 'classes'), true);
  assert.equal(matches(event('Movie Night', 'Town Hall', 'Movies'), 'classes'), false);
  assert.equal(matches(event('Movie Night'), 'events'), true);
  assert.equal(matches(event('Youth Art Class'), 'youth kids', 'audience'), true);
  assert.equal(matches(event('Movie'), ''), false);
});

for (const profile of profiles) test(`${profile.communityId}: named filters keep matching events and source scope through the adapter`, async () => {
  clearCommunityEventsCache();
  const adapter = createConnectorAdapters(profile).find(a => a.family === 'civicplus-calendar');
  const entries = [event('Yoga w/Laura'), event('Swimming class'), event('Yoga', 'Great Hall')];
  const html = entries.map((e, i) => `<a id="eventTitle_${i+1}" href="/Calendar.aspx?EID=${i+1}"><span>${e.title}</span></a><span itemprop="startDate">2026-09-15T10:00:00</span><span itemprop="location"><span itemprop="name">${e.location}</span></span>`).join('');
  const request = {dateRange:{start:'2026-09-15',end:'2026-09-15',label:'tomorrow'}, filters:{category:'yoga class',location:'Town Hall'}};
  const options = {profile,adapter,now:new Date('2026-09-14T18:00:00Z'),fetchImpl:async()=>new Response(html)};
  const result = await getCommunityEvents(request, options);
  assert.deepEqual(result.events.map(e=>e.id), ['1']);
  assert.equal(result.evidenceEnvelope.communityId, profile.communityId);
  assert.deepEqual(result.evidenceEnvelope.request.filters, request.filters);
  assert.equal(result.diagnostics.afterFilterCount, 1);
  assert.equal(result.evidenceEnvelope.degradation.state, 'healthy');
  const absent = await getCommunityEvents({...request,filters:{category:'table tennis'}}, options);
  assert.equal(absent.events.length, 0);
  assert.equal(absent.alternatives.length, 3);
  assert.deepEqual(absent.range, request.dateRange);
});
