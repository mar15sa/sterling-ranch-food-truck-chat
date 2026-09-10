const {chromium}=require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');
(async()=>{
const browser=await chromium.launch({headless:true,channel:'chrome'});const errors=[];const checks=[];
const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
for(const mode of ['desktop','mobile']){
 await page.setViewportSize(mode==='desktop'?{width:1440,height:1100}:{width:390,height:844});
 for(const [name,path] of [['home','/'],['assistant','/community-assistant?test=1'],['food','/food-truck'],['calendar','/calendar'],['openings','/openings'],['pool','/pool']]){
  await page.goto('http://127.0.0.1:3187'+path);await page.waitForTimeout(1800);
  if(name==='home')await page.waitForFunction(()=>!document.querySelector('#briefing-food-copy').textContent.includes('Finding'),{timeout:30000}).catch(()=>{});
  if(name==='food')await page.waitForTimeout(3000);
  await page.screenshot({path:`artifacts/editorial-ui/${name}-${mode}.png`,fullPage:true});
  const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,mainCount:document.querySelectorAll('main').length,h1Count:document.querySelectorAll('h1').length,navCount:document.querySelectorAll('.society-nav a').length,feedback:[...document.querySelectorAll('.society-feedback-link')].map(a=>({text:a.textContent,height:a.getBoundingClientRect().height,href:a.getAttribute('href')})),colors:{body:getComputedStyle(document.body).backgroundColor,paper:getComputedStyle(document.querySelector('.society-paper')).backgroundColor}}));
  checks.push({page:name,mode,...result});if(result.overflow||result.mainCount!==1||result.h1Count!==1||result.navCount!==6)errors.push(name+' '+mode+' structural '+JSON.stringify(result));
 }
}
fs.writeFileSync('artifacts/editorial-ui/render-results.json',JSON.stringify({errors,checks},null,2));console.log(JSON.stringify({errors}));await browser.close();if(errors.length)process.exitCode=1;
})();
