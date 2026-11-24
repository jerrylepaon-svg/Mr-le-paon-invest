// Lojik Mr Le Paon Invest (pa gen aksè baz done isit la).

export const LOCS = ['Santral (Limonade)', 'Bwavena (Pòtoprens)'];
export const STAT = { ok: 'Tout bagay nòmal', delay: 'Machandiz la an reta', out: 'Machandiz la pa disponib nan magazen an kounye a' };

export const fm = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' G';
export const today = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // lè Ayiti
export const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const phone8 = (v) => { const d = String(v || '').replace(/\D/g, ''); const x = d.length === 11 && d.startsWith('509') ? d.slice(3) : d; return /^\d{8}$/.test(x) ? x : ''; };
export const txnKey = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30);
export const provOf = (l) => (/natcash|natcom/i.test(l || '') ? 'natcash' : /moncash|digicel/i.test(l || '') ? 'moncash' : '');
export const isDate = (s) => s === '' || /^\d{4}-\d{2}-\d{2}$/.test(String(s));

export function defaultState() {
  const shares = [];
  for (let i = 1; i <= 10; i++) shares.push(blankShare(i));
  return {
    settings: {
      maxInv: 10, waitDays: 8, wa: '46162735', smsOn: true, smsTrusted: 'MonCash,NatCash,Digicel,Natcom',
      pays: [
        { id: 'mc1', label: 'MonCash', number: '46162735', name: 'Pierre Woodson Jerry', active: true },
        { id: 'nc1', label: 'NatCash', number: '42065212', name: 'Normil Kenia', active: true },
      ],
    },
    lots: [{ id: 'l1', name: 'Woulo twal spandex blan', detail: 'Koulè blan sèlman', loc: '', price: 27500, profit: 7500, status: 'ok', note: '', shares }],
    investors: [], requests: [], withdrawals: [], messages: [], sms: [], guard: {}, seq: { lot: 1, inv: 0 },
  };
}
export const blankShare = (n) => ({ n, inv: null, invDate: '', achte: '', dispo: '', vann: '' });
export const freeShares = (l) => l.shares.filter((s) => !s.inv);

export function nextCode(st) {
  let n = (st.seq.inv || 0) + 1, c;
  do { c = 'LP-' + String(n).padStart(3, '0'); n++; } while (st.investors.some((i) => i.code === c));
  st.seq.inv = n - 1;
  return c;
}

export function invShares(st, invId) {
  const out = [];
  st.lots.forEach((l) => l.shares.forEach((s) => { if (s.inv === invId) out.push({ l, s }); }));
  return out;
}

export function invMoney(st, invId, t = today()) {
  const w = st.settings.waitDays;
  let credited = 0, ready = 0, pending = 0, stock = 0, benefit = 0, invested = 0;
  const next = [];
  invShares(st, invId).forEach(({ l, s }) => {
    invested += l.price;
    if (s.vann) {
      const amt = l.price + l.profit; credited += amt; benefit += l.profit;
      const r = addDays(s.vann, w);
      if (r <= t) ready += amt; else { pending += amt; next.push(r); }
    } else stock += l.price;
  });
  const paid = st.withdrawals.filter((x) => x.inv === invId).reduce((a, x) => a + x.amount, 0);
  // Bous: lajan moun nan mete sou kont li (disponib touswit), mwens sa l depanse pou achte aksyon.
  const walletIn = (st.deposits || []).filter((d) => d.inv === invId && d.status === 'valide').reduce((a, d) => a + d.amount, 0);
  const walletOut = (st.spends || []).filter((x) => x.inv === invId).reduce((a, x) => a + x.amount, 0);
  const walletPending = (st.deposits || []).filter((d) => d.inv === invId && d.status === 'pending').reduce((a, d) => a + d.amount, 0);
  next.sort();
  return { credited, ready: Math.max(0, ready + walletIn - walletOut - paid), pending, stock, benefit, invested, paid, walletIn, walletOut, walletPending,
    balance: credited + walletIn - walletOut - paid, next: next[0] || '' };
}

// ---------- SMS MonCash / NatCash ----------
function toAmount(v) {
  let t = String(v || '').replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '');
  else if (/,\d{2}$/.test(t)) t = t.replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
