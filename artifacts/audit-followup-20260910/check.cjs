const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),base='https://sterling-ranch-food-truck-chat-staging.up.railway.app',live=process.env.AUDIT_LIVE==='1';
const files={'/':'index.html','/food-truck':'food-truck.html','/community-assistant':'rules-assistant.html','/openings':'openings.html','/calendar':'calendar.html','/pool':'pool.html'};
const axe='C:/Users/mar15/Documents/Codex/2026-05-14/my-community-does-daily-food-trucks/.worktrees/society-editorial-ui-implementation-20260909/artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js';
const prefix=live?'staging':'candidate';
(async()=>{const browser=await chromium.launch({channel:'chrome'}),results=[];let mockedQuestions=0;
try{for(const [width,height] of [[1440,900],[1024,768],[390,844],[320,740]])for(const [url,file] of Object.entries(files)){
 if(process.env.AUDIT_FOCUS && !(url==='/community-assistant'&&width===390))continue;
 const assistant=url==='/community-assistant',food=url==='/food-truck',chat=assistant||food;
 const p=await browser.newPage({viewport:{width,height},isMobile:width<761,hasTouch:width<761});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 let fixtureNumber=0;
 await p.route('**/api/{community,rules}/ask',r=>{
  assert.equal(r.request().postDataJSON().isTest,true);mockedQuestions++;fixtureNumber++;
  if(fixtureNumber===3)return r.fulfill({status:503,json:{error:'Test fixture: temporary source failure.'}});
  return r.fulfill({json:{answer:fixtureNumber===1?'Browser-only layout fixture. This is a short test answer.':Array(18).fill('Browser-only layout fixture: a longer paragraph to check reading, scrolling, and access to the controls.').join('\n\n'),confidence:{canAnswer:false},sources:[{title:'Browser-only source fixture',sourceUrl:'https://sterlingranchcab.com/',excerpt:'Fixture evidence for disclosure layout checks.'}],actions:[{label:'Official source fixture',url:'https://sterlingranchcab.com/'}]}});
 });
 if(!live) await p.route(base+'/**',r=>{const u=new URL(r.request().url());const file=files[u.pathname]||u.pathname.slice(1);const local=path.join(root,'public',file);if(!u.pathname.startsWith('/api/')&&fs.existsSync(local)&&fs.statSync(local).isFile())return r.fulfill({path:local});return r.fallback();});
 await p.goto(base+url+'?test=1');await p.locator('.society-enhanced').waitFor(); if(url==='/'||url==='/calendar')await p.locator('#briefing-events[aria-busy="false"]').waitFor({timeout:35000}); if(url==='/openings')await p.locator('.opening-card').first().waitFor({timeout:35000});
 if(assistant){await p.locator('#testModeBanner').waitFor();await p.locator('.rules-message').first().waitFor();}
 if(food)await p.locator('.food-result').waitFor({timeout:40000});
 const nav=await p.locator('.society-header').boundingBox();if(width>1000&&url!=='/')assert(Math.abs(nav.height-80)<1,'Nav height '+url);
 assert.equal((await p.locator('.society-nav a[href="/"]').textContent()).trim(),'Today');
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow '+url+' '+width);
 for(const name of ['Report a bug','Request a feature'])assert.equal(await p.getByRole('link',{name,exact:true}).count(),1);
 if(width<761){await p.locator('.society-menu').click();assert(await p.locator('.society-nav a[href="/pool"]').isVisible());await p.keyboard.press('Escape');assert(!(await p.locator('.society-nav').isVisible()));}
 if(chat){
  const input=p.locator(assistant?'#rulesQuestion':'#questionInput'),messages=p.locator(assistant?'#rulesScroll':'#messages'),dock=p.locator(assistant?'#rulesDock':'.food-chat-dock');
  const assertLayout=async()=>{{assert(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'Document scroll '+url+' '+width);assert(await input.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}),'Input cut off');assert(await p.locator('.site-footer').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight+1),'Footer cut off');assert((await messages.boundingBox()).height>=160,'Transcript too short '+url);}};
  await assertLayout();
  if(assistant){const h=(await messages.boundingBox()).height;await p.locator('#startersToggle').click();assert(await p.locator('#rulesStarters').isVisible());assert(Math.abs((await messages.boundingBox()).height-h)<1,'Examples shrank transcript');await p.locator('#startersToggle').click();}
  results.push({url,width,transcriptHeight:(await messages.boundingBox()).height,footerHeight:(await p.locator('.site-footer').boundingBox()).height});
  await p.screenshot({path:path.join(__dirname,prefix+'-'+file+'-'+width+'-initial.png'),fullPage:true});
  if(assistant){
   await p.locator('#statusToggle').click();assert(await p.locator('#statusDetail').isVisible());await p.keyboard.press('Escape');
   const y=await p.evaluate(()=>scrollY);await input.fill('Browser-only short answer layout test');await p.locator('#rulesSend').click();await p.locator('.rules-sources').first().waitFor();await p.waitForTimeout(250);if(width>1000)assert.equal(await p.evaluate(()=>scrollY),y);await assertLayout();
   await input.fill('Browser-only long answer layout test');await p.locator('#rulesSend').click();await p.waitForFunction(()=>document.querySelectorAll('.rules-sources').length===2);await p.waitForTimeout(300);await assertLayout();
  }else{
   await p.route(base+'/api/ask?*',r=>r.fulfill({json:{text:Array(14).fill('Browser-only food truck layout fixture, with a long answer to exercise the chat window.').join('\n\n'),sourceUrl:'https://sterlingranchcab.com/',checkedAt:'2026-09-10T12:00:00Z'}}));await input.fill('Tomorrow');await p.locator('#chatForm button').click();await p.waitForFunction(()=>document.querySelectorAll('.food-result').length===2);await p.waitForTimeout(250);await assertLayout();
  }
  await messages.scrollIntoViewIfNeeded();await messages.evaluate(e=>{e.style.scrollBehavior="auto";e.scrollTop=0;});await p.waitForTimeout(300);const before=await p.evaluate(sel=>({y:scrollY,dock:document.querySelector(sel).getBoundingClientRect().top}),assistant?'#rulesDock':'.food-chat-dock');const b=await messages.boundingBox();await p.mouse.move(b.x+b.width/2,b.y+Math.min(b.height/2,150));await p.mouse.wheel(0,300);await p.waitForTimeout(300);assert(await messages.evaluate(e=>e.scrollTop>100),'Chat did not scroll '+JSON.stringify(await messages.evaluate(e=>({top:e.scrollTop,total:e.scrollHeight,client:e.clientHeight,rect:e.getBoundingClientRect().toJSON()}))));assert.equal(await p.evaluate(()=>scrollY),before.y);assert(Math.abs((await dock.boundingBox()).y-before.dock)<2);
  await messages.evaluate(e=>e.scrollTop=e.scrollHeight);if(assistant){await p.locator('.rules-sources').last().locator('summary').scrollIntoViewIfNeeded();await p.waitForTimeout(600);await p.locator('.rules-sources').last().locator('summary').click();await p.waitForTimeout(250);if(!(await p.locator('.rules-sources').last().evaluate(e=>e.open))){await p.screenshot({path:path.join(__dirname,'source-failure.png')});console.log(await p.locator('.rules-sources').last().evaluate(e=>({html:e.outerHTML,rect:e.getBoundingClientRect().toJSON()})));}assert(await p.locator('.rules-sources').last().evaluate(e=>e.open),'Source disclosure did not open');assert(await p.locator('.rules-source-title').last().isVisible(),await p.locator('.rules-sources').last().evaluate(e=>e.outerHTML));}
  await p.screenshot({path:path.join(__dirname,prefix+'-'+file+'-'+width+'-conversation.png'),fullPage:true});
  await p.addScriptTag({path:axe});const violations=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[],JSON.stringify(violations));
  if(assistant){await input.fill('Browser-only unavailable response layout test');await p.locator('#rulesSend').click();await p.locator('.rules-message-error').waitFor();assert(await p.locator('.rules-retry').isVisible());await assertLayout();}
 }
 if(!chat){await p.screenshot({path:path.join(__dirname,prefix+'-'+file+'-'+width+'.png'),fullPage:true});await p.addScriptTag({path:axe});const violations=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[],JSON.stringify(violations));}
 if(url==='/'){assert.equal(await p.locator('.briefing-jump-links a').count(),5);for(const a of await p.locator('.briefing-jump-links a').all())assert.equal(await p.locator(await a.getAttribute('href')).count(),1);if(width<761)assert((await p.locator('#today-food').boundingBox()).y<(await p.locator('#today-assistant').boundingBox()).y);}
 if(url==='/openings'){assert.match(await p.locator('#result-count').innerText(),/^Showing 1–9 of /);await p.locator('#page-next').click();assert.match(await p.locator('#result-count').innerText(),/^Showing 10–18 of /);await p.locator('#category-filter').selectOption('Coffee & bakeries');assert(await p.locator('.opening-card').count()>0);await p.locator('#search').fill('zzznomatchingfixture');await p.waitForTimeout(400);assert.equal(await p.locator('#result-count').innerText(),'0 matching places');}
 assert.deepEqual(errors,[]);results.push({url,width,height,passed:true});console.log('Passed '+url+' '+width+'x'+height);await p.close();
}fs.writeFileSync(path.join(__dirname,prefix+'-results.json'),JSON.stringify({mockedQuestions,liveQuestions:0,results},null,2));}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
