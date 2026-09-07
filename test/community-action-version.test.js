const test=require('node:test');
const assert=require('node:assert/strict');
const {crawlCommunity}=require('../lib/community-ingest');
const authority=Object.fromEntries(['rules','facilities','forms','events','alerts','status','services'].map(x=>[x,['civicplus-pages']]));
const factAuthority=Object.fromEntries(['live-status','facility-hours','reservation-policy','fee','restriction','contact','submission','event-date'].map(x=>[x,['civicplus-pages']]));
const profile={communityId:'alpha',name:'Alpha',website:'https://alpha.gov/',allowedHosts:['alpha.gov'],authority,factAuthority,connectors:[{id:'site',type:'civicplus-pages',baseUrl:'https://alpha.gov/'}]};
const html=target=>`<title>Applications</title><main>Residents should submit the official application for review before starting a project. <a href="${target}">Application form</a></main>`;
const options=target=>({maxPages:1,maxDocuments:1,discoverSitemap:false,lookup:async()=>[{address:'203.0.113.10',family:4}],fetchImpl:async()=>new Response(html(target),{headers:{'content-type':'text/html'}})});

test('changing an action destination changes the source version even with identical visible text',async()=>{
  const first=await crawlCommunity(profile,options('/FormCenter/Apply-1'));
  const old=first.sources.find(s=>s.sourceUrl==='https://alpha.gov/');
  assert.equal(old.actions.length,1);
  old.reviewedAt='2026-09-01T00:00:00Z';old.reviewedBy='Owner';
  const next=await crawlCommunity(profile,{...options('/FormCenter/Apply-2'),previousIndex:first,forceContent:true});
  const changed=next.sources.find(s=>s.sourceUrl==='https://alpha.gov/');
  assert.equal(changed.text,old.text);
  assert.notEqual(changed.actions[0].url,old.actions[0].url);
  assert.notEqual(changed.contentHash,old.contentHash);
  assert.equal(changed.reviewedAt,undefined);
  const items=require('../lib/community-source-review').buildReviewItems(first,next,profile);
  assert(items.some(item=>item.proposedSourceUrl===changed.sourceUrl && item.sourceVersion===changed.contentHash && item.requiresReview));
});

test('configured connector and action destinations are included in source versions',async()=>{
  const p=structuredClone(profile);
  p.connectors.push({id:'booking',type:'civicrec',baseUrl:'https://alpha.gov/booking-one'});
  p.actions=[{id:'apply',label:'Application form',url:'https://alpha.gov/apply-one',sourceType:'forms'}];
  const first=await crawlCommunity(p,options('/FormCenter/Apply-1'));
  p.connectors[1].baseUrl='https://alpha.gov/booking-two';
  p.actions[0].url='https://alpha.gov/apply-two';
  const next=await crawlCommunity(p,options('/FormCenter/Apply-1'));
  for(const id of ['alpha-connector-booking','alpha-action-apply']){
    const old=first.sources.find(s=>s.id===id),updated=next.sources.find(s=>s.id===id);
    assert.equal(old.text,updated.text);
    assert.notEqual(old.contentHash,updated.contentHash);
  }
});

test('pages with identical text and different action targets are not treated as duplicate content',async()=>{
  const p=structuredClone(profile);p.connectors[0].seedUrls=['https://alpha.gov/Second'];
  const result=await crawlCommunity(p,{...options(''),maxPages:2,fetchImpl:async url=>new Response(html(String(url).endsWith('/Second')?'/FormCenter/Apply-2':'/FormCenter/Apply-1'),{headers:{'content-type':'text/html'}})});
  assert(result.sources.some(s=>s.sourceUrl==='https://alpha.gov/'));
  assert(result.sources.some(s=>s.sourceUrl==='https://alpha.gov/Second'));
});