// MonCash: "You have received G1,050.00 with MonCash from 509XXXXXXXX . Txn ID: ..."
// NatCash: "Ou resevwa 760 HTG nan NON 4XXXXXXX nan 09:10 ..., Balans ou: ... Transcode: ..."
export function parseSms(from, text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const outgoing = /(you have sent|you sent|vous avez envoy|ou voye|ou transf[eè]|ou peye|payment to|paiement [àa])/i.test(t);
  const agent = /(d[ée]p[oô]t|deposit|\bdepo\b|cash[\s-]?in|\bagent\b|\bajan\b|ou te ajoute|vous avez ajout[ée]|you (have )?added)/i.test(t);
  const incoming = !outgoing && (agent || /(you have received|you received|received|ou resevwa|vous avez re[çc]u|re[çc]u)/i.test(t));
  const head = t.split(/\b(?:balans|balance|solde|nouvo balans)\b/i)[0];
  const am = head.match(/\b(?:G|HTG|Gdes?)\s?(\d[\d,. ]*\d|\d)/i) || head.match(/(\d[\d,. ]*\d|\d)\s?(?:HTG|Gdes?|gourdes?|G)\b/i);
  const amount = am ? toAmount(am[1]) : null;
  const txm = t.match(/(?:txn\s*id|transcode|trans(?:action)?\s*(?:id|code)?|r[ée]f(?:[ée]rence)?|\bid)\s*[:#.]?\s*([A-Z0-9]{5,30})/i);
  const txn = txm ? txnKey(txm[1]) : '';
  let payer = '';
  const pm = t.match(/(?:from|de|nan|soti nan)\s+(?:[A-ZÀ-Ý][A-ZÀ-Ý.'\- ]{1,60}?\s+)?\+?((?:509)?\d{8})\b/i);
  if (pm) payer = phone8(pm[1]);
  if (!payer) { const any = t.replace(txm ? txm[0] : '', '').match(/(?:^|[^\d])\+?((?:509)?\d{8})(?!\d)/); if (any) payer = phone8(any[1]); }
  if (agent) payer = '';
  const provider = /natcash|natcom|transcode/i.test(t) ? 'natcash' : /moncash|digicel|txn id/i.test(t) ? 'moncash' : provOf(from);
  return { provider, incoming, amount, payer, txn, agent };
}
// Yon SMS ki soti nan yon nimewo telefòn nòmal (pa MonCash/NatCash) ka yon fo SMS.
export function smsSuspect(from, trusted = '') {
  const f = String(from || '').trim();
  const ok = String(trusted || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (ok.includes(f.toLowerCase())) return false;
  return /^\+?\d{8,15}$/.test(f.replace(/[\s-]/g, ''));
}
// Jwenn demann ki koresponn ak yon SMS: ID tranzaksyon an, oswa nimewo ki peye a + montan egzak la. Dwe inik.
export function matchSms(requests, sms) {
  if (!sms || !sms.amount || !sms.incoming) return null;
  const open = requests.filter((r) => r.status === 'pending' && (!sms.provider || !r.provider || r.provider === sms.provider));
  if (sms.txn) { const l = open.filter((r) => r.txid && txnKey(r.txid) === sms.txn); if (l.length === 1 && l[0].amount <= sms.amount) return { r: l[0], rule: 'ID tranzaksyon' }; }
  if (sms.payer) { const l = open.filter((r) => (r.from || phone8(r.tel)) === sms.payer && r.amount === sms.amount); if (l.length === 1) return { r: l[0], rule: 'nimewo + montan' }; }
  return null;
}
// Pou yon nouvo demann: chèche yon SMS ki te deja rive (moun nan peye anvan l ranpli fòm lan).
export function matchRequestToSms(smsList, r, now = Date.now()) {
  const open = smsList.filter((m) => m.status === 'nouvo' && now - Date.parse(m.at) < 3 * 864e5 && (!m.provider || !r.provider || m.provider === r.provider));
  if (r.txid) { const l = open.filter((m) => m.txn && m.txn === txnKey(r.txid) && m.amount >= r.amount); if (l.length === 1) return { m: l[0], rule: 'ID tranzaksyon' }; }
  const from = r.from || phone8(r.tel);
  if (from) { const l = open.filter((m) => m.payer === from && m.amount === r.amount); if (l.length === 1) return { m: l[0], rule: 'nimewo + montan' }; }
  return null;
}
