const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=require('../../public/atlas/atlas-core');
const base='https://sterling-ranch-food-truck-chat-staging.up.railway.app';
const expected='4b2ac57d1dde197f984023b544a7ab320b3723b7';
(async()=>{
 const health=await fetch(base+'/api/health').then(r=>r.json());
 if(health.deploymentRevision!==expected||!health.deploymentReady){console.log(JSON.stringify({ready:false,revision:health.deploymentRevision}));return;}
 const catalog=await fetch(base+'/atlas/places.json').then(r=>r.json());
 const trails=await fetch(base+'/atlas/trails.json').then(r=>r.json());
 assert.deepEqual(catalog,JSON.parse(fs.readFileSync('public/atlas/places.json','utf8')));
 assert.deepEqual(trails,JSON.parse(fs.readFileSync('public/atlas/trails.json','utf8')));C.validateTrails(trails);
 const paths=[];
 for(const path of ['/atlas','/atlas/places.json','/atlas/trails.json','/atlas/atlas.js','/atlas/atlas-core.js','/atlas/atlas-trails.js','/atlas/atlas-trails.css','/atlas/cab-trail-map.png']){
  for(const origin of [base,'https://sterlingranchsociety.com']){
   const r=await fetch(origin+path);const staging=origin===base;assert.equal(r.status,staging?200:404);
   if(staging)assert.match(r.headers.get('x-robots-tag'),/noindex/);
   const body=Buffer.from(await r.arrayBuffer());
   if(staging&&path==='/atlas'){assert.match(body.toString(),/show-trails/);assert.match(body.toString(),/20260913-walks-1/);}
   if(staging&&path.endsWith('.png'))assert.equal(crypto.createHash('sha256').update(body).digest('hex'),crypto.createHash('sha256').update(fs.readFileSync('public'+path)).digest('hex'));
   paths.push({url:origin+path,status:r.status,noindex:r.headers.get('x-robots-tag')});
  }
 }
 const result={checkedAt:new Date().toISOString(),revision:expected,ready:true,paths,listed:catalog.places.length,destinations:C.directoryGroups(catalog.places).length,mapped:catalog.places.filter(p=>p.coordinates).length,mapAreas:new Set(catalog.places.filter(p=>p.coordinates).map(p=>p.locationGroup||p.id)).size,held:catalog.coverage.heldCount,walks:trails.routes.map(r=>({id:r.id,miles:r.miles})),exactCatalogAndTrailDataMatchesLocal:true,sourceImageHashMatchesLocal:true};
 fs.writeFileSync('artifacts/atlas/walks-release-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
