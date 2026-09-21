// Loopback-only Atlas preview: no application APIs, jobs, secrets or shared staging.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../public/atlas');
const port = 4184;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const server = http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  let route;try{route=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400).end();return;}
  if(route==='/'){res.writeHead(302,{Location:'/atlas/opened/index.html'}).end();return;}
  if(route==='/food-truck'){res.writeHead(302,{Location:'https://sterlingranchsociety.com/food-truck'}).end();return;}
  if(route!=='/atlas'&&!route.startsWith('/atlas/')){res.writeHead(404).end('This local preview serves only the Atlas.');return;}
  let file=path.resolve(root,'.'+route.slice('/atlas'.length));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}
  try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');}catch{res.writeHead(404).end();return;}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.writeHead(200);res.end(req.method==='HEAD'?undefined:data);});
});
server.listen(port,'127.0.0.1',()=>console.log(`Atlas preview: http://127.0.0.1:${port}/atlas/opened/index.html`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
