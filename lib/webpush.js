// Web Push san pakè deyò: chifman RFC 8291 (aes128gcm) + siyati VAPID (RFC 8292, ES256).
// Kopi modil Keyn Event la. Pa gen okenn import ki pa nan Node.
import crypto from 'node:crypto';

export const b64u = (buf) => Buffer.from(buf).toString('base64url');
export const unb64u = (s) => Buffer.from(String(s), 'base64url');

// Nouvo kle VAPID: { publicKey (65 oktè, base64url), privateKey (32 oktè, base64url) }
export function vapidKeys() {
  const e = crypto.createECDH('prime256v1');
  e.generateKeys();
  return { publicKey: b64u(e.getPublicKey()), privateKey: b64u(e.getPrivateKey()) };
}

const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

// Chifre yon mesaj pou yon abònman (p256dh + auth). opts.salt / opts.serverPrivate pou tès sèlman.
export function encrypt(plaintext, p256dh, auth, opts = {}) {
  const uaPub = unb64u(p256dh), authSecret = unb64u(auth);
  const as = crypto.createECDH('prime256v1');
  if (opts.serverPrivate) as.setPrivateKey(unb64u(opts.serverPrivate)); else as.generateKeys();
  const asPub = as.getPublicKey();
  const ecdh = as.computeSecret(uaPub);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]);
  const ikm = hkdf(authSecret, ecdh, keyInfo, 32);
  const salt = opts.salt ? unb64u(opts.salt) : crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, body]);
}

// Siyati VAPID pou yon endpoint
export function vapidHeader(endpoint, keys, subject) {
  const pub = unb64u(keys.publicKey);
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}

// Voye yon notifikasyon. Retounen { ok, gone } — gone=true lè abònman an pa egziste ankò (pou efase l).
export async function sendPush(sub, payload, keys, subject, fetchImpl = fetch) {
  try {
    const body = encrypt(JSON.stringify(payload), sub.p256dh, sub.auth);
    const r = await fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'content-encoding': 'aes128gcm', ttl: '86400', urgency: 'high',
        authorization: vapidHeader(sub.endpoint, keys, subject) },
      body, signal: AbortSignal.timeout(8000),
    });
    const ok = r.status >= 200 && r.status < 300;
    let detail = '';
    if (!ok) { try { detail = String(await r.text()).replace(/\s+/g, ' ').slice(0, 160); } catch { /* */ } }
    return { ok, gone: r.status === 404 || r.status === 410, status: r.status, detail, host: new URL(sub.endpoint).host };
  } catch (e) { return { ok: false, gone: false, error: String(e.message || e) }; }
}

// Netwaye yon abònman ki soti nan navigatè a
export function cleanSub(s) {
  const endpoint = String(s?.endpoint || '');
  const p256dh = String(s?.keys?.p256dh || s?.p256dh || ''), auth = String(s?.keys?.auth || s?.auth || '');
  if (!/^https:\/\/[^\s]{10,900}$/.test(endpoint)) return null;
  if (unb64u(p256dh).length !== 65 || unb64u(auth).length < 8) return null;
  return { endpoint, p256dh, auth };
}
