const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,port=4187;
const files=new Set(['index.html','style.css','app.js','scene.js','spatial.mjs','catalog.mjs','area.json','data/geography.json','data/places.json','data/directory.json','data/trails.json','data/visitor-notes.json','data/area-visit.json','assets/cab-trail-map.png','vendor/three.module.js','vendor/three.core.js']);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png'};
const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){res.writeHead(403).end();return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  let route;try{route=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\//,'')||'index.html';}catch{res.writeHead(400).end();return;}
  if(!files.has(route)){res.writeHead(404).end();return;}
  fs.readFile(path.join(root,route),(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(route)]);res.writeHead(200);res.end(req.method==='HEAD'?undefined:data);});
});
server.listen(port,'127.0.0.1',()=>console.log('Working neighborhood: http://127.0.0.1:'+port+'/'));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
