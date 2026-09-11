const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),base='https://sterling-ranch-food-truck-chat-staging.up.railway.app',live=process.env.COMMUNITY_LIVE==='1';
const pages={'/calendar':'calendar.html','/pool':'pool.html','/community-assistant':'rules-assistant.html'};
const axe='C:/Users/mar15/Documents/Codex/2026-05-14/my-community-does-daily-food-trucks/.worktrees/society-editorial-ui-implementation-20260909/artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js';
(async()=>{const browser=await chromium.launch({channel:'chrome'});const results=[];let questions=0;
try{for(const width of process.env.CHECK_WIDTH?[Number(process.env.CHECK_WIDTH)]:[1448,820,390,320])for(const [url,file] of Object.entries(pages)){
 const page=await browser.newPage({viewport:{width,height:1000},isMobile:width<761,hasTouch:width<761});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/{community,rules}/ask',r=>{questions++;return r.abort()});
 if(!live){await page.route(base+url+'?test=1',r=>r.fulfill({path:path.join(root,'public',file),contentType:'text/html'}));await page.route(base+'/community-editorial.css?*',r=>r.fulfill({path:path.join(root,'public/community-editorial.css'),contentType:'text/css'}));}
 await page.goto(base+url+'?test=1');await page.locator('.society-enhanced').waitFor();
 if(url==='/calendar')await page.locator('#briefing-events[aria-busy="false"]').waitFor({timeout:35000});
 if(url==='/pool')await page.waitForFunction(()=>document.body.dataset.poolState!=='loading',{timeout:35000});
 if(url==='/community-assistant'){await page.locator('#testModeBanner').waitFor();await page.locator('.rules-message').first().waitFor();}
 await page.screenshot({path:path.join(__dirname,(live?'staging':'preview')+'-'+file+'-'+width+'.png'),fullPage:true});
 assert.equal((await page.locator('.society-nav a[href="/"]').textContent()).trim(),'Today');
 for(const name of ['Report a bug','Request a feature'])assert.equal(await page.getByRole('link',{name,exact:true}).count(),1);
 assert.equal(await page.locator('.site-footer img,.site-footer svg,.site-footer .community-monogram').count(),0);
 assert(await page.locator('.community-hero-art').evaluate(e=>e.complete&&e.naturalWidth>0));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow '+url+' '+width);
 if(width<761){await page.locator('.society-menu').click();assert(await page.locator('.society-nav a[href="/pool"]').isVisible());await page.keyboard.press('Escape');assert(!(await page.locator('.society-nav').isVisible()));}
 if(url==='/community-assistant'){
  await page.locator('#statusToggle').click();assert(await page.locator('#statusDetail').isVisible());assert(await page.locator('#statusDetail').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}));await page.locator('#statusToggle').click();
  await page.locator('#rulesQuestion').fill('Draft only — no submission');assert(await page.locator('#rulesQuestion').isVisible());await page.locator('#rulesQuestion').fill('');
  // Duplicate the welcome text only in this browser to exercise a long thread without submitting questions.
  await page.locator('#rulesMessages').evaluate(e=>{for(let i=0;i<10;i++)e.append(e.firstElementChild.cloneNode(true));});
  const scroller=page.locator('#rulesScroll');await scroller.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>({y:scrollY,dock:document.querySelector('#rulesDock').getBoundingClientRect().top}));const box=await scroller.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+Math.min(box.height/2,200));await page.mouse.wheel(0,300);await page.waitForTimeout(250);
  assert(await scroller.evaluate(e=>e.scrollTop>100));assert.equal(await page.evaluate(()=>scrollY),before.y);assert(Math.abs((await page.locator('#rulesDock').boundingBox()).y-before.dock)<2);
 }
 await page.addScriptTag({path:axe});const violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});
 assert.deepEqual(violations,[],JSON.stringify(violations));assert.deepEqual(errors,[]);
 if(url==='/pool'){
  await page.route('**/api/pool/status*',r=>r.fulfill({json:{state:'current',headline:'Test fixture: pool status',summary:'Exact source text for layout testing.',residentAction:'Read the official source.',checkedAt:'2026-09-10T12:00:00Z',sourceUrl:'https://sterlingranchcab.com/187/Pool'}}));await page.locator('#refreshStatus').click();await page.waitForFunction(()=>document.body.dataset.poolState==='current');assert.equal(await page.locator('#poolStatusSummary').innerText(),'Exact source text for layout testing.');
  await page.route('**/api/pool/status*',r=>r.fulfill({status:503,json:{error:'Test outage'}}));await page.locator('#refreshStatus').click();await page.waitForFunction(()=>document.body.dataset.poolState==='unknown');assert(await page.locator('#poolActionLink').isVisible());assert((await page.locator('#poolStatusTitle').innerText()).includes('unavailable'));
 }
 if(url==='/calendar'){
  await page.route('**/api/community/events',r=>r.fulfill({json:{status:'empty',events:[]}}));await page.reload();await page.locator('#briefing-events[aria-busy="false"]').waitFor();assert((await page.locator('#briefing-events').innerText()).includes('No upcoming events'));
  await page.route('**/api/community/events',r=>r.fulfill({status:503,json:{error:'Test outage'}}));await page.reload();await page.locator('#briefing-events[aria-busy="false"]').waitFor();assert(await page.locator('#briefing-events a[href="/community-calendar"]').isVisible());
 }
 results.push({url,width,passed:true});console.log('Passed '+url+' '+width);await page.close();
}assert.equal(questions,0);fs.writeFileSync(path.join(__dirname,(live?'staging':'preview')+'-results.json'),JSON.stringify({questions,results},null,2));}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
