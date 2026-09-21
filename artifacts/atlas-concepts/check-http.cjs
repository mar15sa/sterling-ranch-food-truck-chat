const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const routes=['/atlas/concepts.html','/atlas/concepts.css','/atlas/concepts.js'];
async function check(environment,port){
  const child=spawn(process.execPath,['-e',"require('./lib/community-live-monitor').createLiveMonitor=()=>({start(){},status(){return {}}});require('./server');"],{cwd:root,windowsHide:true,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,PORT:String(port),HOST:'127.0.0.1',NODE_ENV:'test',RAILWAY_ENVIRONMENT_NAME:environment,RULES_AUTO_REFRESH:'false',OPENINGS_AUTO_MONITOR:'false'}});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clearInterval(poll);reject(Error('Server startup timeout'));},20000);const poll=setInterval(()=>{if(output.includes('Food truck chat is running')){clearTimeout(timer);clearInterval(poll);resolve();}},100);child.once('error',reject);});
    const checks=[];
    for(const route of routes){const response=await fetch('http://127.0.0.1:'+port+route,{headers:{host:'sterling-ranch-food-truck-chat-staging.up.railway.app'}});assert.equal(response.status,environment==='staging'?200:404);if(environment==='staging'){assert.match(response.headers.get('x-robots-tag'),/noindex/);assert.equal((await response.text()).replace(/\r\n/g,'\n'),fs.readFileSync(path.join(root,'public',route),'utf8').replace(/\r\n/g,'\n'));}checks.push({route,status:response.status});}
    return {environment,checks};
  }finally{child.kill();}
}
(async()=>{const checks=[await check('staging',4191),await check('production',4192)];const report={checkedAt:new Date().toISOString(),checks,residentQuestionsSubmitted:0};fs.writeFileSync(path.join(__dirname,'http-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));})().catch(e=>{console.error(e);process.exitCode=1;});
