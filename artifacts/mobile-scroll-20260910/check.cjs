const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base="https://sterling-ranch-food-truck-chat-staging.up.railway.app";
const mode=process.env.SCROLL_MODE||"before";
const root=path.resolve(__dirname,"../..");
async function swipe(page,client,width){
 const x=Math.round(width/2);
 await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y:650}]});
 for(let y=625;y>=225;y-=25){
  await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y}]});
  await page.waitForTimeout(20);
 }
 await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await page.waitForTimeout(250);
 return page.evaluate(()=>scrollY);
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:"chrome"});
 const results=[];
 let questions=0;
 try{
  for(const width of mode==="before"?[390]:[320,390,430,680,681,1448]){
   const page=await browser.newPage({viewport:{width,height:844},isMobile:width<700,hasTouch:width<700});
   const errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/api/{community,rules}/ask",r=>{questions++;return r.abort();});
   if(mode==="preview")await page.route("**/styles.css?*",r=>r.fulfill({path:path.join(root,"public/styles.css"),contentType:"text/css"}));
   await page.goto(base+"/food-truck?test=1");
   await page.locator("#messages .menu-items li").first().waitFor({timeout:35000});
   const before=await page.evaluate(()=>({y:scrollY,overflow:getComputedStyle(document.body).overflowY,height:document.documentElement.scrollHeight,viewport:innerHeight}));
   const client=await page.context().newCDPSession(page);
   const touchY=width<700?await swipe(page,client,width):null;
   await page.mouse.move(width/2,500);
   await page.mouse.wheel(0,600);
   await page.waitForTimeout(250);
   const wheelY=await page.evaluate(()=>scrollY);
   if(mode==="before"){
    assert.equal(touchY,0);
    assert.equal(wheelY,0);
    assert.equal(before.overflow,"hidden");
   }else{
    if(width<700)assert(touchY>150,"touch scroll blocked at "+width);
    assert(wheelY>150,"wheel scroll blocked at "+width);
    assert.notEqual(before.overflow,"hidden");
    await page.mouse.wheel(0,30000);
    await page.waitForTimeout(350);
    assert(await page.locator(".society-footer").evaluate(el=>{const r=el.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;}),"footer unreachable "+width);
    await page.locator("#questionInput").focus();
    assert(await page.locator("#questionInput").evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),"composer unreachable");
    await page.locator("#questionInput").blur();
    if([390,1448].includes(width))await page.screenshot({path:path.join(__dirname,mode+"-"+width+"-bottom.png")});
    await page.mouse.wheel(0,-30000);
    await page.waitForTimeout(350);
    if(width<=680){
     await page.locator(".society-menu").click();
     assert.equal(await page.locator(".society-nav a:visible").count(),6);
     await page.keyboard.press("Escape");
     const y=await swipe(page,client,width);
     assert(y>150,"scroll blocked after menu dismissal");
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"horizontal overflow");
    assert.deepEqual(errors,[]);
   }
   results.push({width,before,touchY,wheelY,passed:true});
   await page.close();
  }
  assert.equal(questions,0);
  fs.writeFileSync(path.join(__dirname,mode+"-results.json"),JSON.stringify({questions,results},null,2));
  console.log(JSON.stringify({questions,results}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
