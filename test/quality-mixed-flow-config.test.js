const test=require('node:test'),assert=require('node:assert/strict');
const {cases,variants,liveOptions}=require('../scripts/quality-eval/mixed-flow-config');
const profile=require('../data/communities/sterling-ranch.json');
const {localToday}=require('../lib/community-interpretation');
test('mixed comparison includes current control, independent writer choices and follow-ups',()=>{
 assert.equal(cases.length,6);assert.equal(new Set(cases.map(c=>c.id)).size,6);
 assert.ok(cases.some(c=>c.context.length));assert.equal(variants.filter(v=>v.current).length,1);
 for(const v of variants.filter(v=>!v.current)){assert.equal(v.models.interpret,'claude-haiku-4-5');assert.ok(['claude-sonnet-5','claude-opus-5'].includes(v.models.compose));}
 assert.doesNotMatch(JSON.stringify(variants),/fable|astra/i);
});
test('current control uses actual profile food/status/calendar/waste helpers rather than disconnected fallbacks',async()=>{
 const day=localToday(new Date(),profile.timezone),calls=[];
 const live=liveOptions(profile,{fetchImpl:async(url)=>{
  const u=String(url);calls.push(u);
  if(u.includes('EID=6150'))return new Response(`${Number(day.slice(5,7))}/${Number(day.slice(8,10))}/${day.slice(0,4)} - Test Kitchen`);
  if(u.includes('address-suggest'))return Response.json([{place_id:'A1234567-1234-1234-1234-123456789012',address:'7853 Piney River Avenue'}]);
  if(u.includes('/events?'))return Response.json({events:[{day,flags:[{name:'Recycling'}]}]});
  if(u.includes('Calendar')||u.includes('calendar'))return new Response(`<a id="eventTitle_1" href="/Calendar.aspx?EID=1"><span>Yoga</span></a><span itemprop="startDate">${day}T19:00:00</span>`);
  return new Response('<a class="widgetGraphicLinksLink" href="/187/Pool"><img alt="Green Light"></a>');
 }});
 assert.equal((await live.current.getFoodTruckAnswer('Which food truck is here today?')).trucks[0].name,'Test Kitchen');
 assert.throws(()=>live.current.getFoodTruckAnswer('Next food truck'),/resolved single/);
 assert.equal((await live.current.getPoolStatus()).headline,'Open');
 assert.equal((await live.current.getCommunityEvents({dateRange:{start:day,end:day},filters:{category:'yoga'}})).events[0].title,'Yoga');
 assert.equal((await live.current.getWasteSchedule({question:'recycling'})).service,'recycling');
 assert.ok(calls.some(u=>u.includes('api.recollect.net')));assert.equal(typeof live.liveRetrieve,'function');
});
