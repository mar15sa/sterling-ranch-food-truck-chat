const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.WEATHER_BASE||'https://sterling-ranch-food-truck-chat-staging.up.railway.app';
const prefix=process.env.WEATHER_PREFIX||'staging';
(async()=>{const browser=await chromium.launch({channel:'chrome'}),results=[];try{
 for(const [width,height] of [[1440,900],[390,844]]) for(const url of ['/','/food-truck','/community-assistant?test=1','/calendar','/openings','/pool']){
  const p=await browser.newPage({viewport:{width,height}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/{community,rules}/ask',()=>{throw Error('This read-only smoke check must not submit questions')});
  const response=await p.goto(base+url);assert(response.ok(),url+' did not load');await p.locator('.society-enhanced').waitFor();
  if(url==='/'){
   await p.locator('#briefing-events[aria-busy="false"]').waitFor({timeout:60000});
   await p.waitForFunction(()=>!document.querySelector('#briefing-truck').textContent.includes('Checking'),{},{timeout:60000});
   await p.locator('#briefing-weather[aria-busy="false"]').waitFor({timeout:40000});
   const art=await p.locator('.weather-illustration').count();assert(art===1||await p.locator('.weather-unavailable').count()===1);
   if(art)assert((await p.locator('.weather-engraving').first().getAttribute('src')).includes('/weather-art/')||await p.locator('.weather-illustration').getAttribute('data-weather')==='neutral');
  }
  if(url==='/calendar')await p.locator('#briefing-events[aria-busy="false"]').waitFor({timeout:60000});
  if(url==='/openings')await p.locator('.opening-card').first().waitFor({timeout:40000});
  if(url==='/pool')await p.waitForFunction(()=>document.body.dataset.poolState!=='loading',{},{timeout:60000});
  const chat=url.includes('assistant')||url==='/food-truck';
  if(url.includes('assistant'))assert(await p.locator('#testModeBanner').isVisible());
  if(url==='/food-truck')await p.locator('.food-result').waitFor({timeout:60000});
  if(!chat){await p.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';scrollTo(0,document.documentElement.scrollHeight)});await p.waitForTimeout(400);}
  assert(await p.locator('.site-footer').isVisible());
  assert(await p.locator('.site-footer').evaluate((e,clearance)=>[...e.querySelectorAll('b,span,a,p')].every(c=>c.getBoundingClientRect().bottom<=innerHeight-clearance),width>760?48:0),'Footer cut off: '+url+' '+width);
  if(chat){const footer=await p.locator('.site-footer').boundingBox(),input=await p.locator(url.includes('assistant')?'#rulesQuestion':'#questionInput').boundingBox();assert(input.y+input.height<=footer.y,'Composer overlaps footer');}
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
  assert.equal(await p.getByRole('link',{name:'Report a bug',exact:true}).count(),1);
  assert.equal(await p.getByRole('link',{name:'Request a feature',exact:true}).count(),1);
  assert.deepEqual(errors,[]);
  if(url==='/')await p.screenshot({path:path.join(__dirname,`${prefix}-live-home-${width}.png`),fullPage:true});
  results.push({url,width,height,passed:true});console.log('Passed '+url+' '+width);await p.close();
 }
 fs.writeFileSync(path.join(__dirname,prefix+'-site-results.json'),JSON.stringify({results,liveAssistantQuestions:0},null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
