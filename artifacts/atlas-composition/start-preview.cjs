// A static, loopback-only design study. Never starts application jobs or APIs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const port = 4186;
const allowed = new Set(['index.html', 'study.css', 'study.js', 'catalog-reference.json', 'directory-reference.json', 'assets/neighborhood-study-v2.png', 'assets/sterling-shell.png', 'assets/sterling-roof.png']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.headers.host !== '127.0.0.1:' + port && req.headers.host !== 'localhost:' + port) { res.writeHead(403).end(); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  let route;
  try { route = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\//, '') || 'index.html'; }
  catch { res.writeHead(400).end(); return; }
  if (!allowed.has(route)) { res.writeHead(404).end(); return; }
  fs.readFile(path.join(root, route), (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(route)]);
    res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.listen(port, '127.0.0.1', () => console.log('Design study: http://127.0.0.1:' + port + '/'));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
