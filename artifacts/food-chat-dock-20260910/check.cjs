const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),base='https://sterling-ranch-food-truck-chat-staging.up.railway.app',live=process.env.FOOD_DOCK_LIVE==='1';
const axe='C:/Users/mar15/Documents/Codex/2026-05-14/my-community-does-daily-food-trucks/.worktrees/society-editorial-ui-implementation-20260909/artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js';
(async()=>{const browser=await chromium.launch({channel:'chrome'});const results=[];try{
 for(const width of [1448,390,320,768]){
  const page=await browser.newPage({viewport:{width,height:844},isMobile:width<761,hasTouch:width<761});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/{community,rules}/ask',r=>r.abort());
  if(!live){
   await page.route(base+'/food-truck?*',r=>r.fulfill({path:path.join(root,'public/food-truck.html'),contentType:'text/html'}));
   for(const file of ['food-truck-editorial.css','food-chat-dock.js'])await page.route(base+'/'+file+'?*',r=>r.fulfill({path:path.join(root,'public',file),contentType:file.endsWith('.css')?'text/css':'application/javascript'}));
  }
  await page.goto(base+'/food-truck?test=1');await page.locator('.food-result').waitFor({timeout:45000});
  const dock=page.locator('.food-chat-dock');
  async function checkDock(){
   assert(await dock.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&Math.abs(r.bottom-innerHeight)<2;}),'Dock is not pinned');
   assert(await page.locator('#questionInput').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
   assert(await page.locator('#chatForm button').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Send button is covered');
  }
  await checkDock();assert.equal(await page.evaluate(()=>scrollY),0);
  assert.notEqual(await page.locator('.answer-text').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  const prefix=live?'staging':'preview';await page.screenshot({path:path.join(__dirname,prefix+'-'+width+'-top.png')});
  await page.evaluate(()=>scrollTo(0,500));await checkDock();
  await page.screenshot({path:path.join(__dirname,prefix+'-'+width+'-chat.png')});
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await checkDock();
  assert(await page.locator('.society-footer').evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.food-chat-dock').getBoundingClientRect().top),'Footer covered');
  const lastMenu=page.locator('.menu-items li').last();
  await lastMenu.scrollIntoViewIfNeeded();
  assert(await lastMenu.evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.food-chat-dock').getBoundingClientRect().top),'Last menu item covered');
  if(width<761){
   await page.evaluate(()=>scrollTo(0,0));const cdp=await page.context().newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width/2,y:600}]});
   for(let y=570;y>=170;y-=25){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2,y}]});await page.waitForTimeout(20);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);
   assert(await page.evaluate(()=>scrollY>150));await checkDock();
  }
  await page.addScriptTag({path:axe});
  const violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[]);
  // Exercise the viewport resize path that browsers use when a keyboard reduces available space.
  await page.setViewportSize({width,height:420});await page.locator('#questionInput').focus();await checkDock();
  await page.screenshot({path:path.join(__dirname,prefix+'-'+width+'-short-viewport.png')});
  await page.setViewportSize({width,height:844});await checkDock();
  await page.route(base+'/api/ask?*',r=>r.fulfill({json:{text:'Test response to a pinned composer question.',friendlyDate:'September 11, 2026',sourceUrl:'https://example.com/calendar',checkedAt:'2026-09-10T15:00:00Z'}}));
  await page.locator('#questionInput').fill('Tomorrow');await page.locator('#chatForm button').click();
  await page.waitForFunction(()=>document.querySelectorAll('.food-result').length===2);await page.waitForTimeout(500);await checkDock();
  await page.locator('#quickActions button').first().click();await page.waitForFunction(()=>document.querySelectorAll('.food-result').length===3);await page.waitForTimeout(500);await checkDock();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  results.push({width,passed:true,accessibilityViolations:0});await page.close();
 }
 fs.writeFileSync(path.join(__dirname,(live?'staging':'preview')+'-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
