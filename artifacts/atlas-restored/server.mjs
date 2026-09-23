#!/usr/bin/env node
import http from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from './eval/check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 4195);
const reviewMode = process.argv.includes('--review');
const composition = path.resolve(root, '../../../atlas-composition-worktree/artifacts/atlas-composition');
const opened = path.resolve(root, '../../../atlas-opened-worktree/public/atlas/opened');
const openedParent = path.resolve(opened, '..');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon' };

function safelyJoin(base, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const file = path.resolve(base, `.${decoded}`);
  return file === base || file.startsWith(`${base}${path.sep}`) ? file : null;
}
function fileFor(url) {
  const pathname = new URL(url, 'http://loopback').pathname;
  if (pathname === '/server.mjs') return null;
  const openedData = new Set(['/atlas-core.js', '/geography.json', '/places.json', '/trails.json']);
  if (openedData.has(pathname)) return existsSync(openedParent) ? safelyJoin(openedParent, pathname) : null;
  if (pathname === '/') return path.join(root, 'index.html');
  if (pathname === '/review') return path.join(root, 'review.html');
  if (pathname === '/frame') return path.join(root, 'eval', 'frame.html');
  if (pathname.startsWith('/reference/')) return existsSync(composition) ? safelyJoin(composition, pathname.slice('/reference'.length)) : null;
  if (pathname.startsWith('/reference-overlook/')) return existsSync(opened) ? safelyJoin(opened, pathname.slice('/reference-overlook'.length)) : null;
  if (pathname.startsWith('/reference-overlook-parent/')) return existsSync(openedParent) ? safelyJoin(openedParent, pathname.slice('/reference-overlook-parent'.length)) : null;
  return safelyJoin(root, pathname);
}
function send(res, status, body, type = 'text/plain; charset=utf-8') { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(body); }
async function status() { const result = evaluate({ root }); return { ...result, reviewMode, launchAuthorized: false, message: result.ok ? 'Review gate passed. This local page still does not authorize a launch.' : 'Review gate has not passed. This local page does not authorize a launch.' }; }

if (!reviewMode) {
  const result = evaluate({ root });
  if (!result.ok) { console.error('Refusing normal startup because the visual review gate failed. Use --review only for an unapproved local preview.'); for (const issue of result.issues) console.error(`- ${issue}`); process.exit(1); }
}
const server = http.createServer(async (req, res) => {
  if (!req.url || !['GET','HEAD'].includes(req.method || '')) return send(res, 405, 'Method not allowed');
  if (new URL(req.url, 'http://loopback').pathname === '/review-status.json') return send(res, 200, JSON.stringify(await status(), null, 2), types['.json']);
  let file; try { file = fileFor(req.url); } catch { return send(res, 400, 'Bad request'); }
  if (file && existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found');
  res.writeHead(200, { 'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  if (req.method === 'HEAD') return res.end(); createReadStream(file).pipe(res);
});
server.listen(port, '127.0.0.1', () => console.log(`Atlas review server: http://127.0.0.1:${port}/review`));
