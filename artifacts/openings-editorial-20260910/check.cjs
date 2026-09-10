const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='https://sterling-ranch-food-truck-chat-staging.up.railway.app';
const local=process.env.OPENINGS_LIVE!=='1';
const root=path.resolve(__dirname,'../..');
const axe='C:/Users/mar15/Documents/Codex/2026-05-14/my-community-does-daily-food-trucks/.worktrees/society-editorial-ui-implementation-20260909/artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const results=[];let questions=0;
 try{
  for(const width of [1122,390,320,768,1448]){
   const page=await browser.newPage({viewport:{width,height:844},hasTouch:width<761,isMobile:width<761});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/{community,rules}/ask',r=>{questions++;return r.abort();});
   if(local){
    await page.route(base+'/openings?test=1',r=>r.fulfill({path:path.join(root,'public/openings.html'),contentType:'text/html'}));
    for(const file of ['openings-editorial.css','openings.js'])await page.route(base+'/'+file+'?*',r=>r.fulfill({path:path.join(root,'public',file),contentType:file.endsWith('.css')?'text/css':'application/javascript'}));
   }
   const catalogPromise=page.waitForResponse(r=>r.url()===base+'/api/openings');
   await page.goto(base+'/openings?test=1');
   const catalog=await (await catalogPromise).json();
   await page.locator('.opening-card').first().waitFor();
   await page.locator('.society-enhanced').waitFor();
   await page.waitForTimeout(1000);
   assert.equal(await page.locator('#stat-coming').innerText(),String(catalog.stats.coming));
   assert.equal(await page.locator('#stat-soon').innerText(),String(catalog.stats.openingSoon));
   assert.equal(await page.locator('#stat-open').innerText(),String(catalog.stats.open));
   assert.equal(await page.locator('.opening-card').count(),9);
   assert.equal(await page.locator('#list-view').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),width>1000?3:width>760?2:1);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow '+width);
   for(const name of ['Report a bug','Request a feature'])assert.equal(await page.getByRole('link',{name,exact:true,includeHidden:true}).count(),1);
   await page.screenshot({path:path.join(__dirname,(local?'preview':'staging')+'-'+width+'.png'),fullPage:true});
   await page.addScriptTag({path:axe});
   const accessibility=await page.evaluate(async()=>{
    const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
    return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
   });
   fs.writeFileSync(path.join(__dirname,(local?'preview':'staging')+'-axe-'+width+'.json'),JSON.stringify(accessibility,null,2));
   assert.deepEqual(accessibility,[]);
   const firstTitle=await page.locator('.opening-card h3').first().innerText();
   await page.locator('.opening-card summary').first().click();
   assert(await page.locator('.opening-card details').first().evaluate(e=>e.open));
   assert(await page.locator('.opening-card .source-links a').first().isVisible());
   await page.locator('#page-next').click();
   assert.match(await page.locator('#page-status').innerText(),/^Page 2 /);
   assert.notEqual(await page.locator('.opening-card h3').first().innerText(),firstTitle);
   await page.locator('#page-previous').click();
   assert.equal(await page.locator('.opening-card h3').first().innerText(),firstTitle);
   await page.locator('#search').fill(firstTitle);
   await page.waitForTimeout(400);
   assert(await page.locator('.opening-card h3').allTextContents().then(t=>t.includes(firstTitle)));
   await page.locator('#search').fill('zz-no-matching-opening-98765');
   await page.waitForTimeout(400);
   assert(await page.locator('#empty-state').isVisible());
   await page.locator('#clear-filters').click();
   assert.equal(await page.locator('.opening-card').count(),9);
   await page.locator('[data-quick-status="opening-soon"]').click();
   assert.equal(await page.locator('.opening-card:not([data-status="opening-soon"])').count(),0);
   assert.equal(await page.locator('#result-count').innerText(),catalog.stats.openingSoon+' places shown');
   await page.locator('#clear-filters').click();
   await page.locator('#status-filter').selectOption('open');
   assert.equal(await page.locator('.opening-card:not([data-status="open"])').count(),0);
   await page.locator('#clear-filters').click();
   const community=catalog.items[0].community;
   await page.locator('#community-filter').selectOption(community);
   assert((await page.locator('.card-place').allTextContents()).every(t=>t.startsWith(community+' ·')));
   await page.locator('#clear-filters').click();
   const category=catalog.items[0].category;
   await page.locator('#category-filter').selectOption(category);
   assert((await page.locator('.category').allTextContents()).every(t=>t===category));
   await page.locator('#clear-filters').click();
   await page.locator('.leaflet-control-zoom-in').click();
   await page.locator('.openings-catalog-note [data-open-tip]').click();
   assert(await page.locator('#tip-dialog').isVisible());
   await page.keyboard.press('Escape');
   assert(!(await page.locator('#tip-dialog').isVisible()));
   if(width<761){
    await page.evaluate(()=>scrollTo(0,0));
    await page.locator('.society-menu').click();
    assert.equal(await page.locator('.society-nav a:visible').count(),6);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.society-nav a:visible').count(),0);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width/2,y:380}]});
    for(let y=350;y>=100;y-=25){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2,y}]});await page.waitForTimeout(20);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(250);
    assert(await page.evaluate(()=>scrollY>150),'Touch scrolling '+width);
   }
   assert.deepEqual(errors,[]);
   results.push({width,passed:true,cards:9,accessibilityViolations:accessibility.length});
   await page.close();
  }
  assert.equal(questions,0);
  fs.writeFileSync(path.join(__dirname,(local?'preview':'staging')+'-results.json'),JSON.stringify({questions,results},null,2));
  console.log(JSON.stringify({questions,results}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
