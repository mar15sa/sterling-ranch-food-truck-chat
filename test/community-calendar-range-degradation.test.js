const test=require('node:test'),assert=require('node:assert/strict');
const {createConnectorAdapters}=require('../lib/community-connector-adapter');
const {getCommunityEvents,clearCommunityEventsCache}=require('../lib/community-events');
const profiles=['sterling-ranch','castle-rock'].map(id=>require('../data/communities/'+id+'.json'));
const request={dateRange:{start:'2026-09-15',end:'2026-09-16',label:'two days'},filters:{}};
const initialTime=new Date('2026-09-14T12:00:00Z');
const broken=()=>new Response('<main>Temporarily unavailable</main>');
const healthy=url=>{
 const day=url.searchParams.get('day');
 return new Response('<a id="eventTitle_'+day+'" href="/Calendar.aspx?EID='+day+'"><span>Fixture Event</span></a><span itemprop="startDate">2026-09-'+day+'T19:00:00</span><span itemprop="location"><span itemprop="name">Fixture Hall</span></span>');
};
test('multi-day calendars preserve partial failures and the oldest checked evidence',async()=>{
 for(const profile of profiles)for(const failedDays of [['15'],['15','16']]){
  clearCommunityEventsCache();
  const adapter=createConnectorAdapters(profile).find(a=>a.family==='civicplus-calendar');
  const options={profile,adapter,now:initialTime,fetchImpl:async url=>healthy(url)};
  const original=await getCommunityEvents(request,options);
  assert.equal(original.evidenceEnvelope.degradation.state,'healthy');
  assert.deepEqual(original.evidenceEnvelope.coverage.covered,['event-date','date']);
  const later=new Date(initialTime.getTime()+(adapter.freshness.refreshMinutes+1)*60000);
  const mixed=await getCommunityEvents(request,{...options,now:later,fetchImpl:async url=>failedDays.includes(url.searchParams.get('day'))?broken():healthy(url)});
  assert.equal(mixed.evidenceEnvelope.degradation.state,'degraded',profile.communityId);
  assert.equal(mixed.diagnostics.sourceOutcome,'partial');
  assert.deepEqual(mixed.evidenceEnvelope.coverage.covered,[]);
  assert.deepEqual(mixed.evidenceEnvelope.coverage.missing,['event-date','date']);
  assert.equal(mixed.checkedAt,initialTime.toISOString());
  assert.equal(mixed.evidenceEnvelope.evidence[0].checkedAt,initialTime.toISOString());
  assert.equal(mixed.evidenceEnvelope.evidence[0].staleAfter,original.evidenceEnvelope.evidence[0].staleAfter);
  assert.equal(mixed.events.length,2,'retained data remains available with degraded status');
  await assert.rejects(()=>getCommunityEvents(request,{...options,now:new Date(initialTime.getTime()+(adapter.freshness.staleAfterMinutes+1)*60000),fetchImpl:async()=>broken()}),/parsed reliably/);
 }
});
