// Tout aksyon API Mr Le Paon Invest yo: /api/app?action=...
import crypto from 'node:crypto';
import {
  LOCS, STAT, fm, today, phone8, txnKey, provOf, isDate, blankShare, freeShares, nextCode,
  invShares, invMoney, parseSms, smsSuspect, matchSms, matchRequestToSms,
} from './core.js';

const fail = (status, msg) => { throw Object.assign(new Error(msg), { status }); };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const mailOk = (v) => /^[^\s@]{1,64}@[^\s@]{1,120}\.[a-z]{2,}$/i.test(v);
const normMail = (v) => String(v || '').trim().toLowerCase().slice(0, 190);
function passErr(p) {
  if (p.length < 4) return 'Modpas la dwe gen omwen 4 karaktè.';
  if (p.length > 64) return 'Modpas la twò long (64 karaktè maksimòm).';
  if (/^(.)\1+$/.test(p) || ['1234', '12345', '123456', '4321', 'abcd', 'password', 'modpas', 'azerty', 'qwerty'].includes(p.toLowerCase())) return 'Chwazi yon modpas ki pi difisil pou moun devine.';
  return '';
}
const rid = () => crypto.randomBytes(6).toString('hex');

// ---------- sekirite ----------
// Kle pou siyen koneksyon yo. Li pa depann de modpas admin lan, konsa enskripsyon ak kont envestisè yo
// mache menm si ADMIN_PASSWORD poko mete. (Chanje DATABASE_URL oswa TOKEN_SECRET dekonekte tout moun.)
function secret() {
  const k = process.env.TOKEN_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.ADMIN_PASSWORD;
  if (!k) fail(500, 'Baz done a poko konekte sou Vercel (Storage → Neon).');
  return 'lepaon:' + crypto.createHash('sha256').update(String(k)).digest('hex');
}
const sign = (s) => crypto.createHmac('sha256', secret()).update(s).digest('hex');
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function adminToken() { const exp = Date.now() + 7 * 864e5; return `a.${exp}.${sign('a.' + exp)}`; }
function invToken(id) { const exp = Date.now() + 90 * 864e5; return `i.${id}.${exp}.${sign(`i.${id}.${exp}`)}`; }
function isAdmin(t) {
  const p = String(t || '').split('.');
  return p.length === 3 && p[0] === 'a' && Number(p[1]) > Date.now() && safeEq(p[2], sign(`a.${p[1]}`));
}
function invFromToken(t) {
  const p = String(t || '').split('.');
  if (p.length !== 4 || p[0] !== 'i' || Number(p[2]) < Date.now() || !safeEq(p[3], sign(`i.${p[1]}.${p[2]}`))) return null;
  return p[1];
}
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
const newPin = () => String(crypto.randomInt(1000, 10000));
function setPin(inv, pin) { inv.salt = crypto.randomBytes(12).toString('hex'); inv.pinHash = hashPin(pin, inv.salt); inv.fails = 0; inv.lockedUntil = 0; }

// Li done yo, chanje yo, epi sere yo. Si yon lòt moun sere anvan nou, nou rekòmanse.
async function mutate(store, fn) {
  for (let i = 0; i < 5; i++) {
    const { data, version } = await store.getState();
    const res = await fn(data);
    if (await store.saveState(data, version)) return res;
  }
  fail(409, 'Sit la okipe. Eseye ankò.');
}

