const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = "http://127.0.0.1:3191";
const out = __dirname;
const fixtures = {
  truck: {truck:"Colorado Chile Co", menu:{items:[{name:"Korean BBQ Totchos"},{name:"Jalapeno Bacon Burger"},{name:"Shaved Elk Brisket Sandwich"}]}},
  events: {status:"ready", events:[
    {title:"Mah Jongg for Boomers",date:"2026-09-10",time:"14:00",location:"Great Hall",url:"/calendar"},
    {title:"Whats Mine is Yours Clothing Swap",date:"2026-09-10",time:"17:00",location:"Great Hall",url:"/calendar"},
    {title:"Floor Mat Pilates for Boomers",date:"2026-09-11",time:"09:00",location:"Great Hall",url:"/calendar"}
  ]},
  openings: {items:[
    {name:"Indy by Industrious",openingWindow:"Opening summer 2027",community:"Highlands Ranch"},
    {name:"Nova Glow Studio",openingWindow:"Coming soon; opening date not announced",community:"Parker"},
    {name:"Costco Wholesale",openingWindow:"Mineral Place completion listed for November 2026; Costco opening date not separately announced",community:"Littleton"}
  ]}
};
(async () => {
  const browser = await chromium.launch({headless:true,channel:"chrome"});
  const results = [];
  let questionRequests = 0;
  try {
    for (const width of [1448, 1280, 1024, 768, 760, 390, 320]) {
      const context = await browser.newContext({viewport:{width,height:1086}});
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror",e=>errors.push(e.message));
      await page.route("**/api/**", route => {
        const url = new URL(route.request().url());
        if (/\/api\/(community|rules)\/ask/.test(url.pathname)) { questionRequests++; return route.abort(); }
        const fixture = url.pathname === "/api/ask" ? fixtures.truck : url.pathname === "/api/community/events" ? fixtures.events : url.pathname === "/api/openings" ? fixtures.openings : null;
        return fixture ? route.fulfill({json:fixture}) : route.continue();
      });
      await page.goto(base+"/?test=1");
      await page.locator("#briefing-events[aria-busy=false]").waitFor();
      await page.locator("#briefing-openings .briefing-row").first().waitFor();
      await page.evaluate(()=>Promise.all(Array.from(document.images, img=>img.decode())));
      const overflow = await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,overflow:Array.from(document.querySelectorAll("body *")).filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>el.className).filter(x=>typeof x==="string")}));
      assert(overflow.document<=width, JSON.stringify({width,overflow}));
      await page.addScriptTag({path:"C:/Users/mar15/Documents/Codex/2026-05-14/my-community-does-daily-food-trucks/.worktrees/society-editorial-ui-implementation-20260909/artifacts/editorial-ui/tools/node_modules/axe-core/axe.min.js"});
      const violations = await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}})).violations);
      assert.deepEqual(violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
      assert.equal(await page.locator("h1").count(),1);
      assert.equal(await page.locator("main").count(),1);
      assert.equal(await page.locator(".briefing-search input[name=test]").inputValue(),"1");
      for(const href of await page.locator('a[href^="/community-assistant"]').evaluateAll(els=>els.map(el=>el.href))) assert.equal(new URL(href).searchParams.get("test"),"1");
      assert.equal(await page.locator(".society-feedback-link").count(),2);
      assert.deepEqual(errors,[]);
      if (width<=760) {
        await page.locator(".society-menu").click();
        assert.equal(await page.locator(".society-menu").getAttribute("aria-expanded"),"true");
        assert.equal(await page.locator(".society-nav a:visible").count(),6);
        await page.keyboard.press("Escape");
        assert.equal(await page.locator(".society-menu").getAttribute("aria-expanded"),"false");
      }
      if ([1448,1024,390,320].includes(width)) await page.screenshot({path:path.join(out,"home-"+width+".png"),fullPage:true});
      results.push({width,state:"mockup fixtures",errors,overflow});
      await context.close();
    }
    for (const state of ["empty","error","long","live"]) {
      for (const width of [1448,390]) {
        const page = await browser.newPage({viewport:{width,height:1086}});
        await page.route("**/api/**",route=>{
          const url = new URL(route.request().url());
          if (/\/api\/(community|rules)\/ask/.test(url.pathname)) {questionRequests++;return route.abort();}
          if(state==="live") return route.continue();
          if(state==="error") return route.fulfill({status:503,body:"Unavailable"});
          if(state==="empty") return route.fulfill({json:{events:[],items:[],status:"empty"}});
          const fixture = structuredClone(url.pathname==="/api/ask"?fixtures.truck:url.pathname==="/api/community/events"?fixtures.events:fixtures.openings);
          if(fixture.truck) {fixture.truck="An unusually long neighborhood food truck name";fixture.location="Community gathering space by the neighborhood clubhouse";}
          if(fixture.events) fixture.events[0].title="A longer community gathering title that needs room to wrap comfortably";
          return route.fulfill({json:fixture});
        });
        await page.goto(base+"/?test=1");
        await page.locator("#briefing-events[aria-busy=false]").waitFor({timeout:35000});
        await page.waitForFunction(()=>!document.querySelector("#briefing-truck").textContent.includes("Checking")&&!document.querySelector("#briefing-openings").textContent.includes("Loading"),{},{timeout:35000});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),state+" "+width+" overflow");
        if(state==="error"||state==="empty") assert.equal(await page.locator('#briefing-events a[href="/community-calendar"]').count(),1);
        await page.screenshot({path:path.join(out,"home-"+width+"-"+state+".png"),fullPage:true});
        results.push({width,state,truck:await page.locator("#briefing-truck").innerText()});
        await page.close();
      }
    }
    assert.equal(questionRequests,0);
    fs.writeFileSync(path.join(out,"results.json"),JSON.stringify({questionRequests,results},null,2));
    console.log(JSON.stringify({questionRequests,checks:results.length,results},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
