const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const base = process.env.WEATHER_BASE || 'https://sterling-ranch-food-truck-chat-staging.up.railway.app';
const live = process.env.WEATHER_LIVE === '1';
const prefix = process.env.WEATHER_PREFIX || (live ? 'staging' : 'candidate');
const axe = 'C:/Users/mar15/Documents/Codex/2026-05-14/my-community-does-daily-food-trucks/.worktrees/society-editorial-ui-implementation-20260909/artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js';
const urls = {'/':'index.html','/food-truck':'food-truck.html','/community-assistant':'rules-assistant.html','/calendar':'calendar.html','/openings':'openings.html','/pool':'pool.html'};
const period = (forecast, day = true, name = 'Today', temperature = 91) => ({name, temperature, isDaytime:day, shortForecast:forecast, precipitation:5, windSpeed:'3 to 7 mph', windDirection:'N'});
const forecast = (...periods) => ({status:'ok', updatedAt:new Date().toISOString(), periods:periods.length ? periods : [period('Mostly Sunny'),period('Partly Cloudy',false,'Tonight',58),period('Mostly Sunny then Slight Chance Showers And Thunderstorms',true,'Saturday',86),period('Partly Cloudy',false,'Saturday Night',61)]});
const cases = [
 ['Sunny',true,'sun'], ['Clear',false,'moon'], ['Mostly Sunny',true,'partly'], ['Mostly Clear',false,'night-cloud'],
 ['Partly Cloudy',true,'partly'], ['Partly Cloudy',false,'night-cloud'], ['Mostly Cloudy',true,'cloud'], ['Overcast',false,'cloud'],
 ['Rain Showers',true,'rain'], ['Rain',false,'rain'], ['Drizzle',false,'rain'], ['Snow Showers',true,'snow'], ['Snow',false,'snow'],
 ['Freezing Rain',true,'snow'], ['Sleet',false,'snow'], ['Ice',true,'snow'], ['Flurries',true,'snow'], ['Thunderstorms',true,'storm'],
 ['Slight Chance Showers And Thunderstorms',false,'storm'], ['Fog',true,'fog'], ['Patchy Fog',false,'fog'], ['Haze',true,'fog'],
 ['Hazy',true,'fog'], ['Smoke',false,'fog'], ['Sunny And Breezy',true,'wind'], ['Mostly Cloudy And Windy',false,'wind'],
 ['Blowing Snow',true,'snow'], ['Rain And Windy',false,'rain'], ['Unknown',true,'neutral'], ['',false,'neutral'], ['Nice',true,'neutral'],
];
(async () => {
 const browser = await chromium.launch({channel:'chrome'});
 const results = {viewports:[],conditionCases:[],liveAssistantQuestions:0};
 async function page(width=1440,height=1000) {
  const p = await browser.newPage({viewport:{width,height},isMobile:width<761,hasTouch:width<761});
  if (!live) await p.route(base+'/**',r=>{const u=new URL(r.request().url()),file=path.join(root,'public',urls[u.pathname]||u.pathname.slice(1));return !u.pathname.startsWith('/api/')&&fs.existsSync(file)&&fs.statSync(file).isFile()?r.fulfill({path:file}):r.fallback()});
  await p.route('**/api/{community,rules}/ask',()=>{throw new Error('No Assistant question may be submitted by this weather check')});
  return p;
 }
 async function loaded(p) {
  await p.locator('#briefing-weather[aria-busy="false"]').waitFor();
  await p.waitForFunction(()=>[...document.querySelectorAll('#briefing-weather img')].every(e=>e.complete&&e.naturalWidth>0));
 }
 try {
  for (const [width,height] of [[1440,1000],[1920,1080],[1024,768],[800,700],[390,844],[320,740]]) {
   const p=await page(width,height),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/api/weather',r=>r.fulfill({json:forecast()}));
   await p.goto(base);await loaded(p);
   assert.equal(await p.locator('.weather-hero-icon').count(),0);
   assert.equal(await p.locator('.weather-illustration img').count(),1);
   assert.equal(await p.locator('.weather-illustration').getAttribute('data-weather'),'partly');
   assert.equal(await p.locator('.weather-symbol').count(),3);
   assert((await p.locator('.weather-illustration img').getAttribute('src')).endsWith('/partly.webp'));
   assert.equal((await p.locator('.weather-zip').textContent()).trim(),'80125');
   assert((await p.getByRole('link',{name:'Full forecast'}).getAttribute('href')).includes('80125'));
   assert.equal(await p.locator('.weather-hero').evaluate(e=>getComputedStyle(e).backgroundImage),'none');
   assert((await p.locator('.weather-temperature').evaluate(e=>getComputedStyle(e).fontFamily)).includes('Times New Roman'));
   const geometry=await p.locator('.weather-hero').boundingBox();
   assert(geometry.height <= 220,'Hero is taller than mockup proportions: '+JSON.stringify({width,geometry}));
   assert.equal(await p.locator('.weather-next-condition').nth(1).getAttribute('title'),'Mostly Sunny then Slight Chance Showers And Thunderstorms');
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
   await p.addScriptTag({path:axe});
   const violations=await p.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
   assert.deepEqual(violations,[]);
   await p.locator('#today-weather').screenshot({path:path.join(__dirname,`${prefix}-weather-${width}.png`)});
   await p.screenshot({path:path.join(__dirname,`${prefix}-home-${width}.png`),fullPage:true});
   assert.deepEqual(errors,[]);
   results.viewports.push({width,height,heroHeight:geometry.height,passed:true});await p.close();
  }
  const p=await page(390,844);let data=forecast(),status=200;
  await p.route('**/api/weather',r=>r.fulfill({status,json:data}));
  await p.goto(base);await loaded(p);
  for(const [text,day,expected] of cases) {
   data=forecast(period(text,day),period(text,day,'Next period',65));
   await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   await p.waitForFunction(expected=>document.querySelector('.weather-illustration')?.dataset.weather===expected,expected);
   await p.waitForFunction(text=>document.querySelector('.weather-condition')?.textContent===text,text);
   await loaded(p);
   assert.equal(await p.locator('.weather-condition').textContent(),text);
   assert.equal(await p.locator('.weather-range-label').textContent(),day?'Forecast high':'Forecast low');
   assert.equal(await p.locator('.weather-symbol').getAttribute('data-weather'),expected);
   const positions={sun:'0% 0%',partly:'25% 0%',cloud:'50% 0%',rain:'75% 0%',storm:'100% 0%',moon:'0% 100%','night-cloud':'25% 100%',snow:'50% 100%',fog:'75% 100%',wind:'100% 100%'};
   if(expected==='neutral')assert.equal(await p.locator('.weather-symbol').evaluate(e=>getComputedStyle(e).backgroundImage),'none');
   else assert.equal(await p.locator('.weather-symbol').evaluate(e=>getComputedStyle(e).backgroundPosition.replaceAll('0px','0%')),positions[expected]);
   if(!results.conditionCases.some(c=>c.artwork===expected))await p.locator('#today-weather').screenshot({path:path.join(__dirname,`${prefix}-condition-${expected}.png`)});
   results.conditionCases.push({text,day,artwork:expected,passed:true});
  }
  data=forecast({...period('Sunny'),precipitation:0,windSpeed:null});await p.reload();await loaded(p);
  assert.equal(await p.locator('.weather-outlook').count(),0);
  assert.equal(await p.locator('.weather-metric').count(),1);assert((await p.locator('.weather-metrics').textContent()).includes('0%'));
  data=forecast({...period('Sunny'),precipitation:null,windSpeed:null});await p.reload();await loaded(p);assert.equal(await p.locator('.weather-metrics').count(),0);
  data=forecast(period('Sunny',true,'A very long forecast period title',-10));data.periods[0].shortForecast='Mostly Sunny then Slight Chance Showers And Thunderstorms And Strong Wind Gusts';
  await p.reload();await loaded(p);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.route('**/weather-art/*.webp',r=>r.abort());await p.reload();await p.locator('.weather-engraving[hidden]').waitFor({state:'attached'});assert(await p.locator('.weather-condition').isVisible());
  await p.unroute('**/weather-art/*.webp');
  for(const unavailable of [{status:'unavailable',periods:[]},{status:'ok',periods:[]},null]) {
   data=unavailable;await p.reload();await p.locator('.weather-unavailable').waitFor();assert.equal(await p.locator('#briefing-weather img').count(),0);assert(await p.getByRole('link',{name:'Full forecast'}).isVisible());
  }
  status=503;await p.reload();await p.locator('.weather-unavailable').waitFor();status=200;
  data=forecast(period('Clear',false,'Tonight',58));await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await loaded(p);
  assert.equal(await p.locator('.weather-illustration').getAttribute('data-weather'),'moon');await p.close();
  const clockPage=await page();await clockPage.clock.install();let requests=0;
  await clockPage.route('**/api/weather',r=>{requests++;return r.fulfill({json:requests===1?forecast({...period('Sunny'),endTime:new Date(Date.now()+5000).toISOString()}):forecast(period('Clear',false,'Tonight',58))})});
  await clockPage.goto(base);await loaded(clockPage);await clockPage.clock.fastForward(7000);await clockPage.waitForFunction(()=>document.querySelector('.weather-illustration')?.dataset.weather==='moon');assert.equal(requests,2);await clockPage.close();
  results.refresh={periodBoundary:true,visibility:true,recovery:true};results.failureCases=5;results.assets=[...new Set(results.conditionCases.map(c=>c.artwork))];
  fs.writeFileSync(path.join(__dirname,prefix+'-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({viewports:results.viewports.length,conditions:cases.length,assets:results.assets,refresh:results.refresh,passed:true}));
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