// ---------- apwouve yon demann ----------
function approve(st, r, rule) {
  const l = st.lots.find((x) => x.id === r.lot);
  if (!l) return { err: 'Atik sa a pa egziste ankò.' };
  const fr = freeShares(l);
  if (fr.length < r.q) return { err: `Rete sèlman ${fr.length} aksyon lib pou atik sa a.` };
  let inv = (r.acct && st.investors.find((i) => i.id === r.acct)) || st.investors.find((i) => i.phone && phone8(i.phone) === phone8(r.tel)), fresh = false, pin = '';
  if (inv && !inv.phone) inv.phone = r.tel;
  if (inv && !hasShares(st, inv.id) && activeCount(st) >= st.settings.maxInv) return { err: `Ou rive nan maksimòm ${st.settings.maxInv} envestisè.` };
  if (!inv) {
    if (activeCount(st) >= st.settings.maxInv) return { err: `Ou rive nan maksimòm ${st.settings.maxInv} envestisè.` };
    inv = { id: rid(), code: nextCode(st), name: r.name, phone: r.tel, joined: today() };
    pin = newPin(); setPin(inv, pin);
    st.investors.push(inv); fresh = true;
  }
  fr.slice(0, r.q).forEach((s) => { s.inv = inv.id; s.invDate = today(); });
  Object.assign(r, { status: 'approved', inv: inv.id, code: inv.code, rule: rule || 'admin', approvedAt: new Date().toISOString(), pinOnce: pin });
  return { inv, fresh, pin, l };
}
const approvedOut = (st, r, res) => ({
  approved: true, rule: r.rule, name: res.inv.name, code: res.inv.code, phone: res.inv.phone, pin: res.pin, q: r.q, amount: r.amount, lot: res.l.name,
  wa: waMsg(res.inv, res.pin, r, res.l),
});
const waMsg = (inv, pin, r, l) => `Bonjou ${inv.name}! Keyn Event resevwa peman ${fm(r.amount)} ou a. Ou gen ${r.q} aksyon nan "${l.name}" kounye a.\n\n`
  + `Pou w antre nan kont ou sou Mr Le Paon Invest, sèvi ak telefòn ou OSWA ID ou:\nTelefòn: ${inv.phone}\nID envestisè: ${inv.code}` + (pin ? `\nModpas tanporè: ${pin} (ou ka chanje l nan kont ou)` : '\nModpas: menm modpas ou te chwazi a');

// ---------- SMS ----------
function smsKey(st) { if (!st.settings._smsKey) st.settings._smsKey = crypto.randomBytes(18).toString('hex'); return st.settings._smsKey; }
function handleSms(st, from, text, trusted, msgId) {
  const p = parseSms(from, text);
  const id = msgId || crypto.createHash('sha256').update(from + '|' + text).digest('hex').slice(0, 24);
  if (st.sms.some((m) => m.id === id)) return { duplicate: true };
  const status = !p.incoming || !p.amount ? 'inyore' : (!trusted && smsSuspect(from, st.settings.smsTrusted)) ? 'sispek' : 'nouvo';
  const rec = { id, from: str(from, 60), text: str(text, 1000), provider: p.provider, amount: p.amount, payer: p.payer, txn: p.txn, status, at: new Date().toISOString(), req: '' };
  st.sms.unshift(rec); st.sms = st.sms.slice(0, 300);
  if (status !== 'nouvo' || (!trusted && !st.settings.smsOn)) return { status, sms: rec };
  const m = matchSms(st.requests, p);
  if (!m) return { status, sms: rec, matched: false };
  const res = approve(st, m.r, m.rule);
  if (res.err) { rec.note = res.err; return { status, sms: rec, matched: false, err: res.err }; }
  rec.status = 'itilize'; rec.req = m.r.id;
  return { status: 'itilize', sms: rec, matched: true, out: approvedOut(st, m.r, res) };
}

