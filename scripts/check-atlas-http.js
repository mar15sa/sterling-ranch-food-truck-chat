// Exercise the real HTTP/static routing in two disposable local processes.
// No assistant requests, scheduled monitors, notifications, or source refreshes.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const bootstrap=`require('./lib/community-live-monitor').createLiveMonitor=()=>({start(){},status(){return {}}});require('./server');`;
async function check(environment,port){
  const child=spawn(process.execPath,['-e',bootstrap],{cwd:root,windowsHide:true,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,PORT:String(port),HOST:'127.0.0.1',NODE_ENV:'test',RAILWAY_ENVIRONMENT_NAME:environment,RULES_AUTO_REFRESH:'false',OPENINGS_AUTO_MONITOR:'false'}});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  try{
    await new Promise((resolve,reject)=>{
      let interval;
      const finish=error=>{clearInterval(interval);clearTimeout(timeout);if(error)reject(error);else resolve();};
      const timeout=setTimeout(()=>finish(Error('Server start timeout: '+output.slice(-1000))),20000);
      child.once('error',finish);
      child.once('exit',code=>{if(code!==null)finish(Error('Server exited: '+output.slice(-1000)));});
      interval=setInterval(()=>{if(output.includes('Food truck chat is running'))finish();},100);interval.unref();
    });
    const results=[];
    for(const url of ['/atlas','/atlas/','/atlas/index.html','/atlas/atlas.js','/atlas/atlas-core.js','/atlas/atlas.css','/atlas/places.json','/atlas/geography.json','/atlas./places.json','/ATLAS/places.json','/%61tlas/places.json','/atlas%20/places.json']){
      const r=await fetch(`http://127.0.0.1:${port}${url}`,{headers:{Host:'sterling-ranch-food-truck-chat-staging.up.railway.app'}});
      const expected=environment==='production'?404:(/^\/atlas(?:\/|$)/.test(url)?200:null);
      if(expected!==null)assert.equal(r.status,expected,environment+' '+url);
      assert.match(r.headers.get('x-robots-tag')||'',/noindex/,url);
      results.push({path:url,status:r.status});await r.arrayBuffer();
    }
    for(const url of ['/','/pool','/openings']){const r=await fetch(`http://127.0.0.1:${port}${url}`);assert.equal(r.status,200,url);await r.arrayBuffer();}
    return {environment,results};
  }finally{child.kill();}
}
(async()=>{const report=[];report.push(await check('staging',3217));report.push(await check('production',3218));fs.mkdirSync(path.join(root,'artifacts/atlas'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/atlas/http-check.json'),JSON.stringify(report,null,2));console.log('Atlas HTTP checks passed: staging page/assets available; production paths blocked, including spoofed staging hosts. Existing pages still respond.');})().catch(e=>{console.error(e);process.exitCode=1;});
