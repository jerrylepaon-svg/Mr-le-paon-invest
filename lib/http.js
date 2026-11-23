// Konvèti yon demann HTTP (Vercel oswa Node) an apèl handle().
import { handle } from './handlers.js';

async function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { return {}; } }
    return req.body || {};
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 4_000_000) break; chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

export async function serve(store, req, res) {
  const url = new URL(req.url, 'http://x');
  const query = Object.fromEntries(url.searchParams);
  const send = (status, obj) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(obj));
  };
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const auth = req.headers['authorization'] || '';
    const result = await handle(store, {
      method: req.method, action: query.action, query, body,
      token: auth.startsWith('Bearer ') ? auth.slice(7) : null,
      ip: String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64),
    });
    if (result && result.__photo) {
      const m = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(result.__photo);
      res.statusCode = 200;
      res.setHeader('Content-Type', m[1]);
      res.setHeader('Cache-Control', query.kind === 'proof' ? 'private, no-store' : 'public, max-age=31536000, immutable');
      return res.end(Buffer.from(m[2], 'base64'));
    }
    send(200, result);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    send(status, { error: status === 500 && !e.status ? `Gen yon pwoblèm sou sèvè a. Eseye ankò. (${String(e && e.message || e).slice(0, 140)})` : e.message });
  }
}