// ---------- done pou piblik la ----------
function publicLot(l) {
  const tot = l.shares.length, free = freeShares(l).length;
  return {
    id: l.id, name: l.name, detail: l.detail, loc: l.loc, price: l.price, profit: l.profit, status: l.status, statusText: STAT[l.status] || '', note: l.note,
    total: tot, free, taken: tot - free, sold: l.shares.filter((s) => s.vann).length, inStore: l.shares.filter((s) => s.dispo && !s.vann).length,
  };
}
function siteData(st) {
  const s = st.settings;
  return {
    lots: st.lots.map(publicLot),
    pays: s.pays.filter((m) => m.active).map(({ id, label, number, name }) => ({ id, label, number, name })),
    wa: s.wa, waitDays: s.waitDays, maxInv: s.maxInv, slotsLeft: Math.max(0, s.maxInv - activeCount(st)),
    sold: st.lots.reduce((a, l) => a + l.shares.filter((x) => x.vann).length, 0),
  };
}
function meData(st, inv) {
  const sh = invShares(st, inv.id);
  const hist = [];
  sh.forEach(({ l, s }) => {
    if (s.invDate) hist.push({ d: s.invDate, t: 'Achte 1 aksyon · ' + l.name, a: -l.price, k: 'buy' });
    if (s.vann) hist.push({ d: s.vann, t: '1 aksyon vann · ' + l.name, a: l.price + l.profit, k: 'in' });
  });
  st.withdrawals.filter((w) => w.inv === inv.id).forEach((w) => hist.push({ d: w.date, t: 'Retrè sou ' + w.method, a: -w.amount, k: 'out' }));
  hist.sort((a, b) => b.d.localeCompare(a.d));
  return {
    investor: { name: inv.name, code: inv.code, phone: inv.phone || '', email: inv.email || '' },
    money: invMoney(st, inv.id),
    shares: sh.map(({ l, s }) => ({ lot: l.name, n: s.n, price: l.price, profit: l.profit, loc: l.loc, achte: s.achte, dispo: s.dispo, vann: s.vann, status: l.status, statusText: STAT[l.status] || '', note: l.note })),
    history: hist,
    messages: st.messages.filter((m) => !m.inv || m.inv === inv.id).sort((a, b) => b.date.localeCompare(a.date)).map((m) => ({ text: m.text, date: m.date, mine: !!m.inv })),
    wa: st.settings.wa, waitDays: st.settings.waitDays,
  };
}
function adminData(st) {
  const investors = st.investors.map((i) => ({ id: i.id, code: i.code, name: i.name, phone: i.phone || '', email: i.email || '', joined: i.joined, locked: (i.lockedUntil || 0) > Date.now(), shares: invShares(st, i.id).length, money: invMoney(st, i.id) }));
  const active = investors.filter((i) => i.shares > 0).length;
  const tot = investors.reduce((a, i) => ({ invested: a.invested + i.money.invested, owed: a.owed + i.money.balance, ready: a.ready + i.money.ready, paid: a.paid + i.money.paid }), { invested: 0, owed: 0, ready: 0, paid: 0 });
  const { _smsKey, ...settings } = st.settings;
  return {
    settings, smsKey: smsKey(st), totals: tot, active, lots: st.lots, investors, locs: LOCS, stat: STAT,
    requests: st.requests.filter((r) => r.status === 'pending').map(({ pinOnce, ...r }) => r),
    recentApproved: st.requests.filter((r) => r.status === 'approved').slice(-10).reverse().map(({ pinOnce, ...r }) => r),
    withdrawals: st.withdrawals.slice(-50).reverse(), messages: st.messages.slice().sort((a, b) => b.date.localeCompare(a.date)),
    sms: st.sms.slice(0, 50),
  };
}
const activeCount = (st) => st.investors.filter((i) => invShares(st, i.id).length > 0).length;
const hasShares = (st, id) => invShares(st, id).length > 0;
const lotOf = (st, id) => st.lots.find((x) => x.id === id) || fail(404, 'Atik sa a pa egziste.');
const invOf = (st, id) => st.investors.find((x) => x.id === id) || fail(404, 'Envestisè sa a pa egziste.');

