const fs=require('fs'),cp=require('child_process'),path=require('path');
const {chromium}=require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='https://sterling-ranch-food-truck-chat-staging.up.railway.app';
(async()=>{const browser=await chromium.launch({channel:'chrome'});for(const old of [true,false])for(const [url,file] of [['/community-assistant','rules-assistant.html'],['/food-truck','food-truck.html']]){
 const p=await browser.newPage({viewport:{width:1440,height:900}});await p.route('**/api/{community,rules}/ask',r=>r.abort());
 if(old){const read=f=>cp.execFileSync('git',['show','b42cdb6:public/'+f]);await p.route(base+url+'?test=1',r=>r.fulfill({body:read(file),contentType:'text/html'}));for(const f of ['styles.css','rules-assistant.css'])await p.route(base+'/'+f+'?*',r=>r.fulfill({body:read(f),contentType:'text/css'}));}
 await p.goto(base+url+'?test=1');await p.locator(url.includes('assistant')?'.rules-message':'.message.bot').first().waitFor({timeout:40000});await p.screenshot({path:path.join(__dirname,(old?'original-':'current-')+file+'.png'),fullPage:true});await p.close();}await browser.close()})().catch(e=>{console.error(e);process.exitCode=1});
