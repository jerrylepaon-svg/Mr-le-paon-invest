// Pou teste sou òdinatè san baz done: `ADMIN_PASSWORD=test node dev-server.js` epi louvri http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './lib/http.js';
import { memoryStore } from './lib/store-memory.js';

const store = memoryStore();
const root = path.dirname(new URL(import.meta.url).pathname);

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/app') return serve(store, req, res);
  const types = { '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.png': 'image/png' };
  const f = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
  if (!/^(index\.html|manifest\.webmanifest|sw\.js|icons\/[\w-]+\.png)$/.test(f)) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', types[path.extname(f)] || 'text/html; charset=utf-8');
  fs.createReadStream(path.join(root, f)).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('Mr Le Paon Invest: http://localhost:' + (process.env.PORT || 3000)));
