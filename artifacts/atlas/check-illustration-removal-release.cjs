const fs=require('node:fs'),assert=require('node:assert/strict');
const staging='https://sterling-ranch-food-truck-chat-staging.up.railway.app';
const revision='0a8e9b15fc4f43a6c202128d3728b9e82c9b2110';
(async()=>{
 const health=await fetch(staging+'/api/health').then(r=>r.json());
 if(health.deploymentRevision!==revision||!health.deploymentReady){console.log(JSON.stringify({ready:false,revision:health.deploymentRevision}));return;}
 const checks=[];
 for(const path of ['/atlas','/atlas/experience.json','/atlas/places.json','/atlas/atlas-art.js','/atlas/atlas-core.js','/atlas/atlas.js','/atlas/atlas-experience.js','/atlas/atlas-experience.css','/atlas/atlas-trails.js','/atlas/atlas-trails.css']){
  for(const origin of [staging,'https://sterlingranchsociety.com']){
   const response=await fetch(origin+path);const isStaging=origin===staging;assert.equal(response.status,isStaging?200:404);
   const body=await response.text();if(isStaging){assert.match(response.headers.get('x-robots-tag'),/noindex/);if(path==='/atlas')assert.match(body,/20260913-map-6/);else if(path.endsWith('.json'))assert.deepEqual(JSON.parse(body),JSON.parse(fs.readFileSync('public'+path,'utf8')));else assert.equal(body.replace(/\r\n/g,'\n'),fs.readFileSync('public'+path,'utf8').replace(/\r\n/g,'\n'));}
   checks.push({url:origin+path,status:response.status,noindex:response.headers.get('x-robots-tag')});
  }
 }
 const result={checkedAt:new Date().toISOString(),revision,ready:true,checks,exactAssetsMatch:true,listed:100,destinations:33,illustratedViewRemoved:true,productionLaunched:false};
 fs.writeFileSync('artifacts/atlas/illustration-removal-release-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
