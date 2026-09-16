const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base="https://sterling-ranch-food-truck-chat-staging.up.railway.app";
const local=process.env.MENU_LIVE!=="1";
const root=path.resolve(__dirname,"../..");
(async()=>{
  const browser=await chromium.launch({headless:true,channel:"chrome"});
  let questions=0;
  const results=[];
  try{
    for(const [url,width] of [["/",320],["/",390],["/",430],["/",760],["/",1448],["/food-truck",390],["/community-assistant",390],["/calendar",390],["/openings",390],["/pool",390]]){
      const page=await browser.newPage({viewport:{width,height:844}});
      const errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      await page.route("**/api/{community,rules}/ask",r=>{questions++;return r.abort();});
      if(local){
        for(const file of ["society.css","society.js","briefing-home.css"]){
          await page.route("**/"+file+"?*",r=>r.fulfill({path:path.join(root,"public",file),contentType:file.endsWith(".js")?"application/javascript":"text/css"}));
        }
      }
      await page.goto(base+url+"?test=1");
      await page.locator(".society-enhanced").waitFor();
      const menu=page.locator(".society-menu");
      const nav=page.locator(".society-nav");
      if(width<=760){
        assert.equal(await nav.isVisible(),false,"closed menu should not show partial links");
        assert.equal(await menu.getAttribute("aria-expanded"),"false");
        assert.equal(await menu.innerText(),"Open navigation");
        const size=await menu.boundingBox();
        assert(size.width>=44&&size.height>=44);
        if(url==="/"&&[320,390].includes(width)){
          await page.screenshot({path:path.join(__dirname,(local?"preview":"staging")+"-"+width+"-closed.png")});
        }
        await menu.focus();
        await page.keyboard.press("Enter");
        assert.equal(await menu.getAttribute("aria-expanded"),"true");
        assert.equal(await nav.locator("a:visible").count(),6);
        const boxes=await nav.locator("a").evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
        for(let i=0;i<boxes.length;i++){
          assert(boxes[i].height>=52);
          assert.equal(boxes[i].x,boxes[0].x);
          if(i)assert(boxes[i].y>=boxes[i-1].y+boxes[i-1].height-.5);
        }
        await page.keyboard.press("Tab");
        assert(await nav.locator("a").first().evaluate(el=>el===document.activeElement));
        if(url==="/"&&[320,390].includes(width)){
          await page.evaluate(()=>document.activeElement.blur());
          await page.screenshot({path:path.join(__dirname,(local?"preview":"staging")+"-"+width+"-open.png")});
        }
        await page.addScriptTag({path:"C:/Users/mar15/Documents/Codex/2026-05-14/my-community-does-daily-food-trucks/.worktrees/society-editorial-ui-implementation-20260909/artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js"});
        const violations=await page.evaluate(async()=> (await axe.run(".society-header",{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}})).violations.map(v=>v.id));
        assert.deepEqual(violations,[]);
        await page.keyboard.press("Escape");
        assert.equal(await nav.isVisible(),false);
        assert(await menu.evaluate(el=>el===document.activeElement));
        await menu.click();
        await page.locator("h1").click();
        assert.equal(await nav.isVisible(),false);
      }else{
        assert.equal(await menu.isVisible(),false);
        assert.equal(await nav.locator("a:visible").count(),6);
        await page.screenshot({path:path.join(__dirname,(local?"preview":"staging")+"-desktop.png")});
      }
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"overflow "+url+" "+width);
      assert.deepEqual(errors,[]);
      results.push({url,width,passed:true});
      await page.close();
    }
    const page=await browser.newPage({viewport:{width:390,height:844},javaScriptEnabled:false});
    if(local) await page.route("**/society.css?*",r=>r.fulfill({path:path.join(root,"public/society.css"),contentType:"text/css"}));
    await page.goto(base+"/?test=1");
    assert.equal(await page.locator(".society-menu").isVisible(),false);
    assert.equal(await page.locator(".society-nav a:visible").count(),6);
    results.push({url:"/",width:390,javascript:false,passed:true});
    await page.close();
    assert.equal(questions,0);
    fs.writeFileSync(path.join(__dirname,(local?"preview":"staging")+"-results.json"),JSON.stringify({questions,results},null,2));
    console.log(JSON.stringify({questions,cases:results.length,results}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
