const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='https://sterling-ranch-food-truck-chat-staging.up.railway.app';
const local=process.env.FOOD_LIVE!=='1';
const root=path.resolve(__dirname,'../..');
const axe='C:/Users/mar15/Documents/Codex/2026-05-14/my-community-does-daily-food-trucks/.worktrees/society-editorial-ui-implementation-20260909/artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js';
const fixture={text:'Test listing for a menu layout check.',truck:'Example Kitchen',friendlyDate:'Thursday, September 10, 2026',sourceUrl:'https://example.com/calendar',checkedAt:'2026-09-10T15:00:00Z',menu:{featuredLinks:{official:{url:'https://example.com',title:'Example Kitchen'},instagram:{url:'https://example.com/social',title:'Instagram'}},items:[{name:'Roasted vegetable bowl',price:'$14.00',description:'Seasonal vegetables served over rice with a herb dressing.'},{name:'Chicken sandwich',price:'$14.00',description:'Grilled chicken with salad and your choice of sauce.'},{name:'Rice bowl',price:'$14.00',description:'Rice topped with vegetables, feta cheese, and sauce.'},{name:'Dinner platter',price:'$16.00',description:'A generous platter with fresh sides.'}],links:[{url:'https://example.com/menu',title:'Full menu'}]}};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const results=[];let communityQuestions=0;
 try{
  for(const width of [1448,390,320,768]){
   const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<761,isMobile:width<761});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/{community,rules}/ask',r=>{communityQuestions++;return r.abort();});
   if(local){
    await page.route(base+'/food-truck?*',r=>r.fulfill({path:path.join(root,'public/food-truck.html'),contentType:'text/html'}));
    for(const file of ['food-truck-editorial.css','app.js','society-food-truck-v2.webp'])await page.route(base+'/'+file+'*',r=>r.fulfill({path:path.join(root,'public',file),contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'image/webp'}));
   }
   const responsePromise=page.waitForResponse(r=>r.url().startsWith(base+'/api/ask?'));
   await page.goto(base+'/food-truck?test=1');
   const catalog=await (await responsePromise).json();
   await page.locator('.food-result').waitFor({timeout:45000});
   assert.equal(await page.locator('#messages .message.user').count(),0);
   assert.equal(await page.evaluate(()=>scrollY),0,'Initial page should show the header');
   assert.equal(await page.locator('#messages > .message').count(),1,'Only the useful initial answer should be shown');
   assert(await page.locator('.food-hero').evaluate(e=>e.offsetWidth===e.parentElement.clientWidth),'Hero must use the full page width');
   const expectedItems=(catalog.trucks?.length?catalog.trucks.flatMap(t=>t.menu?.items||[]):catalog.menu?.items||[]);
   assert.deepEqual(await page.locator('#messages .menu-name > span:first-child').allTextContents(),expectedItems.map(i=>i.name));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
   for(const name of ['Report a bug','Request a feature'])assert.equal(await page.getByRole('link',{name,exact:true,includeHidden:true}).count(),1);
   await page.screenshot({path:path.join(__dirname,(local?'preview':'staging')+'-live-'+width+'.png'),fullPage:true});
   await page.addScriptTag({path:axe});
   const violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});
   fs.writeFileSync(path.join(__dirname,(local?'preview':'staging')+'-axe-'+width+'.json'),JSON.stringify(violations,null,2));
   assert.deepEqual(violations,[]);
   if(width<761){
    await page.locator('.society-menu').click();assert.equal(await page.locator('.society-nav a:visible').count(),6);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.society-nav a:visible').count(),0);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width/2,y:650}]});
    for(let y=625;y>=225;y-=25){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2,y}]});await page.waitForTimeout(20);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);
    assert(await page.evaluate(()=>scrollY>150),'Touch scrolling blocked');
   }
   await page.locator('#questionInput').focus();
   assert(await page.locator('#questionInput').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
   let next=fixture,fail=false,requestUrl='';
   await page.route(base+'/api/ask?*',r=>{requestUrl=r.request().url();return r.fulfill({status:fail?503:200,json:fail?{error:'The food truck service is temporarily unavailable. Please try again in a minute.'}:next});});
   await page.reload();await page.locator('.food-result').waitFor();
   await page.screenshot({path:path.join(__dirname,(local?'preview':'staging')+'-single-fixture-'+width+'.png'),fullPage:true});
   assert.equal(await page.locator('.menu-items:not(.hidden) li').count(),4);
   assert.deepEqual(await page.locator('.menu-price').allTextContents(),fixture.menu.items.map(i=>i.price));
   await page.locator('.truck-more-section:not(.hidden) summary').click();assert(await page.getByRole('link',{name:'Full menu',exact:true}).isVisible());
   await page.locator('#quickActions button').nth(1).click();
   await page.waitForFunction(()=>document.querySelectorAll('.food-result').length===2);
   assert(new URL(requestUrl).searchParams.get('date'));
   await page.waitForTimeout(500);
   assert(await page.locator('.food-result').last().evaluate(e=>e.getBoundingClientRect().top>=0&&e.getBoundingClientRect().top<150),'New answer not brought into view');
   next={...fixture,truck:null,menu:null,text:'No food truck is listed for this date.'};
   await page.locator('#questionInput').fill('What food truck is here October 1?');await page.locator('#chatForm button').click();
   await page.waitForFunction(()=>document.querySelectorAll('.food-result').length===3);
   assert.match(new URL(requestUrl).searchParams.get('q'),/October 1/);
   assert.equal(await page.locator('.food-result').last().locator('.truck-card:not(.hidden)').count(),0);
   next={...fixture,menu:{items:[],featuredLinks:fixture.menu.featuredLinks}};
   await page.locator('#quickActions button').first().click();await page.waitForFunction(()=>document.querySelectorAll('.food-result').length===4);
   assert(await page.locator('.food-result').last().locator('.menu-fallback').isVisible());
   next={...fixture,trucks:[{name:'Example Kitchen',location:'Community hall',menu:fixture.menu},{name:'Second test truck',location:'Park',menu:{items:[{name:'Daily special'}]}}]};
   await page.locator('#quickActions button').nth(2).click();await page.waitForFunction(()=>document.querySelectorAll('.food-result').length===5);
   const multi=page.locator('.food-result').last();
   assert.equal(await multi.locator('.truck-listing').count(),2);
   assert.equal(await multi.locator('.menu-items li').count(),5);
   assert.equal(await multi.locator('.truck-listing').last().locator('.menu-price').count(),0,'Do not invent missing prices');
   assert.match(await multi.locator('.truck-listing').first().locator('.label').first().innerText(),/Community hall/i);
   fail=true;
   await page.locator('#questionInput').fill('Tomorrow');await page.locator('#chatForm button').click();
   await page.waitForFunction(()=>document.querySelector('#statusPill').textContent==='Try again');
   assert.match(await page.locator('#messages .message').last().innerText(),/temporarily unavailable/);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow after conversation');
   assert.deepEqual(errors,[]);
   results.push({width,liveMenuItems:expectedItems.length,passed:true,accessibilityViolations:0});await page.close();
  }
  assert.equal(communityQuestions,0);
  fs.writeFileSync(path.join(__dirname,(local?'preview':'staging')+'-results.json'),JSON.stringify({communityQuestions,results},null,2));
  console.log(JSON.stringify({communityQuestions,results}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
