const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base="https://sterling-ranch-food-truck-chat-staging.up.railway.app";
const local=process.env.FEEDBACK_LIVE!=="1";
const root=path.resolve(__dirname,"../..");
const pages={"/":"index.html","/food-truck":"food-truck.html","/community-assistant":"rules-assistant.html","/calendar":"calendar.html","/openings":"openings.html","/pool":"pool.html"};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:"chrome"});
 const results=[];let questions=0;
 try{
  for(const width of [1448,390])for(const [url,file] of Object.entries(pages)){
   const page=await browser.newPage({viewport:{width,height:844}});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/api/{community,rules}/ask",r=>{questions++;return r.abort();});
   if(local&&["/food-truck","/community-assistant"].includes(url))await page.route(base+url+"?test=1",r=>r.fulfill({path:path.join(root,"public",file),contentType:"text/html"}));
   await page.goto(base+url+"?test=1");
   await page.locator(".society-enhanced").waitFor();
   for(const label of ["Report a bug","Request a feature"]){
    const links=page.getByRole("link",{name:label,exact:true,includeHidden:true});
    assert.equal(await links.count(),1,url+" duplicate "+label);
    assert(await links.evaluate(el=>!!el.closest(".society-footer")));
    const destination=new URL(await links.getAttribute("href"));
    assert.equal(destination.protocol,"mailto:");
    assert.equal(destination.pathname,"hello@ideakitchen.ai");
    assert(destination.searchParams.get("subject"));
    assert(destination.searchParams.get("body"));
   }
   assert.equal(await page.locator(".society-assistant-feedback,#settingsMenu").count(),0);
   if(url==="/food-truck")assert.equal(await page.locator(".society-footer [data-feedback-type]").count(),2);
   assert.deepEqual(errors,[]);
   if(["/food-truck","/community-assistant"].includes(url))await page.locator(".society-footer").screenshot({path:path.join(__dirname,(local?"preview":"staging")+"-"+file.replace(".html","")+"-"+width+".png")});
   results.push({url,width,feedbackPairs:1,passed:true});
   await page.close();
  }
  assert.equal(questions,0);
  fs.writeFileSync(path.join(__dirname,(local?"preview":"staging")+"-results.json"),JSON.stringify({questions,results},null,2));
  console.log(JSON.stringify({questions,cases:results.length,results}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