// ---------- pòt prensipal la ----------
export async function handle(store, { method, action, query, body, token, ip }) {
  const post = () => { if (method !== 'POST') fail(405, 'Sèvi ak POST.'); };
  const needAdmin = () => { if (!isAdmin(token)) fail(401, 'Konekte kòm admin ankò.'); };

  switch (action) {
    // ===== piblik =====
    case 'site': {
      const { data } = await store.getState();
      return siteData(data);
    }
    case 'request': {
      post();
      const name = str(body.name, 80), tel = str(body.tel, 30), q = int(body.q), tx = str(body.txid, 40), from = phone8(body.from);
      if (!name) fail(400, 'Mete non konplè ou.');
      if (!phone8(tel)) fail(400, 'Mete yon nimewo telefòn ki gen 8 chif.');
      if (q < 1) fail(400, 'Mete omwen 1 aksyon.');
      if (txnKey(tx).length < 4 && !from) fail(400, 'Mete ID tranzaksyon an oswa nimewo telefòn ki fè peman an (8 chif).');
      if (str(body.from) && !from) fail(400, 'Nimewo ki fè peman an dwe gen 8 chif.');
      return mutate(store, (st) => {
        const l = lotOf(st, str(body.lot, 40));
        const fr = freeShares(l).length;
        if (q > fr) fail(400, fr ? `Rete sèlman ${fr} aksyon pou atik sa a.` : 'Atik sa a fin finanse.');
        const pm = st.settings.pays.find((m) => m.id === str(body.pay, 40) && m.active) || fail(400, 'Chwazi kijan w ap peye.');
        const known = (invFromToken(token) && st.investors.find((i) => i.id === invFromToken(token))) || st.investors.find((i) => i.phone && phone8(i.phone) === phone8(tel));
        if (!(known && hasShares(st, known.id)) && activeCount(st) >= st.settings.maxInv) fail(400, 'Tout plas envestisè yo pran pou kounye a. Kontakte Keyn Event sou WhatsApp.');
        if (txnKey(tx) && st.requests.some((r) => r.txid && txnKey(r.txid) === txnKey(tx))) fail(400, 'ID tranzaksyon sa a deja itilize.');
        const recent = st.requests.filter((r) => r.status === 'pending' && phone8(r.tel) === phone8(tel)).length;
        if (recent >= 5) fail(429, 'Ou gen twòp demann k ap tann deja. Kontakte Keyn Event.');
        const acct = invFromToken(token); const acctInv = acct && st.investors.find((i) => i.id === acct);
        const r = { id: rid(), ck: rid(), acct: acctInv ? acctInv.id : '', name, tel, lot: l.id, lotName: l.name, q, pay: pm.id, method: `${pm.label} ${pm.number}`, provider: provOf(pm.label), txid: tx, from, amount: q * l.price, date: today(), at: new Date().toISOString(), status: 'pending' };
        st.requests.push(r); st.requests = st.requests.slice(-500);
        let out = { id: r.id, ck: r.ck, status: 'pending' };
        const m = st.settings.smsOn ? matchRequestToSms(st.sms, r) : null;
        if (m) {
          const res = approve(st, r, m.rule);
          if (!res.err) { m.m.status = 'itilize'; m.m.req = r.id; r.pinOnce = ''; out = { id: r.id, ck: r.ck, status: 'approved', code: res.inv.code, pin: res.pin, q: r.q, lot: l.name }; }
        }
        return out;
      });
    }
    case 'req-status': {
      const id = str(query.id, 20), ck = str(query.ck, 20);
      const { data } = await store.getState();
      const r = data.requests.find((x) => x.id === id && x.ck === ck);
      if (!r) fail(404, 'Nou pa jwenn demann sa a.');
      if (r.status !== 'approved') return { status: r.status };
      if (!r.pinOnce) return { status: 'approved', code: r.code, q: r.q, lot: r.lotName };
      return mutate(store, (st) => {
        const x = st.requests.find((y) => y.id === id);
        const pin = x.pinOnce; x.pinOnce = '';
        return { status: 'approved', code: x.code, pin, q: x.q, lot: x.lotName };
      });
    }
    case 'inv-login': {
      post();
      const raw = str(body.ident, 190), pin = String(body.pin ?? '').slice(0, 64);
      if (!raw || !pin) fail(400, 'Mete telefòn ou, imèl ou oswa ID ou, ak modpas ou.');
      const code = raw.toUpperCase().replace(/\s/g, ''), codeN = code.replace(/^LP-?/, ''), t = phone8(raw), em = raw.includes('@') ? normMail(raw) : '';
      return mutate(store, (st) => {
        const inv = st.investors.find((i) => (em ? i.email === em : (i.code === code || (/^\d{1,3}$/.test(codeN) && i.code === 'LP-' + codeN.padStart(3, '0')) || (t && i.phone && phone8(i.phone) === t))));
        if (!inv) fail(401, 'Telefòn/imèl/ID a oswa modpas la pa bon.');
        if ((inv.lockedUntil || 0) > Date.now()) fail(429, 'Twòp move modpas. Kont lan bloke pou 15 minit. Si w bliye modpas ou, ekri Keyn Event sou WhatsApp.');
        if (!safeEq(hashPin(pin, inv.salt), inv.pinHash)) {
          inv.fails = (inv.fails || 0) + 1;
          if (inv.fails >= 5) { inv.lockedUntil = Date.now() + 15 * 60e3; inv.fails = 0; }
          return { err: inv.lockedUntil > Date.now() ? 'Twòp move modpas. Kont lan bloke pou 15 minit.' : `Telefòn/imèl/ID a oswa modpas la pa bon. (${5 - inv.fails} chans ki rete)` };
        }
        inv.fails = 0; inv.lockedUntil = 0;
        return { token: invToken(inv.id) };
      }).then((r) => (r.err ? fail(401, r.err) : r));
    }
    case 'register': {
      post();
      const name = str(body.name, 80), tel = str(body.phone, 30), pin = String(body.pin ?? body.password ?? ''), email = normMail(body.email);
      if (name.length < 3) fail(400, 'Mete non konplè ou.');
      if (!tel && !email) fail(400, 'Mete imèl ou oswa nimewo telefòn ou (oswa toude).');
      if (tel && !phone8(tel)) fail(400, 'Nimewo telefòn lan dwe gen 8 chif.');
      if (email && !mailOk(email)) fail(400, 'Imèl la pa bon.');
      const pe = passErr(pin); if (pe) fail(400, pe);
      return mutate(store, (st) => {
        if (tel && st.investors.some((i) => i.phone && phone8(i.phone) === phone8(tel))) fail(400, 'Gen yon kont ak nimewo sa a deja. Konekte pito.');
        if (email && st.investors.some((i) => i.email === email)) fail(400, 'Gen yon kont ak imèl sa a deja. Konekte pito.');
        if (st.investors.length >= 300) fail(400, 'Pa ka kreye nouvo kont kounye a. Kontakte Keyn Event.');
        const inv = { id: rid(), code: nextCode(st), name, phone: tel ? phone8(tel) : '', email, joined: today(), self: true };
        setPin(inv, pin); st.investors.push(inv);
        return { token: invToken(inv.id), code: inv.code };
      });
    }
    case 'inv-pass': {
      post();
      const id = invFromToken(token);
      if (!id) fail(401, 'Konekte ankò.');
      const oldP = String(body.old ?? '').slice(0, 64), newP = String(body.pass ?? '');
      const pe = passErr(newP); if (pe) fail(400, pe);
      const r = await mutate(store, (st) => {
        const inv = st.investors.find((i) => i.id === id) || fail(401, 'Konekte ankò.');
        if (!safeEq(hashPin(oldP, inv.salt), inv.pinHash)) return { err: 'Ansyen modpas la pa bon.' };
        setPin(inv, newP); return { ok: true };
      });
      if (r.err) fail(400, r.err);
      return r;
    }
    case 'me': {
      const id = invFromToken(token);
      if (!id) fail(401, 'Konekte ankò.');
      const { data } = await store.getState();
      const inv = data.investors.find((i) => i.id === id);
      if (!inv) fail(401, 'Konekte ankò.');
      return meData(data, inv);
    }
    case 'sms-in': {
      const got = str(query.k || body.k || body.key || token, 80);
      const from = str(body.from ?? body.sender ?? body.phone ?? body.number ?? query.from, 60);
      const text = str(body.text ?? body.body ?? body.message ?? body.msg ?? body.sms ?? query.text, 1000);
      if (!text) fail(400, 'Pa gen tèks SMS.');
      return mutate(store, (st) => {
        const k = smsKey(st);
        if (!safeEq(got, k)) fail(403, 'Kle a pa bon.');
        const r = handleSms(st, from, text, false, str(body.messageId ?? body.id, 120));
        return { received: true, status: r.status || 'duplicate', matched: !!r.matched };
      });
    }

    // ===== admin =====
    case 'login': {
      post();
      const pw = process.env.ADMIN_PASSWORD;
      if (!pw) fail(500, 'ADMIN_PASSWORD pa konfigire sou Vercel.');
      const key = 'ip:' + (ip || '?');
      const ok = crypto.timingSafeEqual(crypto.createHash('sha256').update(str(body.password, 200)).digest(), crypto.createHash('sha256').update(String(pw).trim()).digest());
      const r = await mutate(store, (st) => {
        const g = st.guard[key] || { n: 0, until: 0 };
        if (g.until > Date.now()) return { err: 'Twòp move modpas. Tann 15 minit.' };
        if (!ok) { g.n++; if (g.n >= 6) { g.until = Date.now() + 15 * 60e3; g.n = 0; } st.guard[key] = g; return { err: 'Modpas la pa bon.' }; }
        delete st.guard[key];
        return { token: adminToken() };
      });
      if (r.err) { await new Promise((z) => setTimeout(z, 600)); fail(401, r.err); }
      return r;
    }
    case 'admin-data': {
      needAdmin();
      return mutate(store, (st) => adminData(st));
    }
    case 'req-approve': {
      post(); needAdmin();
      return mutate(store, (st) => {
        const r = st.requests.find((x) => x.id === str(body.id, 20) && x.status === 'pending') || fail(404, 'Demann sa a pa la ankò.');
        const res = approve(st, r, 'admin');
        if (res.err) fail(400, res.err);
        r.pinOnce = '';
        return approvedOut(st, r, res);
      });
    }
    case 'req-reject': {
      post(); needAdmin();
      return mutate(store, (st) => {
        const r = st.requests.find((x) => x.id === str(body.id, 20) && x.status === 'pending') || fail(404, 'Demann sa a pa la ankò.');
        r.status = 'rejected'; return { ok: true };
      });
    }
    case 'sms-paste': {
      post(); needAdmin();
      const text = str(body.text, 1000);
      if (!text) fail(400, 'Kole SMS la anvan.');
      return mutate(store, (st) => {
        const r = handleSms(st, 'admin', text, true, '');
        if (r.duplicate) fail(400, 'SMS sa a te deja antre.');
        if (r.status === 'inyore') fail(400, 'Sa pa sanble yon SMS lajan ki rantre (pa gen montan, oswa se lajan ou voye).');
        if (r.err) fail(400, r.err);
        if (!r.matched) { const s = r.sms; fail(400, `Pa gen okenn demann ki koresponn ak SMS sa a (${fm(s.amount)}${s.payer ? ', soti nan ' + s.payer : ''}${s.txn ? ', ID ' + s.txn : ''}). SMS la sere: si demann lan rive pita, l ap aktive otomatikman.`); }
        r.out.pin && (st.requests.find((x) => x.id === r.sms.req).pinOnce = '');
        return r.out;
      });
    }
    case 'lot-add': {
      post(); needAdmin();
      const name = str(body.name, 80), q = int(body.qty), price = int(body.price), profit = int(body.profit, -1), loc = str(body.loc, 60);
      if (!name) fail(400, 'Mete non atik la.');
      if (q < 1 || q > 500) fail(400, 'Mete kantite aksyon an (1 a 500).');
      if (price < 1) fail(400, 'Mete pri yon aksyon.');
      if (profit < 0) fail(400, 'Mete benefis envestisè a pou chak aksyon.');
      if (loc && !LOCS.includes(loc)) fail(400, 'Magazen sa a pa egziste.');
      return mutate(store, (st) => {
        const shares = []; for (let i = 1; i <= q; i++) shares.push(blankShare(i));
        st.seq.lot = (st.seq.lot || 0) + 1;
        const l = { id: 'l' + st.seq.lot + rid().slice(0, 4), name, detail: str(body.detail, 120), loc, price, profit, status: 'ok', note: '', shares };
        st.lots.push(l); return { id: l.id };
      });
    }
    case 'lot-update': {
      post(); needAdmin();
      return mutate(store, (st) => {
        const l = lotOf(st, str(body.id, 40));
        if (body.loc !== undefined) { const v = str(body.loc, 60); if (v && !LOCS.includes(v)) fail(400, 'Magazen sa a pa egziste.'); l.loc = v; }
        if (body.status !== undefined) { const v = str(body.status, 10); if (!STAT[v]) fail(400, 'Eta sa a pa egziste.'); l.status = v; }
        if (body.note !== undefined) l.note = str(body.note, 300);
        if (body.name !== undefined) { const v = str(body.name, 80); if (!v) fail(400, 'Non atik la pa ka vid.'); l.name = v; }
        if (body.detail !== undefined) l.detail = str(body.detail, 120);
        return { ok: true };
      });
    }
    case 'lot-del': {
      post(); needAdmin();
      return mutate(store, (st) => {
        const l = lotOf(st, str(body.id, 40));
        if (l.shares.some((s) => s.inv)) fail(400, 'Gen envestisè nan atik sa a deja. Ou pa ka efase l.');
        st.lots = st.lots.filter((x) => x !== l); return { ok: true };
      });
    }
    case 'share-add': {
      post(); needAdmin();
      return mutate(store, (st) => { const l = lotOf(st, str(body.id, 40)); l.shares.push(blankShare(l.shares.length + 1)); return { ok: true }; });
    }
    case 'share-set': {
      post(); needAdmin();
      return mutate(store, (st) => {
        const l = lotOf(st, str(body.lot, 40));
        const s = l.shares[int(body.i, -1)] || fail(404, 'Aksyon sa a pa egziste.');
        const f = str(body.f, 10), v = str(body.v, 40);
        if (f === 'inv') {
          if (s.vann && !v) fail(400, 'Aksyon sa a deja vann. Retire dat "Vann" lan anvan.');
          if (v) invOf(st, v);
          s.inv = v || null; s.invDate = v ? (s.invDate || today()) : '';
        } else if (['invDate', 'achte', 'dispo', 'vann'].includes(f)) {
          if (!isDate(v)) fail(400, 'Dat la pa bon.');
          if (f === 'vann' && v && !s.inv) fail(400, 'Chwazi envestisè a anvan ou make aksyon an vann.');
          const prev = s[f]; s[f] = v;
          if (f === 'vann' && !v && prev && invMoney(st, s.inv).balance < 0) { s[f] = prev; fail(400, 'Envestisè a deja retire kòb lavant sa a. Ou pa ka retire dat la.'); }
        } else fail(400, 'Chan sa a pa egziste.');
        return { ok: true };
      });
    }
    case 'inv-add': {
      post(); needAdmin();
      const name = str(body.name, 80), tel = str(body.phone, 30);
      if (!name) fail(400, 'Mete non envestisè a.');
      if (!phone8(tel)) fail(400, 'Mete yon nimewo telefòn ki gen 8 chif.');
      return mutate(store, (st) => {
        if (st.investors.some((i) => phone8(i.phone) === phone8(tel))) fail(400, 'Gen yon envestisè ki gen nimewo sa a deja.');
        const inv = { id: rid(), code: nextCode(st), name, phone: tel, joined: today() };
        const pin = newPin(); setPin(inv, pin); st.investors.push(inv);
        return { code: inv.code, pin, name, phone: tel };
      });
    }
    case 'inv-pin': {
      post(); needAdmin();
      return mutate(store, (st) => { const inv = invOf(st, str(body.id, 20)); const pin = newPin(); setPin(inv, pin); return { code: inv.code, pin, name: inv.name, phone: inv.phone }; });
    }
    case 'withdraw': {
      post(); needAdmin();
      const amount = int(body.amount);
      if (amount < 1) fail(400, 'Mete yon kantite.');
      return mutate(store, (st) => {
        const inv = invOf(st, str(body.inv, 20));
        const m = invMoney(st, inv.id);
        if (amount > m.ready) fail(400, `Pare pou peye se sèlman ${fm(m.ready)}.`);
        st.withdrawals.push({ id: rid(), inv: inv.id, amount, method: str(body.method, 30) || 'MonCash', date: today() });
        return { ok: true };
      });
    }
    case 'msg-add': {
      post(); needAdmin();
      const text = str(body.text, 500);
      if (!text) fail(400, 'Ekri mesaj la anvan.');
      return mutate(store, (st) => { const to = str(body.to, 20); if (to) invOf(st, to); st.messages.push({ id: rid(), inv: to || null, text, date: today() }); return { ok: true }; });
    }
    case 'msg-del': {
      post(); needAdmin();
      return mutate(store, (st) => { st.messages = st.messages.filter((m) => m.id !== str(body.id, 20)); return { ok: true }; });
    }
    case 'settings': {
      post(); needAdmin();
      const mx = int(body.maxInv), wt = int(body.waitDays, -1);
      if (mx < 1) fail(400, 'Kantite envestisè a dwe omwen 1.');
      if (wt < 0 || wt > 120) fail(400, 'Mete kantite jou pou tann lan (0 a 120).');
      const pays = Array.isArray(body.pays) ? body.pays.slice(0, 8).map((m) => ({ id: str(m.id, 20) || rid(), label: str(m.label, 30), number: str(m.number, 20), name: str(m.name, 60), active: !!m.active })) : null;
      if (!pays || !pays.length) fail(400, 'Kite omwen yon mwayen peman.');
      if (pays.some((m) => !m.label || !phone8(m.number) || !m.name)) fail(400, 'Chak mwayen peman bezwen yon non, yon nimewo 8 chif ak non moun nan.');
      if (!pays.some((m) => m.active)) fail(400, 'Kite omwen yon mwayen peman aktif.');
      return mutate(store, (st) => {
        Object.assign(st.settings, { maxInv: mx, waitDays: wt, wa: str(body.wa, 20) || st.settings.wa, pays, smsOn: !!body.smsOn, smsTrusted: str(body.smsTrusted, 200) });
        return { ok: true };
      });
    }
    case 'sms-key-new': {
      post(); needAdmin();
      return mutate(store, (st) => { st.settings._smsKey = crypto.randomBytes(18).toString('hex'); return { key: st.settings._smsKey }; });
    }
    case 'export': {
      needAdmin();
      const { data } = await store.getState();
      const { _smsKey, ...settings } = data.settings;
      return { ...data, settings, investors: data.investors.map(({ salt, pinHash, ...i }) => i), guard: undefined, exportedAt: new Date().toISOString() };
    }
    default:
      fail(404, 'Aksyon sa a pa egziste.');
  }
}
