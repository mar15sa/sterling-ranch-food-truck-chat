const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const base='https://sterling-ranch-food-truck-chat-staging.up.railway.app',expected=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(expected||''))throw Error('Pass exact release revision');
(async()=>{
 const health=await fetch(base+'/api/health').then(r=>r.json());if(health.deploymentRevision!==expected||!health.deploymentReady){console.log(JSON.stringify({ready:false,revision:health.deploymentRevision}));return;}
 const routes=['/atlas/concepts.html','/atlas/concepts.css','/atlas/concepts.js','/atlas'];const checks=[];
 for(const route of routes){for(const origin of [base,'https://sterlingranchsociety.com']){const res=await fetch(origin+route);assert.equal(res.status,origin===base?200:404);if(origin===base){assert.match(res.headers.get('x-robots-tag'),/noindex/);const file='public'+(route==='/atlas'?'/atlas/index.html':route);assert.equal((await res.text()).replace(/\r\n/g,'\n'),fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));}checks.push({url:origin+route,status:res.status});}}
 const baseline='27745c31c3487ef1bfa03f4ae06fa9a09f1c60d4';
 const paths=execFileSync('git',['ls-tree','-r','--name-only',baseline,'public/atlas'],{encoding:'utf8'}).trim().split('\n');
 const unchanged=[];for(const file of paths){const before=execFileSync('git',['show',baseline+':'+file],{maxBuffer:20*1024*1024});const current=fs.readFileSync(file);const normal=b=>file.endsWith('.png')?b:Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));assert.deepEqual(normal(current),normal(before),file+' changed');unchanged.push({file,sha256:crypto.createHash('sha256').update(normal(current)).digest('hex')});}
 const result={checkedAt:new Date().toISOString(),revision:expected,ready:true,checks,existingAtlasFilesUnchangedAgainst:baseline,unchanged,productionLaunch:false,residentQuestionsSubmitted:0};fs.writeFileSync('artifacts/atlas-concepts/release-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ready:true,revision:expected,checks:checks.length,existingAtlasFilesUnchanged:unchanged.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
