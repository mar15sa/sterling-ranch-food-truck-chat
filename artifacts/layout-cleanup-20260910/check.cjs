const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base="https://sterling-ranch-food-truck-chat-staging.up.railway.app";
const root=path.resolve(__dirname,"../..");
const local=process.env.CLEANUP_LIVE!=="1";
const pages={"/":"index.html","/community-assistant":"rules-assistant.html","/food-truck":"food-truck.html","/calendar":"calendar.html","/pool":"pool.html","/openings":"openings.html"};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:"chrome"});
 const results=[];
 let questions=0;
 try{
  for(const width of [1448,390])for(const [url,file] of Object.entries(pages)){
   const page=await browser.newPage({viewport:{width,height:1086}});
   const errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/api/{community,rules}/ask",r=>{questions++;return r.abort();});
   if(local){
    await page.route(base+url+"?test=1",r=>r.fulfill({path:path.join(root,"public",file),contentType:"text/html"}));
    for(const asset of ["society.css","briefing.js"])await page.route("**/"+asset+"?*",r=>r.fulfill({path:path.join(root,"public",asset),contentType:asset.endsWith(".js")?"application/javascript":"text/css"}));
   }
   await page.goto(base+url+"?test=1");
   await page.locator(".society-enhanced").waitFor();
   assert.equal(await page.locator(".society-sidebar,.hero-panel").count(),0);
   assert(!/Opens an email draft|Nothing sends automatically/.test(await page.locator("body").innerText()));
   assert(await page.getByRole("link",{name:"Report a bug",exact:true}).count()>=1);
   assert.equal(await page.locator("h1").count(),1);
   assert.equal(await page.locator("main").count(),1);
   if(url==="/"){
    await page.waitForFunction(()=>!document.querySelector("#briefing-truck").textContent.includes("Checking"),{},{timeout:35000});
    const truck=await page.locator("#briefing-truck").innerText();
    assert(!truck.startsWith("Today:"));
    assert.equal(await page.locator(".briefing-assistant h2").innerText(),"How can we help?");
   }
   if(url==="/community-assistant"){
    await page.locator("#testModeBanner").waitFor();
    assert((await page.locator("#testModeBanner").innerText()).includes("Test mode"));
    await page.locator("#statusToggle").click();
    await page.locator("#statusDetail").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#statusDetail").isVisible(),false);
   }
   if(url==="/openings")await page.waitForFunction(()=>document.querySelector("#hero-count").textContent!=="—",{},{timeout:35000});
   const selector={"/community-assistant":".society-conversation-column","/food-truck":".chat-panel","/calendar":".society-food-layout > section","/pool":".pool-status-panel","/openings":".hero-copy"}[url];
   if(selector)assert(await page.locator(selector).evaluate(el=>el.getBoundingClientRect().width>=el.parentElement.getBoundingClientRect().width*.97),url+" does not use full width");
   if(width===390){
    await page.locator(".society-menu").click();
    assert.equal(await page.locator(".society-nav a:visible").count(),6);
    await page.keyboard.press("Escape");
   }
   await page.addScriptTag({path:"C:/Users/mar15/Documents/Codex/2026-05-14/my-community-does-daily-food-trucks/.worktrees/society-editorial-ui-implementation-20260909/artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js"});
   const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
   assert.deepEqual(violations,[],url+" accessibility");
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),url+" overflow");
   assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(__dirname,(local?"preview":"staging")+"-"+(url==="/"?"home":url.slice(1))+"-"+width+".png"),fullPage:true});
   results.push({url,width,passed:true});
   await page.close();
  }
  assert.equal(questions,0);
  fs.writeFileSync(path.join(__dirname,(local?"preview":"staging")+"-results.json"),JSON.stringify({questions,results},null,2));
  console.log(JSON.stringify({questions,cases:results.length,results}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
