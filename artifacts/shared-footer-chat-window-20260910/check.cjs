const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),base='https://sterling-ranch-food-truck-chat-staging.up.railway.app',live=process.env.SHARED_LIVE==='1';
const pages={'/':'index.html','/food-truck':'food-truck.html','/community-assistant':'rules-assistant.html','/calendar':'calendar.html','/openings':'openings.html','/pool':'pool.html'};
const axe='C:/Users/mar15/Documents/Codex/2026-05-14/my-community-does-daily-food-trucks/.worktrees/society-editorial-ui-implementation-20260909/artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js';
(async()=>{const browser=await chromium.launch({channel:'chrome'});const results=[];let referenceFooter,questions=0;
try{for(const width of process.env.CHECK_WIDTH?[Number(process.env.CHECK_WIDTH)]:[1448,390,320])for(const [url,file] of Object.entries(pages)){
 const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<761,isMobile:width<761});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/{community,rules}/ask',r=>{questions++;return r.abort()});
 if(!live){await page.route(base+url+'?test=1',r=>r.fulfill({path:path.join(root,'public',file),contentType:'text/html'}));
 for(const asset of ['society-footer.css','briefing-home.css','food-truck-editorial.css','app.js'])await page.route(base+'/'+asset+'?*',r=>r.fulfill({path:path.join(root,'public',asset),contentType:asset.endsWith('.css')?'text/css':'application/javascript'}));}
 await page.goto(base+url+'?test=1');await page.locator('.society-enhanced').waitFor();
 assert.equal((await page.locator('.society-nav a[href="/"]').textContent()).trim(),'Today');
 assert(!(await page.locator('.society-nav').textContent()).includes('Briefing'));
 const footer=page.locator('.site-footer');const markup=await footer.innerHTML();referenceFooter??=markup;assert.equal(markup,referenceFooter,'Footer markup mismatch '+url);
 assert.equal(await footer.locator('svg,img,.society-monogram,.heritage-seal').count(),0);
 for(const name of ['Report a bug','Request a feature'])assert.equal(await page.getByRole('link',{name,exact:true}).count(),1);
 assert(!/opens an email draft/i.test(await footer.innerText()));
 if(url==='/community-assistant')assert(await page.getByText('Test mode',{exact:false}).first().isVisible());
 if(url==='/food-truck'){
  const messages=page.locator('#messages'),dock=page.locator('.food-chat-dock');await page.locator('.food-result').waitFor({timeout:45000});
  assert(await dock.evaluate(e=>!!e.closest('.chat-panel')&&getComputedStyle(e).position==='static'));
  assert(await messages.evaluate(e=>getComputedStyle(e).overflowY==='auto'&&e.scrollHeight>e.clientHeight));
  await page.locator('.chat-panel').scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>({y:scrollY,dock:document.querySelector('.food-chat-dock').getBoundingClientRect().top}));
  const box=await messages.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+Math.min(box.height/2,200));await page.mouse.wheel(0,350);await page.waitForTimeout(300);
  assert(await messages.evaluate(e=>e.scrollTop>100),'Message list did not scroll');
  assert.equal(await page.evaluate(()=>scrollY),before.y,'Document moved instead of messages');
  assert(Math.abs((await dock.boundingBox()).y-before.dock)<2,'Composer moved with messages');
  if(width<761){const cdp=await page.context().newCDPSession(page);const b=await messages.boundingBox();const x=b.x+b.width/2,y=Math.min(b.y+b.height-30,600);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let next=y-25;next>y-200;next-=25){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:next}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>scrollY),before.y);}
  await page.locator('#questionInput').focus();assert(await dock.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}));
  assert(await page.locator('#questionInput').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));
  await messages.evaluate(e=>{e.scrollTop=e.scrollHeight});
  assert(await page.locator('.result-meta').last().evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.food-chat-dock').getBoundingClientRect().top));
  await page.route(base+'/api/ask?*',r=>r.fulfill({json:{text:'Test response for chat scrolling.',sourceUrl:'https://example.com/calendar',checkedAt:'2026-09-10T15:00:00Z'}}));
  const y=await page.evaluate(()=>scrollY);await page.locator('#questionInput').fill('Tomorrow');await page.locator('#chatForm button').click();await page.waitForFunction(()=>document.querySelectorAll('.food-result').length===2);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>scrollY),y);
  await page.locator('#quickActions button').first().click();await page.waitForFunction(()=>document.querySelectorAll('.food-result').length===3);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>scrollY),y);
  assert((await footer.boundingBox()).y>=(await dock.boundingBox()).y+(await dock.boundingBox()).height,'Footer is not below composer');
  await page.screenshot({path:path.join(__dirname,(live?'staging':'preview')+'-chat-'+width+'.png'),fullPage:true});
 }
 await footer.scrollIntoViewIfNeeded();await footer.screenshot({path:path.join(__dirname,(live?'staging':'preview')+'-'+file+'-'+width+'-footer.png')});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow '+url+' '+width);
 await page.addScriptTag({path:axe});const violations=await page.evaluate(async(food)=>{const r=await axe.run(food?document:document.querySelector('.site-footer'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));},url==='/food-truck');assert.deepEqual(violations,[]);
 assert.deepEqual(errors,[]);results.push({url,width,passed:true});await page.close();
}assert.equal(questions,0);fs.writeFileSync(path.join(__dirname,(live?'staging':'preview')+'-results.json'),JSON.stringify({questions,results},null,2));console.log(JSON.stringify({questions,results}));}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
