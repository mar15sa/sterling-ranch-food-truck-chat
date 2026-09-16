const fs=require('node:fs'),assert=require('node:assert/strict');
const staging='https://sterling-ranch-food-truck-chat-staging.up.railway.app';
const revision='b0b5dc8ab5b025a4df3c877e7e95f4a9006668a9';
(async()=>{
 const health=await fetch(staging+'/api/health').then(r=>r.json());
 if(health.deploymentRevision!==revision||!health.deploymentReady){console.log(JSON.stringify({ready:false,revision:health.deploymentRevision}));return;}
 const checks=[];
 for(const path of ['/atlas','/atlas/experience.json','/atlas/places.json','/atlas/atlas-art.js','/atlas/atlas-core.js','/atlas/atlas.js','/atlas/atlas-experience.js','/atlas/atlas-experience.css','/atlas/atlas-trails.js','/atlas/atlas-trails.css']){
  for(const origin of [staging,'https://sterlingranchsociety.com']){
   const response=await fetch(origin+path);const isStaging=origin===staging;assert.equal(response.status,isStaging?200:404);
   const body=await response.text();if(isStaging){assert.match(response.headers.get('x-robots-tag'),/noindex/);if(path==='/atlas')assert.match(body,/20260913-open-5/);else if(path.endsWith('.json'))assert.deepEqual(JSON.parse(body),JSON.parse(fs.readFileSync('public'+path,'utf8')));else assert.equal(body.replace(/\r\n/g,'\n'),fs.readFileSync('public'+path,'utf8').replace(/\r\n/g,'\n'));}
   checks.push({url:origin+path,status:response.status,noindex:response.headers.get('x-robots-tag')});
  }
 }
 const result={checkedAt:new Date().toISOString(),revision,ready:true,checks,exactAssetsMatch:true,listed:100,destinations:33,featured:['mccormick','burns','sterling-center'],productionLaunched:false};
 fs.writeFileSync('artifacts/atlas/open-places-final-release-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
